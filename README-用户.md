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
3. 桌面双击 **Mentor** → 浏览器打开编辑器

## 日常使用

| 操作 | 做法 |
|------|------|
| 启动 | 桌面 **Mentor** 或 双击 `mentor.cmd` |
| 打开文稿 | 工具栏「打开」，或双击 `.mentor` 文件 |
| 保存 | `Ctrl+S`（Chrome/Edge 可写回原路径） |
| 导出整包 | 工具栏 **.mentor**（含正文 + 批注 + 图片） |

## 端口

默认 `http://127.0.0.1:8787`。若占用，改解压目录里的 `PORT` 文件后重启。

## 卸载

- 删掉解压目录
- 删掉桌面 `Mentor.lnk`
- （可选）清理：注册表 `HKCU\Software\Classes\.mentor` 与 `Mentor.File`

## 故障

| 现象 | 处理 |
|------|------|
| 提示找不到 Python | 安装 Python 并勾选 PATH，重开命令行后再跑 `安装.cmd` |
| 端口被占用 | 改 `PORT`，或关掉占用 8787 的程序 |
| 双击 index.html 功能残缺 | 不要用；请走 `mentor.cmd` / 桌面快捷方式 |

## 更多

源码与更新：https://github.com/Paradeluxe/Mentor-md
