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
    assert.equal(typeof mod.mdEmphasisToPlain, 'function');
    assert.equal(typeof mod.scoreCandidate, 'function');
    assert.equal(typeof mod.resolveAnchor, 'function');
    assert.equal(typeof mod.mapAnchorRange, 'function');
    assert.equal(typeof mod.resolveAnchorSet, 'function');
    assert.equal(typeof mod.auditAnnotationInvariants, 'function');
    assert.equal(typeof mod.planAnnotationAnchorHeal, 'function');
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


  await t('mdEmphasisToPlain italics and escapes', async () => {
    assert.equal(mod.mdEmphasisToPlain('_p_ = .19'), 'p = .19');
    assert.equal(mod.mdEmphasisToPlain('Bonferroni-corrected _p_ = .19'), 'Bonferroni-corrected p = .19');
    assert.equal(mod.mdEmphasisToPlain('n\_init = 10'), 'n_init = 10');
    assert.equal(mod.mdEmphasisToPlain('_F_(1, 65)'), 'F(1, 65)');
    assert.equal(mod.mdEmphasisToPlain("Fisher's _r_-to-_z_"), "Fisher's r-to-z");
    assert.equal(mod.mdEmphasisToPlain('n_init'), 'n_init'); // not italic mid-word
  });

  await t('resolveAnchor md quote against plain doc (post-/fm)', async () => {
    const doc = 'did not survive correction for error rate (F(3, 195) = 2.68, p = .048; Bonferroni-corrected p = .19) or reaction time (F(3, 195) = 0.23, p = .873)';
    const r = mod.resolveAnchor(doc, {
      text: 'Bonferroni-corrected _p_ = .19',
      prefix: 'r rate (_F_(3, 195) = 2.68, _p_ = .048; ',
      suffix: ') or reaction time (_F_(3, 195) = 0.23, '
    });
    assert.equal(r.status, 'attached', 'status ' + r.status);
    assert.ok(r.range, 'range');
    assert.equal(doc.slice(r.range.from, r.range.to), 'Bonferroni-corrected p = .19');
    assert.ok((r.confidence == null ? 1 : r.confidence) >= 0.5);
  });

  await t('resolveAnchor n\\_init md escape against plain', async () => {
    const doc = 'K-means clustering (Euclidean distance, n_init = 10) was applied';
    const r = mod.resolveAnchor(doc, {
      text: 'n\_init = 10',
      prefix: 'Euclidean distance, ',
      suffix: ') was applied'
    });
    assert.equal(r.status, 'attached');
    assert.equal(doc.slice(r.range.from, r.range.to), 'n_init = 10');
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
    // Product: fuzzy UX removed — projectLegacyFlags never sets fuzzy:true.
    assert.deepStrictEqual(mod.projectLegacyFlags('attached'), {
      fuzzy: false, invalid: false, deleted: false, invalidReason: undefined
    });
    assert.deepStrictEqual(mod.projectLegacyFlags('orphaned'), {
      fuzzy: false, invalid: true, deleted: true, invalidReason: 'orphaned'
    });
    assert.deepStrictEqual(mod.projectLegacyFlags('ambiguous'), {
      fuzzy: false, invalid: true, deleted: false, invalidReason: 'ambiguous'
    });
    assert.deepStrictEqual(mod.projectLegacyFlags('edited'), {
      fuzzy: false, invalid: false, deleted: false, invalidReason: undefined
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

  await t('auditAnnotationInvariants accepts contained-middle physical split', async () => {
    const doc = 'alpha bravo charlie';
    const threads = [
      { threadId: 'outer', text: 'alpha bravo charlie', range: { from: 0, to: 19 }, anchor: { status: 'attached' } },
      { threadId: 'inner', text: 'bravo', range: { from: 6, to: 11 }, anchor: { status: 'attached' } },
    ];
    // Nested marks split the outer into three physical pieces (middle carries both marks).
    const marks = [
      { threadId: 'outer', from: 0, to: 6, text: 'alpha ' },
      { threadId: 'inner', from: 6, to: 11, text: 'bravo' },
      { threadId: 'outer', from: 6, to: 11, text: 'bravo' },
      { threadId: 'outer', from: 11, to: 19, text: ' charlie' },
    ];
    const a = mod.auditAnnotationInvariants({ threads, marks, doc });
    assert.equal(a.healthy, true, JSON.stringify(a.errors));
    assert.deepStrictEqual(a.errors, []);
  });

  await t('auditAnnotationInvariants accepts partial-overlap physical split', async () => {
    const doc = 'alpha bravo charlie';
    const threads = [
      { threadId: 'a', text: 'alpha bravo', range: { from: 0, to: 11 }, anchor: { status: 'attached' } },
      { threadId: 'b', text: 'bravo charlie', range: { from: 6, to: 19 }, anchor: { status: 'attached' } },
    ];
    const marks = [
      { threadId: 'a', from: 0, to: 6, text: 'alpha ' },
      { threadId: 'a', from: 6, to: 11, text: 'bravo' },
      { threadId: 'b', from: 6, to: 11, text: 'bravo' },
      { threadId: 'b', from: 11, to: 19, text: ' charlie' },
    ];
    const a = mod.auditAnnotationInvariants({ threads, marks, doc });
    assert.equal(a.healthy, true, JSON.stringify(a.errors));
  });

  await t('auditAnnotationInvariants detects mark replacement caused by overlap', async () => {
    const doc = 'alpha bravo charlie';
    const threads = [
      { threadId: 'outer', text: 'alpha bravo charlie', range: { from: 0, to: 19 }, anchor: { status: 'attached' } },
      { threadId: 'inner', text: 'bravo charlie', range: { from: 6, to: 19 }, anchor: { status: 'attached' } },
    ];
    // Outer missing the shared segment — true replacement / incomplete outer.
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


  await t('planAnnotationAnchorHeal export', async () => {
    assert.equal(typeof mod.planAnnotationAnchorHeal, 'function');
  });

  await t('plan heal range-mismatch single mark → sync-from-mark', async () => {
    const threads = [{
      threadId: 't1',
      text: 'hello world',
      range: { from: 0, to: 20 },
      anchor: { status: 'attached' }
    }];
    const marks = [{ threadId: 't1', from: 0, to: 11, text: 'hello world' }];
    const audit = mod.auditAnnotationInvariants({ threads, marks, doc: 'hello world more' });
    assert.equal(audit.healthy, false);
    assert.ok(audit.errors.some((e) => e.code === 'range-mismatch'));
    const plan = mod.planAnnotationAnchorHeal({ threads, marks, errors: audit.errors });
    assert.equal(plan.recoverable, true);
    assert.ok(plan.actions.some((a) => a.type === 'sync-from-mark' && a.threadId === 't1'));
  });

  await t('plan heal duplicate-mark gap spill → reattach-needed', async () => {
    const threads = [{
      threadId: 't-spill',
      text: 'Heading title',
      range: { from: 0, to: 30 },
      ranges: [{ from: 0, to: 30 }],
      anchor: { status: 'attached' }
    }];
    const marks = [
      { threadId: 't-spill', from: 0, to: 13, text: 'Heading title' },
      { threadId: 't-spill', from: 15, to: 30, text: 'Why should next' }
    ];
    const audit = mod.auditAnnotationInvariants({ threads, marks, doc: 'Heading title\nWhy should next' });
    assert.ok(audit.errors.some((e) => e.code === 'duplicate-mark'), JSON.stringify(audit.errors));
    const plan = mod.planAnnotationAnchorHeal({ threads, marks, errors: audit.errors });
    assert.ok(plan.actions.some((a) => a.type === 'reattach-needed' && a.threadId === 't-spill' && a.reason === 'duplicate-mark'));
  });

  await t('plan heal orphan-status-has-mark soft → clear-soft-orphan', async () => {
    const threads = [{
      threadId: 't-soft',
      text: 'exact quote here',
      range: { from: 0, to: 16 },
      invalid: true,
      invalidReason: 'missing-mdRange',
      anchor: { status: 'orphaned' }
    }];
    const marks = [{ threadId: 't-soft', from: 0, to: 16, text: 'exact quote here' }];
    const audit = mod.auditAnnotationInvariants({ threads, marks, doc: 'exact quote here' });
    assert.ok(audit.errors.some((e) => e.code === 'orphan-status-has-mark'));
    const plan = mod.planAnnotationAnchorHeal({ threads, marks, errors: audit.errors });
    assert.ok(plan.actions.some((a) => a.type === 'sync-from-mark'));
    assert.ok(plan.actions.some((a) => a.type === 'clear-soft-orphan'));
  });

  await t('plan heal hard deleted orphan+mark stays unplanned', async () => {
    const threads = [{
      threadId: 't-del',
      text: 'gone',
      deleted: true,
      range: { from: 0, to: 4 },
      anchor: { status: 'orphaned' }
    }];
    const marks = [{ threadId: 't-del', from: 0, to: 4, text: 'gone' }];
    const audit = mod.auditAnnotationInvariants({ threads, marks, doc: 'gone' });
    const plan = mod.planAnnotationAnchorHeal({ threads, marks, errors: audit.errors });
    assert.ok(!plan.actions.some((a) => a.threadId === 't-del' && (a.type === 'clear-soft-orphan' || a.type === 'sync-from-mark')));
  });


  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
