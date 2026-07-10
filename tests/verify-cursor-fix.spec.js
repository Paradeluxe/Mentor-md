// Playwright e2e regression test for v1.39 cursor comfort fix
// Issue: Clicking on highlighted annotation mark text left cursor OUTSIDE mark
//        (at the boundary position). User typing appeared disconnected from highlight.
// Fix: setupAnnotationMarkClickObserver now places cursor INSIDE the mark
//      based on click X coordinate (left-half → from+1, right-half → to-1).
//      Uses capture phase + stopImmediatePropagation to win race against PM's native handler.

const { chromium } = require('playwright');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const URL = `http://localhost:8765/index.html?v=101`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  // 等待 MD 加载完成 (loadMarkdownIntoEditor 是异步)
  await page.waitForTimeout(500);

  const result = await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    // 重置 doc
    ed.commands.setContent('<p>开始文本ABCDEFGH标记段HIJKLMN结束</p>');
    const doc = ed.state.doc;
    const map = [];
    doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) map.push({ pos: pos + i, ch: n.text[i] });
    });
    const startIdx = map.findIndex(m => m.ch === '标');
    const from = map[startIdx].pos;
    const to = map[startIdx + 3].pos;
    const tid = 'e2e-cursor-fix';
    const tr = ed.state.tr;
    tr.addMark(from, to, ed.schema.marks.annotation.create({ threadId: tid, resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);

    const findMark = () => document.querySelector(`[data-thread-id="${tid}"]`);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const click = (x) => {
      const me = findMark();
      if (!me) return null;
      const r = me.getBoundingClientRect();
      me.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: r.top + r.height/2, button: 0,
      }));
      return r;
    };

    // 测试 6 个点击位置
    const rect = findMark().getBoundingClientRect();
    const tests = [
      { label: 'left-edge', x: rect.left + 1 },
      { label: 'left-quarter', x: rect.left + rect.width * 0.25 },
      { label: 'mid', x: rect.left + rect.width / 2 },
      { label: 'right-quarter', x: rect.left + rect.width * 0.75 },
      { label: 'right-edge', x: rect.right - 1 },
    ];
    const results = [];
    for (const t of tests) {
      click(t.x);
      await wait(60);
      const pos = ed.state.selection.from;
      const marks = ed.state.selection.$head.marks().map(m => ({ type: m.type.name, threadId: m.attrs.threadId }));
      // 验证光标在 mark 内 ([from+1, to-1]) 且 marks 包含 annotation
      const insideMark = pos > from && pos < to;
      const hasAnnotation = marks.some(m => m.type === 'annotation');
      results.push({
        label: t.label,
        clickX: t.x,
        expected: t.x <= rect.left + rect.width / 2 ? 'left' : 'right',
        pos,
        expectedPos: t.x <= rect.left + rect.width / 2 ? from + 1 : to - 1,
        insideMark,
        hasAnnotation,
        PASS: insideMark && hasAnnotation,
      });
    }
    return { from, to, results };
  });

  console.log(JSON.stringify(result, null, 2));

  await page.screenshot({ path: path.join(__dirname, 'tmp/cursor-fix-verify.png') });

  // 验证插入行为
  const typingResult = await page.evaluate(async () => {
    const ed = window.__mdAnnotator.State.editor;
    const doc = ed.state.doc;
    const map = [];
    doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) map.push({ pos: pos + i, ch: n.text[i] });
    });
    const startIdx = map.findIndex(m => m.ch === '标');
    const from = map[startIdx].pos;
    const to = map[startIdx + 3].pos;
    const tid = 'e2e-typing-test';
    const tr = ed.state.tr;
    tr.addMark(from, to, ed.schema.marks.annotation.create({ threadId: tid, resolved: false, authorColor: 0 }));
    ed.view.dispatch(tr);

    const findMark = () => document.querySelector(`[data-thread-id="${tid}"]`);
    const wait = ms => new Promise(r => setTimeout(r, ms));

    // 点左边
    const r = findMark().getBoundingClientRect();
    findMark().dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, view: window,
      clientX: r.left + 2, clientY: r.top + r.height/2, button: 0,
    }));
    await wait(80);
    const cursorPos = ed.state.selection.from;
    // 插入
    ed.commands.insertContent('【】');
    await wait(50);
    const charMap = [];
    ed.state.doc.descendants((n, pos) => {
      if (n.isText) for (let i = 0; i < n.text.length; i++) charMap.push({ pos: pos + i, ch: n.text[i], marks: n.marks.map(m => m.type.name) });
    });
    const inserted = charMap.filter(m => '【】'.includes(m.ch));
    const allAnnotated = inserted.every(c => c.marks.includes('annotation'));
    ed.commands.undo(); ed.commands.undo();
    return {
      cursorPos,
      insertedChars: inserted.map(c => ({ ch: c.ch, hasAnnotation: c.marks.includes('annotation') })),
      PASS: allAnnotated && inserted.length === 2,
    };
  });
  console.log('Typing test:', JSON.stringify(typingResult, null, 2));

  await browser.close();

  const allPass = result.results.every(r => r.PASS) && typingResult.PASS && errors.length === 0;
  console.log('---');
  console.log('CLICK TESTS:', result.results.every(r => r.PASS) ? 'PASS' : 'FAIL');
  console.log('TYPING TEST:', typingResult.PASS ? 'PASS' : 'FAIL');
  console.log('PAGE ERRORS:', errors.length);
  if (errors.length) errors.forEach(e => console.log('  -', e));
  console.log('---');
  console.log('OVERALL:', allPass ? 'PASS' : 'FAIL');
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });