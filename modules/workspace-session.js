export const WORKSPACE_SESSION_VERSION = 1;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function entryFromTab(tab, order) {
  if (!tab || typeof tab !== 'object') return null;
  const documentId = text(tab.currentFile?.documentId || tab.documentId || tab.id);
  const name = text(tab.currentFile?.name || tab.name);
  if (!documentId || !name) return null;
  return {
    documentId,
    name,
    saveMode: text(tab.saveMode) || 'unknown',
    path: text(tab.supervisionSource?.path || tab.currentFile?.path),
    dirty: Boolean(tab.dirty || tab.currentFile?.dirty),
    order
  };
}

export function normalizeWorkspaceSession(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const tabs = [];
  for (const candidate of Array.isArray(source.tabs) ? source.tabs : []) {
    const entry = entryFromTab(candidate, tabs.length);
    if (!entry || seen.has(entry.documentId)) continue;
    seen.add(entry.documentId);
    tabs.push(entry);
  }
  const requested = text(source.activeDocumentId);
  return {
    v: WORKSPACE_SESSION_VERSION,
    id: 'current',
    activeDocumentId: seen.has(requested) ? requested : (tabs[0]?.documentId || ''),
    tabs,
    updatedAt: Number(source.updatedAt) || Date.now()
  };
}

export function createWorkspaceSession({ tabs = [], activeTabId = '' } = {}) {
  const activeTab = tabs.find((tab) => tab && tab.id === activeTabId);
  return normalizeWorkspaceSession({
    tabs,
    activeDocumentId: activeTab?.currentFile?.documentId || activeTab?.documentId || activeTab?.id || '',
    updatedAt: Date.now()
  });
}
