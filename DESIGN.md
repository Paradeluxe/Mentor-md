---
version: alpha
name: Mentor
description: 像 docx 一样批注 Markdown。Cursor 化设计语言：暖纸感长阅读、暖棕 oklab 边框、shadow-as-border、统一 SVG 图标库。
colors:
  bg: "#f2f1ed"
  panel: "#ffffff"
  "panel-2": "#f7f7f4"
  "panel-3": "#ebeae5"
  border: "#26251e"
  "border-warm": "rgba(38, 37, 30, 0.09)"
  "border-warm-medium": "rgba(38, 37, 30, 0.14)"
  text: "#26251e"
  "text-2": "rgba(38, 37, 30, 0.68)"
  "text-3": "rgba(38, 37, 30, 0.54)"
  muted: "rgba(38, 37, 30, 0.54)"
  accent: "#b93800"
  "accent-hover": "#962f00"
  "accent-soft": "rgba(245, 78, 0, 0.1)"
  highlight: "#fef3c7"
  "highlight-active": "#fcd34d"
  resolved: "#1f8a65"
  "comment-bg": "#fff8e1"
  "reply-bg": "#f3f4f6"
  danger: "#cf2d56"
  success: "#1f8a65"
  warning: "#b45309"
  "code-bg": "#1f1d1a"
  "code-fg": "#f5f2eb"
  "scrollbar-thumb": "rgba(38, 37, 30, 0.14)"
  "scrollbar-thumb-hover": "rgba(38, 37, 30, 0.24)"
  "surface-canvas": "#f2f1ed"
  "surface-chrome": "#fafaf8"
  "surface-panel": "#ffffff"
  "surface-subtle": "#f7f7f4"
  "surface-muted": "#ebeae5"
  "text-primary": "#26251e"
  "text-secondary": "rgba(38, 37, 30, 0.68)"
  "text-muted": "rgba(38, 37, 30, 0.54)"
  "border-subtle": "rgba(38, 37, 30, 0.09)"
  "border-default": "rgba(38, 37, 30, 0.14)"
  "action-primary": "#b93800"
  "action-primary-hover": "#962f00"
  "action-primary-soft": "rgba(245, 78, 0, 0.1)"
  "focus-color": "#b93800"
  "status-success": "#1f8a65"
  "status-warning": "#b45309"
  "status-danger": "#cf2d56"
  "type-ai": "#0e7490"
  "type-review": "#6d28d9"
  selection: "#fcd34d"
  "selection-soft": "#fef3c7"
  "surface-code": "#1f1d1a"
  "code-text": "#f5f2eb"
  author:
    - { strong: "#9a6700", surface: "#fff1cc" }
    - { strong: "#a33d58", surface: "#fbe3e8" }
    - { strong: "#35734b", surface: "#e4f1e7" }
    - { strong: "#315f91", surface: "#e1ebf8" }
    - { strong: "#79582e", surface: "#f3e8d8" }
    - { strong: "#5c4788", surface: "#ece7f6" }
    - { strong: "#864766", surface: "#f5e5ef" }
    - { strong: "#2f686d", surface: "#deeff0" }
typography:
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: 15px
    lineHeight: 1.7
  ui-md:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: 13px
    lineHeight: 1.4
  ui-sm:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: 12px
    lineHeight: 1.4
  ui-xs:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: 11px
    lineHeight: 1.3
  mono:
    fontFamily: "\"JetBrains Mono\", Consolas, Monaco, monospace"
    fontSize: 13px
  h1:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "1.9em"
    fontWeight: 700
    lineHeight: 1.2
  h2:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "1.5em"
    fontWeight: 700
    lineHeight: 1.3
  h3:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "1.25em"
    fontWeight: 600
    lineHeight: 1.4
  h4:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: 13px
    fontWeight: 600
  kbd:
    fontFamily: "monospace"
    fontSize: "0.9em"
rounded:
  xs: 3px
  sm: 4px
  md: 6px
  lg: 8px
  pill: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  toolbar-button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
    typography: "{typography.ui-md}"
  toolbar-button-hover:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
  toolbar-group-divider:
    backgroundColor: "{colors.border}"
    width: "1px"
    height: "18px"
  toolbar-group:
    padding: "0 8px"
    gap: "4px"
  annotation-mark:
    backgroundColor: "{colors.highlight}"
    borderBottom: "2px solid {colors.highlight-active}"
    rounded: "0"
  annotation-mark-hover:
    backgroundColor: "#fde68a"
  annotation-mark-resolved:
    backgroundColor: "{colors.resolved}"
    borderBottom: "2px solid {colors.scrollbar-thumb-hover}"
    opacity: 0.7
  comment-thread:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.comment-bg}"
    borderWidth: "1px"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  comment-thread-resolved:
    backgroundColor: "{colors.resolved}"
    borderColor: "{colors.scrollbar-thumb}"
    opacity: 0.85
  comment-reply:
    backgroundColor: "{colors.reply-bg}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
    marginLeft: "12px"
  comment-author:
    textColor: "{colors.text}"
    typography: "{typography.ui-sm}"
    fontWeight: 600
  comment-timestamp:
    textColor: "{colors.muted}"
    typography: "{typography.ui-xs}"
  comment-reply-form-textarea:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
    padding: "6px"
    typography: "{typography.ui-md}"
  float-comment-btn:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    typography: "{typography.ui-md}"
  float-comment-btn-hover:
    backgroundColor: "{colors.accent-hover}"
  tree-node-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-hover}"
    typography: "{typography.ui-md}"
    fontWeight: 600
  tree-folder:
    textColor: "{colors.muted}"
    typography: "{typography.ui-md}"
    fontWeight: 600
  save-mode-badge-warning:
    backgroundColor: "#fef3c7"
    textColor: "#92400e"
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.code-fg}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  blockquote:
    borderLeft: "3px solid {colors.border}"
    paddingLeft: "1em"
    textColor: "{colors.muted}"
  primary-button:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    borderColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
    typography: "{typography.ui-md}"
  secondary-button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
    typography: "{typography.ui-sm}"
  tree-node-icon-markdown:
    textColor: "{colors.accent}"
    opacity: 1
  tree-node-icon-json:
    textColor: "{colors.success}"
    opacity: 1
  tree-node-icon-folder:
    textColor: "{colors.highlight-active}"
    opacity: 1
  tree-node-icon-other:
    textColor: "{colors.muted}"
    opacity: 0.9
  tree-node-action-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.xs}"
    padding: "0 4px"
    typography: "{typography.ui-xs}"
  tree-node-action-button-hover:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
  tree-node-dirty-dot:
    backgroundColor: "{colors.warning}"
    size: "6px"
    rounded: "50%"
  tree-search-input:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
    typography: "{typography.ui-sm}"
  tree-search-input-focus:
    borderColor: "{colors.accent}"
---

## Overview

Mentor 是给**写学术论文的人**用的 Markdown 编辑器，右侧带 docx 风格的批注侧栏。
视觉语言的核心判断：**长时阅读优先**。编辑器正文区用低对比度的浅灰背景 + 高行距（1.7）+ 系统字体，让眼睛可以连看几小时不累。
**批注是视觉一等公民**：用一整组高饱和的黄色（highlight / highlight-active / comment-bg）做标记，让任何打开文档的人一眼就看到「这里有话要说」。
**已解决批注退场**：用低饱和灰色（resolved #e5e7eb）+ 70% 透明度，主动从视觉焦点里撤出，避免「修完了还在闪闪发光」。

## Colors

### 中性背景与文字

- **bg (#fafafa)** — 主背景。**为什么不是纯白 #fff**：长时间阅读纯白屏造成视疲劳，#fafafa 是 WSJ / Substack / Medium 同款「暖纸」感。
- **panel (#ffffff)** — 卡片/侧栏背景。比 bg 略亮一档，做出「面板悬浮在背景上」的层次。
- **border (#e0e0e0)** — 分割线。**够弱、够实**：能分隔元素但不抢视线。
- **text (#1a1a1a)** — 正文。比纯黑 #000 柔和，长阅读不刺眼。
- **muted (#6b6b6b)** — 次要文字（时间戳、提示、文件大小）。对比度 4.6:1，过 WCAG AA。

### 交互 accent（橙 · Cursor）

- **accent (#f54e00 / --action-primary #b93800)** — 主动作色（保存、激活文件、链接）。**暖橙**，与奶油纸面同系；**禁止冷蓝 #2563eb 作主交互色**。
- **accent-soft** — active tree / soft highlight。

### 状态色（Cursor）

- **danger (#cf2d56)** — 删除、hover 可点 chrome 字色、危险操作。
- **success (#1f8a65)** — 已解决 / 成功。
- **warning (#b45309)** — 警告硬条（非 soft fuzzy）。

### 批注体系（暖黄三件套）

- **highlight (#fef3c7)** — 文档正文里的批注 mark 默认底色。最浅，能在黄底白字论文上也不刺眼。
- **highlight-active (#fcd34d)** — 当前光标所在的批注 mark。比默认高饱和一档，「这一个我正在看」。
- **comment-bg (#fff8e1)** — 侧栏批注卡片的左边框颜色。**比 highlight 略偏暖**，暗示「这是批注本身，不是文档高亮」。
- **resolved** — 已解决批注弱化；与 open 对比清晰。

### 状态色

- **danger (#cf2d56)** — 删除、hover 文字色。**Cursor 暖红**：不是冷红 #dc2626，暖红在暖色背景上更协调。**hover 文字色用它**（不是 #f54e00 orange）—— Cursor 标志：「hover 时字色变红」是核心交互反馈。
- **success (#1f8a65)** — 保存成功、IndexedDB 连接成功。**Cursor 暖绿**：不是冷绿 #16a34a。
- **warning (#d97706)** — 未保存的 dirty 圆点。**用暖橙不用红**：dirty 不是错误，是「提醒保存」，红色会让用户以为出 bug。

## Typography

### 字体选择

- **正文 / UI**: `Inter` → system-ui 栈（macOS San Francisco / Windows Segoe UI / macOS 中文 PingFang / Windows 中文 微软雅黑）。
  **为什么 Inter**: Cursor / Linear / Vercel 全用 Inter，是"专业编辑器"的事实标准字。`Inter` 是 Google Fonts 字体，CDN 加载 0 等待。
  **为什么不用 web font 加载全部** : Tiptap 编辑器内嵌在 `#editor-pane` 里，正文仍走 system-ui 栈。**只有标题 / 工具栏用 Inter** —— 编辑器正文用 system 字体保持 0 延迟 + 浏览器字号缩放自适应。
- **代码 / kbd**: JetBrains Mono 栈（macOS 优先 JetBrains Mono → Windows Consolas/Monaco → monospace 回退）。

### Cursor 标志: body 正字距

- **body letter-spacing: 0.08px**（正数，不是 0）
- **为什么正字距**: 在暖色背景上，正字距给字「呼吸感」。Vercel 用负字距（紧凑工程感）适合 marketing，Cursor 用正字距（暖色长阅读）适合内容产品。
- **h1-h3 用负字距**: `letter-spacing: -0.32px` (h1), `-0.2px` (h2), `-0.1px` (h3) — 标题压缩，工程感。

### 字号比例

| 角色 | 字号 | 用途 | 字距 |
|---|---|---|---|
| body | 15px / 1.7 | 编辑器正文（长阅读，行距大）| 0.02px |
| ui-md | 13px / 1.5 | 工具栏、tree 节点、批注卡 | 0.04px |
| ui-sm | 12.5px | input、批注 author | 0.04px |
| ui-xs | 11.5px | 时间戳、徽章、提示 | 0.02px |
| h1 | 1.9em | Tiptap 标题 | **-0.32px** |
| h2 | 1.5em | Tiptap 标题 | **-0.2px** |
| h3 | 1.25em | Tiptap 标题 | **-0.1px** |

**正文用 px 而不用 rem**：Tiptap 编辑器内嵌在 `#editor-pane` 里，外层可能受浏览器缩放影响，px 锚定可避免用户在浏览器里调字号时正文比例错位。
**UI 用 em 倍数**：h1-h3 用 em 让标题随用户浏览器字号缩放自动等比放大，老花眼友好。

## Cursor 化原则

### shadow-as-border 取代 CSS border

- 所有「细线」边框用 `box-shadow: 0 0 0 1px var(--border-warm)` 实现，不用 `border: 1px solid`。
- **为什么**: box-shadow 边框能保持 `border-radius` 圆角干净 + 不参与 box model 布局 + 容易叠加多层（border + ambient + inset）。
- **应用到**: 输入框、按钮、卡片、modal、toast、tree-actions 容器。**树节点 divider / pane 分割线**用 `border-bottom: 1px solid`（真正的视觉分割）。
- token 集合：
  - `--shadow-ring`: 0 0 0 1px border-warm (标准边框)
  - `--shadow-ring-hover`: 0 0 0 1px border-warm-medium (hover)
  - `--shadow-card`: ring + 0 2px 2px rgba(0,0,0,0.04) (卡片)
  - `--shadow-elevated`: ring + 0 14px 32px + 0 28px 70px (浮起元素，模态/toast)

### 暖色 oklab 边框

- `var(--border-warm)` = `rgba(38, 37, 30, 0.1)` — 暖棕 10% alpha
- `var(--border-warm-medium)` = `rgba(38, 37, 30, 0.2)` — 暖棕 20% alpha (hover)
- **为什么不用 oklab()**: 兼容性。`oklab(0.263084 -0.00230259 0.0124794 / 0.1)` 是 Cursor 用的感知均匀颜色空间，但大部分浏览器对 oklab 的支持是 2023+ 才稳定。`rgba(38, 37, 30, 0.1)` 在视觉上接近（暖棕 + 10% alpha），兼容性 100%。

### hover 文字色 → danger 红（不是 accent 橙）

- 所有可点击元素 hover 时，**字色从 text → var(--danger) = #cf2d56**。
- **为什么不是 accent orange #f54e00**: Cursor 的标志是「hover 文字变暖红」。Orange 是 brand 强调色（链接），不是 hover 反馈色。**两者职责分开**。

### 精炼留白（8px 节奏 + sub-8 微调）

- 主节奏: 4 / 8 / 12 / 16 / 24 / 32 px
- 微调: 1.5 / 2 / 2.5 / 3 / 4.5 / 6 px（用于 icon + text micro-alignment）
- **典型用法**:
  - tree-node padding: 4.5px 10px (4.5 = 8 - 3.5 微调，让 14px icon 跟 13px text 视觉基线对齐)
  - tb-format button: 26×26 (比图标本身 14px 大 12px，hit target ≥24px)
  - save-mode-badge: 1px 6px 1px 4px padding (padding 不对称为了对齐 badge 内 icon + text 基线)

### Cursor 化去 emoji 化

- **所有 UI 图标用 1.5px stroke 24×24 inline SVG**（`window.MentorIcons` 全局对象，icons.js）
- **0 依赖**：不引 Lucide / Phosphor / Heroicons 等库，自己画
- **CSS mask-image 模式** (HTML 里的固定按钮): CSS `background-color: currentColor; -webkit-mask-image: url(svg)` 一行实现单色图标
- **inline SVG 模式** (JS 动态渲染的 tree node): `<svg>` 直接插入 DOM，`stroke: currentColor` 让 CSS 控制颜色
- **禁止 emoji 当 UI 图标**：emoji 色彩不固定、跨平台渲染不一致、无法控制 currentColor 颜色

### dirty 圆点 ring 视觉补偿

- `box-shadow: 0 0 0 1.5px var(--panel)` 给 dirty 圆点加一个 panel 色 ring
- **为什么**: tree-node hover 时 bg 变 var(--panel-2) (#f7f7f4)，6px 圆点直接放在 bg 上视觉上是"被吃了一半"。1.5px panel 色 ring 把圆点"提"出来。
- active 态 ring 用 var(--accent-soft) (orange tint) 而不是 panel。

## 批注定位（range-only · 与 DOCX 同语义）

| 层 | 权威 |
|----|------|
| 磁盘 | `thread.mdRange = {from,to}` → `content.md` 字符偏移 |
| 编辑 | ProseMirror annotation marks + `annotation-anchor-plugin` 映射 |
| DOCX | `w:commentRangeStart/End` 夹住 **同一明文切片**（字符级，非整段 wrap） |
| quote 字段 | 仅展示 / 导出证据，**不是** open locator |

**合同：**
- 打开文档：只用 mdRange→PM；失败 = orphan。
- 禁止：quote fuzzy open、prefix/suffix 指纹重绑、soft「位置可能偏移」、统一「锚点未就绪」。
- UI 硬条仅三套：原文已被删除 / 无法唯一确定（重复锚点）/ 批注锚点失效。
- 导出找不到 quote：warning，**不**静默挂到第一段。

实现：`modules/md-range.js`、`modules/docx-export-range.js`、`modules/docx-import.js`。见 `references/range-mode-v1499.md`。

## 批注多选删除

- 卡头 checkbox + 批量条「全选可见 / 取消 / 删除」。
- `deleteThreads(ids)` 一次 confirm、一次 history。

## 数据安全 (P0)

### P0-A: 跨标签保护 (BroadcastChannel)
- **问题**: 两个 tab 同时打开同一文件 → 互相覆盖保存
- **解决**: 打开 doc 时建 `BroadcastChannel('mentor-doc-...')`. 300ms ping 一次, 有 peer → `State.readOnlyMode = true` + toast 警告, **Ctrl+S 禁用**
- **代价**: 单 tab 假阳性罕见 (用 BroadcastChannel 检测同浏览器跨 tab, 跨浏览器/隐私模式检测不到)
- **tab 关闭**: `beforeunload` 广播 `leave`

### P0-B: 侧车 schema 验证
- **问题**: 错乱侧车 (重复 threadId / 缺字段) → 侧栏 UI 崩溃
- **解决**: 加载时调 `_validateSidecar()`, 扫所有 ann:
  - 重复 threadId → 标 `invalid: true, invalidReason: 'duplicate-threadId'`
  - 缺 threadId/text → 标 `invalid: true, invalidReason: 'incomplete-data'`
  - 缺 comments → 标 `invalid: true, invalidReason: 'incomplete-data'`
- **Toast 警告**: 所有 warning 列出, 最多 5 秒

### P0-C: 跨编辑器 mtime 检测
- **问题**: VSCode/其他编辑器改主 .md 后, Mentor 不知道, 写回会覆盖外部改动
- **解决**: 
  - 加载 doc 时记 `State.fileMtime` (主 .md lastModified)
  - `Ctrl+S` 写之前: `await handle.getFile().lastModified`, 比对 `State.fileMtime`
  - 如果主 .md mtime 更新 → `confirm()` 警告 "主文件在外部被修改", 用户选"继续"或"取消"
  - 写成功后更新 `State.fileMtime`
- **限制**: mtime 在某些 FS (NFS, FAT32) 不准. 跨浏览器无解

## 用户感知 (P1)

### P1-B: 跨块批注失效检测
- **问题**: ProseMirror mark 不能跨 block. 跨行锚定 (text 含 `\n`) 加载时**永远找不到**
- **解决**: 加载时检查 `ann.text.includes('\n')` → 标 `invalidReason: 'cross-block'`
- **侧栏提示**: 失效原因为 cross-block, 用户知道是锚定区跨段

## 异常数据防御 (P2)

### P2-A: 空 text 拒绝
- **问题**: 空 text 批注无意义, 会导致 prefix/suffix 算错
- **解决**: `createAnnotationThread` 开头: `if (!text || text.length === 0) { showToast(...); return null; }`

### P2-C: 重叠 mark (跳过)
- **现状**: ProseMirror 允许多 mark 同段, 侧栏独立显示每个 thread (不冲突). activeThreadId 只有一个, click mark 时只激活一个
- **已知问题**: 重叠 mark 的 activeThread 切换不直观
- **决策**: 不修, 复杂度太高, 留作 follow-up

## Layout

### 三栏布局

```
┌──────────────────────────────────────────┐
│ Toolbar                                  │  ~ 44px
├────────┬─────────────────────┬───────────┤
│ File   │   Editor            │ Comments  │
│ tree   │                     │ sidebar   │
│ ~220px │   flex: 1           │  ~360px   │
│        │                     │           │
└────────┴─────────────────────┴───────────┘
```

- **File tree 固定 220px**（可点击 « 收起）。**为什么 220px**：刚好放下「📄 my-draft-paper.md」不截断；再窄就出现横向滚动条。
- **Editor flex: 1**，最小宽度不限。
- **Comments 固定 360px**。**为什么 360px**：批注卡片要装下「author + 5 行文字 + 3 个按钮」不挤压；再窄就出现"窄到无法打字"。
- **Vertical gap 12px**、**toolbar group gap 4px**：工具栏内元素紧贴（视觉一体感），跨组之间 12px（视觉分组）。

### 工具栏内

- 按钮 padding `4px 8px`、group 之间用 `1px × 18px` 分割线（颜色 = border）。
- group 间距 8px（被 group 自己的 padding 撑开）。

## Elevation

Mentor **没有强阴影系统**。靠 bg/panel 两档色阶 + 1px border 做层次。
**为什么不要 shadow**：批注 mark 本身就是「视觉重量」，再加 shadow 会让长文档读起来很累。
例外：
- **float-comment-btn**（选中文本后弹出的批注按钮）用 shadow + scale(1.05) on hover — 它的作用是**吸引注意力召唤动作**，需要浮起感。

## Shapes

- **rounded 档位**: xs=3 / sm=4 / md=6 / lg=8 / pill=16
  - 按钮/输入框: sm (4px) — 文档类应用的「硬派」感
  - 卡片/批注: md (6px) — 略柔，配合黄色做批注
  - 浮起按钮: pill (16px) — 现代 SaaS 浮起按钮常见
- **annotation mark 不圆角**（0px）— 它是文本下的 highlight 底色，圆角会破坏文字边缘视觉。

## Components

### annotation-mark（核心）

```css
background: {colors.highlight};
border-bottom: 2px solid {colors.highlight-active};
```

`border-bottom` 而不是 `outline` 或 `text-decoration: underline`：border-bottom 跟着行高走，underline 会跟字符底部走（不同字体偏移不一样）。**`2px` 是测试后的甜点值**：1px 太弱、3px 像编辑过的 revision mark。
:hover 时底色变 `#fde68a`（比默认高饱和一档但不刺眼）。
resolved 时**整体降到 70% 透明度 + 灰色 + 灰色下划线**，让眼睛自动忽略。

### comment-thread

白色 panel + 暖黄左边框 (`{colors.comment-bg}`, 1px)。**为什么左边框而不是整圈边框**：让侧栏里的多个批注卡视觉上是一列「标签」而不是一堆「卡片」。

### float-comment-btn

蓝底白字 pill 按钮，hover 蓝色加深一档 (#1d4ed8) + scale 1.05。
**为什么 hover 用 scale 而不是只改色**：浮起按钮需要「被注意到」——scale 动画比纯色变更显眼，符合「召唤动作」的角色。

### tree-node-active

浅蓝底（accent-soft）+ 蓝字（accent）+ font-weight 600。
**为什么不用左边框**：tree 缩进已经用 padding-left 做了层级，左边框会跟缩进视觉打架。

### save-mode-badge

下载模式（file:// 双击打开）= 黄色背景 `#fef3c7` + 棕字 `#92400e`。**用棕不用红**：下载不是错误，是「功能降级」，红色会让用户以为出 bug 了。

### code-block

深色背景（`#1f2937` Slate-800）+ 浅色文字。**唯一允许用深色块的场景**：代码块是「切到另一个语境」，深色天然暗示语境切换。

## File Pane Components

左侧文件树要看起来像 Trae / Cursor 那种现代 IDE。视觉语言：**低饱和 + 强交互反馈**。
颜色不再走暖黄（暖黄是批注专属），改用「灰底 + 蓝激活 + 橙 dirty」的 IDE 配色。

### tree-node-icon（文件类型图标）

- **.md → 📝 accent 蓝**（蓝 = 主语种）
- **.json → 🔧 success 绿**（绿 = 数据/配置）
- **文件夹 → 📁 highlight-active 黄**（复用批注黄 = 突出层级）
- **其他 → 📄 muted 灰**（.pdf / .txt / 未知）
- **opacity 1.0**（不是之前的 0.7 — Trae 风格图标是清晰的）

**.annotations.json 默认隐藏**：它跟主文件是配对的，用户不应该手动管理它。

### tree-node-action-button（hover 浮出操作）

```css
position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
opacity: 0;  /* 默认隐藏 */
background: transparent; color: muted;
padding: 0 4px; font-size: 11px; border-radius: 3px;
```

:hover 时 `opacity: 1` + bg 变 `--bg`。
**为什么默认隐藏**：操作按钮占空间，平时不读 = 噪音。只在用户明确 hover 时才出现 = 「按需出现」的现代 IDE 习惯。
按钮组：复制路径（永久） + 重新加载（仅 .md） + 删除（仅 .md，带二次确认，**只删 .md 不删 .annotations.json**）。

### tree-node-dirty-dot（未保存圆点）

```css
width: 6px; height: 6px; border-radius: 50%; background: warning;
display: inline-block; margin-left: 4px;
```

**为什么不放在工具栏（现状）**：现在工具栏的 dirty 圆点是**全局的**，用户不知道**当前文件**有没有改、也看不到**切到别的文件后**那个文件改没改。Per-file dirty 圆点放在 tree 里 = 永远知道每个文件的状态。

### tree-search-input（顶部搜索框）

- 4px 8px padding（比 textarea 紧凑）
- 11-12px 字号（更小，UI 元素）
- focus 时 border 变 accent
- placeholder「🔍 过滤文件」
- 实时过滤 + 黄色高亮匹配文件名
- 清空按钮（input 内容非空时右侧 ×）
- 快捷键 **Cmd/Ctrl+Shift+E**（VS Code 同款）

**为什么放在 pane-header 下面而不是工具栏**：搜索是文件树的功能，不应该跟全局功能混。

## Do's and Don'ts

### Do

- **新组件优先用 token**：写 CSS 时先在 DESIGN.md 找对应 token，没有再考虑新增（**新增 token 要在 commit message 里说明为什么**）。
- **暖色专给批注用**：黄色三件套（highlight / highlight-active / comment-bg）只服务于批注体系，不要拿去做 toast / warning。
- **蓝专给交互用**：accent 是唯一的高饱和冷色，**active / 链接 / 主按钮**用之。**禁用状态不要用蓝**——灰即可。
- **WCAG AA 优先**：muted on bg = 4.6:1 过线。新增 token 时跑 `npx -y @google/design.md lint DESIGN.md`。

### Don't

- **不要加阴影给普通卡片**。批注 mark 已经是视觉重量，加 shadow 等于双重负担。
- **不要用 emerald / orange / purple 等新色相**。当前 5 个语义色组（中性 / 蓝 / 黄 / 状态 / 深色代码）已经覆盖所有场景，加新色相 = 在用户脑子里多塞一个语义对应。
- **不要改 rounded 档位**。3/4/6/8/16 这 5 档够用，加 12px 是噪音。
- **不要在批注 mark 上用 animation**。淡入淡出都好，长文档里有几十个 mark 同时动 = 用户晕。
- **不要用 outline 替代 border**。ProseMirror 编辑器里 outline 跟 mark 视觉冲突，border-bottom 跟文字基线对齐更准。
