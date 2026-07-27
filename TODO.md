# Mentor — 优化进度 TODO

> 更新：2026-07-25  
> 范围：颜色系统之后的数据完整性 / 安全 / 保存可靠性 + P1 剩余 + P2

---

## 已完成

### 颜色系统（前一轮）
- [x] primitive → semantic → legacy alias 三层 token
- [x] 8 作者色槽统一 mark / bubble / avatar
- [x] light / system / dark 主题 + localStorage
- [x] DESIGN.md / preview.html / E2E 颜色专项

### P0 数据完整性与安全（本轮）
- [x] **启动器命令注入**：`mentor.cmd` + `scripts/encode-open-path.ps1` 参数化传路径
- [x] **批注 XSS**：`_validateSidecar` 严格校验；渲染 `escapeHtml`；恶意 `createdAt`/`threadId` 拒绝
- [x] **源码模式丢正文**：`flushSourceView()`；保存/切标签前统一刷新
- [x] **异步保存混写**：`createSaveSnapshot()` + `activeDocumentMatches()`
- [x] **批注上限截断**：导入不再 `slice`；上限只限制新建；cap 测试改为无损往返
- [x] **文档身份**：运行时 `documentId` / 内容指纹；去掉 File 按 basename 偷换 handle
- [x] **回归**：`tests/e2e-p0-data-integrity.spec.js`  
  主 E2E **116/116**、cap、lifecycle、AI、comment-pane、color 均通过

### P1（部分完成 → 全部完成）
- [x] **另存 .mentor 丢图**：`#btn-save-as` 走 `createSaveSnapshot` + `mediaFiles`
- [x] **ZIP bomb 限制**：压缩大小 / 条目数 / 解压总量（主线程 + worker）
- [x] **ZIP Worker 挂死**：`onerror`/`timeout` reject pending + `_resetZipWorker`
- [x] **`.mentor` autosave 外部冲突**：mtime 检查；冲突时跳过 autosave 并 toast
- [x] **`/open` 收紧**：去掉 CORS `*`；session token；路径白名单；`POST /allow-open`
- [x] **回归**：`tests/e2e-p1-save-media-zip.spec.js` 通过
- [x] **IDB 草稿**：正文 + 批注原子缓存（`DraftStore` / `Mentor-drafts`），崩溃可恢复
- [x] **IDB 写队列按 `documentId` 串行**：`createSerialWriteQueue` + `_idbDocWriteQueue`
- [x] **HandleStore 完整迁移 UUID 主键**：`filesById` + basename 兼容层
- [x] **输入性能**：light 校验按 transaction changed ranges 增量扫描 mark
- [x] **活动批注高亮改 DecorationSet**：`ActiveHighlightExtension` + `.annotation-active-deco`
- [x] **批注 history 改 inverse patch**：`computeInverseAnnPatch` / `applyAnnPatch`，不存全文 annotations 数组

### P2 产品 / 工程
- [x] **窄屏 / 触控**：三栏折叠芯片 + Pointer Events 拖拽；`Ctrl+[` / `Ctrl+]`
- [x] **键盘 / ARIA**：大纲 treeitem、批注 list、标签 tablist、对话框 dialog
- [x] **DOCX 导出标注「仅正文」**：按钮 `data-export-mode="body-only"` + toast
- [x] **`npm test` pretest**：`scripts/check-bundle-drift.mjs` 自动 build + drift 门禁
- [x] **`package.json` 许可证**：`AGPL-3.0-or-later`（version `1.44.8`）
- [x] **SCHEMA.md**：sidecar 可选字段 + documentId / DraftStore 说明 + references.json
- [x] **`app.js` 拆模块**：`modules/document-session.js` / `io.js` / `annotations.js` / `tabs.js` / `references.js`
- [x] **README**：`.mentor` 主路径 + v1.44.8 对齐

---

## 待做（按优先级）

（无 — 本文件「待做」项已全部完成）

---

## 关键文件

| 路径 | 说明 |
|------|------|
| `app.js` / `app.bundle.js` | 核心逻辑与浏览器 bundle |
| `modules/*.js` | DocumentSession / IO / annotations / tabs |
| `mentor.cmd` / `scripts/encode-open-path.ps1` | 启动器防注入 |
| `mentor-server.py` | `/open` token + 白名单 |
| `workers/zip-worker.js` | ZIP 解压限制 |
| `scripts/check-bundle-drift.mjs` | pretest bundle 门禁 |
| `tests/e2e-p0-data-integrity.spec.js` | P0 专项 |
| `tests/e2e-p1-save-media-zip.spec.js` | P1 另存/ZIP 专项 |
| `tests/e2e-todo-p1-remaining.spec.js` | P1/P2 residual |
| `tests/unit-modules.spec.js` | 纯模块 + 工程卫生 |
| `tests/e2e.spec.js` | 主 E2E（116） |

---

## 验证命令（定向，避免拖超时）

```bash
npm run build:bundle
node tests/unit-modules.spec.js
node tests/e2e-todo-p1-remaining.spec.js
node tests/e2e-p0-data-integrity.spec.js
node tests/e2e-p1-save-media-zip.spec.js
npm test                          # 需 8787 已起；pretest 会 check bundle
node tests/cap-edge.spec.js
node tests/v143-open-save-lifecycle.spec.js
```

---

## 备注

- 工作区原有未提交改动（颜色系统等）未回退
- **尚未 commit**；需要时再显式提交
- 2026-07-25：P1 剩余 + P2 全部落地；主 E2E 116/116
