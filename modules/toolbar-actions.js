/**
 * Pure toolbar action model for Mentor.
 * No DOM. Callers pass current app state; returns label/disabled/intent/pressed.
 */

export const PRIMARY_TOOLBAR_ACTIONS = Object.freeze([
  { id: 'new', label: '新建' },
  { id: 'open', label: '打开' },
  { id: 'save', label: '保存' },
  { id: 'saveAs', label: '另存' },
  { id: 'exportMd', label: 'MD' },
  { id: 'exportDocx', label: 'DOCX' },
  { id: 'references', label: '文献' },
  { id: 'undo', label: '撤销' },
  { id: 'redo', label: '重做' },
  { id: 'source', label: '源码' },
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
 */
export function getToolbarActionState(input = {}) {
  const hasDocument = !!input.hasDocument;
  const readOnly = !!input.readOnly;
  const busy = !!input.busy;
  const renderMode = input.renderMode === 'source' ? 'source' : 'rendered';

  return {
    new: {
      label: '新建',
      disabled: busy,
    },
    open: {
      label: '打开',
      disabled: busy,
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
      disabled: !hasDocument || busy,
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
  };
}
