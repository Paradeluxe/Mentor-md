# 测试文档

这是一个用于测试 Mentor 批注功能的 Markdown 文档。

## 第一章：引言

欢迎使用 Mentor！这是一个支持 docx 风格批注的 Markdown WYSIWYG 编辑器。

你可以拖选任意文字然后添加批注，所有批注会显示在右侧的批注面板中。

## 第二章：功能列表

- WYSIWYG 编辑（所见即所得）
- 选区级批注（精确到字符范围）
- 嵌套回复（threaded replies）
- 解决/重新打开批注
- 侧车 JSON 存储（源 .md 文件保持干净）

## 第三章：使用方法

1. 从工具栏打开一个 .md 文件或文件夹
2. 拖选任意文字范围
3. 浮动按钮 "💬 批注" 会出现，点击它
4. 在右侧批注面板输入批注内容
5. 按 Ctrl+S 保存

> 注意：保存时会下载两个文件：原始 .md 和对应的 .annotations.json。
> 将 .annotations.json 放在 .md 同目录，下次打开时会自动加载批注。

## 公式示例

行内公式：$E = mc^2$

代码示例：

```python
def hello():
    print("Hello, Mentor!")
```

表格示例：

| 功能 | 状态 | 备注 |
|------|------|------|
| WYSIWYG | ✅ | 基于 Tiptap |
| 选区批注 | ✅ | 基于 ProseMirror mark |
| 嵌套回复 | ✅ | Threaded |
| 解决批注 | ✅ | Toggle |
| 侧车 JSON | ✅ | xxx.md.annotations.json |

## 结束语

这就是测试文档的全部内容。试着在不同位置添加批注吧！