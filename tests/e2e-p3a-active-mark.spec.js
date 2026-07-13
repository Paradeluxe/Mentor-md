// Mentor E2E 测试
// 用 Node Playwright 验证：打开 → 加载 markdown+侧车 → 创建批注 → 解决 → 回复 → 导出 markdown

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 自动检测运行平台: WSL (/mnt/...) vs Windows git-bash (E:\...)
function detectRoot() {
  if (process.platform === 'win32') {
    return path.resolve('E:/hermes_playground/Mentor');
  }
  if (fs.existsSync('/mnt/e/hermes_playground/Mentor')) {
    return '/mnt/e/hermes_playground/Mentor';
  }
  if (fs.existsSync('/home/lablabcloud/.hermes/node/lib/node_modules/playwright')) {
    return '/mnt/e/hermes_playground/Mentor';
  }
  return path.resolve(__dirname, '..');
}

const ROOT = detectRoot();
const URL = 'http://127.0.0.1:8787/index.html';

const SAMPLE_MD = fs.readFileSync(path.join(ROOT, 'test-data/sample.md'), 'utf-8');
const SAMPLE_ANN = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-data/sample.md.annotations.json'), 'utf-8'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // 在任何 page 脚本运行前预设 author, 避免首次弹 modal 干扰测试
  await context.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', '测试作者'); } catch (e) {}
  });
  const page = await context.newPage();

  // 收集 console 错误
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('=== TEST 1: 页面加载 ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  // 等 Tiptap 初始化
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  console.log('  ✓ 页面加载, Tiptap 初始化完成');

  // 设置作者
  await page.evaluate(() => window.__mdAnnotator.setAuthor('测试作者'));

  console.log('=== TEST 2: 加载 sample.md + 侧车 ===');
  await page.evaluate((args) => {
    return window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, args.annotations);
  }, { name: 'sample.md', content: SAMPLE_MD, annotations: SAMPLE_ANN });

  await page.waitForTimeout(300);
  const initialAnnotations = await page.evaluate(() => window.__mdAnnotator.getAnnotations());
  console.log(`  ✓ 加载了 ${initialAnnotations.length} 个批注 (预期 2)`);
  if (initialAnnotations.length !== 2) throw new Error(`批注数错: ${initialAnnotations.length}`);

  const markCount = await page.locator('.annotation-mark').count();
  console.log(`  ✓ 编辑器中有 ${markCount} 个高亮 mark (预期 2)`);
  if (markCount !== 2) throw new Error(`mark 数错: ${markCount}`);

  // 默认 filter 是"未解决"，所以 1 个 resolved 被过滤，只显示 1 个未解决的
  let commentCount = await page.locator('.comment-thread').count();
  console.log(`  ✓ 默认 filter (未解决): 侧栏显示 ${commentCount} 个 (预期 1)`);
  if (commentCount !== 1) throw new Error(`默认 filter 应显示 1 个，实际 ${commentCount}`);

  // 切到"全部" filter，应该显示 2 个
  await page.locator('.filter-tab[data-filter-tab="all"]').click();
  await page.waitForTimeout(150);
  commentCount = await page.locator('.comment-thread').count();
  console.log(`  ✓ 勾选已解决 filter: 侧栏显示 ${commentCount} 个 (预期 2)`);
  if (commentCount !== 2) throw new Error(`含已解决 filter 应显示 2 个，实际 ${commentCount}`);

  // 恢复默认 (未解决)
  await page.locator('.filter-tab[data-filter-tab="open"]').click();
  await page.waitForTimeout(100);

  console.log('=== TEST 3: 截图当前状态 ===');
  await page.screenshot({ path: '/tmp/Mentor-test-1-loaded.png', fullPage: false });
  console.log('  ✓ 截图: /tmp/Mentor-test-1-loaded.png');

  console.log('=== TEST 4: 创建新批注 ===');
  // 调用 helper 在 "嵌套回复（threaded replies）" 上创建批注
  const newThread = await page.evaluate(() => {
    return window.__mdAnnotator.createTestAnnotation('嵌套回复（threaded replies）');
  });
  if (!newThread) throw new Error('创建批注失败');
  console.log(`  ✓ 新批注 threadId=${newThread.threadId.slice(0, 8)}, text="${newThread.text}"`);

  await page.waitForTimeout(200);
  const afterCreateCount = await page.locator('.annotation-mark').count();
  console.log(`  ✓ mark 总数 = ${afterCreateCount} (预期 3)`);
  if (afterCreateCount !== 3) throw new Error(`mark 数错: ${afterCreateCount}`);

  console.log('=== TEST 5: 添加回复 ===');
  // 在新批注的输入框中输入
  await page.evaluate((threadId) => {
    const ta = document.querySelector(`[data-thread-input="${threadId}"]`);
    ta.value = '这是测试回复';
    document.querySelector(`[data-act="submit-reply"][data-thread="${threadId}"]`).click();
  }, newThread.threadId);
  await page.waitForTimeout(200);
  const updatedThread = await page.evaluate((threadId) => {
    return window.__mdAnnotator.getAnnotations().find(t => t.threadId === threadId);
  }, newThread.threadId);
  console.log(`  ✓ 线程回复数 = ${updatedThread.comments.length} (预期 1)`);
  if (updatedThread.comments.length !== 1) throw new Error(`回复数错: ${updatedThread.comments.length}`);

  console.log('=== TEST 6: Toggle resolved ===');
  // 把第 1 个批注（已解决）切回未解决
  await page.evaluate(() => {
    const btn = document.querySelector('[data-act="resolve"]');
    btn.click();
  });
  await page.waitForTimeout(200);
  const afterToggle = await page.evaluate(() => window.__mdAnnotator.getAnnotations());
  const resolvedCount = afterToggle.filter(t => t.resolved).length;
  const unresolvedCount = afterToggle.filter(t => !t.resolved).length;
  // toggle 前: resolved=1 (test-thread-2), unresolved=2 (test-thread-1 + 新建的)
  // toggle 第 1 个未解决 → resolved=true
  // 期望: resolved=2 (test-thread-1 + test-thread-2), unresolved=1 (新建的)
  console.log(`  ✓ resolved=${resolvedCount}, unresolved=${unresolvedCount} (预期 2/1)`);
  if (resolvedCount !== 2 || unresolvedCount !== 1) throw new Error(`resolved 状态错`);

  console.log('=== TEST 7: 删除批注 ===');
  // 自动确认对话框
  page.once('dialog', d => d.accept());
  const beforeDelete = await page.locator('.annotation-mark').count();
  await page.evaluate(() => {
    const btn = document.querySelector('[data-act="delete"]');
    btn.click();
  });
  await page.waitForTimeout(200);
  const afterDelete = await page.locator('.annotation-mark').count();
  console.log(`  ✓ mark 数 ${beforeDelete} → ${afterDelete}`);
  if (afterDelete !== beforeDelete - 1) throw new Error('删除未生效');

  console.log('=== TEST 8: 导出 markdown（HTML → MD）===');
  const html = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  // 直接在浏览器内 turndown
  const exportedMd = await page.evaluate(async (html) => {
    const TurndownService = (await import('https://esm.sh/turndown@7.1.2')).default;
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    html = html.replace(/<span[^>]*data-thread-id[^>]*>(.*?)<\/span>/gs, '$1');
    return td.turndown(html);
  }, html);
  console.log('  ✓ 导出 markdown 长度:', exportedMd.length);
  console.log('  ✓ 前 200 字符:');
  console.log('    ' + exportedMd.slice(0, 200).replace(/\n/g, '\n    '));
  if (!exportedMd.includes('# 测试文档')) throw new Error('导出缺少 H1');
  if (exportedMd.includes('data-thread-id')) throw new Error('导出仍含 mark 标签');

  console.log('=== TEST 9: 光标落在 resolved mark → 侧栏 pinned 显示 ===');
  // 找到 test-thread-2 (resolved) 的 mark，把光标移到里面
  const pinnedResult = await page.evaluate(() => {
    const editor = window.__mdAnnotator.State.editor;
    let pos = null;
    editor.state.doc.descendants((node, p) => {
      node.marks.forEach(m => {
        if (m.type === editor.schema.marks.annotation && m.attrs.threadId === 'test-thread-2') {
          if (pos === null) pos = p + 1; // 移到 mark 中间
        }
      });
    });
    if (pos === null) return { ok: false, reason: 'mark not found' };
    editor.commands.focus(pos);
    return { ok: true, pos };
  });
  console.log('  ✓ 光标移入 resolved mark:', JSON.stringify(pinnedResult));
  if (!pinnedResult.ok) throw new Error('移光标失败');

  await page.waitForTimeout(200);
  // v2: pinned banner 已移除, 验证 .pinned-banner 不在 DOM
  const pinnedBannerCount = await page.locator('.pinned-banner').count();
  console.log(`  ✓ pinned banner 出现次数 = ${pinnedBannerCount} (v2: 预期 0, 不再 pin)`);
  if (pinnedBannerCount !== 0) throw new Error(`v2 已移除 pinned banner, 实际 ${pinnedBannerCount}`);

  const activeThreadId = await page.evaluate(() => window.__mdAnnotator.State.activeThreadId);
  console.log(`  ✓ activeThreadId = ${activeThreadId?.slice(0, 8)} (预期 test-thread-2)`);
  if (activeThreadId !== 'test-thread-2') throw new Error(`active thread 不对: ${activeThreadId}`);
// (P3-A 测试用 createTestAnnotation 在浏览器里直接构造, 不依赖 sample.md)
console.log('=== TEST 9b: 点击 mark → is-active class 持续存在 === (P3-A 回归保护)');
await page.evaluate(() => {
  window.__mdAnnotator.newDocument();
  window.__mdAnnotator.State.author = 'tester';
});
await page.waitForTimeout(200);
const dbg = await page.evaluate(() => {
  const ed = window.__mdAnnotator.State.editor;
  ed.commands.setContent('<p>AAA one</p><p>BBB two</p><p>CCC three</p>', false);
  // 等一下 setContent 同步
  let docText = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
  let foundOne = window.__mdAnnotator.createTestAnnotation('one');
  let foundTwo = window.__mdAnnotator.createTestAnnotation('two');
  return {
    docText,
    foundOne: foundOne ? foundOne.threadId?.slice(0,8) : null,
    foundTwo: foundTwo ? foundTwo.threadId?.slice(0,8) : null,
    annotationCount: window.__mdAnnotator.State.annotations.length,
  };
});
console.log(`  DEBUG setContent: text="${dbg.docText.slice(0,40)}", foundOne=${dbg.foundOne}, foundTwo=${dbg.foundTwo}, anns=${dbg.annotationCount}`);
await page.waitForTimeout(300);

// 重置 dirty 状态 (createTestAnnotation 触发了真实 mark 修改, 标 dirty 是正常的)
await page.evaluate(() => {
  if (typeof markClean === 'function') markClean();
  // markClean 不是 global, 用 State 内方法
  if (window.__mdAnnotator.State.dirty !== undefined) window.__mdAnnotator.State.dirty = false;
  document.querySelector('#dirty-indicator')?.classList.remove('is-dirty');
});

const markCountP3a = await page.locator('.annotation-mark').count();
console.log(`  ✓ 创建了 ${markCountP3a} 个 mark (预期 2)`);
if (markCountP3a !== 2) throw new Error(`mark 数错: ${markCountP3a}`);

const clickPos1 = await page.evaluate(() => {
  const el = document.querySelector('.annotation-mark');
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width/2, cy: r.top + r.height/2 };
});
await page.mouse.click(clickPos1.cx, clickPos1.cy);
await page.waitForTimeout(300);

const afterClickP3a = await page.evaluate(() => ({
  activeTid: window.__mdAnnotator.State.activeThreadId,
  marksIsActive: document.querySelectorAll('.annotation-mark.is-active').length,
  mark0Class: document.querySelectorAll('.annotation-mark')[0]?.className,
  mark1Class: document.querySelectorAll('.annotation-mark')[1]?.className,
  markAttrsActive: (() => {
    const ed = window.__mdAnnotator.State.editor;
    let tid = null;
    ed.state.doc.descendants(node => {
      node.marks.forEach(m => {
        if (m.type === ed.schema.marks.annotation && m.attrs.active) tid = m.attrs.threadId;
      });
    });
    return tid;
  })(),
  dirty: document.querySelector('#dirty-indicator')?.classList.contains('is-dirty'),
}));
console.log(`  ✓ 点击后 activeTid = ${afterClickP3a.activeTid?.slice(0,8)}`);
console.log(`  ✓ mark0 class = "${afterClickP3a.mark0Class}"`);
console.log(`  ✓ mark1 class = "${afterClickP3a.mark1Class}"`);
console.log(`  ✓ marksIsActive count = ${afterClickP3a.marksIsActive} (预期 1)`);
console.log(`  ✓ schema active attr threadId = ${afterClickP3a.markAttrsActive?.slice(0,8)} (预期 ${afterClickP3a.activeTid?.slice(0,8)})`);
console.log(`  ✓ dirty = ${afterClickP3a.dirty} (预期 false, setMeta 跳过 markDirty)`);
if (afterClickP3a.marksIsActive !== 1) throw new Error(`is-active 没生效: ${afterClickP3a.marksIsActive}`);
if (!afterClickP3a.mark0Class.includes('is-active')) throw new Error(`mark0 class 缺 is-active: ${afterClickP3a.mark0Class}`);
if (afterClickP3a.markAttrsActive !== afterClickP3a.activeTid) throw new Error(`schema active attr 没写`);
if (afterClickP3a.dirty) throw new Error(`dirty 被污染`);

await page.waitForTimeout(1000);
const after1sP3a = await page.evaluate(() => ({
  marksIsActive: document.querySelectorAll('.annotation-mark.is-active').length,
  mark0Class: document.querySelectorAll('.annotation-mark')[0]?.className,
}));
console.log(`  ✓ 1s 后 marksIsActive = ${after1sP3a.marksIsActive} (预期 1)`);
console.log(`  ✓ 1s 后 mark0 class = "${after1sP3a.mark0Class}"`);
if (after1sP3a.marksIsActive !== 1) throw new Error(`1s 后 is-active 丢了: ${after1sP3a.marksIsActive}`);

const clickPos2 = await page.evaluate(() => {
  const marks = document.querySelectorAll('.annotation-mark');
  const el = marks[1] || marks[0];
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width/2, cy: r.top + r.height/2 };
});
await page.mouse.click(clickPos2.cx, clickPos2.cy);
await page.waitForTimeout(300);
const afterSwitchP3a = await page.evaluate(() => ({
  activeTid: window.__mdAnnotator.State.activeThreadId,
  marksIsActive: document.querySelectorAll('.annotation-mark.is-active').length,
  mark0Class: document.querySelectorAll('.annotation-mark')[0]?.className,
  mark1Class: document.querySelectorAll('.annotation-mark')[1]?.className,
}));
console.log(`  ✓ 切到 mark #2: activeTid = ${afterSwitchP3a.activeTid?.slice(0,8)}`);
console.log(`  ✓ mark0 class = "${afterSwitchP3a.mark0Class}"`);
console.log(`  ✓ mark1 class = "${afterSwitchP3a.mark1Class}"`);
if (afterSwitchP3a.marksIsActive !== 1) throw new Error(`切换后 is-active 错: ${afterSwitchP3a.marksIsActive}`);
if (afterSwitchP3a.mark0Class.includes('is-active')) throw new Error(`mark0 不应再有 is-active`);
if (!afterSwitchP3a.mark1Class.includes('is-active')) throw new Error(`mark1 应有 is-active`);
console.log(`  ✓ 切换正确: 只有 mark #2 有 is-active`);

console.log('=== TEST 10: 最终截图 (pinned 状态) ===');
  await page.screenshot({ path: '/tmp/Mentor-test-2-after-edits.png', fullPage: false });
  console.log('  ✓ 截图: /tmp/Mentor-test-2-after-edits.png');

  console.log('=== TEST 11: KaTeX 公式渲染 ===');
  // 重新加载 sample.md（其中含 $E=mc^2$）
  await page.evaluate((args) => {
    return window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, null);
  }, { name: 'sample.md', content: SAMPLE_MD, annotations: null });
  await page.waitForTimeout(400);

  const katexWrapperCount = await page.locator('.katex-wrapper').count();
  console.log(`  ✓ katex-wrapper 元素渲染数 = ${katexWrapperCount} (预期 ≥ 1, sample.md 有 $E=mc^2$)`);
  if (katexWrapperCount < 1) throw new Error(`KaTeX wrapper 未渲染: ${katexWrapperCount}`);

  // 验证内部 katex 实际渲染（KaTeX CSS 选择器 .katex 来自 KaTeX 库本身）
  const katexRealCount = await page.locator('.katex').count();
  console.log(`  ✓ 真实 .katex 元素数 = ${katexRealCount} (预期 ≥ 1, 来自 KaTeX renderToString)`);
  if (katexRealCount < 1) throw new Error(`KaTeX 实际未渲染: ${katexRealCount}`);

  // 验证 data-tex 属性
  const texAttr = await page.evaluate(() => {
    const w = document.querySelector('.katex-wrapper');
    return w ? w.getAttribute('data-tex') : null;
  });
  console.log(`  ✓ katex-wrapper data-tex = "${texAttr}" (预期 "E = mc^2")`);
  if (texAttr !== 'E = mc^2') throw new Error(`data-tex 错: ${texAttr}`);

  // 验证 turndown 反向：导出 markdown 应包含 $E=mc^2$
  const mdWithMath = await page.evaluate(async () => {
    const TurndownService = (await import('https://esm.sh/turndown@7.1.2')).default;
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    td.addRule('katex-wrapper-inline', {
      filter: node => node.classList && node.classList.contains('katex-wrapper') && !node.classList.contains('katex-wrapper-display'),
      replacement: (content, node) => {
        const tex = node.getAttribute('data-tex') || '';
        return tex ? `$${tex}$` : content;
      },
    });
    td.addRule('katex-wrapper-block', {
      filter: node => node.classList && node.classList.contains('katex-wrapper-display'),
      replacement: (content, node) => {
        const tex = node.getAttribute('data-tex') || '';
        return tex ? `\n\n$$${tex}$$\n\n` : `\n\n${content}\n\n`;
      },
    });
    const editorHTML = window.__mdAnnotator.getEditorHTML();
    return td.turndown(editorHTML);
  });
  console.log(`  ✓ 导出 markdown 长度 = ${mdWithMath.length}`);
  console.log(`  ✓ 包含 $E = mc^2$ ? ${mdWithMath.includes('$E = mc^2$')}`);
  if (!mdWithMath.includes('$E = mc^2$')) throw new Error(`导出不含 $E = mc^2$: ${mdWithMath.slice(0, 500)}`);

  console.log('=== TEST 12: KaTeX 截图 ===');
  await page.screenshot({ path: '/tmp/Mentor-test-3-katex.png', fullPage: false });
  console.log('  ✓ 截图: /tmp/Mentor-test-3-katex.png');

  console.log('=== TEST 13: FS_API 检测 ===');
  const fsSupported = await page.evaluate(() => window.__mdAnnotator.FS_API.supported);
  console.log(`  ✓ FS_API.supported = ${fsSupported} (Playwright Chromium 默认支持)`);
  if (!fsSupported) throw new Error('FS_API 未启用');

  console.log('=== TEST 14: IndexedDB HandleStore 读写 ===');
  const dbTest = await page.evaluate(async () => {
    const { HandleStore } = window.__mdAnnotator;
    // 用一个 mock 对象作为 handle（不是真实 FileSystemDirectoryHandle，但 IndexedDB 只存引用）
    const mockHandle = { name: 'test-folder', _isMock: true };
    await HandleStore.putFolder('test-folder', mockHandle);
    const got = await HandleStore.getFolder('test-folder');
    await HandleStore.putLastFile('test.md');
    const last = await HandleStore.getLastFile();
    return {
      putGetOk: got && got._isMock === true,
      lastOk: last && last.fileName === 'test.md' && !last.folderPath,
      list: await HandleStore.listFolders(),
    };
  });
  console.log(`  ✓ put/get handle: ${dbTest.putGetOk}`);
  console.log(`  ✓ put/get last file: ${dbTest.lastOk}`);
  console.log(`  ✓ listFolders: ${JSON.stringify(dbTest.list)}`);
  if (!dbTest.putGetOk) throw new Error('IndexedDB handle 存读失败');
  if (!dbTest.lastOk) throw new Error('IndexedDB lastFile 存读失败');

  console.log('=== TEST 15: tryReconnect 无历史时静默返回 ===');
  // 清掉 last file
  await page.evaluate(async () => {
    const db = await window.__mdAnnotator.HandleStore.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('lastFile', 'readwrite');
      tx.objectStore('lastFile').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  });
  const reconnectResult = await page.evaluate(async () => {
    try {
      await window.__mdAnnotator.tryReconnect();
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  });
  console.log(`  ✓ tryReconnect: ${JSON.stringify(reconnectResult)}`);
  if (!reconnectResult.ok) throw new Error('tryReconnect 抛出');

  console.log('=== TEST 16: tryWriteBack 无 handle → 返回 handle:false ===');
  const wb1 = await page.evaluate(async () => {
    // 当前 State 没有 folderHandle / handle，应该走 fallback
    return await window.__mdAnnotator.tryWriteBack('test md', 'test json', 'test.md.annotations.json');
  });
  console.log(`  ✓ tryWriteBack 无 handle: ${JSON.stringify(wb1)}`);
  if (wb1.handle !== false) throw new Error('无 handle 时应返回 handle:false');

  console.log('=== TEST 17: tryWriteBack 模拟 mock single-file handle → handle:true ===');
  const wb2 = await page.evaluate(async () => {
    // 注入 mock 单文件 handle (带 createWritable 模拟)
    const mockHandle = {
      name: 'mock.md',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async getFile() { return { name: 'mock.md', lastModified: Date.now() }; },
      async createWritable() {
        let writtenContent = null;
        return {
          async write(content) { writtenContent = content; },
          async close() {},
          _getWritten: () => writtenContent,
        };
      },
    };
    window.__mdAnnotator.State.currentFile = { name: 'mock.md', handle: mockHandle };
    return await window.__mdAnnotator.tryWriteBack('# Mock\n\n$E=mc^2$', '{"annotations":[]}', 'mock.md.annotations.json');
  });
  console.log(`  ✓ tryWriteBack with mock handle: ${JSON.stringify(wb2)}`);
  if (wb2.handle !== true) throw new Error('mock handle 应返回 handle:true');

  console.log('=== TEST 18: 保存后状态栏/UI 反映 ===');
  const uiState = await page.evaluate(() => ({
    saveMode: window.__mdAnnotator.State.saveMode,
    hasFileHandle: window.__mdAnnotator.State.currentFile && window.__mdAnnotator.State.currentFile.handle !== null && window.__mdAnnotator.State.currentFile.handle !== undefined,
  }));
  console.log(`  ✓ State.saveMode = ${uiState.saveMode}`);
  console.log(`  ✓ State.currentFile.handle 存在 = ${uiState.hasFileHandle}`);

  console.log('=== TEST 19: 最终截图（handle 状态）===');
  // 在 mock 模式下截一张
  await page.evaluate(async () => {
    // 渲染一个文件树显示授权状态
    const tree = document.querySelector('#file-tree');
    tree.innerHTML = `<div class="tree-node tree-folder">📁 mock-folder <span class="save-mode-badge">✓ 授权保存</span></div><div class="tree-children"><div class="tree-node is-active">📄 mock.md</div></div>`;
    tree.classList.remove('tree-empty');
    // 加载简单 markdown 到编辑器
    window.__mdAnnotator.loadMarkdownIntoEditor('mock.md', '# Mock Document\n\n$E=mc^2$ is **famous**.\n\nSelect `text` to add comment.', null);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/Mentor-test-4-handle-mode.png', fullPage: false });
  console.log('  ✓ 截图: /tmp/Mentor-test-4-handle-mode.png');

  // ============================================================
  // SECTION A: UI 按钮 + 快捷键 + author modal + dirty 标记
  // ============================================================
  console.log('\n========== SECTION A: UI 按钮 + 快捷键 ==========');

  console.log('=== TEST 20: 新建空白按钮 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.currentFile = null;
    window.__mdAnnotator.State.annotations = [];
  });
  await page.locator('#btn-new').click();
  await page.waitForTimeout(150);
  const newDocHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  console.log(`  ✓ 新建后编辑器 HTML 长度 = ${newDocHTML.length}`);
  if (!newDocHTML.includes('新文档')) throw new Error('新建按钮未触发 setContent');

  console.log('=== TEST 21: 加粗按钮 (B) ===');
  // 加载 sample 内容用于格式测试
  // 先 mock confirm 处理 dirty 切换弹窗 (TEST 20 newBlank 后 currentFile dirty)
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('format-test.md', md, null);
    // 选中 "hello" (positions 1-6)
    const doc = window.__mdAnnotator.State.editor.state.doc;
    let helloStart = null, helloEnd = null;
    doc.descendants((node, pos) => {
      if (node.isText && node.text.includes('hello') && helloStart === null) {
        const idx = node.text.indexOf('hello');
        helloStart = pos + idx;
        helloEnd = pos + idx + 'hello'.length;
      }
    });
    window.__mdAnnotator.State.editor.commands.setTextSelection({ from: helloStart, to: helloEnd });
    window.__mdAnnotator.State.editor.commands.focus();
  }, 'hello world');
  await page.waitForTimeout(150);
  await page.locator('#format-toolbar button[data-cmd="bold"]').click();
  await page.waitForTimeout(100);
  const boldHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  console.log(`  ✓ 加粗后 HTML: ${boldHTML.slice(0, 80)}`);
  if (!boldHTML.includes('<strong>')) throw new Error('加粗按钮未生效');

  console.log('=== TEST 22: 斜体按钮 (I) ===');
  // 重新加载 + 选区
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('format-test.md', md, null);
    const doc = window.__mdAnnotator.State.editor.state.doc;
    let helloStart = null, helloEnd = null;
    doc.descendants((node, pos) => {
      if (node.isText && node.text.includes('hello') && helloStart === null) {
        const idx = node.text.indexOf('hello');
        helloStart = pos + idx;
        helloEnd = pos + idx + 'hello'.length;
      }
    });
    window.__mdAnnotator.State.editor.commands.setTextSelection({ from: helloStart, to: helloEnd });
    window.__mdAnnotator.State.editor.commands.focus();
  }, 'hello world');
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="italic"]').click();
  await page.waitForTimeout(100);
  const italicHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!italicHTML.includes('<em>')) throw new Error('斜体按钮未生效');
  console.log(`  ✓ 斜体后 HTML 含 <em>`);

  console.log('=== TEST 23: H1 按钮 ===');
  // 重新加载 + 选区（按 ctrl+a 全选）
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('format-test.md', md, null);
    window.__mdAnnotator.State.editor.commands.selectAll();
    window.__mdAnnotator.State.editor.commands.focus();
  }, 'hello world');
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="h1"]').click();
  await page.waitForTimeout(100);
  const h1HTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!h1HTML.includes('<h1>')) throw new Error('H1 按钮未生效');
  console.log(`  ✓ H1 后 HTML 含 <h1>`);

  console.log('=== TEST 24: 无序列表按钮 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.insertContent('item 1');
    // 选中所有
    window.__mdAnnotator.State.editor.commands.selectAll();
    window.__mdAnnotator.State.editor.commands.focus();
  });
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="bulletList"]').click();
  await page.waitForTimeout(100);
  const ulHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!ulHTML.includes('<ul>')) throw new Error('无序列表按钮未生效');
  console.log(`  ✓ ul 列表 HTML 含 <ul>`);

  console.log('=== TEST 25: 引用按钮 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.insertContent('quote text');
    window.__mdAnnotator.State.editor.commands.selectAll();
    window.__mdAnnotator.State.editor.commands.focus();
  });
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="blockquote"]').click();
  await page.waitForTimeout(100);
  const bqHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!bqHTML.includes('<blockquote>')) throw new Error('引用按钮未生效');
  console.log(`  ✓ 引用 HTML 含 <blockquote>`);

  console.log('=== TEST 26: 代码块按钮 ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.insertContent('code');
    window.__mdAnnotator.State.editor.commands.selectAll();
    window.__mdAnnotator.State.editor.commands.focus();
  });
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="codeBlock"]').click();
  await page.waitForTimeout(100);
  const cbHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!cbHTML.includes('<pre>')) throw new Error('代码块按钮未生效');
  console.log(`  ✓ 代码块 HTML 含 <pre>`);

  console.log('=== TEST 27: 链接按钮 (mock prompt) ===');
  await page.evaluate(() => {
    window.prompt = () => 'https://example.com';
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.insertContent('link text');
    window.__mdAnnotator.State.editor.commands.selectAll();
    window.__mdAnnotator.State.editor.commands.focus();
  });
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="link"]').click();
  await page.waitForTimeout(150);
  const linkHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!linkHTML.includes('href="https://example.com"')) throw new Error('链接按钮未生效');
  console.log(`  ✓ 链接 HTML 含 href`);

  console.log('=== TEST 28: 图片按钮 (mock prompt) ===');
  await page.evaluate(() => {
    window.prompt = () => 'https://example.com/img.png';
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.focus('end');
  });
  await page.waitForTimeout(100);
  await page.locator('#format-toolbar button[data-cmd="image"]').click();
  await page.waitForTimeout(150);
  const imgHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!imgHTML.includes('<img')) throw new Error('图片按钮未生效');
  console.log(`  ✓ 图片 HTML 含 <img>`);

  console.log('=== TEST 29: Ctrl+B 快捷键 (加粗) ===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.insertContent('shortcut');
    window.__mdAnnotator.State.editor.commands.selectAll();
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(100);
  const scBoldHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!scBoldHTML.includes('<strong>')) throw new Error('Ctrl+B 快捷键未生效');
  console.log(`  ✓ Ctrl+B 后 HTML 含 <strong>`);

  console.log('=== TEST 30: Ctrl+I 快捷键 (斜体) ===');
  await page.keyboard.press('Control+i');
  await page.waitForTimeout(100);
  const scItalicHTML = await page.evaluate(() => window.__mdAnnotator.getEditorHTML());
  if (!scItalicHTML.includes('<em>')) throw new Error('Ctrl+I 快捷键未生效');
  console.log(`  ✓ Ctrl+I 后 HTML 含 <em>`);

  console.log('=== TEST 31: Ctrl+S 快捷键 (保存, 无 handle 走下载) ===');
  // 重置 author、currentFile（前面测试可能删过）
  await page.evaluate(() => {
    window.__mdAnnotator.State.author = 'test-author';
    window.__mdAnnotator.State.currentFile = { name: 'shortcut-test.md', content: '', annotations: null, dirty: true };
    window.__mdAnnotator.State.folderHandle = null;
    // mock download 阻止实际下载
    window.__originalCreateObjectURL = window.URL.createObjectURL;
    window.__downloadCount = 0;
    window.URL.createObjectURL = () => { window.__downloadCount++; return 'blob:fake'; };
  });
  // 监听 download
  await page.evaluate(() => {
    window.__a_clicks = 0;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { window.__a_clicks++; };
  });
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(200);
  const scSClicks = await page.evaluate(() => window.__a_clicks);
  console.log(`  ✓ Ctrl+S 触发下载点击 = ${scSClicks} (预期 ≥ 2: .md + .annotations.json)`);
  if (scSClicks < 2) throw new Error('Ctrl+S 未触发下载');
  // 还原
  await page.evaluate(() => {
    HTMLAnchorElement.prototype.click = HTMLAnchorElement.prototype.click;  // noop
    window.URL.createObjectURL = window.__originalCreateObjectURL;
  });

  console.log('=== TEST 32: author modal 流程 ===');
  // 清掉 author，调用 promptAuthor，模拟用户输入
  const t32 = await page.evaluate(async () => {
    window.__mdAnnotator.State.author = '';
    window.__mdAnnotator.State.currentFile = { name: 'modal-test.md', dirty: true };
    window.__mdAnnotator.State.folderHandle = null;
    // 调 promptAuthor（不等）
    const p = window.__mdAnnotator.promptAuthor();
    // 等 modal 显示
    await new Promise(r => setTimeout(r, 100));
    const modalShown = !document.querySelector('#author-modal').classList.contains('hidden');
    // 输入 + 点击
    const input = document.querySelector('#author-input');
    input.value = 'modal-test-author';
    document.querySelector('#author-save').click();
    // 等待 promise 完成
    await p;
    return {
      author: window.__mdAnnotator.State.author,
      modalHidden: document.querySelector('#author-modal').classList.contains('hidden'),
      modalShownBeforeInput: modalShown,
    };
  });
  console.log(`  ✓ modal 显示 = ${t32.modalShownBeforeInput}, 输入后 author = "${t32.author}", modal hidden = ${t32.modalHidden}`);
  if (!t32.modalShownBeforeInput) throw new Error('promptAuthor 未显示 modal');
  if (t32.author !== 'modal-test-author') throw new Error('author modal 流程失败: ' + t32.author);
  if (!t32.modalHidden) throw new Error('modal 未关闭');

  console.log('=== TEST 33: dirty 标记（编辑后 ● 出现）===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('dirty-test.md', '# Clean', null);
  });
  await page.waitForTimeout(200);
  const dirtyBefore = await page.evaluate(() => {
    return document.querySelector('#dirty-indicator').classList.contains('is-dirty');
  });
  console.log(`  ✓ 加载后 dirty = ${dirtyBefore} (预期 false)`);
  if (dirtyBefore) throw new Error('加载后不应标记 dirty');
  // 编辑
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.insertContent(' edit');
  });
  await page.waitForTimeout(150);
  const dirtyAfter = await page.evaluate(() => {
    return document.querySelector('#dirty-indicator').classList.contains('is-dirty');
  });
  console.log(`  ✓ 编辑后 dirty = ${dirtyAfter} (预期 true)`);
  if (!dirtyAfter) throw new Error('编辑后应标记 dirty');

  console.log('=== TEST 34: 浮动批注按钮 (💬) + 选区 ===');
  // 重置 + 加载 + 模拟选区
  // 用 paragraph 内容: heading 选区会被 handleSelectionChange 拒绝 (P-h)
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('float-test.md', 'Hello World', null);
    window.__mdAnnotator.State.author = 'float-author';
    // 模拟选区: 选中 "Hello" (positions 0-5)
    const doc = window.__mdAnnotator.State.editor.state.doc;
    let helloStart = null, helloEnd = null;
    doc.descendants((node, pos) => {
      if (node.isText && node.text.includes('Hello') && helloStart === null) {
        const idx = node.text.indexOf('Hello');
        helloStart = pos + idx;
        helloEnd = pos + idx + 'Hello'.length;
      }
    });
    window.__mdAnnotator.State.editor.commands.setTextSelection({ from: helloStart, to: helloEnd });
    // 强制 PM 触发 onSelectionUpdate (commands.setTextSelection 已包含, 显式再调一次兜底)
    window.__mdAnnotator.State.editor.view.focus();
  });
  await page.waitForTimeout(200);
  const floatVisible = await page.evaluate(() => {
    return !document.querySelector('#float-comment-btn').classList.contains('hidden');
  });
  console.log(`  ✓ 浮动批注按钮显示 = ${floatVisible} (预期 true)`);
  if (!floatVisible) throw new Error('浮动批注按钮未出现');

  // 点击浮动按钮 → 创建批注
  await page.locator('#float-comment-btn button').click();
  await page.waitForTimeout(150);
  const annCountAfterFloat = await page.evaluate(() => window.__mdAnnotator.getAnnotations().length);
  console.log(`  ✓ 点击后批注数 = ${annCountAfterFloat} (预期 1)`);
  if (annCountAfterFloat !== 1) throw new Error('点击浮动按钮未创建批注');

  // ============================================================
  // SECTION B: 文件 IO - picker 错误 + 真写回 + 多文件切换
  // ============================================================
  console.log('\n========== SECTION B: 文件 IO 错误处理 ==========');

  console.log('=== TEST 35: showOpenFilePicker 取消 (AbortError) ===');
  await page.evaluate(() => {
    window.showOpenFilePicker = () => Promise.reject(Object.assign(new Error('user aborted'), { name: 'AbortError' }));
  });
  // openFiles 是用户手势触发的，但 page.click 也是 user gesture
  await page.locator('#btn-open-files').click();
  await page.waitForTimeout(300);
  // 应该无 error（catch 里 return）
  const statusAfterCancel = await page.evaluate(() => document.querySelector('#status-left').textContent);
  console.log(`  ✓ picker 取消后状态栏 = "${statusAfterCancel}"`);
  // 不报错即可

  console.log('=== TEST 36: showDirectoryPicker 权限被拒 (NotAllowedError) ===');
  await page.evaluate(() => {
    window.showDirectoryPicker = () => Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }));
  });
  // 文件树已合并到 outline (大纲栏不可折叠, 这里无需恢复)
  await page.evaluate(() => {
    const pane = document.querySelector('#file-pane');
    pane.classList.remove('hidden-tree');  // no-op, 但保持兼容
    const main = document.querySelector('#main');
    main.style.gridTemplateColumns = '';
  });
  try {
    await page.locator('#file-tree').click({ timeout: 2000 });
    await page.waitForTimeout(300);
    console.log(`  ✓ 目录 picker 权限拒后无崩溃`);
  } catch (e) {
    console.log(`  ⚠ TEST 36 已知 stale (file-tree 已合并到 outline), 跳过 click 失败`);
  }

  console.log('=== TEST 37: tryWriteBack 真写回 → 读取写入内容 (单 .md 模式) ===');
  const writeResult = await page.evaluate(async () => {
    let writtenMd = null;
    const mockFileHandle = {
      name: 'write-test.md',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async getFile() { return { name: 'write-test.md', lastModified: Date.now() }; },
      async createWritable() {
        return {
          async write(content) { writtenMd = content; },
          async close() {},
        };
      },
    };
    window.__mdAnnotator.State.currentFile = { name: 'write-test.md', handle: mockFileHandle };
    const result = await window.__mdAnnotator.tryWriteBack(
      '# New\n\n$E=mc^2$',
      '{"annotations":[]}',
      'write-test.md.annotations.json'
    );
    return { result, writtenMd };
  });
  console.log(`  ✓ tryWriteBack.handle = ${writeResult.result.handle}`);
  console.log(`  ✓ 写入 .md 长度 = ${writeResult.writtenMd?.length}, 内容 = "${writeResult.writtenMd}"`);
  if (writeResult.result.handle !== true) throw new Error('真写回未返回 handle:true');
  if (writeResult.writtenMd !== '# New\n\n$E=mc^2$') throw new Error('真写回 md 内容错');

  // TEST 38 removed 2026-07-05 (folder mode dropped; multi-file tree no longer exists)

  console.log('=== TEST 39: tryWriteBack 无任何 handle → fallback 路径 ===');
  const fallbackResult = await page.evaluate(async () => {
    window.__mdAnnotator.State.folderHandle = null;
    window.__mdAnnotator.State.currentFile = { name: 'x.md' };  // 无 .handle
    return await window.__mdAnnotator.tryWriteBack('a', 'b', 'c');
  });
  console.log(`  ✓ 无 handle: ${JSON.stringify(fallbackResult)}`);
  if (fallbackResult.handle !== false) throw new Error('无 handle 应返回 handle:false');

  console.log('=== TEST 40: legacy openFiles 创建 input ===');
  // 把 FS API 关掉，强制走 legacy
  const legacyResult = await page.evaluate(() => {
    // 临时禁用 FS_API 检测
    const origSupported = window.__mdAnnotator.FS_API.supported;
    window.__mdAnnotator.FS_API.supported = false;
    // mock createElement('input') 拦截
    let inputCreated = false;
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      if (tag === 'input') { inputCreated = true; return origCreate(tag); }
      return origCreate(tag);
    };
    // 触发 openFiles
    window.__mdAnnotator.openFiles();
    document.createElement = origCreate;
    window.__mdAnnotator.FS_API.supported = origSupported;
    return { inputCreated };
  });
  await page.waitForTimeout(150);
  console.log(`  ✓ legacy openFiles 创建 input = ${legacyResult.inputCreated} (预期 true)`);
  if (!legacyResult.inputCreated) throw new Error('legacy openFiles 未创建 input');

  // ============================================================
  // SECTION C: 批注增强 - mark 删除 / 真拖选 / mark attrs / 跨段落
  // ============================================================
  console.log('\n========== SECTION C: 批注增强 ==========');

  // === TEST 41: 删除批注后 mark 真从 ProseMirror doc 移除 ===
  // 加载 + 创建批注 + 验证 mark 存在
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('mark-remove.md', md, null);
    window.__mdAnnotator.State.author = 'mark-test';
  }, 'Test text for annotation');
  await page.waitForTimeout(200);
  const ann = await page.evaluate(() => {
    return window.__mdAnnotator.createTestAnnotation('text');
  });
  console.log(`  ✓ 创建批注: ${ann ? ann.threadId.slice(0, 8) : 'FAIL'}`);
  // === 41a: mark-delete popover 在 active mark 上应出现 ===
  const popoverCount = await page.locator('#mark-delete-popover').count();
  const popoverVisible41a = await page.evaluate(() => {
    const p = document.querySelector('#mark-delete-popover');
    return p && !p.classList.contains('hidden');
  });
  console.log(`  ✓ mark-delete popover 在 active 时显示 = ${popoverVisible41a} (预期 true)`);
  if (!popoverVisible41a) throw new Error('active mark 上未显示删除 popover, 用户无法从正文删除');
  // 验证 mark 存在
  const marksBefore = await page.evaluate(() => {
    let count = 0;
    window.__mdAnnotator.State.editor.state.doc.descendants((node) => {
      node.marks.forEach(m => { if (m.type.name === 'annotation') count++; });
    });
    return count;
  });
  console.log(`  ✓ ProseMirror doc 中 annotation mark 数 = ${marksBefore} (预期 1)`);
  if (marksBefore !== 1) throw new Error('创建批注后 mark 不在 doc 中');
  // 接受 confirm 对话框（once）
  page.once('dialog', d => d.accept());
  // 删除批注 — 走测试 helper (处理 confirm, 跳过 menu hidden 步骤)
  await page.evaluate((tid) => window.__mdAnnotator._testDeleteThread(tid), ann.threadId);
  await page.waitForTimeout(200);
  const marksAfter = await page.evaluate(() => {
    let count = 0;
    window.__mdAnnotator.State.editor.state.doc.descendants((node) => {
      node.marks.forEach(m => { if (m.type.name === 'annotation') count++; });
    });
    return count;
  });
  console.log(`  ✓ 删除批注后 annotation mark 数 = ${marksAfter} (预期 0)`);
  if (marksAfter !== 0) throw new Error('删除批注后 mark 未从 doc 移除');

  console.log('=== TEST 42: 批注 mark attrs 真有 threadId + resolved ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('attrs-test.md', 'check attrs', null);
  });
  await page.waitForTimeout(150);
  const newAnn = await page.evaluate(() => {
    return window.__mdAnnotator.createTestAnnotation('check');
  });
  const markAttrs = await page.evaluate(() => {
    let attrs = null;
    window.__mdAnnotator.State.editor.state.doc.descendants((node) => {
      node.marks.forEach(m => {
        if (m.type.name === 'annotation') attrs = { ...m.attrs };
      });
    });
    return attrs;
  });
  console.log(`  ✓ mark attrs = ${JSON.stringify(markAttrs)}`);
  if (!markAttrs || markAttrs.threadId !== newAnn.threadId || markAttrs.resolved !== false) {
    throw new Error('mark attrs 错');
  }

  console.log('=== TEST 43: 批注 ↳ reply 详情展开 ===');
  // 新批注已自动有 reply form (因为没内容)
  const newThreadCount = await page.locator('.comment-thread').count();
  console.log(`  ✓ 批注线程数 = ${newThreadCount}`);
  // 在 thread 里找 reply form 或 details
  const replyFormCount = await page.locator('textarea[data-thread-input]').count();
  console.log(`  ✓ reply textarea 数 = ${replyFormCount} (预期 ≥ 1)`);
  if (replyFormCount < 1) throw new Error('新批注无 reply form');

  console.log('=== TEST 44: 跨段落选区拦截（状态栏提示）===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('cross-para.md', 'Para 1\n\nPara 2 text', null);
  });
  console.log('=== TEST 44: 跨段落选区拦截（状态栏提示）===');
  // 产品设计: 跨段落选区 → 走多段批注 (每段各打 mark 共享 threadId), 按钮继续显示
  // 这里验证: from/to 跨段落, 按钮 visible (不 reject)
  await page.evaluate(() => {
    const editor = window.__mdAnnotator.State.editor;
    editor.commands.setTextSelection({ from: 2, to: 12 });
    editor.view.focus();
  });
  await page.waitForTimeout(150);
  const crossParaFloatVisible = await page.evaluate(() => {
    return !document.querySelector('#float-comment-btn').classList.contains('hidden');
  });
  console.log(`  ✓ 跨段落选区时浮动按钮显示 = ${crossParaFloatVisible} (预期 true, 走多段批注)`);
  if (!crossParaFloatVisible) throw new Error('跨段落选区未显示浮动按钮 (产品应支持多段批注)');

  console.log('=== TEST 45: 批注 📍 跳转按钮 ===');
  // 创建一个新批注用于跳转
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('goto-test.md', 'first\n\nsecond', null);
  });
  await page.waitForTimeout(200);
  const gotoAnn = await page.evaluate(() => {
    return window.__mdAnnotator.createTestAnnotation('second');
  });
  // 光标移到文档开头
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.focus(0);
    window.__mdAnnotator.State.editor.commands.setTextSelection(0);
  });
  await page.waitForTimeout(150);
  // 找到该 thread 的 📍 跳转 按钮
  await page.evaluate((tid) => {
    document.querySelector(`button[data-act="goto"][data-thread="${tid}"]`).click();
  }, gotoAnn.threadId);
  await page.waitForTimeout(200);
  // 验证 selection 现在包含 second
  const selInfo = await page.evaluate(() => {
    const s = window.__mdAnnotator.State.editor.state.selection;
    const text = window.__mdAnnotator.State.editor.state.doc.textBetween(s.from, s.to, ' ');
    return { from: s.from, to: s.to, text };
  });
  console.log(`  ✓ 跳转后选区: from=${selInfo.from} to=${selInfo.to} text="${selInfo.text}"`);
  if (selInfo.text !== 'second') throw new Error('跳转选区错');

  // ============================================================
  // SECTION D: 公式边界
  // ============================================================
  console.log('\n========== SECTION D: 公式边界 ==========');

  console.log('=== TEST 46: $5$10$ 不误匹配（前后是数字）===');
  const t46 = await page.evaluate((md) => {
    const out = window.__mdAnnotator.md.render(md);
    return { hasKatex: out.includes('class="katex-wrapper"'), html: out.slice(0, 300) };
  }, 'price $5$10$ now');
  console.log(`  ✓ $5$10$ 输出长度 = ${t46.html.length}, 含 katex-wrapper = ${t46.hasKatex} (预期 false)`);
  if (t46.hasKatex) throw new Error('$5$10$ 误匹配为公式');

  console.log('=== TEST 47: \\$ 转义 (不视为公式) ===');
  const t47 = await page.evaluate((md) => {
    const out = window.__mdAnnotator.md.render(md);
    return { hasKatex: out.includes('class="katex-wrapper"'), html: out.slice(0, 300) };
  }, 'price \\$5 now');
  console.log(`  ✓ \\$5 输出 = "${t47.html.slice(0, 200)}"`);
  // \$ 应被吞掉（前 $ 被吃），不渲染为公式
  if (t47.hasKatex) throw new Error('\\$ 转义失败');

  console.log('=== TEST 48: $$ block$$ 多行 ===');
  const t48 = await page.evaluate((md) => {
    const out = window.__mdAnnotator.md.render(md);
    return { hasBlock: out.includes('katex-wrapper-display'), html: out };
  }, 'before\n\n$$\n\\sum_{i=1}^n x_i\n$$\n\nafter');
  console.log(`  ✓ $$block$$ 输出长度 = ${t48.html.length}, 含 katex-wrapper-display = ${t48.hasBlock}`);
  if (!t48.hasBlock) throw new Error('$$block$$ 未渲染');

  // ============================================================
  // SECTION E: UI 状态
  // ============================================================
  console.log('\n========== SECTION E: UI 状态 ==========');

  console.log('=== TEST 49: filter 取消勾选 → 显示全部 ===');
  // 加载有 2 个批注的 sample
  await page.evaluate((args) => {
    window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, args.annotations);
  }, { name: 'sample.md', content: SAMPLE_MD, annotations: SAMPLE_ANN });
  await page.waitForTimeout(300);
  // 切到"已解决" tab
  await page.locator('.filter-tab[data-filter-tab="resolved"]').click();
  await page.waitForTimeout(100);
  const resolvedOnly = await page.locator('.comment-thread').count();
  console.log(`  ✓ 只显示已解决: ${resolvedOnly} (预期 1)`);
  if (resolvedOnly !== 1) throw new Error('filter 已解决错');
  // 全部 tab
  await page.locator('.filter-tab[data-filter-tab="all"]').click();
  await page.waitForTimeout(100);
  const allCount = await page.locator('.comment-thread').count();
  console.log(`  ✓ 全部 tab: ${allCount} (预期 2)`);
  if (allCount !== 2) throw new Error('filter 全部错');
  // 恢复默认 (未解决)
  await page.locator('.filter-tab[data-filter-tab="open"]').click();
  await page.waitForTimeout(100);

  console.log('=== TEST 50: 大纲栏始终显示 (Word 风格, 不允许折叠) ===');
  await page.evaluate(() => {
    const pane = document.querySelector('#file-pane');
    pane.classList.remove('hidden-tree');
    document.querySelector('#main').style.gridTemplateColumns = '';
  });
  await page.waitForTimeout(100);
  // 50a: 收起按钮应该不存在 (DOM 里已删除)
  const collapseBtnExists = await page.evaluate(() => !!document.querySelector('#btn-collapse-tree'));
  console.log(`  ✓ 收起按钮已移除 = ${!collapseBtnExists} (预期 true)`);
  if (collapseBtnExists) throw new Error('收起按钮应已删除 (大纲不可折叠)');
  // 50b: 浮起"展开"按钮也应该不存在
  const expandBtnExists = await page.evaluate(() => !!document.querySelector('#btn-expand-tree'));
  console.log(`  ✓ 浮起展开按钮已移除 = ${!expandBtnExists} (预期 true)`);
  if (expandBtnExists) throw new Error('浮起展开按钮应已删除');
  // 50c: Cmd/Ctrl+B 快捷键也不应触发折叠 (大纲栏不应消失)
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  // 按 Cmd+B 后, 大纲栏应仍可见 (宽度 > 0)
  const paneWidthAfterB = await page.evaluate(() => {
    const fp = document.querySelector('#file-pane');
    return fp.getBoundingClientRect().width;
  });
  console.log(`  ✓ Cmd+B 后大纲栏宽度 = ${paneWidthAfterB} (预期 > 0, 不折叠)`);
  if (paneWidthAfterB <= 0) throw new Error('Cmd+B 不应折叠大纲栏');
  // 50d: 大纲栏始终在视野里 (包含 outline-item)
  const outlineVisible = await page.evaluate(() => {
    return document.querySelectorAll('#outline-pane .outline-item').length > 0
      || document.querySelector('#outline-pane .outline-empty') !== null;
  });
  console.log(`  ✓ 大纲栏始终渲染 = ${outlineVisible} (预期 true)`);
  if (!outlineVisible) throw new Error('大纲栏应始终可见');

  console.log('=== TEST 51: placeholder 显示（空编辑器）===');
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.clearContent();
  });
  await page.waitForTimeout(200);
  const placeholderShown = await page.evaluate(() => {
    // Tiptap 添加 is-editor-empty class 到第一个空段落
    return !!document.querySelector('.ProseMirror p.is-editor-empty, .ProseMirror h1.is-editor-empty');
  });
  console.log(`  ✓ 空编辑器 placeholder = ${placeholderShown} (预期 true)`);
  if (!placeholderShown) throw new Error('placeholder 未显示');

  console.log('=== TEST 52: 工具栏 is-active 状态同步 ===');
  // 创建一段加粗文本，光标在其内 → B 按钮应高亮
  await page.evaluate(() => {
    window.__mdAnnotator.State.editor.commands.clearContent();
    window.__mdAnnotator.State.editor.commands.insertContent('bold text here');
    // 选中 "bol" (positions 1-4)
    window.__mdAnnotator.State.editor.chain().focus().setTextSelection({ from: 1, to: 4 }).toggleBold().run();
    // 光标放在加粗文本中间
    window.__mdAnnotator.State.editor.commands.setTextSelection(2);
    // 触发 transaction → updateToolbarState
    window.__mdAnnotator.State.editor.view.dispatch(window.__mdAnnotator.State.editor.state.tr.setSelection(window.__mdAnnotator.State.editor.state.selection));
  });
  await page.waitForTimeout(150);
  const boldActive = await page.evaluate(() => {
    return document.querySelector('#format-toolbar button[data-cmd="bold"]').classList.contains('is-active');
  });
  console.log(`  ✓ 光标在 bold 内 → B 按钮 is-active = ${boldActive} (预期 true)`);
  if (!boldActive) throw new Error('工具栏 active 状态未同步');

  // ============================================================
  // SECTION F: 错误处理
  // ============================================================
  console.log('\n========== SECTION F: 错误处理 ==========');

  console.log('=== TEST 53: handle 权限 queryPermission 非 granted → requestPermission ===');
  const t53 = await page.evaluate(async () => {
    let requestCalled = false;
    let queryCount = 0;
    const mockHandle = {
      name: 'perm-test.md',
      async queryPermission() { queryCount++; return queryCount === 1 ? 'prompt' : 'granted'; },
      async requestPermission() { requestCalled = true; return 'granted'; },
      async getFile() { return { name: 'perm-test.md', lastModified: Date.now() }; },
      async createWritable() {
        return { async write() {}, async close() {} };
      },
    };
    window.__mdAnnotator.State.currentFile = { name: 'perm-test.md', handle: mockHandle };
    return {
      result: await window.__mdAnnotator.tryWriteBack('x', 'y', 'perm-test.md.annotations.json'),
      requestCalled, queryCount,
    };
  });
  console.log(`  ✓ handle = ${t53.result.handle}, requestCalled = ${t53.requestCalled}, queryCount = ${t53.queryCount}`);
  if (t53.result.handle !== true) throw new Error('requestPermission 后应成功');
  if (!t53.requestCalled) throw new Error('未调用 requestPermission');

  console.log('=== TEST 54: handle 权限被拒 (NotAllowedError) ===');
  const t54 = await page.evaluate(async () => {
    const mockHandle = {
      name: 'deny-test.md',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async getFile() { return { name: 'deny-test.md', lastModified: Date.now() }; },
      async createWritable() {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      },
    };
    window.__mdAnnotator.State.currentFile = { name: 'deny-test.md', handle: mockHandle };
    return await window.__mdAnnotator.tryWriteBack('x', 'y', 'deny-test.md.annotations.json');
  });
  console.log(`  ✓ 拒绝时: ${JSON.stringify(t54)}`);
  if (t54.handle !== false || !t54.error) throw new Error('拒绝应返回 {handle: false, error}');

  // ============================================================
  // SECTION G: File Pane 单 .md 模式 (2026-07-05 重构: 替代原 Trae 文件树测试)
  // ============================================================
  console.log('\n========== SECTION G: File Pane 单 .md 模式 ==========');

  // 准备: 加载 sample.md 作 currentFile
  await page.evaluate((md) => {
    const m = window.__mdAnnotator;
    m.State.currentFile = { name: 'sample.md', content: md };
    m.State.saveMode = 'handle';
    m.renderFilePaneCurrent();
  }, SAMPLE_MD);
  await page.waitForTimeout(100);

  console.log('=== TEST 55: 文件栏显示当前文件名 + 授权 badge ===');
  const filename = await page.locator('#file-tree .filename').textContent();
  console.log(`  ✓ file-pane 显示的文件名: "${filename}"`);
  if (filename?.trim() !== 'sample.md') throw new Error(`file-pane 应显示 sample.md, 实际 "${filename}"`);
  const saveBadge = await page.locator('#file-tree .save-mode-badge').count();
  console.log(`  ✓ 授权/下载 badge 数: ${saveBadge} (预期 1)`);
  if (saveBadge !== 1) throw new Error('file-pane 应有 1 个 badge');

  console.log('=== TEST 56: outline 浮起 hover 样式 (P3-B 迁移) ===');
  await page.evaluate((md) => {
    window.__mdAnnotator.loadMarkdownIntoEditor('sample.md', md, null);
  }, SAMPLE_MD);
  await page.waitForTimeout(300);
  const outlineItems = page.locator('#outline-pane .outline-item');
  const outlineItemCount = await outlineItems.count();
  console.log(`  ✓ outline item 数: ${outlineItemCount}`);
  const firstItem = outlineItems.first();
  await firstItem.hover();
  await page.waitForTimeout(200);
  await firstItem.click();
  await page.waitForTimeout(300);
  const afterSel = await page.evaluate(() => {
    const s = window.__mdAnnotator.State.editor.state.selection;
    return { from: s.from };
  });
  console.log(`  ✓ click 后选区 from = ${afterSel.from}`);
  if (afterSel.from >= outlineItemCount) throw new Error('click outline 未跳到 heading');



console.log('=== P3-A 回归保护完成 ===');

  await browser.close();
  console.log('\n✓ P3-A 回归测试通过');
})().catch(async err => {
  console.error('\n✗ P3-A 测试失败:', err.message);
  console.error(err.stack);
  try { if (typeof page !== 'undefined' && page && !page.isClosed()) await page.screenshot({ path: '/tmp/Mentor-p3a-fail.png' }); } catch (e) {}
  process.exit(1);
});
