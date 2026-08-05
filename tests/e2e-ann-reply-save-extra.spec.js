/**
 * Extra ann/reply/save sequences not in the main A-M matrix.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const BASE = process.env.MENTOR_BASE || 'http://127.0.0.1:8787';
const ROOT = path.resolve(__dirname, '..');
const DEMO = path.join(ROOT, 'examples', 'supervision-pet-demo.mentor');

function assert(c, m) {
  if (!c) throw new Error(m || 'assert');
}

async function diskAnns(p) {
  const JSZip = (await import(pathToFileURL(path.join(ROOT, 'node_modules/jszip/lib/index.js')).href)).default;
  const z = await JSZip.loadAsync(fs.readFileSync(p));
  return JSON.parse(await z.file('annotations.json').async('string'));
}

function findBody(a, b) {
  for (const t of a.annotations || []) {
    for (const c of t.comments || []) {
      if (c.body === b) return t;
    }
  }
  return null;
}

async function save(page) {
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await page.evaluate(async () => {
      try {
        const x = await window.__mdAnnotator.writeCurrentToDisk({ interactive: false });
        return { ok: !!(x && x.ok), err: x && x.error };
      } catch (e) {
        return { ok: false, err: e.message };
      }
    });
    if (last.ok) return last;
    if (!String(last.err || '').toLowerCase().includes('busy')) return last;
    await page.waitForTimeout(120 + i * 40);
  }
  return last;
}

async function ann(page, phrase, bodies) {
  await page.evaluate((p) => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus('end');
    ed.commands.insertContent('<p>' + p + '</p>');
  }, phrase);
  return page.evaluate(({ phrase: ph, bodies: bs }) => {
    const M = window.__mdAnnotator;
    const doc = M.State.editor.state.doc;
    let from = null;
    let to = null;
    doc.descendants((n, pos) => {
      if (from != null) return false;
      if (n.isText && n.text && n.text.includes(ph)) {
        const i = n.text.indexOf(ph);
        from = pos + i;
        to = from + ph.length;
      }
    });
    const th = M.createAnnotationThread(from, to, ph);
    for (const b of bs) M.addReply(th.threadId, b);
    return { tid: th.threadId, status: th.anchor.status, n: (th.comments || []).length };
  }, { phrase, bodies });
}

function baseName(pth) {
  const parts = String(pth || '').split(/[\\/]/);
  return parts[parts.length - 1] || 'extra.mentor';
}

(async () => {
  assert(fs.existsSync(DEMO), 'demo missing');
  const sess = await (await fetch(BASE + '/session')).json();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ann-extra-'));
  const mp = path.join(tmp, 'extra.mentor');
  fs.copyFileSync(DEMO, mp);
  await fetch(BASE + '/pending-open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sess.token, path: mp }),
  });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.on('dialog', (d) => d.accept());
  const res = [];
  const ok = (id, d) => {
    res.push({ id, ok: true, d });
    console.log('PASS', id, d || '');
  };
  const no = (id, d) => {
    res.push({ id, ok: false, d });
    console.error('FAIL', id, d);
  };

  try {
    await page.goto(BASE + '/index.html?extra=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor), { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#author-modal') && document.querySelector('#author-modal').classList.add('hidden'));
    for (let i = 0; i < 50; i++) {
      const pth = await page.evaluate(() => (window.__mdAnnotator.resolveActiveMentorAbsPath && window.__mdAnnotator.resolveActiveMentorAbsPath()) || '');
      if (/extra\.mentor$/i.test(pth)) break;
      await page.waitForTimeout(100);
    }

    // N: reply -> save -> deleteThread -> save
    {
      const c = await ann(page, 'EXTRA_N_PHRASE', ['EXTRA_N_R1']);
      let s = await save(page);
      let d = await diskAnns(mp);
      const before = !!findBody(d, 'EXTRA_N_R1');
      const del = await page.evaluate((tid) => {
        const M = window.__mdAnnotator;
        if (typeof M.deleteThread === 'function') return !!M.deleteThread(tid);
        if (typeof M.deleteThreads === 'function') return !!M.deleteThreads([tid], { confirm: false });
        return false;
      }, c.tid);
      s = await save(page);
      d = await diskAnns(mp);
      const after = !!findBody(d, 'EXTRA_N_R1');
      if (before && del && s.ok && !after) ok('N', 'delete after save');
      else no('N', JSON.stringify({ before, del, s, after, c }));
    }

    // O: two replies -> remove first -> save keeps second
    {
      const c = await ann(page, 'EXTRA_O_PHRASE', ['EXTRA_O_R1', 'EXTRA_O_R2']);
      const ed = await page.evaluate((tid) => {
        const M = window.__mdAnnotator;
        const th = (M.State.annotations || []).find((x) => x.threadId === tid);
        if (!th) return { err: 'no th' };
        if (th.comments.length >= 2) {
          th.comments.splice(0, 1);
          try { M.markDirty(); } catch (_) {}
        }
        return { n: th.comments.length, bodies: th.comments.map((x) => x.body) };
      }, c.tid);
      const s = await save(page);
      const d = await diskAnns(mp);
      const t = findBody(d, 'EXTRA_O_R2');
      const hasR1 = !!findBody(d, 'EXTRA_O_R1');
      if (s.ok && t && !hasR1 && ed.n === 1) ok('O', 'splice first reply');
      else no('O', JSON.stringify({ s, ed, hasR1, hasR2: !!t }));
    }

    // P: save -> reopen -> add reply -> save
    {
      await ann(page, 'EXTRA_P_PHRASE', ['EXTRA_P_R1']);
      let s = await save(page);
      for (let i = 0; i < 20; i++) {
        try { await diskAnns(mp); break; } catch (_) { await page.waitForTimeout(50); }
      }
      // Prefer Node-validated bytes into the page (avoids flaky mid-write /open)
      const bytes = fs.readFileSync(mp);
      const b64 = bytes.toString('base64');
      const fname = baseName(mp);
      const re = await page.evaluate(async ({ b64, fname }) => {
        const M = window.__mdAnnotator;
        const pth = M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath();
        if (!pth) return { err: 'no path' };
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        if (arr[0] !== 0x50 || arr[1] !== 0x4b) return { err: 'not-zip', len: arr.length };
        await M.openFromMentorFile(new File([arr], fname, { type: 'application/zip' }), { path: pth });
        return { ok: true, len: arr.length };
      }, { b64, fname });
      await page.waitForTimeout(300);
      const add = await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const th = (M.State.annotations || []).find((x) => (x.comments || []).some((c) => c.body === 'EXTRA_P_R1'));
        if (!th) return { err: 'missing after reload', n: (M.State.annotations || []).length };
        M.addReply(th.threadId, 'EXTRA_P_R2');
        return { tid: th.threadId, n: th.comments.length };
      });
      s = await save(page);
      const d = await diskAnns(mp);
      if (s.ok && re.ok && findBody(d, 'EXTRA_P_R1') && findBody(d, 'EXTRA_P_R2')) ok('P', 'reload then reply len=' + re.len);
      else no('P', JSON.stringify({ s, re, add }));
    }

    // Q: 3 threads then one save
    {
      await ann(page, 'EXTRA_Q1', ['EXTRA_Q1_R']);
      await ann(page, 'EXTRA_Q2', ['EXTRA_Q2_R']);
      await ann(page, 'EXTRA_Q3', ['EXTRA_Q3_R']);
      const s = await save(page);
      const d = await diskAnns(mp);
      const ok3 = !!(findBody(d, 'EXTRA_Q1_R') && findBody(d, 'EXTRA_Q2_R') && findBody(d, 'EXTRA_Q3_R'));
      if (s.ok && ok3) ok('Q', '3 threads one save');
      else no('Q', JSON.stringify({ s, ok3 }));
    }

    // R: edit twice then save
    {
      const c = await ann(page, 'EXTRA_R_PHRASE', ['EXTRA_R_V1']);
      await page.evaluate((tid) => {
        const M = window.__mdAnnotator;
        M.editComment(tid, 0, 'EXTRA_R_V2');
        M.editComment(tid, 0, 'EXTRA_R_V3');
      }, c.tid);
      const s = await save(page);
      const d = await diskAnns(mp);
      if (s.ok && findBody(d, 'EXTRA_R_V3') && !findBody(d, 'EXTRA_R_V1')) ok('R', 'double edit');
      else no('R', JSON.stringify(s));
    }

    // S: resolve -> unresolve -> save
    {
      const c = await ann(page, 'EXTRA_S_PHRASE', ['EXTRA_S_R']);
      await page.evaluate((tid) => {
        const M = window.__mdAnnotator;
        M.toggleResolved(tid);
        M.toggleResolved(tid);
      }, c.tid);
      const s = await save(page);
      const d = await diskAnns(mp);
      const t = findBody(d, 'EXTRA_S_R');
      if (s.ok && t && !t.resolved) ok('S', 'resolve toggle back');
      else no('S', JSON.stringify({ s, res: t && t.resolved }));
    }
  } finally {
    await browser.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }

  const failed = res.filter((x) => !x.ok);
  console.log('SUMMARY', (res.length - failed.length) + '/' + res.length);
  if (failed.length) process.exit(1);
  console.log('PASS e2e-ann-reply-save-extra');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
