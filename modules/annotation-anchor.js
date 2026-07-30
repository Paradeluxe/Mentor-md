/**
 * Annotation anchor engine — pure functions only.
 * Single source of truth for quote resolution, mapping, set assignment, invariants.
 * No DOM / no State / no Tiptap.
 */

import { coalesceAnnotationMarkPieces } from './annotations.js';

const DEFAULT_CONTEXT = 40;
const SCORE_GAP_MIN = 1;
const ATTACHED_MIN_SCORE = 1;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Overlapping occurrence offsets of `exact` inside `text`. */
export function findOccurrences(text, exact) {
  if (!text || !exact) return [];
  const out = [];
  let start = 0;
  while (start < text.length) {
    const idx = text.indexOf(exact, start);
    if (idx === -1) break;
    out.push(idx);
    start = idx + 1;
  }
  return out;
}

function localContext(doc, from, to, maxLen = DEFAULT_CONTEXT) {
  const preFrom = Math.max(0, from - maxLen);
  const sufTo = Math.min(doc.length, to + maxLen);
  return {
    localPrefix: doc.slice(preFrom, from),
    localSuffix: doc.slice(to, sufTo)
  };
}

/**
 * Score one candidate against anchor quote/context.
 * Returns { score, exactQuote, prefixScore, suffixScore }.
 */
export function scoreCandidate(doc, candidate, anchor) {
  const text = (anchor && (anchor.text || (anchor.quote && anchor.quote.exact))) || '';
  const prefix = (anchor && (anchor.prefix != null ? anchor.prefix : (anchor.quote && anchor.quote.prefix))) || '';
  const suffix = (anchor && (anchor.suffix != null ? anchor.suffix : (anchor.quote && anchor.quote.suffix))) || '';
  const exact = candidate.exact != null ? candidate.exact : (doc && candidate.from != null ? doc.slice(candidate.from, candidate.to) : '');
  const localPrefix = candidate.localPrefix != null
    ? candidate.localPrefix
    : (doc ? localContext(doc, candidate.from, candidate.to).localPrefix : '');
  const localSuffix = candidate.localSuffix != null
    ? candidate.localSuffix
    : (doc ? localContext(doc, candidate.from, candidate.to).localSuffix : '');

  let score = 0;
  const exactQuote = !!(text && exact === text);
  if (exactQuote) score += 100 + text.length;

  let prefixScore = 0;
  if (prefix) {
    if (localPrefix.endsWith(prefix)) {
      prefixScore = 100 + prefix.length;
    } else if (prefix.length >= 2 && localPrefix.endsWith(prefix.slice(-Math.min(prefix.length, 12)))) {
      prefixScore = 40;
    } else if (prefix.length >= 4 && localPrefix.includes(prefix.slice(-8))) {
      prefixScore = 15;
    }
  }
  score += prefixScore;

  let suffixScore = 0;
  if (suffix) {
    if (localSuffix.startsWith(suffix)) {
      suffixScore = 100 + suffix.length;
    } else if (suffix.length >= 2 && localSuffix.startsWith(suffix.slice(0, Math.min(suffix.length, 12)))) {
      suffixScore = 40;
    } else if (suffix.length >= 4 && localSuffix.includes(suffix.slice(0, 8))) {
      suffixScore = 15;
    }
  }
  score += suffixScore;

  // Prefer closer to previous position when provided
  if (anchor && anchor.position && typeof anchor.position.from === 'number' && typeof candidate.from === 'number') {
    const dist = Math.abs(candidate.from - anchor.position.from);
    score += Math.max(0, 20 - Math.min(20, Math.floor(dist / 20)));
  }

  return { score, exactQuote, prefixScore, suffixScore };
}

function normalizeAnchorInput(anchor) {
  if (!anchor || typeof anchor !== 'object') return { text: '', prefix: '', suffix: '' };
  if (anchor.quote && typeof anchor.quote === 'object') {
    return {
      text: anchor.quote.exact || anchor.text || '',
      prefix: anchor.quote.prefix != null ? anchor.quote.prefix : (anchor.prefix || ''),
      suffix: anchor.quote.suffix != null ? anchor.quote.suffix : (anchor.suffix || ''),
      position: anchor.position || anchor.range || null,
      structure: anchor.structure || null
    };
  }
  return {
    text: anchor.text || '',
    prefix: anchor.prefix || '',
    suffix: anchor.suffix || '',
    position: anchor.position || anchor.range || null,
    structure: anchor.structure || null
  };
}

function buildCandidates(doc, norm) {
  const text = norm.text || '';
  if (!text || !doc) return [];
  const offs = findOccurrences(doc, text);
  return offs.map((from) => {
    const to = from + text.length;
    const ctx = localContext(doc, from, to);
    return {
      from,
      to,
      exact: text,
      localPrefix: ctx.localPrefix,
      localSuffix: ctx.localSuffix
    };
  });
}

/**
 * Resolve a single anchor against a plain-text document.
 * Never auto-picks first duplicate when ambiguous.
 */
export function resolveAnchor(doc, anchor, options = {}) {
  const norm = normalizeAnchorInput(anchor);
  const minScore = options.minScore != null ? options.minScore : ATTACHED_MIN_SCORE;
  const gapMin = options.scoreGapMin != null ? options.scoreGapMin : SCORE_GAP_MIN;

  if (!norm.text) {
    return { status: 'orphaned', range: null, score: 0, candidates: [] };
  }

  const candidates = buildCandidates(doc, norm);
  if (!candidates.length) {
    return { status: 'orphaned', range: null, score: 0, candidates: [] };
  }

  const scored = candidates.map((c) => {
    const s = scoreCandidate(doc, c, norm);
    return {
      ...c,
      score: s.score,
      exactQuote: s.exactQuote,
      prefixScore: s.prefixScore,
      suffixScore: s.suffixScore
    };
  }).sort((a, b) => b.score - a.score || a.from - b.from);

  // Unique exact quote without needing context
  if (scored.length === 1 && scored[0].exactQuote) {
    const best = scored[0];
    return {
      status: 'attached',
      range: { from: best.from, to: best.to },
      score: best.score,
      candidates: scored,
      confidence: 1
    };
  }

  const best = scored[0];
  const second = scored[1];
  const contextStrength = (c) => (c && ((c.prefixScore || 0) + (c.suffixScore || 0))) || 0;
  // Boundary match (>=40) is real evidence. Includes-only (15) + stale position
  // must not auto-pick among duplicates — that is silent mis-attach.
  const STRONG_CONTEXT = 40;

  // Multiple identical contexts / scores → ambiguous (never first-hit)
  if (second && second.score === best.score) {
    return { status: 'ambiguous', range: null, score: best.score, candidates: scored };
  }
  if (second && best.score - second.score < gapMin) {
    return { status: 'ambiguous', range: null, score: best.score, candidates: scored };
  }

  if (scored.length > 1) {
    const bestCtx = contextStrength(best);
    if (bestCtx < STRONG_CONTEXT) {
      return { status: 'ambiguous', range: null, score: best.score, candidates: scored };
    }
  }

  if (best.score < minScore && scored.length > 1) {
    return { status: 'ambiguous', range: null, score: best.score, candidates: scored };
  }

  return {
    status: 'attached',
    range: { from: best.from, to: best.to },
    score: best.score,
    candidates: scored,
    confidence: second ? clamp((best.score - second.score) / Math.max(1, best.score), 0, 1) : 1
  };
}

/**
 * Map an anchor range through a ProseMirror-like mapping.
 * mapping.mapResult(pos, assoc) -> { pos, deleted?, deletedAcross? }
 */
export function mapAnchorRange(range, mapping, options = {}) {
  if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') {
    return { status: 'orphaned', range: null };
  }
  if (!mapping || typeof mapping.mapResult !== 'function') {
    return {
      status: 'attached',
      range: { from: range.from, to: range.to },
      startAssoc: range.startAssoc != null ? range.startAssoc : 1,
      endAssoc: range.endAssoc != null ? range.endAssoc : -1
    };
  }
  const startAssoc = range.startAssoc != null ? range.startAssoc : (options.startAssoc != null ? options.startAssoc : 1);
  const endAssoc = range.endAssoc != null ? range.endAssoc : (options.endAssoc != null ? options.endAssoc : -1);
  const start = mapping.mapResult(range.from, startAssoc);
  const end = mapping.mapResult(range.to, endAssoc);

  const startGone = !!(start.deletedAcross || (start.deleted && end.deletedAcross));
  const endGone = !!(end.deletedAcross || (end.deleted && start.deletedAcross));
  if (start.deletedAcross || end.deletedAcross || (start.deleted && end.deleted)) {
    return { status: 'orphaned', range: null, start, end };
  }
  if (startGone || endGone) {
    return { status: 'orphaned', range: null, start, end };
  }

  let from = start.pos;
  let to = end.pos;
  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  if (from === to) {
    // Collapsed — treat as orphaned unless options allow empty
    if (!options.allowEmpty) {
      return { status: 'orphaned', range: null, start, end };
    }
  }
  return {
    status: 'moved',
    range: { from, to },
    startAssoc,
    endAssoc,
    start,
    end
  };
}

/**
 * Global one-to-one assignment for multiple anchors.
 * Competing equal candidates → ambiguous/collision, never silent steal.
 */
export function resolveAnchorSet(doc, anchors, options = {}) {
  const list = Array.isArray(anchors) ? anchors : [];
  const attached = [];
  const ambiguous = [];
  const orphaned = [];
  const collisions = [];

  // Build per-thread scored candidates
  const jobs = list.map((a, idx) => {
    const threadId = a.threadId || a.id || `idx-${idx}`;
    const norm = normalizeAnchorInput(a);
    const resolved = resolveAnchor(doc, { ...norm, position: a.position || a.range || norm.position }, options);
    return {
      threadId,
      anchor: a,
      norm,
      resolved,
      candidates: (resolved.candidates || []).map((c) => ({ ...c, threadId }))
    };
  });

  // First pass: unique attached with no competition
  const occupied = new Map(); // key from-to -> threadId
  const rangeKey = (from, to) => `${from}:${to}`;

  // Sort jobs by best score desc so stronger claims pick first
  const ordered = jobs.slice().sort((a, b) => {
    const sa = a.resolved.score || 0;
    const sb = b.resolved.score || 0;
    return sb - sa;
  });

  // Detect identical best candidates among multiple threads
  const claimCount = new Map();
  for (const job of ordered) {
    if (job.resolved.status !== 'attached' || !job.resolved.range) continue;
    const k = rangeKey(job.resolved.range.from, job.resolved.range.to);
    claimCount.set(k, (claimCount.get(k) || 0) + 1);
  }

  for (const job of ordered) {
    if (job.resolved.status === 'orphaned') {
      orphaned.push({ threadId: job.threadId, reason: 'no-candidate' });
      continue;
    }
    if (job.resolved.status === 'ambiguous' || !job.resolved.range) {
      ambiguous.push({ threadId: job.threadId, candidates: job.candidates });
      continue;
    }
    const k = rangeKey(job.resolved.range.from, job.resolved.range.to);
    if ((claimCount.get(k) || 0) > 1) {
      collisions.push({ threadId: job.threadId, range: job.resolved.range, reason: 'shared-best' });
      continue;
    }
    if (occupied.has(k)) {
      collisions.push({ threadId: job.threadId, range: job.resolved.range, reason: 'occupied', by: occupied.get(k) });
      continue;
    }
    occupied.set(k, job.threadId);
    attached.push({
      threadId: job.threadId,
      range: job.resolved.range,
      score: job.resolved.score,
      status: 'attached'
    });
  }

  // Threads that collided: if they still have unique alternate candidates, try assign
  // Keep strict: collisions stay collisions (no quiet steal of second-best)
  return { attached, ambiguous, orphaned, collisions };
}

/**
 * Capture multi-evidence anchor from plain text offsets.
 * For PM docs, callers may pass richer structure via options.structure.
 */
export function captureAnchorEvidence(doc, from, to, options = {}) {
  const maxContext = options.maxContext != null ? options.maxContext : DEFAULT_CONTEXT;
  const safeFrom = clamp(from | 0, 0, doc ? doc.length : 0);
  const safeTo = clamp(to | 0, safeFrom, doc ? doc.length : 0);
  const exact = doc ? doc.slice(safeFrom, safeTo) : '';
  const ctx = doc ? localContext(doc, safeFrom, safeTo, maxContext) : { localPrefix: '', localSuffix: '' };
  const now = options.now || new Date().toISOString();
  const structure = options.structure || {
    blockPath: options.blockPath || [],
    blockType: options.blockType || 'text',
    blockFingerprint: options.blockFingerprint || simpleFingerprint(exact + '|' + ctx.localPrefix + '|' + ctx.localSuffix),
    offsetInBlock: options.offsetInBlock != null ? options.offsetInBlock : safeFrom
  };
  return {
    version: '1',
    quote: {
      exact,
      prefix: ctx.localPrefix,
      suffix: ctx.localSuffix
    },
    position: {
      from: safeFrom,
      to: safeTo,
      startAssoc: options.startAssoc != null ? options.startAssoc : 1,
      endAssoc: options.endAssoc != null ? options.endAssoc : -1
    },
    structure,
    status: exact ? 'attached' : 'orphaned',
    confidence: exact ? 1 : 0,
    updatedAt: now
  };
}

function simpleFingerprint(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'fnv1a:' + (h >>> 0).toString(16);
}

/** Project new status onto v1 legacy flags. */
export function projectLegacyFlags(status) {
  switch (status) {
    case 'attached':
    case 'moved':
      return { fuzzy: false, invalid: false, deleted: false, invalidReason: undefined };
    case 'edited':
      return { fuzzy: true, invalid: false, deleted: false, invalidReason: 'text-edited' };
    case 'orphaned':
      return { fuzzy: false, invalid: true, deleted: true, invalidReason: 'orphaned' };
    case 'ambiguous':
      return { fuzzy: true, invalid: true, deleted: false, invalidReason: 'ambiguous' };
    case 'collision':
      return { fuzzy: true, invalid: true, deleted: false, invalidReason: 'mark-collision' };
    case 'image-missing':
      return { fuzzy: false, invalid: true, deleted: true, invalidReason: 'image-deleted' };
    default:
      return { fuzzy: false, invalid: false, deleted: false, invalidReason: undefined };
  }
}

/**
 * Audit threads vs live marks vs document text.
 * marks: [{ threadId, from, to, text }] — physical pieces or logical ranges.
 * Physical ProseMirror fragments from nested/overlapping annotations are
 * coalesced per threadId before duplicate/range checks.
 */
export function auditAnnotationInvariants({ threads, marks, doc }) {
  const errors = [];
  const thrList = Array.isArray(threads) ? threads.filter((t) => t && t.threadId) : [];
  const markList = Array.isArray(marks) ? marks.filter((m) => m && m.threadId) : [];
  const logicalMarks = coalesceAnnotationMarkPieces(markList);

  const seenIds = new Set();
  for (const t of thrList) {
    if (seenIds.has(t.threadId)) {
      errors.push({ code: 'duplicate-threadId', threadId: t.threadId });
    }
    seenIds.add(t.threadId);
  }

  for (const m of markList) {
    if (!seenIds.has(m.threadId)) {
      errors.push({ code: 'mark-unknown-thread', threadId: m.threadId });
    }
  }

  const marksByTid = new Map();
  for (const m of logicalMarks) {
    if (!marksByTid.has(m.threadId)) marksByTid.set(m.threadId, []);
    marksByTid.get(m.threadId).push(m);
  }

  for (const [tid, ms] of marksByTid) {
    if (ms.length > 1) {
      // Allow multi-range only if thread.ranges length matches; else flag
      const thr = thrList.find((t) => t.threadId === tid);
      const multiOk = thr && Array.isArray(thr.ranges) && thr.ranges.length > 1;
      if (!multiOk) {
        errors.push({ code: 'duplicate-mark', threadId: tid, count: ms.length });
      }
    }
  }

  for (const t of thrList) {
    const status = (t.anchor && t.anchor.status) || (t.deleted ? 'orphaned' : (t.fuzzy ? 'ambiguous' : 'attached'));
    const ms = marksByTid.get(t.threadId) || [];
    const isMultiRange = Array.isArray(t.ranges) && t.ranges.length > 1;
    const liveMark = (() => {
      if (!ms.length) return null;
      if (!isMultiRange) return ms[0];
      const ordered = ms.slice().sort((a, b) => a.from - b.from || a.to - b.to);
      return {
        from: ordered[0].from,
        to: ordered[ordered.length - 1].to,
        text: ordered.map((m) => m.text || '').join(' ')
      };
    })();
    const isImageOnly = Array.isArray(t.imageAnchors) && t.imageAnchors.length && (!t.ranges || !t.ranges.length) &&
      (/^\[图片\]$/i.test(String(t.text || '').trim()) || t.skipMark);

    if (status === 'ambiguous' && ms.length) {
      errors.push({ code: 'ambiguous-has-mark', threadId: t.threadId });
    }
    if ((status === 'orphaned' || status === 'collision') && ms.length && !isImageOnly) {
      errors.push({ code: 'orphan-status-has-mark', threadId: t.threadId, status });
    }
    if ((status === 'attached' || status === 'moved' || status === 'edited') && !isImageOnly) {
      if (!ms.length) {
        errors.push({ code: 'attached-missing-mark', threadId: t.threadId });
      } else {
        const m = liveMark;
        if (t.range && (t.range.from !== m.from || t.range.to !== m.to)) {
          errors.push({ code: 'range-mismatch', threadId: t.threadId, range: t.range, mark: { from: m.from, to: m.to } });
        }
        if (t.text != null && m.text != null && t.text !== m.text && status !== 'edited') {
          errors.push({ code: 'text-mismatch', threadId: t.threadId, text: t.text, markText: m.text });
        }
        if (doc && m.from != null && m.to != null && doc.slice) {
          const slice = doc.slice(m.from, m.to);
          if (m.text != null && slice !== m.text && !doc.includes(m.text)) {
            // soft: plain-text docs may use different separators than PM
          }
        }
      }
    }
  }

  // Overlapping comments are supported. Only flag an exact range collision when
  // either thread is already unresolved; two healthy attached threads may
  // intentionally share/nest the same text.
  const sorted = logicalMarks.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const statusByTid = new Map(thrList.map((t) => [t.threadId, (t.anchor && t.anchor.status) || (t.deleted ? 'orphaned' : (t.fuzzy ? 'ambiguous' : 'attached'))]));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.from >= a.to) break;
      if (a.threadId === b.threadId || a.from !== b.from || a.to !== b.to) continue;
      const aStatus = statusByTid.get(a.threadId);
      const bStatus = statusByTid.get(b.threadId);
      const healthy = new Set(['attached', 'moved', 'edited']);
      if (!healthy.has(aStatus) || !healthy.has(bStatus)) {
        errors.push({ code: 'mark-collision', a: a.threadId, b: b.threadId });
      }
    }
  }

  return {
    healthy: errors.length === 0,
    errors,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Apply legacy flags onto a thread from anchor status (mutates copy).
 */
export function applyStatusToThread(thread, status) {
  const flags = projectLegacyFlags(status);
  const next = { ...thread, ...flags };
  if (next.anchor && typeof next.anchor === 'object') {
    next.anchor = { ...next.anchor, status, updatedAt: new Date().toISOString() };
  }
  return next;
}

export default {
  findOccurrences,
  scoreCandidate,
  resolveAnchor,
  mapAnchorRange,
  resolveAnchorSet,
  captureAnchorEvidence,
  projectLegacyFlags,
  auditAnnotationInvariants,
  applyStatusToThread
};
