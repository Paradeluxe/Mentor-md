// Unit tests for modules/supervision.js (pure helpers + plugin filter).
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  // Minimal DOM for pet widget + prosemirror-view import under Node.
  if (typeof globalThis.document === 'undefined') {
    const makeEl = (tag) => {
      const el = {
        tagName: String(tag).toUpperCase(),
        className: '',
        title: '',
        innerHTML: '',
        style: {},
        attrs: Object.create(null),
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        appendChild() { return null; },
        removeChild() { return null; },
        querySelector(sel) {
          if (sel === 'svg' && String(this.innerHTML).includes('<svg')) return { tagName: 'SVG' };
          return null;
        },
      };
      return el;
    };
    globalThis.document = {
      createElement: makeEl,
      createElementNS: (_ns, tag) => makeEl(tag),
      body: { style: {}, appendChild() {}, removeChild() {} },
      documentElement: { style: {} },
      head: { appendChild() {} },
    };
  }
  if (typeof globalThis.getComputedStyle === 'undefined') {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', 'modules', 'supervision.js')
  ).href;
  const {
      normalizeSupervisionPayload,
      mergeRanges,
      rangesOverlap,
      transactionTouchesRanges,
      supervisionBannerText,
      supervisionSignalPhase,
      isFullDocumentLoad,
      materializeSupervisionState,
      emptySupervisionState,
      collectLockedRanges,
      createSupervisionPetElement,
      findThreadMarkRanges,
      findThreadMarkRange,
    } = await import(modUrl);

  let pass = 0;
  function check(name, fn) {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  }

  check('normalize inactive null', () => {
    const s = normalizeSupervisionPayload(null);
    assert.strictEqual(s.active, false);
    assert.deepStrictEqual(s.pendingThreadIds, []);
  });

  check('normalize active pending', () => {
    const s = normalizeSupervisionPayload({
      active: true,
      pendingThreadIds: ['a', 'a', 'b'],
      processedThreadIds: ['c'],
      tool: 'fix-mentor',
      message: 'hi',
    });
    assert.strictEqual(s.active, true);
    assert.deepStrictEqual(s.pendingThreadIds, ['a', 'b']);
    assert.deepStrictEqual(s.processedThreadIds, ['c']);
    assert.strictEqual(s.lockMode, 'pending-paragraphs');
    assert.strictEqual(s.tool, 'fix-mentor');
    // New contract: do NOT auto-promote first pending to current.
    // Without explicit currentThreadId + active+non-empty pending → waiting.
    assert.strictEqual(s.currentThreadId, '');
    assert.strictEqual(s.phase, 'waiting');
  });

  check('normalize explicit currentThreadId', () => {
    const s = normalizeSupervisionPayload({
      active: true,
      pendingThreadIds: ['a', 'b'],
      currentThreadId: 'b',
    });
    assert.strictEqual(s.currentThreadId, 'b');
    assert.strictEqual(supervisionSignalPhase(s), 'working');
  });

  check('normalize preserves explicit waiting phase and health', () => {
    const s = normalizeSupervisionPayload({
      v: 1,
      active: true,
      phase: 'waiting',
      health: 'ok',
      pendingThreadIds: ['a'],
      currentThreadId: '',
    });
    assert.strictEqual(s.phase, 'waiting');
    assert.strictEqual(s.health, 'ok');
    assert.strictEqual(s.currentThreadId, '');
  });

  check('normalize rejects unsupported protocol versions safely', () => {
    const s = normalizeSupervisionPayload({ v: 99, active: true });
    assert.strictEqual(s.active, false);
    assert.strictEqual(s.health, 'unsupported');
  });

  check('normalize marks server read errors without inventing inactive work', () => {
    const s = normalizeSupervisionPayload({
      v: 1,
      active: true,
      health: 'stale',
      error: 'unreadable',
      pendingThreadIds: ['a'],
    });
    assert.strictEqual(s.active, true);
    assert.strictEqual(s.health, 'stale');
  });

  check('signal phase off when inactive', () => {
    assert.strictEqual(supervisionSignalPhase({ active: false }), 'off');
  });

  check('pet element shape', () => {
    const el = createSupervisionPetElement({ phase: 'working', threadId: 't1' });
    assert.ok(el.className.includes('supervision-pet'));
    assert.strictEqual(el.getAttribute('data-thread-id'), 't1');
    assert.ok(el.querySelector('svg'));
  });

  check('normalize active empty pending defaults to pending-paragraphs (no implicit document lock)', () => {
    // New contract: lockMode is honored only when explicitly 'document'.
    // Empty pending alone does not force document-level lock; that is now
    // a downstream materialize decision (degraded) — not a normalize default.
    const s = normalizeSupervisionPayload({ active: true, pendingThreadIds: [] });
    assert.strictEqual(s.active, true);
    assert.strictEqual(s.lockMode, 'pending-paragraphs');
  });

  check('normalize honors explicit lockMode document', () => {
    const s = normalizeSupervisionPayload({
      active: true,
      lockMode: 'document',
      pendingThreadIds: ['a'],
    });
    assert.strictEqual(s.lockMode, 'document');
  });

  check('mergeRanges contiguous', () => {
      assert.deepStrictEqual(
        mergeRanges([
          { from: 1, to: 5, threadId: 'a' },
          { from: 5, to: 9, threadId: 'a' },
          { from: 20, to: 22, threadId: 'b' },
        ]),
        [
          { from: 1, to: 9, threadId: 'a' },
          { from: 20, to: 22, threadId: 'b' },
        ]
      );
    });

    check('mergeRanges coalesces only within the same thread', () => {
      assert.deepStrictEqual(
        mergeRanges([
          { from: 1, to: 5, threadId: 'a' },
          { from: 3, to: 8, threadId: 'b' },
          { from: 5, to: 9, threadId: 'a' },
        ]),
        [
          { from: 1, to: 9, threadId: 'a' },
          { from: 3, to: 8, threadId: 'b' },
        ]
      );
    });

    check('findThreadMarkRanges returns every disjoint piece for one logical thread', () => {
      const markType = { name: 'annotation' };
      const textNode = (text, tid) => ({
        isText: true,
        nodeSize: text.length,
        marks: tid ? [{ type: markType, attrs: { threadId: tid } }] : [],
      });
      const doc = {
        descendants(fn) {
          fn(textNode('AAAA', 'a'), 1); // 1-5
          fn(textNode('xxxx', null), 5); // 5-9 free
          fn(textNode('BBBB', 'a'), 12); // 12-16
          fn(textNode('CCCC', 'b'), 20); // other thread
        },
      };
      const ranges = findThreadMarkRanges(doc, markType, 'a');
      assert.deepStrictEqual(ranges, [
        { from: 1, to: 5, threadId: 'a' },
        { from: 12, to: 16, threadId: 'a' },
      ]);
      const first = findThreadMarkRange(doc, markType, 'a');
      assert.deepStrictEqual(first, { from: 1, to: 5 });
    });

  check('rangesOverlap', () => {
    assert.strictEqual(rangesOverlap(0, 5, 4, 8), true);
    assert.strictEqual(rangesOverlap(0, 5, 5, 8), false);
    assert.strictEqual(rangesOverlap(10, 12, 0, 3), false);
  });

  check('transactionTouchesRanges hits', () => {
    const tr = {
      docChanged: true,
      steps: [{ from: 3, to: 4 }],
    };
    assert.strictEqual(transactionTouchesRanges(tr, [{ from: 0, to: 10 }]), true);
    assert.strictEqual(transactionTouchesRanges(tr, [{ from: 10, to: 20 }]), false);
  });

  check('transactionTouchesRanges unknown step blocks', () => {
    const tr = { docChanged: true, steps: [{ weird: true }] };
    assert.strictEqual(transactionTouchesRanges(tr, [{ from: 0, to: 5 }]), true);
  });

  check('banner text', () => {
    assert.strictEqual(supervisionBannerText({ active: false }), '');
    assert.ok(
      supervisionBannerText({
        active: true,
        tool: 'fix-mentor',
        pendingThreadIds: ['x'],
        processedThreadIds: [],
        lockMode: 'pending-paragraphs',
      }).includes('未处理 1')
    );
    assert.ok(
      supervisionBannerText({
        active: true,
        message: '自定义',
        pendingThreadIds: [],
      }) === '自定义'
    );
  });

  check('materialize inactive', () => {
    const s = materializeSupervisionState(null, null, { active: false });
    assert.strictEqual(s.active, false);
    assert.deepStrictEqual(s.lockedRanges, []);
  });

  check('empty state shape', () => {
    const e = emptySupervisionState();
    assert.strictEqual(e.active, false);
    assert.ok(e.decos);
  });

  // collectLockedRanges with a tiny fake doc
  check('collectLockedRanges fake doc', () => {
    const markType = { name: 'annotation' };
    const textNode = (text, tid) => ({
      isText: true,
      nodeSize: text.length,
      marks: tid
        ? [{ type: markType, attrs: { threadId: tid } }]
        : [],
    });
    const doc = {
      descendants(fn) {
        // "hello" locked, " world" free
        fn(textNode('hello', 't1'), 1);
        fn(textNode(' world', null), 6);
      },
    };
    const ranges = collectLockedRanges(doc, markType, ['t1']);
    assert.deepStrictEqual(ranges, [{ from: 1, to: 6, threadId: 't1' }]);
    assert.deepStrictEqual(collectLockedRanges(doc, markType, ['nope']), []);
  });


  check('missing pending marks degrades without document lock', () => {
    const markType = { name: 'annotation' };
    const doc = {
      content: { size: 50 },
      descendants(fn) {
        // no marks at all
      },
    };
    const s = materializeSupervisionState(doc, markType, {
      v: 1,
      active: true,
      pendingThreadIds: ['missing'],
      currentThreadId: 'missing',
    });
    assert.strictEqual(s.lockMode, 'pending-paragraphs');
    assert.strictEqual(s.health, 'degraded');
    assert.deepStrictEqual(s.lockedRanges, []);
    assert.deepStrictEqual(s.missingThreadIds, ['missing']);
  });

  check('explicit document lock still locks whole doc', () => {
    const doc = { content: { size: 40 }, descendants() {} };
    const s = materializeSupervisionState(doc, { name: 'annotation' }, {
      v: 1,
      active: true,
      lockMode: 'document',
      pendingThreadIds: [],
      currentThreadId: '',
    });
    assert.strictEqual(s.lockMode, 'document');
    assert.ok(s.lockedRanges.length === 1);
    assert.strictEqual(s.lockedRanges[0].from, 0);
    assert.strictEqual(s.lockedRanges[0].to, 40);
  });

  check('isFullDocumentLoad allows empty-doc open', () => {
    const tr = { docChanged: true, steps: [{ from: 0, to: 2 }], doc: { content: { size: 500 } } };
    const state = { doc: { content: { size: 2 } } };
    assert.strictEqual(isFullDocumentLoad(tr, state), true);
  });

  check('isFullDocumentLoad allows full replace of non-empty', () => {
    const tr = { docChanged: true, steps: [{ from: 0, to: 100 }], doc: { content: { size: 800 } } };
    const state = { doc: { content: { size: 100 } } };
    assert.strictEqual(isFullDocumentLoad(tr, state), true);
  });

  check('isFullDocumentLoad rejects small edit in large doc', () => {
    const tr = { docChanged: true, steps: [{ from: 40, to: 45 }], doc: { content: { size: 500 } } };
    const state = { doc: { content: { size: 500 } } };
    assert.strictEqual(isFullDocumentLoad(tr, state), false);
  });

  console.log(`=== RESULT: ${pass} pass / 0 fail ===`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
