/**
 * Multi-pass: when is 「原文已被删除」 activated? any errors?
 * Run: node tests/orphan-deleted-banner-multipass.spec.js
 * Requires mentor-server on :8787
 */
const { chromium } = require('playwright');

const BASE = process.env.MENTOR_BASE || 'http://127.0.0.1:8787';
const PASSES = Number(process.env.PASSES || 5);

function assert(cond, msg, info) {
  if (!cond) {
    const e = new Error(msg + (info ? ' ' + JSON.stringify(info) : ''));
    e.info = info;
    throw e;
  }
}

async function setupPage(browser) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  await page.goto(BASE + '/index.html?v=orphan-mp', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor != null, { timeout: 20000 });
  return { page, pageErrors };
}

async function scenarioDeleteMarkedText(page) {
  return page.evaluate(async () => {
    const a = window.__mdAnnotator;
    const ed = a.State.editor;
    ed.commands.setContent('<p>Hello UNIQUE_TOKEN_XYZ world</p>');
    a.State.annotations = [];
    const from = 7; // H e l l o   U ...
    // Find UNIQUE in doc
    let start = -1;
    ed.state.doc.descendants((node, pos) => {
      if (start >= 0) return false;
      if (node.isText && node.text && node.text.includes('UNIQUE_TOKEN_XYZ')) {
        start = pos + node.text.indexOf('UNIQUE_TOKEN_XYZ');
      }
    });
    const end = start + 'UNIQUE_TOKEN_XYZ'.length;
    const tid = 'orphan-mp-' + Math.random().toString(36).slice(2, 8);
    const tr = ed.state.tr;
    tr.addMark(start, end, ed.schema.marks.annotation.create({
      threadId: tid, resolved: false, authorColor: 0,
    }));
    ed.view.dispatch(tr);
    a.State.annotations.push({
      threadId: tid,
      range: { from: start, to: end },
      text: 'UNIQUE_TOKEN_XYZ',
      prefix: 'Hello ',
      suffix: ' world',
      resolved: false,
      comments: [{ id: 'c1', author: 't', body: 'note', createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      mdRange: { start, end },
    });
    a.renderCommentList();
    // Before delete: NO deleted banner
    let card = document.querySelector('.comment-thread[data-thread="' + tid + '"]');
    const beforeBanner = !!card?.querySelector('.deleted-banner');
    const beforeWarn = a.annotationWarningState
      ? a.annotationWarningState(a.State.annotations[0])
      : null;

    // Delete marked text
    ed.commands.setTextSelection({ from: start, to: end });
    ed.commands.deleteSelection();
    await new Promise((r) => setTimeout(r, 200));
    if (a._validateMarksAfterEdit) a._validateMarksAfterEdit(ed);
    a.renderCommentList();

    const ann = a.State.annotations.find((t) => t.threadId === tid);
    card = document.querySelector('.comment-thread[data-thread="' + tid + '"]');
    const bannerText = card?.querySelector('.deleted-banner')?.textContent?.trim() || '';
    const liveMark = (() => {
      const mt = ed.schema.marks.annotation;
      let found = false;
      ed.state.doc.descendants((node) => {
        if (node.isText && node.marks.some((m) => m.type === mt && m.attrs.threadId === tid)) found = true;
      });
      return found;
    })();

    return {
      tid,
      beforeBanner,
      beforeWarn,
      deleted: !!ann?.deleted,
      invalid: !!ann?.invalid,
      reason: ann?.invalidReason || '',
      bannerText,
      hasBanner: /原文已被删除/.test(bannerText),
      liveMark,
      doc: ed.state.doc.textContent,
    };
  });
}

async function scenarioIntactNoBanner(page) {
  return page.evaluate(async () => {
    const a = window.__mdAnnotator;
    const ed = a.State.editor;
    ed.commands.setContent('<p>Keep MARKED_OK here</p>');
    a.State.annotations = [];
    let start = -1;
    ed.state.doc.descendants((node, pos) => {
      if (start >= 0) return false;
      if (node.isText && node.text && node.text.includes('MARKED_OK')) {
        start = pos + node.text.indexOf('MARKED_OK');
      }
    });
    const end = start + 'MARKED_OK'.length;
    const tid = 'intact-' + Math.random().toString(36).slice(2, 8);
    const tr = ed.state.tr;
    tr.addMark(start, end, ed.schema.marks.annotation.create({
      threadId: tid, resolved: false, authorColor: 0,
    }));
    ed.view.dispatch(tr);
    a.State.annotations.push({
      threadId: tid,
      range: { from: start, to: end },
      text: 'MARKED_OK',
      resolved: false,
      comments: [],
      createdAt: new Date().toISOString(),
    });
    a.renderCommentList();
    await new Promise((r) => setTimeout(r, 100));
    const card = document.querySelector('.comment-thread[data-thread="' + tid + '"]');
    const ann = a.State.annotations[0];
    return {
      tid,
      hasBanner: !!card?.querySelector('.deleted-banner'),
      deleted: !!ann?.deleted,
      text: card?.textContent?.slice(0, 80) || '',
    };
  });
}

async function scenarioDeleteOrphanClick(page) {
  return page.evaluate(async () => {
    const a = window.__mdAnnotator;
    const ed = a.State.editor;
    ed.commands.setContent('<p>ZZZ_DEL_ME_QQQ rest</p>');
    a.State.annotations = [];
    let start = -1;
    ed.state.doc.descendants((node, pos) => {
      if (start >= 0) return false;
      if (node.isText && node.text && node.text.includes('ZZZ_DEL_ME_QQQ')) {
        start = pos + node.text.indexOf('ZZZ_DEL_ME_QQQ');
      }
    });
    const end = start + 'ZZZ_DEL_ME_QQQ'.length;
    const tid = 'rm-' + Math.random().toString(36).slice(2, 8);
    const tr = ed.state.tr;
    tr.addMark(start, end, ed.schema.marks.annotation.create({
      threadId: tid, resolved: false, authorColor: 0,
    }));
    ed.view.dispatch(tr);
    a.State.annotations.push({
      threadId: tid, range: { from: start, to: end }, text: 'ZZZ_DEL_ME_QQQ',
      resolved: false, comments: [], createdAt: new Date().toISOString(),
    });
    ed.commands.setTextSelection({ from: start, to: end });
    ed.commands.deleteSelection();
    await new Promise((r) => setTimeout(r, 200));
    if (a._validateMarksAfterEdit) a._validateMarksAfterEdit(ed);
    a.renderCommentList();
    window.confirm = () => true;
    const before = a.State.annotations.length;
    document.querySelector('.comment-thread[data-thread="' + tid + '"] [data-act="delete-orphan"]')?.click();
    return { before, after: a.State.annotations.length, tid };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const summary = [];
  let failed = 0;
  try {
    for (let i = 1; i <= PASSES; i++) {
      const { page, pageErrors } = await setupPage(browser);
      try {
        const del = await scenarioDeleteMarkedText(page);
        assert(!del.beforeBanner, 'P' + i + ' before delete must not show banner', del);
        assert(del.deleted === true, 'P' + i + ' deleted flag', del);
        assert(del.reason === 'text-deleted', 'P' + i + ' reason text-deleted', del);
        assert(del.hasBanner === true, 'P' + i + ' banner 原文已被删除', del);
        assert(del.liveMark === false, 'P' + i + ' live mark gone', del);

        const intact = await scenarioIntactNoBanner(page);
        assert(intact.hasBanner === false, 'P' + i + ' intact no banner', intact);
        assert(intact.deleted === false, 'P' + i + ' intact not deleted', intact);

        const rm = await scenarioDeleteOrphanClick(page);
        assert(rm.before === 1 && rm.after === 0, 'P' + i + ' delete-orphan removes', rm);

        assert(pageErrors.length === 0, 'P' + i + ' no pageerrors', pageErrors);
        summary.push({ pass: i, ok: true });
        console.log('PASS', i, 'ok');
      } catch (e) {
        failed++;
        summary.push({ pass: i, ok: false, error: e.message });
        console.log('FAIL', i, e.message);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log('---');
  console.log(JSON.stringify({ PASSES, failed, summary }, null, 2));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
