/**
 * chaos-ux shared harness — boot page, run cases, coverage counters.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { checkInvariants, dumpState } = require('./invariants');

const PORT = (() => {
  try {
    const p = fs.readFileSync(path.resolve(__dirname, '../../PORT'), 'utf-8').trim();
    const n = parseInt(p, 10);
    if (n > 0) return n;
  } catch {}
  return 8787;
})();

const URL_BASE = `http://127.0.0.1:${PORT}/index.html`;

class Coverage {
  constructor() {
    this.surfaces = Object.create(null);
    this.content = Object.create(null);
    this.actions = [];
  }
  hitSurface(id) {
    this.surfaces[id] = (this.surfaces[id] || 0) + 1;
  }
  hitContent(id) {
    this.content[id] = (this.content[id] || 0) + 1;
  }
  logAction(name, detail) {
    this.actions.push({ t: Date.now(), name, detail: detail || null });
    if (this.actions.length > 200) this.actions.shift();
  }
  report() {
    return {
      surfaces: { ...this.surfaces },
      content: { ...this.content },
      actionCount: this.actions.length,
      lastActions: this.actions.slice(-20),
    };
  }
}

async function launch() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page._chaosPageErrors = pageErrors;
  page._chaosCoverage = new Coverage();
  return { browser, context, page, pageErrors, coverage: page._chaosCoverage };
}

async function boot(page, { dismissAuthor = true } = {}) {
  await page.goto(URL_BASE + '?cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mdAnnotator?.State?.editor, { timeout: 20000 });
  if (dismissAuthor) {
    await page.evaluate(() => {
      try {
        localStorage.setItem('Mentor:author', 'chaos-tester');
        localStorage.setItem('Mentor:authorId', 'chaos-author-id');
      } catch {}
      if (window.__mdAnnotator?.State) {
        window.__mdAnnotator.State.author = 'chaos-tester';
        window.__mdAnnotator.State.authorId =
          window.__mdAnnotator.State.authorId || 'chaos-author-id';
      }
      const m = document.querySelector('#author-modal');
      if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
        m.style.pointerEvents = 'none';
      }
      // kill any late-opening first-time modal
      const chip = document.querySelector('#author-chip-name');
      if (chip && (!chip.textContent || chip.textContent === '未设置')) {
        chip.textContent = 'chaos-tester';
      }
    });
  }
  await page.waitForTimeout(100);
  // re-hide in case boot timer reopened modal
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) {
      m.classList.add('hidden');
      m.style.display = 'none';
      m.style.pointerEvents = 'none';
    }
  });
}

async function closeAll(browser, context) {
  try {
    await context.close();
  } catch {}
  try {
    await browser.close();
  } catch {}
}

/**
 * Mini test runner used by matrix specs.
 */
function createRunner(page, suiteName) {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const t = async (name, fn) => {
    try {
      await fn();
      // soft invariant after each case
      try {
        await checkInvariants(page);
      } catch (inv) {
        throw inv;
      }
      if (page._chaosPageErrors && page._chaosPageErrors.length) {
        const errs = page._chaosPageErrors.splice(0);
        throw new Error('pageerror: ' + errs.join(' | '));
      }
      console.log('  ✓', name);
      pass++;
    } catch (e) {
      console.log('  ✗', name + ':', e.message);
      fail++;
      failures.push({ name, err: e.message });
      try {
        const dump = await dumpState(page);
        console.log('    state:', JSON.stringify(dump));
      } catch {}
      // clear page errors so next case can run
      if (page._chaosPageErrors) page._chaosPageErrors.length = 0;
    }
  };
  const done = () => {
    console.log(`\n=== ${suiteName}: ${pass} pass / ${fail} fail ===`);
    return { pass, fail, failures };
  };
  return { t, done, get pass() { return pass; }, get fail() { return fail; } };
}

/** Load markdown into editor as a clean document fixture. */
async function loadDoc(page, name, md, annotations = null) {
  await page.evaluate(
    ({ name, md, annotations }) => {
      const M = window.__mdAnnotator;
      M.loadMarkdownIntoEditor(name, md, annotations, { saveMode: 'mentor-download' });
    },
    { name, md, annotations }
  );
}

/** Select first occurrence of needle in doc and create annotation. */
async function annotateText(page, needle, { ai = false, body = null } = {}) {
  return page.evaluate(
    ({ needle, ai, body }) => {
      const M = window.__mdAnnotator;
      const doc = M.State.editor.state.doc;
      let from = -1;
      let to = -1;
      doc.descendants((node, pos) => {
        if (from >= 0) return false;
        if (node.isText && node.text && node.text.includes(needle)) {
          const i = node.text.indexOf(needle);
          from = pos + i;
          to = from + needle.length;
        }
      });
      if (from < 0) return { ok: false, err: 'needle not found: ' + needle };
      M.State.editor.commands.setTextSelection({ from, to });
      M.createAnnotationFromSelection();
      const tid = M.State.activeThreadId;
      if (body != null && tid) {
        const thr = M.State.annotations.find((a) => a.threadId === tid);
        // submit first comment if API path: set draft + click is heavy; use direct for fixture speed
        if (thr && (!thr.comments || thr.comments.length === 0)) {
          const author = {
            id: M.State.authorId || 'chaos-author-id',
            name: M.State.author || 'chaos-tester',
          };
          thr.comments = thr.comments || [];
          thr.comments.push({
            id: crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now(),
            author,
            body,
            createdAt: new Date().toISOString(),
          });
          const type = M.getMarkerType?.(body);
          if (type) thr.threadType = type;
          else delete thr.threadType;
          delete M.State.replyDrafts[tid];
          if (M.renderCommentList) M.renderCommentList();
          if (M.markDirty) M.markDirty();
        }
      }
      return {
        ok: true,
        tid,
        draft: M.State.replyDrafts[tid],
        count: M.State.annotations.length,
        body: M.State.annotations.find((a) => a.threadId === tid)?.comments?.[0]?.body || '',
      };
    },
    { needle, ai, body }
  );
}

async function clickSel(page, selector, surfaceId) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) throw new Error('missing ' + selector);
  await loc.click({ force: true, timeout: 5000 }).catch(async () => {
    // some buttons need to be visible — try evaluate click
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('missing ' + sel);
      el.click();
    }, selector);
  });
  if (surfaceId && page._chaosCoverage) page._chaosCoverage.hitSurface(surfaceId);
  if (page._chaosCoverage) page._chaosCoverage.logAction('click', selector);
}

module.exports = {
  PORT,
  URL_BASE,
  Coverage,
  launch,
  boot,
  closeAll,
  createRunner,
  loadDoc,
  annotateText,
  clickSel,
  checkInvariants,
  dumpState,
};
