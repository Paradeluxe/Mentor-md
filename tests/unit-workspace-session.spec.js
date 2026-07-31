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
  assert(!json.includes('handle'));

  const normalized = mod.normalizeWorkspaceSession({
    v: 1,
    tabs: [session.tabs[0], session.tabs[0], null, { name: '' }],
    activeDocumentId: 'missing'
  });
  assert.equal(normalized.tabs.length, 1);
  assert.equal(normalized.activeDocumentId, 'doc-a');
  console.log('PASS workspace-session');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
