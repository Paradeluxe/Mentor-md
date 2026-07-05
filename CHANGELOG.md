# Mentor Changelog

按时间倒序记录已发布的变化。最新条目在上方。

## v2.1 (2026-07-05) — 当前活跃开发

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
- v1: 105 → v2: 114 tests pass (107 + 7 新增 TEST 106-114)
- p3a-active-mark: 56 tests pass
- e2e-soak: SOAK PASS, 0 error
- verify-fixes: 13/13 pass
- 6 个小 spec: 各自 pass

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
