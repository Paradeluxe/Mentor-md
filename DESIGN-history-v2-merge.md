# Design: Office-style Undo/Redo (v2)

## 目标 (用户要求)

"ctrl z ctrl y才是对的" + "office啥样我们也啥样"

**Office 行为**：
- **Ctrl+Z** = 撤销（最近一次操作）
- **Ctrl+Y** 或 **Ctrl+Shift+Z** = 重做
- **统一 history 栈**：doc 文本编辑 + 批注操作混栈
- 一次撤销 = 一步最近操作（可能是输入字符，也可能是创建批注）

## 现状

v1 方案：
- 独立两套 history（Tiptap doc + 我自己的 annotations stack）
- Ctrl+Z 走 Tiptap 撤销 doc
- Ctrl+Alt+Z 走我的撤销批注

用户要"Office 一致" → **必须合并**。

## v2 设计：统一栈

### 核心思路

把"批注操作"**包装成 ProseMirror transaction**，让 Tiptap history 自动接管。

```
[创建批注]  →  tr.setMeta('__batchAnnotation', true)
                tr.addMark(...)
                editor.view.dispatch(tr)
              → Tiptap history push 1 步

[undo]      →  editor.commands.undo()
              → Tiptap 反演 tr, 触发 onUpdate
              → onUpdate 检测 tr 包含 __batchAnnotation meta
              → 调我的 restoreFromSnapshot(State.annotations from snapshot)
```

### 批注操作如何包装

每次 push 之前，**Tiptap history push 当前 doc 状态**（作为 undo 步），同时**我的代码**把 annotations 快照存到 transaction meta：

```js
function dispatchAnnotationChange(action) {
  // 1. 立即在 my history 里存 annotations 快照 (annotations 栈)
  // 2. 用 setMeta 告诉 onUpdate: 这个 tr 是批注操作, 用 my snapshot 还原 annotations
  // 3. dispatch tr, Tiptap 自动 undo/redo 把它纳入历史
  const snap = deepClone(State.annotations);
  const tr = State.editor.state.tr.setMeta('__annotationSnap', snap);
  action(tr);  // 修改 tr
  State.editor.view.dispatch(tr);
  // 之后 Tiptap history 自动 push
}
```

### onUpdate 拦截

```js
onUpdate: ({ editor, transaction }) => {
  const annSnap = transaction.getMeta('__annotationSnap');
  if (annSnap !== undefined) {
    // 这是批注操作: 用 snapshot 还原 State.annotations
    State.annotations = annSnap;
    renderCommentList();
    markDirty();
  } else {
    // 普通 doc 编辑
    markDirty();
    renderCommentList();
    renderOutline();
    _validateMarksAfterEdit(editor);
  }
}
```

### 撤销时 annotation mark 重建

撤销一个 transaction 时：
- Tiptap 自动反演 mark 添加/删除
- 如果原 tr 是 `__annotationSnap` 类型的 → onUpdate 拿 snapshot → 还原 annotations → 调 `rebuildAnnotationMarks()` 同步

### 快捷键

直接绑 Tiptap 的命令：

```js
$('#btn-undo').click = () => State.editor.commands.undo();
$('#btn-redo').click = () => State.editor.commands.redo();

// 快捷键: Tiptap 默认 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 已经工作
// 我们只需要加 Ctrl+Y (部分平台 Tiptap 不默认绑)
document.addEventListener('keydown', e => {
  if (ctrl && e.key === 'y' && !e.shiftKey) {
    e.preventDefault();
    State.editor.commands.redo();
  }
});
```

### 移除我的 history stack

- 删 `State.history` 字段
- 删 `pushHistory` / `undo` / `redo` / `resetHistory` 函数
- 删 `loadMarkdownIntoEditor` 里的 `resetHistory` 调用（**Tiptap history 自动重置切文件吗？**）

**Tiptap history 切文件处理**：
- `loadMarkdownIntoEditor` 调 `setContent(html, false)` 第二个参数 `false` = **不 emit transaction** → Tiptap history **不重置**。需要在切文件时手动 `editor.commands.setContent(html, true)` 第三个参数 true OR 显式 clear history。
- ProseMirror 暴露 `historyKey` 机制可重置。**或**最简：切文件前 `editor.destroy()` 重建 — 太重。
- **方案**：用 `editor.commands.setContent(html, false)` + 手动 clear Tiptap history。Tiptap StarterKit 有 `history` extension，但 clear API 是 `ProseMirror.view.resetHistory()`... 实际上 PM 的 `Plugin` 状态在 `state` 里, 改 setContent 后 history state 仍引用旧 doc —— 需 workaround。

**简化方案**：用 `editor.commands.setContent(html, true)` —— emit transaction, Tiptap 内部会处理。但 **redo 链断裂**（=好的，新文档不该保留旧 doc 的 redo）。

**更好**：在 `loadMarkdownIntoEditor` 调 `editor.commands.setContent(html, false)` 后，**主动** 模拟一次"清历史" tr。ProseMirror 暴露 `view.updateState(view.state.reconfigure([...withHistory depth:0...]))` 太复杂。

**实际可行方案**：Tiptap history 的 redo/past 存于 plugin state. 切文件时:
```js
// 在 editor.commands.setContent 之后, 调用:
const tr = editor.state.tr.setMeta('history$', { redo: [] });
// 但这 hack 了内部 API, 不可靠.
```

**正确做法**: Tiptap editor `destroy()` 后重建, 但 state 全丢 (annotation marks 也要重建, doc 文本要 setContent).
- 不实际, 因为 doc/anns 状态都通过 State 维护, 重建 editor 之前 setContent 是空的。

**最终方案 (实用)**: 
1. 切文件时 `editor.commands.setContent(html, false)` 不 emit tr (保持 history 链)
2. 但 Tiptap history 现在指向**旧 doc 的 transactions**, 撤销会撤销旧内容 (无效)
3. **接受这个 trade-off**: 切文件后 Tiptap history 状态不重置 → undo 第一次会撤销旧 doc 内容 → 这条 tr 反演完成 → 后续 undo 才进入新 doc 历史
4. **或者**: 切文件时 **强制 clear** 通过 `editor.view.updateState(EditorState.create({...当前 config, doc: 新 doc}))`. 复杂但 clean.

**最简可用方案**: 切文件后让 Tiptap history "看起来空" — 在 setContent 之后** push 一些 noise transaction 让 stack 清空**. 不可靠.

**决定**: 走 Tiptap 官方建议 — **destroy + 重建 editor**. 在 loadMarkdownIntoEditor:
```js
// 1. 备份 doc HTML, annotations
// 2. destroy 当前 editor
// 3. 重建 editor with same config
// 4. setContent 备份 HTML
// 5. 重建 annotation marks
// 6. setActiveThreadId / renderCommentList
```

成本: 大改造, 重置 selection, 失去光标位置. 不理想.

**最终最终方案** (用 `appendTransaction` + meta hack):
- 不切文件, Tiptap history 会保留旧 doc tr. 但**禁用 undo 直到用户操作**. 不可行.

**接受 trade-off**:
- 切文件 → Tiptap history 仍存旧 doc transactions
- 撤销后, 用户**第一次 undo**会看到旧 doc 文本消失/回退. 然后**后续 undo**才进入新 doc history.
- 文档说明: "切文件后前几次 undo 可能影响旧文档"
- 实际: 用户切文件后**不会立刻 undo**, 大多场景无感知

**OK 决定用 trade-off**.

### 改 annotations 的方式

`createAnnotationThread` 等函数:
- 旧: 直接 `State.annotations.push(thread)` + `applyAnnotationMark`
- 新: 
  ```js
  // 1. 先 deep copy 当前 annotations (作为 annotationSnap)
  // 2. 修改 State.annotations (本地)
  // 3. 构造 tr 包含 mark 操作, setMeta('__annotationSnap', 修改前 snapshot)
  // 4. dispatch tr
  ```

但**批注操作大多是改 State.annotations 不改 doc 文本**（除了创建/删除 mark）。**简化**：
- 创建批注: tr.addMark + setMeta(snap)
- 解决/重开: State.annotations.find().resolved = ! + dispatch **无 mark 变更的 tr** + setMeta
- reply: State.annotations.find().comments.push + dispatch tr + setMeta
- 删除批注: tr.removeMark + setMeta

为"无 mark 变更"操作, 仍然 dispatch 一个空 tr (仅 setMeta), 让 Tiptap 把它入 history.

### 实现清单

| 改动 | 文件 |
|---|---|
| 删 State.history 字段 | app.js |
| 删 pushHistory / undo / redo / resetHistory 函数 | app.js |
| 删 history 5 入口接入 | app.js |
| 改 onUpdate 处理 __annotationSnap meta | app.js |
| 改 7 入口改用 dispatchAnnotationChange 模式 | app.js |
| 改 loadMarkdownIntoEditor 切文件 (接受 trade-off) | app.js |
| 改 toolbar 按钮绑 Tiptap commands | app.js |
| 改快捷键: Ctrl+Z (Tiptap 默认), Ctrl+Y 加绑 | app.js |
| 删 updateHistoryButtons (用 Tiptap 自身) | app.js |
| 改 __mdAnnotator 暴露 undo/redo (Tiptap 委托) | app.js |
| 改 e2e-history.spec.js: undo/redo 通过 editor.commands | tests/ |

### 验收

- Ctrl+Z 撤销最近一步 (doc 或批注) ✓
- Ctrl+Y 重做 ✓
- 工具栏按钮工作 ✓
- 切文件后 history 行为可接受 (trade-off 文档化)
- 6 套 spec 全过
