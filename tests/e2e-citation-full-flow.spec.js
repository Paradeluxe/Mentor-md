// tests/e2e-citation-full-flow.spec.js
//
// 端到端 citation 联动 RED 测试 — 验证产品契约:
//   1. 导入 2-entry BibTeX → 卡片渲染
//   2. 正文 raw `[@key]` 渲染为 contenteditable=false `.mentor-citation` (作者, 年份)
//   3. 点击库 insert 按钮 → 在光标处插入一个 atom (.mentor-citation)
//   4. 选中已存在 atom → 库中再选另一 key → 合并为 `[@a; @b]` atom
//   5. 点击正文 atom → 滚动到对应 refs-card 并高亮
//   6. 卡片上显示 usage (被引用次数)
//   7. 未在库中的 key → 显示 "[缺失：@key]" 标记
//   8. buildMentorZipBlob + readMentorZip roundtrip: references.json + references.bib 都写进去 + 读出来
//   9. buildDocxBlob 输出 docx: 正文 author-year + References section, 不含 raw `[@key]`
//  10. 全程 0 page errors
//
// 期望 API (待实现方在 __mdAnnotator 上暴露):
//
//   __mdAnnotator.insertCitation(key)              // 在光标处插入新 atom (key 不存在则空操作)
//   __mdAnnotator.insertCitationIntoSelection(key) // 在当前 selection 处合并 — 选中 atom 则合并,
//                                                   // 选中纯文本则替换为 atom
//   __mdAnnotator.focusCitationByKey(key)          // 点击正文 → 跳转到 refs-card + 高亮
//   __mdAnnotator.getCitationUsages()              // → { [key]: number }
//   __mdAnnotator.references                       // { entries, sourceName, sourceFormat, bibText }
//                                                   // 当前公开的只有 refs 库的内部 state —
//                                                   // 这个测试调用 buildMentorZipBlob 走 roundtrip
//
// 测试只在 %TEMP% 写产物 (screenshots / 输出文件). 不修改生产代码, 不写真实 .mentor.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}`;
const TMP_DIR = path.join(os.tmpdir(), `mentor-citation-test-${process.pid}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const BIB_2 = `@article{alpha2020first,
  author = {Alpha, Ann and Beta, Bob},
  title = {{First} title},
  journal = {Journal A},
  year = {2020},
  doi = {10.1/alpha}
}

@article{zeta2024last,
  author = {Zeta, Zoe},
  title = {Last title},
  journal = {Journal Z},
  year = {2024},
  doi = {10.1/zeta}
}`;

let pass = 0, fail = 0;
function assert(cond, message) {
  if (cond) { console.log(`  \u2713 ${message}`); pass++; }
  else      { console.log(`  \u2717 ${message}`); fail++; }
}
function assertEq(actual, expected, message) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { console.log(`  \u2713 ${message}`); pass++; }
  else { console.log(`  \u2717 ${message}\n      expected ${b}\n      actual   ${a}`); fail++; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'citation-test'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });

    // -------------------------------------------------------------------------
    // 0) 重置文档
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor('citation-flow.md', '', null);
    });
    await page.waitForTimeout(150);

    // -------------------------------------------------------------------------
    // 1) 导入 2-entry BibTeX → 渲染 2 张 refs-card
    // -------------------------------------------------------------------------
    console.log('\n=== 1. BibTeX import ===');
    await page.locator('#refs-file-input').setInputFiles({
      name: 'library.bib',
      mimeType: 'application/x-bibtex',
      buffer: Buffer.from(BIB_2, 'utf8'),
    });
    await page.waitForFunction(() => document.querySelectorAll('.refs-card').length === 2);
    const initialKeys = await page.evaluate(() =>
      [...document.querySelectorAll('.refs-card .rc-key')].map(x => x.textContent)
    );
    assertEq(initialKeys, ['@alpha2020first', '@zeta2024last'], 'imported BibTeX is sorted by citekey');

    // -------------------------------------------------------------------------
    // 2) 正文 raw `[@key]` → 渲染成 contenteditable=false .mentor-citation (作者年份)
    //    文本 `See [@alpha2020first] for details.` 中的 `[@alpha2020first]` 必须是 atom
    // -------------------------------------------------------------------------
    console.log('\n=== 2. Raw [@key] renders as .mentor-citation atom ===');
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor('citation-flow.md',
        'See [@alpha2020first] for details and also [@zeta2024last, p. 12] later.\n\n', null);
    });
    await page.waitForTimeout(250);
    const atoms = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      return nodes.map(n => ({
        ce: n.getAttribute('contenteditable'),
        key: n.getAttribute('data-key') || n.getAttribute('data-citekey'),
        text: (n.textContent || '').trim(),
        rawPresent: n.querySelector('code, .raw-citation')?.textContent || null,
      }));
    });
    assert(atoms.length === 2, `2 citation atoms rendered (got ${atoms.length})`);
    if (atoms.length === 2) {
      assertEq(atoms.map(a => a.ce), ['false', 'false'], 'atoms are contenteditable=false');
      assertEq(atoms.map(a => a.key).sort(), ['alpha2020first', 'zeta2024last'],
        'each atom carries its citekey');
      // 作者年份: (Alpha & Beta, 2020) 与 (Zeta, 2024, p. 12)
      assert(atoms[0].text.includes('Alpha') && atoms[0].text.includes('2020'),
        `alpha atom shows author-year (got "${atoms[0].text}")`);
      assert(atoms[1].text.includes('Zeta') && atoms[1].text.includes('2024'),
        `zeta atom shows author-year (got "${atoms[1].text}")`);
      assert(atoms[0].rawPresent === null,
        'no raw `[@key]` literal inside the rendered atom');
    }
    // 编辑器 innerText 不应再出现字面 `[@`  (已被替换)
    const bodyText = await page.locator('#editor').innerText();
    assert(!bodyText.includes('[@'), `editor body no longer contains raw [@] (got "${bodyText.slice(0, 80)}…")`);

    // -------------------------------------------------------------------------
    // 3) 库 insert 按钮 → 在光标处插入 atom
    // -------------------------------------------------------------------------
    console.log('\n=== 3. Insert button inserts an atom ===');
    await page.evaluate(() => {
      // 清空文档, 留一个空行 + 光标
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>prefix </p>', false);
      ed.commands.focus('end');
    });
    await page.waitForTimeout(100);
    const beforeInsert = await page.evaluate(() =>
      document.querySelectorAll('.mentor-citation').length
    );
    // 库面板里的 insert 按钮 (使用现有的 [data-act=insert-cite])
    await page.locator('.refs-card[data-key="alpha2020first"] .rc-insert-btn').click();
    await page.waitForTimeout(150);
    const afterInsert = await page.evaluate(() => ({
      count: document.querySelectorAll('.mentor-citation').length,
      keys: [...document.querySelectorAll('.mentor-citation')].map(n => n.getAttribute('data-key')),
    }));
    assert(afterInsert.count === beforeInsert + 1, `atom count grew by 1 (${beforeInsert} → ${afterInsert.count})`);
    assert(afterInsert.keys.includes('alpha2020first'),
      'inserted atom carries alpha2020first key');

    // -------------------------------------------------------------------------
    // 4) 选中已存在 atom → 库再点另一 key → 合并为 [@a; @b]
    // -------------------------------------------------------------------------
    console.log('\n=== 4. Selecting atom + inserting another key merges into [@a; @b] ===');
    const hasInsertCitation = await page.evaluate(() =>
      typeof window.__mdAnnotator.insertCitation === 'function'
    );
    assert(hasInsertCitation, '__mdAnnotator.insertCitation is exposed');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent(
        '<p>alpha cite here.</p><p>then more text</p>',
        false
      );
      ed.commands.focus('end');
      // 把 alpha atom 插到第一段尾部
      if (typeof window.__mdAnnotator.insertCitation === 'function') {
        window.__mdAnnotator.insertCitation('alpha2020first');
      }
    });
    await page.waitForTimeout(150);
    // 选中刚插入的 atom (模拟用户点击/选区落在 atom 上)
    const atomSelected = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      if (!nodes.length) return false;
      const node = nodes[nodes.length - 1];
      // 找到该 atom 在 PM 文档里的位置
      const view = ed.view;
      // 终极 fallback: 用 getPosFromDOM (Tiptap 提供)
      let pos = null;
      if (typeof node.getAttribute === 'function' && node.getAttribute('data-pos')) {
        pos = parseInt(node.getAttribute('data-pos'), 10);
      }
      if (pos == null) {
        // 终极 fallback: 从 ProseMirror 通过 closest dom 节点找 pos
        try {
          pos = view.posAtDOM(node, 0);
        } catch (e) { pos = null; }
      }
      if (pos == null) return false;
      ed.commands.setTextSelection({ from: pos, to: pos + (node.textContent || '').length });
      return true;
    });
    assert(atomSelected, 'selected existing atom in editor');
    // 库点 zeta 的 insert 按钮 — 应合并到当前 selection
    await page.locator('.refs-card[data-key="zeta2024last"] .rc-insert-btn').click();
    await page.waitForTimeout(200);
    const merged = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const md = (window.__mdAnnotator.htmlToMarkdownMedia
        ? window.__mdAnnotator.htmlToMarkdownMedia(ed.getHTML())
        : ed.getText());
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      return {
        rawMd: md,
        atomCount: nodes.length,
        keys: nodes.map(n => n.getAttribute('data-key')),
        texts: nodes.map(n => (n.textContent || '').trim()),
      };
    });
    // 期望: 1 个 atom, 包含两个 key, 文本含 'Alpha' 与 'Zeta'
    assert(merged.atomCount === 1, `merged into 1 atom (got ${merged.atomCount})`);
    if (merged.atomCount === 1) {
      assert(merged.texts[0].includes('Alpha') && merged.texts[0].includes('Zeta'),
        `merged atom shows both authors (got "${merged.texts[0]}")`);
      // markdown 序列化层应输出 [@a; @b]
      assert(merged.rawMd.includes('@alpha2020first') && merged.rawMd.includes('@zeta2024last'),
        `serialized markdown contains both keys (got "${merged.rawMd.slice(0, 200)}")`);
    }

    // -------------------------------------------------------------------------
    // 5) 点击正文 atom → 滚动到 refs-card 并高亮
    // -------------------------------------------------------------------------
    console.log('\n=== 5. Click body atom focuses + highlights refs-card ===');
    // 先清空面板高亮 (如果有 .is-active 之类的)
    const focusResult = await page.evaluate(async () => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent('<p>focus test [@alpha2020first] end</p>', false);
      ed.commands.focus('end');
      await new Promise(r => setTimeout(r, 50));
      const atom = document.querySelector('.mentor-citation[data-key="alpha2020first"]');
      if (!atom) return { ok: false, reason: 'no atom', cls: null, scrolledIntoView: null, cls2: null, inView: null };
      try { atom.click(); } catch (e) {}
      await new Promise(r => setTimeout(r, 100));
      const card = document.querySelector('.refs-card[data-key="alpha2020first"]');
      const cls = card ? card.className : null;
      const scrolledIntoView = await new Promise(resolve => {
        if (!card) return resolve(false);
        const r = card.getBoundingClientRect();
        resolve(r.top >= 0 && r.bottom <= window.innerHeight);
      });
      // 调用公开 API 焦点
      if (window.__mdAnnotator.focusCitationByKey) {
        window.__mdAnnotator.focusCitationByKey('alpha2020first');
        await new Promise(r => setTimeout(r, 100));
      }
      const card2 = document.querySelector('.refs-card[data-key="alpha2020first"]');
      const cls2 = card2 ? card2.className : null;
      const inView = await new Promise(resolve => {
        if (!card2) return resolve(false);
        const r = card2.getBoundingClientRect();
        resolve(r.top >= 0 && r.bottom <= window.innerHeight);
      });
      return { ok: true, reason: null, cls, scrolledIntoView, cls2, inView };
    });
    assert(focusResult.ok === true, 'click on body atom did not throw');
    assert(/active|highlight|focused|selected|is-current/.test(focusResult.cls2 || ''),
      `card gets highlight class on body-atom click (got "${focusResult.cls2}")`);
    assert(focusResult.inView === true,
      'refs-card is scrolled into view after body-atom click');
    const hasFocusApi = await page.evaluate(() =>
      typeof window.__mdAnnotator.focusCitationByKey === 'function'
    );
    assert(hasFocusApi, '__mdAnnotator.focusCitationByKey is exposed');

    // -------------------------------------------------------------------------
    // 6) 卡片 usage — 卡片上显示被引用次数
    // -------------------------------------------------------------------------
    console.log('\n=== 6. refs-card shows usage count ===');
    // 在正文多放几个 alpha 引用
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent(
        '<p>a [@alpha2020first] b [@alpha2020first] c [@zeta2024last] d</p>',
        false
      );
      ed.commands.focus('end');
    });
    await page.waitForTimeout(150);
    const usages = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.refs-card[data-key]')];
      const out = {};
      for (const c of cards) {
        const key = c.getAttribute('data-key');
        const usageEl = c.querySelector('.rc-usage, [data-usage], .usage, .badge');
        out[key] = usageEl ? (usageEl.textContent || '').trim() : null;
      }
      return out;
    });
    // 也尝试通过 API 拿
    const usagesApi = await page.evaluate(() => {
      if (typeof window.__mdAnnotator.getCitationUsages !== 'function') return null;
      return window.__mdAnnotator.getCitationUsages();
    });
    const usageAlpha = (usagesApi && usagesApi.alpha2020first) != null
      ? usagesApi.alpha2020first
      : (usages.alpha2020first && parseInt(usages.alpha2020first, 10));
    const usageZeta = (usagesApi && usagesApi.zeta2024last) != null
      ? usagesApi.zeta2024last
      : (usages.zeta2024last && parseInt(usages.zeta2024last, 10));
    assert(usageAlpha === 2,
      `alpha usage = 2 (card-text="${usages.alpha2020first}", api=${usagesApi && usagesApi.alpha2020first})`);
    assert(usageZeta === 1,
      `zeta usage = 1 (card-text="${usages.zeta2024last}", api=${usagesApi && usagesApi.zeta2024last})`);

    // -------------------------------------------------------------------------
    // 7) missing key → 显示 "[缺失：@missing2025]" 标记
    // -------------------------------------------------------------------------
    console.log('\n=== 7. Missing key shows visible marker ===');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setContent(
        '<p>real [@alpha2020first] plus [@ghost2025] and another [@ghost2025].</p>',
        false
      );
      ed.commands.focus('end');
    });
    await page.waitForTimeout(150);
    const missingReport = await page.evaluate(() => {
      const atoms = [...document.querySelectorAll('.mentor-citation')];
      return atoms.map(n => ({
        key: n.getAttribute('data-key'),
        text: (n.textContent || '').trim(),
        isMissing: /(缺失|missing|未找到)/i.test(n.textContent || ''),
      }));
    });
    assert(missingReport.length === 3, `3 atoms rendered (got ${missingReport.length})`);
    if (missingReport.length === 3) {
      const ghosts = missingReport.filter(a => a.key === 'ghost2025');
      assert(ghosts.length === 2, `2 ghost atoms (got ${ghosts.length})`);
      assert(ghosts.every(g => g.isMissing),
        'ghost atoms are visually marked as missing');
    }

    // -------------------------------------------------------------------------
    // 8) buildMentorZipBlob + readMentorZip roundtrip — references.json + references.bib
    // -------------------------------------------------------------------------
    console.log('\n=== 8. .mentor zip roundtrip preserves references ===');
    const mdText = 'See [@alpha2020first] for intro, and [@zeta2024last] later.';
    const roundtrip = await page.evaluate(async (md) => {
      const M = window.__mdAnnotator;
      const sidecar = { annotations: [] };
      // 把当前库的 entries 暴露给 buildMentorZipBlob
      // 因为当前 API 没有直接传 references 进去, 测试用 fallback:
      // 通过 zip 直接添加 references.json + references.bib 是不允许的 (只让生产代码
      // 自己实现). 这里只调用公开的 buildMentorZipBlob, 然后再 readMentorZip 解析 —
      // 期望产物中含 references.json + references.bib.
      const blob = await M.buildMentorZipBlob(md, sidecar, {});
      const buf = await blob.arrayBuffer();
      // 模拟 "把 .mentor 当 File 读回" — readMentorZip 接受 File-like
      const fakeFile = new File([buf], 'flow.mentor', { type: 'application/zip' });
      const parsed = await M.readMentorZip(fakeFile);
      return {
        ok: true,
        mdLen: parsed.mdText.length,
        annLen: parsed.annotations ? parsed.annotations.length : -1,
        keys: Object.keys(parsed),
      };
    }, mdText);
    assert(roundtrip.ok, 'buildMentorZipBlob + readMentorZip did not throw');
    // 直接用 Node 端 jszip 解析产物 zip, 验证 references.json + references.bib 存在
    const zipBufB64 = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      const md = 'See [@alpha2020first] for intro.';
      const sidecar = { annotations: [] };
      const blob = await M.buildMentorZipBlob(md, sidecar, {});
      const buf = await blob.arrayBuffer();
      // 转 base64 跨边界送回 Node
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    });
    const JSZip = require('jszip');
    const zipBuf = Buffer.from(zipBufB64, 'base64');
    const zipObj = await JSZip.loadAsync(zipBuf);
    const fileNames = Object.keys(zipObj.files).filter(n => !zipObj.files[n].dir).sort();
    const refsJson = zipObj.file('references.json') ? await zipObj.file('references.json').async('string') : null;
    const refsBib = zipObj.file('references.bib') ? await zipObj.file('references.bib').async('string') : null;
    const contentMd = zipObj.file('content.md') ? await zipObj.file('content.md').async('string') : null;
    assert(fileNames.includes('references.json'),
      `zip contains references.json (files: ${fileNames.join(', ')})`);
    assert(fileNames.includes('references.bib'),
      `zip contains references.bib (files: ${fileNames.join(', ')})`);
    if (refsJson) {
      let parsed = null; try { parsed = JSON.parse(refsJson); } catch (e) {}
      assert(parsed && Array.isArray(parsed.entries) && parsed.entries.length === 2,
        `references.json has 2 entries (got ${parsed && parsed.entries && parsed.entries.length})`);
      assert(parsed && parsed.entries && parsed.entries.some(e => e.key === 'alpha2020first'),
        'references.json includes alpha2020first');
      assert(parsed && parsed.entries && parsed.entries.some(e => e.key === 'zeta2024last'),
        'references.json includes zeta2024last');
    }
    if (refsBib) {
      assert(/@article\{alpha2020first/.test(refsBib),
        'references.bib has @article{alpha2020first, …}');
      assert(/@article\{zeta2024last/.test(refsBib),
        'references.bib has @article{zeta2024last, …}');
    }
    if (contentMd) {
      assert(/\[@alpha2020first\]/.test(contentMd),
        'content.md roundtrips the [@alpha2020first] marker');
    }

    // -------------------------------------------------------------------------
    // 9) buildDocxBlob: author-year + References section, no raw [@key]
    // -------------------------------------------------------------------------
    console.log('\n=== 9. buildDocxBlob outputs author-year + References ===');
    const docxBufB64 = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      // 编辑器先放一段含引用的内容
      const ed = M.State.editor;
      ed.commands.setContent(
        '<p>See [@alpha2020first] for intro, and [@zeta2024last] later.</p>',
        false
      );
      ed.commands.focus('end');
      await new Promise(r => setTimeout(r, 50));
      const html = ed.getHTML();
      const blob = await M.buildDocxBlob(html, {});
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    });
    const docxZip = await JSZip.loadAsync(Buffer.from(docxBufB64, 'base64'));
    const docXml = await docxZip.file('word/document.xml').async('string');
    // author-year 渲染 (中文标签: "Alpha" + "2020"; "Zeta" + "2024")
    assert(/Alpha/.test(docXml) && /2020/.test(docXml),
      'docx document.xml contains "Alpha" + "2020" (author-year label)');
    assert(/Zeta/.test(docXml) && /2024/.test(docXml),
      'docx document.xml contains "Zeta" + "2024" (author-year label)');
    // 不应包含字面 [@alpha2020first] / [@zeta2024last]
    assert(!/\[@alpha2020first\]/.test(docXml),
      'docx does not contain literal "[@alpha2020first]"');
    assert(!/\[@zeta2024last\]/.test(docXml),
      'docx does not contain literal "[@zeta2024last]"');
    // References section: 至少一个段含 references.bib 里的两条 entry 标题
    assert(/First/.test(docXml) && /Last/.test(docXml),
      'docx contains References section with entry titles');

    // -------------------------------------------------------------------------
    // 10) 0 page errors
    // -------------------------------------------------------------------------
    console.log('\n=== 10. No page errors ===');
    assert(pageErrors.length === 0,
      `0 page errors (got: ${pageErrors.join(' | ').slice(0, 200) || 'none'})`);

    // 截图存证 (RED 测试, 给实现方看现状)
    await page.screenshot({ path: path.join(TMP_DIR, 'red-citation-full-flow.png'), fullPage: true });
    console.log(`\nScreenshot saved to ${path.join(TMP_DIR, 'red-citation-full-flow.png')}`);

    console.log(`\n=== SUMMARY: ${pass} pass / ${fail} fail ===`);
    if (fail > 0) {
      console.log('\nRED as expected — citation feature not yet wired into app.js.');
      console.log('Implementers: see the API contract documented at the top of this test.');
    }
    process.exitCode = fail > 0 ? 1 : 0;
  } catch (err) {
    console.error('\nTEST CRASHED:', err.stack || err);
    process.exit(2);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();