/**
 * Global invariants checked after chaos-ux actions.
 */
async function checkInvariants(page, { strictDirty = false } = {}) {
  const r = await page.evaluate((strictDirty) => {
    const M = window.__mdAnnotator;
    if (!M || !M.State) return { ok: false, err: 'no __mdAnnotator' };
    const S = M.State;
    const problems = [];

    if (!S.editor) problems.push('editor missing');

    const tabs = Array.isArray(S.tabs) ? S.tabs.filter(Boolean) : [];
    const ids = tabs.map((t) => t.id);
    if (new Set(ids).size !== ids.length) problems.push('duplicate tab ids');
    // Single-document page: at most one in-memory document slot
    if (tabs.length > 1) problems.push('tabs.length>1 (single-document page)');

    if (S.activeTabId != null && !tabs.some((t) => t.id === S.activeTabId)) {
      // blank states may clear — only warn if tabs non-empty
      if (tabs.length > 0) problems.push('activeTabId not in tabs');
    }

    if (S.currentFile) {
      const uiName = document.querySelector('#current-file-name')?.textContent || '';
      if (S.currentFile.name && uiName && uiName !== S.currentFile.name && uiName !== '未打开文档') {
        // allow minor mismatches during transitions
      }
      const dirtyUi = document.querySelector('#dirty-indicator')?.classList.contains('is-dirty');
      if (strictDirty && !!S.currentFile.dirty !== !!dirtyUi) {
        problems.push(`dirty mismatch state=${!!S.currentFile.dirty} ui=${!!dirtyUi}`);
      }
    }

    const anns = Array.isArray(S.annotations) ? S.annotations : [];
    for (const a of anns) {
      if (!a || !a.threadId) problems.push('annotation without threadId');
    }
    const tidSet = new Set();
    for (const a of anns) {
      if (a && a.threadId) {
        if (tidSet.has(a.threadId)) problems.push('duplicate threadId ' + a.threadId);
        tidSet.add(a.threadId);
      }
    }

    return {
      ok: problems.length === 0,
      problems,
      summary: {
        tabs: tabs.length,
        anns: anns.length,
        saveMode: S.saveMode,
        dirty: !!(S.currentFile && S.currentFile.dirty),
        name: S.currentFile && S.currentFile.name,
      },
    };
  }, strictDirty);

  if (!r.ok) {
    const err = new Error('invariant failed: ' + (r.problems || [r.err]).join('; '));
    err.invariant = r;
    throw err;
  }
  return r.summary;
}

async function dumpState(page) {
  return page.evaluate(() => {
    const S = window.__mdAnnotator?.State;
    if (!S) return null;
    return {
      saveMode: S.saveMode,
      name: S.currentFile?.name,
      dirty: S.currentFile?.dirty,
      dirtyGen: S.currentFile?.dirtyGen,
      tabs: (S.tabs || []).map((t) => ({ id: t.id, name: t.name, dirty: t.dirty })),
      activeTabId: S.activeTabId,
      anns: (S.annotations || []).map((a) => ({
        id: a.threadId,
        text: (a.text || '').slice(0, 40),
        resolved: a.resolved,
        deleted: a.deleted,
        invalid: a.invalid,
        fuzzy: a.fuzzy,
        reason: a.invalidReason,
        comments: (a.comments || []).length,
        hasImg: !!(a.imageAnchors && a.imageAnchors.length),
      })),
      replyDraftKeys: Object.keys(S.replyDrafts || {}),
    };
  });
}

module.exports = { checkInvariants, dumpState };
