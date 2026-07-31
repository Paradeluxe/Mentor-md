/**
 * Version-history policy helpers for Mentor.
 *
 * Pure functions only (no DOM / no IndexedDB) so they can be unit-tested in
 * node without a browser. Storage lives in VersionStore (modules/io.js);
 * capture wiring lives in app.js.
 *
 * Capture rule (Word-like):
 *  - manual / autosave disk commits become version rows, deduped by content hash
 *  - draft-only AutoRecover writes never create versions
 *  - named pins always create a row (even if content unchanged)
 */

export const DEFAULT_VERSION_POLICY = Object.freeze({
  maxAutosave: 40, // rolling automatic (autosave + manual unlabeled)
  maxNamed: 50, // hard cap named pins
  maxTotal: 80, // absolute rows per documentId
  maxBytesHint: 200 * 1024 * 1024, // soft budget for prune ordering only
});

/**
 * Deterministic content fingerprint for a save payload.
 * Pure + sync so unit tests can call it without Web Crypto.
 * Collision risk is negligible for dedup purposes (not security).
 * @param {{ body?: string, annotations?: any[], references?: any, mediaManifest?: any }} input
 * @returns {string} hex-ish fingerprint
 */
export function contentFingerprint({ body, annotations, references, mediaManifest } = {}) {
  const payload = JSON.stringify({
    body: typeof body === "string" ? body : "",
    annotations: Array.isArray(annotations) ? annotations : [],
    references: references ?? null,
    mediaManifest: mediaManifest ?? null,
  });
  // FNV-1a 32-bit; expand to two rounds for a 64-bit-ish string.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
}

/**
 * Decide whether a capture should become a version row.
 * @param {{ reason: string, prevHash: string|null, nextHash: string|null }} args
 * @returns {boolean}
 */
export function shouldCaptureVersion({ reason, prevHash, nextHash }) {
  if (reason === "draft" || reason === "draft-only") return false;
  if (reason === "named") return true;
  if (reason !== "manual" && reason !== "autosave") return false;
  if (!nextHash) return false;
  if (prevHash && prevHash === nextHash) return false;
  return true;
}

/**
 * Apply retention policy to a document's version rows.
 * Always keeps named pins (up to maxNamed), keeps the newest rolling
 * autosave/manual rows (up to maxAutosave), then enforces maxTotal by
 * dropping the oldest non-named rows first.
 * @param {Array<{id: string, kind: string, createdAt: number}>} rows
 * @param {Partial<typeof DEFAULT_VERSION_POLICY>} [policy]
 * @returns {Array} kept rows (original order preserved)
 */
export function pruneVersionList(rows, policy = DEFAULT_VERSION_POLICY) {
  const p = { ...DEFAULT_VERSION_POLICY, ...(policy || {}) };
  if (!Array.isArray(rows)) return [];
  const sorted = [...rows].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const named = [];
  const rolling = [];
  for (const row of sorted) {
    if (row.kind === "named") named.push(row);
    else rolling.push(row);
  }
  const keptNamed = named.slice(0, p.maxNamed);
  const keptRolling = rolling.slice(0, p.maxAutosave);
  const merged = [...keptNamed, ...keptRolling].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (merged.length <= p.maxTotal) return merged;
  // Drop oldest non-named until within maxTotal.
  const result = [...merged];
  for (let i = result.length - 1; i >= 0 && result.length > p.maxTotal; i--) {
    if (result[i].kind !== "named") {
      result.splice(i, 1);
    }
  }
  return result;
}

/** Media inlined into a version row is capped at this total byte size. */
export const VERSION_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

/** Total byte size of media blobs (Blob.size / ArrayBuffer.byteLength). */
export function estimateMediaSize(mediaFiles) {
  let total = 0;
  for (const v of Object.values(mediaFiles || {})) {
    total += (v && (v.size || v.byteLength || 0)) || 0;
  }
  return total;
}

/**
 * Size-gate media for version storage. Keeps blobs until maxBytes; anything
 * past the cap is omitted (restore keeps current session media for those).
 * @param {Object<string, Blob|ArrayBuffer>} [mediaFiles]
 * @param {{ maxBytes?: number }} [opts]
 * @returns {{ mediaFiles: Object, mediaOmitted: boolean, mediaBytes: number }}
 */
export function packMediaForVersion(mediaFiles, { maxBytes = VERSION_MEDIA_MAX_BYTES } = {}) {
  const kept = {};
  let total = 0;
  let omitted = false;
  for (const [key, blob] of Object.entries(mediaFiles || {})) {
    const size = (blob && (blob.size || blob.byteLength || 0)) || 0;
    if (total + size > maxBytes) {
      omitted = true;
      continue;
    }
    total += size;
    kept[key] = blob;
  }
  return { mediaFiles: kept, mediaOmitted: omitted, mediaBytes: total };
}

/** Rough byte size of a version row payload (for quota accounting). */
export function estimateVersionByteSize({ body, annotations, sidecar, references, mediaBytes = 0 }) {
  let n = typeof body === "string" ? body.length : 0;
  try { n += JSON.stringify(annotations || []).length; } catch (_) {}
  try { n += JSON.stringify(sidecar || null).length; } catch (_) {}
  try { n += JSON.stringify(references || null).length; } catch (_) {}
  return n + (mediaBytes || 0);
}

/**
 * Build a version row from a save snapshot (pure; storage-side clone happens
 * inside VersionStore.putVersion).
 * @param {object} args
 * @returns {object} row ready for putVersion
 */
export function createVersionRow({
  id,
  documentId,
  name,
  kind = "manual",
  label = null,
  createdAt = Date.now(),
  hash = "",
  body = "",
  annotations = [],
  sidecar = null,
  references = null,
  mediaFiles = null,
  mediaOmitted = false,
  byteSize = 0,
}) {
  return {
    id,
    documentId,
    name: name || documentId,
    kind,
    label,
    createdAt,
    hash,
    byteSize,
    body,
    annotations,
    sidecar,
    references,
    mediaFiles,
    mediaOmitted,
  };
}
