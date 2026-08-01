/**
 * Pure save-lifecycle contract helpers.
 * Official commit = user-confirmed disk/download save or Office disk-AutoSave.
 * Draft-only AutoRecover never markClean / never captureVersion via this helper.
 */

/**
 * @param {{
 *   officialCommit: boolean,
 *   snapshotGen: number|null|undefined,
 *   currentGen: number|null|undefined,
 *   activeDocument: boolean,
 * }} opts
 */
export function classifySaveOutcome({ officialCommit, snapshotGen, currentGen, activeDocument }) {
  const sameGeneration = !!activeDocument && snapshotGen === currentGen;
  return {
    markClean: !!officialCommit && sameGeneration,
    syncDraft: !!officialCommit,
    captureVersion: !!officialCommit,
    queueFollowup: !!officialCommit && !!activeDocument && !sameGeneration,
  };
}

/**
 * @param {{ currentDirty?: boolean, tabs?: Array<{ dirty?: boolean }|null|undefined> }} opts
 */
export function shouldPromptForUnsavedChanges({ currentDirty, tabs = [] } = {}) {
  return !!currentDirty || (tabs || []).some((tab) => !!(tab && tab.dirty));
}
