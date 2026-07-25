# Design: History (Undo/Redo) + Autosave

## 目标

1. **所有修改自动保存** — 用户不按 Ctrl+S 也写盘
2. **批注操作可撤销/重做** — 创建/解决/回复/删除批注
3. **doc 文本编辑可撤销/重做** — 沿用 Tiptap 自带 Ctrl+Z / Ctrl+Shift+Z

## 范围划分

| 范围 | undo/redo 来源 | 快捷键 |
|---|---|---|
| doc 文本 | Tiptap `history: { depth: 100 }` | Ctrl+Z / Ctrl+Y (默认) |
| annotations | Mentor 自建 history stack | Ctrl+Alt+Z / Ctrl+Alt+Shift+Z |

两套**独立** history，互不干扰。

## 1. History Stack — annotations

### 数据结构

```js
State.history = {
  past: [],    // 历史 snapshot 数组, 每项 = { annotations: [...], md: string, ts: number }
  future: [],  // 撤销后填入, redo 时弹出
  capacity: 100,
}
```

每条 snapshot = 完整 `State.annotations` 深拷贝 + 当前 md 文本（HTML 序列化）。

### Push 触发点

任何会修改 `State.annotations` 的操作后调用 `pushHistory()`：

- 创建批注（createTestAnnotation / float-comment-btn submit）
- 创建 reply（submit-reply）
- 解决/重开（toggleResolved）
- 删除批注（deleteThread）
- 切换 fuzzy 状态（markInvalid）

**不触发**：
- markDirty 触发频率太高（每次输入）—— history 不能那么细
- 仅"结构性变化"才 push

### 操作

```js
function pushHistory() {
  // 1. 深拷贝当前 annotations
  const snap = {
    annotations: deepClone(State.annotations),
    ts: Date.now(),
  };
  // 2. 推入 past
  State.history.past.push(snap);
  // 3. 超容量丢弃最早的
  if (State.history.past.length > State.history.capacity) {
    State.history.past.shift();
  }
  // 4. 清空 future (新操作打断 redo 链)
  State.history.future = [];
  updateHistoryButtons();
}

function undo() {
  if (State.history.past.length === 0) return false;
  // 1. 当前状态推入 future
  State.history.future.push({
    annotations: deepClone(State.annotations),
    ts: Date.now(),
  });
  // 2. 弹出 past 最后一个, 还原
  const prev = State.history.past.pop();
  restoreFromSnapshot(prev);
  return true;
}

function redo() {
  if (State.history.future.length === 0) return false;
  State.history.past.push({
    annotations: deepClone(State.annotations),
    ts: Date.now(),
  });
  const next = State.history.future.pop();
  restoreFromSnapshot(next);
  return true;
}

function restoreFromSnapshot(snap) {
  State.annotations = snap.annotations;
  // 同步更新 ProseMirror marks (从 annotations 重建)
  syncMarksFromAnnotations();
  renderCommentList();
  markDirty();
  updateHistoryButtons();
}
```

**syncMarksFromAnnotations** — 重建 ProseMirror doc 的 annotation marks：
- 遍历 State.annotations, 对每个 thread 找到 range.from / range.to
- 在 editor 里 addMark(annotation type, {threadId, resolved})
- 已不存在的 mark → removeMark

这是关键 — annotations 数据跟 doc 的 mark 必须同步，否则"撤销创建批注"后，doc 里的高亮还在。

## 2. Autosave

### 策略

| 模式 | 行为 |
|---|---|
| handle (`mentor-handle`) | 每 30s 自动写回原 .mentor 位置 (FS Access API) |
| download (`mentor-download`) | **不自动写盘**（浏览器没权限，下载会刷屏），但 IDB 仍持续 500ms debounce |
| 打开新文件 / 第一次加载 | 启动 30s 定时器 |

### 实现

```js
let autosaveTimer = null;
const AUTOSAVE_INTERVAL = 30000;

function startAutosaveTimer() {
  stopAutosaveTimer();
  if (State.saveMode !== 'mentor-handle') return;  // 只在 handle 模式自动写
  autosaveTimer = setInterval(() => {
    if (!State.currentFile || !State.dirty) return;  // 没改动不写
    autosaveNow();
  }, AUTOSAVE_INTERVAL);
}

function stopAutosaveTimer() {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
}

async function autosaveNow() {
  if (State.saveMode !== 'mentor-handle') return;
  if (!State.currentFile || !State.currentFile.handle) return;
  if (!State.dirty) return;
  try {
    const html = State.editor.getHTML();
    const mdText = htmlToMarkdown(html);
    const sidecar = buildSidecar(mdText);
    const blob = await buildMentorZipBlob(mdText, sidecar);
    const writable = await State.currentFile.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    // 不 markClean（保持 dirty 状态, 用户知道"被自动保存了"但不消除脏标记
    // 实际上 markClean 才对, 因为磁盘已经最新. 但保留 dirty 让用户知道"我还没主动保存过"
    // 折中: 显示一个 "自动保存于 HH:MM" 的状态, 不改 dirty
    showToast(`已自动保存 (${new Date().toLocaleTimeString()})`);
  } catch (e) {
    console.warn('[autosave] failed:', e);
    showToast('自动保存失败: ' + e.message, 3000);
  }
}
```

### dirty 指示器

保留 dirty-dot（用户知道有未主动保存的修改），但加一个"自动保存于 HH:MM"小提示在 statusbar。

## 3. UI

### Toolbar 按钮

```html
<button id="btn-undo" title="撤销批注操作 (Ctrl+Alt+Z)" class="tb-icon-text" disabled>
  <span class="tb-icon">↶</span>
</button>
<button id="btn-redo" title="重做批注操作 (Ctrl+Alt+Shift+Z)" class="tb-icon-text" disabled>
  <span class="tb-icon">↷</span>
</button>
```

- 放在 #btn-save-as 后面
- 没有可撤销时 disabled（灰）
- 点按钮 = 调 undo() / redo()

### 快捷键

- `Ctrl+Alt+Z` 撤销批注（不冲突 Tiptap 的 Ctrl+Z）
- `Ctrl+Alt+Shift+Z` 重做
- 仍然保留 Tiptap 默认 Ctrl+Z 撤销 doc 文本

## 4. 边界 / 风险

### 4.1 snapshot 性能

- 100 条 × (annotations 深拷贝) — 通常 < 1KB/条，无压力
- md 文本在 snapshot 里也深拷贝（如果 100KB 文件，100 条 = 10MB）— 可改成只存 annotations，md 文本从 editor 取最新
- 决定：**只 snapshot annotations**，不存 md。restore 时 doc 文本不变，只还原 annotations + 重建 marks

### 4.2 syncMarksFromAnnotations 跟当前重建逻辑冲突

现有 `loadMarkdownIntoEditor` 接受 annotations 参数重建 marks。restoreFromSnapshot 走类似路径。**抽出公共函数**：

```js
function applyAnnotationsToDoc(annotations) {
  // 清掉所有 annotation mark
  // 对每个 annotation, 在 range.from/to addMark
  // resolved=true 的 mark 加 is-resolved class
}
```

### 4.3 handle 模式被 revoke

如果用户撤回了 FS Access API 权限（Chrome 设置里），autosave 写入会抛 NotAllowedError。autosaveNow catch 后显示 toast + 关掉 timer（避免每 30s 报错）。

### 4.4 切文件

- 切到新 .mentor → 重置 history.past = [] future = []，启动新 autosave timer
- 切前如果有 dirty + handle → 提示"未保存的修改将丢失"（已存在）
- 切换时 stopAutosaveTimer

### 4.5 跟 dirty indicator 冲突

`markDirty` 现在 500ms debounce 写 IDB。autosave 写盘 30s 一次。
- IDB 写：每次操作
- 盘写：30s 一次（仅 handle 模式）
- 用户主动 Ctrl+S：立即写盘

dirty 状态：
- 操作 → dirty=true
- 30s autosave 成功 → 仍 dirty=true（用户没主动保存）
- Ctrl+S 写盘成功 → dirty=false

但 dirty-dot 永远红 = 用户困惑。**简化**：autosave 成功后 markClean。**不**显示"自动保存于 HH:MM"，避免 UI 噪音。用户主动 Ctrl+S 仍 markClean（不变）。

## 5. 验收测试

新增 `tests/e2e-history.spec.js`：

1. 创建一个批注 → 撤销 → 批注消失 → 重做 → 批注回来
2. 创建 → 解决 → 撤销 → resolved=false 回来
3. 创建 → reply → 撤销 → reply 消失
4. 创建 → 撤销 → 创建另一个 → 重做不应有 (future 被清)
5. history 容量 100, 第 101 个 push 时最早一条丢弃
6. autosave: 模拟 handle 模式, 30s 后盘写, 文件 mtime 更新
   (实际跑太慢, 用 `clock.runFor(31000)` 之类的 fake timer 或快进 interval)
7. autosave 在 download 模式不写盘
8. dirty 状态: 写盘成功后 markClean

## 6. 改动文件清单

| 文件 | 改动 |
|---|---|
| `app.js` | + State.history, + pushHistory/undo/redo/restoreFromSnapshot, + applyAnnotationsToDoc, + autosaveNow/startAutosaveTimer, + Ctrl+Alt+Z 快捷键, + 工具栏按钮 listener, 改造所有改 annotations 的入口加 pushHistory() |
| `index.html` | + toolbar undo/redo 按钮 |
| `styles.css` | + .tb-icon-text[disabled] 灰样式 |
| `tests/e2e-history.spec.js` | 新增 (10 步 round-trip) |

## 7. 实施顺序

1. State.history + pushHistory/undo/redo (核心逻辑)
2. applyAnnotationsToDoc (mark 重建)
3. 5 个改 annotations 入口加 pushHistory (createAnnotation / submitReply / toggleResolved / deleteThread)
4. toolbar 按钮 + 快捷键 + disabled 状态
5. autosave timer + handle 写盘
6. e2e test
7. 全量回归

## 6. Draft vs external disk write (v1.44.7)

三层状态：磁盘 `.mentor` zip · FileSystemFileHandle 写回 · IDB `DraftStore` 崩溃草稿。

| 场景 | 裁决 |
|---|---|
| 用户主动打开 | `preferDraft=false` → 磁盘 |
| tryReconnect 崩溃恢复 | `preferDraft=true` + `resolveDraftConflict` |
| draft.updatedAt > diskMtime | 用草稿（未保存编辑） |
| diskMtime ≥ draft.updatedAt | **用磁盘**，并 `deleteDraft` |
| 时钟缺失且内容不同 | `confirm`，默认磁盘 |
| writeCurrentToHandle 成功 | DraftStore/idbCache 与磁盘对齐 |
| mtime 变且 dirty | `external-modified`：停 autosave，提示重开磁盘 |

API: `__mdAnnotator.resolveDraftConflict`
测试: `tests/v143-draft-vs-external-write.spec.js`

