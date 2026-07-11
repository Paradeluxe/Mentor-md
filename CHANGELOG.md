# Mentor Changelog

按时间倒序记录已发布的变化。最新条目在上方。

## v1.42.4 (2026-07-11) — "另存为" 改 "导出成 .mentor"

### Change
- 工具栏按钮文本: "另存为" → "导出成 .mentor"
- title tooltip: "导出当前文档为 .mentor 单文件包 (含 .md + 批注 + 图片)"
- 移除 prompt 选择 (1=mentor / 2=md+json) — 现在直接导 .mentor
- `.md + .annotations.json` 双文件导出路径已删除 (用户不需要)
- 实际效果: 点击 → 浏览器下载 `<原文件名>.mentor`, toast 提示

### Chore
- `index.html` `app.js?v=111 → ?v=112`
- `tests/roundtrip-real-mentor.spec.js` 6/6 PASS (回归 0)

## v1.42.3 (2026-07-10) — wave 7 AI 路径 + 真实失败模式

### Bugfix: ai.setAuthor 未暴露
- **症状** (W7-05): `window.__mdAnnotator.ai.setAuthor(...)` 报 `is not a function`. 外部 AI scripts 改不了 AI author 名
- **根因** `app.js:5564`: `setAuthor` 只挂在 `__meta` 上 (协议元信息), 没暴露到 ai surface
- **修复** `app.js:5734-5737`: 加 `setAuthor(name)` wrapper 到 ai, 返回原 `setAuthor` 的 true/false

### Test
- `tests/chaos-wave7.spec.js`: 15 场景全过
  - W7_01: 20 个并发 AI reply (锁 + 2s 幂等窗, 全部成功, 最终 1 条 reply)
  - W7_02: AI reply 到 resolved thread → 拒绝 (预期行为)
  - W7_03: AI reply 到不存在 thread → `{ok:false, error:'不存在'}`
  - W7_04: 空 body / 5001 字符 body / 5000 字符 body (boundary)
  - W7_05: ai.setAuthor 切换 author 名 (修复后 OK)
  - W7_06: 多 doc 切换 round-trip
  - W7_07: heading/list/blockquote/code 内 mark
  - W7_08: 100 replies 批注 (99 reply div + 1 first comment, 46KB card)
  - W7_09: IDB 损坏数据 → app survive
  - W7_10: 多 page IDB 恢复
  - W7_11: emoji + ZWJ + RTL + 零宽 + 换行 unicode storm
  - W7_12: 复制粘贴 mark 跟随
  - W7_13: 零长 mark (from === to)
  - W7_14: 完整刷新周期
  - W7_15: API injection (null/number/object/garbage 喂所有 API, app survive)

### 测试基线
- **153 场景全过** (7 wave chaos 130 + roundtrip 6 + cap 16 + cursor-fix 1)

### Chore
- `index.html` `app.js?v=110 → ?v=111`

## v1.42.2 (2026-07-10) — wave 5/6 暴露 2 个真实 bug

### Bugfix 1: 嵌套 mark 跨段时点击外层 mark 不激活
- **症状** (W5-11): 一个 mark 内含另一 mark (如 outer 包 inner) 时, PM 把 outer 切成多段 (AB | CD | EFGH), 点击 outer AB 片段 → `setupAnnotationMarkClickObserver` 不激活 outer
- **根因** `app.js:5316`: `editor.view.nodeDOM(r.to - 1)` 在边界位置常返回 null, 然后 `domTo` 是 null → `domRanges.push` 永不跑 → `hit=undefined` → `if (!hit) return;` 直接退出, 光标没设
- **修复** `app.js:5310-5333`: 用 `domFrom.getBoundingClientRect()` 替代两个 rect; 加 `domRanges.length === 0` 兜底用第一个 range

### Bugfix 2: 损坏的 State.annotations 崩溃 renderCommentList
- **症状** (W6-08): 外部攻击 / 用户调试把 `comments: 'not array'` 写入 State, 触发 render 时 `replies.map is not a function` 崩整页
- **根因** `app.js:2212`: `(thread.comments || []).slice(1)` — 字符串 truthy 不走 `|| []` 分支, 然后 `.slice(1)` 返回字符串, `.map` 不存在
- **修复** `app.js:2212-2214`: `Array.isArray(thread.comments) ? thread.comments : []` 强制是数组

### Test
- `tests/chaos-wave5.spec.js`: 15 场景全过 (真实工作流)
  - W5_01: 50 个批注 全生命周期 (创建→resolve→unresolve→全删)
  - W5_02: 批注带 2 条回复 + reload
  - W5_03: 在 mark 内输入 (PM mark 跟随扩展)
  - W5_04: 跨 paragraph 同一 thread (multi-paragraph mark)
  - W5_05: 3 个重叠 mark
  - W5_06: 多 author 创建批注 (Alice + Bob)
  - W5_07: 三个 mark 各点击一次验证光标位置
  - W5_08: 空 doc + 空 annotation
  - W5_09: 50 mark + 滚动 storm
  - W5_10: 100 次 selection 高频采样 p50=0.2ms p95=5.8ms
  - W5_11: 嵌套 mark 切换 (修复后 OK)
  - W5_12: 创建→resolve→reopen→编辑
  - W5_13: Ctrl+Z 撤销 mark
  - W5_14: 删 inner mark, outer 仍存
  - W5_15: 真 DFC 3.3MB .mentor 加载 (53801 字符 + 7 图 + 1 thread)

- `tests/chaos-wave6.spec.js`: 15 场景全过 (UI / 视觉)
  - W6_01: 100 次快速点击 mark (p95=0ms)
  - W6_02: 极窄批注栏
  - W6_03: 多个 mark 连点
  - W6_04: resetHistory 清空
  - W6_05: dark mode 渲染
  - W6_06: filter tab 切换
  - W6_07: 1000 字符批注 + 5 个 500 字符回复
  - W6_08: State corruption (修复后 survived)
  - W6_09: 无 Service Worker (mentor 不该有)
  - W6_10: 并发 addReply
  - W6_11: 复杂用户流 (filter + resolve)
  - W6_12: 删整段 + mark 同步
  - W6_13: 隐藏右栏后点击 mark 仍工作
  - W6_14: readonly editor 模式点击 mark 仍工作
  - W6_15: drag file 到页面

### 测试基线
- **138 场景全过** (4 wave chaos 85 + wave5/6 30 + cap 16 + roundtrip 6 + cursor-fix 1)

### Chore
- `index.html` `app.js?v=109 → ?v=110`
- 测试新增 `tests/chaos-wave5.spec.js` + `tests/chaos-wave6.spec.js`

## v1.42.1 (2026-07-10) — v1.42 边界补全

### Bugfix: renderCommentList 软警告阈值
- **症状**: cap 改到小值 (如 200) 后, 用户继续加批注到 450 条, 应该看到 overflow 警告, 但**没有** (因为旧公式 `max(500, cap*2)` 在 cap < 500 时 hard-floor 到 500, 450 < 500 不触发)
- **修复** `app.js:2132`: 改为 `(State.maxAnnotations || 0) === 0 ? Infinity : cap * 2`. cap=50 → 软=100, cap=200 → 软=400, cap=500 → 软=1000. cap=0 (无限制) → 不警告

### Feature: 导入时 cap check + truncate
- `app.js:3084`: loadMarkdownIntoEditor 检查 `State.maxAnnotations`, 超出截断 + toast + setStatus 警告
- 不直接拒绝 (用户的旧 .mentor 可能有 1000+, 让他能进, 但多出来的会丢失)
- 接近上限 (80%) 时 warn

### Test
- `tests/cap-edge.spec.js`: 8 步全过
  - T1: ⚙ popover 在 1400x900 viewport 真实显示 (360x188 正常, 箭头位置正确)
  - T2: cap=50 时拒绝第 51 个 + toast
  - T3: 删几个后能继续创建
  - T4: import 150 个 → 截到 50 + warn toast
  - T5: import 170 个 (cap=200, 85%) → 接近上限 warn
  - T6: ⚙ + help 互斥 (开 settings 自动关 help)
  - T7: 改 cap 软警告阈值动态更新 (450 > 软=400 → overflow warn 显示)
- 暴露 findAnnotationRange / setMaxAnnotations / checkAnnotationCap 给测试 + 高级用户脚本

### 测试基线
- 4 wave chaos 85 + cap-fix 8 + cap-edge 8 + cursor-fix 1 + roundtrip 6 = **108 场景全过**
- perf-bench: 量化 baseline (已用 v1.42 cap 兜底, 真实用户不会触达 1000+ 区域)

### Chore
- `index.html` `app.js?v=108 → ?v=109`

## v1.42 (2026-07-10) — 批注数量硬上限 + 设置 UI

### 为什么改
v1.40 软警告 (数量 > 200 时显示警告, 不渲染卡片) 是 "**软退让**" — 没真正解决, 用户在 200+ 批注时**不能编辑/回复/解决** (没有 UI).

### perf bench 实测 (无 v1.42 修复时)
| N | insert→undo p95 | 用户感受 |
|---|----------------|----------|
| 10 | 4ms | 流畅 |
| 100 | 19ms | 轻微可感知 |
| 200 | 80ms | 明显卡顿 |
| 500 | 342ms | 输入冻结 |
| 1000 | 1793ms | 不可用 |

**结论**: 200+ 卡顿已成, 必须**阻止创建**而非 "渲染时跳过"

### 修复
1. `State.maxAnnotations`: 默认 500, 选项 50/200/500/1000/0(无限制), localStorage 持久
2. `checkAnnotationCap()` helper, 在 3 个创建入口 (createAnnotationThread, handleCreateMultiCellAnnotation, handleCreateMultiParagraphAnnotation) 检查, 拒绝 + toast
3. **⚙ 按钮** 在工具栏 (help 旁) + settings popover, 5 选项 + 当前计数显示 + Esc/外部点击关闭
4. v1.40 软警告从硬限 200 改为 `max(maxAnnotations * 2, 500)`, 兜底 import 大文件

### Test
- `tests/cap-fix.spec.js`: 8 步全过 (默认 cap 500 / cap 拒绝 / ⚙ 按钮 / popover UI / 改 cap → state + localStorage + toast)
- `tests/perf-bench.spec.js`: 量化 perf 改善基线
- 所有 4 wave chaos + roundtrip 仍然 100% 通过 (回归 0)

### Chore
- `index.html` `app.js?v=107 → ?v=108`
- 5 个测试文件 `?v=107 → ?v=108`

## v1.41 (2026-07-10) — bsk 真实回归 + 测试基建 + watchdog

### Bugfix: bsk 接管 Edge 跑 v1.40 暴露剩余 7 处崩溃
chaos wave 1-4 用 Playwright 没暴露但 bsk 真接管 Edge + pageerror 监听暴露:
- **scheduleIdbCacheWrite** `app.js:1068` `.map(t => ({ threadId: t.threadId ... }))` — State.annotations 含 null 时崩
- 5 个 `State.annotations.map(t => ({ threadId: t.threadId` 序列化点 (lines 1091, 1164, 4103, 4903, ai.listThreads) 全部加 `filter(t => t && typeof t === 'object' && t.threadId)` 防御
- `rebuildAnnotationMarks` line 2980 forEach 加 `if (!t || typeof t !== 'object' || !t.range) return` 防御

**为什么 chaos 没暴露**: chaos test 用 `page.evaluate()` 抛异常时 Playwright 立即返回, 后续 scenario 不跑; bsk 真接管下 pageerror handler 是连续监听的, 触发后下一次 evaluate 就能看到 broken state 渗到后续测试

### Test: 真实 .mentor roundtrip (DFC 3.3MB + 7 图 + 1 原批注)
- `tests/roundtrip-real-mentor.spec.js`: load fixture → 加批注 → 写评论 → resolve → buildMentorZipBlob → 验证 size 3.2MB + 7 mediaFiles
- 6 步全过, 0 page error

### Test: 键盘 a11y 8 场景
- `tests/a11y-keyboard.spec.js`: Tab → textarea/submit, Shift+Tab 回去, Enter toggle resolve, Escape 关菜单, Ctrl+Enter 提交 reply, 焦点环可见, html lang=zh-CN
- 8/8 全过

### Refactor: 共享 `_config.js` 自动检测 cache-bust
- `tests/_config.js`: 读 `index.html` 的 `app.js?v=N` 自动解析 CURRENT_VERSION, fallback 107
- 8 个测试文件改 `require('./_config').URL_BASE + '?v=' + require('./_config').CURRENT_VERSION`
- **好处**: 以后 bump cache-bust 只改 `index.html` 一处, 测试自动跟新, 杜绝 "改了 v=106 忘记改测试" 这种 bug (本次就踩过 3 次)

### CI: GitHub Actions chaos-tests workflow
- `.github/workflows/chaos-tests.yml`: push/PR/manual trigger, 跑全套 99 场景 (verify-cursor-fix + chaos×4 + a11y + roundtrip)
- timeout 15min, Playwright + Chromium headless, Ubuntu latest

### Tool: watchdog.py
- `scripts/watchdog.py`: 每 30 分钟读 `~/.hermes/todos.json`, 列 pending todo + 未 commit 改动, 推 hermes notify
- 用法: `python3 scripts/watchdog.py --loop` 或 cron / Windows Task Scheduler 每 30 分钟跑
- `scripts/watchdog.md` 用法文档

### Chore: cache-bust 同步 bump
- `index.html` `app.js?v=107`

## v1.40 (2026-07-10) — chaos test 4 轮 85 场景全绿 + 防御性修复

### Bugfix: 多处防御性修复 (由 chaos test 暴露)

#### 1. `renderCommentList` / `updateCommentCounts` 防御 null/string/缺字段
- **触发**: chaos S18: 用户在 State.annotations 里塞 [null, {threadId:'a'}, ..., 'string'] 时整个 app 崩
- **症状**: `TypeError: Cannot read properties of null (reading 'range' / 'resolved' / 'threadId')` at `app.js:2112`, `924`
- **修复**:
  - `app.js:2107` filter 阶段: `if (!t || typeof t !== 'object') return false`
  - `app.js:2111` sort 阶段: `typeof` 防御
  - `app.js:2123` visibleThreads: 过滤无 threadId 的损坏条目
  - `app.js:926` updateCommentCounts: 用 `safeAnn` 兜底

#### 2. `_validateMarksAfterEdit` 防御损坏 annotations
- **触发**: S18 — PM onUpdate → validateMarks 循环里 `ann.threadId` 崩
- **修复** `app.js:1026`: `if (!ann || typeof ann !== 'object' || !ann.threadId) continue`

#### 3. `addReply` / `toggleResolved` / `deleteThread` / `toggleManualCollapse` / `scrollToThread` / copy handler 防御
- 全部 `State.annotations.find` 加 `t && typeof t === 'object' &&` 保护
- `app.js:2003, 2023, 2058, 2308, 2392, 2421`

#### 4. `renderCommentList` 大数组性能保护
- **触发**: chaos S33: 10000 条 noise annotations 让 onUpdate → renderCommentList 卡死 (30s 超时)
- **症状**: O(N) 每次都全量 innerHTML 重渲染, N=10000 主线程卡死
- **修复** `app.js:2101`: `TOTAL_LIMIT = 200`, 超过时只显示警告 + tab 计数, 不渲染卡片
- 新增 CSS: `.comment-overflow-warn` (styles.css:1255)

### Test: 4 wave 85 场景全过
- `tests/chaos-suite.spec.js` (40 场景) — 边界 mark / 极端操作 / 异常数据 / 跨元素 / 编辑 / 边角
- `tests/chaos-wave2.spec.js` (15 场景) — 大文档 / 密集 mark / history / HTML / 8 色循环 / 跨段 / 100 mark / 大纲 / surrogate pair / 作者切换 / offline / blur-focus / 选全部
- `tests/chaos-wave3.spec.js` (15 场景) — 嵌套 mark / mark 跟随 edit / filter tab / AI storm / 复制粘贴 / resize storm / 拖选 / 表格 + mark / collapsed / 1000+ 字符 / float btn / 大纲跳转 / selection storm / 跨段 mark / 剪贴板
- `tests/chaos-wave4.spec.js` (15 场景) — thread 生命周期 / delete / add reply / 复制引文 / listThreads API / 中文文件名 / create+delete 风暴 / corrupt storage / table mark / image near mark / focus 风暴 / 跨 realm / IDB / undo-redo storm / 内存监控

每个 scenario 用独立 browser context + 30-60s hard timeout, 即使 app hang 也不影响后续

### Chore: cache-bust 同步 bump
- `index.html` `app.js?v=105 → ?v=106`

## v1.39 (2026-07-10) — mark 内点击光标舒服化

### Bugfix: 点击 annotation mark 边界时光标落在 mark 外 (用户原话 "插入光标不舒服")
- **症状**: 用户点 mark 左边缘 → PM `inclusive: false` 边界位置 (from / to) cursor 不带 annotation mark → 输入文字插入到 mark 外, 高亮"断裂" → 用户感觉光标位置与高亮不符
- **根因**: `setupAnnotationMarkClickObserver` 旧逻辑 `targetPos = pos` (= mark 起点 `from`) → 落在 mark 边界, 不在 mark 内
- **修复**:
  - 用 click X 坐标 vs mark 边界框中线: 左半 → `from+1`, 右半 → `to-1` (都在 mark 内, 都带 annotation mark)
  - listener 改 capture phase + `stopImmediatePropagation`, 抢在 PM 自己的 mousedown handler 之前
  - 兼容多段 mark (跨段 / table multi-cell): 按 clickY 命中对应 range
- **测试**: `tests/verify-cursor-fix.spec.js` 6 个点击位置全过 + typing 测试 (光标在内 + 输入字符继承 annotation mark)
- 边界防御: 多段 mark 时 clickX 判定可能不准, 兜底 `targetPos = from + min(1, halfWidth)` 确保光标至少在 mark 内

### Chore: cache-bust 同步 bump
- `index.html` `app.js?v=96 → ?v=101`

## v1.37 feat (2026-07-09) — 导出 .md / .docx 工具栏按钮

### Feat: 工具栏新增 #btn-export-md 与 #btn-export-docx
- 在"另存为"按钮后插两个按钮, SVG icon 走 CSS mask-image (downloadMd / downloadDocx SVG)
- `exportMd()`: PM doc → turndown markdown → `text/markdown` blob 下载, 文件名 `<basename>.md`
- `exportDocx()`: PM doc → JSZip 构造 OOXML docx 下载 (含 image, 粗体/斜体/code 等 inline run, H1-H3/列表/blockquote/code blocks)
- `buildDocxBlob(html, mediaFiles)`: 浏览器纯前端 docx 生成, 把 blob URLs 转 word/media/* 二进制
- 测试 `tests/verify-export-buttons.spec.js` 5 步全过 (含 JSZip 解 word/document.xml 验证)

### Fix: ESM module 闭包内 `Node` 全局是 undefined
- `processInlineContent` 用 `Node.TEXT_NODE`/`Node.ELEMENT_NODE` 比较 child.nodeType
- 在 ESM module closure 里 `Node` 是 undefined, 比较永远 false, out 永远 0
- **修复**: 用硬编码常量 `const TXT = 3; const ELEM = 1;`
- 这是为什么 docx 起初输出 `<w:p></w:p>` (paragraph empty) — 不是 OOXML bug, 而是 processInlineContent 静默不工作
- 教训: ESM module / module scope 不同于 classic script, 全局如 `Node`/`window` 不能直接访问, 用硬编码常量或 `globalThis`

## v1.37 (2026-07-09) — F-media 图渲染修复 + 段间距调整

## v1.37 / v1.38 (2026-07-09) — 段间距体系 em→px 回调

### Style: 段间距体系 v1.38 (em → px, 回调过头部分)
- `styles.css` 分层段间体系:
  - v1.35 默认 0.4em (6px) 偏紧
  - v1.36 调到 0.8em (12px) 标准
  - v1.37 调到 1.0em (15px) 宽松 — 但用 em 时 H1 1.8em 实测 51px (em × 自身 1.9em font-size),标题间距过头
  - **v1.38** 改成 px 锁值 + 回调标题间距:p+p 15px (用户确认 OK), p→H1 24px, H1→H2 21px, p→H2 21px, 块+块 27px
- 关键教训:CSS `em` 在 `margin-top` 是相对元素自身 font-size, heading 因为 1.9em 字号被倍乘;改用 px 或 rem (root font-size) 才一致

### Chore: cache-bust 版本号
- `index.html`: `app.js?v=45 → ?v=53`, `styles.css?v=42 → ?v=54`
- 浏览器 cache 必须手动 bump 否则 edit 不生效 (改了文件没刷页面 = 白改)

## v1.36 (2026-07-09) — F-media 图渲染修复 + status bar 图片状态 + 调试工具

### Bugfix: 跨 realm `.mentor` 加载 JSZip 拒读
- `app.js` `readMentorZip()`: File.arrayBuffer() 跨 iframe / cross-realm 时拿到 parent realm 的 ArrayBuffer,旧版 JSZip 拒读 ("Can't read the data of 'the loaded zip file'"). v1.35 试过 `new Blob([buf]).arrayBuffer()` 但 Blob 构造在同一 realm,没真跨 realm → 仍挂
- 真修法: `new Uint8Array(buf) → new Blob([typed]).arrayBuffer()`,字节真复制到当前 realm 后再喂 JSZip
- 触发场景: diag.html iframe 模式打开 .mentor

### Bugfix: `openFromMentorHandle` 漏注入 mediaUrls (handle 路径图全破图)
- `app.js` `openFromMentorHandle()`: 之前只取 `{mdText, annotations}`,丢 `mediaFiles`. DOM img 是裸 markdown 路径 (`<img src="media/image5.png">`),请求 server `/media/` 路径 404 → 全破图
- 修法: 跟 `openFromMentorFile` 对齐 — `revokeMediaUrls()` + 注入 `State.mediaUrls` / `State.mediaFiles`
- 触发场景: 用户通过 native file picker 打开 .mentor (handle 模式)

### Feature: status bar 显示图片渲染状态 (v1.34 schema 同期 UI 拓展, 首 commit)
- `app.js` `_doUpdateDocMeta`: 状态栏新增 `🖼 N/M (media=N)` 字段,N/M = complete/naturalWidth>0 / DOM img 总数;当 DOM 有 img 但 media=0 时加警告
- 帮用户排查"看不到图"问题,看 status bar 一眼知道是 img 没 load / url 失效 / 还是别的
- 历史:这功能是 v1.34 commit `a336761` 引入 .mentor v2 schema 时设计,但作者一直没 commit, v1.36 fix 过程中才把补丁附带一起入库

### Dev: 新增调试工具
- `diag.html`: 浏览器内 SPA 远程诊断, 按钮 1 跑 DOM diag、按钮 2/3 加载测试/用户 .mentor fixture
- `index-direct.html`: 强制 cache-bust 跳转 (`?v=N`)

## v2.1 (2026-07-05) — 当前活跃开发

### Feature: P0 #3 AI reply 并发锁 + 内容去重
- `app.js`: `ai.reply` 改 async + `Map<threadId, Promise>` 锁合并并发调用 (议长+参议同 threadId+body → 1 条 comment)
- 2s 内 body 内容去重 (幂等返回原 comment + `dedup: true`)
- 测试: TEST 116 (并发合并 + 串行 dedup + 不同 body 新建)
- 修复: TEST 109 / TEST 114 测试侧 `await F.ai.reply()` 缺失

### Feature: 双击 KaTeX 弹源码输入框
- `app.js`: `setupKatexDblClick` + `openEditModal` + `applyKatexEdit`
- 公式 atomic 不可直接编辑, 双击 → modal → `setNodeMarkup` 改 tex
- 测试: `e2e.spec.js` TEST 110

### Feature: 窄屏响应式布局
- `styles.css`: `grid-template-columns` 用 `clamp` + `minmax` 比例缩放
- `@media (max-width: 768px)`: 文件栏折叠到 48px
- `@media (max-width: 568px)`: 批注栏折叠, body.comment-pane-open 唤出
- `index.html` / `app.js`: 工具栏 `btn-toggle-comment-pane` + `Ctrl+.` 快捷键
- 测试: TEST 112

### Feature: AI 署名可动态配置
- `app.js`: `ai.__meta.setAuthor(name)` 切换署名
- `ai.__meta.author` getter 动态返回
- reply / needsReply 检测用动态值
- 测试: TEST 114

### Fix: 状态栏文档切换立即刷新
- `app.js`: `loadMarkdownIntoEditor` 入口立即清空 `status-right` + 写新文件名
- `updateDocMeta({immediate: true})` 跳过 200ms debounce
- debounce 从 250ms 收紧到 200ms
- 测试: TEST 113

### Security: innerHTML XSS audit + 守卫
- 全部 11 处 `innerHTML = ` 路径审计完毕
- 评论 body / thread text / author 都已 escapeHtml 包裹
- 增加 `e2e.spec.js` TEST 109: `<img onerror>` payload 注入 → 不解析为 HTML + 不触发 onerror

### Fix: P0-A 跨 tab 协调 — 任意 peer 变化重评估只读
- `app.js`: 提取 `_reevaluateReadOnly()` 通用函数
- onmessage 中 ping/pong/leave 都触发重评估 (isNewPeer 优化)
- 5s 心跳 `setInterval` 防 peer set 过期
- `_closeDocChannelFull` 接管 timer cleanup
- 测试: TEST 108 (双 tab 真实联动)

### Feature: 单 .md 模式 (删除 folder mode)
- `app.js`: 删除 `openFolder` / `openFolderLegacy` / `renderFileTreeFrom{Handles,List}`
- `HandleStore` bump DB_VERSION: 2 + 新 `files` store + `putFile`/`getFile`/`deleteFile`
- `putLastFile(fileName)` 移除 `folderPath` 字段
- `tryReconnect` 改为单文件重连
- `tryWriteBack` 文件夹分支删除
- `renderFilePaneCurrent` 折叠文件栏
- `setupEmptyTreeClick` → `openFiles()`
- `HandleStore` helper 抽象 (`_putInStore` / `_getAllFromStore` / `_deleteFromStore`)
- 兼容垫片 `renderFileTreeFrom{Handles,List}` 导出但 no-op

### Docs: README + help popover 更新
- 快速开始改 single .md mode 描述
- 调试 API list 更新为 `HandleStore.putFile/getFile/putLastFile`
- "开发" 段更新测试数: 54 → 107
- 删除 v1 "已完成" 状态面板 (搬到 CHANGELOG.md)
- `index.html` 帮助 popup 新增 "单 .md 模式" + "跨刷新重连" 项

### 测试
- v1: 105 → v2: 116 tests pass (114 + 1 新增 TEST 116 + 修复 TEST 109/114 await)
- p3a-active-mark: 56 tests pass
- e2e-annotation-overlap: 34/34
- e2e-comment-pane: 10/10
- verify-fixes: 13/13 pass
- e2e-soak: SOAK PASS, 0 error
- 6 个小 spec: 各自 pass

### 测试: 真鼠标拖拽 + 边界压测
- `e2e-mouse-drag.spec.js`: D1-D4 真鼠标拖拽选区 (PM selection 端点精确, 跨段落, 浮起按钮, 取消选区)
- `e2e-mouse-drag-stress.spec.js`: 50 轮随机拖拽 (heading/paragraph/list/code/table/blockquote), seed=42/1/7/13/99
- `e2e-mouse-drag-regression.spec.js`: 已知 flaky case (listItem/tableCell 端点 ±1-2 char 偏移, PM coordsAtPos 限制)

---

## v1 (2026-04 ~ 2026-06) — 早期开发

### 已完成 (迁移自 README "v1.x" 段)

#### M15 — Status bar 实时更新 (docx 一致)
- Status bar 加载时显示文件名 + 字数 + 行数 + 批注数
- 编辑后实时刷新（debounced 250ms via `updateDocMeta`）
- 实现：`app.js` `updateDocMeta()` 函数 + 4 处 hook（加载/创建批注/编辑 transaction/解决批注）
- 测试：TEST 104 + TEST 105 in `e2e.spec.js`

#### P3-A — Mark active class 持久化 (P3-A 回归保护)
- 点击 mark → 该 mark 标 is-active class，其他取消
- Schema attr `active` 同步到 PM state，刷新不丢
- 实现：`app.js` `highlightActiveMark()` 双 pass + `setupAnnotationMarkClickObserver()` mousedown 拦截
- 关键 fix：removeMark/addMark 不能在同 descendants callback 内连续做，会位置错位
- 关键 fix：mousedown 时主动 setTextSelection + focus 触发 onSelectionUpdate
- 测试：`e2e-p3a-active-mark.spec.js` 56 个 test

#### P-multi-para — 多段批注 status 提示
- 跨段落选区 → 创建多段批注 → status-left 显示 "已创建多段批注" (单段保持 "已创建批注")
- 修复 pre-existing baseline: e2e-multi-paragraph 5/6 → 6/6
- 测试：`e2e-multi-paragraph.spec.js`

#### 平台兼容
- e2e tests 在 WSL + Windows git-bash 都能跑（detectRoot 自动检测）
- 修过的 WSL hardcoded path 文件：`e2e.spec.js`, `e2e-p3a-active-mark.spec.js`, `e2e-long.spec.js`

### 设计稿
- `DESIGN.md`: 色板 / 字体 / 批注体系 / Do's & Don'ts / P0 数据安全 / P1 用户感知 / P2 异常防御 / 三栏布局 / Components
- 文档锚定所有 commit message

---

## 自动化生成

定期更新: `git log --oneline | head -20 >> CHANGELOG.md` 然后人工整理分类。
