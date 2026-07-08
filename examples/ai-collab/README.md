# 🤖 AI 协作批注场景

**场景**: AI 通过 `ai-collab-v1` 协议自动给博客草稿加反馈（拼写 / 风格 / SEO / 可读性 / 深度），作者再回复。

## 文件

- `blog-post.md` — 中文技术博客草稿（"用 Git 五年后我才学会的 10 件事"）
- `blog-post.md.annotations.json` — AI Reviewer 通过协议预置的 5 个批注

## 演示什么

| 功能 | 这个 example 展示 |
|---|---|
| **AI 协作协议** | author = "AI Reviewer (Lint)"，作者回复 = "Blog 作者" — 清晰区分人/AI |
| **批注类型多样化** | 5 种 AI 反馈类型：SEO 📊、拼写 ✅、风格 🎯、准确性 🛠️、总结 ✨ — 用 emoji 标签化 |
| **AI 局限演示** | ai-blog-003 让作者主动回复"已在第 9 节详细解释"，展示 AI 不替代人 |
| **批量 AI 回复场景** | 用 `ai.protocol.reply()` 一次给所有 pending thread 自动回复 |

## AI 反馈示例

每条 AI 批注都是结构化的：

```
📊 类型 emoji + 具体反馈内容
   - 不仅说"这里有问题"，而是给出可操作的建议
   - 引用数据/业界实践
   - 提供具体改进示例
```

例如 SEO 建议不只是"标题不够好"，而是引用 BuzzSumo 数据 + 给具体副标题备选。

## 怎么用

### 方法 1: 看预置批注

工具栏 → 📁 打开文件夹 → 选 `examples/ai-collab/` → 双击 `blog-post.md`

右侧批注面板显示 5 个 thread，每个都是 AI 反馈。

### 方法 2: 触发 AI 协议（演示"AI 自动批量回复"）

```js
// 模拟"作者查看 AI 反馈并回复"的工作流
const ai = window.__mdAnnotator.ai;

// 1. 看 AI 给了什么反馈
const aiThreads = ai.listThreads().filter(t =>
  t.lastComment.author === 'AI Reviewer (Lint)'
);
console.log(`AI 给了 ${aiThreads.length} 条反馈`);

// 2. 作者逐条回复
for (const t of aiThreads) {
  const replyBody = `✅ 已采纳：关于"${t.text.slice(0, 30)}..."，我会在下一版修改。`;
  const result = ai.reply(t.threadId, replyBody, {
    author: 'Blog 作者',  // 自定义 author（默认是 'AI Reviewer'）
  });
  console.log(result.ok ? `✓ 回复 ${t.threadId.slice(0, 8)}` : `✗ ${result.error}`);
}

// 3. 看结果：现在 author 字段是 "Blog 作者"（不是 "AI Reviewer"）
console.log(ai.getDocInfo());
// {
//   fileName: 'blog-post.md',
//   annotationCount: 5,
//   pendingCount: 0,  // 全部有作者回复了
//   ...
// }
```

### 方法 3: 模拟"AI 持续 lint 模式"

```js
// 监听新评论事件，每次有用户新加批注时 AI 自动 lint
const unsub = ai.onNewComment(({ threadId, comment }) => {
  if (comment.author === 'Blog 作者') return; // 用户自己回复不触发

  // 用户新加批注 → AI 2 秒后自动回应
  setTimeout(() => {
    const t = ai.getThread(threadId);
    if (!t) return;
    ai.reply(threadId,
      `🤖 AI 跟进：收到你的反馈"${comment.body.slice(0, 50)}..."，我已记录在改进清单。`
    );
  }, 2000);
});
```

## 预期看到

- **2 个 author**: "AI Reviewer (Lint)" + "Blog 作者"
- **5 个 thread** + **1 个嵌套回复** (ai-blog-003 里作者回应 AI 的风格建议)
- **每条批注都有 emoji 标签**（📊✅🎯🛠️✨），一眼看出反馈类型
- **5 种不同反馈角度**: 数据引用 / 规范检查 / 风格建议 / 准确性补充 / 行动呼吁

## 这能用来做什么

- **个人写作流程**：每篇博客发布前过一遍 AI lint
- **CI 集成**：博客自动构建时跑 AI lint，把批注作为 review report
- **教学**：演示给团队看"AI 协作长什么样"
- **开发**：作为 `ai-collab-v1` 协议的实现参考