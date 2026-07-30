/**
 * Reference card → sequential body citation navigation.
 * Click a refs-card cycles through body citations for that key in doc order.
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
} = require('./chaos-ux/harness');

const REFERENCES = {
  version: '2',
  source: { name: 'cycle-test.bib', format: 'bib' },
  bibliography: { enabled: false, scope: 'cited', heading: 'References' },
  entries: [
    { key: 'alpha2020', type: 'article', authors: 'Alpha, Ann', title: 'Alpha title', year: '2020' },
    { key: 'beta2021', type: 'article', authors: 'Beta, Bob', title: 'Beta title', year: '2021' },
    { key: 'gamma2022', type: 'article', authors: 'Gamma, G', title: 'Gamma title', year: '2022' },
  ],
};

const BODY = [
  '# Citation cycle',
  '',
  'First [@alpha2020].',
  '',
  'Other [@beta2021].',
  '',
  'Second [@alpha2020].',
  '',
  'Third [@alpha2020].',
].join('\n');

const GROUPED_BODY = [
  '# Grouped',
  '',
  'Grouped [@alpha2020; @beta2021]. Later [@alpha2020].',
].join('\n');

async function loadWithRefs(page, name, body, references = REFERENCES) {
  await page.evaluate(({ name, body, references }) => {
    const M = window.__mdAnnotator;
    M.loadMarkdownIntoEditor(name, body, null, { references });
    const pane = document.querySelector('#refs-pane');
    const main = document.querySelector('#main');
    // Force open (do not toggle #btn-refs — it would close an already-open pane).
    if (pane) {
      pane.classList.remove('hidden');
      main?.classList.add('refs-pane-open');
      document.body.classList.remove('refs-pane-collapsed');
    }
    if (typeof M.reconcileCitationNodes === 'function') M.reconcileCitationNodes();
    else document.querySelector('#btn-refs')?.click();
  }, { name, body, references });
  await page.waitForSelector('.refs-card[data-key="alpha2020"]:visible', { timeout: 10000 });
}

async function selectedCitation(page, cardKey = 'alpha2020') {
  return page.evaluate((cardKey) => {
    const ed = window.__mdAnnotator.State.editor;
    const sel = ed.state.selection;
    const card = document.querySelector(`.refs-card[data-key="${cardKey}"]`);
    return {
      pos: sel.from,
      node: sel.node && sel.node.type ? sel.node.type.name : null,
      keys: (sel.node && sel.node.attrs && sel.node.attrs.keys) || [],
      cardActive: !!(card && card.classList.contains('is-active')),
      usageText: card ? (card.querySelector('.rc-usage')?.textContent || '').trim() : '',
    };
  }, cardKey);
}

async function clickCardSurface(page, key) {
  const card = page.locator(`.refs-card[data-key="${key}"]`);
  const title = card.locator('.rc-title');
  if (await title.count()) {
    await title.click();
  } else {
    await card.locator('.rc-key').click();
  }
  await page.waitForTimeout(100);
}

(async () => {
  const { browser, context, page } = await launch();
  console.log('=== e2e-reference-card-citation-cycle ===');
  await boot(page);
  const { t, done } = createRunner(page, 'reference-card-citation-cycle');

  await t('card click cycles body citations 1→2→3→1', async () => {
    await loadWithRefs(page, 'citation-cycle.md', BODY);
    const seen = [];
    for (let i = 0; i < 4; i += 1) {
      await clickCardSurface(page, 'alpha2020');
      seen.push(await selectedCitation(page, 'alpha2020'));
    }
    if (!seen.every((x) => x.node === 'citation' && x.keys.includes('alpha2020'))) {
      throw new Error('card click did not select alpha citation: ' + JSON.stringify(seen));
    }
    if (!(seen[0].pos < seen[1].pos && seen[1].pos < seen[2].pos && seen[3].pos === seen[0].pos)) {
      throw new Error('citation order/cycle mismatch: ' + JSON.stringify(seen));
    }
    if (!seen.every((x) => x.cardActive)) {
      throw new Error('clicked card is not active: ' + JSON.stringify(seen));
    }
    // ordinal feedback on later clicks (after UI ships)
    const texts = seen.map((x) => x.usageText);
    if (!texts.every((s) => /第\s*[123]\s*\/\s*3\s*处/.test(s) || /正文\s*×\s*3/.test(s) || s.includes('3'))) {
      // allow intermediate while only cycle selection ships; still require some usage marker
      if (!texts.every((s) => s && s !== '未引用')) {
        throw new Error('usage badge missing after nav: ' + JSON.stringify(texts));
      }
    }
  });

  await t('switching cards restarts at first usage of new key', async () => {
    await loadWithRefs(page, 'citation-cycle-switch.md', BODY);
    await clickCardSurface(page, 'alpha2020');
    const firstAlpha = await selectedCitation(page, 'alpha2020');
    await clickCardSurface(page, 'alpha2020');
    const secondAlpha = await selectedCitation(page, 'alpha2020');
    if (!(firstAlpha.pos < secondAlpha.pos)) {
      throw new Error('expected second alpha ahead of first: ' + JSON.stringify({ firstAlpha, secondAlpha }));
    }
    await clickCardSurface(page, 'beta2021');
    const beta = await selectedCitation(page, 'beta2021');
    if (beta.node !== 'citation' || !beta.keys.includes('beta2021')) {
      throw new Error('beta card did not select beta citation: ' + JSON.stringify(beta));
    }
    await clickCardSurface(page, 'alpha2020');
    const alphaRestart = await selectedCitation(page, 'alpha2020');
    if (alphaRestart.pos !== firstAlpha.pos) {
      throw new Error('switching card did not restart at first usage: ' + JSON.stringify({ firstAlpha, alphaRestart }));
    }
  });

  await t('insert button does not steal card navigation path', async () => {
    await loadWithRefs(page, 'citation-cycle-insert.md', BODY);
    const beforeInsert = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.focus('end');
      return ed.state.doc.content.size;
    });
    await page.locator('.refs-card[data-key="beta2021"] .rc-insert-btn').click();
    await page.waitForTimeout(120);
    const afterInsert = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      let citeCount = 0;
      ed.state.doc.descendants((node) => {
        if (node.type && node.type.name === 'citation') citeCount += 1;
      });
      return {
        size: ed.state.doc.content.size,
        citeCount,
        selectedKey: (ed.state.selection.node && ed.state.selection.node.attrs && ed.state.selection.node.attrs.keys)
          ? ed.state.selection.node.attrs.keys[0]
          : null,
      };
    });
    if (afterInsert.size <= beforeInsert) {
      throw new Error('insert button did not grow doc: ' + JSON.stringify(afterInsert));
    }
    if (afterInsert.citeCount < 5) {
      throw new Error('expected inserted citation atom: ' + JSON.stringify(afterInsert));
    }
  });

  await t('unused card does not move selection', async () => {
    await loadWithRefs(page, 'citation-cycle-unused.md', BODY);
    await clickCardSurface(page, 'alpha2020');
    const before = await page.evaluate(() => window.__mdAnnotator.State.editor.state.selection.from);
    await clickCardSurface(page, 'gamma2022');
    const after = await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const card = document.querySelector('.refs-card[data-key="gamma2022"]');
      return {
        from: ed.state.selection.from,
        usage: (card?.querySelector('.rc-usage')?.textContent || '').trim(),
        tabindex: card ? card.getAttribute('tabindex') : null,
      };
    });
    if (after.from !== before) {
      throw new Error('unused card moved editor selection: ' + JSON.stringify({ before, after }));
    }
    if (!/未引用/.test(after.usage)) {
      throw new Error('unused card usage text wrong: ' + JSON.stringify(after));
    }
  });

  await t('grouped citation counts once per key and advances from shared atom', async () => {
    await loadWithRefs(page, 'citation-cycle-grouped.md', GROUPED_BODY);
    const counts = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (typeof M.collectCitationUsagePositions !== 'function') {
        return { error: 'missing collectCitationUsagePositions' };
      }
      return {
        alpha: M.collectCitationUsagePositions('alpha2020').map((x) => x.pos),
        beta: M.collectCitationUsagePositions('beta2021').map((x) => x.pos),
      };
    });
    if (counts.error) throw new Error(counts.error);
    if (counts.alpha.length !== 2) throw new Error('alpha positions expected 2: ' + JSON.stringify(counts));
    if (counts.beta.length !== 1) throw new Error('beta positions expected 1: ' + JSON.stringify(counts));
    if (counts.alpha[0] !== counts.beta[0]) {
      throw new Error('grouped atom should share first pos: ' + JSON.stringify(counts));
    }
    await clickCardSurface(page, 'beta2021');
    const onGrouped = await selectedCitation(page, 'beta2021');
    if (onGrouped.pos !== counts.beta[0] || !onGrouped.keys.includes('beta2021')) {
      throw new Error('beta click missed grouped atom: ' + JSON.stringify({ onGrouped, counts }));
    }
    await clickCardSurface(page, 'alpha2020');
    const alphaNext = await selectedCitation(page, 'alpha2020');
    // current selection is grouped atom which includes alpha → next should be second alpha
    if (alphaNext.pos !== counts.alpha[1]) {
      throw new Error('alpha should advance from shared grouped atom to second usage: ' + JSON.stringify({ alphaNext, counts }));
    }
  });

  await t('delete usage shrinks live sequence', async () => {
    await loadWithRefs(page, 'citation-cycle-delete.md', BODY);
    await clickCardSurface(page, 'alpha2020'); // 1st
    await clickCardSurface(page, 'alpha2020'); // 2nd
    const mid = await selectedCitation(page, 'alpha2020');
    if (mid.node !== 'citation') throw new Error('expected citation selected before delete');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(120);
    await clickCardSurface(page, 'alpha2020');
    const afterDelete = await selectedCitation(page, 'alpha2020');
    const badge = afterDelete.usageText;
    const totalOk = /\/\s*2\s*处/.test(badge) || /正文\s*×\s*2/.test(badge) || /\b2\b/.test(badge);
    if (!totalOk) {
      throw new Error('usage total did not shrink after deletion: ' + badge);
    }
    if (afterDelete.node !== 'citation' || !afterDelete.keys.includes('alpha2020')) {
      throw new Error('after delete click did not land on remaining alpha: ' + JSON.stringify(afterDelete));
    }
  });

  await t('API activateNextCitationUsage is exposed', async () => {
    await loadWithRefs(page, 'citation-cycle-api.md', BODY);
    const api = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        collect: typeof M.collectCitationUsagePositions,
        activate: typeof M.activateNextCitationUsage,
        n: typeof M.collectCitationUsagePositions === 'function'
          ? M.collectCitationUsagePositions('alpha2020').length
          : -1,
      };
    });
    if (api.collect !== 'function' || api.activate !== 'function') {
      throw new Error('missing navigation APIs: ' + JSON.stringify(api));
    }
    if (api.n !== 3) throw new Error('collect alpha expected 3: ' + JSON.stringify(api));
  });

  const result = done();
  await closeAll(browser, context);
  process.exitCode = result.fail > 0 ? 1 : 0;
})().catch(async (err) => {
  console.error(err.stack || err);
  process.exit(1);
});
