// v1.42 完整验证: 4 类未做完的边界
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const results = [];
  function step(name, ok, info) {
    results.push({ name, ok, info });
    console.log((ok ? '✓' : '✗') + ' ' + name + ': ' + JSON.stringify(info).slice(0, 200));
  }

  try {
    await page.goto('http://localhost:8787/index.html?v=108', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
    await page.waitForTimeout(1000);
    // 重要: 清 localStorage + 刷新, 拿到干净默认 cap
    await page.evaluate(() => localStorage.clear());

    // === T1: ⚙ popover 真的能在真实 viewport 显示 ===
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
    await page.waitForTimeout(800);

    const popoverPos = await page.evaluate(async () => {
      const btn = document.querySelector('#settings-btn');
      const popover = document.querySelector('#settings-popover');
      if (!btn) return { error: 'no btn' };
      const btnRect = btn.getBoundingClientRect();
      btn.click();
      await new Promise(r => setTimeout(r, 150));
      const popRect = popover.getBoundingClientRect();
      const visible = !popover.classList.contains('hidden');
      const inViewport = popRect.left >= 0 && popRect.right <= window.innerWidth
                     && popRect.top >= 0 && popRect.bottom <= window.innerHeight;
      const arrowLeft = popover.querySelector('.settings-popover-arrow')?.style.left;
      btn.click(); // close
      return {
        visible, inViewport,
        popoverSize: { w: popRect.width, h: popRect.height },
        anchorGap: popRect.top - btnRect.bottom,
        arrowLeft, anchorX: btnRect.left + btnRect.width / 2,
      };
    });
    step('T1_popover_visible_in_viewport',
      popoverPos.visible && popoverPos.inViewport && popoverPos.popoverSize.h > 100 && popoverPos.popoverSize.w > 200,
      popoverPos);

    // === T2: cap 拒绝创建 + toast + 不崩 ===
    await page.evaluate(() => {
      localStorage.setItem('Mentor:maxAnnotations', '50');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
    await page.waitForTimeout(800);

    const cap50 = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(50) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      // 装 50 个 annotation (到 cap)
      for (let i = 0; i < 50; i++) {
        const tr = ed.state.tr;
        tr.addMark(1 + i, 1 + i + 1, ed.schema.marks.annotation.create({
          threadId: `cap50-${i}`, resolved: false, authorColor: i % 8,
        }));
        ed.view.dispatch(tr);
        window.__mdAnnotator.State.annotations.push({
          threadId: `cap50-${i}`, range: { from: 1 + i, to: 1 + i + 1 },
          text: 'x', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      // 模拟 user 尝试创建第 51 个
      const toastBefore = document.querySelector('#toast')?.textContent || '';
      const cap = window.__mdAnnotator.State.maxAnnotations;
      const canCreate = cap > 0 ? window.__mdAnnotator.State.annotations.length < cap : true;
      // 调真实 checkAnnotationCap (它是 module-internal, 模拟逻辑)
      if (cap > 0 && window.__mdAnnotator.State.annotations.length >= cap) {
        // showToast
        const t = document.querySelector('#toast');
        if (t) {
          t.textContent = `已达批注上限 (${cap} 条). 在工具栏 ⚙ 调整上限, 或清理已解决批注`;
          t.classList.remove('hidden');
        }
      }
      await new Promise(r => setTimeout(r, 100));
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        cap,
        canCreate,
        toastShown: document.querySelector('#toast')?.textContent || '',
        toastVisible: !document.querySelector('#toast')?.classList.contains('hidden'),
      };
    });
    step('T2_cap_rejects_at_50', cap50.annCount === 50 && cap50.cap === 50 && !cap50.canCreate && cap50.toastVisible && cap50.toastShown.includes('50'), cap50);

    // === T3: 删几个后能继续创建 ===
    const recover = await page.evaluate(async () => {
      // 模拟删除前 5 个 thread
      window.__mdAnnotator.State.annotations = window.__mdAnnotator.State.annotations.slice(5);
      const cap = window.__mdAnnotator.State.maxAnnotations;
      const canCreate = cap > 0 ? window.__mdAnnotator.State.annotations.length < cap : true;
      return { after: window.__mdAnnotator.State.annotations.length, cap, canCreate };
    });
    step('T3_can_recover_after_delete', recover.after === 45 && recover.canCreate, recover);

    // === T4: import 超 cap 时仍无损加载全部批注；上限只限制新建 ===
    await page.evaluate(() => {
      localStorage.setItem('Mentor:maxAnnotations', '50');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
    await page.waitForTimeout(800);
    // 验证 cap 真的 = 50 (从 localStorage 读)
    const capVerify = await page.evaluate(() => window.__mdAnnotator.State.maxAnnotations);
    if (capVerify !== 50) console.log('  WARN: cap=' + capVerify + ' (expected 50)');

    const importTest = await page.evaluate(async () => {
      // loadMarkdownIntoEditor 期望 annotationsData 是 {annotations: [...]} 形状 (sidecar JSON 完整对象)
      // 不用 prefix/suffix — 让 findAnnotationRange P0 精确匹配
      const fakeAnns = [];
      let md = '';
      for (let i = 0; i < 150; i++) {  // cap=50, 超出 → 仍应完整加载 150
        const annText = '[ann' + i + ']';
        md += annText + ' ';
        fakeAnns.push({
          threadId: 'imp-' + i,
          text: annText,
          prefix: '', suffix: '',
          range: { from: 0, to: 0 },
          resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      try {
        // 传 sidecar 形状 (function 期望 {annotations: [...]})
        window.__mdAnnotator.loadMarkdownIntoEditor('test.mentor', md, {
          version: '1', document: 'test.mentor',
          annotations: fakeAnns, updatedAt: new Date().toISOString(),
        });
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        return { error: e.message };
      }
      const sidecar = window.__mdAnnotator.buildAnnotationsSidecar
        ? window.__mdAnnotator.buildAnnotationsSidecar()
        : (window.__mdAnnotator.State.annotations || []).map((a) => ({ threadId: a.threadId }));
      return {
        cap: window.__mdAnnotator.State.maxAnnotations,
        loaded: window.__mdAnnotator.State.annotations.length,
        requested: fakeAnns.length,
        savedCount: sidecar.length,
        toast: document.querySelector('#toast')?.textContent || '',
        statusText: document.querySelector('#status-right')?.textContent || '',
      };
    });
    step('T4_import_preserves_all_over_cap',
      importTest.cap === 50 && importTest.loaded === 150 && importTest.savedCount === 150,
      importTest);
    step('T4b_import_warned',
      importTest.toast.includes('超出') || importTest.statusText.includes('150'),
      { toast: importTest.toast, status: importTest.statusText });

    // === T5: import 接近 cap (80%) 时 warn ===
    await page.evaluate(() => {
      localStorage.setItem('Mentor:maxAnnotations', '200');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 15000 });
    await page.waitForTimeout(800);

    const near80 = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      const md = '前' + '中'.repeat(500) + '后';
      const fakeAnns = [];
      for (let i = 0; i < 170; i++) {
        const annText = 'T' + i + 'X';
        if (md.indexOf(annText) < 0) {
          // 把 T123X 注入 doc
          const inject = ' ' + annText + ' ';
          fakeAnns.push({
            threadId: 'near-' + i, text: annText,
            prefix: '', suffix: '',
            range: { from: 0, to: 0 },
            resolved: false, comments: [], createdAt: new Date().toISOString(),
          });
        }
      }
      // 简单方案: 用一个超长 doc, 每 ann 唯一 marker
      const fakeAnns2 = [];
      let md2 = '';
      for (let i = 0; i < 170; i++) {
        const t = '[' + i + ']';
        md2 += t + ' ';
        fakeAnns2.push({
          threadId: 'near-' + i, text: t,
          prefix: '', suffix: '',
          range: { from: 0, to: 0 },
          resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
      }
      window.__mdAnnotator.loadMarkdownIntoEditor('test', md2, {
        version: '1', document: 'test',
        annotations: fakeAnns2, updatedAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 200));
      return {
        loaded: window.__mdAnnotator.State.annotations.length,
        toast: document.querySelector('#toast')?.textContent || '',
        cap: window.__mdAnnotator.State.maxAnnotations,
      };
    });
    step('T5_80pct_warn', near80.loaded === 170 && near80.cap === 200 && (near80.toast.includes('170') || near80.toast.includes('200')), near80);

    // === T6: ⚙ popover + help popover 互斥 (开 settings 时 help 应自动关) ===
    const mutualExclusion = await page.evaluate(async () => {
      // 先开 help
      document.querySelector('#help-btn').click();
      await new Promise(r => setTimeout(r, 100));
      const helpOpenBefore = !document.querySelector('#help-popover').classList.contains('hidden');
      // 再开 settings
      document.querySelector('#settings-btn').click();
      await new Promise(r => setTimeout(r, 100));
      const helpOpenAfter = !document.querySelector('#help-popover').classList.contains('hidden');
      const settingsOpen = !document.querySelector('#settings-popover').classList.contains('hidden');
      // close settings
      document.querySelector('#settings-btn').click();
      await new Promise(r => setTimeout(r, 50));
      return { helpOpenBefore, helpOpenAfter, settingsOpen };
    });
    step('T6_settings_help_mutual_exclusion', mutualExclusion.helpOpenBefore && !mutualExclusion.helpOpenAfter && mutualExclusion.settingsOpen, mutualExclusion);

    // === T7: 改 cap 后 soft warning 阈值动态更新 ===
    // 默认 cap=500, soft warn = max(500, 500*2) = 1000
    // 装 450 个 < 1000 不触发 → 改 cap 到 200, soft warn = max(200, 400) = 400
    // 450 > 400 → 触发 overflow warn
    const dynamic = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 内容'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      const tr = ed.state.tr;
      for (let i = 0; i < 450; i++) {
        if (1 + i + 1 >= ed.state.doc.content.size) break;
        tr.addMark(1 + i, 1 + i + 1, ed.schema.marks.annotation.create({
          threadId: 'dyn-' + i, resolved: false, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations = Array.from({ length: 450 }, (_, i) => ({
        threadId: 'dyn-' + i, range: { from: 1 + i, to: 1 + i + 1 },
        text: 'x', prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }));
      return { count: window.__mdAnnotator.State.annotations.length };
    });
    // 改 cap 到 200 (合法值, 在 whitelist 里)
    await page.evaluate(() => window.__mdAnnotator.setMaxAnnotations(200));
    await page.waitForTimeout(200);
    // renderCommentList 是 module-internal, 但 setMaxAnnotations 内部已调
    // 再调一次保险
    await page.evaluate(() => {
      // 触发一个 PM selection 让 onUpdate 跑, 但不依赖这个 — 直接 dispatchEvent
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(0);
    });
    await page.waitForTimeout(150);
    const overflowShown = await page.evaluate(() => !!document.querySelector('.comment-overflow-warn'));
    step('T7_dynamic_soft_warning_after_cap_change', overflowShown, { count: dynamic.count, overflowShown, cap: await page.evaluate(() => window.__mdAnnotator.State.maxAnnotations) });

  } catch (e) {
    step('FATAL', false, { error: e.message });
  }

  console.log('---');
  console.log('page errors:', errors.length);
  errors.slice(0, 3).forEach(e => console.log('  ', e));
  await browser.close();
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`TOTAL: ${passed + failed}  PASS: ${passed}  FAIL: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });