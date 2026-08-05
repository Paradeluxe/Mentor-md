/**
 * Exhaustive order matrix: annotation + reply + save (+ autosave) + disk round-trip.
 * Every sequence asserts disk annotations.json (or open-from-disk) after writes.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const BASE = process.env.MENTOR_BASE || 'http://127.0.0.1:8787';
const ROOT = path.resolve(__dirname, '..');
const DEMO = path.join(ROOT, 'examples', 'supervision-pet-demo.mentor');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

async function sessionToken() {
  const r = await fetch(`${BASE}/session`);
  const j = await r.json();
  assert(j && j.token, 'no session token');
  return j.token;
}

async function pendingOpen(token, absPath) {
  const r = await fetch(`${BASE}/pending-open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, path: absPath }),
  });
  assert(r.ok, `pending-open ${r.status}`);
}

async function waitBound(page, fileName, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const p = await page.evaluate(() => window.__mdAnnotator?.resolveActiveMentorAbsPath?.() || '');
    if (p && p.toLowerCase().endsWith(fileName.toLowerCase())) return p;
    await page.waitForTimeout(100);
  }
  throw new Error(`path not bound: ${fileName}`);
}

async function diskAnns(absPath) {
  const JSZip = (await import(pathToFileURL(path.join(ROOT, 'node_modules/jszip/lib/index.js')).href)).default;
  const z = await JSZip.loadAsync(fs.readFileSync(absPath));
  const raw = await z.file('annotations.json').async('string');
  return JSON.parse(raw);
}

async function findRange(page, needle) {
  return page.evaluate((n) => {
    const ed = window.__mdAnnotator.State.editor;
    const doc = ed.state.doc;
    let hit = null;
    doc.descendants((node, pos) => {
      if (hit) return false;
      if (node.isText && node.text && node.text.includes(n)) {
        const i = node.text.indexOf(n);
        hit = { from: pos + i, to: pos + i + n.length, text: n };
      }
    });
    return hit;
  }, needle);
}

async function appendPhrase(page, phrase) {
  await page.evaluate((p) => {
    const ed = window.__mdAnnotator.State.editor;
    ed.commands.focus('end');
    ed.commands.insertContent(`<p>${p}</p>`);
  }, phrase);
}

async function createAnnReply(page, phrase, bodies) {
  const range = await findRange(page, phrase);
  assert(range, `range missing for ${phrase}`);
  return page.evaluate(({ from, to, text, bodies: bs }) => {
    const M = window.__mdAnnotator;
    const th = M.createAnnotationThread(from, to, text);
    if (!th) return { err: 'create failed' };
    const replies = [];
    for (const b of bs) {
      const c = M.addReply(th.threadId, b);
      replies.push(c && c.body);
    }
    return {
      threadId: th.threadId,
      status: th.anchor && th.anchor.status,
      invalid: !!th.invalid,
      mdRange: th.mdRange || null,
      nComments: (th.comments || []).length,
      replies,
      pending: !!th.pending,
      text: th.text,
    };
  }, { ...range, bodies });
}

async function manualSave(page) {
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      try {
        const r = await M.writeCurrentToDisk({ interactive: false });
        return { ok: !!(r && r.ok), via: r && r.via, err: r && r.error, code: r && r.code, dirty: !!(M.State.currentFile && M.State.currentFile.dirty) };
      } catch (e) {
        return { ok: false, err: e.message, code: e.code };
      }
    });
    if (last.ok) return last;
    const busy = String(last.err || last.code || '').toLowerCase().includes('busy');
    if (!busy) return last;
    await page.waitForTimeout(150 + i * 50);
  }
  return last;
}

async function forceAutosave(page) {
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = await page.evaluate(async () => {
      const M = window.__mdAnnotator;
      try {
        if (typeof M.scheduleAutosave === 'function') M.scheduleAutosave('test-force');
        const r = await M.writeCurrentToDisk({ interactive: false, reason: 'autosave' });
        return { ok: !!(r && r.ok), via: r && r.via, err: r && r.error, code: r && r.code };
      } catch (e) {
        return { ok: false, err: e.message, code: e.code };
      }
    });
    if (last.ok) return last;
    const busy = String(last.err || last.code || '').toLowerCase().includes('busy');
    if (!busy) return last;
    await page.waitForTimeout(150 + i * 50);
  }
  return last;
}

async function reloadFromDisk(page) {
  return page.evaluate(async () => {
    const M = window.__mdAnnotator;
    if (typeof M.reloadCurrentFromDisk === 'function') {
      await M.reloadCurrentFromDisk({ force: true });
      return { via: 'reloadCurrentFromDisk' };
    }
    const p = M.resolveActiveMentorAbsPath && M.resolveActiveMentorAbsPath();
    if (!p) return { err: 'no path' };
    const tok = (window.__mentorSession && window.__mentorSession.token) || '';
    const url = `/open?token=${encodeURIComponent(tok)}&path=${encodeURIComponent(p)}`;
    const res = await fetch(url);
    if (!res.ok) return { err: `open ${res.status}` };
    const buf = await res.arrayBuffer();
    const name = p.split(/[/\\\\]/).pop();
    await M.openFromMentorFile(new File([buf], name, { type: 'application/zip' }), { path: p });
    return { via: 'openFromMentorFile' };
  });
}

function bodiesOf(anns, threadId) {
  const t = (anns.annotations || anns || []).find((x) => x.threadId === threadId);
  return t ? (t.comments || []).map((c) => c.body) : null;
}

function findByBody(anns, body) {
  for (const t of anns.annotations || []) {
    for (const c of t.comments || []) {
      if (c.body === body) return t;
    }
  }
  return null;
}

(async () => {
  assert(fs.existsSync(DEMO), 'demo missing');
  const token = await sessionToken();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ann-orders-'));
  const mentorPath = path.join(tmp, 'orders.mentor');
  fs.copyFileSync(DEMO, mentorPath);
  await pendingOpen(token, mentorPath);

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.on('dialog', (d) => d.accept());
  const results = [];
  const pass = (id, detail) => { results.push({ id, ok: true, detail }); console.log(`PASS ${id} ${detail || ''}`); };
  const fail = (id, detail) => { results.push({ id, ok: false, detail }); console.error(`FAIL ${id} ${detail}`); };

  try {
    await page.goto(`${BASE}/index.html?annOrders=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor), { timeout: 30000 });
    await page.evaluate(() => document.querySelector('#author-modal')?.classList.add('hidden'));
    await waitBound(page, 'orders.mentor');

    // ---- A: ann → reply → save → reload ----
    {
      const phrase = 'ORDER_A_PHRASE_ALPHA';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_A_R1']);
      if (cr.err || cr.status !== 'attached') { fail('A_create', JSON.stringify(cr)); }
      else {
        const s = await manualSave(page);
        if (!s.ok) fail('A_save', JSON.stringify(s));
        else {
          const disk = await diskAnns(mentorPath);
          const t = findByBody(disk, 'ORDER_A_R1');
          if (!t) fail('A_disk', 'missing body');
          else {
            await reloadFromDisk(page);
            await waitBound(page, 'orders.mentor');
            const live = await page.evaluate(() => (window.__mdAnnotator.State.annotations || []).map((x) => ({
              id: x.threadId, bodies: (x.comments || []).map((c) => c.body),
            })));
            const okLive = live.some((x) => x.bodies.includes('ORDER_A_R1'));
            if (okLive) pass('A', `tid=${t.threadId.slice(0, 8)}`);
            else fail('A_reload', JSON.stringify(live).slice(0, 200));
          }
        }
      }
    }

    // ---- B: ann → save (pending empty) → reply → save ----
    {
      const phrase = 'ORDER_B_PHRASE_BETA';
      await appendPhrase(page, phrase);
      const range = await findRange(page, phrase);
      const cr = await page.evaluate(({ from, to, text }) => {
        const M = window.__mdAnnotator;
        const th = M.createAnnotationThread(from, to, text);
        return th ? { threadId: th.threadId, status: th.anchor.status, n: th.comments.length, pending: th.pending } : { err: 'no' };
      }, range);
      const s1 = await manualSave(page);
      // pending empty may be dropped from package — allowed
      await page.evaluate(({ tid }) => {
        const M = window.__mdAnnotator;
        // thread may still be live even if not on disk
        let th = (M.State.annotations || []).find((x) => x.threadId === tid);
        if (!th) {
          // recreate if dropped
        } else {
          M.addReply(tid, 'ORDER_B_R1');
        }
      }, { tid: cr.threadId });
      // if thread was dropped by save serialization, recreate+reply
      const has = await page.evaluate((tid) => !!(window.__mdAnnotator.State.annotations || []).find((x) => x.threadId === tid && (x.comments || []).some((c) => c.body === 'ORDER_B_R1')), cr.threadId);
      if (!has) {
        await createAnnReply(page, phrase, ['ORDER_B_R1']);
      }
      const s2 = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_B_R1');
      if (s2.ok && t) pass('B', `s1=${s1.ok} pendingDrop=${!findByBody(disk, 'ORDER_B_empty')}`);
      else fail('B', JSON.stringify({ s1, s2, cr, hasT: !!t }));
    }

    // ---- C: reply1 → reply2 → save ----
    {
      const phrase = 'ORDER_C_PHRASE_GAMMA';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_C_R1', 'ORDER_C_R2']);
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_C_R1');
      const bodies = t ? (t.comments || []).map((c) => c.body) : [];
      if (s.ok && bodies.includes('ORDER_C_R1') && bodies.includes('ORDER_C_R2')) pass('C', `n=${bodies.length}`);
      else fail('C', JSON.stringify({ s, cr, bodies }));
    }

    // ---- D: ann1+reply, ann2+reply, one save ----
    {
      const p1 = 'ORDER_D1_PHRASE';
      const p2 = 'ORDER_D2_PHRASE';
      await appendPhrase(page, p1);
      await appendPhrase(page, p2);
      const a = await createAnnReply(page, p1, ['ORDER_D1_R']);
      const b = await createAnnReply(page, p2, ['ORDER_D2_R']);
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const ok = s.ok && findByBody(disk, 'ORDER_D1_R') && findByBody(disk, 'ORDER_D2_R');
      if (ok) pass('D', `a=${a.threadId.slice(0, 8)} b=${b.threadId.slice(0, 8)}`);
      else fail('D', JSON.stringify({ s, a, b }));
    }

    // ---- E: ann → reply → autosave ----
    {
      const phrase = 'ORDER_E_PHRASE_EPS';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_E_R1']);
      const s = await forceAutosave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_E_R1');
      if (s.ok && t) pass('E', `via=${s.via}`);
      else fail('E', JSON.stringify({ s, cr, has: !!t }));
    }

    // ---- F: clean save → ann → reply → save ----
    {
      const s0 = await manualSave(page);
      const phrase = 'ORDER_F_PHRASE_ZETA';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_F_R1']);
      const s1 = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      if (s1.ok && findByBody(disk, 'ORDER_F_R1')) pass('F', `s0=${s0.ok}`);
      else fail('F', JSON.stringify({ s0, s1, cr }));
    }

    // ---- G: ann → reply → resolve → save ----
    {
      const phrase = 'ORDER_G_PHRASE_ETA';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_G_R1']);
      const resolved = await page.evaluate((tid) => {
        const M = window.__mdAnnotator;
        if (typeof M.toggleResolved === 'function') {
          M.toggleResolved(tid);
        } else {
          const th = (M.State.annotations || []).find((x) => x.threadId === tid);
          if (th) th.resolved = true;
          try { M.markDirty && M.markDirty(); } catch (_) {}
        }
        const th = (M.State.annotations || []).find((x) => x.threadId === tid);
        return !!(th && th.resolved);
      }, cr.threadId);
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_G_R1');
      if (s.ok && t && t.resolved) pass('G', `resolved=${resolved}`);
      else fail('G', JSON.stringify({ s, resolved, tRes: t && t.resolved }));
    }

    // ---- H: underscore phrase (turndown escapes) → reply → save ----
    {
      const phrase = 'ORDER_H_UNDER_SCORE_VAL';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_H_R1']);
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_H_R1');
      if (s.ok && t && cr.status === 'attached') pass('H', `mdRange=${!!cr.mdRange}`);
      else fail('H', JSON.stringify({ s, cr, has: !!t }));
    }

    // ---- I: rapid 5 replies → one save ----
    {
      const phrase = 'ORDER_I_PHRASE_IOTA';
      await appendPhrase(page, phrase);
      const bodies = ['ORDER_I_R1', 'ORDER_I_R2', 'ORDER_I_R3', 'ORDER_I_R4', 'ORDER_I_R5'];
      const cr = await createAnnReply(page, phrase, bodies);
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_I_R1');
      const nb = t ? (t.comments || []).length : 0;
      if (s.ok && nb >= 5) pass('I', `n=${nb}`);
      else fail('I', JSON.stringify({ s, cr, nb }));
    }

    // ---- J: save → reopen via /open bytes → comments present ----
    {
      const disk = await diskAnns(mentorPath);
      const must = ['ORDER_A_R1', 'ORDER_C_R2', 'ORDER_H_R1', 'ORDER_I_R5'];
      const missing = must.filter((b) => !findByBody(disk, b));
      await reloadFromDisk(page);
      await waitBound(page, 'orders.mentor');
      const liveBodies = await page.evaluate(() => {
        const out = [];
        for (const t of window.__mdAnnotator.State.annotations || []) {
          for (const c of t.comments || []) out.push(c.body);
        }
        return out;
      });
      const missLive = must.filter((b) => !liveBodies.includes(b));
      if (!missing.length && !missLive.length) pass('J', `disk+live ok`);
      else fail('J', JSON.stringify({ missing, missLive }));
    }

    // ---- K: edit existing reply body then save (if editComment exported) ----
    {
      const phrase = 'ORDER_K_PHRASE_KAPPA';
      await appendPhrase(page, phrase);
      const cr = await createAnnReply(page, phrase, ['ORDER_K_OLD']);
      const edited = await page.evaluate((tid) => {
        const M = window.__mdAnnotator;
        const th = (M.State.annotations || []).find((x) => x.threadId === tid);
        if (!th || !th.comments || !th.comments[0]) return { err: 'no comment' };
        // editComment(threadId, commentIndex, body) — index, not id
        let ok = false;
        if (typeof M.editComment === 'function') {
          ok = !!M.editComment(tid, 0, 'ORDER_K_NEW');
        } else {
          th.comments[0].body = 'ORDER_K_NEW';
          try { M.markDirty(); } catch (_) {}
          ok = true;
        }
        return { ok, body: th.comments[0].body };
      }, cr.threadId);
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t = findByBody(disk, 'ORDER_K_NEW');
      if (s.ok && t) pass('K', JSON.stringify(edited));
      else fail('K', JSON.stringify({ s, edited, has: !!t }));
    }

    // ---- L: reply then another ann on different text without intermediate save ----
    {
      const p1 = 'ORDER_L1_PHRASE';
      const p2 = 'ORDER_L2_PHRASE';
      await appendPhrase(page, p1);
      await appendPhrase(page, p2);
      await createAnnReply(page, p1, ['ORDER_L1_R']);
      await createAnnReply(page, p2, ['ORDER_L2_R']);
      // add second reply to first
      await page.evaluate(() => {
        const M = window.__mdAnnotator;
        const th = (M.State.annotations || []).find((x) => (x.comments || []).some((c) => c.body === 'ORDER_L1_R'));
        if (th) M.addReply(th.threadId, 'ORDER_L1_R2');
      });
      const s = await manualSave(page);
      const disk = await diskAnns(mentorPath);
      const t1 = findByBody(disk, 'ORDER_L1_R2');
      const t2 = findByBody(disk, 'ORDER_L2_R');
      if (s.ok && t1 && t2) pass('L', 'multi-thread multi-reply');
      else fail('L', JSON.stringify({ s, t1: !!t1, t2: !!t2 }));
    }

    // ---- M: stress 8 rounds alternating create/reply/save ----
    {
      let ok = true;
      const detail = [];
      for (let i = 0; i < 8; i++) {
        const phrase = `ORDER_M_ROUND_${i}_PHRASE`;
        await appendPhrase(page, phrase);
        const body = `ORDER_M_R_${i}`;
        const cr = await createAnnReply(page, phrase, [body]);
        const s = await manualSave(page);
        const disk = await diskAnns(mentorPath);
        const hit = !!findByBody(disk, body);
        detail.push({ i, save: s.ok, hit, status: cr.status });
        if (!s.ok || !hit || cr.status !== 'attached') ok = false;
      }
      if (ok) pass('M', '8/8');
      else fail('M', JSON.stringify(detail));
    }

  } finally {
    await browser.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== SUMMARY ===');
  console.log(`pass ${results.length - failed.length}/${results.length}`);
  for (const r of results) console.log(`${r.ok ? 'OK' : 'NO'} ${r.id} ${r.detail || ''}`);
  if (failed.length) process.exit(1);
  console.log('PASS e2e-ann-reply-save-orders');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
