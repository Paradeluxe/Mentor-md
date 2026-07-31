/**
 * Pure toolbar action model for Mentor.
 * No DOM. Callers pass current app state; returns label/disabled/intent/pressed.
 */

export const PRIMARY_TOOLBAR_ACTIONS = Object.freeze([
  { id: 'new', label: '新建' },
  { id: 'open', label: '打开' },
  { id: 'autoSave', label: '自动保存' },
  { id: 'save', label: '保存' },
  { id: 'saveAs', label: '另存' },
  { id: 'versionHistory', label: '版本' },
  { id: 'exportMd', label: 'MD' },
  { id: 'exportDocx', label: 'DOCX' },
  { id: 'references', label: '文献' },
  { id: 'undo', label: '撤销' },
  { id: 'redo', label: '重做' },
  { id: 'source', label: '源码' },
  { id: 'filePane', label: '大纲栏' },
  { id: 'commentPane', label: '批注栏' },
]);

/**
 * @param {object} input
 * @param {boolean} [input.hasDocument]
 * @param {boolean} [input.hasWriteHandle]
 * @param {boolean} [input.dirty]
 * @param {boolean} [input.readOnly]
 * @param {string} [input.saveMode]
 * @param {'rendered'|'source'} [input.renderMode]
 * @param {boolean} [input.referencesOpen]
 * @param {boolean} [input.canUndo]
 * @param {boolean} [input.canRedo]
 * @param {boolean} [input.busy]
 * @param {boolean} [input.filePaneOpen] - true when outline/file drawer is open
 * @param {boolean} [input.commentPaneOpen] - true when comment drawer is open
 * @param {boolean} [input.autoSaveEnabled] - user preference for Office-like AutoSave
 * @param {boolean} [input.autoSaveDisk] - preference on AND write-back target available
 */
export function getToolbarActionState(input = {}) {
  const hasDocument = !!input.hasDocument;
  const readOnly = !!input.readOnly;
  const busy = !!input.busy;
  const renderMode = input.renderMode === 'source' ? 'source' : 'rendered';
  const filePaneOpen = input.filePaneOpen !== false;
  const commentPaneOpen = input.commentPaneOpen !== false;
  const autoSaveEnabled = input.autoSaveEnabled !== false; // default ON
  const autoSaveDisk = !!input.autoSaveDisk;

  return {
    new: {
      label: '新建',
      disabled: busy,
    },
    open: {
      label: '打开',
      disabled: busy,
    },
    autoSave: {
      label: '自动保存',
      disabled: busy || readOnly,
      pressed: autoSaveEnabled,
      intent: autoSaveDisk ? 'disk-autosave' : (autoSaveEnabled ? 'draft-only' : 'off'),
      detail: autoSaveDisk
        ? '开启：停手后写回已授权文件'
        : (autoSaveEnabled
          ? '开启：尚无写回目标，仅自动保存草稿；请先保存到本地文件'
          : '关闭：仅手动保存写回文件（仍会保存崩溃恢复草稿）'),
    },
    save: {
      label: '保存',
      disabled: !hasDocument || readOnly || busy,
      intent: input.hasWriteHandle ? 'write-current' : 'choose-save-target',
      dirty: !!input.dirty,
    },
    saveAs: {
      label: '另存',
      disabled: !hasDocument || busy,
    },
    versionHistory: {
      label: '版本',
      disabled: !hasDocument || busy,
      pressed: !!input.versionPaneOpen,
      detail: '自动版本快照 · 可恢复',
    },
    exportMd: {
      label: 'MD',
      disabled: !hasDocument || busy,
    },
    exportDocx: {
      label: 'DOCX',
      disabled: !hasDocument || busy,
      detail: '仅正文，不含批注与引用库元数据',
    },
    references: {
      label: '文献',
      // Always allow opening the library (import / manage) even with no doc
      // or while a save/export is busy — blocking this felt like a dead button.
      disabled: false,
      pressed: !!input.referencesOpen,
    },
    undo: {
      label: '撤销',
      disabled: !hasDocument || !input.canUndo || busy,
    },
    redo: {
      label: '重做',
      disabled: !hasDocument || !input.canRedo || busy,
    },
    source: {
      label: renderMode === 'source' ? '预览' : '源码',
      disabled: !hasDocument || busy,
      pressed: renderMode === 'source',
    },
    filePane: {
      label: '大纲栏',
      disabled: false,
      pressed: filePaneOpen,
      expanded: filePaneOpen,
    },
    commentPane: {
      label: '批注栏',
      disabled: false,
      pressed: commentPaneOpen,
      expanded: commentPaneOpen,
    },
  };
}
