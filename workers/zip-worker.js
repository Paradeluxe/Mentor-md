// Mentor zip worker — classic Worker + local JSZip (no CDN)
// v1.43.18: importScripts('./jszip.min.js') 离线可用
/* global JSZip, self */
importScripts('./jszip.min.js');

self.onmessage = async (e) => {
  const { cmd, id } = e.data || {};
  try {
    if (cmd === 'build') {
      const { mdText, sidecar, mediaFiles } = e.data;
      const zip = new JSZip();
      zip.file('content.md', mdText);
      zip.file('annotations.json', JSON.stringify(sidecar, null, 2));
      if (mediaFiles) {
        for (const { path, bytes } of mediaFiles) {
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
      self.postMessage({ id, ok: true, result: { type: 'blob', bytes: buf, size: buf.byteLength } }, [buf]);
    } else if (cmd === 'load') {
      const { bytes } = e.data;
      const zip = await JSZip.loadAsync(bytes);
      const mdEntry = zip.file('content.md');
      if (!mdEntry) throw new Error('.mentor 包缺少 content.md');
      const annEntry = zip.file('annotations.json');
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
        ...mediaNames.map(name => zip.file(name).async('uint8array').then(u8 => ({ name, bytes: u8 }))),
      ]);
      const [mdText, annText, ...mediaResults] = allExtracts;
      let annotations = null;
      if (annText !== null) {
        try { annotations = JSON.parse(annText); } catch (err) { annotations = null; }
      }
      const mediaFiles = {};
      const transferList = [];
      for (const m of mediaResults) {
        const ab = m.bytes.buffer.slice(m.bytes.byteOffset, m.bytes.byteOffset + m.bytes.byteLength);
        mediaFiles[m.name] = ab;
        transferList.push(ab);
      }
      self.postMessage({ id, ok: true, result: { mdText, annotations, mediaFiles } }, transferList);
    } else {
      throw new Error('未知 cmd: ' + cmd);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};

self.postMessage({ id: 'init', ok: true, result: 'ready' });
