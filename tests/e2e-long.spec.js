// tests/e2e-long.spec.js
// 压力测试: 加载 sample-long-stress.md (67 KB / 1609 行)
// 测量: 加载耗时 / mark 数 / 大纲数 / console 错误 / 滚动 FPS / TOC 跳转 / 创建批注
// 输出: 详细的 stress 报告 + 3 张截图 (首屏/中段/末段)

const { chromium } = require('/home/lablabcloud/.hermes/node/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const ROOT = '/mnt/e/hermes_playground/Mentor';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT_DIR = path.join(ROOT, 'tests/screenshots');

if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const STRESS_MD_PATH = path.join(ROOT, 'test-data/sample-long-stress.md');
const STRESS_MD = fs.readFileSync(STRESS_MD_PATH, 'utf-8');

const stats = {
  fileBytes: STRESS_MD.length,
  fileLines: STRESS_MD.split('\n').length,
};

function pad(s, n) { return String(s).padEnd(n); }
function ms(t0) { return ((Date.now() - t0)).toFixed(0) + 'ms'; }
function log(label, ...rest) { console.log(`  ${pad(label, 28)} ${rest.join(' ')}`); }

(async () => {
  console.log('=== Mentor Stress Test: sample-long-stress.md ===');
  console.log(`  File: ${STRESS_MD_PATH}`);
  console.log(`  Size: ${(stats.fileBytes/1024).toFixed(1)} KB, Lines: ${stats.fileLines}`);
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // 禁用浏览器缓存 (避免 Chromium headless CSS 缓存坑)
    bypassCSP: true,
  });
  // 预置 author, 跳过首次 modal
  await context.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'Stress Tester'); } catch (e) {}
  });
  const page = await context.newPage();

  // 拦截所有 response 加 no-cache
  await page.route('**/*', route => {
    const headers = { ...route.request().headers(), 'cache-control': 'no-cache' };
    route.continue({ headers });
  });

  // 收集 console 错误
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('--- TEST 1: Page load + Tiptap init ---');
  const tLoadStart = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle' });
  const tLoaded = Date.now();
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor, { timeout: 30000 });
  const tReady = Date.now();
  log('goto networkidle', ms(tLoadStart));
  log('Tiptap ready', ms(tLoaded));
  log('Total page ready', ms(tReady));
  stats.pageReadyMs = tReady - tLoadStart;
  console.log('');

  console.log('--- TEST 2: Load sample-long-stress.md ---');
  await page.evaluate(() => window.__mdAnnotator.setAuthor('Stress Tester'));

  const tLoadMdStart = Date.now();
  await page.evaluate((args) => {
    return window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, []);
  }, { name: 'sample-long-stress.md', content: STRESS_MD, annotations: [] });
  // 等编辑器稳定
  await page.waitForTimeout(800);
  const tLoadMdEnd = Date.now();
  stats.loadMdMs = tLoadMdEnd - tLoadMdStart;
  log('loadMarkdownIntoEditor', ms(tLoadMdStart));
  log('Stabilize wait', '+800ms');
  log('Total MD load', ms(tLoadMdStart));
  console.log('');

  // 等 KaTeX 渲染
  console.log('--- TEST 3: Wait for KaTeX render ---');
  const tKatexStart = Date.now();
  await page.waitForFunction(() => {
    const katex = document.querySelectorAll('.katex');
    return katex.length >= 50;  // 我们期望至少 50+ 公式
  }, { timeout: 30000 }).catch(() => {});
  const tKatexEnd = Date.now();
  stats.katexRenderMs = tKatexEnd - tKatexStart;
  const katexCount = await page.locator('.katex').count();
  log('KaTeX rendered', ms(tKatexStart));
  log('KaTeX nodes', katexCount);
  stats.katexCount = katexCount;
  console.log('');

  console.log('--- TEST 4: Element inventory ---');
  const counts = await page.evaluate(() => {
    return {
      h1: document.querySelectorAll('#editor h1').length,
      h2: document.querySelectorAll('#editor h2').length,
      h3: document.querySelectorAll('#editor h3').length,
      paragraphs: document.querySelectorAll('#editor p').length,
      lists: document.querySelectorAll('#editor ul, #editor ol').length,
      listItems: document.querySelectorAll('#editor li').length,
      tables: document.querySelectorAll('#editor table').length,
      codeBlocks: document.querySelectorAll('#editor pre').length,
      blockquotes: document.querySelectorAll('#editor blockquote').length,
      links: document.querySelectorAll('#editor a').length,
      imgs: document.querySelectorAll('#editor img').length,
      marks: document.querySelectorAll('.annotation-mark').length,
      editorHeight: document.querySelector('#editor')?.scrollHeight || 0,
      docLength: window.__mdAnnotator.State.editor.state.doc.content.size,
    };
  });
  Object.assign(stats, counts);
  log('H1/H2/H3', `${counts.h1}/${counts.h2}/${counts.h3}`);
  log('paragraphs', counts.paragraphs);
  log('lists / listItems', `${counts.lists} / ${counts.listItems}`);
  log('tables', counts.tables);
  log('code blocks', counts.codeBlocks);
  log('blockquotes', counts.blockquotes);
  log('links', counts.links);
  log('images', counts.images);
  log('marks (annotations)', counts.marks);
  log('editor scrollHeight', `${counts.editorHeight}px`);
  log('ProseMirror doc size', `${counts.docLength} chars`);
  console.log('');

  console.log('--- TEST 5: Outline generation ---');
  const outlineCount = await page.locator('#outline-pane .outline-item').count();
  const outlineLevels = await page.evaluate(() => {
    const items = document.querySelectorAll('#outline-pane .outline-item');
    return {
      total: items.length,
      h1: document.querySelectorAll('#outline-pane .outline-h1').length,
      h2: document.querySelectorAll('#outline-pane .outline-h2').length,
      h3: document.querySelectorAll('#outline-pane .outline-h3').length,
    };
  });
  log('outline items', `${outlineCount} (H1=${outlineLevels.h1} H2=${outlineLevels.h2} H3=${outlineLevels.h3})`);
  stats.outlineCount = outlineCount;
  console.log('');

  console.log('--- TEST 6: Screenshots (top / middle / bottom) ---');
  // 真正的 scroll container 是 #editor-pane (overflow-y: auto)
  const scrollEditor = async (y) => {
    await page.evaluate((scrollY) => {
      const pane = document.querySelector('#editor-pane');
      if (pane) pane.scrollTop = scrollY;
    }, y);
    await page.waitForTimeout(200);
  };
  // Top
  await scrollEditor(0);
  const topShot = path.join(SHOT_DIR, 'long-stress-1-top.png');
  await page.screenshot({ path: topShot, fullPage: false });
  log('top viewport', topShot);

  // Scroll to ~50%
  const targetMid = Math.floor(counts.editorHeight / 2);
  await scrollEditor(targetMid);
  const midShot = path.join(SHOT_DIR, 'long-stress-2-mid.png');
  await page.screenshot({ path: midShot, fullPage: false });
  log('mid viewport', midShot);

  // Bottom
  const maxScroll = await page.evaluate(() => {
    const pane = document.querySelector('#editor-pane');
    return pane ? pane.scrollHeight - pane.clientHeight : 0;
  });
  await scrollEditor(maxScroll);
  const botShot = path.join(SHOT_DIR, 'long-stress-3-bottom.png');
  await page.screenshot({ path: botShot, fullPage: false });
  log('bottom viewport', `${botShot} (maxScroll=${maxScroll}px)`);
  stats.maxEditorScrollPx = maxScroll;

  // Full page (warning: 可能很大)
  const fullShot = path.join(SHOT_DIR, 'long-stress-4-full.png');
  await page.evaluate(() => {
    const pane = document.querySelector('#editor-pane');
    if (pane) pane.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: fullShot, fullPage: true });
  const fullSize = fs.statSync(fullShot).size;
  log('full page', `${fullShot} (${(fullSize/1024).toFixed(0)} KB)`);
  stats.fullScreenshotKB = Math.round(fullSize / 1024);
  console.log('');

  console.log('--- TEST 7: Scroll FPS measurement ---');
  // 滚动 #editor-pane 而非 window (Mentor 用 div overflow 滚动)
  const fpsResult = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const pane = document.querySelector('#editor-pane');
      if (!pane) return resolve({ frames: 0, elapsedMs: 0, fps: 0 });
      let frames = 0;
      let startTime = 0;
      function frame(t) {
        if (startTime === 0) startTime = t;
        frames++;
        // 滚动一次小距离
        if (frames % 3 === 0) pane.scrollTop += 100;
        if (t - startTime < 1500) {  // 测 1.5 秒
          requestAnimationFrame(frame);
        } else {
          const elapsed = t - startTime;
          resolve({
            frames,
            elapsedMs: Math.round(elapsed),
            fps: Math.round((frames * 1000) / elapsed),
            finalScrollTop: pane.scrollTop,
          });
        }
      }
      requestAnimationFrame(frame);
    });
  });
  log('scroll frames', `${fpsResult.frames} in ${fpsResult.elapsedMs}ms`);
  log('scroll FPS', `${fpsResult.fps} fps`);
  log('final scrollTop', `${fpsResult.finalScrollTop}px`);
  stats.scrollFps = fpsResult.fps;
  console.log('');

  console.log('--- TEST 8: Outline click → jump ---');
  // 先滚到最底部, 然后点大纲跳到顶部
  await page.evaluate(() => {
    const pane = document.querySelector('#editor-pane');
    if (pane) pane.scrollTop = pane.scrollHeight;
  });
  await page.waitForTimeout(300);
  const scrollBeforeJump = await page.evaluate(() => document.querySelector('#editor-pane')?.scrollTop || 0);
  const tJumpStart = Date.now();
  await page.locator('#outline-pane .outline-item').first().click();
  await page.waitForTimeout(300);
  const tJumpEnd = Date.now();
  const scrollAfterJump = await page.evaluate(() => document.querySelector('#editor-pane')?.scrollTop || 0);
  log('scrollTop before jump', `${scrollBeforeJump}px`);
  log('jump to first H1', ms(tJumpStart));
  log('scrollTop after jump', `${scrollAfterJump}px (should be near 0)`);
  stats.outlineJumpMs = tJumpEnd - tJumpStart;
  stats.outlineJumpWorks = scrollAfterJump < 200;
  console.log('');

  console.log('--- TEST 9: Create annotation on stress file ---');
  await page.evaluate(() => {
    const pane = document.querySelector('#editor-pane');
    if (pane) pane.scrollTop = 0;
  });
  await page.waitForTimeout(300);

  // 用 createTestAnnotation 在某个文字上建批注
  const createResult = await page.evaluate(() => {
    // 找一个含中文字符的段落
    const paragraphs = document.querySelectorAll('#editor p');
    let targetText = null;
    for (const p of paragraphs) {
      if (p.textContent.includes('认知神经科学')) {
        targetText = '认知神经科学';
        break;
      }
      if (p.textContent.includes('WYSIWYG')) {
        targetText = 'WYSIWYG';
      }
    }
    if (!targetText) {
      targetText = paragraphs[0]?.textContent?.slice(0, 10) || 'test';
    }
    const ann = window.__mdAnnotator.createTestAnnotation(targetText);
    return { found: targetText, ann };
  });
  await page.waitForTimeout(300);
  const markAfter = await page.locator('.annotation-mark').count();
  log('target text', `"${createResult.found}"`);
  log('annotation created', createResult.ann ? `threadId=${createResult.ann.threadId.slice(0,8)}` : 'FAILED');
  log('marks after', `${markAfter} (expect 1)`);
  stats.annotationCreated = !!createResult.ann;
  stats.marksAfter = markAfter;
  console.log('');

  // 截图带批注状态
  const annShot = path.join(SHOT_DIR, 'long-stress-5-with-annotation.png');
  await page.evaluate(() => {
    const pane = document.querySelector('#editor-pane');
    if (pane) pane.scrollTop = 0;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: annShot, fullPage: false });
  log('annotated screenshot', annShot);
  console.log('');

  console.log('--- TEST 10: Errors inventory ---');
  log('console errors', consoleErrors.length);
  log('console warnings', consoleWarnings.length);
  log('page errors', pageErrors.length);
  stats.consoleErrors = consoleErrors.length;
  stats.pageErrors = pageErrors.length;
  if (consoleErrors.length > 0) {
    console.log('  -- console errors (first 5):');
    consoleErrors.slice(0, 5).forEach((e, i) => console.log(`    [${i}] ${e.slice(0, 200)}`));
  }
  if (pageErrors.length > 0) {
    console.log('  -- page errors:');
    pageErrors.forEach((e, i) => console.log(`    [${i}] ${e.slice(0, 200)}`));
  }
  console.log('');

  console.log('--- TEST 11: Export round-trip ---');
  // 触发 save (会下载 .md + .annotations.json)
  // 因为是 headless, 我们直接调用导出接口拿 markdown
  const exported = await page.evaluate(() => {
    const editor = window.__mdAnnotator.State.editor;
    return {
      htmlLength: editor.getHTML().length,
      docText: editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').length,
    };
  });
  log('exported HTML length', `${exported.htmlLength} chars`);
  log('exported doc text', `${exported.docText} chars`);
  stats.exportHtmlChars = exported.htmlLength;
  stats.exportDocChars = exported.docText;
  console.log('');

  console.log('=== SUMMARY ===');
  const passed = [
    ['Page ready < 30s', stats.pageReadyMs < 30000],
    ['MD load < 10s', stats.loadMdMs < 10000],
    ['KaTeX >= 30 nodes', stats.katexCount >= 30],
    ['H1 == 1', counts.h1 === 1],
    ['H2 >= 20 (含 TOC)', counts.h2 >= 20],
    ['H3 == 72', counts.h3 === 72],
    ['Code blocks >= 25', counts.codeBlocks >= 25],
    ['Lists >= 20', counts.lists >= 20],
    ['Tables >= 10', counts.tables >= 10],
    ['Outline items >= 80', stats.outlineCount >= 80],
    ['Scroll FPS >= 30', stats.scrollFps >= 30],
    ['Outline jump works', stats.outlineJumpWorks],
    ['Annotation created', stats.annotationCreated],
    ['Console errors == 0', stats.consoleErrors === 0],
    ['Page errors == 0', stats.pageErrors === 0],
  ];
  let passCount = 0;
  for (const [name, ok] of passed) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (ok) passCount++;
  }
  console.log(`\n  Total: ${passCount}/${passed.length} checks passed`);

  // 写入 JSON 结果
  const resultFile = path.join(ROOT, 'tests/long-stress-result.json');
  fs.writeFileSync(resultFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    checks: passed.map(([name, ok]) => ({ name, ok })),
    passCount,
    total: passed.length,
    screenshots: [topShot, midShot, botShot, fullShot, annShot],
  }, null, 2));
  console.log(`\n  Results saved: ${resultFile}`);

  await browser.close();
  process.exit(passCount === passed.length ? 0 : 1);
})().catch(err => {
  console.error('Stress test failed:', err);
  process.exit(1);
});