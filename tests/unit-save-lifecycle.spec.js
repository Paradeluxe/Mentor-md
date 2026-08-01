const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

(async () => {
  const mod = await import(pathToFileURL(path.resolve('modules/save-lifecycle.js')));

  assert.deepStrictEqual(mod.classifySaveOutcome({
    officialCommit: true,
    snapshotGen: 4,
    currentGen: 4,
    activeDocument: true,
  }), {
    markClean: true,
    syncDraft: true,
    captureVersion: true,
    queueFollowup: false,
  });

  assert.deepStrictEqual(mod.classifySaveOutcome({
    officialCommit: true,
    snapshotGen: 4,
    currentGen: 5,
    activeDocument: true,
  }), {
    markClean: false,
    syncDraft: true,
    captureVersion: true,
    queueFollowup: true,
  });

  assert.deepStrictEqual(mod.classifySaveOutcome({
    officialCommit: false,
    snapshotGen: 1,
    currentGen: 1,
    activeDocument: true,
  }), {
    markClean: false,
    syncDraft: false,
    captureVersion: false,
    queueFollowup: false,
  });

  assert.strictEqual(mod.shouldPromptForUnsavedChanges({
    currentDirty: false,
    tabs: [{ dirty: true }],
  }), true);

  assert.strictEqual(mod.shouldPromptForUnsavedChanges({
    currentDirty: false,
    tabs: [{ dirty: false }],
  }), false);

  console.log('PASS unit-save-lifecycle');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
