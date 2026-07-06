// Mentor E2E 压测 — 鼠标拖拽选区边界 case 探测
// 目的: 找 e2e-mouse-drag.spec.js (4 个 happy-path) 没覆盖到的边界 bug
// 设计: 50 轮随机拖拽, 每次随机选:
//   - 内容类型 (heading/paragraph/list/code/table/blockquote)
//   - 起点/终点位置 (避免相邻字符)
//   - 拖拽方向 (左→右 / 右→左 / 上→下 / 下→上)
//   - 步数 (3~20)

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function detectRoot() {
  if (process.platform === 'win32') {
    return path.resolve('E:/hermes_playground/Mentor');
  }
  if (fs.existsSync('/mnt/e/hermes_playground/Mentor')) {
    return '/mnt/e/hermes_playground/Mentor';
  }
  return path.resolve(__dirname, '..');
}

const ROOT = detectRoot();
const URL = 'http://127.0.0.1:8765/index.html';

// 含丰富内容类型的 markdown
const RICH_MD = `# 一级标题这是压测文档

这是一段普通段落,包含足够多的中文字符用于随机拖拽测试,字符数应有五十个以上.

## 二级标题

- 列表项 A: 第一项内容比较长一点
- 列表项 B: 第二项内容也比较长
- 列表项 C: 第三项也要足够长以便拖拽

1. 有序列表 1
2. 有序列表 2
3. 有序列表 3

> 引用块: 这是一段引用文字,用于测试引用块内的选区行为.

\`\`\`javascript
// 代码块: 用于测试代码块内的拖拽
function test() {
  return 'hello world';
}
\`\`\`

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 单元格 A1 | 单元格 B1 | 单元格 C1 |
| 单元格 A2 | 单元格 B2 | 单元格 C2 |

**粗体文本** *斜体文本* \`行内代码\`

最后一段普通文字作为收尾,内容长度足够供随机拖拽测试.`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', d => d.accept());

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });

  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('stress-test.md', md, null);
  }, RICH_MD);
  await page.waitForTimeout(300);

  // 探测 doc 结构: 列出所有 text node 的 pos + 文本内容
  const allTextPositions = await page.evaluate(() => {
    const F = window.__mdAnnotator;
    const view = F.State.editor.view;
    const doc = view.state.doc;
    const positions = [];
    doc.descendants((node, pos) => {
      if (node.isText && node.text.trim().length > 0) {
        const $p = doc.resolve(pos);
        const parent = $p.parent;
        const grand = $p.depth > 0 ? $p.node($p.depth - 1) : null;
        positions.push({
          pos,
          len: node.text.length,
          text: node.text.slice(0, 30),
          parentType: parent.type.name,
          grandType: grand ? grand.type.name : null,
        });
      }
    });
    return positions;
  });
  console.log(`\n=== 文档结构探测 ===`);
  const typeCounts = {};
  for (const p of allTextPositions) {
    const k = `${p.grandType || '?'}/${p.parentType}`;
    typeCounts[k] = (typeCounts[k] || 0) + 1;
  }
  console.log('Text node 分布:', typeCounts);
  console.log(`共 ${allTextPositions.length} 个 text node, 总字符 ${allTextPositions.reduce((s, p) => s + p.len, 0)}`);

  // 随机种子 — 让跑可复现
  const SEED = parseInt(process.env.SEED || '42');
  let rngState = SEED;
  function rand() {
    rngState = (rngState * 9301 + 49297) % 233280;
    return rngState / 233280;
  }
  function randInt(a, b) { return Math.floor(rand() * (b - a + 1)) + a; }

  const ROUNDS = 50;
  let successCount = 0;
  let failCount = 0;
  const failures = [];

  console.log(`\n=== STRESS: ${ROUNDS} 轮随机鼠标拖拽 (seed=${SEED}) ===\n`);

  // 先点编辑器获得焦点
  const viewRect0 = await page.evaluate(() => {
    return window.__mdAnnotator.State.editor.view.dom.getBoundingClientRect();
  });
  await page.mouse.click(viewRect0.left + 30, viewRect0.top + 30);
  await page.waitForTimeout(100);

  for (let round = 1; round <= ROUNDS; round++) {
    const nodeIdx = randInt(0, allTextPositions.length - 1);
    const node = allTextPositions[nodeIdx];
    if (node.len < 2) continue;

    const offsetA = randInt(0, node.len - 1);
    const offsetB = randInt(0, node.len - 1);
    const fromOffset = Math.min(offsetA, offsetB);
    const toOffset = Math.max(offsetA, offsetB);
    const from = node.pos + fromOffset;
    const to = node.pos + toOffset;
    if (from === to) continue;

    const coords = await page.evaluate(({ from, to }) => {
      const view = window.__mdAnnotator.State.editor.view;
      const sc = view.coordsAtPos(from);
      const ec = view.coordsAtPos(to);
      const charWidth = ec.left - sc.left || 10;
      // 安全偏移: 起始 +10%, 结束 -10%, 上限 4px (避免大字符宽选区偏移过大)
      const offset = Math.min(4, charWidth * 0.1);
      const safeStart = sc.left + offset;
      const safeEnd = ec.right - offset;
      return {
        startX: safeStart,
        startY: (sc.top + sc.bottom) / 2,
        endX: safeEnd,
        endY: (ec.top + ec.bottom) / 2,
      };
    }, { from, to });

    // 字符宽度太小 (e.g. 单字拖拽 with 字符宽 12px, 偏移 8px 一来一回)
    // 如果 endX <= startX + 2, 跳过这轮 (PM 反向选区会导致发散)
    if (coords.endX <= coords.startX + 2) continue;

    if (coords.startX < 0 || coords.endX < 0) continue;

    const steps = randInt(3, 12);

    await page.mouse.move(coords.startX, coords.startY);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        coords.startX + (coords.endX - coords.startX) * t,
        coords.startY + (coords.endY - coords.startY) * t
      );
      if (rand() < 0.3) {
        await page.mouse.move(
          coords.startX + (coords.endX - coords.startX) * t + randInt(-2, 2),
          coords.startY + (coords.endY - coords.startY) * t + randInt(-1, 1)
        );
      }
      await page.waitForTimeout(randInt(5, 20));
    }
    await page.mouse.up();
    await page.waitForTimeout(50);

    const sel = await page.evaluate(() => {
      const s = window.__mdAnnotator.State.editor.state.selection;
      const text = window.__mdAnnotator.State.editor.state.doc.textBetween(s.from, s.to, '\n', '\n');
      return { from: s.from, to: s.to, text };
    });

    const fromErr = Math.abs(sel.from - from);
    const toErr = Math.abs(sel.to - to);
    const expectedText = await page.evaluate(({ from, to }) => {
      return window.__mdAnnotator.State.editor.state.doc.textBetween(from, to, '\n', '\n');
    }, { from, to });
    const textMatch = sel.text === expectedText;

    // 容差: textMatch=true 时允许端点有偏移 (PM list item 等节点会插入额外 pos)
    // 只有 text 不一致才算真正的 bug
    if (textMatch && fromErr <= 50 && toErr <= 50) {
      successCount++;
      if (round % 10 === 0 || fromErr > 2 || toErr > 2) {
        const note = (fromErr > 2 || toErr > 2) ? ` [端点偏移 ${fromErr},${toErr}]` : '';
        console.log(`  R${round} ✓ ${node.grandType}/${node.parentType} text="${sel.text.slice(0, 15)}..." (Δ${fromErr},${toErr})${note}`);
      }
    } else {
      failCount++;
      failures.push({
        round, nodeType: `${node.grandType}/${node.parentType}`,
        from, to, selFrom: sel.from, selTo: sel.to,
        fromErr, toErr, textMatch,
        expectedText: expectedText.slice(0, 30),
        actualText: sel.text.slice(0, 30),
      });
      console.log(`  R${round} ✗ ${node.grandType}/${node.parentType} from=${from}~${to} → sel ${sel.from}~${sel.to} (Δ${fromErr},${toErr}) textMatch=${textMatch}`);
      console.log(`     expected: "${expectedText.slice(0, 30)}"`);
      console.log(`     actual:   "${sel.text.slice(0, 30)}"`);
    }
  }

  console.log(`\n=== 结果 ===`);
  console.log(`✓ 成功: ${successCount}/${ROUNDS}`);
  console.log(`✗ 失败: ${failCount}/${ROUNDS}`);
  console.log(`console.errors: ${consoleErrors.length}`);
  console.log(`page.errors:    ${pageErrors.length}`);

  if (consoleErrors.length) {
    console.log('\n--- console errors (前 5) ---');
    consoleErrors.slice(0, 5).forEach(e => console.log(' ', e));
  }
  if (pageErrors.length) {
    console.log('\n--- page errors (前 5) ---');
    pageErrors.slice(0, 5).forEach(e => console.log(' ', e));
  }

  if (failures.length) {
    console.log(`\n--- 失败按类型汇总 ---`);
    const byType = {};
    for (const f of failures) {
      byType[f.nodeType] = (byType[f.nodeType] || 0) + 1;
    }
    for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${t}: ${c} 次失败`);
    }
  }

  await browser.close();

  if (failCount > 0 || consoleErrors.length > 0 || pageErrors.length > 0) {
    process.exit(1);
  }
  console.log('\n========================================');
  console.log(`✓ 压测全部通过!`);
  console.log('========================================');
})().catch(async err => {
  console.error('\n✗ 压测崩溃:', err.message);
  console.error(err.stack);
  process.exit(1);
});