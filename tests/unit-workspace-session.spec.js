const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'modules', 'workspace-session.js')).href);
  const session = mod.createWorkspaceSession({
    tabs: [
      {
        id: 'tab-a', name: 'a.mentor', dirty: true, saveMode: 'mentor-handle',
        currentFile: { documentId: 'doc-a', name: 'a.mentor', path: 'E:/papers/a.mentor' },
        html: '<p>SECRET BODY</p>', handle: { secret: true }, externalWatchToken: 'SECRET_TOKEN'
      },
      {
        id: 'tab-b', name: 'b.mentor', dirty: false, saveMode: 'mentor-download',
        currentFile: { documentId: 'doc-b', name: 'b.mentor' }
      }
    ],
    activeTabId: 'tab-a'
  });

  assert.equal(session.v, 1);
  assert.equal(session.id, 'current');
  assert.deepEqual(session.tabs.map((x) => x.documentId), ['doc-a', 'doc-b']);
  assert.equal(session.activeDocumentId, 'doc-a');
  const json = JSON.stringify(session);
  assert(!json.includes('SECRET BODY'));
  assert(!json.includes('SECRET_TOKEN'));
  assert(!json.includes('"handle"'));
  assert(!Object.prototype.hasOwnProperty.call(session, 'handle'));
  assert.equal(session.tabs[0].saveMode, 'mentor-handle');

  const normalized = mod.normalizeWorkspaceSession({
    v: 1,
    tabs: [session.tabs[0], session.tabs[0], null, { name: '' }],
    activeDocumentId: 'missing'
  });
  assert.equal(normalized.tabs.length, 1);
  assert.equal(normalized.activeDocumentId, 'doc-a');

  const ordered = mod.orderRestoredTabs(
    [
      { id: 'runtime-b', currentFile: { documentId: 'doc-b' } },
      { id: 'runtime-a', currentFile: { documentId: 'doc-a' } }
    ],
    {
      tabs: [
        { documentId: 'doc-a', order: 0 },
        { documentId: 'doc-missing', order: 1 },
        { documentId: 'doc-b', order: 2 }
      ],
      activeDocumentId: 'doc-missing'
    }
  );
  assert.deepEqual(ordered.tabs.map((t) => t.currentFile.documentId), ['doc-a', 'doc-b']);
  assert.equal(ordered.activeDocumentId, 'doc-b');

  console.log('PASS workspace-session');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
