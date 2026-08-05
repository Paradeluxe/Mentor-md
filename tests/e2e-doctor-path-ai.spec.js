/**
 * e2e: Doctor + disk path + AI preflight (standalone Playwright)
 * Run with mentor-server on :8787: node tests/e2e-doctor-path-ai.spec.js
 */
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const BASE = process.env.MENTOR_BASE || 'http://127.0.0.1:8787';
const DEMO = path.resolve(__dirname, '../examples/supervision-pet-demo.mentor');

async function main() {
  assert.ok(fs.existsSync(DEMO), 'demo mentor missing');
  const session = await (await fetch(BASE + '/session')).json();
  assert.ok(session.token, 'session token');
  const po = await (await fetch(BASE + '/pending-open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: session.token, path: DEMO }),
  })).json();
  assert.ok(po.ok, 'pending-open ' + JSON.stringify(po));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(BASE + '/index.html?v=doctor-e2e-' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 25000 });
  // Wait until pending-open finished binding abs path (not just editor ready)
  await page.waitForFunction(() => {
    const a = window.__mdAnnotator;
    if (!a) return false;
    const p = (a.resolveActiveMentorAbsPath && a.resolveActiveMentorAbsPath()) || a.State?.externalWatchPath || '';
    const name = a.State?.currentFile?.name || '';
    return /supervision-pet-demo\.mentor$/i.test(name) && /[\\/]/.test(p);
  }, { timeout: 25000 });

  const snap = await page.evaluate(async () => {
    const a = window.__mdAnnotator;
    const pathAbs = a.resolveActiveMentorAbsPath?.() || a.State.externalWatchPath || '';
    const fetchConn = a.fetchAiConnection || a.fetchHermesConnection;
    const ai = typeof fetchConn === 'function' ? await fetchConn({ warm: true, wait: 8 }) : null;
    await a.openDoctorPanel?.();
    await new Promise((r) => setTimeout(r, 800));
    const doctorBody = document.querySelector('#doctor-modal, #mentor-doctor, [data-doctor]')?.innerText
      || document.body.innerText;
    const ensure = typeof a.ensureDiskSavedForFixMentor === 'function'
      ? await a.ensureDiskSavedForFixMentor()
      : null;
    a.closeDoctorPanel?.();
    return {
      pathAbs,
      hermesState: ai && (ai.state || ai.connectionState),
      agentReady: !!(ai && ai.agentReady),
      doctorHasAbs: /磁盘路径|已关联|绝对/.test(doctorBody || ''),
      doctorText: (doctorBody || '').slice(0, 240),
      ensureOk: ensure && (ensure.ok === true || ensure.reason === 'ok' || ensure.status === 'ok' || ensure === true),
      ensure,
      anns: (a.State.annotations || []).length,
    };
  });

  console.log(JSON.stringify(snap, null, 2));
  assert.ok(snap.pathAbs, 'abs path after pending-open');
  assert.ok(snap.agentReady, 'Pi agentReady');
  assert.ok(snap.anns > 0, 'demo annotations loaded');
  if (snap.ensure && typeof snap.ensure === 'object') {
    assert.ok(snap.ensure.ok !== false, 'ensureDisk not hard-fail ' + JSON.stringify(snap.ensure));
  }
  assert.equal(errors.length, 0, 'pageerrors ' + errors.join(';'));
  await browser.close();
  console.log('PASS e2e-doctor-path-ai');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
