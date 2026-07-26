/**
 * ProseMirror plugin: map annotation thread ranges through transactions.
 * Does NOT full-text search on every keystroke.
 */
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { mapAnchorRange } from './annotation-anchor.js';

export const annotationAnchorKey = new PluginKey('annotation-anchors');

/**
 * @param {object} opts
 * @param {() => Array} opts.getThreads - live threads with threadId + range
 * @param {(patches: Array) => void} [opts.onAnchorsChanged]
 */
export function createAnnotationAnchorPlugin(opts = {}) {
  const getThreads = typeof opts.getThreads === 'function' ? opts.getThreads : () => [];
  const onAnchorsChanged = typeof opts.onAnchorsChanged === 'function' ? opts.onAnchorsChanged : null;

  return new Plugin({
    key: annotationAnchorKey,
    state: {
      init() {
        return { byId: new Map(), gen: 0 };
      },
      apply(tr, prev, _oldState, newState) {
        // Explicit reseat from loader
        const reset = tr.getMeta(annotationAnchorKey);
        if (reset && reset.reset) {
          const byId = new Map();
          for (const t of reset.threads || getThreads() || []) {
            if (!t || !t.threadId || !t.range) continue;
            byId.set(t.threadId, {
              threadId: t.threadId,
              from: t.range.from,
              to: t.range.to,
              startAssoc: (t.anchor && t.anchor.position && t.anchor.position.startAssoc) || 1,
              endAssoc: (t.anchor && t.anchor.position && t.anchor.position.endAssoc) || -1,
              status: (t.anchor && t.anchor.status) || 'attached'
            });
          }
          return { byId, gen: prev.gen + 1 };
        }

        if (!tr.docChanged) return prev;

        const byId = new Map();
        const patches = [];
        const source = prev.byId.size ? prev.byId : seedFromThreads(getThreads());

        for (const [tid, anc] of source) {
          const mapped = mapAnchorRange(
            {
              from: anc.from,
              to: anc.to,
              startAssoc: anc.startAssoc != null ? anc.startAssoc : 1,
              endAssoc: anc.endAssoc != null ? anc.endAssoc : -1
            },
            tr.mapping
          );
          if (mapped.status === 'orphaned' || !mapped.range) {
            const next = { ...anc, status: 'orphaned', from: anc.from, to: anc.to };
            byId.set(tid, next);
            patches.push({ threadId: tid, status: 'orphaned', range: null });
            continue;
          }
          const next = {
            ...anc,
            from: mapped.range.from,
            to: mapped.range.to,
            status: mapped.status === 'moved' ? 'moved' : (anc.status || 'attached')
          };
          byId.set(tid, next);
          if (anc.from !== next.from || anc.to !== next.to) {
            patches.push({
              threadId: tid,
              status: next.status,
              range: { from: next.from, to: next.to }
            });
          }
        }

        // Merge any new threads that appeared in State but not in map
        for (const t of getThreads() || []) {
          if (!t || !t.threadId || !t.range) continue;
          if (byId.has(t.threadId)) continue;
          byId.set(t.threadId, {
            threadId: t.threadId,
            from: t.range.from,
            to: t.range.to,
            startAssoc: 1,
            endAssoc: -1,
            status: 'attached'
          });
        }

        const sourceDoc = newState && newState.doc;
        if (patches.length && onAnchorsChanged && sourceDoc) {
          // Defer to avoid nested dispatch during apply. Pass the immutable doc
          // snapshot instead of EditorState: Editor mutates its state reference
          // after dispatch, which otherwise makes stale callbacks look current.
          queueMicrotask(() => {
            try {
              onAnchorsChanged(patches, sourceDoc);
            } catch (e) {
              console.warn('[annotation-anchor-plugin] onAnchorsChanged', e);
            }
          });
        }

        return { byId, gen: prev.gen + 1 };
      }
    }
  });
}

function seedFromThreads(threads) {
  const byId = new Map();
  for (const t of threads || []) {
    if (!t || !t.threadId || !t.range) continue;
    byId.set(t.threadId, {
      threadId: t.threadId,
      from: t.range.from,
      to: t.range.to,
      startAssoc: 1,
      endAssoc: -1,
      status: (t.anchor && t.anchor.status) || 'attached'
    });
  }
  return byId;
}

export function setAnnotationAnchorResetMeta(tr, threads) {
  return tr.setMeta(annotationAnchorKey, { reset: true, threads: threads || [] });
}

export function getAnnotationAnchorState(state) {
  return annotationAnchorKey.getState(state);
}

/**
 * Safe full-document content replace with anchor reattach.
 * snapshot: [{ threadId, text, prefix, suffix, ...thread fields }]
 * resolvePlain: (plainText, anchor) => { status, range: {from,to}|null } using plain offsets
 * plainToPm: (doc, plainFrom, plainTo) => {from,to}|null
 */
export function planContentReplace({ snapshot, plainText, resolveSet }) {
  const threads = Array.isArray(snapshot) ? snapshot : [];
  const result = typeof resolveSet === 'function'
    ? resolveSet(plainText, threads)
    : { attached: [], ambiguous: [], orphaned: [], collisions: [] };
  return result;
}
