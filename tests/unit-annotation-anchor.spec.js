/**
 * Pure unit tests for modules/annotation-anchor.js
 * No browser — Node ESM import only.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'annotation-anchor-cases.json');

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log('  ✓', name);
    pass++;
  } catch (e) {
    console.log('  ✗', name + ':', e && e.message ? e.message : e);
    fail++;
  }
};

(async () => {
  console.log('=== unit-annotation-anchor ===');

  await t('module exports exist', async () => {
    const mod = await import(pathToFileURL(path.join(ROOT, 'modules/annotation-anchor.js')).href);
    assert.equal(typeof mod.findOccurrences, 'function');
    assert.equal(typeof mod.scoreCandidate, 'function');
    assert.equal(typeof mod.resolveAnchor, 'function');
    assert.equal(typeof mod.mapAnchorRange, 'function');
    assert.equal(typeof mod.resolveAnchorSet, 'function');
    assert.equal(typeof mod.auditAnnotationInvariants, 'function');
    assert.equal(typeof mod.captureAnchorEvidence, 'function');
    assert.equal(typeof mod.projectLegacyFlags, 'function');
  });

  const mod = await import(pathToFileURL(path.join(ROOT, 'modules/annotation-anchor.js')).href).catch(() => null);
  if (!mod) {
    console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail (module missing) ===');
    process.exit(1);
  }

  await t('findOccurrences overlapping', async () => {
    assert.deepStrictEqual(mod.findOccurrences('aaaa', 'aa'), [0, 1, 2]);
    assert.deepStrictEqual(mod.findOccurrences('abc', 'z'), []);
    assert.deepStrictEqual(mod.findOccurrences('', 'a'), []);
    assert.deepStrictEqual(mod.findOccurrences('a', ''), []);
  });

  await t('fixture cases', async () => {
    const cases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    assert.ok(Array.isArray(cases) && cases.length >= 2, 'fixture required');
    for (const c of cases) {
      const r = mod.resolveAnchor(c.doc, c.anchor);
      assert.equal(r.status, c.expected.status, c.name + ' status');
      if (c.expected.range === null) {
        assert.equal(r.range, null, c.name + ' range null');
      }
      if (typeof c.expected.occurrence === 'number') {
        assert.ok(r.range, c.name + ' needs range');
        const offs = mod.findOccurrences(c.doc, c.anchor.text);
        assert.equal(r.range.from, offs[c.expected.occurrence], c.name + ' occurrence');
        assert.equal(r.range.to, offs[c.expected.occurrence] + c.anchor.text.length, c.name + ' end');
      }
    }
  });

  await t('scoreCandidate exact quote', async () => {
    const doc = 'HEAD unique-xyz TAIL';
    const candidate = { from: 5, to: 15, exact: 'unique-xyz', localPrefix: 'HEAD ', localSuffix: ' TAIL' };
    const anchor = { text: 'unique-xyz', prefix: 'HEAD ', suffix: ' TAIL' };
    const s = mod.scoreCandidate(doc, candidate, anchor);
    assert.equal(s.exactQuote, true);
    assert.ok(s.score >= 100);
  });

  await t('resolveAnchor ambiguous has null range', async () => {
    const r = mod.resolveAnchor('tok\n\ntok\n\ntok', { text: 'tok', prefix: '', suffix: '' });
    assert.equal(r.status, 'ambiguous');
    assert.equal(r.range, null);
  });

  await t('resolveAnchor weak includes+stale position stays ambiguous', async () => {
    const doc = 'ABCDEFGH xxx tok q\nABCDEFGH yyy tok r\nnothing here';
    const r = mod.resolveAnchor(doc, {
      text: 'tok',
      prefix: 'ZZZZABCDEFGH',
      suffix: '',
      position: { from: 56, to: 59 }
    });
    assert.equal(r.status, 'ambiguous');
    assert.equal(r.range, null);
  });

  await t('resolveAnchor strong prefix still attaches among duplicates', async () => {
    const doc = 'LEFT_A TOKEN RIGHT_A\nLEFT_B TOKEN RIGHT_B';
    const r = mod.resolveAnchor(doc, {
      text: 'TOKEN',
      prefix: 'LEFT_B ',
      suffix: ' RIGHT_B'
    });
    assert.equal(r.status, 'attached');
    assert.ok(r.range);
    assert.equal(doc.slice(r.range.from, r.range.to), 'TOKEN');
    assert.ok(doc.slice(Math.max(0, r.range.from - 7), r.range.from).includes('LEFT_B'));
  });

  await t('mapAnchorRange insert before', async () => {
    // Fake mapping: shift everything after pos 0 by +5
    const mapping = {
      mapResult(pos, assoc) {
        const deleted = false;
        const deletedAcross = false;
        return { pos: pos + 5, deleted, deletedAcross };
      }
    };
    const mapped = mod.mapAnchorRange({ from: 5, to: 10, startAssoc: 1, endAssoc: -1 }, mapping);
    assert.equal(mapped.status, 'moved');
    assert.deepStrictEqual(mapped.range, { from: 10, to: 15 });
  });

  await t('mapAnchorRange deletion orphans', async () => {
    const mapping = {
      mapResult(pos, assoc) {
        return { pos: 0, deleted: true, deletedAcross: true };
      }
    };
    const mapped = mod.mapAnchorRange({ from: 5, to: 10 }, mapping);
    assert.equal(mapped.status, 'orphaned');
    assert.equal(mapped.range, null);
  });

  await t('resolveAnchorSet one-to-one no collision steal', async () => {
    const doc = 'A same-token end\n\nB same-token end\n\nC same-token end';
    const anchors = [
      { threadId: 't1', text: 'same-token', prefix: 'A ', suffix: ' end' },
      { threadId: 't2', text: 'same-token', prefix: 'C ', suffix: ' end' }
    ];
    const r = mod.resolveAnchorSet(doc, anchors);
    assert.equal(r.attached.length, 2);
    assert.equal(r.ambiguous.length, 0);
    const froms = r.attached.map((a) => a.range.from).sort((a, b) => a - b);
    assert.notEqual(froms[0], froms[1]);
    const offs = mod.findOccurrences(doc, 'same-token');
    assert.ok(froms.includes(offs[0]));
    assert.ok(froms.includes(offs[2]));
  });

  await t('resolveAnchorSet competing same context both ambiguous', async () => {
    const doc = 'xx tok yy\n\nxx tok yy';
    const anchors = [
      { threadId: 'a', text: 'tok', prefix: 'xx ', suffix: ' yy' },
      { threadId: 'b', text: 'tok', prefix: 'xx ', suffix: ' yy' }
    ];
    const r = mod.resolveAnchorSet(doc, anchors);
    assert.equal(r.attached.length, 0);
    assert.ok(r.ambiguous.length + r.collisions.length >= 2);
  });

  await t('captureAnchorEvidence builds quote+position', async () => {
    const doc = 'HEAD unique-capture TAIL';
    const from = doc.indexOf('unique-capture');
    const to = from + 'unique-capture'.length;
    const ev = mod.captureAnchorEvidence(doc, from, to, { maxContext: 40 });
    assert.equal(ev.version, '1');
    assert.equal(ev.quote.exact, 'unique-capture');
    assert.ok(ev.quote.prefix.endsWith('HEAD ') || ev.quote.prefix.includes('HEAD'), 'prefix has HEAD');
    assert.ok(ev.quote.suffix.includes('TAIL') || ev.quote.suffix.startsWith(' '), 'suffix has TAIL');
    assert.deepStrictEqual(ev.position, { from, to, startAssoc: 1, endAssoc: -1 });
    assert.equal(ev.status, 'attached');
    assert.equal(ev.confidence, 1);
    assert.ok(ev.structure && ev.structure.blockFingerprint);
  });

  await t('projectLegacyFlags from status', async () => {
    assert.deepStrictEqual(mod.projectLegacyFlags('attached'), {
      fuzzy: false, invalid: false, deleted: false, invalidReason: undefined
    });
    assert.deepStrictEqual(mod.projectLegacyFlags('orphaned'), {
      fuzzy: false, invalid: true, deleted: true, invalidReason: 'orphaned'
    });
    assert.deepStrictEqual(mod.projectLegacyFlags('ambiguous'), {
      fuzzy: true, invalid: true, deleted: false, invalidReason: 'ambiguous'
    });
    assert.deepStrictEqual(mod.projectLegacyFlags('edited'), {
      fuzzy: true, invalid: false, deleted: false, invalidReason: 'text-edited'
    });
  });

  await t('auditAnnotationInvariants healthy', async () => {
    const doc = 'xx unique-audit yy';
    const from = doc.indexOf('unique-audit');
    const to = from + 'unique-audit'.length;
    const threads = [{
      threadId: 't1',
      text: 'unique-audit',
      prefix: 'xx ',
      suffix: ' yy',
      range: { from, to },
      anchor: { status: 'attached', quote: { exact: 'unique-audit' }, position: { from, to } }
    }];
    const marks = [{ threadId: 't1', from, to, text: 'unique-audit' }];
    const a = mod.auditAnnotationInvariants({ threads, marks, doc });
    assert.equal(a.healthy, true);
    assert.deepStrictEqual(a.errors, []);
  });

  await t('auditAnnotationInvariants catches duplicate-mark and mismatch', async () => {
    const doc = 'aa bb';
    const threads = [{ threadId: 't1', text: 'aa', range: { from: 0, to: 2 }, anchor: { status: 'attached' } }];
    const marks = [
      { threadId: 't1', from: 0, to: 2, text: 'aa' },
      { threadId: 't1', from: 3, to: 5, text: 'bb' }
    ];
    const a = mod.auditAnnotationInvariants({ threads, marks, doc });
    assert.equal(a.healthy, false);
    assert.ok(a.errors.some((e) => /duplicate-mark|text-mismatch|range-mismatch/.test(e.code)));
  });

  await t('auditAnnotationInvariants detects mark replacement caused by overlap', async () => {
    const doc = 'alpha bravo charlie';
    const threads = [
      { threadId: 'outer', text: 'alpha bravo charlie', range: { from: 0, to: 19 }, anchor: { status: 'attached' } },
      { threadId: 'inner', text: 'bravo charlie', range: { from: 6, to: 19 }, anchor: { status: 'attached' } },
    ];
    // ProseMirror marks of the same type cannot coexist with different attrs;
    // adding inner replaces outer over 6..19.
    const marks = [
      { threadId: 'outer', from: 0, to: 6, text: 'alpha ' },
      { threadId: 'inner', from: 6, to: 19, text: 'bravo charlie' },
    ];
    const a = mod.auditAnnotationInvariants({ threads, marks, doc });
    assert.equal(a.healthy, false);
    assert.ok(a.errors.some((e) => e.code === 'range-mismatch' && e.threadId === 'outer'));
    assert.ok(a.errors.some((e) => e.code === 'text-mismatch' && e.threadId === 'outer'));
  });

  await t('auditAnnotationInvariants ambiguous must not keep mark', async () => {
    const doc = 'tok tok';
    const threads = [{ threadId: 't1', text: 'tok', range: null, anchor: { status: 'ambiguous' } }];
    const marks = [{ threadId: 't1', from: 0, to: 3, text: 'tok' }];
    const a = mod.auditAnnotationInvariants({ threads, marks, doc });
    assert.equal(a.healthy, false);
    assert.ok(a.errors.some((e) => e.code === 'orphan-status-has-mark' || e.code === 'ambiguous-has-mark'));
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
