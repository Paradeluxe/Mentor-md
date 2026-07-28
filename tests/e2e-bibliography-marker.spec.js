// tests/e2e-bibliography-marker.spec.js
// EndNote-style bibliography field: semantic marker → BibliographyNode → marker
// Round-trip test (Tasks 4/5/7): load a markdown document that carries the
// `<!-- mentor:bibliography -->` marker, ensure the editor renders the atom
// (NOT the APA text), then round-trip back to markdown and verify the marker
// is preserved (NOT the rendered entries).
//
// All synthetic — never touches a real .mentor file.
const { chromium } = require('playwright');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}&cb=${Date.now()}`;

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem('Mentor:author', 'bib-marker-test'));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });

    console.log('\n=== Marker → atom → marker round-trip ===');
    // Load a synthetic markdown with a bibliography marker, library with 2
    // cited entries, no handmade references section.
    await page.evaluate(() => {
      document.querySelector('#author-modal')?.classList.add('hidden');
      window.__mdAnnotator.openNewTabBlank();
      const M = window.__mdAnnotator;
      const lib = M.createReferenceManifest({
        sourceName: 'unit-test.bib',
        sourceFormat: 'bibtex',
        entries: [
          { key: 'smith2024', type: 'article', authors: 'Smith, A.', year: '2024', title: 'A study', journal: 'J. Tests' },
          { key: 'jones2025', type: 'article', authors: 'Jones, B.', year: '2025', title: 'Another study', journal: 'J. Tests' }
        ],
        bibliography: { enabled: true, scope: 'cited', heading: 'References' }
      });
      M.State.references = lib;
      M.reconcileBibliographyNode();
      const md = '# Title\n\nSee [-@smith2024, p. 3] and [@jones2025].\n\n<!-- mentor:bibliography -->\n';
      M.loadMarkdownIntoEditor('bib-marker.md', md, null, {
        references: lib,
        referencesBib: ''
      });
    });

    // Wait for editor + bibliography node to materialize.
    await page.waitForFunction(() => !!document.querySelector('section[data-mentor-bibliography]'), { timeout: 5000 });

    const view = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const sec = document.querySelector('section[data-mentor-bibliography]');
      const entries = [...document.querySelectorAll('section[data-mentor-bibliography] p.mentor-bibliography-entry')];
      return {
        hasSection: !!sec,
        heading: sec && sec.querySelector('h1.mentor-bibliography-heading')?.textContent,
        entryKeys: entries.map((p) => p.getAttribute('data-key')),
        entryTexts: entries.map((p) => p.textContent || ''),
        keys: sec && sec.getAttribute('data-bibliography-keys'),
        itemsCount: sec ? JSON.parse(sec.getAttribute('data-bibliography-items') || '[]').length : 0,
        scope: sec && sec.getAttribute('data-bibliography-scope'),
        headingAttr: sec && sec.getAttribute('data-bibliography-heading'),
        refConfig: M.normalizeBibliographyConfig(M.State.references.bibliography),
        // md round-trip via turndown-style htmlToMarkdownMedia
        roundtripMd: M.htmlToMarkdownMedia(M.State.editor.getHTML())
      };
    });

    assert(view.hasSection, '编辑器里出现 BibliographyNode section');
    assert(view.heading === 'References', 'heading 渲染 References');
    assert(view.entryKeys.length === 2, `两条引用条目 (${view.entryKeys.length})`);
    assert(view.entryKeys[0] === 'smith2024' || view.entryKeys[1] === 'smith2024', 'smith2024 出现在条目内');
    assert(view.entryKeys[0] === 'jones2025' || view.entryKeys[1] === 'jones2025', 'jones2025 出现在条目内');
    assert(/Smith, A\./.test(view.entryTexts.join(' | ')), 'Smith 作者姓名渲染');
    assert(/Jones, B\./.test(view.entryTexts.join(' | ')), 'Jones 作者姓名渲染');
    assert(view.refConfig.scope === 'cited' && view.refConfig.enabled, 'config scope=cited enabled=true');
    assert(view.roundtripMd.includes('mentor:bibliography'), 'roundtrip md 保留 marker');
    assert(!/^Smith, A\./m.test(view.roundtripMd.split('mentor:bibliography')[1] || ''), 'roundtrip 不写 APA 文本');
    assert(!/^Jones, B\./m.test(view.roundtripMd.split('mentor:bibliography')[1] || ''), 'roundtrip 不写 Jones APA 文本');
    assert(view.roundtripMd.includes('[@jones2025]') && view.roundtripMd.includes('[-@smith2024'), 'roundtrip 保留 citation Pandoc 语法');

    console.log('\n=== source-mode protection ===');
    await page.evaluate(() => window.__mdAnnotator.setRenderMode('source'));
    const sourceState = await page.evaluate(() => {
      const sourceEl = document.querySelector('#source-view');
      const chips = sourceEl ? sourceEl.querySelectorAll('.source-bibliography-marker') : [];
      return {
        chipCount: chips.length,
        chipHasCeeFalse: chips.length > 0 && chips[0].getAttribute('contenteditable') === 'false',
        chipToken: chips.length > 0 ? chips[0].getAttribute('data-source-token') : null,
        // innerText should NOT contain literal marker (chip hides it), but the
        // DOM-cloned reconstruct path inside flushSourceView does.
        innerHasMarker: sourceEl ? sourceEl.innerText.includes('mentor:bibliography') : false,
        // The chip label
        chipLabel: chips.length > 0 ? (chips[0].textContent || '').trim() : null
      };
    });
    assert(sourceState.chipCount >= 1, `source 视图出现至少 1 个 chip (${sourceState.chipCount})`);
    assert(sourceState.chipHasCeeFalse, 'chip contenteditable=false');
    assert(sourceState.chipToken === 'bibliography', `chip data-source-token=bibliography (${sourceState.chipToken})`);
    assert(/由文献库生成/.test(sourceState.chipLabel || ''), `chip 标签文案包含「由文献库生成」(${sourceState.chipLabel})`);

    // Switch back; flushSourceView must rebuild marker — not APA text
    await page.evaluate(() => window.__mdAnnotator.setRenderMode('rendered'));
    const flushed = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const sec = document.querySelector('section[data-mentor-bibliography]');
      return {
        secStillThere: !!sec,
        itemsLen: sec ? JSON.parse(sec.getAttribute('data-bibliography-items') || '[]').length : 0,
        roundtripMd: M.htmlToMarkdownMedia(M.State.editor.getHTML())
      };
    });
    assert(flushed.secStillThere, '切回 rendered 视图 section 仍在');
    assert(flushed.itemsLen === 2, '切回 rendered 视图条目数仍是 2');
    assert(flushed.roundtripMd.includes('mentor:bibliography'), '切回 rendered 后 roundtrip md 仍保留 marker');

    console.log('\n=== scope=all varies library listing ===');
    await page.evaluate(() => {
      window.__mdAnnotator.setBibliographyScope('all');
      // Also add an *uncited* entry to verify scope=all pulls full library.
      window.__mdAnnotator.addReferenceEntry({
        key: 'doe2026', type: 'article', authors: 'Doe, C.', year: '2026', title: 'Extra paper'
      });
    });
    await page.waitForTimeout(80);
    const allScopeView = await page.evaluate(() => {
      const sec = document.querySelector('section[data-mentor-bibliography]');
      const items = sec ? JSON.parse(sec.getAttribute('data-bibliography-items') || '[]') : [];
      return { count: items.length, keys: items.map((i) => i.key) };
    });
    assert(allScopeView.count === 3, `scope=all 渲染 3 条 (${allScopeView.count})`);
    assert(allScopeView.keys.includes('doe2026'), 'scope=all 包含未引用的 doe2026');

    // Restore cited scope for downstream
    await page.evaluate(() => window.__mdAnnotator.setBibliographyScope('cited'));

    console.log('\n=== insert/remove toggle (no library delete) ===');
    const before = await page.evaluate(() => {
      window.__mdAnnotator.removeBibliographyField({ confirm: false });
      return {
        entries: window.__mdAnnotator.State.references.entries.length,
        enabled: window.__mdAnnotator.State.references.bibliography.enabled
      };
    });
    assert(before.entries === 3, 'remove 后文献库条目不变');
    assert(before.enabled === false, 'remove 后 enabled=false');
    const inserted = await page.evaluate(() => window.__mdAnnotator.insertBibliographyField());
    assert(inserted === true, 'insertBibliographyField 成功');
    const afterInsert = await page.evaluate(() => {
      const sec = document.querySelector('section[data-mentor-bibliography]');
      return {
        secCount: document.querySelectorAll('section[data-mentor-bibliography]').length,
        enabled: window.__mdAnnotator.State.references.bibliography.enabled
      };
    });
    assert(afterInsert.secCount === 1 && afterInsert.enabled, '插入后 section 数=1 + enabled=true');

    if (pageErrors.length) {
      console.log('PAGE ERRORS:', pageErrors);
      throw new Error('page error during scenario');
    }
    console.log('\n=== ALL PASS ===');
  } catch (e) {
    console.error('FAIL', e);
    console.error('pageErrors=', pageErrors);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
