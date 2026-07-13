// E2E: 跨行批注 (1 级标题 + 2 行正文) 创建 + reload 后能定位
// 用户报告: '跨行 (两行正文 + 一级标题) 无法提示标注'
// v2.1 修复: heading 也允许批注, 跨 textblock 走多段路径, P0 算法支持跨 block 找 text

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('Mentor:author', '张三'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERR:', e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8787/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('张三'));

  console.log('=== 1) 创建跨 textblock 选区 (heading + 2 段正文) → 批注按钮显示 ===');
  const md = '# 这是标题\n\n第一行正文内容\n\n第二行正文内容\n';
  await page.evaluate((a) => window.__mdAnnotator.loadMarkdownIntoEditor('cross.md', a, null), md);
  await page.waitForTimeout(500);

  // 选 H1 全部 + 2 段正文
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    let headFrom = -1, lastTo = -1;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && headFrom === -1) headFrom = pos + 1;
      if (node.type.name === 'paragraph' && node.isTextblock) lastTo = pos + node.nodeSize - 1;
    });
    ed.view.focus();
    ed.commands.setTextSelection({ from: headFrom, to: lastTo });
  });
  await page.waitForTimeout(200);
  // 焦点离开再回来, 触发 onSelectionUpdate + 按钮定位
  await page.evaluate(() => document.body.click());
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    ed.view.focus();
  });
  await page.waitForTimeout(200);
  const btnVis = await page.evaluate(() => {
    const btn = document.getElementById('float-comment-btn');
    return btn && !btn.classList.contains('hidden');
  });
  assert(btnVis, '跨 heading+2 段选区时, 批注按钮可见');

  console.log('\n=== 2) 创建批注: 多段 mark 共享 threadId ===');
  if (btnVis) {
    await page.locator('#float-comment-btn button').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const ta = document.querySelector('[data-thread-input]');
      ta.value = '整段都需要看';
      document.querySelector('button[data-act="submit-reply"]').click();
    });
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const ann = window.__mdAnnotator.State.annotations[0];
      const M = window.__mdAnnotator.State.editor.schema.marks.annotation;
      const marks = [];
      window.__mdAnnotator.State.editor.state.doc.descendants((node, pos) => {
        if (node.isText) node.marks.forEach(m => { if (m.type === M) marks.push({ pos, end: pos + node.text.length, text: node.text }); });
      });
      return {
        annCount: window.__mdAnnotator.State.annotations.length,
        annText: ann?.text,
        annRange: ann?.range,
        annRanges: ann?.ranges,
        annComments: ann?.comments?.length,
        annFuzzy: ann?.fuzzy,
        markCount: marks.length,
        marks,
      };
    });
    console.log('  ' + JSON.stringify(result, null, 2).split('\n').map(l => '  '+l).join('\n'));
    assert(result.annCount === 1, `1 个批注 (实际 ${result.annCount})`);
    assert(result.annText === '这是标题 第一行正文内容 第二行正文内容', `text 跨 block 用空格连接`);
    assert(result.annFuzzy === false || result.annFuzzy === undefined, 'fuzzy=false (精确匹配)');
    // v2.1: 多段 path 创建一个空 comment 占位 + addReply 填 body = 2 条
    assert(result.annComments === 2, `2 条 comment (空占位 + 用户填的) — 实际 ${result.annComments}`);
    assert(result.markCount === 3, `3 段 mark (heading+2段) — 实际 ${result.markCount}`);
  }

  console.log('\n=== 3) 重开 .mentor: 跨行 text 能重新定位 ===');
  if (btnVis) {
    // 打包成 .mentor
    const mentorBlob = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const mdText = M.htmlToMarkdown(ed.getHTML());
      const anns = M.State.annotations.map(t => ({
        threadId: t.threadId, text: t.text,
        prefix: t.prefix || '', suffix: t.suffix || '',
        resolved: t.resolved, createdAt: t.createdAt, comments: t.comments,
      }));
      const sidecar = {
        version: '1', document: 'cross.md', updatedAt: new Date().toISOString(),
        author: { id: M.State.authorId, name: M.State.author },
        annotations: anns,
      };
      const blob = await M.buildMentorZipBlob(mdText, sidecar);
      return await new Promise(res => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.split(',')[1]);
        fr.readAsDataURL(blob);
      });
    });
    // 写到磁盘
    const buf = Buffer.from(mentorBlob, 'base64');
    const fixturePath = path.join(__dirname, 'fixtures', 'cross-block.mentor');
    fs.writeFileSync(fixturePath, buf);
    console.log('  ✓ fixture 写入 ' + fixturePath);

    // 重置编辑器, 然后加载 .mentor
    await page.evaluate(() => window.__mdAnnotator.loadMarkdownIntoEditor('empty.md', '', null));
    await page.waitForTimeout(500);
    const reloadData = await page.evaluate(async (b64) => {
      const M = window.__mdAnnotator;
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'cross-block.mentor', { type: 'application/zip' });
      const { mdText, annotations } = await M.readMentorZip(file);
      await M.loadMarkdownIntoEditor('cross-block.mentor', mdText, annotations);
      await new Promise(r => setTimeout(r, 500));
      const ann = M.State.annotations[0];
      const Mark = M.State.editor.schema.marks.annotation;
      const marks = [];
      M.State.editor.state.doc.descendants((node, pos) => {
        if (node.isText) node.marks.forEach(m => { if (m.type === Mark) marks.push({ text: node.text }); });
      });
      return {
        annText: ann?.text,
        annFuzzy: ann?.fuzzy,
        annInvalid: ann?.invalid,
        annInvalidReason: ann?.invalidReason,
        annRange: ann?.range,
        markCount: marks.length,
        markTexts: marks.map(m => m.text),
      };
    }, mentorBlob);
    console.log('  ' + JSON.stringify(reloadData, null, 2).split('\n').map(l => '  '+l).join('\n'));
    assert(reloadData.annFuzzy === false, 'reload 后 fuzzy=false (跨 block text 精确匹配)');
    assert(reloadData.annInvalid !== true, 'reload 后 invalid≠true (不丢失)');
    assert(reloadData.markCount === 3, `reload 后 3 段 mark (实际 ${reloadData.markCount})`);
    assert(reloadData.markTexts.join(',') === '这是标题,第一行正文内容,第二行正文内容',
      `3 段 text 正确: ${JSON.stringify(reloadData.markTexts)}`);
  }

  console.log('\n✓ 全部跨行批注场景通过');
  await browser.close();
})().catch(e => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
