# Mentor Changelog

按时间倒序记录已发布的变化。最新条目在上方。

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
