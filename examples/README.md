# Mentor Examples

3 个真实场景的演示 example，用于快速体验 Mentor 的批注、AI 协作、跨人 review 等核心功能。

## 列表

| Example | 场景 | 演示 |
|---|---|---|
| **[paper-draft/](./paper-draft/)** 📄 | 学术论文 reviewer | 导师批注学生论文：嵌套回复、解决状态、典型审稿语气 |
| **[tech-rfc/](./tech-rfc/)** 🛠️ | 技术 RFC 评审 | 3 位同事 review 同事方案：多人协作、追问/质疑、长期演进建议 |
| **[ai-collab/](./ai-collab/)** 🤖 | AI 自动批注 | AI 通过 `ai-collab-v1` 协议给博客加反馈：拼写/SEO/风格/准确性/总结 |

## 快速试用

```bash
# 1. 启动 Mentor (如果还没在跑)
cd /path/to/Mentor
python3 -m http.server 8765

# 2. 浏览器打开
#    http://localhost:8765

# 3. 工具栏 → 📁 打开文件夹 → 选 examples/<你想试的>/
# 4. 双击 .md 文件查看预置批注
```

## 每个 example 的预置批注

| Example | 文档 | 批注数 | 已解决 | 作者数 |
|---|---|---|---|---|
| paper-draft | ~2.4KB | 8 | 1 | 2 (导师 + 学生) |
| tech-rfc | ~2.4KB | 5 | 1 | 4 (1 author + 3 reviewers) |
| ai-collab | ~2.2KB | 5 | 0 | 2 (AI + 博客作者) |

## 共同验证的功能

每个 example 都覆盖了 Mentor 的核心 UX：

1. **选区级批注** — 批注精确到具体句子/短语
2. **嵌套回复** — thread 内多层回复（最少 1 层、最多 3 层）
3. **解决状态** — 至少 1 个 resolved + 多个 open（演示 filter）
4. **作者标识** — 不同 author name，区分人工/AI
5. **跳转定位** — 点 📍 跳转到对应位置（4:6 视口位置）
6. **持久化** — 侧车 JSON 自动加载，无需重新输入

## AI 协议 demo (推荐先看 ai-collab/)

`ai-collab/` 展示了 `ai-collab-v1` 协议的核心使用模式：

```js
const ai = window.__mdAnnotator.ai;

// 1. 读：列出所有批注
const threads = ai.listThreads();

// 2. 筛：找 AI 待回复的
const pending = ai.getPending();

// 3. 写：批量回复（带自定义 author）
for (const t of pending) {
  ai.reply(t.threadId, '回复内容', { author: '我的名字' });
}

// 4. 订阅：监听新评论事件
ai.onNewComment(({ threadId, comment }) => {
  console.log(`新评论：${comment.author} 说 "${comment.body}"`);
});
```

完整代码示例见 [ai-collab/README.md](./ai-collab/README.md)。

## 测试场景的进阶玩法

### 用 Playwright 跑端到端测试

每个 example 都适合做 E2E 测试 fixture。例如验证"加载 ai-collab 后，AI 协议可读 5 个 thread"：

```js
await page.evaluate(async () => {
  const md = await fetch('/examples/ai-collab/blog-post.md').then(r => r.text());
  const ann = await fetch('/examples/ai-collab/blog-post.md.annotations.json').then(r => r.json());
  window.__mdAnnotator.loadMarkdownIntoEditor('blog-post.md', md, ann);
});
const threads = await page.evaluate(() => window.__mdAnnotator.ai.listThreads());
console.log(threads.length);  // 5
```

### 在 GitHub 上浏览

Examples 跟随主仓库一起 push 到 GitHub：https://github.com/Paradeluxe/Mentor/tree/main/examples

可以直接在 GitHub 网页上浏览 .md 文件（GitHub 自动渲染 markdown）。

## 添加你自己的 example

想贡献新场景？照着现有 3 个的结构即可：

```
examples/<你的场景>/
├── <name>.md                   # 你的 markdown 文档
├── <name>.md.annotations.json  # 预置批注
└── README.md                   # 场景说明 + 使用方式
```

要求：
- .md 至少 1KB（确保有内容可批注）
- .annotations.json 至少 3 个批注（展示典型场景）
- README.md 解释场景 + 怎么用 + 预期看到什么

然后 PR 到 https://github.com/Paradeluxe/Mentor