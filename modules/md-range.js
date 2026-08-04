/**
 * Markdown character-range anchors (Word-style durable coordinates).
 *
 * Contract (no quote fallback):
 * - Canonical disk anchor = thread.mdRange {from,to} into content.md
 * - quote text/prefix/suffix are DERIVED projections of the range, not the locator
 * - missing/invalid mdRange => orphan (do not fuzzy-search)
 */
import { mdEmphasisToPlain, findOccurrences } from './annotation-anchor.js';

export const ANCHOR_MODE_RANGE = 'range';

export function isMdRange(r) {
  return !!(
    r &&
    typeof r.from === 'number' &&
    typeof r.to === 'number' &&
    Number.isFinite(r.from) &&
    Number.isFinite(r.to) &&
    r.from >= 0 &&
    r.to > r.from
  );
}

export function sliceMdRange(md, r) {
  if (!isMdRange(r) || typeof md !== 'string') return null;
  if (r.to > md.length) return null;
  return md.slice(r.from, r.to);
}

/** Validate thread.mdRange against content.md. Strict: slice must equal thread.text. */
export function validateThreadMdRange(thread, md) {
  if (!thread || typeof md !== 'string') {
    return { ok: false, reason: 'missing' };
  }
  if (isImageOnlyThread(thread)) {
    return { ok: true, reason: 'image' };
  }
  const r = thread.mdRange;
  if (!isMdRange(r)) return { ok: false, reason: 'missing-mdRange' };
  if (r.to > md.length) return { ok: false, reason: 'mdRange-oob' };
  const slice = md.slice(r.from, r.to);
  const text = thread.text != null ? String(thread.text) : '';
  if (slice === text) {
    return { ok: true, reason: 'ok', slice };
  }
  // PM plain vs md escapes/emphasis (_p_ / p\_adj) — same anchor, not drift
  const plainSlice = mdEmphasisToPlain(slice);
  const plainText = mdEmphasisToPlain(text);
  if (plainSlice === text || plainSlice === plainText || slice === plainText) {
    return { ok: true, reason: 'ok-plain', slice, text };
  }
  return { ok: false, reason: 'mdRange-text-mismatch', slice, text };
}

function isImageOnlyThread(th) {
  if (!th) return false;
  const t = String(th.text || '').trim();
  if (/^\[图片\]$/i.test(t) || /^\[image\]$/i.test(t)) return true;
  return Array.isArray(th.imageAnchors) && th.imageAnchors.length > 0 && (!th.ranges || !th.ranges.length);
}

/**
 * Stamp mdRange from an exact unique occurrence of thread.text in md.
 * No multi-candidate scoring. Non-unique or missing => clear mdRange + return false.
 */
export function stampThreadMdRange(thread, md, contextChars = 40) {
  if (!thread || typeof md !== 'string') return false;
  if (isImageOnlyThread(thread)) return true;
  const text = thread.text != null ? String(thread.text) : '';
  if (!text) {
    delete thread.mdRange;
    return false;
  }
  // Prefer existing valid range
  const cur = validateThreadMdRange(thread, md);
  if (cur.ok && (cur.reason === 'ok' || cur.reason === 'ok-plain')) {
    // Disk quote = md slice (canonical); UI may have held PM plain temporarily
    projectQuoteFromMdRange(thread, md, contextChars);
    return true;
  }
  const hits = findOccurrences(md, text);
  if (hits.length !== 1) {
    delete thread.mdRange;
    return false;
  }
  const from = hits[0];
  const to = from + text.length;
  thread.mdRange = { from, to };
  projectQuoteFromMdRange(thread, md, contextChars);
  return true;
}

export function projectQuoteFromMdRange(thread, md, contextChars = 40) {
  if (!thread || !isMdRange(thread.mdRange) || typeof md !== 'string') return;
  const { from, to } = thread.mdRange;
  if (to > md.length) return;
  const exact = md.slice(from, to);
  thread.text = exact;
  const p0 = Math.max(0, from - contextChars);
  const s1 = Math.min(md.length, to + contextChars);
  thread.prefix = md.slice(p0, from);
  thread.suffix = md.slice(to, s1);
  if (!thread.anchor || typeof thread.anchor !== 'object') {
    thread.anchor = { version: '1' };
  }
  thread.anchor.quote = {
    exact,
    prefix: thread.prefix,
    suffix: thread.suffix
  };
  thread.anchor.status = thread.anchor.status === 'orphaned' ? 'orphaned' : 'attached';
  if (thread.anchor.status === 'attached') {
    thread.invalid = false;
    thread.deleted = false;
    thread.fuzzy = false;
    delete thread.invalidReason;
  }
}

/**
 * Stamp every text thread. Sets sidecar.anchorMode = 'range' and contentMdSha256 if provided.
 * @returns {{ stamped:number, failed:number, failedIds:string[] }}
 */
export function stampSidecarMdRanges(sidecar, md, opts = {}) {
  const contextChars = opts.contextChars != null ? opts.contextChars : 40;
  // Accept full sidecar {annotations:[...]} OR a bare annotations array (save helpers).
  const anns = Array.isArray(sidecar)
    ? sidecar
    : (sidecar && Array.isArray(sidecar.annotations) ? sidecar.annotations : []);
  let stamped = 0;
  let failed = 0;
  const failedIds = [];
  for (const th of anns) {
    if (!th || typeof th !== 'object') continue;
    if (isImageOnlyThread(th)) {
      stamped += 1;
      continue;
    }
    if (stampThreadMdRange(th, md, contextChars)) stamped += 1;
    else {
      failed += 1;
      if (th.threadId) failedIds.push(String(th.threadId));
      // range mode: fail closed
      th.invalid = true;
      th.deleted = false;
      th.fuzzy = false;
      th.invalidReason = th.invalidReason || 'missing-mdRange';
      if (th.anchor && typeof th.anchor === 'object') {
        th.anchor = { ...th.anchor, status: 'orphaned', confidence: 0 };
      }
    }
  }
  if (sidecar && typeof sidecar === 'object') {
    sidecar.anchorMode = ANCHOR_MODE_RANGE;
    if (opts.contentMdSha256) sidecar.contentMdSha256 = opts.contentMdSha256;
    sidecar.updatedAt = sidecar.updatedAt || new Date().toISOString();
  }
  return { stamped, failed, failedIds };
}

/**
 * Resolve PM {from,to} from mdRange only.
 * Uses plain projection of the md slice; if multiple plain hits, require unique
 * neighbor match against md neighbors — else null (orphan). No fuzzy score race.
 */
export function pmRangeFromMdRange(doc, md, mdRange, sep = ' ') {
  if (!doc || typeof md !== 'string' || !isMdRange(mdRange)) return null;
  if (mdRange.to > md.length) return null;
  const exact = md.slice(mdRange.from, mdRange.to);
  if (!exact) return null;
  const needle = mdEmphasisToPlain(exact) || exact;
  const plain = doc.textBetween(0, doc.content.size, sep, sep);
  let hits = findOccurrences(plain, needle);
  if (!hits.length && needle !== exact) {
    hits = findOccurrences(plain, exact);
  }
  if (!hits.length) return null;

  let chosen = null;
  if (hits.length === 1) {
    chosen = hits[0];
  } else {
    const mdPfx = mdEmphasisToPlain(md.slice(Math.max(0, mdRange.from - 40), mdRange.from));
    const mdSfx = mdEmphasisToPlain(md.slice(mdRange.to, Math.min(md.length, mdRange.to + 40)));
    const pTail = mdPfx.slice(-Math.min(24, mdPfx.length));
    const sHead = mdSfx.slice(0, Math.min(24, mdSfx.length));
    const ok = [];
    for (const h of hits) {
      const lp = plain.slice(Math.max(0, h - 40), h);
      const ls = plain.slice(h + needle.length, h + needle.length + 40);
      const prefOk = !pTail || lp.endsWith(pTail);
      const sufOk = !sHead || ls.startsWith(sHead);
      if (prefOk && sufOk) ok.push(h);
    }
    if (ok.length !== 1) return null;
    chosen = ok[0];
  }

  const posAtOffset = (offset) => {
    if (offset <= 0) return 0;
    let lo = 0;
    let hi = doc.content.size;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const len = doc.textBetween(0, mid, sep).length;
      if (len < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const from = posAtOffset(chosen);
  const to = posAtOffset(chosen + needle.length);
  if (!(from < to)) return null;
  return { from, to, exact, plain: needle };
}

/** Simple sync sha256 via Web Crypto not available sync — use FNV-1a 64 hex for cheap revision tag. */
export function contentMdRevision(md) {
  const s = String(md || '');
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
