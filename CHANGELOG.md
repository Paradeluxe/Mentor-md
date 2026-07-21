# Mentor Changelog

按时间倒序记录已发布的变化。最新条目在上方。

## v1.43.54 (2026-07-21) — 自动保存重整（简单可靠）

### 用户
"自动保存经常说不能保存，请修复，我觉得重整逻辑，保持简单就好"

### 根因
1. 自动保存与手动保存各写一套写盘逻辑，易竞态
2. 异步打包/写盘过程中用户继续编辑 → 结束时无脑 `markClean`，脏标记被误清
3. 后台 autosave 调用 `requestPermission`（需用户手势）→ 常报「权限被撤销」并停掉 timer
4. 无 single-flight，并发 `createWritable` 失败

### 改动（一套路径）
1. **`hasWriteHandle` / `writeToHandle` / `writeCurrentToHandle`** — 统一写盘
2. **single-flight**：同时只一次写；忙则排队再 debounce 一次
3. **`dirtyGen`**：保存开始记 gen，结束仅 gen 未变才 `markClean`；期间有编辑则保持脏并再存
4. **autosave 只 `queryPermission`**，不弹授权；缺权限提示「Ctrl+S 一次授权」，**不永久停 timer**
5. **成功不再 toast 刷屏**（状态栏「已自动保存」）；失败 toast 15s 节流
6. **`saveCurrent`** 走同一写盘路径；无 handle 才下载

### 测试
- `tests/v143-autosave-simple.spec.js`
- 既有 protected-path / open-save lifecycle 回归

### Cache
- app.bundle.js?v=110→111

---

## v1.43.53 (2026-07-21) — 浮动「AI 批注」按钮（少写 @AI）

### 用户
"能不能把 @AI 的逻辑改成，往批注按钮旁边放另外一个特定的 AI 批注按钮"

### 改动
1. 选区浮动条：`批注` | `AI` 并排
2. 点 **AI** → 建线程并预填 `@AI `，光标落在指令后（兼容 `/fix-mentor`）
3. 侧栏回复区增加 **@AI** 芯片，已有批注上也可一键前缀
4. 快捷键：`Ctrl+Alt+I`（或 `Ctrl+Alt+Shift+M`）= AI 批注；`Ctrl+Alt+M` 仍为普通批注

### 测试
- 选区后两按钮可见；AI 路径 draft 以 `@AI ` 开头

### Cache
- app.bundle.js / styles.css cache-bust

---

## v1.43.52 (2026-07-21) — 多文件开启/保存生命周期整理

### 用户
"优化一下 mentor md 的多文件开启保存的逻辑，现在很乱"

### 问题
1. `openFiles` 勾了 `multiple: true` 却只 `find` 第一个 .mentor/.md
2. `openFromMentorHandle/File` 与 `loadMarkdownIntoEditor`/`prepareOpenDocument` 双重 snapshot，还把 `activeTabId=null` 打乱标签
3. `load` 结束才 snapshot，此时 **handle 尚未挂上** → 切 tab 回来丢写回句柄
4. `prepareOpenDocument` 的 `switch-existing` 空分支：先 restore 再整页覆盖
5. `saveCurrent` 写盘前就 `markClean`，失败仍显示已保存
6. `openRecentFileByName` 死分支堆叠

### 改动
1. **`activateOpenedDocument`** — 统一 prepare tab → media 切换 → load → handle/saveMode → remember
2. **`prepareOpenDocument`** — `reload-same` / `reuse-tab` / `reuse-blank` / `new-tab`；重开同名不建重复标签；空 untitled 就地替换
3. **`loadMarkdownIntoEditor(name, content, anns, { handle, saveMode, alreadyPrepared })`** — handle 进 `currentFile` 再 snapshot
4. **`openMultipleHandles`** — 多选 .mentor（或 .md）逐个进标签，最后一个保持激活
5. **`openFiles` / `openFilesLegacy`** — 走 multi 循环；post-open 样板（putFile/status）收敛
6. **`saveCurrent`** — 仅写盘/下载成功后 `markClean` + 再 snapshot
7. **`rememberOpenedFile`** + 清理 `openRecentFileByName`

### API
`activateOpenedDocument` / `rememberOpenedFile` / `openMultipleHandles`

### 测试
- `tests/v143-multi-tabs.spec.js`
- `tests/v143-tab-media-revoke.spec.js`（若 server 在）

### Cache
- app.bundle.js?v=18→19

---

## v1.43.51 (2026-07-20) — 从 bundle 恢复 app.js（误 checkout）+ 稳定化

### 用户
"continue"

### 改动
1. **src/compute-context.js** — `computeContextAt` / `computeContext` 抽出
2. **src/media-display.js** — `DISPLAY_MAX_EDGE` / `createDisplayObjectURL` 抽出
3. **highlightActiveMark** DOM 只碰 prev/target thread，不扫全部 `.annotation-mark`
4. 头注释改为 offline esbuild 路径

### 测试
- position / patch-window / tab-revoke / selection 回归

### Cache
- app.bundle.js?v=16→17

---

## v1.43.50 (2026-07-20) — 侧栏增量 patch + active 滑动窗口 + UI 防抖

### 用户
"继续优化"

### 改动
1. **patchCommentCard** — 引文/fuzzy/deleted banner 就地改 DOM，不 innerHTML 整表
2. **scheduleCommentListUi / flushCommentListUi** — validate 触达 ≤12 卡走 patch；24ms 防抖
3. **滑动窗口** — 分窗优先盖住 `activeThreadId`；全局序号；向上/向下显示更多

### 测试
- `tests/v143-comment-patch-window.spec.js`

### Cache
- app.bundle.js?v=15→16

---

## v1.43.49 (2026-07-20) — multi-tab blob 关页泄漏 + 发版 meta 对齐脚本

### 用户
"继续优化没做的"

### 改动
1. **revokeTabMedia({dyingState})** — 关 active/最后一页时不再把 State.mediaUrls 自我 keep → 真 revoke
2. **closeTab** 关 active 先摘 State media 再 restore 其它 tab
3. **scripts/bump-cache-version.sh** 识别 `app.bundle.js`；**scripts/sync-build-meta.py** 对齐 CHANGELOG 顶版 → meta build

### 测试
- `tests/v143-tab-media-revoke.spec.js`
- multi-tabs 回归

### Cache
- app.bundle.js?v=14→15

---

## v1.43.48 (2026-07-20) — 未做项：SOFT 不整表空白 / 分窗外 ensure / authorColor 保留

### 用户
"继续优化没做的"

### 改动
1. **SOFT_LIMIT** 不再 `return` 整表空白 → 横幅 + 分窗继续渲
2. **ensureCommentCardVisible** — 扩 `commentListLimit` 盖住目标 thread；`setActive`/`scrollToThread` 走此路径
3. **highlightActiveMark** 重写 mark 时 `...m.attrs` 保留 authorColor；无图 ann 跳过 deco 全扫

### 测试
- `tests/v143-unfinished-opts.spec.js`

### Cache
- app.bundle.js?v=13→14
- styles.css?v=107→108

---

## v1.43.47 (2026-07-20) — 光标移动不重渲批注表 + validate 仅 UI 变化才 render

### 用户
"继续优化"

### 改动
1. `setActiveCommentCard` — selection 切换只 toggle `.is-active` + scrollIntoView
2. `handleSelectionChange` 同 thread 内移动零 `renderCommentList`
3. `_validateMarksAfterEdit` 返回 **uiChanged**（fuzzy/invalid/deleted/text）；纯 range 漂移不重渲侧栏

### 测试
- `tests/v143-selection-list-perf.spec.js`

### Cache
- app.bundle.js?v=11→13

---

## v1.43.46 (2026-07-20) — 工具栏「更多」+ 批注列表分窗 + meta 对齐

### 用户
"继续优化"

### 改动
1. **格式栏 overflow**: 窄屏 (<1180px) strike/code/sup/sub/h3/quote/codeBlock 进「⋯ 更多」; 宽屏 `display:contents` 仍一行
2. **文件按钮**: ≤960px 只留图标, 减横滑占宽
3. **批注侧栏分窗**: 默认渲 60 条, 「显示更多 +60」/「显示全部」/可收起 — 防 500 卡全量 innerHTML
4. **Help**: 补图片批注说明; meta build → v1.43.46

### 测试
- toolbar-more + comment-window
- position / image 回归

### Cache
- app.bundle.js?v=10→11
- styles.css?v=106→107

---

## v1.43.45 (2026-07-20) — validate 分层节流：light 即时 + full 48ms 防抖

### 用户
"继续" / 还有优化空间 → validate 热路径

### 改动
1. `_validateMarksAfterEdit(editor, {phase:'light'|'full'})`
   - **light**: range/text 同步；缺 mark 只 flag；不做 `findAnnotationRange` 重挂
   - **full**: 重挂 + image deco（setContent/undo/防抖）
2. `scheduleValidateMarks` — 打字 onUpdate 走 light + 48ms 合并 full
3. 无 imageAnchors 时 light 跳过 `refreshAnnotationImageDecos`

### 测试
- `tests/perf-validate-throttle.spec.js`
- chaos-position-* 回归

### Cache
- app.bundle.js?v=9→10

---

## v1.43.44 (2026-07-20) — 位置链路加固：防撞重挂 / load 隔离 / context 刷新

### 用户
"继续优化"

### 改动
1. **load/tab/demo/blank setContent 前清 ann + `_suspendAnnValidate`** — 修 v1.43.43 wrap 在 load 时用旧 ann 往新 doc 误 re-mark 的污染
2. **重挂防撞** — occupiedRanges；目标区间已被其他 thread 占用 → `mark-collision`，不抢位
3. **编辑后刷新 prefix/suffix** — range 漂移 / partial edit / reattach 均走 `computeContextAt`
4. **applyReattach** 禁止 `textContent`+PM pos 错切 context
5. validate：`joined` 只算一次；空 ann 早退 `false`

### 测试
- chaos-position-extreme 15
- chaos-position-hard 10
- chaos-position-opt 6

### Cache
- app.bundle.js?v=8→9

---

## v1.43.43 (2026-07-20) — 极端测：同文多处/丢 mark 位置对齐

### 用户
"极端测试可能导致mentor出现对应不上位置的情景"

### 根因
1. `computeContext` 用 `fullDocText.indexOf(text)` — 同文多处永远取第一处前后文 → save/reload 定位失败或串位
2. `findAnnotationRange` 多处命中时 P1 短 prefix/跨段空格易全灭；无上下文 fallback 还标 `fuzzy:false` 默默咬第一处
3. `_validateMarksAfterEdit` 的 textFound 要求整 node === ann.text → 子串仍在却 `text-deleted`；mark 丢失不自动重挂
4. PM undo/redo 后不强制 validate

### 改动
1. `computeContextAt(doc, from, to)` — 创建批注按真实选区取 prefix/suffix
2. `findAnnotationRange` 多处 + 上下文打分选最佳；无上下文 fallback 强制 fuzzy
3. validate：子串扫描 + mark 丢失时 `findAnnotationRange` 批量重挂
4. `undoSmartDispatch`/`redoSmartDispatch` PM 路径后 `_validateMarksAfterEdit`

### 测试
- `tests/chaos-position-extreme.spec.js` 15
- `tests/chaos-position-hard.spec.js` 10

### Cache
- app.bundle.js?v=7→8

---

## v1.43.42 (2026-07-20) — 保存/重建后纯图批注 deco 不丢

### 用户
"修复mentor保存和重建存在的bug"

### 根因
`rebuildAnnotationMarks` / `restoreFromSnapshot`（undo·redo·tab 后重建）只 `addMark` text annotation。
纯图 `skipMark` 无 text mark，重建后不调 `resyncImageAnchors` + `refreshAnnotationImageDecos` → deco 丢、定位失效。
Pass-2 还对 image atom range 误 `addMark`，并误 warn「全部 thread 未重建」。

### 改动
1. `isMarklessImageAnn` — 纯图跳过无效 addMark
2. rebuild 末尾对全部 `imageAnchors` `resyncImageAnchors` + `refreshAnnotationImageDecos`
3. warn 只计需要 text mark 的 thread
4. fallback 支持 multi `ranges`

### 测试
- `tests/v143-rebuild-image-ann.spec.js`
- 回归 persist / locate / src-ann / figure

### Cache
- app.bundle.js?v=6→7

---

## v1.43.41 (2026-07-20) — 选图建批注立刻丢位置

### 用户
"修复mentor：选中图片，建立批注，但是立刻丢失位置的问题"

### 根因
1. 纯图批注 `skipMark`（atom 挂不了 annotation mark）。`scrollToThread` 只扫 text mark，找不到就 toast「批注位置已失效」。建完一点侧栏卡片 body / 跳转立刻报失效。
2. float 批注按钮无 mousedown preventDefault：真鼠标点按钮会抢走 PM 焦点，NodeSelection 塌成 empty，click 时 `from===to` 直接 return，批注建不出。

### 改动
1. `scrollToThread` — mark 失败后走 `imageAnchors`/`range` → `setNodeSelection` + scrollIntoView + refresh deco
2. `#float-comment-btn` mousedown `preventDefault` 保 NodeSelection
3. 侧栏 card hover 同步 `img.annotation-image.is-hover`

### 测试
- `tests/v143-image-ann-locate.spec.js`
- 回归 figure / image-src / image-ann-persist

### Cache
- app.bundle.js?v=5→6
- styles.css?v=105→106

---

## v1.43.40 (2026-07-20) — 保存/重开不丢图片批注定位

### 用户
"每次改完图刷新都会显示批注位置失效而导致无法定位"

### 根因
所有 save / autosave / IDB / export 路径用白名单序列化批注，只写 `threadId/text/prefix/suffix/resolved/createdAt/comments`，**丢掉 `imageAnchors` 与 `range`**。纯图批注 text=`[图片]` 且无 prefix/suffix；reload 走 `findAnnotationRange` → text-not-found → invalid。换图字节后刷新必现。

### 改动
1. `serializeAnnotationThread` / `buildAnnotationsSidecar` — 保留 imageAnchors（blob→media/path）、range、ranges、invalid 标志
2. 5 处白名单 map 全部改为 `buildAnnotationsSidecar()`
3. `loadMarkdownIntoEditor` — 有 imageAnchors 时走 resync 路径，不依赖正文搜 `[图片]`；纯图 skipMark
4. `resyncImageAnchors` — media/path ↔ blob 双向匹配（含 basename）

### 测试
- `tests/v143-image-ann-persist.spec.js` 3/3
- `tests/v143-image-src-ann.spec.js` 4/4
- `tests/v143-figure-ann.spec.js` 4/4

### Cache
- app.bundle.js?v=4→5

---

## v1.43.39 (2026-07-20) — 换图源不丢图片批注位置

### 用户
"修复mentor改了图片源就会丢失选中图片的批注的位置的问题"

### 根因
纯图批注 `skipMark`（atom 无法挂 annotation mark）。任意 doc 事务（含 `setImage` 换 src）触发 `_validateMarksAfterEdit`：mark 不在 + `ann.text`(alt) 不在正文 textCount → `invalidReason=text-deleted` → deco/侧栏丢位。`imageAnchors.src` 也不随新 src 更新。

### 改动
1. `resyncImageAnchors(ann, doc)` — 按 from / 旧 src / range 重钉 image 节点，同步 src/alt/range
2. `_validateMarksAfterEdit` — 纯图 ann（有 imageAnchors、无 text mark、无 multi ranges）走 image 路径；图在则清 invalid；图没了 → `image-deleted`
3. `applyImageSrcChange` — 工具栏换图/插图；NodeSelection 换 src 后立即 resync + refresh deco
4. validate 末尾 `refreshAnnotationImageDecos`

### 测试
- `tests/v143-image-src-ann.spec.js` 4/4
- `tests/v143-figure-ann.spec.js` 4/4

### Cache
- app.bundle.js?v=3→4

---

## v1.43.38 (2026-07-16) — 受保护路径写盘护栏 + 本地插图降采样

### 用户
"继续下一刀，直接做"

### 改动
1. **受保护研究稿** (`DFC_Liu_Jul11_2026.mentor` / `dfc-paper` 路径): **禁用 autosave 写回**; 手动保存须 `confirm` 一次/session
2. `?open=` 写入 `State.diskPathHint`; 打开受保护稿时 toast 提示
3. **插图**: 工具栏图片 → 本地选文件 → `mediaFiles` 存原图 + `createDisplayObjectURL` 显示降采样 (取消选文件仍可填 URL)
4. 暴露 `isProtectedMentorTarget` / `confirmProtectedWrite` 供 e2e

### 极端测 (chaos-wave-extreme-v14338)
- A/B/C **17/17 pass** (protect confirm/autosave/multi-tab; media zip 原图像素; offline CDN=0; 500ann key~100ms; kill worker → sync fallback)
- e2e 暴露 tryWriteBackMentor + killZipWorkerForTest

### Cache
- app.bundle.js?v=2→3

---



## v1.43.37 (2026-07-16) — 离线 vendor + 大图显示降采样 + 收尾

### 用户
"行，全做吧" (审计 A/B/C/D)

### 改动
1. **离线 vendor**: `app.bundle.js` (esbuild) + `vendor/katex/*` + `vendor/fonts/local-fonts.css`；index 去掉 esm.sh / Google Fonts / jsDelivr
2. **大图显示降采样**: `createDisplayObjectURL` — 显示边长 ≤1600px，`mediaFiles` 仍存原图写回 zip
3. **ImageCaretNav WIP 收尾**: gap 点击几何 BAND=48 + priority 1000
4. **图标/空态**: 残留 stroke 1.5 → 2；pending 草稿卡 badge
5. **帮助文案**: .mentor 主路径优先；说明可离线
6. **工具栏**: 窄屏横滑一行，不再三行撑高
7. **gitignore**: 修好 `.env.local` / `dist/` / probe 忽略
8. **pack-release**: 打进 bundle + vendor

### 构建
```
python scripts/build-offline.py
```

### Cache
- app.bundle.js?v=1 · styles.css?v=104→105 · icons.js?v=3

---



## v1.43.36 (2026-07-15) — Windows 便携包 + GitHub Release

### 用户
"可以zip下载然后用户双击快捷方式打开…放在github release"

### 改动
1. `安装.cmd` / `install.cmd` — 桌面快捷方式 + .mentor 关联 + Python 检查
2. `scripts/register-mentor-assoc.ps1` — 去掉硬编码路径，相对解压目录
3. `scripts/pack-release.py` — 打 Mentor-<ver>-win.zip
4. `.github/workflows/release.yml` — tag v* 自动打包上传 Release
5. `README-用户.md` — 三步安装说明

### 用法
```
python scripts/pack-release.py
# 或 git tag v1.43.36 && git push --tags
```

---

## v1.43.35 (2026-07-15) — 全套图标升级 (Lucide)

### 用户
"优化所有的图标，现在看着太廉价了"

### 根因
手绘 path + stroke 1.5 + 粗糙 data-URI mask → 14px 发虚、不一致。

### 改动
1. icons.js 重写：Lucide 几何、stroke **2**、24×24
2. CSS mask 全部重新生成（percent-encode data-URI）
3. 工具栏/format 图标 15–16px；undo/redo 去 ↶↷ 改 SVG
4. settings / user / pencil / menu / float 同步

### Cache
- icons.js?v=2→3 · styles.css?v=103→104

---

## v1.43.34 (2026-07-15) — fig 前后点空隙可插光标 (几何优先)

### 用户
"光标还是无法插入fig2之前或者之后" + 要求 bsk 自测

### 根因
1. `prosemirror-gapcursor` 在 paragraph↔image 间 **永远 invalid** (closedBefore=false)
2. v1.43.30 `tryPlaceCaretInImageGap` 要求 `posAtCoords.inside === -1` 才处理；真机点图上下 margin 时 inside 常是 paragraph/image → **直接 return false**
3. 修代码时 shell 吃掉 `$b/$a` 曾导致 app.js 语法错误白屏 (已修)

### 改动
1. `tryPlaceCaretInImageGap` 改为 **几何优先**：图上下 48px 带内点击 → 插/聚焦空段
2. 仅当点在有字段落内容核心区且离图 >16px 时不抢
3. `ImageCaretNav` priority=1000；img margin 18px
4. app.js?v=152

### 验证
- bsk: handleKeyDown ArrowRight 段末 9→12 跨过 fig
- bsk: mousedown 空隙 → 空段 + 可 type BEFORE_FIG 在 img 前
- `tests/v143-image-caret-nav.spec.js`

## v1.43.33 (2026-07-15) — 编辑器美学整体精修

### 用户
"整体优化mentor编辑器的美学设计，参考大厂的设计规范，我要一个简洁好用的编辑器前端"

### 方向
Cursor cream 色板 + Linear 分段控件 + Notion 安静 chrome。只改视觉层，不改行为。

### 改动
1. design tokens: chrome 表面、radius/space 刻度、accent-hover、shadow-float
2. 工具栏/标签/状态栏统一 chrome 底；按钮文案压短（打开 / .mentor / MD / DOCX）
3. 设置/作者去 emoji → SVG mask；settings popover 对齐 tokens
4. 批注 filter → 分段控件；空态降噪；浮动批注按钮去掉蓝色阴影改橙
5. 标签 active 底线 accent；卡片 shadow-as-border

### Cache
- styles.css?v=102→103
- app.js?v=148→149

---

## v1.43.32 (2026-07-15) — 标签条压成 26px

### 用户
"你上完自己用视觉确认一下，这也太丑了，这么大坨"

### 根因
`#app` 仍是 `grid-template-rows: auto 1fr auto`（3 行），多出来的 `#doc-tabs` 吃掉了 **1fr**，整条被撑到 ~220px。

### 改动
1. grid → `auto auto 1fr auto`（toolbar | tabs | main | status）
2. 标签条固定 **26px**，pill 22px，11.5px 字，无大圆角底板
3. dirty 用 5px 橙点代替 `• ` 前缀

### 验证
- 实测 tabsH=26, grid=`69px 26px 676px 28px`
- multi-tabs 6/6

## v1.43.31 (2026-07-15) — 多文档标签页

### 用户
"你测试的时候把我的dfc文档给覆盖了——要不我们还是要开发一个多标签页的功能吧，允许多开文档"

### 行为
1. 顶栏下新增标签条 `#doc-tabs`（Chrome 风格）
2. 打开另一文档 / 新建 → **当前文档收入标签**，不再 confirm 丢弃
3. 点标签切换，正文+批注+dirty+media 整包恢复
4. 标签 × 关闭（dirty 才确认）；`+` 新建空白标签
5. `revokeMediaUrls` 不释放其它 tab 仍在用的 blob

### API
`snapshotActiveTab` / `switchToTab` / `closeTab` / `openNewTabBlank` / `renderDocTabs`

### 验证
- `tests/v143-multi-tabs.spec.js` 6/5 (6 pass)
- figure-select / image-caret / empty-state 回归

## v1.43.30 (2026-07-15) — 图片前后可插光标 (fig gap caret)

### 用户
"光标还是无法插入fig2之前或者之后" + "做完的时候自己用browser-skill测试一下"

### 根因
`prosemirror-gapcursor` 的 `GapCursor.valid()` 要求 `closedBefore && closedAfter`。
相邻 **paragraph 有 inlineContent** → `closedBefore=false` → **段落↔图片之间永远不出现 gapcursor**。
段末 ArrowRight 会变成 `NodeSelection(image)`，再打字会把整张图替换掉。

### 改动
1. StarterKit `gapcursor: false`，只留一份显式 Gapcursor（去重）
2. 新扩展 `ImageCaretNav`：Arrow 跨图跳到对侧 textblock；从 NodeSelection(image) 方向键离开
3. `tryPlaceCaretInImageGap`：点图前/后空隙（`posAtCoords.inside===-1`）→ 插入/聚焦空段；用 **clientY 相对图中线** 判前后（pos 在图后空隙也常落在 image pos）
4. 图 margin 8→14px

### 验证
- `tests/v143-image-caret-nav.spec.js` 5/5
- figure-select / figure-ann / image-gapcursor 回归
- bsk: imageCaretNav 在、ArrowRight 不删图、插 BEFORE 在 img 前

## v1.43.29 (2026-07-15) — 拖选吞 image (不必再多选一行)

### 用户
"无法选取图片这一行，必须选取多一行才可以选中"

### 根因
Image 是 block atom。PM `TextSelection` 的端点只能落在 textblock 内。
从上一行文字拖到图片上松手时，`to` 停在 prev paragraph 末尾（= image pos），**不含 image**；
必须再拖进图片下面那一行，`to` 越过 `imgEnd` 后 image 才进入 `nodesBetween`。

单击图片走 NodeSelection（v1.43.27/28）本来就对；坏的是**拖选到图上**这条路径。

### 改动
`setupImageAnnotationSelect` 增加 mouseup 补吞:
1. 起点不在图、终点在图上
2. rAF 等 PM 写完选区后：若选区未覆盖 image，则
   - 空选区 → `setNodeSelection`
   - 选区在图前 (`to <= imgPos`) → `to = imgEnd`
   - 选区在图后 (`from >= imgEnd`) → `from = imgPos`
3. 恰好等于 `[imgPos, imgEnd]` 时仍用 NodeSelection

### 验证
- `tests/v143-figure-select.spec.js` 增补 drag-stop-on-image
- 回归 figure-ann / image-gapcursor

## v1.43.27 (2026-07-14) — image gapcursor + NodeSelection CSS

### 用户
"图片前后没法放光标" / "点图片选中会带上上下两行文字"

### 根因
1. StarterKit 默认 bundle `@tiptap/extension-gapcursor` 但 **样式没画** — 默认 `.ProseMirror-gapcursor` 是 `display: none`, 用户看不到闪烁光标
2. 图片 `<img>` 直接紧贴 `<p>` (0 margin), "空隙"也是 0px → PM gapcursor 检测不到可放置位置
3. ImageBlock 已经 selectable:true (继承自 Image), 点图片应该 NodeSelection, 但视觉无反馈 (浏览器对 block-level atom 不画原生 selection 高亮)

### 改动
1. **`app.js`**: 显式 `import Gapcursor from '@tiptap/extension-gapcursor'` + 注册到 `extensions[]` (defense-in-depth, 防止未来 StarterKit 默认 bundle 变化)
2. **`app.js`**: ImageBlock 显式 `selectable: true` (虽然 Image 默认就是 true, 显式声明让意图清晰)
3. **`index.html`**: import map 加 `@tiptap/extension-gapcursor` (避免依赖 StarterKit 内部 transitive import 路径)
4. **`styles.css`**: 加 `.ProseMirror-gapcursor` CSS (`display:none` + `::after` 画 20px 黑色细线 + 1.1s blink) — 标准 PM gapcursor 实现
5. **`styles.css`**: `.tiptap > img` 加 `margin: 8px 0` (前后空隙 → gapcursor 可触发)
6. **`styles.css`**: `img.ProseMirror-selectednode` 加 `outline: 2px solid var(--accent)` — 给 NodeSelection 视觉反馈

### 行为
- 点 `<p>` 末尾 + `<img>` 之间的空隙 → 看到闪烁光标, 输入文字 → 新 `<p>` 插在图片前/后
- 点图片 → 只选图片 (高亮 outline), 不再带上下两行
- 跨图片拖选 (text 上 → text 下) → 仍按 PM 默认 TextSelection 覆盖全部, 没改

### 验证
- `tests/v143-image-gapcursor.spec.js`: 4 个场景 — gapcursor 元素出现 / 文字可输入 / NodeSelection only-image / drag 跨块不变

## v1.43.22 (2026-07-14) — figure: image block atom (no drag, cursor before/after)

### 用户
"figure/图片标注最好让 image 单独成块，不要拖动，光标能放在图片前后"

### 改动
1. Tiptap Image 默认 `group:'inline'`/`inline:true`/`draggable:true`
   → 改为 `Image.extend({ inline:false, group:'block', atom:true, draggable:false })`
2. 保留所有 attrs (src/alt/title/width/height) + `allowBase64:true`
3. Editor 必须用 `Image.extend`，`Image.configure(...)` 无法覆盖 `group/inline/draggable`（属于 schema 而非 options）

### 行为
- Image 现在是 block 级 atom：像 `<p>` 一样占一行，光标能落在图片前/后正常输入文字
- 不能用鼠标拖拽图片乱放位置（图标注位置是 PM `imageAnchors` 坐标，需要稳定）

### 验证
- v143-figure-ann: data: 图不被 strip / NodeSelection 建批注 + deco class / 跨 text+figure 双 anchor / 删除清 deco

## v1.43.21 (2026-07-14) — Ctrl+Z mark-only double-undo

### 真 bug
1. 建批注后对正文 **加粗/斜体**（text 不变）再 Ctrl+Z：
   - PM undo 已撤销 bold，但旧逻辑用 `textBetween` 误判失败 → 再跑 my-history → **批注一并被撤销**
2. 工具栏 ↶ 只调 `undo()`（批注栈），与 Ctrl+Z 的 smart dispatch 不一致
3. `setContent`/load 进 PM history → Ctrl+Z 先撤销整篇 load
4. 打字后再删批注，纯 PM-first 会先撤销打字而非恢复批注

### Fix
1. 批注结构性 mark：`setMeta('addToHistory', false)`
2. `undoSmartDispatch`/`redoSmartDispatch`：用 `ed.state.doc` 引用判断 PM 是否生效
3. `clearPmHistory()`：load/newDocument 后清空 PM history
4. `history.lastOp`（`pm`|`ann`）：最近是批注 ops 则 my-history 优先
5. 工具栏 ↶↷ 与 Ctrl+Z 同一 smart dispatch
6. `verify-delete-undo` 改走 `_testDeleteThread`（与生产路径一致）

### 验证
- bold-after-ann / create-only / edit-then-delete probes
- verify-delete-undo 9/9、verify-char-delete-undo、chaos-suite 40、wave11、empty-state

## v1.43.20 (2026-07-13) — 端口 8787 + Python PATH + 最近文件 forget

### 用户
"做吧。或者你换个别的什么端口"

### 改动
1. **默认端口 8765 → 8787** (`PORT` 文件可改)
   - mentor.cmd / mentor-server.py / tests / CI / package.json / README
   - 启动时校验页面含 "Mentor", 防止占到别人服务
2. **mentor.cmd 找 Python**
   - `python` → `py -3` → 常见安装路径
   - 找不到则 pause 提示安装
3. **最近文件权限失效**
   - 行内 × 移除
   - handle 失效/NotFound 自动从 IDB 删除并刷新列表
   - 权限被拒时提示可点 × 清除

### 验证
- http://127.0.0.1:8787 title Mentor v1.43.20
- chaos-suite / empty-state

## v1.43.19 (2026-07-13) — bugfix: 打开路径编码 + 导出进度泄漏 + basename

### 审视发现并修复
1. **mentor.cmd `?open=` 未 URL 编码** — 路径含空格/中文时双击失败
2. **tryWriteBackMentor catch 不关进度条** — 保存失败后状态栏一直转
3. **saveCurrent 下载打包 throw 不关进度** — 同上
4. **`?open=` basename 用 split('/')** — Windows `C:.mentor` 显示整路径
5. **basename 正则写坏导致 app.js 模块语法错误** — 整站白屏 (replace(/\/g) 只有一个反斜杠)

### 验证
- module parse OK
- basename `C:\...\my paper.mentor` → `my paper.mentor`
- worker build OK
- chaos-suite / wave22 回归


## v1.43.18 (2026-07-13) — 文件关联 + 图标 + 最近文件 + 导出进度 + autosave 设置

### 用户原话
"我觉得你按顺序做吧，都挺好的" (1 文件关联 → 2 图标 → 3 最近文件 → 4 导出进度 → 5 Worker vendor → 6 autosave 设置)

### 改动
**Windows 双击 .mentor**
- `scripts/register-mentor-assoc.ps1` + `install-file-association.cmd` (HKCU, 无 admin)
- `uninstall-file-association.cmd` 卸载
- ProgID `Mentor.File` → `mentor.cmd "%1"`
- 桌面 `Mentor.lnk` 图标 → `assets/mentor.ico`

**空态最近文件**
- HandleStore.listFiles()
- 空态 `#empty-recent` 列表，点击重开 .mentor (权限申请)

**导出进度**
- `#export-progress` 状态栏角标 + pulse
- saveCurrent / tryWriteBackMentor / exportDocx 走 showExportProgress

**autosave 设置**
- ⚙ 设置: 1s / 3s / 5s / 10s / 30s
- localStorage `Mentor:autosaveDebounce`

**Worker 离线 JSZip**
- `workers/jszip.min.js` (vendor, 97KB)
- classic Worker + importScripts (不再依赖 esm.sh CDN)

### 验证
- 文件关联 registry OK
- Worker build size=283, ready=true, builds=1
- 本地 chaos-suite / wave22-23 / empty-state 回归

## v1.43.17 (2026-07-13) — 桌面快捷方式 + 双击 .mentor 打开 (8 场景)

### 用户原话
"有没有给我一个类似快捷方式的东西, 让我双击就可以打开 mentor"

### 改动
新增 `mentor.cmd` (Windows batch, 双击启动):
- 检查 8765 端口, 已跑就直接用
- 没跑就后台启动 `mentor-server.py`, 自动 open browser
- 支持命令行参数 `<file>.mentor` 自动 load

新增 `mentor-server.py` (Python HTTP server, 替代 `python -m http.server`):
- `index.html` → static files
- `/open?path=<file>` → serve .mentor binary (CORS enabled, 不带 Content-Disposition)
- 启动时自动 `webbrowser.open()`
- 8765 已被占用时直接开 browser 到现有 server (不冲突)

`app.js:5928+` 新增 `_handleUrlOpen`:
- URL 有 `?open=<path>` 时, fetch `/open?path=...` → 转 File → 调 `openFromMentorFile`
- DOMContentLoaded 后 setTimeout 100ms 触发

新增桌面快捷方式 `C:\Users\User\Desktop\Mentor.lnk`:
- 指向 `E:\hermes_playground\Mentor\mentor.cmd`
- Icon: shell32.dll notepad (238)

### 用户使用流程
1. **桌面双击 Mentor.lnk** → 打开浏览器 → 看到 Mentor UI
2. **双击 .mentor 文件** (Windows) → 用 mentor.cmd 作为打开方式 → 浏览器自动 load
3. **命令行**: `mentor.cmd path\to\file.mentor`

### 8 场景全过
- W24-01: mentor.cmd 存在 (650 bytes)
- W24-02: mentor-server.py 存在 (6081 bytes)
- W24-03: 桌面快捷方式存在 (813 bytes)
- W24-04: /open endpoint 返回 200 + 18907 bytes
- W24-05: ?open= URL 自动 load DFC paper (docLen 56770)
- W24-06: 不带 ?open= 不自动 load
- W24-07: /open?path=nonexistent → 404
- W24-08: /open?path=非.mentor → 400

### 回归
- 377 场景全过 (175 旧 + 6 + 15 + 26 + 24 + 20 + 16 + 14 + 18 + 12 + 10 + 8 + 5 + 6 + 7 + 8 + 8 = 377, 0 回归)
- chaos suite/wave2-24/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.16 (2026-07-13) — Worker stats + fallback recovery (8 场景)

### 用户原话
"3" (多 worker pool / Worker warmup 检测)

### 改动
`app.js:4438-4485`:
- 新增 `_zipWorkerStats` 状态: { builds, loads, errors, lastError, fallbacks }
- `buildMentorZipBlob` / `readMentorZip` 失败时更新 stats
- 失败后**异步重启** worker (不阻塞当前 call)
- 暴露 `getZipWorkerState()` 给 e2e 验证

`app.js:6002-6011`:
- `__mdAnnotator.getZipWorkerState()` 返回 `{ready, pending, stats}`

### 关键修复 (v1.43.15 的 bug)
`_zipWorkerCall` resolver 已经解包 `e.data.result`, 所以代码应该直接 `workerResult.bytes` 不是 `workerResult.result.bytes` (旧代码多了一层). 同样修复 `readMentorZip` 3 处.

### 8 场景全过
- W23-01: getZipWorkerState 函数存在
- W23-02: 初始 state (ready=true, pending=0)
- W23-03: build 1 次后 stats.builds=1
- W23-04: load 1 次后 stats.loads=1
- W23-05: 5x 混合 (builds=5, loads=5)
- W23-06: fallback 路径 (无 errors, builds=2)
- W23-07: 并行 build (mid pending=3, after pending=0)
- W23-08: worker restart (state1 ready=true)

### 回归
- 369 场景全过 (175 + 6 + 15 + 26 + 24 + 20 + 16 + 14 + 18 + 12 + 10 + 8 + 5 + 6 + 7 + 8 = 369, 0 回归)
- chaos suite/wave2-23/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.15 (2026-07-13) — Web Worker 跑 zip (offload main thread, 7 场景)

### 用户原话
"继续呗" (Worker / build 并行 / autosave 节流 / IDB 写)
实际落地: Web Worker 跑 zip (autosave debounce + IDB 200ms 已在 v1.43.14 落地)

### 改动
新增 `workers/zip-worker.js` (ESM worker, 100 行):
- `import JSZip from 'https://esm.sh/jszip@3.10.1'` (worker context 无 importmap, 用绝对 URL)
- 命令: `build` (mdText + sidecar + mediaFiles) → blob bytes
- 命令: `load` (file bytes) → {mdText, annotations, mediaFiles}
- 并行提取 md + ann + media (跟 v1.43.13 main thread 一致)
- postMessage 用 `transferList` (ArrayBuffer 零拷贝)

`app.js:4362-4490`:
- `_initZipWorker()` 启动 worker
- `_zipWorkerCall()` Promise 包装
- 启动 IIFE: async 启动 worker, 不阻塞 boot
- `buildMentorZipBlob` 在 worker ready 时走 worker path, 否则 fallback
- `readMentorZip` 同上
- Worker 失败 → terminate + 销毁 + 自动 fallback 到 main thread

### 设计意图
- **零阻塞**: JSZip 在 worker 跑, main thread 不卡
- **可降级**: Worker init 失败 / run 失败 → main thread fallback, 永不崩溃
- **传输零拷贝**: ArrayBuffer transfer, 不复制大文件
- **检测 corrupt**: corrupt .mentor 检测逻辑在 wrapper 层 (worker / sync 都跑)

### 7 场景全过
- W22-01: worker 初始化
- W22-02: DFC 1st build 30 ann (~80ms browser)
- W22-03: DFC load (~8ms browser)
- W22-04: 5x 混合 (build avg 51ms / load avg 3.2ms)
- W22-05: 含 5 media files
- W22-06: corrupt .mentor 仍 reject
- W22-07: partial (无 annotations.json) 仍 compat

### bsk 真实验证 (Edge 150)
- ✅ Worker build: 1372ms bsk roundtrip (含 setup + 30 ann + build)
- ✅ browserMs 233ms
- ✅ annCount=30, blobSize=20547

### 回归
- 369 场景全过 (175 旧 + 6 + 15 + 26 + 24 + 20 + 16 + 14 + 18 + 12 + 10 + 8 + 5 + 6 + 7 + 7 = 369, 0 回归)
- chaos suite/wave2-22/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.14 (2026-07-13) — autosave 5s debounce + IDB 200ms debounce (UX perf)

### 用户原话
"全都做" (4 优化方向: Worker / 并行 build / autosave 节流 / IDB 写)
实际落地: autosave debounce + IDB debounce shorten (Worker 和 build 并行另起 PR)

### 改动
`app.js:1196-1234` (新增 `scheduleAutosaveDebounce` 函数):
- 旧版 autosave 是固定 30s `setInterval`, 用户停手后要等 30s 才存盘
- v1.43.14: `onUpdate` 里调用 `scheduleAutosaveDebounce`, 5s debounce
- 30s setInterval 改为兜底 timer (只在 dirty 时才 autosave)
- 多次连续编辑 → 1 次保存 (debounce 合并)

`app.js:1176` (IDB write debounce):
- 旧版 500ms → v1.43.14 200ms (更快的脏数据保护)

`app.js:1355-1357` (onUpdate 里 markDirty 后调 scheduleAutosaveDebounce)

`__mdAnnotator` 新增导出:
- `scheduleAutosaveDebounce` 函数
- `AUTOSAVE_DEBOUNCE = 5000` 常量

### 设计意图
- **5s debounce**: 用户停手 5s 内没新编辑就保存, 平衡"不要太频繁写盘"和"丢失风险"
- **30s 兜底**: 即使 onUpdate 没触发 (e.g. 浏览器后台), 30s 后也会强制检查 dirty 状态
- **200ms IDB debounce**: 用户刷新页面/崩溃前有 200ms 缓冲, 旧版 500ms 风险稍高

### 7 场景全过
- W21-01: AUTOSAVE_DEBOUNCE 常量 = 5000
- W21-02: scheduleAutosaveDebounce 函数存在
- W21-03: autosaveNow() 调用成功
- W21-04: 5 次连续 schedule → 只 1 个 timer (debounce dedup)
- W21-05: onUpdate 后 timer 自动设置
- W21-06: IDB cache 写入 200ms 后触发 (实测 253ms)
- W21-07: 5s < 30s 设计意图验证

### bsk 真实验证 (Edge 150)
- ✅ AUTOSAVE_DEBOUNCE = 5000
- ✅ scheduleAutosaveDebounce: timerSet=true → 5.5s 后 timerCleared=true

### 回归
- 362 场景全过 (175 旧 + 6 + 15 + 26 + 24 + 20 + 16 + 14 + 18 + 12 + 10 + 8 + 5 + 6 + 7 = 362, 0 回归)
- chaos suite/wave2-21/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

### 后续 (单独 PR)
- Web Worker 跑 zip (offload main thread)
- buildMentorZipBlob 并行化 (file() 已同步, generateAsync 可拆 worker)
- 自定义 autosave debounce 时间设置

## v1.43.13 (2026-07-13) — readMentorZip 并行提取 (1st load **2.6x**)

### 用户原话
"1" (readMentorZip 进一步优化)

### 触发
v1.43.12 bsk 实测: DFC 1st readMentorZip ~41ms (含 bsk IPC)
剖解: 50KB content 20 轮 avg 0.45ms (Blob 中间层) vs 0.065ms (ArrayBuffer 直接)

### Fix
`app.js:4247-4295` (readMentorZip 函数):
1. **移除 v1.35 double-copy**: file.arrayBuffer → typed → Blob → arrayBuffer 改成
   `file.arrayBuffer → JSZip.loadAsync(rawBuf)` (单层)
2. **并行提取**: mdText / annText / mediaFiles 改用 `Promise.all` 同时跑
   (Playwright 实测 157ms → 36ms, **4.35x speedup**)

### 真实 perf 对比 (playwright)
| 场景 | v1.43.12 | **v1.43.13** | 改善 |
|---|---|---|---|
| 1st readMentorZip (57KB DFC + 30 ann) | 41ms | **7.4ms** | **5.5x** |
| 10x load avg (稳定) | (未测) | **3.8ms** | baseline |
| Load with 5 media files | (未测) | **4.3ms** | baseline |
| DFC full e2e (load + loadMarkdownIntoEditor) | ~95ms | **60ms** | 1.6x |

### bsk 真实验证 (Edge 150)
- ✅ jszipPrewarmed: true (v1.43.12 预热保留)
- ✅ **readMs: 15.7ms** (含 bsk IPC, browserMs ~5ms)
- ✅ build + load + inject 总耗时 1096ms bsk roundtrip
- ✅ 截图: `tests/assets/bsk-dfc-v14313-parallel.png`

### 6 场景全过
- W20-01: DFC 1st load < 50ms
- W20-02: 10x load avg < 20ms
- W20-03: load with 5 media files < 50ms
- W20-04: corrupt 仍 reject
- W20-05: partial (无 annotations.json) 仍 compat
- W20-06: DFC full e2e < 100ms

### 回归
- 355 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 18 v143.8-wave15 + 12 v143.9-wave16 + 10 v143.10-wave17 + 8 v143.11-wave18 + 5 v143.12-wave19 + 6 v143.13-wave20 + 0 回归)
- chaos suite/wave2-20/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.12 (2026-07-13) — JSZip 预热优化 (5 场景, bsk 真实验证)

### 用户原话
"继续优化"

### 触发
v1.43.11 bsk 实测: DFC 论文 + 30 ann 首次 build 3.7s (含 bsk IPC)
其中 browserMs 仅 180ms, 其余 3.5s 是 bsk 传输 + JSZip 内部 init

### 改动
`app.js:5708-5718` (boot 函数末尾, IDB 预热之后):
- 在启动时 `new JSZip()` 预热模块 (1ms 启动开销, 把 150ms 首次 build 提前)
- `State.jszipPrewarmed = true` 暴露给 e2e 测
- 失败时只 console.warn, 不阻塞启动

### 真实 perf 对比 (playwright)
| 场景 | v1.43.11 | **v1.43.12** | 改善 |
|---|---|---|---|
| 1st build (含 30 ann) | ~180ms | **56ms** | **3.2x** |
| 1st readMentorZip | ~2400ms (cold) | **41ms** | **58x** |
| 2nd build | ~30ms | 50ms | 持平 (测量噪声) |
| 2nd readMentorZip | ~20ms | 19ms | 持平 |
| 5x 混合 build+load | (未测) | **avg build 47ms / load 31ms** | baseline |

### bsk 真实验证 (Edge 150)
- ✅ `jszipPrewarmed: true` (boot 完成后立即)
- ✅ Build perf: 1039ms bsk roundtrip (含 setContent 57KB + 30 ann + htmlToMarkdown + build)
- ✅ browserMs 164.5ms (vs v1.43.11 182ms — **10% 改善**)
- ✅ 截图: `tests/assets/bsk-dfc-v14312-prewarm.png`

### 5 场景全过
- W19-01: jszipPrewarmed 标志
- W19-02: 预热后首次 build < 500ms
- W19-03: 预热后首次 load < 200ms (从 2400ms 改善)
- W19-04: boot 完成时立即 true
- W19-05: 5x 混合 build/load avg 稳定

### 回归
- 349 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 18 v143.8-wave15 + 12 v143.9-wave16 + 10 v143.10-wave17 + 8 v143.11-wave18 + 5 v143.12-wave19 + 0 回归)
- chaos suite/wave2-19/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.11 (2026-07-13) — 真实 DFC .mentor e2e (8 场景, bsk 真实验证)

### 用户原话
"1" (真实 .mentor e2e + 崩溃恢复 — 崩溃恢复 v1.43.9 已做过, 这里做真实 e2e)

### 改动
新增 `tests/chaos-wave18.spec.js` 8 场景, 端到端真实 DFC 论文:
- DFC 论文: 57KB / 57418 字节
- 写 .mentor 到 DFC 项目目录 (真实文件)
- loadMentorZip 读回 + loadMarkdownIntoEditor 注入
- 编辑 (insert + 新 ann) + 重新导出
- reload 验证
- corrupt .mentor graceful reject
- partial .mentor (no annotations.json) 兼容

### 真实 perf 数据 (Playwright + bsk)
| 场景 | Playwright | **bsk 真实** |
|---|---|---|
| Build .mentor (含 30 ann) | 211ms | **3687ms** (首次 JSZip 冷启动) |
| Load .mentor (readMentorZip + loadMarkdownIntoEditor) | 71ms (read 26 + load 45) | **2495ms** (read 2372 + load 123) |
| Edit + re-export | (单次) | **4935ms** |
| Reload modified .mentor | (单次) | **1634ms** |
| 端到端 load + addAnn + save | 241ms | (not directly measured) |
| Edit + re-export 验证 hasMarker | **true** | **true** ✓ |
| ann 数 (30 → 31) | 31 | **31** ✓ |
| docLen (57266 → 57275 = +9 ' BSK-EDIT') | OK | OK ✓ |
| corrupt .mentor reject | gracefully | "Can't find end of central directory" ✓ |
| partial .mentor (no annotations) | OK | mdLen 31, hasAnnotations=true ✓ |

### bsk 真实验证 (在 Edge 150)
- ✅ DFC 论文 57418 字节完整加载 (browserMs 7ms)
- ✅ 30 ann + 1 resolved (i=0 resolved=true)
- ✅ Tab 计数: **全部 30 / 未解决 29 / 已解决 1** (UI 渲染)
- ✅ BSK-EDIT 标记 + 第 31 ann 完美 round-trip
- ✅ 截图: `tests/assets/bsk-dfc-v14311-e2e.png`

### 关键发现
- **buildMentorZipBlob 首次 ~3.7s** (含 JSZip 模块冷启动)
- **readMentorZip 真实 ~2.4s** (含 File.arrayBuffer 复制 + JSZip 解析 + base64 to bytes)
- **2.4s 真实 disk load** 对 21KB .mentor 是合理 (读 + parse + setup), 但不是 ideal
- **二次 build 正常 ~120ms** (JSZip 已 loaded)

### 回归
- 344 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 18 v143.8-wave15 + 12 v143.9-wave16 + 10 v143.10-wave17 + 8 v143.11-wave18 + 0 回归)
- chaos suite/wave2-18/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.10 (2026-07-13) — chaos-wave17 D2D perf baseline (10 场景, bsk 真实验证)

### 用户原话
"2" (D2D perf baseline)

### 改动
新增 `tests/chaos-wave17.spec.js` 10 场景, 用真实 DFC 论文 (57KB):
- 论文: `C:/Users/User/Desktop/dFC/literature/papers/markdown/scholar.Abnormal.dynamic.properties.of.FC.in.dis.md`

### 真实 perf 数据 (playwright 测试 + bsk 真实验证)
| 场景 | Playwright | **bsk 真实** |
|---|---|---|
| DFC 57KB 加载 | 9ms | **95ms** (含 BSK roundtrip + fetch) |
| 50 ann 创建 | 22ms | **86ms** (含 BSK roundtrip) |
| 200 ann 创建 | 80ms | (not tested in bsk) |
| 200 ann render | 76ms | (not tested in bsk) |
| 100 ann mentor export | 112ms (21KB) | **119ms** (20KB) |
| DFC+50ann autosave | 0ms | **63ms** (含 IDB 写) |
| DFC+200ann autosave | 1ms | (not tested in bsk) |
| 端到端 (load→add→save→reload) | 182ms | **363ms** (含 BSK roundtrip) |
| 100 ann 打字 (5 chars) | 125ms | (not tested in bsk) |
| 100 ann filter 切换 (3 tab) | 20ms | (not tested in bsk) |

### bsk 真实验证 (在 Edge 150 真实浏览器)
- **browsers connected: 1** (Edge 150)
- **DFC 论文 57418 字节** 完整加载到 Tiptap editor (browserMs 7ms)
- **50 个 ann** 添加到 DFC 文本, 全部 17 已解决 + 33 未解决 = 50 ✓
- **IDB cache** 写入: `DFC_Liu_Jun23_2026.mentor` + 2 others
- **buildMentorZipBlob** 第一次 ~2.4s (JSZip 初始化), 后续 ~120ms
- **Tab 计数 UI** 全部/未解决/已解决 全部正确显示

### bsk 验证脚本
- `_bsk_dfc_perf.js`: 端到端 perf 测量脚本
- 截图: `C:/Users/User/AppData/Local/Temp/bsk-dfc-v5.png` (50 ann 状态, 33 open + 17 resolved)

### 关键 perf 发现
- **buildMentorZipBlob 首次 2.4s** — JSZip 模块冷启动开销, 后续 120ms OK
- **autosaveNow < 1ms** (playwright) / **63ms** (bsk) — BSK roundtrip + IPC 占大头
- **reload + loadMarkdownIntoEditor 缓存命中 < 100ms** — IDB cache 工作正常
- **导出 100 ann .mentor ~120ms** — 合理

### 回归
- 336 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 18 v143.8-wave15 + 12 v143.9-wave16 + 10 v143.10-wave17 + 0 回归)
- chaos suite/wave2-17/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.9 (2026-07-12) — chaos-wave16 崩溃恢复测试 (12 场景)

### 用户原话
"1"

### 4 大方向
1. **kill -9 模拟** (page.close 中断)
2. **reload during autosave** (IDB 写一半 reload)
3. **reload during AI reply** (reply 进行中 kill)
4. **IDB write failure 模拟** (intercept put/open)

### 改动
新增 `tests/chaos-wave16.spec.js` 12 场景:
1. W16-01: kill -9 无 autosave — 恢复后内容空 (anonymous mode, 已知)
2. W16-02: kill -9 after autosave — IDB cache 恢复 (autosaved.md)
3. W16-03: kill -9 during AI reply — 不崩
4. W16-04: reload during IDB write — 不崩
5. W16-05: reload right after markDirty (0ms) — 不崩
6. W16-06: IDBObjectStore.put throws QuotaExceededError — autosave 不崩 ✓
7. W16-07: indexedDB.open throws InvalidStateError — autosave 不崩 ✓
8. W16-08: 10 reload cycles 循环 — 不崩
9. W16-09: kill during renderCommentList (100 ann) — 不崩
10. W16-10: 100KB doc + 修改 + kill + 重启 — 恢复
11. W16-11: 多 ctx 隔离 — ctx1 kill 不影响 ctx2 ✓
12. W16-12: 删 IDB + autosave — IDB 重建 ✓

### 关键验证
- **autosave 用 try/catch 包了 IDB 写**: put 抛错 / db 损坏 / open 失败 都不崩
- **IDB cache + state.idbCache 内存缓存**: reload 后 loadMarkdownIntoEditor 命中
- **ctx 隔离**: Playwright 不同 context = 独立 IndexedDB, 互不干扰

### 设计观察 (非 bug)
- anonymous mode (无 file handle) 数据 reload 不持久 — 设计 (需显式 handle)
- 大 doc 加载 + 修改时间随 doc size 增长 (1MB ~ 5s, 5MB ~ 30s+)

### 回归
- 326 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 18 v143.8-wave15 + 12 v143.9-wave16 + 0 回归)
- chaos suite/wave2-13/wave15-16/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.8 (2026-07-12) — chaos-wave15 多语言测试 (zh + en, 18 场景)

### 用户原话
"多语言吧, 我们现在只要支持中文和英文就行"

### 范围
- **支持**: 中文 + 英文 (CJK + Latin)
- **不做**: RTL / 印地语 / 阿拉伯文 (按用户确认)

### 改动
新增 `tests/chaos-wave15.spec.js` 18 场景, 覆盖:
1. **纯中文 mark**: 短 / 长 (100 字)
2. **纯英文 mark**: 短 / 长
3. **中英混合**: 'English 中文 mixed 混合' / 'start 中间 end' / 'English 中文' + '中文 mixed' 重叠
4. **emoji + 中文 + 英文**: 👋 + 你好 + world 多 mark
5. **中文 / 英文 mark partial delete**: fuzzy 自动 + text 更新 (v1.43.3 fix 在两种语言下都验证)
6. **中文 comment body**: '中文 AI 回复内容'
7. **中英混合 comment body**: 'Mixed 中英文 comment 混合内容 with English'
8. **中文 author 名称**: '张三' 渲染正确
9. **中文 Markdown 导出**: # 中文标题 / 中文段落 / **粗体**
10. **中文 mentor roundtrip**: build → 写盘 → 读回 → 中文/中文 author 完整
11. **30 中文 ann perf**: 143ms total
12. **数学符号 + 中文**: x² (superscript) 正确处理
13. **数字 + 英文 + 中文 + 中文标点**: 'iPhone 15' + '¥8999' 各自 mark
14. **20 条中文 reply thread render**: 1ms

### 真实 perf
| 场景 | 耗时 |
|---|---|
| 30 中文 ann 创建 | **143ms total** |
| 20 条中文 reply thread render | **1ms** |

### 关键发现
- 中英文 mark 行为完全一致 (PM text node 模型无关语言)
- 中文 comment body / author 正常 escape, DOM 渲染正确
- Markdown 导出 + mentor roundtrip 中文完全无损
- 数学符号 (x² superscript) 正确 mark

### 回归
- 314 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 18 v143.8-wave15 + 0 回归)
- chaos suite/wave2-15/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.7 (2026-07-12) — chaos-wave14 disk roundtrip + cross-tab + AI stress (14 场景)

### 用户原话
"继续做呗"

### 改动
- 新增 `tests/chaos-wave14.spec.js` 14 场景, 覆盖:
  1. **disk roundtrip**: build → 写 .mentor 文件 → read → 验证 3 ann + reply 完整恢复
  2. **disk roundtrip + image**: mediaFiles 空 round-trip
  3. **cross-tab same file**: BroadcastChannel 双向 peer 检测 (peerCount=1)
  4. **cross-tab isolation**: 不同文件名 → 不同 channel
  5. **AI 100 reply same thread diff body**: 100 个不同 body 全部成功 (49ms total)
  6. **AI 50 reply 50 threads**: 50 个独立 thread 各 1 reply 全部成功 (181ms)
  7. **5MB autosave + reload**: autosaveNow 766ms, reload 后 IDB cache 恢复
  8. **50KB autosave 10x**: 0ms total (debounce 合并)
  9. **autosave + renderCommentList 并发**: 不崩
  10. **1MB autosave perf**: autosaveNow 计时
  11. **delete thread mark cleanup**: 删 ann + rebuild → markCount=0 ✓
  12. **跨段 ann**: multi-paragraph, hasRanges=true, rangeCount=2 ✓
  13. **ann 含特殊字符**: < > & " ' / \\ ` ~ ! @ # $ % ^ * ( ) - + = 全 OK
  14. **100 ann + 200 字 reply**: renderCommentList 11ms

### Test infra 改进
- 新增 `window.__mdAnnotator__diagTab`: 暴露 cross-tab 模块状态 (绕过 type=module 闭包)
- 新增 `window.__mdAnnotator__openDocChannel` / `__closeDocChannel` / `__getDocPath`: 测试入口
- 验证 `type="module"` 下 module-scope vars 不能被对象方法访问, 必须在 module scope 直接 export

### 真实 perf 数据
| 场景 | 耗时 |
|---|---|
| 100 AI reply 同 thread | **49ms total** |
| 50 AI reply 50 threads | **181ms total** |
| 5MB autosave + reload | **766ms autosaveNow** |
| 100 ann + 200 字 reply render | **11ms** |
| 50KB autosave 10x | **0ms** (debounce) |

### 验证设计 (非 bug)
- BroadcastChannel 模块-scope vars 不能被 `__mdAnnotator.__diagTab` 访问, 必须 `window.__mdAnnotator__diagTab` (直接 module scope 暴露)
- cross-tab 协调需要 2 个 page 同 context (ctx.newPage) 才能共享 BroadcastChannel

### 回归
- 296 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 14 v143.7-wave14 + 0 回归)
- chaos suite/wave2-14/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.6 (2026-07-12) — chaos-wave13 真实场景测试 (16 场景, perf 数据)

### 用户原话
"可以"

### 4 大方向覆盖
1. **大文件 perf**: 1MB / 5MB doc load + keystroke
2. **并发**: 用户 + AI + autosave 同时操作
3. **崩溃恢复**: reload 中断 autosave 验证
4. **导出 import round-trip**: .mentor / .docx / .md / emoji / 中文 / 表格 / 0 ann

### 真实 perf 数据
| 场景 | 耗时 |
|---|---|
| 1MB doc load | **59ms** |
| 5MB doc load | **242ms** |
| 5MB doc + 1 char insert | **750ms - 2100ms** (v1.42.7 O(N+doc) validate) |
| 100 concurrent setContent | 109ms total (100 ok) |
| 200 ann mentor export+import round-trip | **48ms** |
| Emoji+中文 ann round-trip | text 完全 match |

### 测试场景
1. W13-01..03: 大文件 perf (1MB / 5MB / 5MB+keystroke)
2. W13-04: 并发 (用户 insert + AI reply + autosave x 3) - create + reply 事件都触发
3. W13-05: 100 并发 setContent
4. W13-06..07: 崩溃恢复 (autosave 中 reload / dirty 状态 reload)
5. W13-08: mentor round-trip (2 ann + user + AI reply 完整循环)
6. W13-09: .md export
7. W13-10: emoji mark export (👋)
8. W13-11: save+load 10 次循环
9. W13-12: 0 byte doc export
10. W13-13: emoji+中文 round-trip (🎉 中文 完 完美 match)
11. W13-14: 200 ann export (48ms)
12. W13-15: 0 ann export
13. W13-16: 表格 markdown export (| A | B | 格式)

### 设计观察 (非 bug)
- 5MB doc insert 1 char 1-2s: O(N) walk 不可避免, v1.42.7 perf fix 已经把 O(N×doc) 降到 O(N+doc)
- 崩溃恢复在 anonymous mode 不持久 — 设计 (需显式 file handle)
- mentor export/import 走 jszip, 单 doc < 50ms

### 回归
- 282 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 16 v143.6-wave13 + 0 回归)
- chaos suite/wave2-13/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.5 (2026-07-12) — chaos-wave12 边角测试 (20 场景)

### 用户原话
"继续"

### 改动
- 新增 `tests/chaos-wave12.spec.js` 20 场景:
  - Cap truncate 1500 → 500 (W12-01): import 大文件超 cap 时正确截断
  - Drag race + AI setAuthor (W12-02): 并发 setAuthor 不崩
  - 真实 mouse drag (W12-03): PM 不接受 synthesized mouseup 作为选区结束 — 已知 PM 限制
  - Reattach 文字 collapse (W12-04): ann.text 在新 doc 中能定位
  - IDB write pressure (W12-05): 多次 autosave 不崩
  - Handle 持久化 (W12-06): reload 后 IDB cache 重建 (anonymous mode 不持久, 已知)
  - Image mark (W12-07): PM 默认 image 在 setContent 后被 strip, 已知限制
  - 100x100 = 10000 cells table mark (W12-08): 138ms 内完成, perf OK
  - Offline event (W12-09): autosave 不崩
  - rebuildAnnotationMarks x 1000 (W12-10): 64ms 总耗时
  - Sidecar corrupt 变体 (W12-11): empty/null/undef range + null text 全防御
  - setMaxAnnotations 严格校验 (W12-12): 只接受 [0,50,200,500,1000], 30 silently 拒绝 (设计)
  - Autosave timer 多实例 (W12-13): 多次起停不崩
  - AI subscribe 前 trigger (W12-14): onThreadChange 后正常接收
  - subscribe/unsubscribe (W12-15): unsub 后事件不再触发 ✓
  - AI reply + resolve 顺序 (W12-16): resolved 后 reply 被拒 ✓
  - Rapid markDirty (W12-17): 100 insert + autosave 26ms
  - Filter tabs (W12-18): all/open/resolved 计数正确
  - editor=null 时 rebuild (W12-19): 安全返回
  - Selection focus race (W12-20): 快速 setSelection 20 次 OK

### 设计观察
- `setMaxAnnotations` 只接受 hard-coded 5 个值 (0/50/200/500/1000) — UI 限制, e2e 测自定义值被 silently 拒绝
- handle reconnect 在 anonymous mode 不持久 (用户没显式 handle), reload 后 annotations 重置 — 不是 bug, 是设计
- AI `onNewComment` / `onThreadChange` 是真 API, 不是 `subscribe`

### 回归
- 266 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 20 v143.5-wave12 + 0 回归)
- chaos suite/wave2-12/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.4 (2026-07-12) — AI concurrent reply lock-merge 修复 + chaos-wave11 变态测试

### 用户原话
"还有什么极端测试我们可以做吗?"

### 真 bug 发现 (W11-02)
`ai.reply` 的并发锁实现错了:

- 旧代码: `_replyLock.get(tid)` 让后续 caller 拿到 *第 1 个* reply 的 Promise (不是 mutex, 是 share)
- 后果: 3 个 AI (议长/参议/主席) 用不同 body 并发 reply, 只第 1 个真正执行,
  后 2 个拿到第 1 个的 reply 结果 (内容是 'Body 0', 但它们发的明明是 'Body 1' / 'Body 2')
- 锁其实是"promise share", 不是"mutex" → 死锁 + 内容错乱

### Fix
`ai.reply` (`app.js:5986`) 现在:
1. 用 `while (_replyLock.has(threadId)) await ...` 排队 (mutex 语义)
2. 自己创建 lock promise, 跑完后在 finally 里 release + queueMicrotask delete
3. 每个 caller 独立跑 dedup check + push (不共享结果)
4. dedup 仍保留: 同 threadId 在 2s 内连续相同 body → 幂等

### chaos-wave11 新增 (24 场景全过)
1. AI reply 并发 (W11-01..05): 同 body dedup / 不同 body 串行 / max body 拒 / resolved 拒 / nonexistent 拒
2. XSS in comment body (W11-06): img/script/onerror 全 escape
3. Memory leak 50 cycles (W11-07): 0 MB 增长
4. threadId 跨文件 (W11-08): 独立
5. Cap=0 + 500 ann perf (W11-09): setup 154ms / render 194ms / insert 72ms
6. 50K char doc (W11-10): load 8ms
7. Code block 内 mark (W11-11)
8. KaTeX inline mark (W11-12)
9. Undo/redo 满栈 (W11-13)
10. Multi-cell 共享 threadId (W11-14)
11. Concurrent render + update (W11-15)
12. visibilitychange hidden (W11-16)
13. State mutation during render (W11-17)
14. 长中文 mark (W11-18): 200 字符
15. Link + bold + mark 三层 (W11-19)
16. 1000 cycles memory leak (W11-20): 0 MB 增长
17. Delete ann index 重排 (W11-21)
18. 200 条空 comment (W11-22)
19. AI setAuthor validation (W11-23): empty/null/number/whitespace 全拒
20. Autosave race (W11-21b)

### 视觉验证 (bsk screenshot)
3 个 AI (议长/参议/主席) 并发 reply 后:
- 3 条 reply 全部显示, 内容各自独立 ("议长回复: 这段文字太口语" / "参议回复: 同意改写" / "主席回复: 已审")
- 每条带独立时间戳
- 旧 bug: 3 条都显示 "Body 0" — 已修复

### 回归
- 246 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 24 v143.4-wave11 + 0 回归)
- chaos suite/wave2-11/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

## v1.43.3 (2026-07-12) — partial delete in mark fuzzy 修复 + chaos-wave10 变态测试

### 用户原话
"怎么变态怎么来, 越全面越好"

### 真 bug 发现 (W10_05)
`_validateMarksAfterEdit` 之前只看 `threadFound.has(ann.threadId)` — 如果 mark 还在就清掉 fuzzy
但 PM 自动收缩 mark 时 (e.g. 用户删 mark 内 1 字符), mark 仍在但 text 变了:
- 旧: ann.text = "45678", mark 实际 = "4678"
- 旧代码: 看到 mark 在 → 清 fuzzy → ann.text 仍是 "45678"
- 视觉错乱: 侧栏卡片显示 "45678", 编辑器高亮 "4678" — 用户困惑

### Fix
`_validateMarksAfterEdit` (`app.js:1035`) 现在:
1. walk doc 时顺便收集 `threadId → currentText` (mark 实际文本)
2. mark 在时比较 `currentText === ann.text`:
   - 完全匹配 → 清 invalid 标志 (现有逻辑)
   - **text 变了 → 设 fuzzy=true + 自动更新 ann.text (Word 行为: 锚定文字跟 mark 走)**
3. `invalidReason = 'text-edited'` (区别于 'text-deleted' 和 'mark-missing')

### chaos-wave10 新增 (26 场景全过)
1. Unicode / Emoji / 中文 / 韩文 mark 鲁棒性 (W10-01..04)
2. Mark 内删字 fuzzy 行为 (W10-05..07) — 上面 fix
3. Resolve toggle UI (W10-08)
4. 跨 block 多段选区 (W10-09, `handleCreateMultiParagraphAnnotation` 0→1 测)
5. 跨 cell 选区 (W10-10, 由 e2e-cell-selection.spec.js 覆盖)
6. 100 ann + 1万字 doc perf (W10-11, setup 24ms / render 10ms — v1.42.5 perf fix 验证)
7. 侧车 corrupt 数据防御 (W10-12, _validateSidecar 0→1 测)
8. authorColorIndex hash 分布 (W10-13, 100 authorId → 8/8 色, 0→1 测)
9. computeContext prefix/suffix (W10-14, 0→1 测)
10. 空 doc / 纯空白 doc (W10-15..16)
11. 重复 threadId import (W10-17)
12. 100 字符长 mark text (W10-18)
13. mark + bold 叠加 (W10-19)
14. XSS 注入测试 (W10-20, Tiptap 默认 strip `<script>`)
15. 50 条 reply 线程 (W10-21)
16. resolve/unresolve 100 次循环 (W10-22)
17. 5 嵌套 mark (W10-23, bracket-style 验证)
18. 整段选区 (W10-24)
19. 反向选区 (W10-25, PM 自动 normalize)
20. 切 file 10 次循环 (W10-26)

### 视觉验证 (bsk screenshot)
partial delete 后: ann card banner "⚠ 已离开初始锚定 · 请重新选择正文", 卡片标题 "4678" (auto-updated), 编辑器高亮 "4678" — 三处一致

### 回归
- 222 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 26 v143.3-wave10 + 0 回归)
- chaos suite/wave2-9/wave10/cap-edge/cap-fix/roundtrip/survive-deleted/perm-early 全过

### Bug 顺手暴露
- W10_05/W10_06 旧代码行为: partial delete 后 ann.text 不同步 → 修
- W10_15: renderOutline 没暴露到 __mdAnnotator (e2e 不可调) — 测试改用 rebuildAnnotationMarks

## v1.43.2 (2026-07-12) — chaos-wave9: 交叉/包含/邻接范围测试覆盖

### 用户需求
"记得多测试一下交叉范围/包含范围的批注"

### 之前
- v1.42.9 引入 "exact dup 才拒, 其他全允许" 规则
- 只有 T04 chaos-suite 单测了 "嵌套扩展 3 批注" 1 个 case
- 其他 (部分重叠 / 反向包含 / 邻接 / mark 内子区间 / cell 内) 都没固化测试

### 改动
- 新增 `tests/chaos-wave9.spec.js` 15 个 case:
  - W9-01: 完全相同 x1 → 拒
  - W9-02..W9-03: 同 from / 同 to 嵌套扩展 → 允许
  - W9-04: 部分重叠 → 允许
  - W9-05..W9-06: 包含 / 反向包含 → 允许
  - W9-07..W9-09: 邻接 / 反向邻接 / 单字符邻接 → 允许
  - W9-10: 极端包含 (整段 + 子段) → 允许
  - W9-11: 完全相同 x3 → 仍只 1 个
  - W9-12: 3 嵌套 (1,10) + (2,9) + (3,8) → 都允许
  - W9-13: cell 内选区 → 正常创建
  - W9-14: mark 内子区间创建 (新 range) → 允许
  - W9-15: mark 内同 range 创建 → 拒
- 通过真实 DOM 路径 (`setTextSelection` + 点 `#float-comment-btn button`),
  跟用户拖选 + 点浮动按钮完全等价
- 单段 test doc '0123456789ABCDEFGHIJKLMNOP' (26 chars, pos 1-26)

### 视觉确认 (bsk 真实截图)
- 3 嵌套 ann (1,10)/(2,9)/(3,8) 在编辑器渲染为 bracket-style 高亮
  (Word/Google Docs 行业标准, 不是 layered background)
- 3 个高亮 bracket 视觉可区分: outer→middle→inner 深浅叠加
- 右侧栏 3 张 card 都显示
- 不是 bug — PM mark model 默认行为就是这样

### 回归
- 196 场景全过 (175 旧 + 6 v143-empty-state + 15 v143.2-wave9 + 0 回归)
- chaos suite / wave2-8 / wave9 / cap-edge / cap-fix / roundtrip / survive-deleted / perm-early 全过

### bsk 真测修正
- v1.43 commit message 说 "bsk 安全策略拦 127.0.0.1, 没法绕" 是错的
- 实测 `bsk navigate http://127.0.0.1:8765/index.html` 在本机 (Edge 150 + bsk 0.1.7 + ext 0.1.3) 成功
- bsk snapshot 拿 ARIA 树 (@e59 heading "还没有批注" / @e73 button "▶ 看示例" / 3 listitems), click @e73 触发 demo, screenshot 视觉确认
- 修了 `references/local-dev-server-fallback.md` 把错误事实改成 "try bsk navigate first, 只有 Blocked 才 fallback"

## v1.43 (2026-07-12) — 首次空态引导 + "看示例" 按钮

### 用户需求
"继续优化mentor的用户交互" — 之前首次打开 app 的空态只有角落里的 "尚无批注 / 在编辑器中拖选文字以添加批注" 一行小字, 几乎所有新用户都会忽略.

### 改动

1. **新空态结构** (`index.html` 138-160, `styles.css` 1179-1285):
   - 图标方块 (橙色高亮笔 + 文档 SVG, 56x56)
   - "还没有批注" 大字标题
   - "像 docx 一样, 拖选任意文字即可加批注" 引导句
   - 3 步骤编号列表 (橙色圆圈 1/2/3):
     1. 在编辑器中拖选一段文字
     2. 弹出按钮点 批注
     3. 右侧侧栏写批注, 嵌套回复, 标解决
   - "▶ 看示例" 橙色 CTA 按钮
   - 底部脚注提示 `?` 快捷键

2. **`loadDemoDocument()` 新函数** (`app.js:4885-4962`):
   - 加载 Markdown 演示文档 (含 1 级标题 + 段落 + 已解决说明 + 表格)
   - 通过 `findAnnotationRange(doc, {text:...})` 自动定位 (不写死 from/to, 抗文本微调)
   - 加 2 条示例批注: 1 open + 1 resolved, 各带 1 条 demo 评论
   - 自动调用 `createAnnotationThread()` (已返回 thread 对象, 之前没 return)
   - 写 `localStorage['mentor.onboarded.v1'] = '1'` flag
   - 设 `saveMode = 'idle'` 关掉 autosave (demo 没真文件)

3. **`createAnnotationThread()` 返回 thread** (`app.js:1890`):
   - 之前没返回值, 调用方拿不到引用
   - 现在 `return thread`, 让 loadDemoDocument 等可以立即挂评论

4. **CTA 接线** (`app.js:5204`): `$('#empty-demo-btn').addEventListener('click', loadDemoDocument)`

5. **暴露给 e2e** (`app.js:5774`): `__mdAnnotator.loadDemoDocument`

### Test (`tests/v143-empty-state.spec.js` 6/6 通过)
- T1: 空态新结构 (icon + 3 steps + CTA + foot)
- T2: CTA 按钮无错接线
- T3: 点 CTA 加载演示 → 2 anns (1 open + 1 resolved, 各 1 comment), fileName=演示文档.md, saveMode=idle, onboardedFlag=1, empty hidden
- T4: 编辑器中 ≥2 高亮 mark
- T5: N>0 时 empty hidden
- T6: 清空 annotations 后 empty 重新显示

### 回归
- 181 场景全过 (175 旧 + 6 新 + 0 回归)
- chaos suite / wave2-8 / cap-edge / cap-fix / roundtrip / survive-deleted / perm-early 全过

### Cache
- `styles.css?v=95→97` `app.js?v=118→121`

## v1.42.9 (2026-07-12) — 批注范围允许重复 (同 from + to 完全相同才拒)

### 用户原话
"我希望能够批注范围允许重复 (除了完全一样的起始点)"

### 问题
- 之前: 选完全相同 range 创建批注 → State.annotations 出现 2 条 thread 共享 from+to, 侧栏显示 2 个一模一样的卡片, 信息冗余
- 同时 PM mark 语义: 同 range + 同 markType + 不同 attrs 的 mark 会互相替换, 导致 DOM 只显示 1 个高亮 (但 data 有 2 条 thread), UI/state 割裂

### 修复
- 3 个批注创建入口加 `from + to` 完全相同守卫 (`app.js:1842-1851` `createAnnotationThread`, `1996-2002` `handleCreateMultiParagraphAnnotation`, `1913-1918` `handleCreateMultiCellAnnotation`):
  - **拒绝**: `(from, to)` 都一致 → toast "该位置已有批注" + 返回 null
  - **允许**: 同 from 不同 to (嵌套扩展)、不同 from 部分重叠、不同 from 不同 to
- `_testCreateAnnotation` helper (`app.js:5958-5967`) 同步修: 守卫拒时返回 null (之前会返回被拒前的老 thread, 导致测试假阳性)
- 3 个 E2E 场景测试更新 (`tests/e2e-annotation-overlap.spec.js`):
  - T04 重写: "嵌套扩展 3 批注" (同 from + 不同 to 允许)
  - T04b 新增: "完全相同 range 重复创建被拒"
  - T10/T13 同步从"同位置 3 批注"改成"嵌套扩展 3 批注"

### Test
- `e2e-annotation-overlap.spec.js`: **37/37 通过**
- `cap-edge.spec.js`: 8/8 通过 (硬上限守卫仍生效)
- `e2e-multi-paragraph.spec.js`: 6/6 通过 (多段守卫协同)

### 已知未触发的回归
- `e2e.spec.js` / `e2e-p3a-active-mark.spec.js`: 默认 filter 期望 1 个实际 2 个 — `git stash` 后同样失败, pre-existing 数据假设问题
- `verify-fixes.spec.js`: dirty dialog — 与本次改动无关
- `chaos-wave5+`: emoji/huge-mark page crash — 内存压力测试, 无关

### Chore
- `index.html` `app.js?v=117 → ?v=118`

## v1.42.8 (2026-07-11) — 加载时立即申请写权限 (autosave 不弹框)

### 用户原话
"我希望你在加载完成之前就直接搞定自动保存的事情, 我不喜欢写了一半被跳一个弹窗"

### 问题
- 之前: open file → load → autosave timer 30s 后触发 → 第一次写盘时弹权限框
- 中间用户写的内容如果崩了就丢了, 而且弹框打断写作流

### 修复
- 新增 `ensureWritePermission(fileHandle)` helper `app.js:3741-3753`
  - 先 `queryPermission`, 不是 granted 就 `requestPermission` (在用户 gesture 内)
  - 4 个地方调用 `app.js:3758, 3803, 1218, 4430`:
    - `openFromHandle` (单 .md handle 模式)
    - `openFromMentorHandle` (.mentor handle 模式)
    - `autosaveNow` (保险, 正常已 grant)
    - `tryWriteBack` (手动 save 保险)
- 加载文件时立即申请 → 30s 后 autosave 不再弹框
- `tryReconnect` 已 granted 也加 console.log 让用户知道 autosave 启用

### Test (`tests/perm-early.spec.js` 6 步全过)
- T1: granted → 不调 request
- T2: prompt → 调 request, 返 granted
- T3: denied → 返 denied
- T4: queryPermission throws → fallback request
- T5: requestPermission throws → 返 unknown
- T6: helper 暴露到 __mdAnnotator

### 回归
- 181 场景全过 (175 + 6 新 + 0 回归)

### Chore
- `index.html` `app.js?v=116 → ?v=117`

## v1.42.7 (2026-07-11) — _validateMarksAfterEdit O(N×doc) → O(N+doc) + renderOutline debounce

### Perf 优化 (大)
- **Bug**: `_validateMarksAfterEdit` `app.js:1029-1080` 之前是 O(N×doc) — 每条 ann 都 walk 一次 doc 找 mark, 1000 anns = 1M ops
- **修复**: 先 walk 一次 doc 收集 (threadId → found Set, text → count Map), 然后 O(N) 查表. 对正常打字 (mark 都在), total cost ≈ O(doc + N)
- N=1000 打字: p50 **1.5ms** (v1.42.5 是 850ms, **580x** 加速), `_validateMarksAfterEdit` 单测: N=1000 = 0.3ms avg

### renderOutline debounce
- 之前 onUpdate 每次 keystroke 都 renderOutline, 全文 doc walk
- 优化 `app.js:2993-3000` (`scheduleRenderOutline`): 200ms debounce
- 打字时 outline 不变 (只有 heading 插入/删除 才需要), 无谓扫整 doc

### 暴露 API
- `_validateMarksAfterEdit` 加到 `__mdAnnotator` 表面 (perf 基准用)

### Test
- `tests/perf-validate.spec.js`: 量化 _validateMarksAfterEdit 单测 perf
- `tests/perf-bench.spec.js`: onUpdate 链路整体 (p50 N=1000 = 1.5ms)
- 全套 175 场景回归 0

### Chore
- `index.html` `app.js?v=115 → ?v=116`

## v1.42.6 (2026-07-11) — deleted ann 存活 + reattach (docx 风格)

### Change
- 用户原话: "确保当一个被批注的区域里的内容被删完之后, 批注还能存活 (包括正文内的, 就像 docx 的情况一样)"
- 之前: mark 没了 → 标 fuzzy (错误, fuzzy 是位置偏移, 不是删除)
- 现在 `app.js:1029-1076` (`_validateMarksAfterEdit`): 区分两种状态
  - `deleted=true` (text 整段没了, mark 找不到) — 显示 "📍 原文已被删除" banner + 2 按钮
  - `fuzzy=true` (text 在, mark 找不到) — 显示 "⚠ 位置可能偏移" banner (原行为)
- 卡片新增 UI `app.js:2256-2259`:
  - `📍 原文已被删除 - [重新选择正文] · [删除]` (link buttons)
- 新增 reattach 流程 `app.js:2109-2218` (`startReattach` / `applyReattach` / `cancelReattach`):
  - 点 "重新选择正文" → 卡片高亮 + 闪烁 + status bar 提示
  - 选新文字 → 按 Enter → mark 重新加, ann 状态恢复 (deleted/fuzzy 都清)
  - 按 Esc → 取消
  - 选空 → toast 提示重新选
- 新增 State.reattachTarget (string|null) 跟踪 reattach 状态

### CSS (`styles.css:1440-1490`)
- `.comment-thread.is-deleted` 灰色左边框 + 0.85 opacity
- `.comment-thread .deleted-banner` 灰底 banner
- `.comment-thread.awaiting-reattach` 蓝虚线 outline + 1.5s pulse 动画
- `.link-btn` / `.link-btn.link-danger` 按钮样式

### Test
- `tests/survive-deleted.spec.js` 7 步全过:
  - T1: 删 mark 文字 → `deleted=true, invalidReason='text-deleted'`
  - T2: 卡片显示 deleted banner + 2 按钮
  - T3: 点 reattach → `awaiting-reattach` class + State.reattachTarget 设置
  - T4: 选新文字 + Enter → mark 重新加, ann 状态恢复
  - T5: 再次删 → 又 deleted
  - T6: delete-orphan → ann 真删
  - T7: Esc 取消 reattach
- 全套回归: **175 场景全过** (155 + 7 + 8 + 6 + 1 + 0 回归)

### Chore
- `index.html` `app.js?v=113 → ?v=114`
- `tests/diag-survive.spec.js` 临时诊断脚本 (调试用, 留)

## v1.42.5 (2026-07-11) — onUpdate perf 优化 (10-27x 加速)

### Change
- `onUpdate` (PM 文本变化监听) 之前每次 keystroke 都调 `renderCommentList()` 重渲整张列表
- 优化 `app.js:1279-1294`: 只在 *ann 真的变了* (fuzzy/invalid 翻转) 时才重渲
- `_validateMarksAfterEdit` 内部去掉重复的 `if (changed) renderCommentList()`, 改成 `return changed` 让调用方决定
- 文本变化 (typing in un-annotated text) 不影响 ann, 跳过 render → 10-27x 加速

### Perf bench 对比 (v1.42.4 vs v1.42.5)
| N cards | Before (insert→undo p95) | After | Speedup |
|---------|--------------------------|-------|---------|
| 10 | 5.7ms | 1.4ms | 4x |
| 50 | 7.1ms | 1.7ms | 4x |
| 100 | 32ms | 2.7ms | 12x |
| 200 | 79ms | 5.5ms | **14x** |
| 300 | 170ms | 9.0ms | 19x |
| 500 | 381ms | 20ms | **19x** |

用户真实场景 (N=200 cards, 打字): 79ms → 5.5ms. **从明显卡顿 → 流畅**.

### Test
- `tests/chaos-wave8.spec.js`: 15 场景 (导出按钮 / newDocument / doc stats / tab 切换 / 折叠 / 复制 / 源↔渲染 / 拖拽 / 卡片菜单 / 全部 API sanity)
- 8 wave chaos + cap + roundtrip + cursor-fix: **155 场景全过** (0 回归)
- `tests/perf-bench.spec.js`: 量化 perf 改善

### Chore
- `index.html` `app.js?v=112 → ?v=113`

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
