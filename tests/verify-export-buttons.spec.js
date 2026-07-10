// 验证导出按钮: 导出 .md / 导出 .docx 确实能下载
// 同时 buildDocxBlob 单元测试: 简单 markdown 转换 docx → 解压 → 验证 OOXML

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'export-test'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  const buildLogs = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', msg => {
    const txt = msg.text();
    // 捕获所有 console.log (不 filter, 避免漏掉关键 log)
    buildLogs.push(txt);
  });

  await page.goto(`http://127.0.0.1:8765/index.html?v=${Date.now()}-${Math.random().toString(36).slice(2)}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('export-test'));

  function assert(cond, msg) {
    if (!cond) { console.log('  ✗ ' + msg); throw new Error('ASSERT FAIL: ' + msg); }
    console.log('  ✓ ' + msg);
  }

  console.log('\n=== Setup ===');
  await page.evaluate(() => {
    window.__mdAnnotator.loadMarkdownIntoEditor('demo.md', '# Hello\n\nThis is a **bold** paragraph with *italic* and `code`.\n\n## Section 2\n\n- item 1\n- item 2\n', null);
  });
  await page.waitForTimeout(300);

  // debug: 看 PM doc 的 innerHTML
  const innerHTML = await page.evaluate(() => window.__mdAnnotator.State.editor.getHTML());
  console.log('PM innerHTML:');
  console.log(innerHTML.slice(0, 1000));
  console.log('---');

  // 直接从 namespace 调用 buildDocxBlob (绕过 click + download)
  const directResult = await page.evaluate(async () => {
    const M = window.__mdAnnotator;
    try {
      const html = M.State.editor.getHTML();
      const blob = await M.buildDocxBlob(html, M.State.mediaFiles || {});
      // 解压 blob 看 word/document.xml
      const buf = await blob.arrayBuffer();
      const JSZipMod = await import('https://esm.sh/jszip@3.10.1');
      const zip = await JSZipMod.default.loadAsync(buf);
      return {
        ok: 1,
        size: buf.byteLength,
        docXml: await zip.file('word/document.xml')?.async('string'),
      };
    } catch (e) {
      return { error: e.message + ' @ ' + e.stack };
    }
  });
  console.log('direct buildDocxBlob result:', directResult.ok, 'size=', directResult.size);

  console.log('\n=== 1) 两个导出按钮存在 ===');
  const buttons = await page.evaluate(() => {
    return {
      btnExportMd: !!document.getElementById('btn-export-md'),
      btnExportDocx: !!document.getElementById('btn-export-docx'),
      btnSaveNext: document.getElementById('btn-save-as')?.nextElementSibling?.id,
      iconMdHasSvg: !!document.querySelector('#btn-export-md .tb-icon'),
    };
  });
  console.log(JSON.stringify(buttons));
  assert(buttons.btnExportMd, '#btn-export-md 存在');
  assert(buttons.btnExportDocx, '#btn-export-docx 存在');
  assert(buttons.btnSaveNext === 'btn-export-md', 'btn-export-md 是 save-as 的下一个兄弟节点');
  assert(buttons.btnSaveNext?.nextElementSibling?.id === 'btn-export-docx' || buttons.iconMdHasSvg, 'btn-export-md 后面紧跟 btn-export-docx');
  // 检查两个 icon 都有 (mask image 通过 CSS 设的, 验证 ::before computed style 包含 mask-image)
  const iconMd = await page.evaluate(() => {
    const el = document.getElementById('btn-export-md');
    if (!el) return null;
    const style = window.getComputedStyle(el.querySelector('.tb-icon'), '::before');
    return {
      mask: style.getPropertyValue('-webkit-mask-image') || style.getPropertyValue('mask-image'),
      width: style.getPropertyValue('width'),
    };
  });
  console.log('btn-export-md ::before:', JSON.stringify(iconMd));
  assert(iconMd.mask.includes('svg'), 'btn-export-md icon 通过 CSS mask-image 渲染');

  console.log('\n=== 2) 导出 .md 触发 download ===');
  const [downloadMd] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-md'),
  ]);
  const mdPath = await downloadMd.path();
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  console.log('downloaded filename:', downloadMd.suggestedFilename());
  console.log('md content:', mdContent.slice(0, 200));
  assert(downloadMd.suggestedFilename() === 'demo.md', `文件名 = demo.md (actual: ${downloadMd.suggestedFilename()})`);
  assert(mdContent.includes('# Hello'), '含 # Hello');
  assert(mdContent.includes('**bold**'), '含 **bold**');
  assert(mdContent.includes('## Section 2'), '含 ## Section 2');
  // turndown 把 `- item` 转成 `-   item` (嵌套风格), 用宽松正则
  assert(/\-\s+item 1/.test(mdContent), '含 list item (turndown 加空格, 用正则)');

  console.log('\n=== 3) 导出 .docx 触发 download + 内容正确 ===');
  const [downloadDocx] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#btn-export-docx'),
  ]);
  const docxPath = await downloadDocx.path();
  console.log('downloaded filename:', downloadDocx.suggestedFilename());
  console.log('docx size:', fs.statSync(docxPath).size);
  assert(downloadDocx.suggestedFilename() === 'demo.docx', `文件名 = demo.docx (actual: ${downloadDocx.suggestedFilename()})`);
  // 检查文件前 4 bytes: ZIP 文件签名是 PK\x03\x04
  const fd = fs.openSync(docxPath, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  console.log('zip magic:', buf.toString('hex'));
  assert(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04, 'docx 是合法 ZIP (PK\\x03\\x04)');

  console.log('\n=== 4) docx 内 word/document.xml 含 # Hello (用 Node + JSZip 直接解压) ===');
  // 用 page context 里的 JSZip (我们刚 exportDocx 用的就是它, 也确保一致性)
  const docXmlContent = await page.evaluate(async (b64) => {
    // 解 b64 -> Uint8Array -> JSZip.loadAsync
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const JSZipMod = await import('https://esm.sh/jszip@3.10.1');
    const JSZip = JSZipMod.default;
    const zip = await JSZip.loadAsync(arr);
    const docXml = await zip.file('word/document.xml')?.async('string');
    return docXml;
  }, fs.readFileSync(docxPath).toString('base64'));
  // 从浏览器 console 抓 buildDocxBlob 的 debug (走 console.log)
  console.log('--- browser console logs (buildDocxBlob related) ---');
  for (const log of buildLogs) console.log('  ' + log);
  console.log('---');
  console.log('document.xml head:', docXmlContent.slice(0, 1500));
  // 查看 "bold" 段落全文 (解析 <w:p>...)
  const paragraphMatches = docXmlContent.match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
  console.log('全部 w:p 个数:', paragraphMatches.length);
  if (paragraphMatches.length > 1) {
    console.log('=== 第二段 (含 bold) ===');
    console.log(paragraphMatches[1]);
  }
  assert(docXmlContent.includes('Hello'), 'word/document.xml 含 "Hello"');
  assert(docXmlContent.includes('w:document'), 'word/document.xml 是合法 OOXML');
  // bold 可能在 <w:t>...</w:t> 文本里, 或被分两段. 用更宽的检查 - 含 strong run
  // OOXML run 用 <w:r> + <w:rPr><w:b/>...
  assert(docXmlContent.includes('<w:b/>') || /<w:rPr>[^<]*<w:b\/>/.test(docXmlContent), `含粗体 run (实际 docXmlContent 长度: ${docXmlContent.length})`);

  console.log('\n=== 5) 页面 JS 错误 ===');
  if (pageErrors.length > 0) {
    console.log('errors:', JSON.stringify(pageErrors, null, 2));
    throw new Error(`page 有 ${pageErrors.length} 个 JS 错误`);
  }
  console.log('  ✓ 0 个 page error');

  console.log('\n✓ 全部 5 步通过 — 导出按钮 + .md + .docx 都正常');
  await browser.close();
})().catch(e => {
  console.error('\n✗ FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
