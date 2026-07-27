/**
 * Author display: empty name must not force 匿名 when id / current user name exists.
 */
const { chromium } = require('playwright');
const assert = require('assert');
const URL = 'http://127.0.0.1:8787/index.html?cb=' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, null, {
    timeout: 15000
  });

  const r = await page.evaluate(() => {
    const M = window.__mdAnnotator;
    try {
      localStorage.setItem('Mentor:authorPrompted', '1');
      const modal = document.getElementById('author-modal');
      if (modal) modal.classList.add('hidden');
    } catch (_) {}

    // force empty display name + stable id
    M.setAuthor({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: '' });
    const idShort = 'aaaaaaaa'; // 8 hex after strip dashes

    M.loadMarkdownIntoEditor('auth-name.md', '# Hello world\n\nbody', null, { documentId: 'auth-name-doc' });
    const ed = M.State.editor;
    // select "Hello"
    let from = -1, to = -1;
    ed.state.doc.descendants((n, pos) => {
      if (n.isText && n.text && n.text.includes('Hello') && from < 0) {
        const i = n.text.indexOf('Hello');
        from = pos + i;
        to = from + 5;
      }
    });
    ed.commands.setTextSelection({ from, to });
    const t = M.createTestAnnotation ? M.createTestAnnotation(from, to, 'Hello') : null;
    // fallback create via float path API
    if (!t && M._testCreateAnnotation) M._testCreateAnnotation(from, to, 'Hello');
    // ensure one thread with empty-name author payload
    if (!M.State.annotations.length) {
      M.State.annotations.push({
        threadId: 't-empty-name',
        text: 'Hello',
        prefix: '',
        suffix: '',
        resolved: false,
        createdAt: new Date().toISOString(),
        comments: [{ id: 'c1', author: { id: M.State.authorId, name: '' }, body: 'hi', createdAt: new Date().toISOString() }]
      });
    } else {
      // overwrite first comment author empty name
      const th = M.State.annotations[0];
      if (!th.comments || !th.comments.length) {
        th.comments = [{ id: 'c1', author: { id: M.State.authorId, name: '' }, body: 'hi', createdAt: new Date().toISOString() }];
      } else {
        th.comments[0].author = { id: M.State.authorId, name: '' };
        th.comments[0].body = th.comments[0].body || 'hi';
      }
    }
    M.renderCommentList();
    const emptyNameDisplay = document.querySelector('.comment-author')?.textContent?.trim();

    // set display name → same-id empty comments should show new name
    M.setAuthor('Alice Tester');
    M.renderCommentList();
    const afterName = document.querySelector('.comment-author')?.textContent?.trim();

    // foreign empty author with id → short id not 匿名
    M.State.annotations[0].comments[0].author = { id: 'ffffffff-1111-2222-3333-444444444444', name: '' };
    M.renderCommentList();
    const foreign = document.querySelector('.comment-author')?.textContent?.trim();

    // truly empty author → 匿名
    M.State.annotations[0].comments[0].author = { id: '', name: '' };
    M.renderCommentList();
    const anon = document.querySelector('.comment-author')?.textContent?.trim();

    return { emptyNameDisplay, afterName, foreign, anon, idShort, authorId: M.State.authorId };
  });

  console.log(JSON.stringify(r, null, 2));
  assert.notStrictEqual(r.emptyNameDisplay, '匿名', 'empty name + id must not show 匿名');
  assert.ok(r.emptyNameDisplay === r.idShort || r.emptyNameDisplay.length >= 4, 'should show short id: ' + r.emptyNameDisplay);
  assert.strictEqual(r.afterName, 'Alice Tester');
  assert.strictEqual(r.foreign, 'ffffffff');
  assert.strictEqual(r.anon, '匿名');
  console.log('PASS author-display');
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
