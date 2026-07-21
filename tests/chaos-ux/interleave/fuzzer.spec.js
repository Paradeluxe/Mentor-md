/**
 * Seeded interleave fuzzer — random legal-ish action sequences.
 * Replay: node tests/chaos-ux/interleave/fuzzer.spec.js --seed=42 --steps=100
 */
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
  checkInvariants,
} = require('../harness');
const { DOCS, BODY_CORPUS } = require('../content-catalog');

function parseArg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!a) return def;
  const v = a.split('=')[1];
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const seed = parseArg('seed', 42);
  const steps = parseArg('steps', 80);
  const { browser, context, page, coverage } = await launch();
  console.log(`=== chaos-ux fuzzer seed=${seed} steps=${steps} ===`);
  await boot(page);
  const { t, done } = createRunner(page, 'fuzzer');
  const rnd = mulberry32(Number(seed) || 42);
  const log = [];

  const ACTIONS = [
    {
      name: 'loadSimple',
      run: async () => {
        await loadDoc(page, `fuzz-${Math.floor(rnd() * 1e6)}.md`, DOCS.simple);
      },
    },
    {
      name: 'loadAmbiguous',
      run: async () => {
        await loadDoc(page, `fuzz-amb-${Math.floor(rnd() * 1e6)}.md`, DOCS.ambiguous);
      },
    },
    {
      name: 'annotateAlpha',
      run: async () => {
        const r = await annotateText(page, 'UNIQUE_ALPHA', {
          ai: rnd() > 0.5,
          body: rnd() > 0.5 ? BODY_CORPUS.aiInstr : 'fuzz-' + Math.floor(rnd() * 1000),
        });
        if (!r.ok && r.err && !String(r.err).includes('not found')) {
          // needle missing ok after edits
        }
      },
    },
    {
      name: 'annotateBeta',
      run: async () => {
        await annotateText(page, 'UNIQUE_BETA', { body: 'b' }).catch(() => {});
      },
    },
    {
      name: 'toggleResolve',
      run: async () => {
        await page.evaluate(() => {
          const M = window.__mdAnnotator;
          const a = M.State.annotations[0];
          if (a && M._testToggleResolved) M._testToggleResolved(a.threadId);
        });
      },
    },
    {
      name: 'filterCycle',
      run: async () => {
        const tabs = ['all', 'open', 'resolved'];
        const f = tabs[Math.floor(rnd() * tabs.length)];
        await page.evaluate((f) => {
          const modal = document.querySelector('#author-modal');
          if (modal) {
            modal.classList.add('hidden');
            modal.style.pointerEvents = 'none';
          }
          const btn = document.querySelector(`[data-filter-tab="${f}"]`);
          if (btn) btn.click();
        }, f);
      },
    },
    {
      name: 'newTab',
      run: async () => {
        await page.evaluate(() => window.__mdAnnotator.openNewTabBlank());
      },
    },
    {
      name: 'switchRandomTab',
      run: async () => {
        await page.evaluate((r) => {
          const M = window.__mdAnnotator;
          const tabs = M.State.tabs.filter(Boolean);
          if (!tabs.length) return;
          const t = tabs[Math.floor(r * tabs.length)];
          M.switchToTab(t.id);
        }, rnd());
      },
    },
    {
      name: 'typeNoise',
      run: async () => {
        await page.evaluate((s) => {
          const M = window.__mdAnnotator;
          try {
            M.State.editor.commands.focus();
            M.State.editor.commands.insertContent(s);
          } catch {}
        }, 'N' + Math.floor(rnd() * 99));
      },
    },
    {
      name: 'toggleSource',
      run: async () => {
        await page.evaluate(() => {
          const b = document.querySelector('#btn-toggle-render');
          if (b) b.click();
        });
      },
    },
    {
      name: 'helpToggle',
      run: async () => {
        await page.evaluate(() => {
          const b = document.querySelector('#help-btn');
          if (b) b.click();
        });
        if (rnd() > 0.5) await page.keyboard.press('Escape');
      },
    },
    {
      name: 'settingsToggle',
      run: async () => {
        await page.evaluate(() => {
          const b = document.querySelector('#settings-btn');
          if (b) b.click();
        });
        if (rnd() > 0.4) await page.keyboard.press('Escape');
      },
    },
    {
      name: 'clickSave',
      run: async () => {
        await page.evaluate(() => {
          const b = document.querySelector('#btn-save');
          if (b) b.click();
        });
      },
    },
    {
      name: 'deleteRandomThread',
      run: async () => {
        await page.evaluate((r) => {
          const M = window.__mdAnnotator;
          const anns = M.State.annotations;
          if (!anns.length) return;
          const a = anns[Math.floor(r * anns.length)];
          if (a && M._testDeleteThread) M._testDeleteThread(a.threadId);
        }, rnd());
      },
    },
    {
      name: 'formatBold',
      run: async () => {
        await page.evaluate(() => {
          const b = document.querySelector('[data-cmd="bold"]');
          if (b) b.click();
        });
      },
    },
  ];

  await t(`run ${steps} steps seed=${seed}`, async () => {
    await loadDoc(page, 'fuzz-seed.md', DOCS.simple);
    for (let i = 0; i < steps; i++) {
      const act = ACTIONS[Math.floor(rnd() * ACTIONS.length)];
      log.push({ i, name: act.name });
      try {
        await act.run();
      } catch (e) {
        // individual action soft-fail OK if no pageerror
        log[log.length - 1].err = e.message;
      }
      if (i % 10 === 9) {
        await checkInvariants(page);
      }
      if (page._chaosPageErrors && page._chaosPageErrors.length) {
        throw new Error(
          `pageerror at step ${i} after ${act.name}: ${page._chaosPageErrors.join(' | ')}\nlog=${JSON.stringify(log.slice(-15))}`
        );
      }
      if (coverage) coverage.logAction(act.name, { i });
    }
    await checkInvariants(page);
    console.log('  last actions:', log.slice(-8).map((x) => x.name).join(' → '));
  });

  const result = done();
  if (result.fail) {
    console.log('  REPLAY: node tests/chaos-ux/interleave/fuzzer.spec.js --seed=' + seed + ' --steps=' + steps);
  }
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
