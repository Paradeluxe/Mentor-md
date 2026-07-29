// Pure toolbar action contract — no browser.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'toolbar-actions.js')).href;
  const {
    PRIMARY_TOOLBAR_ACTIONS,
    getToolbarActionState,
  } = await import(modUrl);

  assert.deepStrictEqual(
    PRIMARY_TOOLBAR_ACTIONS.map((x) => x.id),
    ['new', 'open', 'save', 'saveAs', 'exportMd', 'exportDocx', 'references', 'undo', 'redo', 'source', 'filePane', 'commentPane']
  );

  const noHandle = getToolbarActionState({
    hasDocument: true,
    hasWriteHandle: false,
    dirty: true,
    readOnly: false,
    saveMode: 'mentor-download',
    renderMode: 'rendered',
    referencesOpen: false,
  });
  assert.strictEqual(noHandle.save.label, '保存');
  assert.strictEqual(noHandle.save.intent, 'choose-save-target');
  assert.strictEqual(noHandle.save.disabled, false);
  assert.strictEqual(noHandle.saveAs.label, '另存');
  assert.strictEqual(noHandle.exportDocx.detail, '仅正文，不含批注与引用库元数据');
  assert.strictEqual(noHandle.references.label, '文献');
  assert.strictEqual(noHandle.references.pressed, false);
  assert.strictEqual(noHandle.source.label, '源码');
  assert.strictEqual(noHandle.source.pressed, false);
  // default panes open when flags omitted
  assert.strictEqual(noHandle.filePane.pressed, true);
  assert.strictEqual(noHandle.commentPane.pressed, true);
  assert.strictEqual(noHandle.filePane.expanded, true);

  const withHandle = getToolbarActionState({
    hasDocument: true,
    hasWriteHandle: true,
    dirty: false,
    readOnly: false,
    saveMode: 'mentor-handle',
    renderMode: 'source',
    referencesOpen: true,
    filePaneOpen: false,
    commentPaneOpen: true,
  });
  assert.strictEqual(withHandle.save.intent, 'write-current');
  assert.strictEqual(withHandle.source.label, '预览');
  assert.strictEqual(withHandle.source.pressed, true);
  assert.strictEqual(withHandle.references.pressed, true);
  assert.strictEqual(withHandle.filePane.pressed, false);
  assert.strictEqual(withHandle.filePane.expanded, false);
  assert.strictEqual(withHandle.commentPane.pressed, true);

  const readOnly = getToolbarActionState({
    hasDocument: true,
    hasWriteHandle: true,
    dirty: true,
    readOnly: true,
    saveMode: 'mentor-handle',
    renderMode: 'rendered',
    referencesOpen: false,
  });
  assert.strictEqual(readOnly.save.disabled, true);

  const noDoc = getToolbarActionState({
    hasDocument: false,
    hasWriteHandle: false,
    dirty: false,
    readOnly: false,
    saveMode: 'none',
    renderMode: 'rendered',
    referencesOpen: false,
  });
  assert.strictEqual(noDoc.save.disabled, true);
  assert.strictEqual(noDoc.saveAs.disabled, true);
  assert.strictEqual(noDoc.exportMd.disabled, true);
  assert.strictEqual(noDoc.exportDocx.disabled, true);
  // Literature pane stays clickable with no document (import/manage library)
  assert.strictEqual(noDoc.references.disabled, false);

  const busy = getToolbarActionState({
    hasDocument: true,
    hasWriteHandle: true,
    dirty: true,
    busy: true,
    referencesOpen: false,
  });
  assert.strictEqual(busy.save.disabled, true);
  assert.strictEqual(busy.references.disabled, false);

  console.log('PASS unit-toolbar-actions');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
