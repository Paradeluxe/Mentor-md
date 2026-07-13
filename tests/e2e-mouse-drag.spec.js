// Mentor E2E 测试 — 鼠标拖拽选区 (真用户路径)
// 之前测试都是 evaluate() 直接 dispatch setSelection, 跳过真实鼠标事件链.
// 这里用 page.mouse.down/move/up 验证: 拖拽后 PM selection 端点 = 文字字符位置

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
const URL = 'http://127.0.0.1:8787/index.html';

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

  // 加载含 "选区级批注" 短语的 markdown, 便于定位屏幕坐标
  const md = '# 拖拽测试\n\n这是一段用于鼠标拖拽选区的测试文本, 包含 选区级批注 这五个字.\n\n继续下一段文字用于验证跨段落拖拽.';
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('drag-test.md', md, null);
  }, md);
  await page.waitForTimeout(300);

  // === TEST D1: 单段内拖拽选区 — 选中 "选区级批注" ===
  console.log('=== TEST D1: 鼠标拖拽选区 (单段内) ===');
  {
    // 1) 用 PM view.coordsAtPos 把目标字符位置转换为屏幕坐标
    // 文本 "这是一段用于鼠标拖拽选区的测试文本, 包含 选区级批注 这五个字."
    const target = await page.evaluate(() => {
      const F = window.__mdAnnotator;
      const view = F.State.editor.view;
      const doc = view.state.doc;
      let targetPos = null;
      doc.descendants((node, pos) => {
        if (targetPos !== null) return false;
        if (node.isText) {
          const i = node.text.indexOf('选区级批注');
          if (i >= 0) targetPos = pos + i;
        }
      });
      if (targetPos == null) throw new Error('没找到 text node');
      const startCoords = view.coordsAtPos(targetPos);
      const endCoords = view.coordsAtPos(targetPos + 5);
      // PM coordsAtPos 返回 viewport-relative 坐标 (clientX/Y), 可直接给 page.mouse
      // 字符宽度决定偏移量: 避免 endX <= startX 导致反向选区
      // 偏移取 charWidth 的 10% 上限 8px (避免多字选区偏移过大)
      const charWidth = endCoords.left - startCoords.left || 10;
      const offset = Math.min(4, charWidth * 0.1);
      const safeStart = startCoords.left + offset;
      const safeEnd = endCoords.right - offset;
      return {
        startClientX: safeStart,
        startClientY: (startCoords.top + startCoords.bottom) / 2,
        endClientX: safeEnd,
        endClientY: (endCoords.top + endCoords.bottom) / 2,
        targetPos,
        expectedEnd: targetPos + 5,
        viewRect: view.dom.getBoundingClientRect(),
      };
    });

    // 拖拽范围太小则说明目标字符宽度不足 (理论不应发生, 因为 D1 选 5 字)
    if (target.endClientX <= target.startClientX + 2) {
      throw new Error(`D1 字符宽度不足: endX=${target.endClientX} startX=${target.startClientX}`);
    }

    // 2) page.mouse 真实拖拽 — 先点编辑器获得焦点, 再拖
    await page.mouse.click(target.viewRect.left + 50, target.viewRect.top + 50);
    await page.waitForTimeout(100);
    await page.mouse.move(target.startClientX, target.startClientY);
    await page.mouse.down();
    // 分步移动 — 真实用户拖拽会有中间帧
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        target.startClientX + (target.endClientX - target.startClientX) * t,
        target.startClientY + (target.endClientY - target.startClientY) * t
      );
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    // 3) 验证 PM selection 包含 "选区级批注"
    const sel = await page.evaluate(() => {
      const F = window.__mdAnnotator;
      const s = F.State.editor.state.selection;
      const text = F.State.editor.state.doc.textBetween(s.from, s.to, '\n', '\n');
      return { from: s.from, to: s.to, text };
    });

    console.log(`  目标位置: pos=${target.targetPos}~${target.expectedEnd}`);
    console.log(`  实际选区: from=${sel.from} to=${sel.to} text="${sel.text}"`);
    if (!sel.text.includes('选区级批注')) {
      throw new Error(`拖拽选区不包含 "选区级批注": "${sel.text}"`);
    }
    if (sel.from !== target.targetPos || sel.to !== target.expectedEnd) {
      throw new Error(`拖拽端点偏移: 预期 ${target.targetPos}~${target.expectedEnd}, 实际 ${sel.from}~${sel.to}`);
    }
    console.log(`  ✓ 鼠标拖拽选中 5 字符, PM 端点精确`);
  }

  // === TEST D2: 拖拽选区 → 点击浮起 #float-comment-btn → 创建批注 — 全链路 ===
  console.log('=== TEST D2: 拖拽选区 → 点击浮起批注按钮 → 创建批注 ===');
  {
    // 先清掉之前的批注
    await page.evaluate(() => {
      const F = window.__mdAnnotator;
      F.State.annotations = [];
      F.renderCommentList();
    });
    // 用 evaluate 找目标位置
    const target = await page.evaluate(() => {
      const F = window.__mdAnnotator;
      const view = F.State.editor.view;
      const doc = view.state.doc;
      let pos = null;
      doc.descendants((node, p) => {
        if (pos !== null) return false;
        if (node.isText) {
          const i = node.text.indexOf('用于鼠标拖拽选区');
          if (i >= 0) pos = p + i;
        }
      });
      if (pos == null) throw new Error('找不到 "用于鼠标拖拽选区"');
      const len = '用于鼠标拖拽选区的测试文本'.length;
      const sc = view.coordsAtPos(pos);
      const ec = view.coordsAtPos(pos + len);
      const charWidth = ec.left - sc.left || 10;
      const offset = Math.min(4, charWidth * 0.1);
      return {
        startClientX: sc.left + offset,
        startClientY: (sc.top + sc.bottom) / 2,
        endClientX: ec.right - offset,
        endClientY: (ec.top + ec.bottom) / 2,
        viewRect: view.dom.getBoundingClientRect(),
      };
    });

    // 浮起按钮初始显示状态记录 (不卡 hidden 断言, 因为 D1 拖拽后可能遗留)
    const stateBefore = await page.evaluate(() => {
      const btn = document.querySelector('#float-comment-btn');
      return {
        hidden: btn.classList.contains('hidden'),
        display: getComputedStyle(btn).display,
      };
    });
    console.log(`  拖拽前浮起按钮: hidden=${stateBefore.hidden} display=${stateBefore.display}`);

    // 先 focus 编辑器, 再拖
    await page.mouse.click(target.viewRect.left + 30, target.viewRect.top + 30);
    await page.waitForTimeout(100);
    await page.mouse.move(target.startClientX, target.startClientY);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      await page.mouse.move(
        target.startClientX + (target.endClientX - target.startClientX) * t,
        target.startClientY + (target.endClientY - target.startClientY) * t
      );
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(200);

    // 浮起按钮现在应显示 (无论初始状态如何, 拖拽后 selection 非空 → 浮起按钮应显示)
    const visibleAfter = await page.evaluate(() => {
      const btn = document.querySelector('#float-comment-btn');
      return btn && !btn.classList.contains('hidden') && getComputedStyle(btn).display !== 'none';
    });
    if (!visibleAfter) throw new Error('拖拽后浮起批注按钮应显示');

    // 验证 selection 包含 "用于鼠标拖拽选区" (说明拖拽选区链路 OK)
    const selCheck = await page.evaluate(() => {
      const F = window.__mdAnnotator;
      const s = F.State.editor.state.selection;
      const text = F.State.editor.state.doc.textBetween(s.from, s.to, '\n', '\n');
      return { from: s.from, to: s.to, text };
    });
    if (!selCheck.text.includes('鼠标拖拽选区')) {
      throw new Error(`拖拽选区不包含目标文本: "${selCheck.text}"`);
    }
    if (selCheck.from === selCheck.to) {
      throw new Error(`拖拽后 selection 应非空, 当前 collapsed at ${selCheck.from}`);
    }
    console.log(`  ✓ 拖拽 → 浮起按钮显示 → 选区 text="${selCheck.text.slice(0, 20)}..." (from=${selCheck.from} to=${selCheck.to})`);
    console.log(`  (click handler 由现有 e2e 覆盖, 这里只验真鼠标拖拽选区链路)`);
  }

  // === TEST D3: 跨段落拖拽 — 鼠标按下 1 段 → 松开 2 段 ===
  console.log('=== TEST D3: 跨段落拖拽 (段尾 → 段首) ===');
  {
    await page.evaluate(() => {
      const F = window.__mdAnnotator;
      F.State.annotations = [];
      F.renderCommentList();
    });
    // 找 "测试文本, 包含" 段尾 + "继续下一段" 段首
    const target = await page.evaluate(() => {
      const F = window.__mdAnnotator;
      const view = F.State.editor.view;
      const doc = view.state.doc;
      let posA = null, posB = null;
      doc.descendants((node, p) => {
        if (node.isText) {
          if (posA === null && node.text.includes('测试文本')) posA = p + node.text.indexOf('测试文本');
          if (posB === null && node.text.includes('继续下一段')) posB = p + node.text.indexOf('继续下一段');
        }
      });
      if (posA == null || posB == null) throw new Error('找不到段落锚点');
      const sc = view.coordsAtPos(posA);
      const ec = view.coordsAtPos(posB);
      const charWidth = ec.left - sc.left || 10;
      const offset = Math.min(4, charWidth * 0.1);
      return {
        startClientX: sc.left + offset,
        startClientY: (sc.top + sc.bottom) / 2,
        endClientX: ec.left + offset,
        endClientY: (ec.top + ec.bottom) / 2,
        from: posA,
        to: posB,
        viewRect: view.dom.getBoundingClientRect(),
      };
    });

    await page.mouse.click(target.viewRect.left + 30, target.viewRect.top + 30);
    await page.waitForTimeout(100);
    await page.mouse.move(target.startClientX, target.startClientY);
    await page.mouse.down();
    // 跨段拖拽需要更长时间
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        target.startClientX + (target.endClientX - target.startClientX) * t,
        target.startClientY + (target.endClientY - target.startClientY) * t
      );
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    const sel = await page.evaluate(() => {
      const F = window.__mdAnnotator;
      const s = F.State.editor.state.selection;
      const text = F.State.editor.state.doc.textBetween(s.from, s.to, '\n', '\n');
      return { from: s.from, to: s.to, text };
    });
    console.log(`  跨段选区: from=${sel.from} to=${sel.to}`);
    console.log(`  文本片段: "${sel.text.slice(0, 30)}..."`);
    // 跨段拖拽允许 ±1 char 容差 (段边界 PM pos 偏移)
    const fromDelta = Math.abs(sel.from - target.from);
    const toDelta = Math.abs(sel.to - target.to);
    if (fromDelta > 1 || toDelta > 1) {
      throw new Error(`跨段拖拽端点偏移过大: 预期 ${target.from}~${target.to}, 实际 ${sel.from}~${sel.to} (Δ${fromDelta},${toDelta})`);
    }
    console.log(`  ✓ 跨段落拖拽 PM 端点接近 (Δ${fromDelta},${toDelta}, 容差 ≤1)`);
  }

  // === TEST D4: Esc / 失焦取消选区 ===
  console.log('=== TEST D4: 点击空白处取消选区 ===');
  {
    // 先做个选区
    await page.evaluate(() => {
      const F = window.__mdAnnotator;
      F.State.editor.view.dispatch(
        F.State.editor.state.tr.setSelection(
          F.State.editor.state.selection.constructor.create(F.State.editor.state.doc, 5, 10)
        )
      );
    });
    const beforeSel = await page.evaluate(() => {
      const s = window.__mdAnnotator.State.editor.state.selection;
      return { from: s.from, to: s.to };
    });
    if (beforeSel.from === beforeSel.to) throw new Error('前置选区应有范围');

    // 点击编辑区外空白处 (status bar 下方区域)
    const clickPos = await page.evaluate(() => {
      // 找编辑器下方无 content 的位置
      const view = window.__mdAnnotator.State.editor.view;
      const viewRect = view.dom.getBoundingClientRect();
      // 点 view DOM 内最底部 (padding 内)
      return {
        x: viewRect.left + 50,
        y: viewRect.bottom - 30,
      };
    });
    await page.mouse.click(clickPos.x, clickPos.y);
    await page.waitForTimeout(150);

    const afterSel = await page.evaluate(() => {
      const s = window.__mdAnnotator.State.editor.state.selection;
      return { from: s.from, to: s.to };
    });
    console.log(`  前置选区: from=${beforeSel.from} to=${beforeSel.to}`);
    console.log(`  点击后:   from=${afterSel.from} to=${afterSel.to}`);
    if (afterSel.from !== afterSel.to) {
      throw new Error(`点击空白处应取消选区 (空选区), 仍有范围 ${afterSel.from}~${afterSel.to}`);
    }
    console.log(`  ✓ 点击空白处 → PM selection 清空 (collapsed)`);
  }

  await browser.close();
  console.log('\n========================================');
  console.log('✓ 全部 4 个鼠标拖拽测试通过！');
  console.log(`console.errors: ${consoleErrors.length}`);
  console.log(`page.errors:    ${pageErrors.length}`);
  console.log('========================================');
  if (consoleErrors.length || pageErrors.length) {
    console.log('\n--- console errors ---');
    consoleErrors.forEach(e => console.log(' ', e));
    console.log('\n--- page errors ---');
    pageErrors.forEach(e => console.log(' ', e));
    process.exit(1);
  }
})().catch(async err => {
  console.error('\n✗ 测试失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});