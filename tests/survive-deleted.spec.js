// 测 deleted ann 的完整流程
// 1. 创建批注
// 2. 删 mark 内文字 → 标 deleted
// 3. 点 "重新选择正文" → 状态 = awaiting
// 4. 选新文字 + Enter → mark 重新加, ann 状态恢复
// 5. 验证 ann 不再 deleted

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [err]', e.message));
  await page.goto('http://localhost:8765/index.html?v=114', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const results = [];
  function step(name, ok, info) {
    results.push({ name, ok, info });
    console.log((ok ? '✓' : '✗') + ' ' + name + ': ' + JSON.stringify(info).slice(0, 300));
  }

  try {
    // T1: 创建 + 删 → deleted 状态
    const t1 = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>原始AAAAA内容</p>');
      window.__mdAnnotator.State.annotations = [];
      const tr = ed.state.tr;
      tr.addMark(3, 8, ed.schema.marks.annotation.create({
        threadId: 'reattach-test', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'reattach-test', range: { from: 3, to: 8 }, text: 'AAAAA',
        prefix: '原始', suffix: '内容', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 选 mark 范围并删
      ed.commands.setTextSelection({ from: 3, to: 8 });
      ed.commands.deleteSelection();
      await new Promise(r => setTimeout(r, 200));
      // 手动调 validate
      const ann = window.__mdAnnotator.State.annotations[0];
      const oldFn = window.__mdAnnotator._validateMarksAfterEdit;
      if (oldFn) oldFn(ed);
      return {
        annDeleted: ann.deleted,
        annFuzzy: ann.fuzzy,
        annInvalid: ann.invalid,
        annInvalidReason: ann.invalidReason,
        docText: ed.state.doc.textContent,
      };
    });
    step('T1_text_deleted_sets_deleted_state',
      t1.annDeleted === true && t1.annFuzzy === false && t1.annInvalidReason === 'text-deleted',
      t1);

    // T2: 显示 deleted banner + reattach 按钮
    const t2 = await page.evaluate(() => {
      if (window.__mdAnnotator.renderCommentList) window.__mdAnnotator.renderCommentList();
      const card = document.querySelector('.comment-thread[data-thread="reattach-test"]');
      const banner = card?.querySelector('.deleted-banner');
      const reattachBtn = card?.querySelector('[data-act="reattach"]');
      const deleteBtn = card?.querySelector('[data-act="delete-orphan"]');
      return {
        hasDeletedClass: card?.classList.contains('is-deleted'),
        hasFuzzyClass: card?.classList.contains('is-fuzzy'),
        bannerText: banner?.textContent.trim(),
        hasReattachBtn: !!reattachBtn,
        hasDeleteOrphanBtn: !!deleteBtn,
      };
    });
    step('T2_deleted_banner_and_buttons',
      t2.hasDeletedClass && !t2.hasFuzzyClass && t2.hasReattachBtn && t2.hasDeleteOrphanBtn,
      t2);

    // T3: 点 reattach → State.reattachTarget = tid
    const t3 = await page.evaluate(() => {
      const btn = document.querySelector('[data-act="reattach"]');
      btn.click();
      return {
        reattachTarget: window.__mdAnnotator.State.reattachTarget,
        cardAwaiting: document.querySelector('.comment-thread.awaiting-reattach') !== null,
      };
    });
    step('T3_startReattach_sets_state',
      t3.reattachTarget === 'reattach-test' && t3.cardAwaiting,
      t3);

    // T4: 选新文字 + Enter → applyReattach
    const t4 = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      // 选新的范围 (BBB)
      ed.commands.setTextSelection({ from: 1, to: 4 });  // "原" (after deletion: "原始内容" → pos 1-3 is "原始")
      await new Promise(r => setTimeout(r, 100));
      // 模拟 Enter 按下
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const ann = window.__mdAnnotator.State.annotations[0];
      return {
        annDeleted: ann.deleted,
        annFuzzy: ann.fuzzy,
        annText: ann.text,
        annRange: ann.range,
        reattachTarget: window.__mdAnnotator.State.reattachTarget,
        docText: ed.state.doc.textContent,
        markInDoc: (() => {
          const markType = ed.schema.marks.annotation;
          let found = false;
          ed.state.doc.descendants((node, pos) => {
            if (node.isText && node.marks.some(m => m.type === markType && m.attrs.threadId === 'reattach-test')) {
              found = true;
            }
          });
          return found;
        })(),
      };
    });
    step('T4_applyReattach_recovers_ann',
      t4.annDeleted === false && t4.annFuzzy === false && t4.reattachTarget === null && t4.markInDoc && t4.annText && t4.annText.length > 0,
      t4);

    // T5: 再次删 mark 文字 → deleted 状态
    const t5 = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      const ann = window.__mdAnnotator.State.annotations[0];
      if (ann.range) {
        ed.commands.setTextSelection({ from: ann.range.from, to: ann.range.to });
        ed.commands.deleteSelection();
        await new Promise(r => setTimeout(r, 200));
        // 重新 validate
        if (window.__mdAnnotator._validateMarksAfterEdit) {
          window.__mdAnnotator._validateMarksAfterEdit(ed);
        }
      }
      return {
        annDeleted: ann.deleted,
        annInvalidReason: ann.invalidReason,
      };
    });
    step('T5_second_delete_again_deleted',
      t5.annDeleted === true,
      t5);

    // T6: delete-orphan 真删
    const t6 = await page.evaluate(() => {
      window.confirm = () => true;
      const before = window.__mdAnnotator.State.annotations.length;
      const btn = document.querySelector('[data-act="delete-orphan"]');
      btn.click();
      return {
        before,
        after: window.__mdAnnotator.State.annotations.length,
      };
    });
    step('T6_delete_orphan_removes_ann',
      t6.before === 1 && t6.after === 0,
      t6);

    // T7: Esc 取消 reattach
    const t7 = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>一段文字</p>');
      window.__mdAnnotator.State.annotations = [];
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'esc-test', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'esc-test', range: { from: 1, to: 3 }, text: '一段',
        prefix: '', suffix: '文字', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 删 mark 内文字 → deleted
      ed.commands.setTextSelection({ from: 1, to: 3 });
      ed.commands.deleteSelection();
      await new Promise(r => setTimeout(r, 200));
      // 点 reattach
      if (window.__mdAnnotator.renderCommentList) window.__mdAnnotator.renderCommentList();
      document.querySelector('[data-act="reattach"]').click();
      const before = window.__mdAnnotator.State.reattachTarget;
      // Esc
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      return {
        before,
        after: window.__mdAnnotator.State.reattachTarget,
      };
    });
    step('T7_esc_cancels_reattach',
      t7.before === 'esc-test' && t7.after === null,
      t7);

  } catch (e) {
    step('FATAL', false, { error: e.message });
  }

  console.log('---');
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`TOTAL: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });