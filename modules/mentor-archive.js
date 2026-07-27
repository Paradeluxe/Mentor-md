// Structural .mentor archive helpers: document.html + manifest.json
// Verified HTML is the primary annotation-position restore path.

export const STRUCTURAL_HTML_NAME = 'document.html';
export const ARCHIVE_MANIFEST_NAME = 'manifest.json';
export const STRUCTURAL_ARCHIVE_SCHEMA = 1;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('Web Crypto SHA-256 unavailable');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function createArchiveManifest({
  mdText,
  annotationsText,
  documentHtml,
  createdAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: STRUCTURAL_ARCHIVE_SCHEMA,
    body: STRUCTURAL_HTML_NAME,
    createdAt,
    hashes: {
      'content.md': await sha256Hex(mdText),
      'annotations.json': await sha256Hex(annotationsText),
      'document.html': await sha256Hex(documentHtml),
    },
  };
}

export async function verifyStructuralArchive({
  mdText,
  annotationsText,
  documentHtml,
  manifest,
}) {
  if (!manifest) return { usable: false, reason: 'manifest-missing' };
  if (manifest.schemaVersion !== STRUCTURAL_ARCHIVE_SCHEMA) {
    return { usable: false, reason: 'manifest-version' };
  }
  if (typeof documentHtml !== 'string') {
    return { usable: false, reason: 'document-html-missing' };
  }
  const expected = manifest.hashes || {};
  if ((await sha256Hex(mdText)) !== expected['content.md']) {
    return { usable: false, reason: 'content-md-mismatch' };
  }
  if ((await sha256Hex(annotationsText)) !== expected['annotations.json']) {
    return { usable: false, reason: 'annotations-json-mismatch' };
  }
  if ((await sha256Hex(documentHtml)) !== expected['document.html']) {
    return { usable: false, reason: 'document-html-mismatch' };
  }
  return { usable: true, reason: 'verified' };
}
