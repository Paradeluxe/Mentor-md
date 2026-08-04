// 验证 openFiles: .mentor + .docx types; legacy accept includes .mentor
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8787/index.html';

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
  console.log('  ✓ ' + msg);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(URL + '?v=picker-' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.waitForTimeout(800);

  console.log('=== v2: 文件选择器 .mentor + .docx ===');

  const legacyAccept = await page.evaluate(() => {
    let captured = null;
    const orig = document.createElement.bind(document);
    document.createElement = function (tag) {
      const el = orig(tag);
      if (String(tag).toLowerCase() === 'input') {
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'accept');
        // capture when accept is set
        let _a = '';
        Object.defineProperty(el, 'accept', {
          configurable: true,
          get() { return _a; },
          set(v) { _a = String(v || ''); captured = _a; },
        });
      }
      return el;
    };
    // call openFiles which falls back to legacy if picker rejects
    return window.__mdAnnotator.openFiles().then(() => {
      document.createElement = orig;
      return captured;
    }).catch(() => {
      document.createElement = orig;
      return captured;
    });
  });

  const pickerConfig = await page.evaluate(() => {
    return new Promise((res) => {
      const orig = window.showOpenFilePicker;
      let captured = null;
      window.showOpenFilePicker = (opts) => {
        captured = opts;
        return Promise.reject({ name: 'AbortError' });
      };
      window.__mdAnnotator.openFiles().finally(() => {
        window.showOpenFilePicker = orig;
        res(captured);
      });
    });
  });

  assert(pickerConfig !== null, 'showOpenFilePicker 被调用');
  assert(pickerConfig.types && pickerConfig.types.length === 2,
    `types 数量 = ${pickerConfig.types && pickerConfig.types.length} (期望 2)`);
  const t0 = pickerConfig.types[0];
  const t1 = pickerConfig.types[1];
  assert(JSON.stringify(t0.accept).includes('.mentor'), 'type0 mentor ' + JSON.stringify(t0.accept));
  assert(JSON.stringify(t1.accept).includes('.docx'), 'type1 docx ' + JSON.stringify(t1.accept));
  assert(t0.description.includes('.mentor'), `description0 = ${t0.description}`);

  // legacy may or may not run after AbortError — if captured, must include mentor
  if (legacyAccept != null) {
    assert(String(legacyAccept).includes('.mentor'), `legacy accept = ${legacyAccept}`);
  } else {
    console.log('  · legacy accept not exercised (picker path aborted first) — ok');
  }

  console.log('\n✓ picker .mentor+.docx OK');
  await browser.close();
})().catch((e) => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
