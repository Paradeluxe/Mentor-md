// Pure save-dialog copy model tests.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'save-dialog.js')).href;
  const { buildSaveDialogModel, buildSaveResultCopy } = await import(modUrl);

  const noHandleLegacy = buildSaveDialogModel({
    kind: 'no-handle',
    fileName: 'paper.md',
    annotations: 3,
    references: 12,
    media: 2,
    canAuthorize: false,
  });
  assert.strictEqual(noHandleLegacy.title, '保存文档');
  assert.ok(noHandleLegacy.message.includes('.mentor'));
  assert.strictEqual(noHandleLegacy.primaryLabel, '保存 .mentor');
  assert.strictEqual(noHandleLegacy.secondaryLabel, '仅导出 Markdown');

  const noHandleAuth = buildSaveDialogModel({
    kind: 'no-handle',
    fileName: 'paper.md',
    annotations: 3,
    references: 12,
    media: 2,
    canAuthorize: true,
  });
  assert.strictEqual(noHandleAuth.title, '保存到磁盘');
  assert.strictEqual(noHandleAuth.primaryLabel, '选文件并保存');
  assert.strictEqual(noHandleAuth.secondaryLabel, '仅下载副本');
  assert.ok(noHandleAuth.details.some((d) => d.label === '包含' && d.value.includes('批注 3')));

  const permAuth = buildSaveDialogModel({ kind: 'permission-denied', fileName: 'a.mentor', canAuthorize: true });
  assert.strictEqual(permAuth.primaryLabel, '选文件保存');
  assert.strictEqual(permAuth.secondaryLabel, '仅下载副本');

  assert.strictEqual(
    buildSaveDialogModel({ kind: 'external-modified', fileName: 'paper.mentor' }).title,
    '文件已在外部修改'
  );
  assert.strictEqual(
    buildSaveDialogModel({ kind: 'external-modified' }).primaryLabel,
    '仍然覆盖'
  );
  assert.strictEqual(
    buildSaveDialogModel({ kind: 'anchor-audit', issueCount: 2 }).primaryLabel,
    '查看问题'
  );

  const write = buildSaveResultCopy({ kind: 'write-current', fileName: 'paper.mentor' });
  assert.strictEqual(write.status, '已保存');
  assert.ok(write.detail.includes('已写回'));
  assert.strictEqual(write.clearsDirty, true);

  const copy = buildSaveResultCopy({ kind: 'save-copy' });
  assert.strictEqual(copy.status, '副本已下载');
  assert.strictEqual(copy.detail, '原文件未改变');
  assert.strictEqual(copy.clearsDirty, false);

  const md = buildSaveResultCopy({ kind: 'export-md' });
  assert.strictEqual(md.status, 'Markdown 已导出');
  assert.strictEqual(md.clearsDirty, false);

  const docx = buildSaveResultCopy({ kind: 'export-docx' });
  assert.strictEqual(docx.detail, '仅正文；批注与文献库未导出');
  const docxAnns = buildSaveResultCopy({ kind: 'export-docx', hasAnnotations: true });
  assert.strictEqual(docxAnns.detail, '含批注；引用库请用 .mentor');

  console.log('PASS unit-save-dialog');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
