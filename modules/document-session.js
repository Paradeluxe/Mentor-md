/**
 * DocumentSession — stable document identity + open lifecycle helpers.
 * Pure helpers; app.js owns State and UI side-effects.
 */

export function fingerprintDocument(name, content) {
  const n = String(name || "");
  const c = String(content || "");
  let h = 2166136261;
  const s = n + "\0" + c.slice(0, 4096) + "\0" + c.length;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "doc-" + (h >>> 0).toString(16);
}

export function createDocumentSession({
  documentId = null,
  name = "untitled.md",
  content = "",
  dirty = false,
  handle = null,
  annotations = null,
  saveMode = "unknown",
  mediaUrls = null,
  mediaFiles = null
} = {}) {
  return {
    documentId: documentId || null,
    name,
    content,
    dirty: !!dirty,
    dirtyGen: 0,
    handle: handle || null,
    annotations: annotations || null,
    saveMode,
    mediaUrls: mediaUrls || {},
    mediaFiles: mediaFiles || {}
  };
}

export function sessionIdentity(session) {
  if (!session) return null;
  return session.documentId || session.name || null;
}

export function sessionsMatch(a, b) {
  if (!a || !b) return false;
  if (a.documentId && b.documentId) return a.documentId === b.documentId;
  return !!(a.name && b.name && a.name === b.name);
}
