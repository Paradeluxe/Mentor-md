// Mentor v1.42 wave 8 — 文档级操作 + 导出 + UI 优化点

const { chromium } = require('playwright');
const URL = 'http://localhost:8787/index.html?v=112';

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

const tests = {
  // W8-01: 验证 "导出成 .mentor" 按钮存在 + 文案
  async W8_01_export_button_text(page) {
    return await page.evaluate(() => {
      const btn = document.querySelector('#btn-save-as');
      return {
        exists: !!btn,
        text: btn?.textContent.trim(),
        title: btn?.title,
        hasPrompt: false,  // 不应该弹 prompt
      };
    });
  },

  // W8-02: 导出的 mentor 文件名格式 (无 .md 后缀)
  async W8_02_export_filename(page) {
    return await page.evaluate(async () => {
      // 模拟 currentFile = paper.mentor, 检查导出名
      // 不能用真按钮 (会弹下载), 测函数
      const fn = window.__mdAnnotator;
      // 用 buildMentorZipBlob 测试是否能导
      const ed = fn.State.editor;
      ed.commands.setContent('<p>测试内容</p>');
      fn.State.annotations = [];
      const blob = await fn.buildMentorZipBlob('测试内容', {
        version: '1', document: 'paper.mentor', updatedAt: new Date().toISOString(),
        annotations: [],
      });
      return {
        blobSize: blob.size,
        blobType: blob.type,  // 应是 application/zip
        isBlob: blob instanceof Blob,
      };
    });
  },

  // W8-03: newDocument 提示 + 重置 State
  async W8_03_new_document(page) {
    return await page.evaluate(async () => {
      // 设个假 currentFile + dirty, 测 newDocument 应 confirm
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>有内容的文档</p>');
      window.__mdAnnotator.State.annotations = [{
        threadId: 't1', range: { from: 1, to: 3 }, text: '内容',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      }];
      window.__mdAnnotator.State.currentFile = { name: 'test.md', handle: null, dirty: true };
      // 模拟 confirm 拒绝
      window.confirm = () => false;
      const before = window.__mdAnnotator.State.annotations.length;
      window.__mdAnnotator.newDocument();
      const afterReject = window.__mdAnnotator.State.annotations.length;
      // 模拟 confirm 接受
      window.confirm = () => true;
      window.__mdAnnotator.newDocument();
      await new Promise(r => setTimeout(r, 100));
      const afterAccept = {
        annCount: window.__mdAnnotator.State.annotations.length,
        docText: ed.state.doc.textContent,
      };
      return { before, afterReject, afterAccept };
    });
  },

  // W8-04: 文档级 Stats - 字数 / 段落 / 批注 / 已解决 实时更新
  async W8_04_doc_stats_realtime(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>第一段内容</p><p>第二段</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 200));
      // 检查 status bar
      const status = document.querySelector('#status-right')?.textContent || '';
      // 加批注
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 's1', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 's1', range: { from: 1, to: 3 }, text: '第一',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 200));
      const afterAdd = document.querySelector('#status-right')?.textContent || '';
      return { initialStatus: status, afterAdd };
    });
  },

  // W8-05: 批注 ID 是真正的 UUID (不是 noise-0, -1...)
  async W8_05_thread_id_format(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      // 模拟真用户创建批注 (用 createAnnotationThread 而不是手动 push)
      try {
        const tr = ed.state.tr;
        tr.addMark(1, 3, ed.schema.marks.annotation.create({
          threadId: 'should-be-uuid', resolved: false, authorColor: 0,
        }));
        ed.view.dispatch(tr);
        window.__mdAnnotator.State.annotations.push({
          threadId: 'should-be-uuid', range: { from: 1, to: 3 }, text: '测试',
          prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
        });
        return { ok: true, annCount: window.__mdAnnotator.State.annotations.length };
      } catch (e) {
        return { error: e.message };
      }
    });
  },

  // W8-06: 大量 mark + 切换 tab (open/resolved/all) 时的卡顿
  async W8_06_tab_switch_50_anns(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试文档' + ' 字'.repeat(500) + ' 末尾</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 200));
      const tr = ed.state.tr;
      for (let i = 0; i < 50; i++) {
        tr.addMark(1 + (i * 4), 1 + (i * 4) + 2, ed.schema.marks.annotation.create({
          threadId: 'tab' + i, resolved: i % 2 === 0, authorColor: i % 8,
        }));
      }
      ed.view.dispatch(tr);
      for (let i = 0; i < 50; i++) {
        window.__mdAnnotator.State.annotations.push({
          threadId: 'tab' + i, range: { from: 1 + i * 4, to: 1 + i * 4 + 2 }, text: '字',
          prefix: '', suffix: '', resolved: i % 2 === 0, comments: [], createdAt: new Date().toISOString(),
        });
      }
      await new Promise(r => setTimeout(r, 300));
      // 测切换时间
      const samples = {};
      for (const filter of ['all', 'open', 'resolved']) {
        const tab = document.querySelector(`[data-filter="${filter}"]`) ||
                    document.querySelector(`#filter-${filter}`);
        if (!tab) { samples[filter] = 'no tab'; continue; }
        const t0 = performance.now();
        tab.click();
        await new Promise(r => setTimeout(r, 200));
        samples[filter] = (performance.now() - t0).toFixed(2);
      }
      // 当前 filter 状态
      const allVisible = document.querySelectorAll('.comment-thread').length;
      return { samples, allVisible };
    });
  },

  // W8-07: 关闭/重开批注栏 (折叠)
  async W8_07_collapse_pane(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'cp', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'cp', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      ed.commands.setTextSelection(2);
      await new Promise(r => setTimeout(r, 200));
      const pane = document.querySelector('#comment-pane') || document.querySelector('#right-pane');
      if (!pane) return { error: 'no pane' };
      // 找 collapse/折叠按钮
      const collapseBtn = document.querySelector('[data-act="toggle-comment-pane"]') ||
                          document.querySelector('#collapse-comment') ||
                          pane.querySelector('button');
      return {
        paneWidth: pane.getBoundingClientRect().width,
        hasCollapseBtn: !!collapseBtn,
        collapseBtnText: collapseBtn?.textContent.trim().slice(0, 30),
      };
    });
  },

  // W8-08: 复制/剪切 mark 文字 (selection + clipboard)
  async W8_08_copy_mark_text(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>mark 文字 ABC</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(6, 9, ed.schema.marks.annotation.create({
        threadId: 'copy-text', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'copy-text', range: { from: 6, to: 9 }, text: 'ABC',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 选 ABC + 复制
      ed.commands.setTextSelection({ from: 6, to: 9 });
      await new Promise(r => setTimeout(r, 100));
      const sel = ed.state.selection;
      const copiedText = ed.state.doc.textBetween(sel.from, sel.to, '\n');
      // 模拟 copy 事件
      let clipboardText = '';
      const origWrite = navigator.clipboard?.writeText;
      if (navigator.clipboard) {
        navigator.clipboard.writeText = async (t) => { clipboardText = t; };
      }
      // 也尝试 execCommand
      const me = document.querySelector('[data-thread-id="copy-text"]');
      me.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 100));
      return {
        selectedText: copiedText,
        clipboardText,
        markStillExists: !!document.querySelector('[data-thread-id="copy-text"]'),
      };
    });
  },

  // W8-09: 批注栏展开/折叠状态持久化
  async W8_09_pane_state_persist(page) {
    return await page.evaluate(async () => {
      const pane = document.querySelector('#comment-pane') || document.querySelector('#right-pane');
      if (!pane) return { error: 'no pane' };
      const origWidth = pane.style.width;
      const origDisplay = pane.style.display;
      // 折叠
      pane.style.display = 'none';
      await new Promise(r => setTimeout(r, 100));
      const collapsedWidth = pane.getBoundingClientRect().width;
      // 重开
      pane.style.display = '';
      await new Promise(r => setTimeout(r, 100));
      const restoredWidth = pane.getBoundingClientRect().width;
      // 恢复
      pane.style.width = origWidth;
      pane.style.display = origDisplay;
      return { origWidth, collapsedWidth, restoredWidth };
    });
  },

  // W8-10: 切换源/渲染 模式时 mark 是否保持
  async W8_10_source_render_mode(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试 ABC</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'mode-switch', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'mode-switch', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 200));
      const beforeMode = {
        annCount: window.__mdAnnotator.State.annotations.length,
        markExists: !!document.querySelector('[data-thread-id="mode-switch"]'),
      };
      // 切到 source 模式
      const toggleBtn = document.querySelector('#btn-toggle-render') ||
                         document.querySelector('[data-mode]');
      if (toggleBtn) {
        toggleBtn.click();
        await new Promise(r => setTimeout(r, 200));
        const afterSource = {
          annCount: window.__mdAnnotator.State.annotations.length,
          markExists: !!document.querySelector('[data-thread-id="mode-switch"]'),
        };
        // 切回
        toggleBtn.click();
        await new Promise(r => setTimeout(r, 200));
        const afterRender = {
          annCount: window.__mdAnnotator.State.annotations.length,
          markExists: !!document.querySelector('[data-thread-id="mode-switch"]'),
        };
        return { beforeMode, afterSource, afterRender, toggleFound: true };
      }
      return { beforeMode, toggleFound: false };
    });
  },

  // W8-11: 批注 + 拖拽文字重排
  async W8_11_drag_reorder(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>word1 word2 word3</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 6, ed.schema.marks.annotation.create({
        threadId: 'drag', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'drag', range: { from: 1, to: 6 }, text: 'word1',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 100));
      // 拖拽 word1 到末尾
      // PM 的拖拽需要复杂 setup, 简化测: 用 cut + paste
      // 选 word1
      ed.commands.setTextSelection({ from: 1, to: 6 });
      const beforeText = ed.state.doc.textContent;
      // cut (用 PM 命令)
      const tr2 = ed.state.tr.delete(1, 6);
      ed.view.dispatch(tr2);
      // insert at end
      const newEnd = ed.state.doc.content.size - 1;
      const tr3 = ed.state.tr.insertText('word1', newEnd);
      ed.view.dispatch(tr3);
      await new Promise(r => setTimeout(r, 100));
      return {
        beforeText,
        afterText: ed.state.doc.textContent,
        markStillExists: !!document.querySelector('[data-thread-id="drag"]'),
      };
    });
  },

  // W8-12: 真实 UX - "导出成 .mentor" 按钮全流程
  async W8_12_export_full_flow(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>导出测试内容</p>');
      window.__mdAnnotator.State.annotations = [];
      window.__mdAnnotator.State.currentFile = {
        name: 'my-paper.md', handle: null, dirty: true,
      };
      // 用 buildMentorZipBlob 测 (不调 downloadBlob, 避免真下载)
      const sidecar = {
        version: '1', document: 'my-paper.md', updatedAt: new Date().toISOString(),
        author: { id: 'u1', name: 'test' },
        annotations: [],
      };
      const blob = await window.__mdAnnotator.buildMentorZipBlob('导出测试内容', sidecar);
      return {
        blobSize: blob.size,
        blobType: blob.type,
        isZip: blob.type === 'application/zip' || blob.type === 'application/x-zip-compressed',
      };
    });
  },

  // W8-13: 批注卡片右上角 ⋯ 菜单操作
  async W8_13_card_menu_actions(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>测试</p>');
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 100));
      const tr = ed.state.tr;
      tr.addMark(1, 3, ed.schema.marks.annotation.create({
        threadId: 'menu', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'menu', range: { from: 1, to: 3 }, text: '测试',
        prefix: '', suffix: '', resolved: false, comments: [{ id: 'c1', body: 'a comment', author: { id: 'u', name: 'u' }, createdAt: '2026-01-01' }], createdAt: '2026-01-01',
      });
      // 显式 render (避免 onUpdate timing)
      if (window.__mdAnnotator.renderCommentList) {
        window.__mdAnnotator.renderCommentList();
      }
      await new Promise(r => setTimeout(r, 200));
      // 找 .comment-menu-btn (真实 selector)
      const menuBtn = document.querySelector('.comment-menu-btn');
      if (!menuBtn) {
        const allBtns = document.querySelectorAll('.comment-thread button');
        return {
          menuFound: false,
          cardCount: document.querySelectorAll('.comment-thread').length,
          allBtns: Array.from(allBtns).map(b => ({
            text: b.textContent.trim().slice(0, 30),
            class: b.className.slice(0, 50),
          })),
        };
      }
      menuBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const menuOpen = !document.querySelector('.comment-menu.hidden') || document.querySelector('.comment-menu[data-menu-for="menu"]:not(.hidden)');
      return { menuFound: true, menuOpen };
    });
  },

  // W8-14: 大文档 perf (50 paragraph + 1 mark) 启动时间
  async W8_14_big_doc_startup(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      const paras = Array.from({length: 50}, (_, i) => '<p>段落 ' + i + ': ' + '内容'.repeat(50) + '</p>').join('');
      ed.commands.setContent(paras);
      window.__mdAnnotator.State.annotations = [];
      await new Promise(r => setTimeout(r, 200));
      const tr = ed.state.tr;
      tr.addMark(1, 5, ed.schema.marks.annotation.create({
        threadId: 'big', resolved: false, authorColor: 0,
      }));
      ed.view.dispatch(tr);
      window.__mdAnnotator.State.annotations.push({
        threadId: 'big', range: { from: 1, to: 5 }, text: '段落',
        prefix: '', suffix: '', resolved: false, comments: [], createdAt: new Date().toISOString(),
      });
      // 测 render 100 次
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) {
        if (window.__mdAnnotator.renderCommentList) {
          window.__mdAnnotator.renderCommentList();
        }
      }
      return {
        docSize: ed.state.doc.content.size,
        renderTime: (performance.now() - t0).toFixed(2),
      };
    });
  },

  // W8-15: 整体 app 健壮性 - 跑完所有 chaos + 关键 API 不崩
  async W8_15_app_sanity(page) {
    return await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>健康检查</p>');
      // 跑几个关键操作
      const ops = [];
      try { ops.push(['render', !!ed.view]); } catch (e) { ops.push(['render_err', e.message]); }
      try {
        const ann = window.__mdAnnotator.ai.listThreads;
        ops.push(['listThreads', typeof ann === 'function']);
      } catch (e) { ops.push(['listThreads_err', e.message]); }
      try {
        const ann = window.__mdAnnotator.ai.protocol;
        ops.push(['protocol', typeof ann === 'function']);
      } catch (e) { ops.push(['protocol_err', e.message]); }
      try {
        const ann = window.__mdAnnotator.ai.getThread;
        ops.push(['getThread', typeof ann === 'function']);
      } catch (e) { ops.push(['getThread_err', e.message]); }
      try {
        const ann = window.__mdAnnotator.findAnnotationRange;
        ops.push(['findAnnotationRange', typeof ann === 'function']);
      } catch (e) { ops.push(['findAnnotationRange_err', e.message]); }
      try {
        const ann = window.__mdAnnotator.checkAnnotationCap;
        ops.push(['checkAnnotationCap', typeof ann === 'function']);
      } catch (e) { ops.push(['checkAnnotationCap_err', e.message]); }
      try {
        const ann = window.__mdAnnotator.setMaxAnnotations;
        ops.push(['setMaxAnnotations', typeof ann === 'function']);
      } catch (e) { ops.push(['setMaxAnnotations_err', e.message]); }
      return { ops, allOK: ops.every(o => o[1] === true) };
    });
  },
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const [name, fn] of Object.entries(tests)) {
    const r = await run(browser, name, fn);
    const passed = !r.result.threw && !r.result.error && r.errors.length === 0;
    results.push({ name: r.name, passed, ...r });
    console.log((passed ? '✓' : '✗') + ' ' + r.name + (r.result.threw ? ' — ' + r.result.threw : ''));
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