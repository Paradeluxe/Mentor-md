const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildFakeIDB } = require('./helpers/fake-idb');

(async () => {
  const io = await import(pathToFileURL(path.join(__dirname, '..', 'modules', 'io.js')).href);
  const store = io.createHandleStore(buildFakeIDB());
  assert.equal(store.DB_VERSION, 4);
  assert.equal(await store.getWorkspaceSession(), null);
  await store.putWorkspaceSession({ v: 1, tabs: [{ documentId: 'a', name: 'a.mentor' }] });
  let row = await store.getWorkspaceSession();
  assert.equal(row.id, 'current');
  assert.equal(row.tabs[0].documentId, 'a');
  await store.putWorkspaceSession({ v: 1, tabs: [{ documentId: 'b', name: 'b.mentor' }] });
  row = await store.getWorkspaceSession();
  assert.deepEqual(row.tabs.map((x) => x.documentId), ['b']);
  await store.removeWorkspaceSession();
  assert.equal(await store.getWorkspaceSession(), null);
  console.log('PASS workspace-store');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});