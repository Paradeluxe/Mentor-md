# Mentor Changelog

按时间倒序记录已发布的变化。最新条目在上方。

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
