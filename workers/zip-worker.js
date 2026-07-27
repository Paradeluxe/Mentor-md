// Mentor zip worker — classic Worker + local JSZip (no CDN)
// v1.43.18: importScripts('./jszip.min.js') 离线可用
// v1.45.0: optional document.html + manifest.json structural snapshot
/* global JSZip, self */
importScripts('./jszip.min.js');

const MAX_ENTRIES = 500;
const MAX_ENTRY = 40 * 1024 * 1024;
const MAX_TOTAL = 200 * 1024 * 1024;

function assertZipBudget(zip) {
  const names = Object.keys(zip.files || {});
  if (names.length > MAX_ENTRIES) throw new Error('.mentor 条目过多');
  let total = 0;
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const size = Number(entry._data && entry._data.uncompressedSize != null
      ? entry._data.uncompressedSize
      : entry.uncompressedSize || 0);
    if (size > MAX_ENTRY) throw new Error('.mentor 单文件过大: ' + name);
    total += size;
    if (total > MAX_TOTAL) throw new Error('.mentor 解压后过大');
  }
}

self.onmessage = async (e) => {
  const { cmd, id } = e.data || {};
  try {
    if (cmd === 'build') {
      const {
        mdText,
        sidecar,
        sidecarText,
        documentHtml,
        manifestText,
        mediaFiles,
        referencesJson,
        referencesBib,
      } = e.data;
      const zip = new JSZip();
      zip.file('content.md', mdText);
      // Prefer caller-provided raw annotationsText so main/worker hashes match.
      zip.file(
        'annotations.json',
        typeof sidecarText === 'string' ? sidecarText : JSON.stringify(sidecar, null, 2),
      );
      if (typeof documentHtml === 'string' && typeof manifestText === 'string') {
        zip.file('document.html', documentHtml);
        zip.file('manifest.json', manifestText);
      }
      // Optional citation library: written only when the caller actually
      // supplied them so legacy archives stay byte-identical when no
      // references exist. referencesJson is normalised to a JSON string so
      // empty objects round-trip cleanly.
      if (referencesJson !== undefined && referencesJson !== null) {
        const jsonPayload = typeof referencesJson === 'string'
          ? referencesJson
          : JSON.stringify(referencesJson, null, 2);
        zip.file('references.json', jsonPayload);
      }
      if (typeof referencesBib === 'string' && referencesBib.length > 0) {
        zip.file('references.bib', referencesBib);
      }
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
      if (bytes && bytes.byteLength > 80 * 1024 * 1024) throw new Error('.mentor 过大');
      const zip = await JSZip.loadAsync(bytes);
      assertZipBudget(zip);
      const mdEntry = zip.file('content.md');
      if (!mdEntry) throw new Error('.mentor 包缺少 content.md');
      const annEntry = zip.file('annotations.json');
      const htmlEntry = zip.file('document.html');
      const manifestEntry = zip.file('manifest.json');
      const refsJsonEntry = zip.file('references.json');
      const refsBibEntry = zip.file('references.bib');
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
        htmlEntry ? htmlEntry.async('string') : Promise.resolve(null),
        manifestEntry ? manifestEntry.async('string') : Promise.resolve(null),
        refsJsonEntry ? refsJsonEntry.async('string') : Promise.resolve(null),
        refsBibEntry ? refsBibEntry.async('string') : Promise.resolve(''),
        ...mediaNames.map(name => zip.file(name).async('uint8array').then(u8 => ({ name, bytes: u8 }))),
      ]);
      const [mdText, annText, documentHtml, manifestText, refsJsonText, refsBibText, ...mediaResults] = allExtracts;
      let annotations = null;
      if (annText !== null) {
        try { annotations = JSON.parse(annText); } catch (err) { annotations = null; }
      }
      // Optional citation library: missing files must NOT touch the rest of
      // the result. Malformed references.json is coerced to null (same
      // tolerance we already apply to annotations.json) so a corrupt
      // citation file cannot brick an otherwise-healthy archive.
      let parsedRefsJson = null;
      if (refsJsonText !== null) {
        try { parsedRefsJson = JSON.parse(refsJsonText); }
        catch (err) { parsedRefsJson = null; }
      }
      const referencesBib = refsBibEntry ? refsBibText : '';
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
        result: {
          mdText,
          annotations,
          annotationsText: annText,
          documentHtml: typeof documentHtml === 'string' ? documentHtml : null,
          manifestText: typeof manifestText === 'string' ? manifestText : null,
          mediaFiles,
          referencesJson: parsedRefsJson,
          referencesBib,
        },
      }, transferList);
    } else {
      throw new Error('未知 cmd: ' + cmd);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
};

self.postMessage({ id: 'init', ok: true, result: 'ready' });
