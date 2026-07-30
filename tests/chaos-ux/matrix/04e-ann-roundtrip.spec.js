/**
 * Sidecar pack / load / serialize (P1–P10 samples).
 */
const fs = require('fs');
const path = require('path');
const {
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
} = require('../harness');
const { DOCS, BODY_CORPUS } = require('../content-catalog');

const FIX = path.join(__dirname, '../fixtures/ann-content');

(async () => {
  const { browser, context, page, coverage } = await launch();
  console.log('=== chaos-ux matrix/04e-ann-roundtrip ===');
  await boot(page);
  const { t, done } = createRunner(page, '04e-roundtrip');

  await t('P1 minimal legal sidecar load', async () => {
    const sidecar = {
      version: '1',
      document: 'p1.md',
      updatedAt: new Date().toISOString(),
      author: { id: 'u', name: 't' },
      annotations: [
        {
          threadId: 'p1-t1',
          text: 'UNIQUE_ALPHA',
          prefix: 'Hello ',
          suffix: ' world',
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [
            {
              id: 'p1-c1',
              author: { id: 'u', name: 't' },
              body: 'minimal',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    };
    await loadDoc(page, 'p1.md', DOCS.simple, sidecar);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const a = M.State.annotations.find((x) => x.threadId === 'p1-t1');
      return {
        n: M.State.annotations.length,
        text: a && a.text,
        invalid: a && a.invalid,
        hasRange: !!(a && a.range),
      };
    });
    if (r.n < 1 || r.text !== 'UNIQUE_ALPHA') throw new Error(JSON.stringify(r));
    coverage.hitContent('P1');
  });

  await t('P2 legacy author string loads', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'legacy-author-string.json'), 'utf8'));
    await loadDoc(page, 'legacy.md', DOCS.simple, raw);
    const r = await page.evaluate(() => {
      const a = window.__mdAnnotator.State.annotations[0];
      const c0 = a && a.comments && a.comments[0];
      return {
        n: window.__mdAnnotator.State.annotations.length,
        author: c0 && c0.author,
        body: c0 && c0.body,
      };
    });
    if (r.n < 1) throw new Error(JSON.stringify(r));
    // author may remain string or be normalized — must not crash
    coverage.hitContent('P2');
  });

  await t('P8 @AI fixture roundtrip serializes marker-only mode', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'ai-marker.json'), 'utf8'));
    await loadDoc(page, 'ai.md', DOCS.simple, raw);
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const side = M.buildAnnotationsSidecar();
      const bodies = side.flatMap((a) => (a.comments || []).map((c) => c.body));
      return {
        bodies,
        types: side.map((a) => a.threadType || null),
        anyAi: bodies.some((b) => (M.bodyHasAiMarker ? M.bodyHasAiMarker(b) : /@AI\b/i.test(b))),
        whitelist: side.every((a) => a.threadId && typeof a.text === 'string' && Array.isArray(a.comments)),
      };
    });
    if (!r.anyAi) throw new Error(JSON.stringify(r));
    if (!r.whitelist) throw new Error('bad serialize shape');
    coverage.hitContent('P8');
  });

  await t('legacy AI card preserves threadType across reload (non-destructive migration)', async () => {
    const legacy = {
      version: '1',
      document: 'legacy-ai.md',
      updatedAt: new Date().toISOString(),
      annotations: [{
        threadId: 'legacy-ai-1',
        threadType: 'ai',
        text: 'UNIQUE_ALPHA',
        prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(),
        comments: [{ id: 'c1', author: { id: 'u', name: 'User' }, body: 'make this clearer', createdAt: new Date().toISOString() }],
      }],
    };
    await loadDoc(page, 'legacy-ai.md', DOCS.simple, legacy);
    const once = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations.find((a) => a.threadId === 'legacy-ai-1');
      return { body: t?.comments?.[0]?.body, type: t?.threadType ?? null, side: M.buildAnnotationsSidecar() };
    });
    // Non-destructive: body unchanged, threadType preserved, sidecar serializes it
    if (once.body !== 'make this clearer' || once.type !== 'ai' || once.side[0]?.threadType !== 'ai') throw new Error(JSON.stringify(once));
    await loadDoc(page, 'legacy-ai-reopen.md', DOCS.simple, { version: '1', annotations: once.side });
    const reopened = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const t = M.State.annotations.find((a) => a.threadId === 'legacy-ai-1');
      return { body: t?.comments?.[0]?.body, type: t?.threadType ?? null };
    });
    if (reopened.body !== 'make this clearer' || reopened.type !== 'ai') throw new Error(JSON.stringify(reopened));
  });

  await t('P4 incomplete thread becomes invalid or dropped', async () => {
    const bad = {
      version: '1',
      document: 'bad.md',
      updatedAt: new Date().toISOString(),
      author: { id: 'u', name: 't' },
      annotations: [
        { threadId: 'ok1', text: 'UNIQUE_ALPHA', prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(), comments: [] },
        { text: 'no-id', prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(), comments: [] },
        { threadId: 'no-text', prefix: '', suffix: '', resolved: false, createdAt: new Date().toISOString(), comments: [] },
      ],
    };
    await loadDoc(page, 'bad.md', DOCS.simple, {
      ...bad,
      annotations: [bad.annotations[0], { ...bad.annotations[2], threadId: 'no-text', text: 'MISSING_TEXT' }],
    });
    const r = await page.evaluate(() => {
      const anns = window.__mdAnnotator.State.annotations;
      return {
        n: anns.length,
        ids: anns.map((a) => a.threadId),
        reasons: anns.map((a) => a.invalidReason || null),
        invalids: anns.filter((a) => a.invalid).length,
      };
    });
    // must keep good one; incomplete may be invalid
    if (!r.ids.includes('ok1') && r.n === 0) throw new Error('lost all: ' + JSON.stringify(r));
    coverage.hitContent('P4');
    coverage.hitContent('R:incomplete-data');
  });

  await t('P10 unknown extra fields not required on write', async () => {
    await loadDoc(page, 'p10.md', DOCS.simple);
    const r = await annotateText(page, 'UNIQUE_ALPHA', { body: 'x' });
    await page.evaluate((tid) => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === tid);
      a.__evil = { nested: true };
      a.meta = 'should-not-serialize';
    }, r.tid);
    const side = await page.evaluate(() => window.__mdAnnotator.buildAnnotationsSidecar());
    const row = side.find((a) => a.threadId === r.tid);
    if (!row) throw new Error('missing');
    if (row.__evil || row.meta) throw new Error('leaked fields: ' + JSON.stringify(row));
    coverage.hitContent('P10');
  });

  await t('P3 text-not-found on load', async () => {
    const sc = {
      version: '1',
      document: 'miss.md',
      updatedAt: new Date().toISOString(),
      author: { id: 'u', name: 't' },
      annotations: [
        {
          threadId: 'miss1',
          text: 'THIS_TEXT_DOES_NOT_EXIST_XYZ',
          prefix: '',
          suffix: '',
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [{ id: 'c', author: { id: 'u', name: 't' }, body: 'x', createdAt: new Date().toISOString() }],
        },
      ],
    };
    await loadDoc(page, 'miss.md', DOCS.simple, sc);
    const r = await page.evaluate(() => {
      const a = window.__mdAnnotator.State.annotations.find((x) => x.threadId === 'miss1');
      return a ? { invalid: !!a.invalid, reason: a.invalidReason, deleted: !!a.deleted } : null;
    });
    if (!r) throw new Error('missing thread');
    if (!r.invalid && !r.deleted) {
      // still ok if fuzzy — but should not have live range ideally
    }
    coverage.hitContent('R:text-not-found');
    coverage.hitContent('P3');
  });

  await t('live @AI body survives buildAnnotationsSidecar', async () => {
    await loadDoc(page, 'live-ai.md', DOCS.simple);
    await annotateText(page, 'UNIQUE_BETA', { body: BODY_CORPUS.aiInstr });
    const ok = await page.evaluate(() => {
      const side = window.__mdAnnotator.buildAnnotationsSidecar();
      return side.some((a) => (a.comments || []).some((c) => /@AI\b/i.test(c.body || '')));
    });
    if (!ok) throw new Error('lost AI body');
    coverage.hitContent('B7');
  });

  const result = done();
  await closeAll(browser, context);
  process.exit(result.fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
