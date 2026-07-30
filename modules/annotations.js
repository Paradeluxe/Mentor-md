/**
 * Annotation helpers: inverse-patch history, changed-range validation,
 * DecorationSet-based active highlight (no double full-doc mark rewrite).
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const activeHighlightKey = new PluginKey("active-annotation-highlight");

/** Deep clone via JSON (annotations are plain data). */
export function deepCloneAnnotations(arr) {
  return JSON.parse(JSON.stringify(arr || []));
}

/**
 * Compute a minimal inverse patch so applyAnnPatch(next, inverse) === prev.
 * Patch format: { ops: [{ op: 'replace'|'add'|'remove', threadId, before?, after? }] }
 */
export function computeInverseAnnPatch(prev, next) {
  const prevArr = Array.isArray(prev) ? prev : [];
  const nextArr = Array.isArray(next) ? next : [];
  const prevMap = new Map(prevArr.filter((a) => a && a.threadId).map((a) => [a.threadId, a]));
  const nextMap = new Map(nextArr.filter((a) => a && a.threadId).map((a) => [a.threadId, a]));
  const ops = [];

  for (const [tid, before] of prevMap) {
    if (!nextMap.has(tid)) {
      ops.push({ op: "add", threadId: tid, after: deepCloneAnnotations([before])[0] });
    } else {
      const after = nextMap.get(tid);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        ops.push({
          op: "replace",
          threadId: tid,
          before: deepCloneAnnotations([before])[0],
          after: deepCloneAnnotations([after])[0]
        });
      }
    }
  }
  for (const [tid, after] of nextMap) {
    if (!prevMap.has(tid)) {
      ops.push({ op: "remove", threadId: tid, before: deepCloneAnnotations([after])[0] });
    }
  }
  return { kind: "inverse-ann-patch", ops, ts: Date.now() };
}

/** Apply inverse patch to current annotations → previous state. */
export function applyAnnPatch(current, patch) {
  let arr = deepCloneAnnotations(current);
  if (!patch || !Array.isArray(patch.ops)) return arr;
  for (const op of patch.ops) {
    if (!op || !op.threadId) continue;
    const idx = arr.findIndex((a) => a && a.threadId === op.threadId);
    if (op.op === "add") {
      // inverse of remove: re-insert before snapshot
      if (idx < 0 && op.after) arr.push(deepCloneAnnotations([op.after])[0]);
      else if (idx < 0 && op.before) arr.push(deepCloneAnnotations([op.before])[0]);
    } else if (op.op === "remove") {
      // inverse of add: remove thread
      if (idx >= 0) arr.splice(idx, 1);
    } else if (op.op === "replace") {
      // inverse of replace: restore before
      if (op.before) {
        if (idx >= 0) arr[idx] = deepCloneAnnotations([op.before])[0];
        else arr.push(deepCloneAnnotations([op.before])[0]);
      }
    }
  }
  return arr;
}

/**
 * Forward patch (for redo stack entries that store forward ops).
 * computeForwardAnnPatch(prev, next) so applyForward(prev, forward) === next.
 */
export function computeForwardAnnPatch(prev, next) {
  // Forward ops are the inverse of inverse(prev,next) applied to next? Easier: inverse(next, prev)
  return computeInverseAnnPatch(next, prev);
}

/**
 * Collect changed document ranges from a ProseMirror transaction mapping.
 * Returns [{ from, to }] in the *new* document coordinates.
 */
export function collectChangedRanges(transaction) {
  if (!transaction || !transaction.docChanged || !transaction.mapping) return null;
  const ranges = [];
  const map = transaction.mapping;
  for (let i = 0; i < map.maps.length; i++) {
    const m = map.maps[i];
    m.forEach((oldStart, oldEnd, newStart, newEnd) => {
      ranges.push({ from: newStart, to: Math.max(newStart, newEnd) });
    });
  }
  if (!ranges.length) return null;
  // Merge overlapping
  ranges.sort((a, b) => a.from - b.from);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const cur = ranges[i];
    if (cur.from <= last.to + 1) last.to = Math.max(last.to, cur.to);
    else merged.push({ ...cur });
  }
  return merged;
}

/**
 * Collapse ProseMirror-split physical annotation mark pieces into logical ranges.
 * Groups by threadId, merges contiguous/overlapping intervals, keeps true gaps.
 * Physical multi-mark fragmentation from nested/overlapping annotations is NOT
 * treated as multiple anchors.
 *
 * @param {Array<{threadId:string,from:number,to:number,text?:string}>} pieces
 * @returns {Array<{threadId:string,from:number,to:number,text:string,pieces:number}>}
 */
export function coalesceAnnotationMarkPieces(pieces) {
  const byThread = new Map();
  for (const piece of pieces || []) {
    if (!piece || !piece.threadId) continue;
    const from = Number(piece.from);
    const to = Number(piece.to);
    if (!(from < to)) continue;
    if (!byThread.has(piece.threadId)) byThread.set(piece.threadId, []);
    byThread.get(piece.threadId).push({
      threadId: piece.threadId,
      from,
      to,
      text: String(piece.text || "")
    });
  }

  const logical = [];
  for (const [threadId, threadPieces] of byThread) {
    const ordered = threadPieces.slice().sort((a, b) => a.from - b.from || a.to - b.to);
    const deduped = [];
    for (const p of ordered) {
      const last = deduped[deduped.length - 1];
      if (last && last.from === p.from && last.to === p.to) continue;
      deduped.push(p);
    }
    let current = null;
    for (const piece of deduped) {
      if (current && piece.from <= current.to) {
        if (piece.to > current.to) {
          const skip = Math.max(0, current.to - piece.from);
          current.text += String(piece.text || "").slice(skip);
          current.to = piece.to;
        }
        current.pieces += 1;
      } else {
        current = {
          threadId,
          from: piece.from,
          to: piece.to,
          text: String(piece.text || ""),
          pieces: 1
        };
        logical.push(current);
      }
    }
  }
  return logical.sort(
    (a, b) => a.from - b.from || a.to - b.to || String(a.threadId).localeCompare(String(b.threadId))
  );
}

/**
 * Walk only changed ranges (plus small pad) for annotation marks.
 * Falls back to full doc when ranges is null.
 */
export function scanAnnotationMarksInRanges(doc, markType, ranges, pad = 32) {
  const threadFound = new Set();
  const threadCurrentText = new Map();
  const threadMarkRange = new Map();
  const threadLogicalRanges = new Map();
  const textCount = new Map();
  const size = doc.content.size;
  const seenTextNodes = new Set();

  const markPieces = new Map();
  const visitText = (node, pos) => {
    if (!node.isText) return;
    const nodeKey = `${pos}:${node.nodeSize}`;
    if (seenTextNodes.has(nodeKey)) return;
    seenTextNodes.add(nodeKey);
    const text2 = node.text;
    if (text2) textCount.set(text2, (textCount.get(text2) || 0) + 1);
    for (const m of node.marks) {
      if (m.type === markType && m.attrs.threadId) {
        const tid = m.attrs.threadId;
        threadFound.add(tid);
        if (!markPieces.has(tid)) markPieces.set(tid, []);
        markPieces.get(tid).push({ from: pos, to: pos + node.nodeSize, text: text2 || '' });
      }
    }
  };

  const finalizeFromLogical = () => {
    const flat = [];
    for (const [tid, pieces] of markPieces) {
      for (const p of pieces) flat.push({ threadId: tid, from: p.from, to: p.to, text: p.text });
    }
    const logical = coalesceAnnotationMarkPieces(flat);
    for (const L of logical) {
      if (!threadLogicalRanges.has(L.threadId)) threadLogicalRanges.set(L.threadId, []);
      threadLogicalRanges.get(L.threadId).push({ from: L.from, to: L.to, text: L.text });
      if (!threadMarkRange.has(L.threadId)) {
        threadMarkRange.set(L.threadId, { from: L.from, to: L.to });
      } else {
        const r = threadMarkRange.get(L.threadId);
        if (L.from < r.from) r.from = L.from;
        if (L.to > r.to) r.to = L.to;
      }
    }
    for (const [tid, pieces] of markPieces) {
      pieces.sort((a, b) => a.from - b.from || a.to - b.to);
      // Literal marked text from physical pieces (multi-range callers may re-split).
      threadCurrentText.set(tid, pieces.map((piece) => piece.text).join(''));
    }
  };

  if (!ranges || !ranges.length) {
    doc.descendants((node, pos) => {
      visitText(node, pos);
    });
  } else {
    for (const r of ranges) {
      const from = Math.max(0, (r.from || 0) - pad);
      const to = Math.min(size, (r.to || 0) + pad);
      if (from >= to) continue;
      try {
        doc.nodesBetween(from, to, (node, pos) => {
          visitText(node, pos);
        });
      } catch (_) {
        /* ignore partial range errors */
      }
    }
  }
  finalizeFromLogical();
  return {
    threadFound,
    threadCurrentText,
    threadMarkRange,
    threadLogicalRanges,
    textCount,
    incremental: !!(ranges && ranges.length)
  };
}

/**
 * DecorationSet plugin: paints active annotation highlight without rewriting marks.
 * meta key: setActiveThread (string|null)
 *
 * @param {() => string|null} getActiveThreadId
 * @param {(threadId: string) => ('ai'|'review'|null|undefined)} [getThreadType]
 *        Mode color layer: ai → cyan, review → violet, else human accent (orange).
 */
export function createActiveHighlightPlugin(getActiveThreadId, getThreadType) {
  return new Plugin({
    key: activeHighlightKey,
    state: {
      init() {
        return { threadId: null, decos: DecorationSet.empty };
      },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(activeHighlightKey);
        let threadId = prev.threadId;
        if (meta && Object.prototype.hasOwnProperty.call(meta, "threadId")) {
          threadId = meta.threadId || null;
        } else if (typeof getActiveThreadId === "function") {
          // Keep in sync if caller changed State without meta (selection path sets meta)
          const live = getActiveThreadId();
          if (live !== threadId && tr.getMeta("__activeMarkSync")) {
            /* keep prev unless meta */
          }
        }
        if (tr.docChanged || (meta && Object.prototype.hasOwnProperty.call(meta, "threadId"))) {
          return {
            threadId,
            decos: buildActiveDecos(
              newState.doc,
              threadId,
              newState.schema.marks.annotation,
              getThreadType
            )
          };
        }
        return prev;
      }
    },
    props: {
      decorations(state) {
        const pluginState = activeHighlightKey.getState(state);
        return pluginState ? pluginState.decos : DecorationSet.empty;
      }
    }
  });
}

export function buildActiveDecos(doc, threadId, markType, getThreadType) {
  if (!threadId || !markType) return DecorationSet.empty;
  let mode = null;
  try {
    if (typeof getThreadType === "function") {
      mode = getThreadType(threadId) || null;
    }
  } catch (_) {
    mode = null;
  }
  if (mode !== "ai" && mode !== "review") mode = null; // human / unknown
  const modeClass = mode === "ai" ? " is-ai" : mode === "review" ? " is-review" : " is-human";
  const decos = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type === markType && m.attrs.threadId === threadId) {
        const attrs = {
          // Do NOT reuse .annotation-mark — that class is for real Mark DOM
          // and e2e counts .annotation-mark nodes. Use a distinct deco class.
          class: `annotation-active-deco${modeClass}`,
          "data-active-deco": "true"
        };
        if (mode) attrs["data-thread-type"] = mode;
        decos.push(Decoration.inline(pos, pos + node.nodeSize, attrs));
      }
    }
  });
  return DecorationSet.create(doc, decos);
}

export function setActiveHighlightMeta(tr, threadId) {
  return tr.setMeta(activeHighlightKey, { threadId: threadId || null });
}

/**
 * History stack entry using inverse patches (not full annotation arrays).
 */
export function createPatchHistory(capacity = 100) {
  return {
    past: [],
    future: [],
    capacity,
    lastOp: null,
    /** last full snapshot used as base for next inverse patch */
    _baseAnnotations: null,
    _baseMarks: null
  };
}

export function pushInverseHistory(history, currentAnnotations, currentMarkSnapshot, opts = {}) {
  const baseAnn = history._baseAnnotations;
  const baseMarks = history._baseMarks;
  if (baseAnn == null) {
    // First push: store inverse from empty or clone once as seed
    history._baseAnnotations = deepCloneAnnotations(currentAnnotations);
    history._baseMarks = currentMarkSnapshot ? deepCloneAnnotations(currentMarkSnapshot) : [];
    return history;
  }
  const inverse = computeInverseAnnPatch(baseAnn, currentAnnotations);
  const markInverse = {
    kind: "mark-snapshot-swap",
    before: baseMarks || [],
    after: currentMarkSnapshot ? deepCloneAnnotations(currentMarkSnapshot) : []
  };
  // Only push if something changed
  if ((!inverse.ops || !inverse.ops.length) && JSON.stringify(markInverse.before) === JSON.stringify(markInverse.after)) {
    return history;
  }
  history.past.push({
    kind: "inverse-patch",
    annPatch: inverse,
    markSwap: markInverse,
    // Keep compact: do NOT store full annotations
    ts: Date.now()
  });
  if (history.past.length > history.capacity) history.past.shift();
  history.future = [];
  history.lastOp = opts.op || "ann";
  history._baseAnnotations = deepCloneAnnotations(currentAnnotations);
  history._baseMarks = currentMarkSnapshot ? deepCloneAnnotations(currentMarkSnapshot) : [];
  return history;
}

export function undoInverseHistory(history, currentAnnotations, currentMarkSnapshot) {
  if (!history.past.length) return null;
  const entry = history.past.pop();
  const restoredAnn = applyAnnPatch(currentAnnotations, entry.annPatch);
  const restoredMarks = entry.markSwap ? entry.markSwap.before : currentMarkSnapshot;
  // Forward patch for redo = inverse from restored → current
  const forward = computeInverseAnnPatch(restoredAnn, currentAnnotations);
  history.future.push({
    kind: "inverse-patch",
    annPatch: forward,
    markSwap: entry.markSwap
      ? { kind: "mark-snapshot-swap", before: entry.markSwap.after, after: entry.markSwap.before }
      : null,
    ts: Date.now()
  });
  if (history.future.length > history.capacity) history.future.shift();
  history._baseAnnotations = deepCloneAnnotations(restoredAnn);
  history._baseMarks = restoredMarks ? deepCloneAnnotations(restoredMarks) : [];
  return { annotations: restoredAnn, markSnapshot: restoredMarks };
}

export function redoInverseHistory(history, currentAnnotations, currentMarkSnapshot) {
  if (!history.future.length) return null;
  const entry = history.future.pop();
  // future entry's annPatch is forward inverse (apply to current to get next)
  // We stored forward as inverse(restored, current) at undo time which applies to restored to get current.
  // At redo, current is restored; applying that patch would go wrong.
  // Simpler: future stores inverse from future-state to current; applyAnnPatch(current, inverseOfForward)...
  // Our undo pushed: annPatch = computeInverseAnnPatch(restoredAnn, currentAnnotations)
  // which means apply(currentAnnotations, thatPatch) ≈ restoredAnn — that's for undoing the redo.
  // For redo we need apply(current, inverse(current, next)) = next where next was pre-undo state.
  // We stored markSwap.before = after (pre-undo marks) wait...
  // redo: apply inverse of what undo did = applyAnnPatch with swapped semantics.
  // Easiest fix: store full `resultAnnotations` only in future/past as optional `snapshot` for marks,
  // and for ann use: redo applies computeInverseAnnPatch inverted again.
  const nextAnn = applyAnnPatch(currentAnnotations, {
    ops: (entry.annPatch.ops || []).map((op) => {
      if (op.op === "add") return { op: "remove", threadId: op.threadId, before: op.after || op.before };
      if (op.op === "remove") return { op: "add", threadId: op.threadId, after: op.before };
      if (op.op === "replace") return { op: "replace", threadId: op.threadId, before: op.after, after: op.before };
      return op;
    })
  });
  // Actually the above double-inverts wrong for replace. applyAnnPatch on inverse patch undoes;
  // to redo, apply the inverse of the inverse = the stored annPatch was inverse(restored, oldCurrent).
  // apply(oldCurrent, inv) = restored. So apply(restored, inv') = oldCurrent where inv' inverts inv.
  // Our map above tries to invert ops. For replace, apply uses `before` to restore — so to go forward
  // we need before=after of inverse = original after. Good.
  const nextMarks = entry.markSwap ? entry.markSwap.before : currentMarkSnapshot;
  history.past.push({
    kind: "inverse-patch",
    annPatch: entry.annPatch,
    markSwap: entry.markSwap
      ? { kind: "mark-snapshot-swap", before: entry.markSwap.after, after: entry.markSwap.before }
      : null,
    ts: Date.now()
  });
  if (history.past.length > history.capacity) history.past.shift();
  history._baseAnnotations = deepCloneAnnotations(nextAnn);
  history._baseMarks = nextMarks ? deepCloneAnnotations(nextMarks) : [];
  return { annotations: nextAnn, markSnapshot: nextMarks };
}

/**
 * Test helper: history entry must be patch, not full annotations array dump.
 */
export function isPatchHistoryEntry(entry) {
  return !!(
    entry &&
    entry.kind === "inverse-patch" &&
    entry.annPatch &&
    Array.isArray(entry.annPatch.ops) &&
    !Array.isArray(entry.annotations)
  );
}
