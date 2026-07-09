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

ZIP 内 `content.md` + `annotations.json` 同名约定, media/* 子目录按需打包. 任何带 BOM 的 utf-8 必须先 strip.

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

**`prefix` / `suffix` 不能丢**: 用于跨 edit 后重新定位 quoted text. 空字符串允许, 字段必须存在.

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

## 版本升级路径

- 加字段 → bump `version: "2"`, 老读盘器忽略即可 (但要 declare 兼容性)
- 改字段语义 (e.g. `resolved` 改成 enum) → bump `version` + 写 migration script
- 删字段 → 不允许. 改 nullable.

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
