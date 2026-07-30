/**
 * Cross-page live sync: election + content + takeover + write guard.
 * Requires Mentor static server on 8787.
 */
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.MENTOR_URL || 'http://127.0.0.1:8787/index.html';
const stamp = Date.now();

async function waitEditor(page) {
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State && window.__mdAnnotator.State.editor, {
    timeout: 15000
  });
}

async function loadDoc(page, name, content, documentId) {
  await page.evaluate(({ name, content, documentId }) => {
    // dismiss first-run author modal if present
    try {
      localStorage.setItem('Mentor:author', 'LiveSyncTester');
      localStorage.setItem('Mentor:authorId', 'live-sync-tester');
      if (window.__mdAnnotator && window.__mdAnnotator.State) {
        window.__mdAnnotator.State.author = 'LiveSyncTester';
        window.__mdAnnotator.State.authorId = 'live-sync-tester';
      }
      const modal = document.getElementById('author-modal');
      if (modal) modal.classList.add('hidden');
    } catch (_) {}
    window.__mdAnnotator.loadMarkdownIntoEditor(name, content, null, { documentId });
  }, { name, content, documentId });
  // wait live-sync settle
  await page.waitForTimeout(700);
}

async function getRole(page) {
  return page.evaluate(() => {
    const s = window.__mdAnnotator.getLiveSyncState();
    return {
      role: s.role,
      key: s.documentKey,
      editable: window.__mdAnnotator.State.editor.isEditable,
      readOnly: window.__mdAnnotator.State.readOnlyMode,
      text: window.__mdAnnotator.State.editor.state.doc.textContent
    };
  });
}

async function openSharedPair(browser, docId, body) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const url = `${BASE}?live=${stamp}-${docId}`;
  await a.goto(url);
  await b.goto(url);
  await waitEditor(a);
  await waitEditor(b);
  const name = `${docId}.md`;
  await loadDoc(a, name, body, docId);
  await loadDoc(b, name, body, docId);
  await a.waitForTimeout(900);
  let ra = await getRole(a);
  let rb = await getRole(b);
  // poll until roles settle
  for (let i = 0; i < 20; i++) {
    ra = await getRole(a);
    rb = await getRole(b);
    const roles = [ra.role, rb.role];
    if (roles.includes('owner') && roles.includes('follower')) break;
    await a.waitForTimeout(200);
  }
  const owner = ra.role === 'owner' ? a : b;
  const follower = ra.role === 'follower' ? a : b;
  return { ctx, a, b, owner, follower, ra, rb };
}

(async () => {
  let pass = 0;
  const t = (name) => {
    console.log('  ✓', name);
    pass++;
  };

  const browser = await chromium.launch({ headless: true });
  console.log('=== e2e-cross-tab-live-sync ===');

  // --- Election ---
  {
    const { ctx, owner, follower, a, b } = await openSharedPair(browser, 'live-election-doc', '# Shared\n');
    const roles = [await getRole(a), await getRole(b)];
    assert.strictEqual(roles.filter((s) => s.role === 'owner').length, 1, 'exactly one owner: ' + JSON.stringify(roles));
    assert.strictEqual(roles.filter((s) => s.role === 'follower').length, 1, 'exactly one follower');
    assert.strictEqual(roles[0].key, roles[1].key);
    t('election: one owner + one follower');

    // different document stays owner alone
    const c = await ctx.newPage();
    await c.goto(`${BASE}?live-other=${stamp}`);
    await waitEditor(c);
    await loadDoc(c, 'other.md', '# Other\n', 'other-doc-key');
    await c.waitForTimeout(600);
    const rc = await getRole(c);
    assert.strictEqual(rc.role, 'owner', 'other doc should be sole owner');
    t('election: different document isolated as owner');
    await ctx.close();
  }

  // --- Content mirror ---
  {
    const { ctx, owner, follower } = await openSharedPair(browser, 'live-content-doc', '# Alpha\n');
    await owner.evaluate(() => {
      const ed = window.__mdAnnotator.State.editor;
      ed.commands.setTextSelection(ed.state.doc.content.size);
      ed.commands.insertContent(' BETA');
    });
    await follower.waitForFunction(
      () => window.__mdAnnotator.State.editor.state.doc.textContent.includes('BETA'),
      null,
      { timeout: 3000 }
    );
    const fr = await getRole(follower);
    assert.ok(fr.text.includes('BETA'));
    assert.strictEqual(fr.editable, false);
    assert.strictEqual(fr.role, 'follower');
    const hist = await follower.evaluate(() => window.__mdAnnotator.State.history.past.length);
    assert.strictEqual(hist, 0, 'follower history must stay empty');
    t('content: follower mirrors owner text');
    await ctx.close();
  }

  // --- Takeover + reverse sync ---
  {
    const { ctx, owner, follower } = await openSharedPair(browser, 'takeover-doc', '# Before\n');
    const banner = follower.locator('#live-sync-banner');
    await banner.waitFor({ state: 'visible', timeout: 3000 });
    const btxt = await follower.locator('#live-sync-text').textContent();
    assert.ok(btxt.includes('实时查看'), 'banner text: ' + btxt);
    t('banner: follower shows 实时查看');

    // click may be blocked by author modal; prefer API + UI path
    await follower.evaluate(() => {
      const modal = document.getElementById('author-modal');
      if (modal) modal.classList.add('hidden');
      window.__mdAnnotator.takeOverLiveEditing();
    });
    await follower.waitForFunction(() => window.__mdAnnotator.getLiveSyncState().role === 'owner', null, {
      timeout: 3000
    });
    await owner.waitForFunction(() => window.__mdAnnotator.getLiveSyncState().role === 'follower', null, {
      timeout: 3000
    });
    t('takeover: roles reverse');

    await follower.evaluate(() => {
      window.__mdAnnotator.State.editor.commands.insertContent(' AFTER');
    });
    await owner.waitForFunction(
      () => window.__mdAnnotator.State.editor.state.doc.textContent.includes('AFTER'),
      null,
      { timeout: 3000 }
    );
    assert.strictEqual((await getRole(follower)).editable, true);
    assert.strictEqual((await getRole(owner)).editable, false);
    t('takeover: reverse content sync');

    // write guard with fake handles
    const writes = await Promise.all(
      [owner, follower].map((page) =>
        page.evaluate(async () => {
          const M = window.__mdAnnotator;
          let count = 0;
          M.State.currentFile = M.State.currentFile || { name: 'takeover-doc.md' };
          M.State.currentFile.handle = {
            name: 'takeover-doc.md',
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
            getFile: async () => ({ lastModified: Date.now(), name: 'takeover-doc.md' }),
            createWritable: async () => ({
              write: async () => {
                count++;
              },
              close: async () => {}
            })
          };
          M.State.saveMode = 'handle';
          const r = await M.writeCurrentToHandle({ reason: 'manual' });
          return { count, ok: r && r.ok, err: r && r.error, role: M.getLiveSyncState().role };
        })
      )
    );
    const ownerWrite = writes.find((w) => w.role === 'owner');
    const followerWrite = writes.find((w) => w.role === 'follower');
    assert.ok(ownerWrite, 'has owner write result');
    assert.ok(followerWrite, 'has follower write result');
    // follower must not write
    assert.strictEqual(followerWrite.count, 0, 'follower writes: ' + JSON.stringify(writes));
    t('write guard: follower cannot write');
    await ctx.close();
  }

  // --- Annotations ---
  {
    const { ctx, owner, follower } = await openSharedPair(browser, 'live-ann-doc', '# Hello world annotation\n');
    await owner.evaluate(() => {
      const M = window.__mdAnnotator;
      const tid = 'live-thread-1';
      M.State.annotations = [
        {
          threadId: tid,
          text: 'Hello',
          prefix: '',
          suffix: '',
          resolved: false,
          createdAt: new Date().toISOString(),
          range: { from: 1, to: 6 },
          comments: [
            {
              id: 'c1',
              author: 'Test',
              authorId: 't',
              body: 'sync-me-please',
              createdAt: new Date().toISOString()
            }
          ]
        }
      ];
      try {
        M.rebuildAnnotationMarks();
      } catch (_) {}
      try {
        M.renderCommentList();
      } catch (_) {}
      // trigger onUpdate → markDirty → live publish
      const ed = M.State.editor;
      ed.commands.setTextSelection(ed.state.doc.content.size);
      ed.commands.insertContent(' !');
    });
    await follower.waitForFunction(
      () => {
        const anns = window.__mdAnnotator.State.annotations || [];
        return anns.some((a) => a && a.threadId === 'live-thread-1' && (a.comments || []).some((c) => c.body === 'sync-me-please'));
      },
      null,
      { timeout: 4000 }
    );
    t('annotations: reply body mirrors to follower');
    await ctx.close();
  }

  // --- Recovery: out-of-order inject ---
  {
    const { ctx, follower } = await openSharedPair(browser, 'live-order-doc', '# Base\n');
    await follower.evaluate(() => {
      const M = window.__mdAnnotator;
      const st = M.getLiveSyncState();
      const key = st.documentKey;
      // higher lease than current owner so inject is accepted
      const lease = { term: (st.lease.term || 0) + 10, ownerId: 'remote-owner' };
      // newer first
      M.__injectLiveMessageForTest({
        schema: 1,
        type: 'state',
        documentKey: key,
        instanceId: 'remote-owner',
        lease,
        seq: 9,
        state: {
          pm: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NEWER' }] }] },
          annotations: [],
          references: { version: 1, sourceName: '', sourceFormat: '', entries: [] },
          file: { documentId: 'live-order-doc', name: 'live-order-doc.md', dirty: true, dirtyGen: 1 },
          mediaRevision: ''
        }
      });
      M.__injectLiveMessageForTest({
        schema: 1,
        type: 'state',
        documentKey: key,
        instanceId: 'remote-owner',
        lease,
        seq: 8,
        state: {
          pm: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'OLDER' }] }] },
          annotations: [],
          references: { version: 1, sourceName: '', sourceFormat: '', entries: [] },
          file: { documentId: 'live-order-doc', name: 'live-order-doc.md', dirty: true, dirtyGen: 1 },
          mediaRevision: ''
        }
      });
    });
    await follower.waitForTimeout(400);
    const text = await follower.evaluate(() => window.__mdAnnotator.State.editor.state.doc.textContent);
    assert.ok(text.includes('NEWER'), 'text=' + text);
    assert.ok(!text.includes('OLDER'), 'must not roll back: ' + text);
    t('recovery: out-of-order seq cannot roll back');
    await ctx.close();
  }


  // --- External watch ownership (owner on, follower off) ---
  {
    const { ctx, owner, follower } = await openSharedPair(browser, 'live-ext-watch-doc', '# Watch\n');
    await owner.evaluate(async () => {
      const M = window.__mdAnnotator;
      const blob = new Blob(['# Watch\n'], { type: 'text/markdown' });
      const file = new File([blob], 'live-ext-watch-doc.md', { type: 'text/markdown', lastModified: Date.now() });
      const handle = {
        name: file.name,
        kind: 'file',
        async getFile() { return file; },
      };
      M.State.currentFile.handle = handle;
      await M.startExternalWatchForCurrentDocument();
    });
    await owner.waitForTimeout(300);
    const ownerMode = await owner.evaluate(() => window.__mdAnnotator.getExternalWatchState().mode);
    const followerMode = await follower.evaluate(() => window.__mdAnnotator.getExternalWatchState().mode);
    assert.notEqual(ownerMode, 'off', 'owner mode=' + ownerMode);
    assert.equal(followerMode, 'off', 'follower mode=' + followerMode);
    t('external watch: owner only');
    await ctx.close();
  }

  await browser.close();
  console.log('\n=== RESULT:', pass, 'pass / 0 fail ===');
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
