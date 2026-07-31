# Mentor .mentor Schema Spec v2

规范时间: 2026-07-09. 来源: tests/fixtures/*.mentor 现状 + app.js:readMentorZip/buildMentorZipBlob 实际写盘代码.

**v2 升级 (2026-07-09)**: 增加 `media/` 子目录支持, 解决 Pandoc 解 docx 生成的 `media/imageN.png` 引用在 .mentor 包里全部丢失的问题.

---

## 文件容器 (v2)

```
.mentor  =  ZIP (magic PK\x03\x04)
            ├── content.md              (utf-8 markdown 原文, 必有)
            ├── annotations.json        (utf-8 JSON sidecar, 必有)
            └── media/                  (可选, v2 新增)
                ├── image5.png
                ├── image6.png
                └── ...                  (Pandoc 解 docx 默认产物)
```

**v1 → v2 兼容性**: v1 .mentor (无 media/) 仍可正常打开, `readMentorZip` 会返回 `mediaFiles: {}`. v2 写的 .mentor 在老版本打开会丢失图片 (老版本只解 md+ann, 不解 media/*).

**content.md 中引用**: `![](media/image5.png)` — 打开时 `markdownToHtml(md, State.mediaUrls)` 自动替换 src 为 blob URL.

ZIP 内 `content.md` + `annotations.json` 同名约定, media/* 子目录按需

引用联动后的容器布局（引用文件均可选，旧 reader 可直接忽略）：

```text
.mentor ZIP
├── content.md
├── annotations.json
├── references.json   # 可选 normalized reference manifest v2（含 bibliography 配置）
├── references.bib    # 可选 canonical BibTeX，供 Pandoc citeproc 使用
└── media/
```

`references.json` 使用独立 `version: "2"`（读端仍兼容 v1：缺 `bibliography` 时补默认）。不得塞进 `annotations.json` 顶层。文献**元数据**可在 Mentor「文献库」侧栏管理；文末 References **列表**为生成字段（`<!-- mentor:bibliography -->`），不可直接逐字编辑。无引用库的旧 `.mentor` 不需要迁移；`annotations.json.version` 仍保持 `"1"`。

`references.json` 最小形状：

```json
{
  "version": "2",
  "source": { "name": "refs.bib", "format": "bibtex" },
  "updatedAt": "2026-07-26T00:00:00.000Z",
  "bibliography": { "enabled": false, "scope": "cited", "heading": "References" },
  "entries": [
    { "key": "alpha2020", "type": "article", "authors": "Alpha, Ann", "year": "2020", "title": "Title" }
  ]
}
```

正文可用语义标记 `<!-- mentor:bibliography -->` 表示动态文献列表位置（.mentor 保存标记；MD/DOCX 导出时物化为 `# References`）。

任何带 BOM 的 UTF-8 必须先 strip.

---

## annotations.json 顶层

| 字段         | 类型     | 必填 | 说明                                              |
| ------------ | -------- | ---- | ------------------------------------------------- |
| `version`    | string   | 必   | 当前固定 `"1"`. 升级时改数字, 不能改字段语义       |
| `document`   | string   | 必   | 对应 content.md 在 source FS 上的 basename (含 `.md`) |
| `updatedAt`  | string   | 必   | ISO-8601 UTC, 形如 `2026-07-06T09:08:23.187Z`     |
| `author`     | object   | 必   | 当前用户, `{ id: uuid, name: string }`             |
| `annotations`| array    | 必   | 批注 thread 数组, 见下. 空文档 = `[]` 不是 `null` |

**禁止字段**: 任何顶层额外字段 (no `meta`, no `settings`, no `_meta`). 加新字段必须 bump `version`.

---

## annotations[] (thread)

每个 thread = 一个选区 + 该选区下的一条评论串.

| 字段         | 类型     | 必填 | 默认     | 说明                                       |
| ------------ | -------- | ---- | -------- | ------------------------------------------ |
| `threadId`   | string   | 必   | -        | UUID v4 (crypto.randomUUID), thread 唯一 id |
| `text`       | string   | 必   | -        | 选中的 quoted text (用于重新定位和展示)     |
| `prefix`     | string   | 必   | `""`     | quoted text 前 32 chars context (避免位移歧义)|
| `suffix`     | string   | 必   | `""`     | quoted text 后 32 chars context              |
| `resolved`   | boolean  | 必   | `false`  | 是否已解决                                   |
| `createdAt`  | string   | 必   | -        | ISO-8601 UTC, thread 创建时刻               |
| `comments`   | array    | 必   | `[]`     | 评论数组, 见下                              |
| `range`      | object   | 否   | -        | `{ from, to }` PM 位置缓存 (保存可选)       |
| `ranges`     | array    | 否   | -        | 多 cell / 跨块范围 `[{from,to}, ...]`       |
| `imageAnchors` | array  | 否   | -        | 图片锚点 `[{from,to,src,alt,title}]`        |
| `deleted`    | boolean  | 否   | `false`  | 正文锚点丢失                               |
| `invalid`    | boolean  | 否   | `false`  | 位置不可靠                                 |
| `invalidReason` | string | 否  | -        | e.g. `text-edited` / `mark-missing` / `ambiguous` / `orphaned` |
| `fuzzy`      | boolean  | 否   | `false`  | 模糊重定位                                 |
| `authorColor`| number   | 否   | `0`      | 0–7 作者色槽                               |
| `threadType` | string   | 否   | -        | `ai` / `review` (mention 类型)             |
| `anchor`     | object   | 否   | -        | 多证据锚点（可选扩展，见下）               |

**`prefix` / `suffix` 不能丢**: 用于跨 edit 后重新定位 quoted text. 空字符串允许, 字段必须存在.

### `anchor` (可选, v1 multi-evidence)

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `version` | string | `"1"` |
| `quote` | object | `{ exact, prefix, suffix }` — 与顶层 text/prefix/suffix 同步投影 |
| `position` | object | `{ from, to, startAssoc, endAssoc }` 会话内 PM 位置缓存 |
| `structure` | object | 可选块路径/节点类型 |
| `status` | string | `attached` / `moved` / `edited` / `ambiguous` / `orphaned` |
| `confidence` | number | 0–1 |
| `updatedAt` | string | ISO-8601 |

**歧义纪律**: `status=ambiguous` 时禁止自动挂 mark；UI 须提示重新挂载。旧读写只认 prefix/text/suffix 仍合法。

---

## comments[] (单条评论)

| 字段         | 类型     | 必填 | 说明                                                |
| ------------ | -------- | ---- | --------------------------------------------------- |
| `id`         | string   | 必   | UUID v4, 评论唯一                                   |
| `author`     | object   | 必   | `{ id: uuid, name: string }`. **永远写对象, 不写字符串** |
| `body`       | string   | 必   | 评论正文 (markdown 子集). 空字符串允许              |
| `createdAt`  | string   | 必   | ISO-8601 UTC, 评论时刻                              |

**老格式兼容**: 历史 fixture 里有 `author: "AI Reviewer (Claude)"` 字符串形式 — 读取时必须容忍, 展示时 fallback 到 `name="匿名"`, 但**写盘永远写对象** (app.js:1815 etc.). 升级导入历史 .mentor 时一次性 normalize.

---

## 必填 vs 默认值 规则

- **timestamp 永远 UTC + `Z` 后缀**: 不用 `+08:00`, 不用 epoch number.
- **id 永远 UUID v4**: 不用 nanoid, 不用 increment int.
- **所有时间用 `new Date().toISOString()`** 输出 (app.js `nowISO()`).
- **空数组 = `[]` 不是 `null`**: `annotations`, `comments`.

---

## 不允许的改动 (向后兼容纪律)

v1 读盘器必须容忍:
- comments[].author 为字符串 (回退展示)
- annotations[] 顺序任意 (按 threadId 排序展示)
- 文件字段顺序任意

v1 读盘器必须 **拒绝** (报损坏):
- 缺 `version` / `document` / `updatedAt` / `author` / `annotations` 任一
- `annotations` 不是 array
- 任何 `thread.threadId` / `comment.id` 不是 string
- 任何时间字段不是合法 ISO-8601
- thread 缺 `text` / `prefix` / `suffix` / `resolved` / `createdAt` / `comments` 任一

---

## 运行时文档身份 (不写进 sidecar 顶层)

| 字段 | 说明 |
| ---- | ---- |
| `documentId` | 运行时 UUID；HandleStore / DraftStore / VersionStore 主键。basename 仅作兼容回退 |
| DraftStore | IndexedDB `Mentor-drafts`：`{ documentId, name, body, annotations, sidecar, updatedAt }` 原子缓存，崩溃恢复正文+批注 |
| VersionStore | IndexedDB `Mentor-versions`（DB_VERSION 1，store `versions`，keyPath `id`，index `documentId`/`createdAt`/`hash`）：`{ id, documentId, name, kind, label, createdAt, hash, byteSize, body, annotations, sidecar, references, mediaFiles, mediaOmitted }`。每次成功写盘（手动/磁盘自动保存）与「保存此版本」留一版；同名内容去重；保留策略见 `modules/version-history.js`（maxAutosave/maxNamed/maxTotal）。版本仅存本机浏览器，不随 .mentor 文件拷贝；恢复 = 载入编辑器并置 dirty，不自动写盘。mediaFiles 总大小 ≤8MB 才内嵌，超限置 `mediaOmitted: true`（恢复时图片从当前文件保留）。 |

## 版本升级路径

- 加字段 → bump `version: "2"`, 老读盘器忽略即可 (但要 declare 兼容性)
- 改字段语义 (e.g. `resolved` 改成 enum) → bump `version` + 写 migration script
- 删字段 → 不允许. 改 nullable.

**当前 shipped sidecar `version` 仍为 `"1"`**；可选 thread 字段向后兼容（老读盘器忽略未知字段）。

---

## 实际生成示例 (最小)

```json
{
  "version": "1",
  "document": "plan.md",
  "updatedAt": "2026-07-08T03:00:00.000Z",
  "author": { "id": "8401cb2a-d7ad-46c8-a368-48c3404b6bea", "name": "mentor-test" },
  "annotations": [
    {
      "threadId": "d7603448-523e-4721-9702-8118549b237b",
      "text": "选区级批注",
      "prefix": "",
      "suffix": "",
      "resolved": false,
      "createdAt": "2026-07-08T03:00:00.000Z",
      "comments": [
        {
          "id": "33c27b42-51a4-4ce6-b170-5308d1f95c64",
          "author": { "id": "8401cb2a-d7ad-46c8-a368-48c3404b6bea", "name": "mentor-test" },
          "body": "这里是评论",
          "createdAt": "2026-07-08T03:00:00.000Z"
        }
      ]
    }
  ]
}
```
