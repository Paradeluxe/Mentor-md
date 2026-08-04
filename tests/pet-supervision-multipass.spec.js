/**
 * Multipass UX test for Mentor supervision pet (小机器人).
 * Run: node tests/pet-supervision-multipass.spec.js
 * Needs mentor-server :8787
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number((fs.readFileSync(path.join(ROOT, 'PORT'), 'utf8').trim()) || '8787');
const BASE = `http://127.0.0.1:${PORT}`;
const MENTOR = path.join(ROOT, 'examples', 'supervision-pet-demo.mentor');
const SIDECAR = MENTOR + '.supervision.json';
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', '_pet_demo_meta.json'), 'utf8'));
const TIDS = META.threadIds;
const PASSES = Number(process.env.PASSES || 3);

function assert(cond, msg, info) {
  if (!cond) throw new Error(msg + (info ? ' ' + JSON.stringify(info).slice(0, 400) : ''));
}

async function sessionToken() {
  const j = await (await fetch(BASE + '/session')).json();
  return j.token;
}

async function pendingOpen(token) {
  const r = await fetch(BASE + '/pending-open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, path: MENTOR }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error('pending-open ' + JSON.stringify(j));
  await fetch(BASE + '/supervision/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, path: MENTOR }),
  });
}

function writeSidecar(active, extra = {}) {
  if (!active) {
    try { fs.unlinkSync(SIDECAR); } catch {}
    return;
  }
  const body = {
    v: 1,
    active: true,
    phase: 'working',
    health: 'ok',
    tool: 'pet-multipass',
    lockMode: 'pending-paragraphs',
    pendingThreadIds: [TIDS[0]],
    processedThreadIds: [],
    currentThreadId: TIDS[0],
    message: 'pet multipass working',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  fs.writeFileSync(SIDECAR, JSON.stringify(body, null, 2) + '\n', 'utf8');
}

async function waitEditor(page) {
  await page.waitForFunction(
    () => !!(window.__mdAnnotator?.State?.editor),
    null,
    { timeout: 25000 }
  );
}

async function snap(page) {
  return page.evaluate(() => {
    const pet = document.querySelector('.ProseMirror .supervision-pet');
    const banner = document.getElementById('supervision-banner');
    const signal = document.getElementById('supervision-signal');
    const s = window.__mdAnnotator?.getSupervisionState?.() || null;
    const marks = [];
    try {
      const ed = window.__mdAnnotator.State.editor;
      const mt = ed.schema.marks.annotation;
      ed.state.doc.descendants((node) => {
        const m = mt.isInSet(node.marks || []);
        if (m) marks.push(String(m.attrs.threadId || ''));
      });
    } catch (_) {}
    return {
      pet: !!pet,
      petPhase: pet ? [...pet.classList].find((c) => c.startsWith('is-')) || '' : '',
      petLabel: pet?.querySelector('.supervision-pet-label')?.textContent?.trim() || pet?.textContent?.trim()?.slice(0, 60) || '',
      petCount: document.querySelectorAll('.ProseMirror .supervision-pet').length,
      bodyActive: document.body.classList.contains('supervision-active'),
      bannerHidden: banner ? banner.classList.contains('hidden') : true,
      bannerText: banner?.textContent?.trim()?.slice(0, 100) || '',
      signalPhase: signal?.getAttribute('data-phase') || '',
      signalHealth: signal?.getAttribute('data-health') || '',
      signalTitle: signal?.getAttribute('title') || '',
      state: s,
      markCount: marks.length,
      markIds: [...new Set(marks)].slice(0, 8),
      activeCard: document.querySelector('.comment-thread.is-active')?.getAttribute('data-thread') || '',
      path: window.__mdAnnotator?.resolveActiveMentorAbsPath?.() || '',
    };
  });
}

async function waitPet(page, want = true, ms = 8000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    last = await snap(page);
    if (!!last.pet === want && (!want || last.bodyActive)) return last;
    await page.waitForTimeout(400);
  }
  return last;
}

async function runPass(browser, pass) {
  const token = await sessionToken();
  fs.writeFileSync(path.join(ROOT, '.mentor-session'), token, 'utf8');
  writeSidecar(false);
  await pendingOpen(token);

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

  await page.goto(`${BASE}/index.html?v=pet-mp-${pass}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await waitEditor(page);
  // marks may load async from mentor zip
  for (let i = 0; i < 20; i++) {
    const s = await snap(page);
    if (s.markCount > 0 && s.path) break;
    await page.waitForTimeout(300);
  }
  let s0 = await snap(page);
  assert(s0.markCount > 0, `P${pass} demo has annotation marks`, s0);
  assert(!!s0.path, `P${pass} external path after pending-open`, s0);
  assert(!s0.pet, `P${pass} no pet before sidecar`, s0);

  // 1) working → pet
  writeSidecar(true, { phase: 'working', currentThreadId: TIDS[0], pendingThreadIds: [TIDS[0]], message: 'working on first' });
  let s1 = await waitPet(page, true, 10000);
  assert(s1.pet, `P${pass} pet via poll working`, s1);
  assert(s1.bodyActive, `P${pass} body supervision-active`, s1);
  assert(s1.signalPhase === 'working' || s1.state?.phase === 'working', `P${pass} phase working`, s1);
  assert(s1.petCount === 1, `P${pass} single pet`, s1);

  // 2) switch current thread
  if (TIDS[1]) {
    writeSidecar(true, {
      phase: 'working',
      currentThreadId: TIDS[1],
      pendingThreadIds: [TIDS[0], TIDS[1]],
      message: 'switch current',
    });
    await page.waitForTimeout(1500);
    const s2 = await snap(page);
    assert(s2.pet, `P${pass} pet after switch`, s2);
    // current should track
    assert(
      !s2.state?.currentThreadId || s2.state.currentThreadId === TIDS[1],
      `P${pass} currentThread updated`,
      s2.state
    );
  }

  // 3) waiting phase
  writeSidecar(true, {
    phase: 'waiting',
    health: 'ok',
    currentThreadId: TIDS[0],
    pendingThreadIds: [TIDS[0]],
    message: 'waiting user',
  });
  await page.waitForTimeout(1500);
  const s3 = await snap(page);
  assert(s3.pet, `P${pass} pet waiting`, s3);
  assert(
    s3.petPhase.includes('waiting') || s3.signalPhase === 'waiting' || s3.state?.phase === 'waiting',
    `P${pass} waiting class/signal`,
    s3
  );

  // 4) degraded
  writeSidecar(true, {
    phase: 'working',
    health: 'degraded',
    error: 'probe-degraded',
    currentThreadId: TIDS[0],
    pendingThreadIds: [TIDS[0]],
    message: 'degraded path',
  });
  await page.waitForTimeout(1500);
  const s4 = await snap(page);
  assert(s4.pet, `P${pass} pet degraded still shown`, s4);
  assert(
    s4.signalHealth === 'degraded' || s4.state?.health === 'degraded' || /degraded|异常/.test(s4.signalTitle + s4.bannerText),
    `P${pass} degraded signal`,
    s4
  );

  // 5) force apply still works
  const force = await page.evaluate((tid) => {
    window.__mdAnnotator.applySupervisionPayload({
      v: 1,
      active: true,
      phase: 'working',
      health: 'ok',
      pendingThreadIds: [tid],
      currentThreadId: tid,
      message: 'force',
      lockMode: 'pending-paragraphs',
    }, { force: true });
    return {
      state: window.__mdAnnotator.getSupervisionState?.(),
      pet: !!document.querySelector('.ProseMirror .supervision-pet'),
    };
  }, TIDS[0]);
  assert(force.pet, `P${pass} force apply pet`, force);

  // 6) click signal → should not throw; prefer scroll
  await page.evaluate(() => {
    document.getElementById('supervision-signal')?.click();
  });
  await page.waitForTimeout(200);

  // 7) end supervision — sidecar gone
  writeSidecar(false);
  let sEnd = await waitPet(page, false, 10000);
  assert(!sEnd.pet, `P${pass} pet cleared after end`, sEnd);
  assert(!sEnd.bodyActive || sEnd.bannerHidden, `P${pass} banner/body off`, sEnd);

  assert(pageErrors.length === 0, `P${pass} no pageerrors`, pageErrors);
  await page.close();
  return { pass, ok: true, marks: s0.markCount };
}

(async () => {
  writeSidecar(false);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let failed = 0;
  try {
    for (let i = 1; i <= PASSES; i++) {
      try {
        const r = await runPass(browser, i);
        results.push(r);
        console.log('PASS', i, 'marks=' + r.marks);
      } catch (e) {
        failed++;
        results.push({ pass: i, ok: false, error: e.message });
        console.log('FAIL', i, e.message);
        writeSidecar(false);
      }
    }
  } finally {
    writeSidecar(false);
    await browser.close();
  }
  const out = { PASSES, failed, results };
  fs.writeFileSync(path.join(ROOT, 'examples', '_pet_multipass_report.json'), JSON.stringify(out, null, 2));
  console.log('---');
  console.log(JSON.stringify(out, null, 2));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  try { writeSidecar(false); } catch {}
  process.exit(2);
});
