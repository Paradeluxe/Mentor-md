// chaos-position-extreme: 极端编辑后批注位置是否仍对应正文
// fixtures only — never touches real dFC .mentor
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const OUT = path.join(os.tmpdir(), 'mentor-chaos-pos');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push(String(e.message || e)));

  let pass = 0, fail = 0;
  const results = [];
  const t = async (name, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + name);
      pass++;
      results.push({ name, ok: true });
    } catch (e) {
      console.log('  ✗ ' + name + ': ' + e.message);
      fail++;
      results.push({ name, ok: false, err: e.message });
    }
  };

  const gotoFresh = async () => {
    await page.goto('http://127.0.0.1:8787/index.html?chaos=pos&cb=' + Date.now(), {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
    await page.evaluate(() => {
      const m = document.querySelector('#author-modal');
      if (m) m.classList.add('hidden');
      try { window.__mdAnnotator.openNewTabBlank(); } catch (_) {}
    });
    await page.waitForTimeout(60);
  };

  const setup = async (html) => page.evaluate((html) => {
    const M = window.__mdAnnotator;
    M.openNewTabBlank();
    M.State.editor.commands.setContent(html);
    M.State.annotations = [];
    M.State.activeThreadId = null;
    return true;
  }, html);

  const probePos = async (needle) => page.evaluate((needle) => {
    const ed = window.__mdAnnotator.State.editor;
    const hits = [];
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText || !n.text) return;
      let i = 0;
      while ((i = n.text.indexOf(needle, i)) !== -1) {
        hits.push({ from: pos + i, to: pos + i + needle.length, seg: n.text });
        i += 1;
      }
    });
    return hits;
  }, needle);

  const markTextAt = async (from, to, body = 'c') => page.evaluate(({ from, to, body }) => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const text = ed.state.doc.textBetween(from, to, ' ');
    if (!text) return null;
    ed.commands.setTextSelection({ from, to });
    // real API: _testCreateAnnotation(from, to, text) → thread | null
    let thr = null;
    if (typeof M._testCreateAnnotation === 'function') {
      thr = M._testCreateAnnotation(from, to, text);
    }
    if (!thr && typeof M.createTestAnnotation === 'function') {
      thr = M.createTestAnnotation(from, to, text);
    }
    if (!thr) return null;
    if (body) {
      thr.comments = thr.comments || [];
      thr.comments.push({
        id: 'x' + Math.random().toString(16).slice(2, 8),
        author: { id: 'u', name: 'U' },
        body,
        createdAt: new Date().toISOString(),
      });
      thr.pending = false;
    }
    return thr.threadId || null;
  }, { from, to, body });

  const snapshotAnn = async () => page.evaluate(() => {
    const M = window.__mdAnnotator;
    const ed = M.State.editor;
    const markType = ed.schema.marks.annotation;
    const markMap = {};
    ed.state.doc.descendants((n, pos) => {
      if (!n.isText) return;
      for (const m of n.marks) {
        if (m.type === markType && m.attrs.threadId) {
          const tid = m.attrs.threadId;
          const end = pos + n.nodeSize;
          if (!markMap[tid]) markMap[tid] = { from: pos, to: end, text: n.text };
          else {
            if (pos < markMap[tid].from) markMap[tid].from = pos;
            if (end > markMap[tid].to) markMap[tid].to = end;
            markMap[tid].text += n.text;
          }
        }
      }
    });
    return M.State.annotations.map(a => ({
      tid: a.threadId,
      text: a.text,
      range: a.range ? { ...a.range } : null,
      fuzzy: !!a.fuzzy,
      invalid: !!a.invalid,
      deleted: !!a.deleted,
      reason: a.invalidReason || null,
      prefix: (a.prefix || '').slice(-12),
      suffix: (a.suffix || '').slice(0, 12),
      hasIA: !!(a.imageAnchors && a.imageAnchors.length),
      iaFrom: a.imageAnchors?.[0]?.from ?? null,
      mark: markMap[a.threadId] || null,
      corr: (() => {
        const m = markMap[a.threadId];
        if (a.imageAnchors && a.imageAnchors.length && (!m)) {
          return !a.invalid && !a.deleted && a.imageAnchors[0] && typeof a.imageAnchors[0].from === 'number';
        }
        if (!m) return a.deleted || a.invalid;
        const rangeOk = a.range && a.range.from === m.from && a.range.to === m.to;
        const textOk = a.text === m.text;
        return rangeOk && textOk && !a.invalid;
      })(),
    }));
  });

  console.log('=== chaos-position-extreme ===');
  await gotoFresh();

  await t('API: create/find/rebuild exposed', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return {
        test: typeof M._testCreateAnnotation,
        create: typeof M.createAnnotationThread,
        find: typeof M.findAnnotationRange,
        rebuild: typeof M.rebuildAnnotationMarks,
        scroll: typeof M.scrollToThread,
      };
    });
    if (r.test !== 'function' && r.create !== 'function') throw new Error(JSON.stringify(r));
    if (r.find !== 'function') throw new Error('no findAnnotationRange');
  });

  await t('P1 insert-before: range tracks mark after big prepend', async () => {
    await setup('<p>AAA unique-anchor-alpha BBB</p>');
    const hits = await probePos('unique-anchor-alpha');
    if (!hits.length) throw new Error('probe fail');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'p1');
    if (!tid) throw new Error('no tid');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('<p>' + 'PREPEND_'.repeat(80) + '</p>');
    });
    await page.waitForTimeout(50);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a) throw new Error('ann gone');
    if (!a.corr) throw new Error(JSON.stringify(a));
    if (a.mark?.text !== 'unique-anchor-alpha') throw new Error('mark text wrong ' + a.mark?.text);
  });

  await t('P2 partial-delete: ann.text follows shrunk mark (fuzzy ok)', async () => {
    await setup('<p>XX unique-partial-beta YY</p>');
    const hits = await probePos('unique-partial-beta');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'p2');
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      let from = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId === tid) from = pos;
        }
      });
      ed.view.dispatch(ed.state.tr.delete(from + 7, from + 10));
    }, tid);
    await page.waitForTimeout(50);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a) throw new Error('gone');
    if (!a.mark) throw new Error('mark lost ' + JSON.stringify(a));
    if (a.text !== a.mark.text) throw new Error('text desync ' + JSON.stringify(a));
    if (a.range?.from !== a.mark.from || a.range?.to !== a.mark.to) throw new Error('range desync ' + JSON.stringify(a));
    if (!a.fuzzy && a.text === 'unique-partial-beta') throw new Error('expected fuzzy or updated text');
  });

  await t('P3 duplicate-text: two identical anchors keep distinct positions', async () => {
    await setup('<p>The same phrase here.</p><p>The same phrase here.</p><p>The same phrase here.</p>');
    const hits = await probePos('same phrase');
    if (hits.length < 3) throw new Error('need 3 hits got ' + hits.length);
    const t1 = await markTextAt(hits[0].from, hits[0].to, 'first');
    const t2 = await markTextAt(hits[2].from, hits[2].to, 'third');
    await page.waitForTimeout(40);
    let snap = await snapshotAnn();
    let a1 = snap.find(x => x.tid === t1);
    let a2 = snap.find(x => x.tid === t2);
    if (!a1?.corr || !a2?.corr) throw new Error('live ' + JSON.stringify({ a1, a2 }));
    if (a1.mark.from === a2.mark.from) throw new Error('same mark pos');

    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      const snap = [];
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId) {
            snap.push({ threadId: m.attrs.threadId, from: pos, to: pos + n.nodeSize, resolved: !!m.attrs.resolved });
          }
        }
      });
      const merged = [];
      snap.sort((a, b) => a.from - b.from || a.threadId.localeCompare(b.threadId));
      for (const s of snap) {
        const last = merged[merged.length - 1];
        if (last && last.threadId === s.threadId && last.to === s.from) last.to = s.to;
        else merged.push({ ...s });
      }
      M.rebuildAnnotationMarks(merged);
    });
    await page.waitForTimeout(40);
    snap = await snapshotAnn();
    a1 = snap.find(x => x.tid === t1);
    a2 = snap.find(x => x.tid === t2);
    if (!a1?.corr || !a2?.corr) throw new Error('after rebuild ' + JSON.stringify({ a1, a2 }));
    if (a1.mark.from === a2.mark.from) throw new Error('collapsed to same');
  });

  await t('P4 roundtrip duplicate: load restores distinct marks via prefix/suffix', async () => {
    await setup('<p>Alpha block same-token Omega</p><p>Beta block same-token Gamma</p>');
    const hits = await probePos('same-token');
    if (hits.length < 2) throw new Error('hits ' + hits.length);
    await markTextAt(hits[0].from, hits[0].to, 'a');
    await markTextAt(hits[1].from, hits[1].to, 'b');
    const meta = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      return M.State.annotations.map(a => ({
        tid: a.threadId, text: a.text, prefix: a.prefix, suffix: a.suffix,
      }));
    });
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const md = M.htmlToMarkdown(M.State.editor.getHTML());
      const anns = M.State.annotations.map(a => ({
        threadId: a.threadId,
        text: a.text,
        prefix: a.prefix || '',
        suffix: a.suffix || '',
        resolved: false,
        createdAt: a.createdAt || new Date().toISOString(),
        comments: a.comments || [],
        range: a.range,
      }));
      M.openNewTabBlank();
      M.loadMarkdownIntoEditor('pos-dup.mentor', md, { version: '1', annotations: anns });
      return {
        md,
        anns: anns.map(a => ({ tid: a.threadId, p: a.prefix, s: a.suffix, t: a.text })),
        after: M.State.annotations.map(a => ({
          tid: a.threadId,
          text: a.text,
          range: a.range,
          fuzzy: a.fuzzy,
          invalid: a.invalid,
          deleted: a.deleted,
        })),
      };
    });
    await page.waitForTimeout(40);
    const snap = await snapshotAnn();
    if (snap.length < 2) throw new Error('lost anns ' + JSON.stringify(r));
    const goods = snap.filter(a => a.corr && a.mark);
    if (goods.length < 2) throw new Error('corr fail ' + JSON.stringify({ snap, r: r.after, meta }));
    if (goods[0].mark.from === goods[1].mark.from) throw new Error('same pos after load');
  });

  await t('P5 CJK+emoji: mark text and range stay aligned after insert', async () => {
    await setup('<p>这是一段含有表情👋和中文锚点词的测试</p>');
    const hits = await probePos('中文锚点词');
    if (!hits.length) throw new Error('no cjk');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'cjk');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('前缀插入');
    });
    await page.waitForTimeout(40);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a?.corr) throw new Error(JSON.stringify(a));
    if (a.mark.text !== '中文锚点词') throw new Error(a.mark.text);
  });

  await t('P6 full-delete mark text → deleted+invalid', async () => {
    await setup('<p>keep unique-kill-me end</p>');
    const hits = await probePos('unique-kill-me');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'kill');
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId === tid) {
            from = pos; to = pos + n.nodeSize;
          }
        }
      });
      ed.view.dispatch(ed.state.tr.delete(from, to));
    }, tid);
    await page.waitForTimeout(40);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a) throw new Error('gone from list');
    if (!a.deleted || !a.invalid) throw new Error(JSON.stringify(a));
    if (a.mark) throw new Error('mark should be gone');
  });

  await t('P7 cut-paste mark: either mark moves with text OR fuzzy reattach correct', async () => {
    await setup('<p>HEAD unique-cut-paste TAIL</p><p>other paragraph sink</p>');
    const hits = await probePos('unique-cut-paste');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'cut');
    const r = await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      let from = -1, to = -1, text = '';
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId === tid) {
            from = pos; to = pos + n.nodeSize; text = n.text;
          }
        }
      });
      const slice = ed.state.doc.slice(from, to);
      ed.view.dispatch(ed.state.tr.delete(from, to));
      const end = ed.state.doc.content.size;
      const tr = ed.state.tr.insert(end - 1, slice.content);
      ed.view.dispatch(tr);
      return { text, end };
    }, tid);
    await page.waitForTimeout(80);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a) throw new Error('ann missing');
    if (a.mark) {
      if (a.mark.text.indexOf('unique-cut-paste') === -1 && a.mark.text !== r.text)
        throw new Error('mark on wrong text ' + JSON.stringify(a));
      if (a.range && (a.range.from !== a.mark.from || a.range.to !== a.mark.to))
        throw new Error('range!=mark after paste ' + JSON.stringify(a));
      if (a.text !== a.mark.text && !a.fuzzy)
        throw new Error('text desync no fuzzy ' + JSON.stringify(a));
    } else {
      if (!a.fuzzy && !a.invalid && !a.deleted)
        throw new Error('mark lost silently ' + JSON.stringify(a));
    }
  });

  await t('P8 30-ann stress: prepend+rebuild all corr', async () => {
    const parts = [];
    for (let i = 0; i < 30; i++) parts.push(`<p>row${i} token-${i}-uniq end${i}</p>`);
    await setup(parts.join(''));
    const tids = [];
    for (let i = 0; i < 30; i++) {
      const hits = await probePos(`token-${i}-uniq`);
      if (!hits.length) throw new Error('no token ' + i);
      const tid = await markTextAt(hits[0].from, hits[0].to, 'n' + i);
      tids.push(tid);
    }
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('<p>BIG_SHIFT_BLOCK</p>');
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      const snap = [];
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId) {
            snap.push({ threadId: m.attrs.threadId, from: pos, to: pos + n.nodeSize, resolved: false });
          }
        }
      });
      const merged = [];
      snap.sort((a, b) => a.from - b.from);
      for (const s of snap) {
        const last = merged[merged.length - 1];
        if (last && last.threadId === s.threadId && last.to === s.from) last.to = s.to;
        else merged.push({ ...s });
      }
      M.rebuildAnnotationMarks(merged);
    });
    await page.waitForTimeout(40);
    const snap = await snapshotAnn();
    const bad = snap.filter(a => tids.includes(a.tid) && !a.corr);
    if (bad.length) throw new Error('bad ' + bad.length + ' e.g. ' + JSON.stringify(bad[0]));
  });

  await t('P9 pure-image: insert before keeps IA corr + scroll ok', async () => {
    const r = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      const c = document.createElement('canvas');
      c.width = 40; c.height = 30;
      const x = c.getContext('2d');
      x.fillStyle = '#4C72B0'; x.fillRect(0, 0, 40, 30);
      const data = c.toDataURL('image/png');
      M.State.editor.commands.setContent(
        `<p>before-img</p><img src="${data}" alt="fig-pos"><p>after-img</p>`
      );
      M.State.annotations = [];
      let imgPos = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && imgPos < 0) imgPos = pos;
      });
      if (imgPos < 0) return { err: 'no img' };
      M.State.editor.commands.setNodeSelection(imgPos);
      let tid = null;
      if (typeof M._testCreateAnnotation === 'function') {
        tid = M._testCreateAnnotation({ from: imgPos, to: imgPos + 1, body: 'img' });
      }
      if (!tid) {
        const node = M.State.editor.state.doc.nodeAt(imgPos);
        const to = imgPos + node.nodeSize;
        const threadId = Math.random().toString(16).slice(2, 14);
        const thr = {
          threadId,
          text: '[图片]',
          prefix: '',
          suffix: '',
          skipMark: true,
          range: { from: imgPos, to },
          imageAnchors: [{ from: imgPos, to, src: node.attrs.src, alt: node.attrs.alt || '', title: '' }],
          resolved: false,
          createdAt: new Date().toISOString(),
          comments: [{ id: '1', author: { id: 'u', name: 'U' }, body: 'img', createdAt: new Date().toISOString() }],
        };
        M.State.annotations.push(thr);
        tid = threadId;
        if (M.refreshAnnotationImageDecos) M.refreshAnnotationImageDecos();
      }
      M.State.editor.commands.setTextSelection(1);
      M.State.editor.commands.insertContent('<p>IMG_SHIFT</p>');
      if (M._validateMarksAfterEdit) M._validateMarksAfterEdit(M.State.editor);
      if (M.resyncImageAnchors) {
        const ann = M.State.annotations.find(a => a.threadId === tid);
        M.resyncImageAnchors(ann, M.State.editor.state.doc);
      }
      if (M.refreshAnnotationImageDecos) M.refreshAnnotationImageDecos();
      const ann = M.State.annotations.find(a => a.threadId === tid);
      let liveImg = -1;
      M.State.editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'image' && liveImg < 0) liveImg = pos;
      });
      let scrollOk = null;
      if (typeof M.scrollToThread === 'function') {
        try { M.scrollToThread(tid); scrollOk = true; } catch (e) { scrollOk = String(e); }
      }
      return {
        tid,
        invalid: ann?.invalid,
        deleted: ann?.deleted,
        fuzzy: ann?.fuzzy,
        iaFrom: ann?.imageAnchors?.[0]?.from,
        liveImg,
        range: ann?.range,
        scrollOk,
        text: ann?.text,
      };
    });
    if (r.err) throw new Error(r.err);
    if (r.invalid || r.deleted) throw new Error('img invalid ' + JSON.stringify(r));
    if (r.iaFrom !== r.liveImg) throw new Error('IA not on live img ' + JSON.stringify(r));
  });

  await t('P10 identical-copy trap: mark stays on original occurrence not first copy', async () => {
    await setup('<p>intro</p><p>Z target-uniq-word end</p>');
    const hits = await probePos('target-uniq-word');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'orig');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('<p>COPY target-uniq-word COPY</p>');
    });
    await page.waitForTimeout(40);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a?.mark) throw new Error('mark lost ' + JSON.stringify(a));
    const info = await page.evaluate((tid) => {
      const ed = window.__mdAnnotator.State.editor;
      const markType = ed.schema.marks.annotation;
      const occ = [];
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText || !n.text) return;
        let i = 0;
        while ((i = n.text.indexOf('target-uniq-word', i)) !== -1) {
          const from = pos + i, to = from + 'target-uniq-word'.length;
          let has = false;
          ed.state.doc.nodesBetween(from, to, (nn) => {
            if (!nn.isText) return;
            for (const m of nn.marks) {
              if (m.type === markType && m.attrs.threadId === tid) has = true;
            }
          });
          occ.push({ from, to, has });
          i += 1;
        }
      });
      const ann = window.__mdAnnotator.State.annotations.find(x => x.threadId === tid);
      return { occ, range: ann?.range, text: ann?.text };
    }, tid);
    const marked = info.occ.filter(o => o.has);
    if (marked.length !== 1) throw new Error('expected 1 marked occ ' + JSON.stringify(info));
    if (info.occ[0].has) throw new Error('mark jumped to first copy ' + JSON.stringify(info));
    if (!info.occ[1].has) throw new Error('original lost mark ' + JSON.stringify(info));
    if (a.range.from !== a.mark.from) throw new Error('range desync ' + JSON.stringify({ a, info }));
  });

  await t('P11 split paragraph mid-mark: still consistent', async () => {
    await setup('<p>AAA split-me-please BBB</p>');
    const hits = await probePos('split-me-please');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'split');
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId === tid) {
            from = pos; to = pos + n.nodeSize;
          }
        }
      });
      const mid = Math.floor((from + to) / 2);
      ed.commands.setTextSelection(mid);
      ed.commands.splitBlock();
    }, tid);
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (M._validateMarksAfterEdit) M._validateMarksAfterEdit(M.State.editor);
    });
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a) throw new Error('gone');
    if (a.mark) {
      if (a.text !== a.mark.text) throw new Error('text desync ' + JSON.stringify(a));
      if (a.range.from !== a.mark.from || a.range.to !== a.mark.to)
        throw new Error('range desync after validate ' + JSON.stringify(a));
    } else {
      if (!a.invalid && !a.deleted && !a.fuzzy) throw new Error('silent fail ' + JSON.stringify(a));
    }
  });

  await t('P12 findAnnotationRange: prefix disambiguates duplicates', async () => {
    const r = await page.evaluate(() => {
      const M = window.__mdAnnotator;
      M.openNewTabBlank();
      M.State.editor.commands.setContent('<p>Left xxWORD right</p><p>Other xxWORD here</p>');
      const doc = M.State.editor.state.doc;
      const noCtx = M.findAnnotationRange(doc, { text: 'xxWORD', prefix: '', suffix: '' });
      const withCtx = M.findAnnotationRange(doc, { text: 'xxWORD', prefix: 'Other ', suffix: ' here' });
      return { noCtx, withCtx, size: doc.content.size };
    });
    if (!r.noCtx || !r.withCtx) throw new Error(JSON.stringify(r));
    if (r.noCtx.from === r.withCtx.from) {
      throw new Error('prefix failed to disambiguate: ' + JSON.stringify(r));
    }
  });

  await t('P13 undo-redo after typed edit keeps corr', async () => {
    await setup('<p>base unique-undo-tok end</p>');
    const hits = await probePos('unique-undo-tok');
    const tid = await markTextAt(hits[0].from, hits[0].to, 'u');
    await page.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(1);
      ed.commands.insertContent('Z');
    });
    await page.waitForTimeout(40);
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (M.undo) M.undo();
      else M.State.editor.commands.undo();
    });
    await page.waitForTimeout(40);
    let snap = await snapshotAnn();
    let a = snap.find(x => x.tid === tid);
    if (!a?.corr && a?.mark) throw new Error('after undo ' + JSON.stringify(a));
    await page.evaluate(() => {
      const M = window.__mdAnnotator;
      if (M.redo) M.redo();
      else M.State.editor.commands.redo();
    });
    await page.waitForTimeout(40);
    snap = await snapshotAnn();
    a = snap.find(x => x.tid === tid);
    if (a?.mark && (a.text !== a.mark.text || a.range.from !== a.mark.from))
      throw new Error('after redo ' + JSON.stringify(a));
  });

  await t('P14 rewrite surroundings: mark+range still on token', async () => {
    await setup('<p>oldpre unique-surround-tok oldsuf</p>');
    const hits = await probePos('unique-surround-tok');
    const tid = await markTextAt(hits[0].from, hits[0].to, 's');
    await page.evaluate((tid) => {
      const M = window.__mdAnnotator;
      const ed = M.State.editor;
      const markType = ed.schema.marks.annotation;
      let from = -1, to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId === tid) {
            from = pos; to = pos + n.nodeSize;
          }
        }
      });
      ed.view.dispatch(ed.state.tr.insertText('NEWPRE ', 1));
      from = -1; to = -1;
      ed.state.doc.descendants((n, pos) => {
        if (!n.isText) return;
        for (const m of n.marks) {
          if (m.type === markType && m.attrs.threadId === tid) {
            from = pos; to = pos + n.nodeSize;
          }
        }
      });
      const after = to;
      const end = ed.state.doc.content.size - 1;
      if (after < end) ed.view.dispatch(ed.state.tr.insertText(' NEWPOST', after));
    }, tid);
    await page.waitForTimeout(40);
    const snap = await snapshotAnn();
    const a = snap.find(x => x.tid === tid);
    if (!a?.corr) throw new Error(JSON.stringify(a));
    if (a.mark.text !== 'unique-surround-tok') throw new Error(a.mark.text);
  });

  console.log('\nTOTAL', pass + fail, 'PASS', pass, 'FAIL', fail);
  console.log('pageErrs', pageErrs.length ? pageErrs.slice(0, 5) : 0);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ pass, fail, results, pageErrs }, null, 2));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
