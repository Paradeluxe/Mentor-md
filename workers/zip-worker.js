// Mentor zip worker — runs JSZip in background thread
// v1.43.15: offload main thread for large files
//
// 消息格式:
//   { cmd: 'build', mdText, sidecar, mediaFiles: [{path, bytes}] }
//   { cmd: 'load', bytes: ArrayBuffer }
//   返回: { ok: true, result } 或 { ok: false, error }

import JSZip from 'https://esm.sh/jszip@3.10.1';

self.onmessage = async (e) => {
  const { cmd, id } = e.data;
  try {
    if (cmd === 'build') {
      const { mdText, sidecar, mediaFiles } = e.data;
      const zip = new JSZip();
      zip.file('content.md', mdText);
      zip.file('annotations.json', JSON.stringify(sidecar, null, 2));
      if (mediaFiles) {
        for (const { path, bytes } of mediaFiles) {
          // 安全检查: 只允许 media/ 开头 + 无 ../ / /
          if (!path.startsWith('media/') || path.includes('..') || path.startsWith('/')) {
            console.warn('[zip-worker] 跳过非法 path:', path);
            continue;
          }
          zip.file(path, bytes);
        }
      }
      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const buf = await blob.arrayBuffer();
      // transfer ArrayBuffer to avoid copy
      self.postMessage({ id, ok: true, result: { type: 'blob', bytes: buf, size: buf.byteLength } }, [buf]);
    } else if (cmd === 'load') {
      const { bytes } = e.data;
      const zip = await JSZip.loadAsync(bytes);
      const mdEntry = zip.file('content.md');
      if (!mdEntry) {
        throw new Error('.mentor 包缺少 content.md');
      }
      const annEntry = zip.file('annotations.json');
      // 并行提取 md + ann + media
      const entries = Object.keys(zip.files);
      const mediaNames = [];
      for (const name of entries) {
        if (!name.startsWith('media/')) continue;
        if (name.includes('..') || name.startsWith('/')) continue;
        const entry = zip.files[name];
        if (!entry || entry.dir) continue;
        mediaNames.push(name);
      }
      const allExtracts = await Promise.all([
        mdEntry.async('string'),
        annEntry ? annEntry.async('string') : Promise.resolve(null),
        ...mediaNames.map(name => zip.file(name).async('uint8array').then(bytes => ({ name, bytes }))),
      ]);
      const [mdText, annText, ...mediaResults] = allExtracts;
      let annotations = null;
      if (annText !== null) {
        try { annotations = JSON.parse(annText); } catch (e) { annotations = null; }
      }
      // media: bytes -> ArrayBuffer (transferable)
      const mediaFiles = {};
      const transferList = [];
      for (const m of mediaResults) {
        const ab = m.bytes.buffer.slice(m.bytes.byteOffset, m.bytes.byteOffset + m.bytes.byteLength);
        mediaFiles[m.name] = ab;
        transferList.push(ab);
      }
      self.postMessage({
        id,
        ok: true,
        result: { mdText, annotations, mediaFiles },
      }, transferList);
    } else {
      throw new Error('未知 cmd: ' + cmd);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};

// v1.43.15: 启动日志
self.postMessage({ id: 'init', ok: true, result: 'ready' });