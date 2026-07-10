// Mentor 图标库 - inline SVG，0 依赖
// 风格: 24x24 viewBox, 1.5px stroke, 圆润端点, currentColor
// 参考: Lucide / Phosphor / Cursor 的设计语言
//
// 用法: <svg class="icon icon-md">${Icon.mdFile}</svg>
// CSS: .icon { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.5; }

window.MentorIcons = {
  // 文件夹
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`,

  // 文件 (.md) - 文档 + M 字装饰 (无字版)
  fileMd: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>`,

  // 文件 (.json) - 文档 + 括号
  fileJson: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/><path d="M10 13a2 2 0 0 0-2 2v0a2 2 0 0 1-2 2"/><path d="M14 13a2 2 0 0 1 2 2v0a2 2 0 0 0 2 2"/></svg>`,

  // 文件 (其他) - 文档
  fileOther: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/></svg>`,

  // 搜索
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,

  // 复制
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,

  // 重新加载
  reload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>`,

  // 下载到本地 (.md) - 文档 + 向下箭头
  downloadMd: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/><path d="M12 18V12"/><path d="m9 15 3 3 3-3"/></svg>`,

  // 导出 .docx - 文档 + Word 风折角 + 向下箭头
  downloadDocx: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5"/><path d="M14 3v6h6"/><path d="M9 12h6"/><path d="M9 16h4"/><path d="m17 17 3 3 3-3"/><path d="M20 16v8"/></svg>`,

  // 关闭 / X
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,

  // 折叠 (chevron-left, 用于 « 按钮)
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,

  // 折叠 (chevron-down, 用于展开/收起)
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,

  // 文档 (新建/通用)
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,

  // 文件夹打开 (打开文件夹)
  folderOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2H3V7z"/><path d="M3 9h18l-2 9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2L3 9z"/></svg>`,

  // 下载
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,

  // 保存
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15a0 0 0 0 1 0 0H5a0 0 0 0 1 0 0V3z"/><path d="M7 3v6h8V3"/><path d="M7 14h10v6H7z"/></svg>`,

  // 检查 (对勾)
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>`,

  // 加粗 B
  bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>`,

  // 斜体 I
  italic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5h-6"/><path d="M11 19H5"/><path d="m14 5-4 14"/></svg>`,

  // 删除线 S
  strike: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="M17 6.5a4 4 0 0 0-4-2.5 4 4 0 0 0-4 4c0 1.5 1 2.5 3 3l2 1c2 1 3 2 3 3.5a4 4 0 0 1-7 2"/></svg>`,

  // 行内代码 </>
  code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 4-4 16"/></svg>`,

  // 标题 H1
  h1: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5v14"/><path d="M13 5v14"/><path d="M5 12h8"/><path d="m16 9 2-1v11"/></svg>`,

  // 标题 H2
  h2: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5v14"/><path d="M13 5v14"/><path d="M5 12h8"/><path d="M16 9c0-1 1-2 2-2s2 1 2 2-1 2-2 3l-2 3h4"/></svg>`,

  // 标题 H3
  h3: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5v14"/><path d="M13 5v14"/><path d="M5 12h8"/><path d="M17 8h4l-3 3c2 0 3 1 3 2.5s-1 2.5-3 2.5-3-.5-3-2"/></svg>`,

  // 列表 •
  listBullet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h12"/><path d="M9 12h12"/><path d="M9 18h12"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/></svg>`,

  // 列表 1.
  listOrdered: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h12"/><path d="M9 12h12"/><path d="M9 18h12"/><path d="M4 4h2v4"/><path d="M4 12c0-1 1-1.5 2-1.5s2 .5 2 1.5-1 1.5-2 1.5-2 .5-2 1.5h4"/><path d="M5 17h2v2H4v-1l2-2"/></svg>`,

  // 引用 ""
  quote: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h4v6H5v-2a4 4 0 0 1 2-4z"/><path d="M15 7h4v6h-6v-2a4 4 0 0 1 2-4z"/></svg>`,

  // 代码块
  codeBlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m8 10-2 2 2 2"/><path d="m16 10 2 2-2 2"/></svg>`,

  // 链接
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,

  // 图片
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-9 9"/></svg>`,

  // 评论
  comment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l3-3a8 8 0 0 1 14-5z"/></svg>`,

  // 渲染模式 (眼睛) — 用于工具栏 "切换为渲染视图" 按钮 (当前是源码模式)
  renderMode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,

  // 源码模式 (< >) — 用于工具栏 "切换为源码视图" 按钮 (当前是渲染模式，默认状态)
  sourceMode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 6-4 12"/></svg>`,
};
