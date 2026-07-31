/**
 * Multi-document tab helpers (pure).
 */

/** Deep-clone an arbitrary references payload (array of plain objects) so
 *  that callers can mutate their own copy without corrupting the snapshot.
 *  Falls back to a shallow clone for non-array shapes. Returns null/undefined
 *  passthrough so absence remains absence.
 *  @param {any} value
 */
export function cloneReferences(value) {
  if (value == null) return value;
  if (!Array.isArray(value)) {
    // Back-compat: tolerate non-array shapes; return a shallow clone via JSON
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }
  return value.map((entry) => {
    if (entry == null || typeof entry !== "object") return entry;
    try {
      return JSON.parse(JSON.stringify(entry));
    } catch (_) {
      // Best-effort shallow clone if entry isn't JSON-safe
      return Object.assign({}, entry);
    }
  });
}

export function genTabId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "tab-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function findTabByDocument(tabs, documentId, name) {
  const list = Array.isArray(tabs) ? tabs : [];
  if (documentId) {
    const byId = list.find((tab) => tab && (tab.currentFile?.documentId || tab.id) === documentId);
    if (byId) return byId;
  }
  if (name) {
    return list.find((tab) => tab && (tab.name === name || tab.currentFile?.name === name)) || null;
  }
  return null;
}


export function sanitizeSupervisionSource(source, fallbackName = "") {
  return {
    path: typeof source?.path === "string" ? source.path : "",
    name: typeof source?.name === "string" && source.name
      ? source.name
      : (fallbackName || "")
  };
}

export function snapshotTabState({
  id,
  name,
  html,
  annotations,
  dirty,
  handle,
  saveMode,
  mediaUrls,
  mediaFiles,
  currentFile,
  replyDrafts,
  references,
  supervisionSource
}) {
  const clonedReferences =
    references === undefined ? undefined : cloneReferences(references);
  const safeName = name || currentFile?.name || "untitled.md";
  const source = sanitizeSupervisionSource(
    supervisionSource || {
      path: currentFile?.path || "",
      name: currentFile?.name || safeName
    },
    safeName
  );
  return {
    id,
    name: safeName,
    html: html || "",
    annotations: annotations || [],
    dirty: !!dirty,
    handle: handle || currentFile?.handle || null,
    saveMode: saveMode || "unknown",
    mediaUrls: mediaUrls || {},
    mediaFiles: mediaFiles || {},
    currentFile: currentFile
      ? {
          documentId: currentFile.documentId || id,
          name: currentFile.name,
          content: currentFile.content || "",
          dirty: !!currentFile.dirty,
          dirtyGen: currentFile.dirtyGen || 0,
          handle: currentFile.handle || null,
          path: currentFile.path || source.path || null,
          // Mirror references onto the per-document slice so a snapshot can
          // round-trip without depending on the top-level field. Undefined
          // stays undefined to keep the existing shape stable.
          references: currentFile.references === undefined
            ? undefined
            : cloneReferences(currentFile.references)
        }
      : { documentId: id, name: safeName, content: "", dirty: !!dirty, dirtyGen: 0, handle: null, path: source.path || null },
    replyDrafts: replyDrafts || {},
    supervisionSource: source,
    // Only include references when the caller actually passed it in; omitting
    // the key preserves the original snapshot shape for legacy callers.
    ...(clonedReferences === undefined ? {} : { references: clonedReferences })
  };
}

export function tabLabel(tab) {
  if (!tab) return "untitled";
  const n = tab.name || tab.currentFile?.name || "untitled.md";
  return tab.dirty ? n + " •" : n;
}
