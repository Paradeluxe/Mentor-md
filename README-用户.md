# Mentor — 用户安装说明（Windows）

像 Word 一样批注 Markdown。便携包，无需管理员。

## 需要什么

1. **Windows 10/11**
2. **Python 3**（[下载](https://www.python.org/downloads/) — 安装时勾选 **Add python.exe to PATH**）
3. **Chrome 或 Edge**（推荐；保存写回原文件更稳）

## 三步开始

1. 解压本 zip 到任意目录（例如 `C:\Apps\Mentor\`）
2. 双击 **`安装.cmd`**
   - 创建桌面快捷方式 **Mentor**
   - 注册 `.mentor` 双击打开
3. 桌面双击 **Mentor** → 浏览器打开**空壳编辑器**（先开软件）

## 日常使用（Word 式）

| 操作 | 做法 |
|------|------|
| 启动 | 桌面 **Mentor** 或 双击 `mentor.cmd` → 先开软件壳 |
| 打开文稿 | 工具栏「打开」，或资源管理器双击 `.mentor` |
| 保存 | `Ctrl+S`（Chrome/Edge 可写回原路径；首次可能要「授权写回」） |
| 导出整包 | 工具栏 **.mentor**（含正文 + 批注 + 图片） |
| 导出 DOCX | 工具栏 **DOCX**（有批注时含 Word 批注线程；引用库请用 .mentor） |
| 导入 DOCX | 「打开」选 `.docx` → 正文 + 批注进入编辑器，请另存为 `.mentor` |
| AI 批注宠物 | 保持 Mentor 开着；终端跑 `/fm` 时普通打开即可（不必深链） |

双击 `.mentor` 时地址栏是干净的 `index.html`（没有 `?open=`）。文件由本机 server 的 pending 队列交给编辑器，和 Word「先开软件再进文件」同一心智。

## 端口

默认 `http://127.0.0.1:8787`。若占用，改解压目录里的 `PORT` 文件后重启。

## 卸载

- 删掉解压目录
- 删掉桌面 `Mentor.lnk`
- （可选）双击 `uninstall-file-association.cmd`，或清理注册表 `HKCU\Software\Classes\.mentor` 与 `Mentor.File`

## 故障

| 现象 | 处理 |
|------|------|
| 提示找不到 Python | 安装 Python 并勾选 PATH，重开命令行后再跑 `安装.cmd` |
| 端口被占用 | 改 `PORT`，或关掉占用 8787 的程序 |
| 双击 index.html 功能残缺 | 不要用；请走 `mentor.cmd` / 桌面快捷方式 |
| 双击 .mentor 没打开内容 | 确认 8787 是 Mentor；重开桌面 Mentor 再双击文件 |
| 保存不能写回 | Ctrl+S →「授权写回并保存」选同一 `.mentor` 一次 |

## 更多

源码与更新：https://github.com/Paradeluxe/Mentor-md
