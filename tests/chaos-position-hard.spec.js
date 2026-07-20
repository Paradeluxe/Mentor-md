// chaos-position-hard: deeper misalignment traps
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const OUT = path.join(os.tmpdir(), 'mentor-chaos-pos');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  let pass = 0, fail = 0;
  const results = [];
  const t = async (n, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + n);
      pass++;
      results.push({ n, ok: true });
    } catch (e) {
      console.log('  ✗ ' + n + ': ' + e.message);
      fail++;
      results.push({ n, ok: false, err: e.message });
    }
  };

  await page.goto('http://127.0.0.1:8787/index.html?cb=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelector('#author-modal')?.classList.add('hidden');
    try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
  });

  const setup = async (html) => page.evaluate((html) => {
    const M = window.__mdAnnotator;
    M.openNewTabBlank();
    M.State.editor.commands.setContent(html);
    M.State.annotations = [];
  }, html);

  const probe = async (s) => page.evaluate((s) => {
    const ed = window.__mdAnnotator.State.editor;
    const h = [];
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText || !n.text) return;
      let i = 0;
      while ((i = n.text.indexOf(s, i)) !== -1) {
        h.push({ from: pos + i, to: pos + i + s.length });
        i++;
      }
    });
    return h;
  }, s);

  const mark = async (from, to) => page.evaluate(({ from, to }) => {
    const M = window.__mdAnnotator;
    const text = M.State.editor.state.doc.textBetween(from, to, ' ');
    const thr = M._testCreateAnnotation(from, to, text);
    return thr && thr.threadId;
  }, { from, to });

  const snap = async () => page.evaluate(() => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const mt = ed.schema.marks.annotation;
    const mm = {};
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText) return;
      for (const m of n.marks) {
        if (m.type === mt && m.attrs.threadId) {
          const tid = m.attrs.threadId;
          const end = pos + n.nodeSize;
          if (!mm[tid]) mm[tid] = { from: pos, to: end, text: n.text };
          else {
            if (pos < mm[tid].from) mm[tid].from = pos;
            if (end > mm[tid].to) mm[tid].to = end;
            mm[tid].text += n.text;
          }
        }
      }
    });
    return M.State.annotations.map((a) => ({
      tid: a.threadId,
      text: a.text,
      range: a.range,
      fuzzy: !!a.fuzzy,
      invalid: !!a.invalid,
      deleted: !!a.deleted,
      reason: a.invalidReason,
      mark: mm[a.threadId] || null,
      corr: (() => {
        const m = mm[a.threadId];
        if (!m) return a.deleted || a.invalid;
        return a.range && a.range.from === m.from && a.range.to === m.to && a.text === m.text && !a.invalid;
      })(),
    }));
  });

  console.log('=== hard position wave ===');

  await t('H1 mark-stripped text still present → flagged not silent-ok', async () => {
    await setup('<p>keep unique-strip-mark here</p>');
    const h = await probe('unique-strip-mark');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate((tid) => {
      const ed = window.__mdAnnotator.State.editor;
      const mt = ed.schema.marks.annotation;
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === tid) {
            from = pos; to = pos + n.nodeSize;
          }
        }
      });
      ed.view.dispatch(ed.state.tr.removeMark(from, to, mt));
    }, tid);
    await page.waitForTimeout(40);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a) throw new Error('gone');
    // v1.43.43: mark 被剥后若正文仍在 → auto re-mark（正确）；否则必须 flag
    if (a.mark) {
      if (a.mark.text.indexOf('unique-strip-mark') === -1) throw new Error('wrong mark ' + JSON.stringify(a));
      if (a.range.from !== a.mark.from || a.range.to !== a.mark.to) throw new Error('range desync ' + JSON.stringify(a));
    } else if (!a.fuzzy && !a.invalid && !a.deleted) {
      throw new Error('silent ' + JSON.stringify(a));
    }
  });

  await t('H2 type-over anchor mid chars keeps range==mark', async () => {
    await setup('<p>xx unique-typeover-tok yy</p>');
    const h = await probe('unique-typeover-tok');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate((tid) => {
      const ed = window.__mdAnnotator.State.editor;
      const mt = ed.schema.marks.annotation;
      let from = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === mt && m.attrs.threadId === tid) from = pos;
        }
      });
      const mid = from + 7;
      ed.view.dispatch(ed.state.tr.insertText('XXX', mid, mid + 3));
    }, tid);
    await page.waitForTimeout(40);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a?.mark) throw new Error('mark lost ' + JSON.stringify(a));
    if (a.text !== a.mark.text) throw new Error('text desync ' + JSON.stringify(a));
    if (a.range.from !== a.mark.from || a.range.to !== a.mark.to) {
      throw new Error('range desync ' + JSON.stringify(a));
    }
  });

  await t('H3 five-identical load keeps 2nd+4th not 1st+2nd', async () => {
    await setup('<p>t tok-id end</p><p>t tok-id end</p><p>t tok-id end</p><p>t tok-id end</p><p>t tok-id end</p>');
    const h = await probe('tok-id');
    if (h.length < 5) throw new Error('hits ' + h.length);
    await mark(h[1].from, h[1].to);
    await mark(h[3].from, h[3].to);
    const before = await page.evaluate(() =>
      window.__mdAnnotator.State.annotations.map((a) => ({
        tid: a.threadId, from: a.range.from, p: a.prefix, s: a.suffix,
      }))
    );
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const anns = M.State.annotations.map((a) => ({
        threadId: a.threadId,
        text: a.text,
        prefix: a.prefix || '',
        suffix: a.suffix || '',
        resolved: false,
        createdAt: a.createdAt,
        comments: a.comments || [],
      }));
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('five.mentor', md, { version: '1', annotations: anns });
    });
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const mt = ed.schema.marks.annotation;
      const occ = [];
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        let i = 0;
        while ((i = n.text.indexOf('tok-id', i)) !== -1) {
          const from = pos + i;
          const to = from + 6;
          const tids = [];
          ed.state.doc.nodesBetween(from, to, (nn) => {
            if (!nn.isText) return;
            for (const m of nn.marks) if (m.type === mt) tids.push(m.attrs.threadId);
          });
          occ.push({ from, tids: [...new Set(tids)] });
          i++;
        }
      });
      return {
        occ,
        anns: M.State.annotations.map((a) => ({
          tid: a.threadId, from: a.range && a.range.from, invalid: a.invalid, fuzzy: a.fuzzy,
        })),
      };
    });
    const markedIdx = after.occ.map((o, i) => (o.tids.length ? i : -1)).filter((i) => i >= 0);
    if (markedIdx.length !== 2) {
      throw new Error('marked count ' + JSON.stringify({ before, after, markedIdx }));
    }
    if (!(markedIdx.includes(1) && markedIdx.includes(3))) {
      throw new Error('wrong occ ' + JSON.stringify({ before, after, markedIdx }));
    }
  });

  await t('H4 delete whole p with ann then undo restores corr', async () => {
    await setup('<p>keep</p><p>mid unique-delp-tok mid</p><p>tail</p>');
    const h = await probe('unique-delp-tok');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      // drop setContent/openTab history so next undo is the delete
      if (typeof M.clearPmHistory === 'function') M.clearPmHistory();
      else {
        const ed = M.State.editor;
        const EditorState = ed.state.constructor;
        ed.view.updateState(EditorState.create({
          schema: ed.schema, doc: ed.state.doc, selection: ed.state.selection, plugins: ed.state.plugins,
        }));
      }
      const ed = M.State.editor;
      let pFrom = -1, pTo = -1, i = 0;
      ed.state.doc.forEach((node, offset) => {
        if (node.type.name === 'paragraph') {
          i++;
          if (i === 2) { pFrom = offset; pTo = offset + node.nodeSize; }
        }
      });
      ed.view.dispatch(ed.state.tr.delete(pFrom, pTo));
    });
    await page.waitForTimeout(40);
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const ok = ed.commands.undo();
      if (!ok) throw new Error('pm undo failed');
      try { window.__mdAnnotator._validateMarksAfterEdit(ed); } catch (e) {}
    });
    await page.waitForTimeout(60);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a) throw new Error('ann gone after undo');
    if (!a.mark) throw new Error('no mark after undo ' + JSON.stringify(a));
    if (a.text !== a.mark.text) throw new Error('text desync ' + JSON.stringify(a));
    if (!a.range || a.range.from !== a.mark.from) throw new Error('range ' + JSON.stringify(a));
  });

  await t('H5 setContent wipe → anns invalid (not false corr)', async () => {
    await setup('<p>old unique-wipe-tok old</p>');
    const h = await probe('unique-wipe-tok');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.State.editor.commands.setContent('<p>new unique-wipe-tok new</p>', true);
      try { M._validateMarksAfterEdit(M.State.editor); } catch (e) {}
    });
    await page.waitForTimeout(50);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a) throw new Error('gone');
    // v1.43.43: unique text still in new doc → auto re-mark (corr) OR at least not silent-valid-without-mark
    if (a.mark) {
      if (a.mark.text !== 'unique-wipe-tok' && a.mark.text.indexOf('unique-wipe-tok') === -1)
        throw new Error('mark on wrong text ' + JSON.stringify(a));
      if (a.range && (a.range.from !== a.mark.from || a.range.to !== a.mark.to))
        throw new Error('range desync ' + JSON.stringify(a));
    } else {
      if (!a.invalid && !a.fuzzy && !a.deleted) throw new Error('silent no-flag ' + JSON.stringify(a));
    }
  });

  await t('H6 table cell ann + insert before keeps corr', async () => {
    await setup('<table><tr><td><p>cell unique-tbl-tok x</p></td><td><p>other</p></td></tr></table><p>after</p>');
    const h = await probe('unique-tbl-tok');
    if (!h.length) throw new Error('no hit in table');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('<p>ABOVE_TABLE</p>');
    });
    await page.waitForTimeout(40);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a?.corr) throw new Error(JSON.stringify(a));
  });

  await t('H7 200 micro-inserts before mark still corr', async () => {
    await setup('<p>S unique-micro-tok E</p>');
    const h = await probe('unique-micro-tok');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      for (let i = 0; i < 200; i++) {
        ed.view.dispatch(ed.state.tr.insertText('.', 1));
      }
    });
    await page.waitForTimeout(80);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a?.corr) throw new Error(JSON.stringify(a));
    if (a.mark.text !== 'unique-micro-tok') throw new Error(a.mark.text);
  });

  await t('H8 stale prefix + unique text still finds via P0', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>hello unique-stale-pfx world</p>');
      const doc = M.State.editor.state.doc;
      return M.findAnnotationRange(doc, {
        text: 'unique-stale-pfx',
        prefix: 'WRONG_PREFIX_ZZZ ',
        suffix: ' world',
      });
    });
    if (!r) throw new Error('null — should P0 unique text still hit');
  });

  await t('H9 join paragraphs with mark — range tracks mark', async () => {
    await setup('<p>left unique-join-A</p><p>unique-join-B right</p>');
    const h = await probe('unique-join-A');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      const positions = [];
      ed.state.doc.forEach((node, offset) => {
        if (node.type.name === 'paragraph') positions.push({ offset, size: node.nodeSize });
      });
      if (positions.length >= 2) {
        ed.commands.setTextSelection(positions[1].offset + 1);
        ed.commands.joinBackward();
      }
    });
    await page.waitForTimeout(40);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a) throw new Error('gone');
    if (a.mark) {
      if (a.range.from !== a.mark.from || a.range.to !== a.mark.to) {
        throw new Error('range desync ' + JSON.stringify(a));
      }
      if (a.text !== a.mark.text) throw new Error('text ' + JSON.stringify(a));
    } else if (!a.invalid && !a.fuzzy && !a.deleted) {
      throw new Error('silent ' + JSON.stringify(a));
    }
  });

  await t('H10 scrollToThread after shift — ann still corr', async () => {
    await setup('<p>pad</p><p>pad</p><p>here unique-scroll-tok end</p>');
    const h = await probe('unique-scroll-tok');
    const tid = await mark(h[0].from, h[0].to);
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('<p>' + 'LINE '.repeat(40) + '</p>');
    });
    await page.waitForTimeout(40);
    await page.evaluate((tid) => {
      window.__mdAnnotator.scrollToThread(tid);
    }, tid);
    const s = await snap();
    const a = s.find((x) => x.tid === tid);
    if (!a?.corr) throw new Error(JSON.stringify(a));
    if (a.mark.text !== 'unique-scroll-tok') throw new Error(a.mark.text);
  });

  console.log('\nHARD TOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  fs.writeFileSync(path.join(OUT, 'hard-results.json'), JSON.stringify({ pass, fail, results }, null, 2));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
