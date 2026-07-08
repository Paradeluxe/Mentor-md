# 📄 论文 reviewer 场景

**场景**: 学术论文写作中，导师在学生的论文草稿上批注。

## 文件

- `paper-draft.md` — 简化版 fMRI 认知老化研究论文（标题/摘要/方法/结果/讨论/结论）
- `paper-draft.md.annotations.json` — 导师预置的 8 个批注 thread

## 演示什么

| 功能 | 这个 example 展示 |
|---|---|
| **选区级批注** | 批注精确到具体句子/短语（"n-back 任务"、"所有被试均为右利手"） |
| **嵌套回复** | paper-001 有 3 层回复（导师→学生→导师），模拟真实 review 流程 |
| **解决状态** | paper-004 标 resolved（学生已修改，导师关闭） |
| **真实审稿场景** | 8 类典型反馈：缺引用、论证不清、术语解释、方法局限、讨论深度等 |
| **批注集中区** | 摘要/方法/讨论三处是审稿重点，演示批注可视化 |

## 怎么用

### 方法 1: 在 Mentor UI 里打开

1. Mentor 编辑器 → 工具栏 → 📁 打开文件夹
2. 选 `examples/paper-draft/`
3. 浏览器请求授权（File System Access API）→ 同意
4. 双击 `paper-draft.md`
5. 看 8 个黄色高亮 + 右侧 8 个批注 thread

### 方法 2: 通过 AI 协议读

```js
// DevTools Console
const ai = window.__mdAnnotator.ai;
const threads = ai.listThreads();
console.log(threads.length);  // 8
const pending = ai.getPending();
console.log(pending.length);  // 7 (1 resolved)

// AI 自动回复 pending
for (const t of pending) {
  ai.reply(t.threadId, `🤖 AI 建议：关于"${t.text.slice(0, 30)}..."，考虑补充...`);
}
```

## 预期看到

- **2 个作者**："导师 (Reviewer)" 和 "学生 (Author)" — 模拟真实合作
- **1 个 resolved** + 7 个 open — 演示 filter 行为
- **3 层嵌套回复** — 在 paper-001 thread 里演示 threaded comments
- **批注分布**：摘要/方法/讨论/结论四个章节都有批注