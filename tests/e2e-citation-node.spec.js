// tests/e2e-citation-node.spec.js
//
// CitationNode TDD — focused RED-then-GREEN for Task 3 + Task 4 of the
// citation body linkage plan. Verifies the atomic, read-only WYSIWYG
// representation of Pandoc citations and the lossless Markdown ↔ HTML ↔
// Markdown roundtrip.
//
// Product contract covered here:
//   1. Pandoc citation `[@key]` in Markdown becomes one inline atom
//      `<span class="mentor-citation" data-citation-raw="[@key]"
//       contenteditable="false">…</span>`, not literal text.
//   2. When the editor is given a references manifest via
//      `loadMarkdownIntoEditor(name, md, annotations, { references })`
//      the displayed label uses the author-year formatter from
//      modules/references.js. Without options.references the label
//      falls back to the raw citation text so nothing is lost.
//   3. Negative author (`[-@key, p. 3]`) and multi-key groups
//      (`[@a; @b]`) preserve their raw bytes through MarkdownIt.
//   4. Turndown roundtrip emits the exact original Pandoc syntax,
//      never the display label.
//   5. Missing keys render with the `[缺失：@key]` visible marker
//      when a partial manifest is supplied.
//   6. Editor `extensions` register the `citation` node so the
//      schema accepts the new node type without warnings.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const URL = `http://127.0.0.1:8787/index.html?v=${Date.now()}`;
const TMP_DIR = path.join(os.tmpdir(), `mentor-citation-node-${process.pid}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const REFERENCE_MANIFEST = {
  version: '1',
  source: { name: 'library.bib', format: 'bibtex' },
  updatedAt: '2026-07-26T00:00:00.000Z',
  entries: [
    {
      key: 'alpha2020first',
      type: 'article',
      authors: 'Alpha, Ann; Beta, Bob',
      year: '2020',
      title: 'First title',
      journal: 'Journal A',
      doi: '10.1/alpha',
    },
    {
      key: 'zeta2024last',
      type: 'article',
      authors: 'Zeta, Zoe',
      year: '2024',
      title: 'Last title',
      journal: 'Journal Z',
      doi: '10.1/zeta',
    },
  ],
};

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
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('Mentor:author', 'citation-node-test'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 15000 });

    // Expose a test-only reference manifest so the page can read it.
    await page.evaluate((manifest) => {
      window.__testReferenceManifest = manifest;
    }, REFERENCE_MANIFEST);

    // -------------------------------------------------------------------------
    // 1) Schema registration: editor.schema has 'citation' node type
    // -------------------------------------------------------------------------
    console.log('\n=== 1. Editor schema registers citation node ===');
    const schemaNames = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      // Tiptap exposes schema.nodes via ProseMirror — it's a NodeType map
      // indexed by name. Use the editor's own node registry instead.
      const names = [];
      try {
        if (ed.schema && ed.schema.nodes) {
          for (const key of Object.keys(ed.schema.nodes)) names.push(key);
        }
      } catch (e) {}
      return names;
    });
    assert(schemaNames.includes('citation'),
      `editor schema contains citation node (got: ${schemaNames.filter(n => /cit|katex|annotation/i.test(n)).join(',') || 'none'})`);

    // -------------------------------------------------------------------------
    // 2) Without references: `[@alpha2020first]` renders as a citation atom
    //    displaying the raw text (no author-year available)
    // -------------------------------------------------------------------------
    console.log('\n=== 2. Raw [@key] becomes atom; label falls back to raw without refs ===');
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor(
        'citation-node.md',
        'See [@alpha2020first] for details.',
        null
      );
    });
    await page.waitForTimeout(200);
    const noRefs = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      return {
        count: nodes.length,
        first: nodes[0] ? {
          ce: nodes[0].getAttribute('contenteditable'),
          raw: nodes[0].getAttribute('data-citation-raw'),
          keys: nodes[0].getAttribute('data-citation-keys'),
          text: (nodes[0].textContent || '').trim(),
          isAtom: nodes[0].classList.contains('mentor-citation'),
        } : null,
      };
    });
    assert(noRefs.count === 1, `exactly one citation atom (got ${noRefs.count})`);
    if (noRefs.first) {
      assertEq(noRefs.first.ce, 'false', 'atom is contenteditable=false');
      assertEq(noRefs.first.raw, '[@alpha2020first]', 'atom carries data-citation-raw');
      assertEq(noRefs.first.text, '[@alpha2020first]',
        'no references provided → label is the raw citation text');
    }
    // Body should no longer expose the literal text node `@alpha2020first` in plain text
    // (it is wrapped inside the atom). The raw text still appears as the atom's
    // textContent — what we care about is that the citation is an atom, not free text.
    const atomInsideEditor = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const found = [];
      ed.state.doc.descendants((node) => {
        if (node.type && node.type.name === 'citation') found.push({
          raw: node.attrs.raw,
          keys: node.attrs.keys,
          label: node.attrs.label,
          missingKeys: node.attrs.missingKeys,
        });
      });
      return found;
    });
    assert(atomInsideEditor.length === 1, 'editor doc tree contains exactly 1 citation node');
    if (atomInsideEditor.length === 1) {
      assertEq(atomInsideEditor[0].raw, '[@alpha2020first]',
        'citation node attrs.raw stores the Pandoc syntax verbatim');
    }

    // -------------------------------------------------------------------------
    // 3) With options.references: label renders the author-year form
    // -------------------------------------------------------------------------
    console.log('\n=== 3. With references, label uses author-year ===');
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor(
        'citation-node.md',
        'See [@alpha2020first] for details and also [@zeta2024last, p. 12] later.',
        null,
        { references: window.__testReferenceManifest }
      );
    });
    await page.waitForTimeout(250);
    const withRefs = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      return nodes.map(n => ({
        raw: n.getAttribute('data-citation-raw'),
        keys: n.getAttribute('data-citation-keys'),
        text: (n.textContent || '').trim(),
        ce: n.getAttribute('contenteditable'),
      }));
    });
    assertEq(withRefs.map(w => w.raw),
      ['[@alpha2020first]', '[@zeta2024last, p. 12]'],
      'each atom preserves its raw Pandoc syntax');
    assert(withRefs.length === 2 && withRefs.every(w => w.ce === 'false'),
      'both atoms are contenteditable=false');
    if (withRefs.length === 2) {
      assert(withRefs[0].text.includes('Alpha') && withRefs[0].text.includes('2020'),
        `alpha atom shows author-year label (got "${withRefs[0].text}")`);
      assert(withRefs[1].text.includes('Zeta') && withRefs[1].text.includes('2024'),
        `zeta atom shows author-year label (got "${withRefs[1].text}")`);
      assert(!withRefs[0].text.includes('[@'),
        'alpha atom label does not leak raw `[@…]`');
    }

    // -------------------------------------------------------------------------
    // 4) Negative author + group: `[-@zeta2024last, p. 3]` and `[@a; @b]`
    // -------------------------------------------------------------------------
    console.log('\n=== 4. Negative author + multi-key group round-trip verbatim ===');
    await page.evaluate(() => {
      window.__mdAnnotator.loadMarkdownIntoEditor(
        'citation-group.md',
        '[-@zeta2024last, p. 3] and [@alpha2020first; @zeta2024last].',
        null,
        { references: window.__testReferenceManifest }
      );
    });
    await page.waitForTimeout(200);
    const groupInfo = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      return {
        count: nodes.length,
        raws: nodes.map(n => n.getAttribute('data-citation-raw')),
        texts: nodes.map(n => (n.textContent || '').trim()),
        keysList: nodes.map(n => {
          try { return JSON.parse(n.getAttribute('data-citation-keys') || '[]'); }
          catch (e) { return null; }
        }),
      };
    });
    assertEq(groupInfo.raws,
      ['[-@zeta2024last, p. 3]', '[@alpha2020first; @zeta2024last]'],
      'negative author and multi-key atoms preserve raw bytes');
    if (groupInfo.keysList.length === 2) {
      assertEq(groupInfo.keysList[0], ['zeta2024last'],
        'negative-author atom stores its single key');
      assertEq(groupInfo.keysList[1], ['alpha2020first', 'zeta2024last'],
        'multi-key atom stores both keys');
    }

    // -------------------------------------------------------------------------
    // 5) MarkdownIt → HTML → Markdown lossless roundtrip
    // -------------------------------------------------------------------------
    console.log('\n=== 5. MarkdownIt + Turndown round-trip is lossless ===');
    const roundtrip = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const sources = [
        'See [@alpha2020first] for details and also [@zeta2024last, p. 12] later.',
        '[-@zeta2024last, p. 3] and [@alpha2020first; @zeta2024last].',
        'Plain text [@alpha2020first] tail.',
        '[@onlyOne]',
      ];
      const out = [];
      for (const md of sources) {
        M.loadMarkdownIntoEditor('roundtrip.md', md, null, {
          references: window.__testReferenceManifest,
        });
        const html = M.State.editor.getHTML();
        const back = M.htmlToMarkdown(html);
        out.push({ md, html, back });
      }
      return out;
    });
    for (const { md, back } of roundtrip) {
      assert(back.includes(md.split('[')[1].split(']')[0]) || back.includes(md.match(/\[.*?\]/)[0]),
        `round-trip preserves citation bytes (in: "${md.slice(0, 60)}…" → "${back.slice(0, 60)}…")`);
      assert(!/Alpha et al\.|Beta|Zoe/.test(back),
        `round-trip never leaks the author-year display label (got "${back.slice(0, 120)}")`);
    }
    // Specific assertions for the "missing" case — references map only has 2 keys,
    // so the [@onlyOne] atom must still be a valid atom even though its key is unknown.
    const missingCase = roundtrip[roundtrip.length - 1];
    assert(/\[@onlyOne\]/.test(missingCase.back),
      'unknown-key citation still round-trips as `[@onlyOne]`');
    const missingDom = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.mentor-citation')];
      const last = nodes[nodes.length - 1];
      return last ? {
        raw: last.getAttribute('data-citation-raw'),
        text: (last.textContent || '').trim(),
        missing: last.classList.contains('is-missing'),
      } : null;
    });
    assert(missingDom && missingDom.raw === '[@onlyOne]',
      'unknown key atom still keeps raw syntax');
    assert(missingDom && /缺失|missing/i.test(missingDom.text),
      `unknown key atom shows missing marker (got "${missingDom && missingDom.text}")`);

    // -------------------------------------------------------------------------
    // 6) Editor-side: cursor cannot enter the atom (contenteditable=false).
    //    Backspace on the atom removes the whole node.
    // -------------------------------------------------------------------------
    console.log('\n=== 6. Atom behaves as a single inline unit ===');
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor('cursor.md', 'before [@alpha2020first] after',
        null, { references: window.__testReferenceManifest });
    });
    await page.waitForTimeout(150);
    const beforeCursor = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus('end');
      return ed.state.selection.from;
    });
    // Move cursor to just after the atom; then backspace to delete it.
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus('end');
      // Position just after the citation node (atom + trailing space + "after")
      const doc = ed.state.doc;
      let citationPos = -1;
      doc.descendants((node, pos) => {
        if (node.type && node.type.name === 'citation' && citationPos === -1) {
          citationPos = pos + node.nodeSize;
        }
      });
      if (citationPos > 0) ed.commands.setTextSelection(citationPos);
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    const afterDel = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const atoms = document.querySelectorAll('.mentor-citation').length;
      return {
        atoms,
        text: ed.getText(),
      };
    });
    assert(afterDel.atoms === 0,
      `Backspace next to the atom removes it (atoms: ${afterDel.atoms})`);
    assert(afterDel.text.includes('before') && afterDel.text.includes('after'),
      'surrounding text is preserved');

    // -------------------------------------------------------------------------
    // 7) 0 page errors throughout
    // -------------------------------------------------------------------------
    console.log('\n=== 7. No page errors ===');
    assert(pageErrors.length === 0,
      `0 page errors (got: ${pageErrors.join(' | ').slice(0, 200) || 'none'})`);

    await page.screenshot({
      path: path.join(TMP_DIR, 'citation-node-final.png'),
      fullPage: true,
    });
    console.log(`\nScreenshot saved to ${path.join(TMP_DIR, 'citation-node-final.png')}`);

    console.log(`\n=== SUMMARY: ${pass} pass / ${fail} fail ===`);
    process.exitCode = fail > 0 ? 1 : 0;
  } catch (err) {
    console.error('\nTEST CRASHED:', err.stack || err);
    process.exit(2);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();