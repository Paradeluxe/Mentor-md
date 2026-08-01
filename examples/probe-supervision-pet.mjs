/**
 * Live probe: pending-open a .mentor → write sidecar → assert owl pet in DOM.
 * Run: node examples/probe-supervision-pet.mjs
 * Requires mentor-server on PORT (default 8787). Deep-link ?open= removed.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(fs.readFileSync(path.join(ROOT, 'PORT'), 'utf8').trim() || '8787');
const TOKEN = fs.readFileSync(path.join(ROOT, '.mentor-session'), 'utf8').trim();
const MENTOR = path.join(ROOT, 'examples', 'supervision-pet-demo.mentor');
const SIDECAR = MENTOR + '.supervision.json';
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', '_pet_demo_meta.json'), 'utf8'));
const TID = META.threadIds[0];

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
    tool: 'probe-supervision-pet',
    lockMode: 'pending-paragraphs',
    pendingThreadIds: [TID],
    processedThreadIds: [],
    currentThreadId: TID,
    message: 'probe · pet should appear',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  fs.writeFileSync(SIDECAR, JSON.stringify(body, null, 2) + '\n', 'utf8');
}

async function queuePendingOpen() {
  const r = await fetch(`http://127.0.0.1:${PORT}/pending-open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, path: MENTOR }),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error('pending-open failed: ' + JSON.stringify(j));
  return j;
}

function openUrl() {
  // Word-style only: clean shell; file comes from pending-open queue.
  return `http://127.0.0.1:${PORT}/index.html?v=${Date.now()}`;
}

async function snap(page, label) {
  const out = await page.evaluate(() => {
    const pet = document.querySelector('.supervision-pet');
    const banner = document.getElementById('supervision-banner');
    const signal = document.getElementById('supervision-signal');
    const s = window.__mdAnnotator?.getSupervisionState?.() || null;
    const marks = [];
    try {
      const view = window.__mdAnnotator?.editor?.view;
      const doc = view?.state?.doc;
      const markType = view?.state?.schema?.marks?.annotation;
      if (doc && markType) {
        doc.descendants((node, pos) => {
          const m = markType.isInSet(node.marks || []);
          if (m) marks.push({ tid: m.attrs?.threadId || m.attrs?.id, text: node.text?.slice(0, 40) });
        });
      }
    } catch (e) {
      marks.push({ err: String(e) });
    }
    return {
      title: document.title,
      bodyActive: document.body.classList.contains('supervision-active'),
      bannerHidden: banner ? banner.classList.contains('hidden') : null,
      bannerText: banner?.textContent?.trim()?.slice(0, 120) || '',
      signalPhase: signal?.getAttribute('data-phase') || signal?.dataset?.phase || null,
      signalHealth: signal?.getAttribute('data-health') || null,
      pet: !!pet,
      petLabel: pet?.textContent?.trim()?.slice(0, 80) || '',
      petCount: document.querySelectorAll('.supervision-pet').length,
      state: s,
      externalPath: window.__mdAnnotator?.getExternalWatchPath?.()
        || window.__mdAnnotator?.externalWatchPath
        || null,
      externalTokenSet: !!(window.__mdAnnotator?.getExternalWatchToken?.()
        || window.__mdAnnotator?.externalWatchToken),
      markCount: marks.length,
      markSample: marks.slice(0, 6),
      poller: !!window.__mdAnnotator?.getSupervisionPoller
        || !!window.__mdAnnotator?._supervisionPoller,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  writeSidecar(false);
  const queued = await queuePendingOpen();
  const url = openUrl();
  console.log('PORT', PORT);
  console.log('MENTOR', MENTOR);
  console.log('TID', TID);
  console.log('pending-open', queued);
  console.log('URL', url);

  // preflight APIs (internal /open still used after pending sets allowlist)
  const openRes = await fetch(
    `http://127.0.0.1:${PORT}/open?path=${encodeURIComponent(MENTOR)}&token=${encodeURIComponent(TOKEN)}`
  );
  console.log('GET /open', openRes.status, openRes.headers.get('content-length'));
  const reg = await (await fetch(`http://127.0.0.1:${PORT}/supervision/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, path: MENTOR }),
  })).json();
  console.log('POST supervision/register', reg);
  const sup0 = await (await fetch(
    `http://127.0.0.1:${PORT}/supervision?path=${encodeURIComponent(MENTOR)}&token=${encodeURIComponent(TOKEN)}`
  )).json();
  console.log('GET /supervision before', sup0);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (/supervis|poll|external|open|launch|pending/i.test(msg.text())) {
      console.log('console:', msg.type(), msg.text().slice(0, 200));
    }
  });
  page.on('pageerror', (e) => console.log('pageerror', e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  // wait for editor + annotations
  await page.waitForFunction(() => !!window.__mdAnnotator?.editor, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const a0 = await snap(page, 'after pending-open load (no sidecar)');

  // Write sidecar while page open
  writeSidecar(true);
  const sup1 = await (await fetch(
    `http://127.0.0.1:${PORT}/supervision?path=${encodeURIComponent(MENTOR)}&token=${encodeURIComponent(TOKEN)}`
  )).json();
  console.log('GET /supervision active', sup1);

  // poll every 1s; wait up to 5s
  let a1 = null;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    a1 = await snap(page, `poll tick ${i + 1}`);
    if (a1.pet && a1.bodyActive) break;
  }

  // Force-apply path (isolates editor vs poller)
  const force = await page.evaluate((tid) => {
    window.__mdAnnotator.applySupervisionPayload({
      v: 1,
      active: true,
      phase: 'working',
      health: 'ok',
      pendingThreadIds: [tid],
      currentThreadId: tid,
      message: 'force apply',
      lockMode: 'pending-paragraphs',
    }, { force: true });
    return window.__mdAnnotator.getSupervisionState?.();
  }, TID);
  console.log('force state', force);
  await page.waitForTimeout(100);
  const a2 = await snap(page, 'after force applySupervisionPayload');

  const shot = path.join(ROOT, 'examples', '_pet_demo_shot.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log('screenshot', shot);

  writeSidecar(false);
  await page.waitForTimeout(1200);
  const a3 = await snap(page, 'after end (sidecar deleted)');

  await browser.close();

  const report = {
    deepLinkHadExternalPath: !!(a0.externalPath || a1?.externalPath),
    deepLinkTokenSet: !!(a0.externalTokenSet || a1?.externalTokenSet),
    marksAfterLoad: a0.markCount,
    petViaPoll: !!(a1 && a1.pet),
    petViaForce: !!(a2 && a2.pet),
    bannerViaPoll: !!(a1 && a1.bodyActive && a1.bannerHidden === false),
    pollState: a1?.state || null,
    forceState: a2?.state || null,
    cleaned: a3 ? (!a3.pet && (a3.bannerHidden === true || !a3.bodyActive)) : null,
  };
  console.log('\n=== REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(ROOT, 'examples', '_pet_demo_report.json'),
    JSON.stringify({ report, a0, a1, a2, a3, sup1 }, null, 2),
    'utf8'
  );

  if (!report.petViaForce) {
    console.error('FAIL: editor cannot show pet even with force apply (mark/payload bug)');
    process.exit(2);
  }
  if (!report.deepLinkHadExternalPath || !report.deepLinkTokenSet) {
    console.error('FAIL: pending-open did not set external watch path/token — poll path broken');
    process.exit(3);
  }
  if (!report.petViaPoll) {
    console.error('FAIL: poll path did not show pet (server/poller/sidecar)');
    process.exit(4);
  }
  console.log('PASS: pet visible via poll and force');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  try { writeSidecar(false); } catch {}
  process.exit(1);
});
