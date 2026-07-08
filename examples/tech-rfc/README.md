# 🛠️ 技术 RFC 评审场景

**场景**: 团队成员 review 同事提交的技术方案 RFC。

## 文件

- `tech-rfc.md` — 简化版技术 RFC（增量构建缓存系统）
- `tech-rfc.md.annotations.json` — 3 位同事预置的 5 个批注 thread

## 演示什么

| 功能 | 这个 example 展示 |
|---|---|
| **多人协作** | 3 个 reviewer：李四 / 王五 / 赵六 — 演示不同视角 |
| **嵌套回复** | rfc-001 有 3 层（reviewer→reviewer→author），rfc-004 有 2 层 |
| **作者 vs reviewer** | 张三（Author）的 reply 区分于 reviewer 的反馈 |
| **技术评审语气** | 真实 tech review：质疑数据、追问细节、建议长期演进 |
| **Resolved 状态** | rfc-004 已 resolve（作者回应后 reviewer 关闭） |

## RFC 内容

关于引入增量构建缓存系统的技术方案：

- **背景**: 当前 CI 构建 12 分钟，浪费成本 + 拖慢迭代
- **方案**: 基于 SHA-256 文件哈希 + S3 缓存
- **权衡**: 实施成本 vs 收益
- **替代方案**: 本地缓存 / 远程 build farm / Bazel Remote Cache

## 怎么用

### 在 Mentor UI 里

1. 工具栏 → 📁 打开文件夹 → 选 `examples/tech-rfc/`
2. 双击 `tech-rfc.md`
3. 看右侧 5 个 thread，3 个不同 author

### 通过 AI 协议自动回复

```js
const ai = window.__mdAnnotator.ai;

// 列出所有待回复的
const pending = ai.getPending();
console.log(`${pending.length} 个待回复`);
// [
//   { threadId: 'rfc-001', text: '引入基于文件哈希的增量构建...', commentCount: 3 },
//   { threadId: 'rfc-002', text: 'cache_key = sha256(...' },
//   { threadId: 'rfc-003', text: 'TTL: 30 天...' },
//   { threadId: 'rfc-005', text: '需要迁移到 Bazel...' },
// ]

// AI 给所有 RFC 批注补充技术细节
for (const t of pending) {
  ai.reply(t.threadId,
    `🤖 AI 补充：关于"${t.text.slice(0, 40)}..."，参考业界实践（Google 的 Bazel、Twitter 的 Bazel monorepo），建议考虑 ${
      t.text.includes('TTL') ? '分级 TTL（main 永久、feature 短期）' :
      t.text.includes('cache_key') ? '明确 fingerprint 包含字段' :
      '补充迁移到工业级方案的长期路径'
    }`);
}
```

## 预期看到

- **4 个作者**: 张三（Author）、李四/王五/赵六（Reviewer）
- **5 个 thread**: 4 open + 1 resolved
- **最丰富的 thread**: rfc-001 有 3 条评论（质疑→追问→回应）
- **典型审稿语气**: 质疑数据（"实测还是理论？"）、追问细节（"具体包含什么？"）、建议长期演进（"评估 Bazel 迁移"）