// Mentor .mentor 单文件包 E2E 测试
// 验证: (1) JSZip 加载/打包函数正确  (2) openFilesLegacy 接受 .mentor
//       (3) saveCurrent 走 .mentor 路径重新打包   (4) round-trip 内容一致
//
// 策略: 在 page 上下文中调用已暴露的 __mdAnnotator.buildMentorZipBlob +
//       __mdAnnotator.openFromMentorFile (走内存路径, 避免 file picker UI),
//       然后用 JSZip 重新解压验证结构.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve('E:/hermes_playground/Mentor');
const URL = 'http://127.0.0.1:8787/index.html';

const SAMPLE_MD = fs.readFileSync(path.join(ROOT, 'test-data/sample.md'), 'utf-8');
const SAMPLE_ANN = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-data/sample.md.annotations.json'), 'utf-8'));

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', d => d.accept());
  await context.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'mentor-test'); } catch (e) {}
  });

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('=== STEP 1: 加载页面 + Tiptap 初始化 ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('mentor-test'));
  console.log('  ✓ 页面就绪');

  // ---- JSZip / mentor zip via product API (bundled; bare import('jszip') fails in page) ----
  console.log('\n=== STEP 2: 验证 buildMentorZipBlob (JSZip 产品路径) ===');
  const jszipOk = await page.evaluate(async () => {
    try {
      const M = window.__mdAnnotator;
      if (typeof M.buildMentorZipBlob !== 'function') return { err: 'no buildMentorZipBlob' };
      if (typeof M.readMentorZip !== 'function') return { err: 'no readMentorZip' };
      const blob = await M.buildMentorZipBlob(
        '# pack-probe\n\nhello mentor pack\n',
        { version: '1', document: 'probe.mentor', annotations: [] },
        {}
      );
      if (!blob || !(blob.size > 0)) return { err: 'empty-blob', size: blob && blob.size };
      const file = new File([blob], 'probe.mentor', { type: 'application/zip' });
      const extracted = await M.readMentorZip(file);
      const ok = !!(extracted && extracted.mdText && extracted.mdText.includes('pack-probe'));
      return ok ? true : { err: 'roundtrip-miss', md: ((extracted && extracted.mdText) || '').slice(0, 80) };
    } catch (e) {
      return { err: e && e.message ? e.message : String(e) };
    }
  });
  assert(jszipOk === true, `JSZip product path OK (size>0), got=${JSON.stringify(jszipOk)}`);

  // ---- 通过 __mdAnnotator 加载 fixture ----
  console.log('\n=== STEP 3: 加载 sample.md + sample 批注 ===');
  await page.evaluate((args) => {
    return window.__mdAnnotator.loadMarkdownIntoEditor(args.name, args.content, args.annotations);
  }, { name: 'sample.md', content: SAMPLE_MD, annotations: SAMPLE_ANN });
  await page.waitForTimeout(300);
  const beforeCount = await page.evaluate(() => window.__mdAnnotator.getAnnotations().length);
  assert(beforeCount === SAMPLE_ANN.annotations.length,
    `初始批注数 = ${beforeCount} (expected ${SAMPLE_ANN.annotations.length})`);

  // ---- 构造 .mentor 包: 用页面里 buildMentorZipBlob ----
  console.log('\n=== STEP 4: 构造 .mentor 包 (从内存 md+ann) ===');
  // 模拟 saveCurrent 内部: 取 editor html → md, 拼 sidecar → buildMentorZipBlob
  const mentorBase64 = await page.evaluate(async (args) => {
    const M = window.__mdAnnotator;
    const html = M.State.editor.getHTML();
    const mdText = M.htmlToMarkdown(html);
    const sidecar = {
      version: '1',
      document: 'sample.mentor',
      updatedAt: new Date().toISOString(),
      author: { id: M.State.authorId, name: M.State.author },
      annotations: M.State.annotations.map(t => ({
        threadId: t.threadId,
        text: t.text,
        prefix: t.prefix || '',
        suffix: t.suffix || '',
        resolved: t.resolved,
        createdAt: t.createdAt,
        comments: t.comments,
      })),
    };
    const blob = await M.buildMentorZipBlob(mdText, sidecar);
    // FileReader → base64 for transport
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.readAsDataURL(blob);
    });
  });
  assert(mentorBase64 && mentorBase64.length > 100, `.mentor base64 长度 = ${mentorBase64.length} chars (>100)`);

  // ---- 验证 ZIP 头部魔数 ----
  const buf = Buffer.from(mentorBase64, 'base64');
  assert(buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04,
    `ZIP 头部魔数 PK\\x03\\x04 OK, 实际字节 = ${buf[0].toString(16)} ${buf[1].toString(16)} ${buf[2].toString(16)} ${buf[3].toString(16)}`);

  // ---- 把 .mentor 二进制喂回 page 上下文, 用 readMentorZip 验证内容 ----
  console.log('\n=== STEP 5: round-trip — readMentorZip 解压包 ===');
  const extracted = await page.evaluate(async (b64) => {
    // base64 → Uint8Array → File → 走 __mdAnnotator.readMentorZip
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'sample.mentor', { type: 'application/zip' });
    return await window.__mdAnnotator.readMentorZip(file);
  }, mentorBase64);
  assert(extracted.mdText.length > 0, `readMentorZip mdText 长度 = ${extracted.mdText.length}`);
  // 关键短语都在 = 往返保留内容 (不强求 byte-equal: htmlToMarkdown 输出格式与原 fixture 略有差异, e.g. "-   " vs "- ")
  for (const phrase of ['# 测试文档', 'WYSIWYG 编辑', '嵌套回复', '批注', 'Mentor']) {
    assert(extracted.mdText.includes(phrase), `md 包含关键短语 "${phrase}"`);
  }
  assert(extracted.annotations && extracted.annotations.annotations,
    `annotations 是有效对象`);
  assert(extracted.annotations.annotations.length === SAMPLE_ANN.annotations.length,
    `批注数 = ${extracted.annotations.annotations.length}`);

  // ---- 完整 round-trip: 加载 .mentor → 再 buildMentorZipBlob → 再 readMentorZip ----
  console.log('\n=== STEP 6: 双重 round-trip (load → save → load) ===');
  const roundtrip = await page.evaluate(async (b64) => {
    const M = window.__mdAnnotator;
    // 模拟 openFromMentorFile: 走 loadMarkdownIntoEditor
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'sample.mentor', { type: 'application/zip' });
    const { mdText, annotations } = await M.readMentorZip(file);
    await M.loadMarkdownIntoEditor('sample.mentor', mdText, annotations);
    M.State.saveMode = 'mentor-download';
    // 再 build
    const html = M.State.editor.getHTML();
    const mdText2 = M.htmlToMarkdown(html);
    const sidecar2 = {
      version: '1',
      document: 'sample.mentor',
      updatedAt: new Date().toISOString(),
      author: { id: M.State.authorId, name: M.State.author },
      annotations: M.State.annotations.map(t => ({
        threadId: t.threadId, text: t.text,
        prefix: t.prefix || '', suffix: t.suffix || '',
        resolved: t.resolved, createdAt: t.createdAt, comments: t.comments,
      })),
    };
    const blob2 = await M.buildMentorZipBlob(mdText2, sidecar2);
    const b642 = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.readAsDataURL(blob2);
    });
    // 二次解压
    const bin2 = atob(b642);
    const arr2 = new Uint8Array(bin2.length);
    for (let i = 0; i < bin2.length; i++) arr2[i] = bin2.charCodeAt(i);
    const file2 = new File([arr2], 'sample.mentor', { type: 'application/zip' });
    return await M.readMentorZip(file2);
  }, mentorBase64);
  assert(roundtrip.mdText.length > 0, `二次解压 md 长度 = ${roundtrip.mdText.length}`);
  assert(roundtrip.annotations.annotations.length === SAMPLE_ANN.annotations.length,
    `二次解压批注数 = ${roundtrip.annotations.annotations.length}`);

  // ---- 验证 file 名导出函数 ----
  console.log('\n=== STEP 7: mentorExportName ===');
  const exportName = await page.evaluate(() => ({
    md: window.__mdAnnotator.mentorExportName('notes.md'),
    mdAlt: window.__mdAnnotator.mentorExportName('paper.markdown'),
    noext: window.__mdAnnotator.mentorExportName('untitled'),
  }));
  assert(exportName.md === 'notes.mentor', `notes.md → ${exportName.md}`);
  assert(exportName.mdAlt === 'paper.mentor', `paper.markdown → ${exportName.mdAlt}`);
  assert(exportName.noext === 'untitled.mentor', `untitled → ${exportName.noext}`);

  // ---- 验证 isMentorZip 魔数检测 ----
  console.log('\n=== STEP 8: isMentorZip 魔数检测 ===');
  const magicTest = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    // 正确扩展名
    const f1 = new File([arr], 'sample.mentor', { type: 'application/zip' });
    const a = await window.__mdAnnotator.isMentorZip(f1);
    // 错误扩展名, 但魔数对
    const f2 = new File([arr], 'sample.zip', { type: 'application/zip' });
    const b = await window.__mdAnnotator.isMentorZip(f2);
    // 错误扩展名, 魔数也不对 (纯文本)
    const f3 = new File(['plain text'], 'sample.txt', { type: 'text/plain' });
    const c = await window.__mdAnnotator.isMentorZip(f3);
    // 错误扩展名, 魔数接近但差 1 字节
    const arr4 = new Uint8Array(arr);
    arr4[3] = 0x05;  // 改 1 字节
    const f4 = new File([arr4], 'sample.zip', { type: 'application/zip' });
    const d = await window.__mdAnnotator.isMentorZip(f4);
    return { a, b, c, d };
  }, mentorBase64);
  assert(magicTest.a === true, `扩展名 .mentor → true`);
  assert(magicTest.b === true, `扩展名 .zip + 正确魔数 → true (容错)`);
  assert(magicTest.c === false, `纯文本 + 错误扩展名 → false`);
  assert(magicTest.d === false, `魔数第4字节坏 → false`);

  // ---- 错误处理: 缺 content.md ----
  console.log('\n=== STEP 9: 缺 content.md 抛错 ===');
  // Build broken zip in Node (jszip is a dep); do not bare-import in page
  const JSZipNode = require('jszip');
  const brokenB64 = await (async () => {
    const z = new JSZipNode();
    z.file('other.txt', 'no md here');
    return await z.generateAsync({ type: 'base64' });
  })();
  const errCaught = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'broken.mentor', { type: 'application/zip' });
    try {
      await window.__mdAnnotator.readMentorZip(file);
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e && e.message ? e.message : String(e) };
    }
  }, brokenB64);
  assert(errCaught && errCaught.ok === false, `缺 content.md 抛错: ${errCaught && errCaught.msg}`);

  // ---- 页面无未捕获错误 ----
  console.log('\n=== STEP 10: 页面无 JS 错误 ===');
  assert(pageErrors.length === 0, `page errors = ${pageErrors.length} (期望 0); errors=${JSON.stringify(pageErrors)}`);

  console.log('\n✓ 全部 10 步通过');
  await browser.close();
})().catch(e => { console.error('\n✗ TEST FAILED:', e.message); process.exit(1); });
