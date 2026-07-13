// Mentor v1.43.2 chaos wave 9 — 交叉范围/包含范围/邻接范围
// v1.42.9 规则: 完全相同 (from, to) 才拒, 其他 (嵌套扩展/部分重叠/邻接/包含) 全部允许
// 这里把规则固化下来, 防止 v1.42.9 以后悄悄改动
//
// 通过真实 DOM 路径 (setTextSelection + click #float-comment-btn button),
// 跟用户拖选 + 点浮动按钮完全等价

const { chromium } = require('playwright');
const URL = 'http://localhost:8787/index.html?v=121';

const TEST_DOC = '0123456789ABCDEFGHIJKLMNOP';  // 26 chars, 单段, 位置 1-26

async function setup(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const d of dbs) { if (d.name) indexedDB.deleteDatabase(d.name); }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function run(browser, name, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let result;
  try {
    await setup(page);
    result = await Promise.race([
      fn(page),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_45s')), 45000)),
    ]);
  } catch (e) {
    result = { threw: e.message };
  }
  await ctx.close();
  return { name, result, errors };
}

// 重置 helper - 单段 test doc, 清 ann
async function resetDoc(page) {
  await page.evaluate((md) => {
    const M = window.__mdAnnotator;
    M.State.editor.commands.setContent('<p>' + md + '</p>', false);
    M.State.annotations = [];
    M.State.activeThreadId = null;
    M.State.editor.commands.setTextSelection(1);
    M.renderCommentList();
    M.rebuildAnnotationMarks();
  }, TEST_DOC);
}

// 模拟选区 + 点 #float-comment-btn (真实 UI 路径)
async function clickCommentBtnAt(page, from, to) {
  return await page.evaluate(({ from, to }) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const before = M.State.annotations.length;
    ed.commands.setTextSelection({ from, to });
    document.querySelector('#float-comment-btn button').click();
    const after = M.State.annotations.length;
    return { before, after, created: after > before };
  }, { from, to });
}

const tests = {
  // W9-01: 完全相同 (5,10) x2 → 第 2 个拒 (v1.42.9 硬规则)
  async W9_01_exact_dup_rejected(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    const r2 = await clickCommentBtnAt(page, 5, 10);
    if (!r1.created) return { error: 'r1 应创建', r1, r2 };
    if (r2.created) return { error: 'r2 应被拒', r1, r2 };
    return { ok: true, total: 1 };
  },

  // W9-02: 同 from 不同 to (嵌套扩展 from-侧) → 都允许
  async W9_02_same_from_extend(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    const r2 = await clickCommentBtnAt(page, 5, 15);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-03: 同 to 不同 from (嵌套扩展 to-侧) → 都允许
  async W9_03_same_to_extend(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    const r2 = await clickCommentBtnAt(page, 8, 10);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-04: 部分重叠 → 都允许
  async W9_04_partial_overlap(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 15);
    const r2 = await clickCommentBtnAt(page, 10, 20);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-05: 包含 - 后者在前者内 → 都允许
  async W9_05_contained_inner(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 20);
    const r2 = await clickCommentBtnAt(page, 8, 15);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-06: 反向包含 - 后者包前者 → 都允许
  async W9_06_contained_outer(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 8, 15);
    const r2 = await clickCommentBtnAt(page, 5, 20);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-07: 邻接 → 都允许
  async W9_07_adjacent(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    const r2 = await clickCommentBtnAt(page, 10, 15);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-08: 反向邻接 → 都允许
  async W9_08_adjacent_reverse(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 10, 15);
    const r2 = await clickCommentBtnAt(page, 5, 10);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-09: 单字符邻接 → 都允许
  async W9_09_single_char_adjacent(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    const r2 = await clickCommentBtnAt(page, 10, 11);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-10: 极端包含 (整段 + 子段) → 都允许
  async W9_10_whole_paragraph_contains(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 1, 26);
    const r2 = await clickCommentBtnAt(page, 5, 10);
    if (!r1.created || !r2.created) return { error: '应都创建', r1, r2 };
    return { ok: true, total: 2 };
  },

  // W9-11: 完全相同 x3 → 只 1 个 (v1.42.9)
  async W9_11_exact_dup_x3(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    const r2 = await clickCommentBtnAt(page, 5, 10);
    const r3 = await clickCommentBtnAt(page, 5, 10);
    if (!r1.created) return { error: 'r1 应创建' };
    if (r2.created || r3.created) return { error: 'r2,r3 都应被拒', r1, r2, r3 };
    return { ok: true, total: 1 };
  },

  // W9-12: 3 嵌套 (1,10) + (2,9) + (3,8) → 都允许
  async W9_12_triple_nested(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 1, 10);
    const r2 = await clickCommentBtnAt(page, 2, 9);
    const r3 = await clickCommentBtnAt(page, 3, 8);
    if (!r1.created || !r2.created || !r3.created) return { error: '3 个都应创建', r1, r2, r3 };
    return { ok: true, total: 3 };
  },

  // W9-13: cell 内选区正常创建 (table cell 语义 cell-selection.spec.js 已覆盖)
  async W9_13_cell_inside(page) {
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>', false);
      M.State.annotations = [];
      M.State.activeThreadId = null;
      window.__mdAnnotator.renderCommentList();
      window.__mdAnnotator.rebuildAnnotationMarks();
    });
    // cell 内选区 (4,5) = 'A'
    const r1 = await clickCommentBtnAt(page, 4, 5);
    if (!r1.created) return { error: 'cell 内选区应创建' };
    return { ok: true, total: 1 };
  },

  // W9-14: mark 内文字选中后创建 (子区间, 不同于原 range) - 应该成功
  async W9_14_mark_inside_new_range(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    if (!r1.created) return { error: '基础 ann 创建失败' };
    // 在 mark 内再选一个子区间 (6,9 完全在 mark 内但 from/to 不同)
    const r2 = await clickCommentBtnAt(page, 6, 9);
    if (!r2.created) return { error: 'mark 内子区间应能创建新 ann' };
    return { ok: true, total: 2 };
  },

  // W9-15: mark 内文字选中后创建 (同 from+to) - 应该被拒
  async W9_15_mark_inside_same_range_rejected(page) {
    await resetDoc(page);
    const r1 = await clickCommentBtnAt(page, 5, 10);
    if (!r1.created) return { error: '基础 ann 创建失败' };
    const r2 = await clickCommentBtnAt(page, 5, 10);
    if (r2.created) return { error: '同 range 应被拒' };
    return { ok: true, total: 1 };
  },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [name, fn] of Object.entries(tests)) {
    const r = await run(browser, name, fn);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    console.log((passed ? '✓' : '✗') + ' ' + r.name + (r.result.threw ? ' — ' + r.result.threw : '') + (r.result.error ? ' — ' + r.result.error : ''));
    if (r.errors.length) console.log('   errors:', r.errors.slice(0, 2).join(' | '));
    if (r.result && !r.result.threw && Object.keys(r.result).length > 0) {
      console.log('   ' + JSON.stringify(r.result).slice(0, 400));
    }
  }
  await browser.close();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log('---');
  console.log('TOTAL:', results.length, ' PASS:', passed, ' FAIL:', failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });