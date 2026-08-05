/**
 * unit: range-only mdRange anchors (no quote fallback)
 */
import assert from 'assert';
import {
  stampThreadMdRange,
  stampSidecarMdRanges,
  validateThreadMdRange,
  pmRangeFromMdRange,
  contentMdRevision,
  ANCHOR_MODE_RANGE
} from '../modules/md-range.js';

function ok(m) { console.log('ok', m); }

{
  const md = 'Hello alpha world.\nHello beta world.\n';
  const th = { threadId: 't1', text: 'alpha' };
  assert.strictEqual(stampThreadMdRange(th, md), true);
  assert.deepStrictEqual(th.mdRange, { from: 6, to: 11 });
  assert.strictEqual(validateThreadMdRange(th, md).ok, true);
  ok('unique stamp');
}

{
  const md = 'foo bar foo';
  const th = { threadId: 't2', text: 'foo' };
  assert.strictEqual(stampThreadMdRange(th, md), false);
  assert.ok(!th.mdRange);
  ok('non-unique fails closed');
}

{
  const md = 'aaa p\\_adj = .19) bbb';
  const th = { threadId: 't3', text: 'p\\_adj = .19)' };
  assert.strictEqual(stampThreadMdRange(th, md), true);
  const v = validateThreadMdRange(th, md);
  assert.strictEqual(v.ok, true);
  ok('escaped literal');
}

{
  const sc = {
    annotations: [
      { threadId: 'a', text: 'only-one' },
      { threadId: 'b', text: 'dup' },
    ]
  };
  const md = 'x only-one y dup z dup';
  const r = stampSidecarMdRanges(sc, md);
  assert.strictEqual(sc.anchorMode, ANCHOR_MODE_RANGE);
  assert.strictEqual(r.stamped, 1);
  assert.strictEqual(r.failed, 1);
  assert.ok(sc.annotations[0].mdRange);
  assert.strictEqual(sc.annotations[1].invalidReason, 'missing-mdRange');
  ok('sidecar stamp + orphan');
}

{
  assert.ok(contentMdRevision('abc').length >= 8);
  ok('revision');
}

// pmRangeFromMdRange needs a minimal PM-like doc mock
{
  const textNodes = [{ pos: 1, text: 'Hello alpha world' }];
  const full = 'Hello alpha world';
  const doc = {
    content: { size: full.length + 2 },
    textBetween(from, to) {
      // approximate: treat doc positions as plain+1
      const a = Math.max(0, from - 1);
      const b = Math.max(a, to - 1);
      return full.slice(a, Math.min(full.length, b));
    }
  };
  // Our posAtOffset binary search uses textBetween(0, mid) length — mock carefully
  const md = 'Hello alpha world';
  const th = { text: 'alpha' };
  stampThreadMdRange(th, md);
  // Build a better mock: positions 0..n map 1:1 with offset pad
  const plain = md;
  const doc2 = {
    content: { size: plain.length },
    textBetween(from, to, sep) {
      return plain.slice(from, to);
    }
  };
  const pm = pmRangeFromMdRange(doc2, md, th.mdRange, ' ');
  assert.ok(pm);
  assert.strictEqual(plain.slice(pm.from, pm.to), 'alpha');
  ok('pm map unique');
}

console.log('PASS unit-md-range');

{
  // PM plain quote must stamp against turndown CommonMark escapes
  const md = 'head UNIQUEPHRASE\_FOR\_NEW\_ANN\_ZZZ tail';
  const th = { threadId: 'esc1', text: 'UNIQUEPHRASE_FOR_NEW_ANN_ZZZ', anchor: { status: 'attached' } };
  assert.strictEqual(stampThreadMdRange(th, md), true);
  assert.ok(th.mdRange);
  assert.strictEqual(th.anchor.status, 'attached');
  // UI text stays plain
  assert.strictEqual(th.text, 'UNIQUEPHRASE_FOR_NEW_ANN_ZZZ');
  ok('PM plain vs escaped underscore');
}

{
  // Live stamp miss must not poison when poisonOnFail:false
  const sc = { annotations: [{ threadId: 'live1', text: 'no-such-quote-zzz', anchor: { status: 'attached', confidence: 1 } }] };
  const r = stampSidecarMdRanges(sc, 'hello world', { poisonOnFail: false });
  assert.strictEqual(r.failed, 1);
  assert.strictEqual(sc.annotations[0].anchor.status, 'attached');
  assert.ok(!sc.annotations[0].invalid);
  ok('poisonOnFail false keeps attached');
}
