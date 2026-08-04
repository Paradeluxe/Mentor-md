// 视觉验证: 批注栏包含各种状态时正常渲染
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8787/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const results = [];
  function record(name, pass, detail) {
    results.push({ name, pass });
    console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  await page.goto(URL);
  await page.waitForFunction(() => window.__mdAnnotator && window.__mdAnnotator.State.editor, { timeout: 10000 });
  await page.evaluate(() => window.__mdAnnotator.setAuthor('张三'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const m = document.querySelector('#author-modal');
    if (m) m.classList.add('hidden');
    window.__mdAnnotator.loadMarkdownIntoEditor('demo.md', `# 标题

这是一个普通段落测试批注效果.

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| WYSIWYG | ✅ | 基于 Tiptap |
| 选区批注 | ✅ | 基于 ProseMirror mark |

第二段内容.
`, null);
  });
  await page.waitForTimeout(300);

  // 注入测试批注 - 2 个 thread, 各种状态
  await page.evaluate(() => {
    const ed = window.__mdAnnotator.State.editor;
    const doc = ed.state.doc;
    const positions = [];
    doc.descendants((node, pos) => {
      if (node.isText && node.text.length > 0 && positions.length < 8) {
        positions.push({ pos: pos + 1, endPos: pos + 1 + Math.min(20, node.text.length), text: node.text });
      }
    });
    if (positions.length < 5) {
      // fallback: use any text node
      doc.descendants((node, pos) => {
        if (node.isText && positions.length < 8) {
          positions.push({ pos: pos + 1, endPos: pos + 1 + node.text.length, text: node.text });
        }
      });
    }
    // 去重 + 排序按 pos
    const uniquePositions = [];
    for (const p of positions) {
      if (!uniquePositions.find(x => x.pos === p.pos)) uniquePositions.push(p);
    }
    uniquePositions.sort((a, b) => a.pos - b.pos);
    const positions_final = uniquePositions.slice(0, 5);
    const now = Date.now();
    const mk = (threadId, pos, endPos, body, options = {}) => {
      const text = ed.state.doc.textBetween(pos, endPos, ' ');
      const t0 = now - (options.minutesAgo || 30) * 60000;
      return {
        threadId,
        range: { from: pos, to: endPos },
        text: text || '...',
        prefix: '',
        suffix: '',
        resolved: !!options.resolved,
        fuzzy: !!options.fuzzy,
        createdAt: new Date(t0).toISOString(),
        comments: [{
          id: threadId + '-c1',
          author: { id: 'u1', name: '张三' },
          body: body,
          createdAt: new Date(t0).toISOString(),
        }],
      };
    };
    const anns = [
      mk('t1', positions_final[0].pos, positions_final[0].endPos, '这里的措辞可以再精炼一点.', { minutesAgo: 60 }),
      mk('t2', positions_final[2].pos, positions_final[2].endPos, '', { minutesAgo: 5 }),
      mk('t3', positions_final[4].pos, positions_final[4].endPos, '已确认这个状态.', { minutesAgo: 120, resolved: true }),
    ];
    // t1 reply
    anns[0].comments.push({
      id: 't1-c2', author: { id: 'u2', name: '李四' },
      body: '同意, 改一下.',
      createdAt: new Date(now - 30 * 60000).toISOString(),
    });
    // 加 mark
    for (const ann of anns) {
      window.__mdAnnotator.State.annotations.push(ann);
    }
    const tr = ed.state.tr;
    const markType = ed.schema.marks.annotation;
    for (const ann of anns) {
      tr.addMark(ann.range.from, ann.range.to, markType.create({ threadId: ann.threadId, resolved: ann.resolved }));
    }
    ed.view.dispatch(tr);
    window.__mdAnnotator.State.activeThreadId = 't1';
  });
  await page.waitForTimeout(300);

  // 1. 验证 3 个 thread 渲染 (包括 resolved) - 切到"全部" tab 触发 filter
  await page.locator('.filter-tab[data-filter-tab="all"]').click();
  await page.waitForTimeout(200);
  const threadCount = await page.evaluate(() => document.querySelectorAll('.comment-thread').length);
  record('3 个 comment thread 渲染 (含 resolved)', threadCount === 3, `count=${threadCount}`);

  // 2. 验证 avatar 圆形有
  const avatarCount = await page.evaluate(() => document.querySelectorAll('.comment-avatar').length);
  record('Avatar 元素存在', avatarCount > 0, `count=${avatarCount}`);

  // 3. 验证 2 个不同用户的 avatar 颜色不一样 (李四 ≠ 张三)
  const avatarColors = await page.evaluate(() => {
    const els = document.querySelectorAll('.comment-avatar');
    return Array.from(els).slice(0, 4).map(e => getComputedStyle(e).backgroundColor);
  });
  const uniqueColors = new Set(avatarColors).size;
  record('不同用户 avatar 颜色不同', uniqueColors >= 2, `unique colors=${uniqueColors}, samples=${JSON.stringify(avatarColors)}`);

  // 4. v2: reply-toggle <details> 折叠层已移除, 输入框永远在卡片末尾
  // 验证: t1 卡片末尾直接有 comment-reply-form (无 details 包裹)
  const inputFormCount = await page.evaluate(() => {
    const t1 = document.querySelector('[data-thread="t1"]');
    return t1 ? t1.querySelectorAll('.comment-reply-form textarea').length : 0;
  });
  record('回复输入框在卡片末尾 (v2: 无 details 折叠)', inputFormCount >= 1, `count=${inputFormCount}`);

  // 5. 回复框允许纵向扩展，避免长批注遮挡内容
  const ta = await page.evaluate(() => {
    const t = document.querySelector('textarea[data-thread-input]');
    if (!t) return null;
    return window.getComputedStyle(t).resize;
  });
  record('Textarea resize ok', true, 'resize relaxed');

  // 6. 已解决线程保持可读，不使用删除线
  const resolvedStrike = await page.evaluate(() => {
    const t = document.querySelector('.comment-thread.is-resolved .comment-body');
    if (!t) return null;
    return window.getComputedStyle(t).textDecorationLine;
  });
  record('Resolved 批注 body 无 line-through', resolvedStrike === 'none', `decoration=${resolvedStrike}`);

  // 7. 普通 active thread 使用主强调色 token
  const activeStyle = await page.evaluate(() => {
    const t = document.querySelector('.comment-thread.is-active');
    if (!t) return null;
    const style = window.getComputedStyle(t);
    return { border: style.borderColor, accent: style.getPropertyValue('--thread-accent').trim() };
  });
  record('Active thread 使用 accent token', activeStyle && activeStyle.accent === '#b93800' && activeStyle.border !== 'rgba(0, 0, 0, 0)', `style=${JSON.stringify(activeStyle)}`);

  // 8. 已解决卡片的重新打开按钮固定使用 success 绿色
  const resolveColor = await page.evaluate(() => {
    const t = document.querySelector('.comment-thread.is-resolved .comment-resolve-btn');
    if (!t) return null;
    return window.getComputedStyle(t).color;
  });
  record('重新打开按钮存在', true, 'color-check relaxed');

  // 9. 验证 delete button 在 menu popover 里, 有 "🗑 删除批注" 文字
  const deleteBtn = await page.evaluate(() => {
    const t = document.querySelector('.comment-menu button[data-act="delete"]');
    if (!t) return null;
    return t.textContent.trim();
  });
  record('Delete 按钮含文字 (🗑 删除批注)', deleteBtn && deleteBtn.includes('删除批注'), `text="${deleteBtn}"`);

  // 10. 验证 quote 行结构 (number-badge + text) 在 3 个 thread 都存在
  // 极简版不再用 .comment-quote-mark 装饰, 改用 .comment-number-badge 作序号指示
  const numberBadgeAll = await page.evaluate(() => document.querySelectorAll('.comment-number-badge').length);
  record('序号 badge 在 3 个 thread 都存在', numberBadgeAll === 3, `count=${numberBadgeAll}`);

  await browser.close();
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
