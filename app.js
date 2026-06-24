// ============================================================
// Mentor — WYSIWYG Markdown editor with docx-style comments
// ============================================================
//
// 单文件 HTML + ES Module imports from esm.sh CDN
// 启动：双击 index.html 或起本地 HTTP 服务 (python -m http.server)

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { Node } from '@tiptap/core';
import TurndownService from 'turndown';

// ============================================================
// Tiptap Node: KatexInline — 保留 KaTeX 渲染输出作为原子节点
// Tiptap/ProseMirror 默认会把 <span class="katex"> 内部的 MathML/HTML 拆掉，
// 这里用 atom node + 原始 HTML 字符串解决
// ============================================================
const KatexInline = Node.create({
  name: 'katex',
  group: 'inline',
  inline: true,
  atom: true,        // 不可分割
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      // 原始 LaTeX 源码（保存时用）
      tex: { default: '' },
    };
  },
  parseHTML() {
    // 识别 .katex-wrapper 包裹层
    return [{
      tag: 'span.katex-wrapper',
      getAttrs: node => ({ tex: node.getAttribute('data-tex') || '' }),
    }];
  },
  renderHTML({ HTMLAttributes, node }) {
    // 编辑时用 KaTeX 重新渲染
    let inner = '';
    try {
      inner = katex.renderToString(node.attrs.tex, { throwOnError: false });
    } catch (e) {
      inner = `<span class="katex-error">${node.attrs.tex}</span>`;
    }
    return ['span', { class: 'katex-wrapper', 'data-tex': node.attrs.tex, contenteditable: 'false' }, inner];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'katex-wrapper';
      dom.setAttribute('contenteditable', 'false');
      dom.setAttribute('data-tex', node.attrs.tex);
      try {
        dom.innerHTML = katex.renderToString(node.attrs.tex, { throwOnError: false });
      } catch (e) {
        dom.textContent = node.attrs.tex;
      }
      return { dom };
    };
  },
});

const KatexBlock = Node.create({
  name: 'katexBlock',
  group: 'block',
  atom: true,
  draggable: false,
  addAttributes() {
    return { tex: { default: '' } };
  },
  parseHTML() {
    return [{
      tag: 'div.katex-wrapper-display',
      getAttrs: node => ({ tex: node.getAttribute('data-tex') || '' }),
    }];
  },
  renderHTML({ node }) {
    let inner = '';
    try {
      inner = katex.renderToString(node.attrs.tex, { throwOnError: false, displayMode: true });
    } catch (e) {
      inner = `<span class="katex-error">${node.attrs.tex}</span>`;
    }
    return ['div', { class: 'katex-wrapper-display', 'data-tex': node.attrs.tex, contenteditable: 'false' }, inner];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'katex-wrapper-display';
      dom.setAttribute('contenteditable', 'false');
      dom.setAttribute('data-tex', node.attrs.tex);
      try {
        dom.innerHTML = katex.renderToString(node.attrs.tex, { throwOnError: false, displayMode: true });
      } catch (e) {
        dom.textContent = node.attrs.tex;
      }
      return { dom };
    };
  },
});

// ============================================================
// 1. 全局状态
// ============================================================
const State = {
  editor: null,
  currentFile: null,        // { name, path, handle?, content, annotations, dirty, folderHandle? }
  annotations: [],          // 当前文档所有批注 thread
  activeThreadId: null,     // 当前在侧栏高亮的 thread
  author: localStorage.getItem('Mentor:author') || '',
  filterOpen: true,
  filterResolved: false,
  folderHandle: null,       // 当前文件夹 handle（FileSystemDirectoryHandle）
  saveMode: 'unknown',      // 'handle' | 'download' | 'unknown'
  readOnlyMode: false,      // P0-A: 另一 tab 在编辑时启用只读 (Ctrl+S 禁用)
  fileMtime: null,          // P0-C: 主 .md 的 mtime (last save 时记录的)
  renderMode: 'rendered',   // 'rendered' = WYSIWYG 渲染; 'source' = 显示原始 markdown 源码
};

// ============================================================
// 1.5 IndexedDB 持久化 File System Access handles
// ============================================================
const HandleStore = {
  DB_NAME: 'Mentor-handles',
  DB_VERSION: 1,
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'path' });
        }
        if (!db.objectStoreNames.contains('lastFile')) {
          db.createObjectStore('lastFile', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  },

  async putFolder(path, handle) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readwrite');
      tx.objectStore('folders').put({ path, handle, updatedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async getFolder(path) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readonly');
      const req = tx.objectStore('folders').get(path);
      req.onsuccess = () => resolve(req.result ? req.result.handle : null);
      req.onerror = () => reject(req.error);
    });
  },

  async listFolders() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readonly');
      const req = tx.objectStore('folders').getAll();
      req.onsuccess = () => resolve(req.result.map(r => r.path));
      req.onerror = () => reject(req.error);
    });
  },

  async deleteFolder(path) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readwrite');
      tx.objectStore('folders').delete(path);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async putLastFile(folderPath, fileName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lastFile', 'readwrite');
      tx.objectStore('lastFile').put({ id: 'last', folderPath, fileName, updatedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async getLastFile() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lastFile', 'readonly');
      const req = tx.objectStore('lastFile').get('last');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
};

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

// ============================================================
// 自定义 markdown-it KaTeX 插件
// 支持 $inline$ 和 $$block$$ 公式
// 边界处理: $前后不能是字母数字（避免误匹配 "5$10$"）
// 转义处理: \$ 不视为公式
// ============================================================
function mathInlineRule(state, silent) {
  const pos = state.pos;
  if (state.src[pos] !== '$') return false;
  // 排除 $$ (block)
  if (state.src[pos + 1] === '$') return false;

  // 前字符必须是边界（不能是字母/数字）
  const prevChar = pos > 0 ? state.src[pos - 1] : '';
  if (/[a-zA-Z0-9]/.test(prevChar)) {
    if (!silent) state.pending += '$';
    state.pos = pos + 1;
    return true; // 吞掉这个 $，避免后面匹配
  }

  // 找匹配 $（跳过 \$）
  let end = pos + 1;
  while (end < state.posMax) {
    if (state.src[end] === '\\') { end += 2; continue; }
    if (state.src[end] === '$') break;
    end++;
  }
  if (end >= state.posMax) {
    if (!silent) state.pending += '$';
    state.pos = pos + 1;
    return true;
  }

  // 后字符必须是边界
  const nextChar = end + 1 < state.posMax ? state.src[end + 1] : '';
  if (/[a-zA-Z0-9]/.test(nextChar)) {
    if (!silent) state.pending += '$';
    state.pos = pos + 1;
    return true;
  }

  const content = state.src.slice(pos + 1, end);
  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.markup = '$';
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}

function mathBlockRule(state, startLine, endLine, silent) {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const maxPos = state.eMarks[startLine];
  if (startPos + 2 > maxPos) return false;
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false;

  let line = startLine;
  let content = '';
  let found = false;

  while (line < endLine) {
    const lineStart = state.bMarks[line] + state.tShift[line];
    const lineEnd = state.eMarks[line];
    const lineText = state.src.slice(lineStart, lineEnd);

    if (line === startLine) {
      const trimmed = lineText.slice(2); // 去掉行首 $$
      // 同行闭合: $$ x = 1 $$
      if (trimmed.endsWith('$$') && trimmed.length > 2) {
        content = trimmed.slice(0, -2);
        found = true;
        break;
      }
      content = trimmed + '\n';
    } else {
      const idx = lineText.indexOf('$$');
      if (idx !== -1) {
        content += lineText.slice(0, idx);
        found = true;
        break;
      }
      content += lineText + '\n';
    }
    line++;
  }

  if (!found) return false;

  state.line = line + 1;
  if (!silent) {
    const token = state.push('math_block', 'div', 0);
    token.markup = '$$';
    token.block = true;
    token.content = content.trim();
    token.map = [startLine, state.line];
  }
  return true;
}

md.inline.ruler.after('escape', 'math_inline', mathInlineRule);
md.block.ruler.after('blockquote', 'math_block', mathBlockRule, {
  alt: ['paragraph', 'reference', 'blockquote', 'list']
});
md.renderer.rules.math_inline = (tokens, idx) => {
  const tex = tokens[idx].content;
  // 用 .katex-wrapper 包裹，让 Tiptap 解析为 KatexInline node
  return `<span class="katex-wrapper" data-tex="${escapeHtml(tex)}" contenteditable="false"><span class="katex-placeholder">${escapeHtml(tex)}</span></span>`;
};
md.renderer.rules.math_block = (tokens, idx) => {
  const tex = tokens[idx].content;
  return `<div class="katex-wrapper-display" data-tex="${escapeHtml(tex)}" contenteditable="false"><span class="katex-placeholder">${escapeHtml(tex)}</span></div>\n`;
};

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });

// ============================================================
// Turndown 规则: 把 KaTeX HTML 转回 LaTeX 源码
// KaTeX 渲染的 DOM 结构:
//   <span class="katex">
//     <span class="katex-mathml"><math><semantics>...<annotation encoding="application/x-tex">SOURCE</annotation></semantics></math></span>
//     <span class="katex-html">...</span>
//   </span>
//   (block) <div class="katex-display">...</div>
// ============================================================
turndown.addRule('katex-wrapper-inline', {
  filter: node => {
    if (!node || !node.classList) return false;
    return node.classList.contains('katex-wrapper') && !node.classList.contains('katex-wrapper-display');
  },
  replacement: (content, node) => {
    const tex = node.getAttribute('data-tex') || '';
    return tex ? `$${tex}$` : content;
  },
});

turndown.addRule('katex-wrapper-block', {
  filter: node => {
    if (!node || !node.classList) return false;
    return node.classList.contains('katex-wrapper-display');
  },
  replacement: (content, node) => {
    const tex = node.getAttribute('data-tex') || '';
    return tex ? `\n\n$$${tex}$$\n\n` : content;
  },
});

// ============================================================
// Turndown 规则: <table> → GFM markdown 表格
// Turndown 默认会把 <table> 转成纯文本（"cell1 cell2 cell3"），不识别 GFM 表格语法。
// 这里手写规则逐 cell 解析，保留 <thead>/<tbody> 结构和单元格对齐。
// ============================================================
turndown.addRule('gfm-table', {
  filter: 'table',
  replacement: (content, node) => {
    if (!node || !node.rows || node.rows.length === 0) return content;

    // 收集 header 行（thead > tr 或 第一行 tr）
    const headerRow = (() => {
      const thead = node.tHead;
      if (thead && thead.rows.length > 0) return thead.rows[0];
      // 没有 thead 时，第一行如果是 th 就当 header
      const firstRow = node.rows[0];
      if (firstRow && firstRow.cells.length > 0 && firstRow.cells[0].tagName === 'TH') {
        return firstRow;
      }
      return null;
    })();

    const headerCells = headerRow
      ? Array.from(headerRow.cells).map(c => extractCellText(c).trim() || ' ')
      : null;

    // 数据行：theader 之后的行；没有 thead 时从第一行之后开始
    let dataRows;
    if (headerRow && headerRow.parentNode === node.tHead) {
      dataRows = Array.from(node.tBodies).flatMap(tb => Array.from(tb.rows));
    } else {
      dataRows = Array.from(node.rows).slice(headerRow ? 1 : 0);
    }

    // 计算每列宽度，让分隔行（---|---|---）对齐
    const colCount = Math.max(
      headerCells ? headerCells.length : 0,
      ...dataRows.map(r => r.cells.length),
    );

    const rows = [];
    if (headerCells) {
      rows.push(headerCells);
      rows.push(Array.from({ length: colCount }, () => '---'));
    }
    for (const row of dataRows) {
      const cells = Array.from(row.cells).map(c => extractCellText(c).trim() || ' ');
      // 补齐缺失列
      while (cells.length < colCount) cells.push(' ');
      rows.push(cells);
    }

    return rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n\n';
  },
});

// 提取 cell 内文本（保留 KaTeX wrapper 的 data-tex 转回 $...$）
function extractCellText(cell) {
  // 处理嵌套的 KaTeX wrappers
  const katexInline = cell.querySelector('.katex-wrapper:not(.katex-wrapper-display)');
  if (katexInline && katexInline.getAttribute('data-tex')) {
    // 简单情况：cell 内只有一个公式 → 用 $...$
    const onlyKatex = cell.children.length === 1 && cell.firstElementChild === katexInline;
    if (onlyKatex) return '$' + katexInline.getAttribute('data-tex') + '$';
  }
  const katexBlock = cell.querySelector('.katex-wrapper-display');
  if (katexBlock && katexBlock.getAttribute('data-tex') && cell.children.length === 1) {
    return '$$' + katexBlock.getAttribute('data-tex') + '$$';
  }
  // 用 turndown 处理 cell 内部（递归应用规则）
  return turndown.turndown(cell.innerHTML).replace(/\n+/g, ' ').trim();
}

// ============================================================
// 2. Tiptap 自定义 mark: AnnotationMark
//    把 docx 风格批注作为 inline mark 存到 ProseMirror
//    mark 的 attrs: { threadId, resolved }
// ============================================================
import { Mark } from '@tiptap/core';

const AnnotationMark = Mark.create({
  name: 'annotation',
  inclusive: false,           // 不延伸到光标位置，避免新增文字继承 mark
  exitable: true,             // 光标可以移出 mark
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: el => el.getAttribute('data-thread-id'),
        renderHTML: attrs => attrs.threadId ? { 'data-thread-id': attrs.threadId } : {},
      },
      resolved: {
        default: false,
        parseHTML: el => el.getAttribute('data-resolved') === 'true',
        renderHTML: attrs => ({ 'data-resolved': attrs.resolved ? 'true' : 'false' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-thread-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', {
      class: `annotation-mark${HTMLAttributes['data-resolved'] === 'true' ? ' is-resolved' : ''}`,
      ...HTMLAttributes,
    }, 0];
  },
});

// ============================================================
// 3. 工具函数
// ============================================================
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nowISO() { return new Date().toISOString(); }
function formatTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function setStatus(left, right) {
  if (left !== undefined) $('#status-left').textContent = left;
  if (right !== undefined) $('#status-right').textContent = right;
}

function markDirty() {
  if (State.currentFile) {
    State.currentFile.dirty = true;
    $('#dirty-indicator').classList.add('is-dirty');
    $('#current-file-name').textContent = State.currentFile.name + ' ●';
    updateTreeDirtyDots();
  }
}

function markClean() {
  if (State.currentFile) {
    State.currentFile.dirty = false;
    $('#dirty-indicator').classList.remove('is-dirty');
    $('#current-file-name').textContent = State.currentFile.name;
    updateTreeDirtyDots();
  }
}

// 更新 tree 中所有文件的 dirty 圆点（per-file）
function updateTreeDirtyDots() {
  $$('.tree-node[data-handle-name]').forEach(el => {
    const name = el.dataset.handleName;
    const isCurrent = State.currentFile && State.currentFile.name === name;
    const isDirty = isCurrent && State.currentFile.dirty;
    const existing = el.querySelector('.dirty-dot-mini');
    if (isDirty && !existing) {
      const dot = document.createElement('span');
      dot.className = 'dirty-dot-mini';
      dot.title = '未保存';
      // 插在 .filename 之后
      const fn = el.querySelector('.filename');
      if (fn) fn.after(dot);
      else el.appendChild(dot);
    } else if (!isDirty && existing) {
      existing.remove();
    }
  });
}

// ============================================================
// 4. Tiptap 初始化
// ============================================================
function initEditor() {
  const editorEl = $('#editor');

  State.editor = new Editor({
    element: editorEl,
    extensions: [
      StarterKit.configure({
        // 历史栈深度
        history: { depth: 100 },
      }),
      Highlight.configure({ multicolor: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image,
      Placeholder.configure({ placeholder: '在此输入 Markdown，或从工具栏打开文件…' }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: 'md-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      AnnotationMark,
      KatexInline,
      KatexBlock,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      markDirty();
      // 文本变化时，需要重新解析已存在的批注 mark 位置（保持侧栏锚定）
      // 这里只刷新侧栏显示顺序，不动数据
      renderCommentList();
      // 大纲同步
      renderOutline();
    },
    onSelectionUpdate: ({ editor }) => {
      handleSelectionChange();
    },
  });
}

// ============================================================
// 5. 浮动批注按钮 — 选中文本后出现 + 选区在 mark 内自动激活批注
// ============================================================
function handleSelectionChange() {
  const editor = State.editor;
  if (!editor) return;
  const { from, to, empty } = editor.state.selection;
  const btn = $('#float-comment-btn');

  // 检测选区是否在 annotation mark 内（empty selection 也算）
  const markType = editor.schema.marks.annotation;
  let activeMarkThreadId = null;
  if (empty) {
    // 光标位置 resolve
    const $pos = editor.state.doc.resolve(from);
    const mark = $pos.marks().find(m => m.type === markType);
    if (mark) activeMarkThreadId = mark.attrs.threadId;
  } else {
    // 选区起点/终点只要有一个有 mark
    const $from = editor.state.doc.resolve(from);
    const $to = editor.state.doc.resolve(to);
    const m1 = $from.marks().find(m => m.type === markType);
    const m2 = $to.marks().find(m => m.type === markType);
    activeMarkThreadId = (m1 && m1.attrs.threadId) || (m2 && m2.attrs.threadId);
  }
  if (activeMarkThreadId) {
    if (State.activeThreadId !== activeMarkThreadId) {
      State.activeThreadId = activeMarkThreadId;
      highlightActiveMark();
      renderCommentList(); // 重新渲染以 pinned 方式显示
    }
  }

  if (empty || from === to) {
    btn.classList.add('hidden');
    return;
  }
  // 选区必须在同一 block 内（mark 不能跨 block）
  const $from = editor.state.doc.resolve(from);
  const $to = editor.state.doc.resolve(to);
  if ($from.parent !== $to.parent) {
    btn.classList.add('hidden');
    setStatus('提示', '批注暂不支持跨段落选区，请选单段内文字');
    return;
  }

  // 定位按钮：选区上沿
  try {
    const start = editor.view.coordsAtPos(from);
    const editorPane = $('#editor-pane');
    const paneRect = editorPane.getBoundingClientRect();
    const top = start.top - paneRect.top + editorPane.scrollTop - 32;
    const left = start.left - paneRect.left + editorPane.scrollLeft;
    btn.style.top = `${Math.max(0, top)}px`;
    btn.style.left = `${left}px`;
    btn.classList.remove('hidden');
  } catch (e) {
    btn.classList.add('hidden');
  }
}

function setupFloatCommentButton() {
  $('#float-comment-btn button').addEventListener('click', () => {
    const { from, to } = State.editor.state.selection;
    if (from === to) return;
    const text = State.editor.state.doc.textBetween(from, to, ' ');
    if (!State.author) {
      // 弹作者输入
      promptAuthor().then(() => {
        if (State.author) createAnnotationThread(from, to, text);
      });
    } else {
      createAnnotationThread(from, to, text);
    }
  });
  // mark 删除按钮: 从正文删除当前 active 批注
  $('#mark-delete-btn').addEventListener('click', () => {
    const threadId = State.activeThreadId;
    if (!threadId) return;
    deleteThread(threadId);
  });
  // 点击空白处 / 切换 active 时隐藏 popover
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#float-comment-btn') && !e.target.closest('.ProseMirror')) {
      $('#float-comment-btn').classList.add('hidden');
    }
  });
  // 编辑器滚动时同步 popover 位置
  const editorPane = $('#editor-pane');
  if (editorPane) editorPane.addEventListener('scroll', positionMarkDeletePopover);
}

// ============================================================
// 6. 批注数据模型 + CRUD
// ============================================================

// AI 协作协议：事件系统
const AIListeners = { newComment: [], threadChange: [] };
function emitAI(event, payload) {
  (AIListeners[event] || []).forEach(cb => {
    try { cb(payload); } catch (e) { console.warn('AI listener error:', e); }
  });
}

function createAnnotationThread(from, to, text) {
  // P2-A: 异常数据防御 - 拒绝空 text
  if (!text || text.length === 0) {
    showToast('批注文字不能为空', 2000);
    return null;
  }
  const threadId = uuid();
  const commentId = uuid();
  // 计算 prefix/suffix (用于鲁棒重定位)
  // 重要: 用 doc.textBetween (渲染后), 不是 markdown 源 (避免空格/换行差异)
  const docText = State.editor.state.doc.textBetween(0, State.editor.state.doc.content.size, ' ');
  const { prefix, suffix } = computeContext(text, docText);
  const thread = {
    threadId,
    range: { from, to },
    text,                  // 锚定文字
    prefix,                // text 前的上下文 (max 20 字符, 换行截断)
    suffix,                // text 后的上下文
    resolved: false,
    createdAt: nowISO(),
    comments: [{
      id: commentId,
      author: State.author,
      body: '',
      createdAt: nowISO(),
    }],
  };
  State.annotations.push(thread);
  // 在编辑器中加 mark
  applyAnnotationMark(threadId, from, to);
  // 高亮新批注
  State.activeThreadId = threadId;
  renderCommentList();
  // 自动聚焦新批注的输入框
  setTimeout(() => {
    const ta = document.querySelector(`[data-thread-input="${threadId}"]`);
    if (ta) ta.focus();
  }, 50);
  setStatus('已创建批注', `线程 ${threadId.slice(0, 8)}`);
  // AI 协作协议：通知
  emitAI('threadChange', { threadId, change: 'create', thread });
}

function applyAnnotationMark(threadId, from, to) {
  const tr = State.editor.state.tr;
  tr.addMark(from, to, State.editor.schema.marks.annotation.create({ threadId, resolved: false }));
  State.editor.view.dispatch(tr);
  // 不调用 markDirty（这是结构性 mark 变化，已在 onUpdate 触发）
  // 但 markDirty 只在 doc 文本变化时——这里 mark 变化也会触发 onUpdate
}

function addReply(threadId, body) {
  const thread = State.annotations.find(t => t.threadId === threadId);
  if (!thread || !body.trim()) return;
  const comment = {
    id: uuid(),
    author: State.author,
    body: body.trim(),
    createdAt: nowISO(),
  };
  thread.comments.push(comment);
  markDirty();
  renderCommentList();
  // AI 协作协议：通知监听者
  emitAI('newComment', { threadId, comment });
  emitAI('threadChange', { threadId, change: 'reply', comment });
}

function toggleResolved(threadId) {
  const thread = State.annotations.find(t => t.threadId === threadId);
  if (!thread) return;
  thread.resolved = !thread.resolved;
  // 同步更新 mark attrs（清掉旧 mark 加新的）
  const editor = State.editor;
  const tr = editor.state.tr;
  const markType = editor.schema.marks.annotation;
  editor.state.doc.descendants((node, pos) => {
    node.marks.forEach(m => {
      if (m.type === markType && m.attrs.threadId === threadId) {
        tr.removeMark(pos, pos + node.nodeSize, markType);
        tr.addMark(pos, pos + node.nodeSize, markType.create({ threadId, resolved: thread.resolved }));
      }
    });
  });
  editor.view.dispatch(tr);
  markDirty();
  renderCommentList();
  // AI 协作协议：通知
  emitAI('threadChange', { threadId, change: 'resolved', resolved: thread.resolved });
}

function deleteThread(threadId) {
  if (!confirm('删除此批注线程？此操作不可撤销。')) return;
  // 移除 mark
  const editor = State.editor;
  const tr = editor.state.tr;
  const markType = editor.schema.marks.annotation;
  editor.state.doc.descendants((node, pos) => {
    node.marks.forEach(m => {
      if (m.type === markType && m.attrs.threadId === threadId) {
        tr.removeMark(pos, pos + node.nodeSize, markType);
      }
    });
  });
  editor.view.dispatch(tr);
  // 移除数据
  State.annotations = State.annotations.filter(t => t.threadId !== threadId);
  if (State.activeThreadId === threadId) State.activeThreadId = null;
  markDirty();
  renderCommentList();
  // 同步 mark-delete popover 隐藏
  positionMarkDeletePopover();
  // AI 协作协议：通知
  emitAI('threadChange', { threadId, change: 'delete' });
}

// ============================================================
// 7. 渲染批注侧栏
// ============================================================
function renderCommentList() {
  const list = $('#comment-list');
  const empty = $('#comment-empty');
  const filtered = State.annotations.filter(t => {
    if (State.filterOpen && !State.filterResolved && t.resolved) return false;
    if (State.filterResolved && !State.filterOpen && !t.resolved) return false;
    return true;
  });

  // 即使被 filter 隐藏，active thread 也强制显示（pinned）
  const activeThread = State.activeThreadId
    ? State.annotations.find(t => t.threadId === State.activeThreadId)
    : null;
  const isPinned = activeThread && !filtered.includes(activeThread);
  const pinnedThread = isPinned ? activeThread : null;
  const visibleThreads = pinnedThread
    ? [pinnedThread, ...filtered.filter(t => t.threadId !== pinnedThread.threadId)]
    : filtered;

  if (visibleThreads.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = visibleThreads.map(thread => {
    const first = thread.comments?.[0] || { author: '匿名', body: '', createdAt: thread.createdAt || new Date().toISOString() };
    const replies = (thread.comments || []).slice(1);
    const isActive = State.activeThreadId === thread.threadId;
    const isPinnedThread = pinnedThread && thread.threadId === pinnedThread.threadId;
    return `
      <div class="comment-thread ${isActive ? 'is-active' : ''} ${thread.resolved ? 'is-resolved' : ''} ${isPinnedThread ? 'is-pinned' : ''} ${thread.fuzzy ? 'is-fuzzy' : ''}" data-thread="${thread.threadId}">
        ${isPinnedThread ? '<div class="pinned-banner">📌 当前光标处 (filter 已隐藏)</div>' : ''}
        ${thread.fuzzy ? '<div class="fuzzy-banner">⚠ 位置可能偏移 - 请检查文档</div>' : ''}
        <div class="comment-quote">${escapeHtml((thread.text || '').slice(0, 100))}${(thread.text || '').length > 100 ? '…' : ''}</div>
        <div class="comment-item">
          <div class="comment-meta">
            <span class="comment-author">${escapeHtml(first.author || '匿名')}</span>
            <span>${formatTime(first.createdAt)}</span>
          </div>
          ${first.body ? `<div class="comment-body">${escapeHtml(first.body)}</div>` : `
            <div class="comment-reply-form">
              <textarea data-thread-input="${thread.threadId}" placeholder="输入批注内容..."></textarea>
              <div class="form-actions">
                <button data-act="submit-reply" data-thread="${thread.threadId}" class="primary">提交</button>
              </div>
            </div>
          `}
          ${replies.map(r => `
            <div class="comment-reply">
              <div class="comment-meta">
                <span class="comment-author">${escapeHtml(r.author || '匿名')}</span>
                <span>${formatTime(r.createdAt)}</span>
              </div>
              <div class="comment-body">${escapeHtml(r.body)}</div>
            </div>
          `).join('')}
          ${first.body ? `
            <details class="reply-toggle">
              <summary style="font-size:11px;color:var(--muted);cursor:pointer;padding:4px 0;">↳ 回复</summary>
              <div class="comment-reply-form">
                <textarea data-thread-input="${thread.threadId}" placeholder="输入回复..."></textarea>
                <div class="form-actions">
                  <button data-act="submit-reply" data-thread="${thread.threadId}" class="primary">提交</button>
                </div>
              </div>
            </details>
          ` : ''}
          <div class="comment-actions">
            <button data-act="goto" data-thread="${thread.threadId}">📍 跳转</button>
            <button data-act="resolve" data-thread="${thread.threadId}">${thread.resolved ? '↺ 重新打开' : '✓ 解决'}</button>
            <button data-act="delete" data-thread="${thread.threadId}" class="danger">🗑 删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 绑定事件
  list.querySelectorAll('[data-act="submit-reply"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.thread;
      const ta = document.querySelector(`[data-thread-input="${tid}"]:not(details [data-thread-input="${tid}"])`) ||
                 document.querySelector(`details [data-thread-input="${tid}"]`);
      const fallback = list.querySelector(`[data-thread-input="${tid}"]`);
      const input = ta || fallback;
      if (input && input.value.trim()) {
        addReply(tid, input.value);
      }
    });
  });
  list.querySelectorAll('[data-act="goto"]').forEach(btn => {
    btn.addEventListener('click', () => scrollToThread(btn.dataset.thread));
  });
  list.querySelectorAll('[data-act="resolve"]').forEach(btn => {
    btn.addEventListener('click', () => toggleResolved(btn.dataset.thread));
  });
  list.querySelectorAll('[data-act="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteThread(btn.dataset.thread));
  });
  // 点击 thread 高亮对应 mark
  list.querySelectorAll('.comment-thread').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('textarea') || e.target.closest('details')) return;
      State.activeThreadId = el.dataset.thread;
      highlightActiveMark();
      renderCommentList();
    });
  });
}

function scrollToThread(threadId) {
  const thread = State.annotations.find(t => t.threadId === threadId);
  if (!thread) return;
  const editor = State.editor;
  // 找 mark 位置（因为文本可能改过，重新解析）
  let pos = null;
  editor.state.doc.descendants((node, p) => {
    node.marks.forEach(m => {
      if (m.type === editor.schema.marks.annotation && m.attrs.threadId === threadId) {
        if (pos === null) pos = p;
      }
    });
  });
  if (pos !== null) {
    editor.commands.focus(pos);
    editor.commands.setTextSelection({ from: pos, to: pos + (thread.range.to - thread.range.from) });
    State.activeThreadId = threadId;
    highlightActiveMark();
    renderCommentList();
  } else {
    showToast('批注位置已失效（可能文档被修改）');
  }
}

function highlightActiveMark() {
  const editor = State.editor;
  const editorEl = editor.view.dom;
  editorEl.querySelectorAll('.annotation-mark').forEach(el => el.classList.remove('is-active'));
  if (State.activeThreadId) {
    const marks = editorEl.querySelectorAll(`.annotation-mark[data-thread-id="${State.activeThreadId}"]`);
    marks.forEach(el => el.classList.add('is-active'));
  }
  // 同步 mark-delete popover 位置
  positionMarkDeletePopover();
}

// 把删除 popover 定位到 active mark 上方
function positionMarkDeletePopover() {
  const popover = $('#mark-delete-popover');
  if (!popover) return;
  const threadId = State.activeThreadId;
  if (!threadId) {
    popover.classList.add('hidden');
    return;
  }
  // 找到 mark 的位置
  const editor = State.editor;
  let pos = null;
  editor.state.doc.descendants((node, p) => {
    node.marks.forEach(m => {
      if (m.type === editor.schema.marks.annotation && m.attrs.threadId === threadId) {
        if (pos === null) pos = p;
      }
    });
  });
  if (pos === null) {
    popover.classList.add('hidden');
    return;
  }
  // 定位到 mark 上方
  try {
    const coords = editor.view.coordsAtPos(pos);
    const editorPane = $('#editor-pane');
    const paneRect = editorPane.getBoundingClientRect();
    popover.style.left = (coords.left - paneRect.left + editorPane.scrollLeft) + 'px';
    popover.style.top = (coords.top - paneRect.top + editorPane.scrollTop - 26) + 'px';  // 26 = 按钮高 + 间距
    popover.classList.remove('hidden');
  } catch (e) {
    popover.classList.add('hidden');
  }
}

// ============================================================
// 8. 文件操作
// ============================================================

// --- 文件 → HTML (markdown-it)
function markdownToHtml(mdText) {
  return md.render(mdText);
}

// --- HTML → markdown (turndown)
function htmlToMarkdown(html) {
  // turndown 默认会丢 mark，先去掉 annotation-mark 标签，保留内部文本
  html = html.replace(/<span[^>]*data-thread-id[^>]*>(.*?)<\/span>/gs, '$1');
  return turndown.turndown(html);
}

// ============================================================
// 渲染模式切换: 'rendered' (WYSIWYG) ↔ 'source' (原始 markdown)
// 工具栏按钮 + 独立的 .source-view <pre> 覆盖编辑器
// 切换时: rendered→source 把 HTML 转回 md; source→rendered 把 <pre> 内容 setContent 回编辑器
// ============================================================
function setRenderMode(mode) {
  if (mode !== 'rendered' && mode !== 'source') return;
  if (mode === State.renderMode) return;
  State.renderMode = mode;
  const btn = $('#btn-toggle-render');
  const editorPane = $('#editor-pane');
  const tiptapEl = $('#editor');
  const hintEl = $('#empty-editor-hint');
  let sourceEl = $('#source-view');

  if (mode === 'source') {
    // 渲染 → 源码: 取当前 HTML → turndown → 放进 <pre>
    const html = State.editor.getHTML();
    const md = htmlToMarkdown(html);
    if (!sourceEl) {
      sourceEl = document.createElement('pre');
      sourceEl.id = 'source-view';
      sourceEl.className = 'source-view';
      sourceEl.setAttribute('spellcheck', 'false');
      sourceEl.setAttribute('tabindex', '0');  // 让 <pre> 可获得键盘焦点（默认不可 focus）
      sourceEl.setAttribute('contenteditable', 'true');  // 显式声明可编辑（即使 <pre> 默认 plain text）
      // 编辑源码时（contenteditable）→ 标 dirty + 同步到 State.currentFile.content
      sourceEl.addEventListener('input', () => {
        if (!State.currentFile) return;
        State.currentFile.content = sourceEl.innerText;
        markDirty();
      });
      editorPane.insertBefore(sourceEl, hintEl);
    }
    sourceEl.innerText = md;
    tiptapEl.style.display = 'none';
    sourceEl.style.display = 'block';
    hintEl.style.display = 'none';
    // 按钮文案: 当前是源码，点它切回渲染
    btn.dataset.mode = 'source';
    btn.title = '切换为渲染视图';
    btn.querySelector('span:last-child').textContent = '渲染';
    setStatus('源码模式', `已切换 (${md.length} 字符)`);
  } else {
    // 源码 → 渲染: 把 <pre> 内容 setContent 回编辑器
    if (sourceEl) {
      const md = sourceEl.innerText;
      const html = markdownToHtml(md);
      State.editor.commands.setContent(html, false);
      sourceEl.style.display = 'none';
    }
    tiptapEl.style.display = '';
    hintEl.style.display = '';
    btn.dataset.mode = 'rendered';
    btn.title = '切换为源码视图';
    btn.querySelector('span:last-child').textContent = '源码';
    setStatus('渲染模式', '已切换回 WYSIWYG');
  }
}

// 工具栏按钮图标: 用 MentorIcons.sourceMode / renderMode
function updateToggleBtnIcon() {
  const btn = $('#btn-toggle-render');
  if (!btn) return;
  const iconSpan = btn.querySelector('.tb-icon');
  // 当前模式 = sourceMode 图标 (因为点它要切到 source)；或反之
  iconSpan.innerHTML = State.renderMode === 'rendered'
    ? window.MentorIcons.sourceMode
    : window.MentorIcons.renderMode;
}

// --- 大纲视图: 扫描 Tiptap doc 的 H1/H2/H3, 渲染到左侧
function renderOutline() {
  const pane = $('#outline-pane');
  if (!pane) return;
  const editor = State.editor;
  if (!editor) { pane.innerHTML = '<p class="outline-empty">打开文档以查看大纲</p>'; return; }

  // 收集所有 heading 节点 (H1/H2/H3), 记录 level + text + pos
  const items = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level >= 1 && node.attrs.level <= 3) {
      items.push({ level: node.attrs.level, text: node.textContent || '', pos });
    }
  });

  if (items.length === 0) {
    pane.innerHTML = '<p class="outline-empty">本文档暂无标题</p>';
    return;
  }

  // 编号 (按 H1/H2/H3 层级递进) — Word 风格
  let h1 = 0, h2 = 0, h3 = 0;
  const rows = items.map(it => {
    let num = '';
    if (it.level === 1) { h1++; h2 = 0; h3 = 0; num = `${h1}.`; }
    else if (it.level === 2) { h2++; h3 = 0; num = `${h1}.${h2}`; }
    else { h3++; num = `${h1}.${h2}.${h3}`; }
    return { ...it, num };
  });

  pane.innerHTML = rows.map(it =>
    `<div class="outline-item outline-h${it.level}" data-pos="${it.pos}" title="${escapeHtml(it.text)}">` +
    `<span class="outline-num">${it.num}</span>` +
    `<span class="outline-text">${escapeHtml(it.text) || '(无标题)'}</span>` +
    `</div>`
  ).join('');

  // 点击 → 跳到对应 heading
  pane.querySelectorAll('.outline-item').forEach(el => {
    el.addEventListener('click', () => {
      const pos = parseInt(el.dataset.pos, 10);
      if (Number.isNaN(pos)) return;
      // heading 节点 pos = 进入位置, 选中整个 heading (从 pos 到 pos+nodeSize)
      try {
        const $pos = editor.state.doc.resolve(pos + 1); // 进入 heading 的内容
        editor.chain().focus().setTextSelection($pos.pos).run();
        // 滚到可见
        const dom = editor.view.nodeDOM(pos);
        if (dom && dom.scrollIntoView) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { console.warn('大纲跳转失败:', e); }
    });
  });
}

// --- 从 .md 加载到编辑器
// --- 从 .md 加载到编辑器
function loadMarkdownIntoEditor(name, content, annotationsData = null) {
  // 如果当前是源码模式，先把 <pre> 的最新内容写回 content（避免被覆盖）
  const sourceEl = $('#source-view');
  if (State.renderMode === 'source' && sourceEl && sourceEl.style.display !== 'none') {
    content = sourceEl.innerText;
  }
  const html = markdownToHtml(content);
  // Tiptap 的 setContent 会解析 HTML
  State.editor.commands.setContent(html, false);
  // 如果是源码模式，把新内容同步到 <pre>（而不是 setContent 进编辑器）
  if (State.renderMode === 'source') {
    const md = htmlToMarkdown(html);
    sourceEl.innerText = md;
  }
  // 重置批注
  State.annotations = [];
  // 加载侧车批注数据
  if (annotationsData && annotationsData.annotations) {
    // === P0-B: 侧车 schema 验证 - 检测重复 threadId / 缺字段 ===
    const schemaReport = _validateSidecar(annotationsData.annotations);
    if (schemaReport.warnings.length > 0) {
      schemaReport.warnings.forEach(w => showToast(`⚠ 侧车数据警告: ${w}`, 5000));
      console.warn('[P0-B] 侧车验证:', schemaReport);
    }
    for (const ann of annotationsData.annotations) {
      // 重复 threadId 标 invalid
      const isDuplicate = schemaReport.duplicates.has(ann.threadId);
      // 缺关键字段标 invalid
      const isIncomplete = !ann.threadId || !ann.text;
      // 用 prefix+suffix+text 鲁棒定位 (4 优先级匹配)
      const positions = isDuplicate || isIncomplete ? null : findAnnotationRange(State.editor.state.doc, ann);
      if (positions) {
        State.annotations.push({
          ...ann,
          range: { from: positions.from, to: positions.to },
          fuzzy: !!positions.fuzzy,  // P1-A: 降级匹配时标 fuzzy
        });
        // 加回 mark
        const tr = State.editor.state.tr;
        tr.addMark(
          positions.from, positions.to,
          State.editor.schema.marks.annotation.create({ threadId: ann.threadId, resolved: ann.resolved })
        );
        State.editor.view.dispatch(tr);
      } else {
        // 找不到位置：保留批注数据但标失效
        // P1-B: 区分失效原因
        let reason = isDuplicate ? 'duplicate-threadId' : (isIncomplete ? 'incomplete-data' : 'text-not-found');
        // P1-B: 如果 text 包含 \n, 是原批注跨行 (ProseMirror mark 不能跨 block, 必失效)
        if (reason === 'text-not-found' && ann.text && ann.text.includes('\n')) {
          reason = 'cross-block';
        }
        State.annotations.push({
          ...ann,
          range: null,
          invalid: true,
          invalidReason: reason,
        });
      }
    }
  }
  State.currentFile = {
    name,
    content,
    annotations: annotationsData,
    dirty: false,
  };
  markClean();
  $('#empty-editor-hint').classList.remove('is-shown');
  $('#current-file-name').textContent = name;
  renderCommentList();
  renderOutline();
  setStatus('已加载', `${name} (${State.annotations.length} 批注)`);
  // P0-A: 跨 tab 协调 - 广播当前打开的文件
  if (typeof _openDocChannel === 'function') _openDocChannel();
  // P0-C: 记录主 .md mtime (供后续 saveCurrent 比较)
  if (State.currentFile && State.currentFile.handle && typeof State.currentFile.handle.getFile === 'function') {
    State.currentFile.handle.getFile().then(f => {
      State.fileMtime = f.lastModified;
    }).catch(() => { /* 忽略 */ });
  }
}

// 在 ProseMirror doc 中定位批注范围 (4 优先级鲁棒匹配)
function findAnnotationRange(doc, annotation) {
  if (!annotation) return null;
  const text = annotation.text || '';
  const prefix = annotation.prefix || '';
  const suffix = annotation.suffix || '';
  // 收集 doc 中所有 text node 的 (pos, text)
  const segments = [];
  doc.descendants((node, pos) => {
    if (node.isText) segments.push({ pos, text: node.text });
  });
  if (segments.length === 0) return null;
  // 用 textBetween(space 分隔) 拼 joined, 跟 createAnnotationThread 算 prefix/suffix 时用的格式一致
  const joined = doc.textBetween(0, doc.content.size, ' ');
  // posAtOffset: 把 "joined 字符 offset" 翻译回 "ProseMirror pos"
  // 简单粗暴: joined 跟 segments 总文本长度通常不同 (textBetween 加了空格), 重新扫一遍 segments 找最近 pos
  // 策略: 从前往后扫 segments, 估算 joined 字符串里的位置
  // joined 字符数 ≈ segments 字符总数 + 块间空格 (blockCount - 1)
  const segTotalLen = segments.reduce((sum, s) => sum + s.text.length, 0);
  const posAtOffset = (offset) => {
    // 找 offset 落在哪个 text node
    // 算法: 用 textBetween(0, pos, ' ') 反推 pos
    // 但 textBetween 是 O(n), 多次调用太慢
    // 替代: 按 segments 顺序, 估算 offset 在 segments 里的对应位置
    // joined 字符串 = segments[0].text + ' ' + segments[1].text + ' ' + ...
    // offset 通过: 累计 segments[i].text.length + 1 (空格)
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const segLen = segments[i].text.length;
      const joinedSegLen = segLen + (i < segments.length - 1 ? 1 : 0);  // +1 空格 (除最后一段)
      if (offset < acc + joinedSegLen) {
        // offset 落在 joined 里第 i 段 (含前面的空格)
        // 算回 segments 里的 offset
        const offsetInJoinedSeg = offset - acc;
        const inSegOffset = Math.max(0, Math.min(segLen, offsetInJoinedSeg));
        return segments[i].pos + inSegOffset;
      }
      acc += joinedSegLen;
    }
    return segments[segments.length - 1].pos + segments[segments.length - 1].text.length;
  };
  // P1-A: 内部 helper - 返回 range 对象, fuzzy=true 表示降级匹配
  const makeRange = (from, to, fuzzy) => {
    const r = { from: posAtOffset(from), to: posAtOffset(to) };
    if (fuzzy) r.fuzzy = true;
    return r;
  };
  // === P0 精确 text 匹配 (旧数据兼容: 无 prefix/suffix 的批注) ===
  if (text) {
    const idx = joined.indexOf(text);
    if (idx !== -1) {
      return makeRange(idx, idx + text.length, false);
    }
  }

  // === P1 prefix + suffix 拼接 (text 改了也能定位 - C 方案核心) ===
  // 用 prefix 末 5 字符 + suffix 前 5 字符当"指纹", 找在 joined 里的位置
  if (prefix && suffix) {
    const pTail = prefix.slice(-5);
    const sHead = suffix.slice(0, 5);
    if (pTail && sHead) {
      // 找 prefix 末 5 字符的位置
      let pIdx = -1;
      let searchFrom = 0;
      while (true) {
        const idx = joined.indexOf(pTail, searchFrom);
        if (idx === -1) break;
        // 检查 suffix 前 5 字符是否在 prefix 末之后
        const sIdx = joined.indexOf(sHead, idx + pTail.length);
        if (sIdx !== -1) {
          pIdx = idx;
          break;
        }
        searchFrom = idx + 1;
      }
      if (pIdx !== -1) {
        // 找到了 prefix 末 + suffix 前 的位置
        // from = prefix 末 之后 (text 起点, 但 text 已变用估算)
        // 估算 text 起点 = suffix 前 5 字符 之前 text 长度
        // 简化: 假设 text 长度还是原长度, from = sHead 位置 - text 长度
        const sIdx = joined.indexOf(sHead, pIdx + pTail.length);
        const estTextStart = sIdx - text.length;
        return makeRange(Math.max(0, estTextStart), sIdx, true);  // P1 降级
      }
    }
  }

  // === P2 fallback: prefix 末 5 字符 + text 前缀 (改字 + 前后文都在) ===
  if (text && prefix && prefix.length >= 5) {
    const pTail = prefix.slice(-5);
    const tHead = text.slice(0, Math.min(text.length, 5));
    const idx = joined.indexOf(pTail + tHead);
    if (idx !== -1) {
      const start = idx + pTail.length;
      return makeRange(start, start + text.length, true);  // P2 降级
    }
  }

  // === P2 prefix + suffix 拼接 (text 改了也能定位) ===
  // 找到 prefix 和 suffix 拼接的边界, text 长度仍用 ann.text.length
  if (prefix && suffix) {
    const idx = joined.indexOf(prefix + suffix);
    if (idx !== -1) {
      const start = idx + prefix.length;
      return makeRange(start, start + text.length, true);  // P2 降级
    }
  }

  // === P3 prefix 末 10 字符 + text 子串匹配 ===
  // 注意: 没 prefix 时, P3 跳过 (防止模糊匹配错位)
  if (text && prefix && prefix.length >= 5) {
    const shortPrefix = prefix.slice(-10);
    const idx = joined.indexOf(shortPrefix + text.slice(0, Math.min(text.length, 10)));
    if (idx !== -1) {
      const start = idx + shortPrefix.length;
      return { from: posAtOffset(start), to: posAtOffset(start + text.length) };
    }
  }

  // === P4 全失败: 返回 null (失效, 标 invalid) ===
  return null;
}

// 兼容旧代码: 仅按 text 查找
function findTextInDoc(doc, text) {
  if (!text) return null;
  return findAnnotationRange(doc, { text });
}

// 计算 prefix/suffix (在 createAnnotationThread 时用)
function computeContext(text, fullDocText, maxLen = 40) {
  if (!text) return { prefix: '', suffix: '' };
  const idx = fullDocText.indexOf(text);
  if (idx === -1) {
    return { prefix: '', suffix: '' };
  }
  // fullDocText 来自 doc.textBetween(0, content.size, ' '), 块间分隔是 ' '
  // 用 ' ' 截断, 但只在后 30 字符内找 (避免截到太早, 留更多 context)
  // 截断后最短保留 15 字符
  const minLen = 15;
  // prefix: text 之前的 maxLen 字符
  let prefixStart = Math.max(0, idx - maxLen);
  const prefixSlice = fullDocText.substring(prefixStart, idx);
  const lastSepInPrefix = prefixSlice.lastIndexOf(' ');
  // 只有当 lastSepInPrefix 离 prefixSlice 末尾 < 30 字符 且 截后 prefix >= minLen 时才截
  if (lastSepInPrefix !== -1) {
    const newPrefixStart = prefixStart + lastSepInPrefix + 1;
    const newPrefixLen = idx - newPrefixStart;  // 截后 prefix 长度
    if (newPrefixLen >= minLen && (prefixSlice.length - lastSepInPrefix) < 30) {
      prefixStart = newPrefixStart;
    }
  }
  const prefix = fullDocText.substring(prefixStart, idx);
  // suffix: text 之后的 maxLen 字符
  const afterIdx = idx + text.length;
  let suffixEnd = Math.min(fullDocText.length, afterIdx + maxLen);
  const suffixSlice = fullDocText.substring(afterIdx, suffixEnd);
  const firstSepInSuffix = suffixSlice.indexOf(' ');
  if (firstSepInSuffix !== -1) {
    const newSuffixLen = firstSepInSuffix;
    if (newSuffixLen >= minLen && firstSepInSuffix < 30) {
      suffixEnd = afterIdx + firstSepInSuffix;
    }
  }
  const suffix = fullDocText.substring(afterIdx, suffixEnd);
  return { prefix, suffix };
}

// ============================================================
// 8.5 File System Access API 兼容性检测
// ============================================================
const FS_API = {
  supported: typeof window.showOpenFilePicker === 'function'
          && typeof window.showDirectoryPicker === 'function',

  // 检测浏览器
  browserNote() {
    if (this.supported) return '';
    if (typeof window.showOpenFilePicker === 'undefined') {
      return '当前浏览器不支持 File System Access API（需要 Chrome/Edge 113+），保存时将下载文件而非写回原位置。';
    }
    return '';
  },
};

// --- 打开文件（单或多个）
async function openFiles() {
  if (FS_API.supported) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'] },
        }],
        excludeAcceptAllOption: false,
      });
      if (handles.length === 0) return;
      // 第一个直接打开；其他进文件列表
      State.fileHandles = handles;
      State.fileList = null;
      // 单文件模式：没有 folderHandle，保存时下载
      State.folderHandle = null;
      State.saveMode = 'download';
      await openFromHandle(handles[0]);
      renderFileTreeFromHandles(handles);
      if (handles.length > 1) setStatus(`已加载 ${handles.length} 个文件`, '保存时下载文件');
      else setStatus('已加载', `${handles[0].name} (保存将下载)`);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 用户取消
      console.error('showOpenFilePicker 失败:', e);
      showToast('打开失败: ' + e.message);
      return;
    }
  }
  // Fallback: <input type="file">
  await openFilesLegacy();
}

async function openFilesLegacy() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.md,.markdown,.txt';
  input.onchange = async () => {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    State.fileList = files;
    State.fileHandles = null;
    State.folderHandle = null;
    State.saveMode = 'download';
    renderFileTreeFromList(files);
    const file = files[0];
    const content = await file.text();
    const annotations = await tryLoadSidecar(file.name, file);
    await loadMarkdownIntoEditor(file.name, content, annotations);
    if (files.length > 1) setStatus(`已加载 ${files.length} 个文件`, '保存将下载');
  };
  input.click();
}

// --- 打开文件夹
async function openFolder() {
  if (FS_API.supported) {
    try {
      const folderHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        id: 'md-annotator',
      });
      // 扫描 .md 文件
      const entries = [];
      for await (const [name, handle] of folderHandle.entries()) {
        if (handle.kind === 'file' && /\.(md|markdown)$/i.test(name)) {
          entries.push({ name, handle });
        }
      }
      if (entries.length === 0) {
        showToast('文件夹中没有 .md 文件');
        return;
      }
      // 持久化 handle
      State.folderHandle = folderHandle;
      State.saveMode = 'handle';
      State.fileHandles = entries.map(e => e.handle);
      await HandleStore.putFolder(folderHandle.name, folderHandle);
      renderFileTreeFromHandles(entries.map(e => e.handle), folderHandle);
      // 打开第一个
      await openFromHandle(entries[0].handle);
      await HandleStore.putLastFile(folderHandle.name, entries[0].handle.name);
      setStatus(`已授权 ${folderHandle.name}`, `${entries.length} 个 .md 文件, Ctrl+S 直接保存到原位置`);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('showDirectoryPicker 失败:', e);
      showToast('打开文件夹失败: ' + e.message);
      return;
    }
  }
  // Fallback: <input webkitdirectory>
  await openFolderLegacy();
}

async function openFolderLegacy() {
  const input = document.createElement('input');
  input.type = 'file';
  input.webkitdirectory = true;
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files).filter(f => /\.(md|markdown)$/i.test(f.name));
    if (files.length === 0) {
      showToast('文件夹中没有 .md 文件');
      return;
    }
    State.fileList = files;
    State.fileHandles = null;
    State.folderHandle = null;
    State.saveMode = 'download';
    renderFileTreeFromList(files);
    const file = files[0];
    const content = await file.text();
    const annotations = await tryLoadSidecar(file.name, file);
    await loadMarkdownIntoEditor(file.name, content, annotations);
    setStatus('已加载文件夹', `${files.length} 个 .md 文件 (保存将下载)`);
  };
  input.click();
}

// --- 通过 FileSystemFileHandle 打开文件
async function openFromHandle(fileHandle) {
  const file = await fileHandle.getFile();
  const content = await file.text();
  // 尝试加载侧车
  const sidecarName = file.name.replace(/\.md$/i, '') + '.annotations.json';
  let annotations = null;
  if (State.folderHandle) {
    try {
      const sidecarHandle = await State.folderHandle.getFileHandle(sidecarName);
      const sidecarFile = await sidecarHandle.getFile();
      annotations = JSON.parse(await sidecarFile.text());
    } catch (e) {
      // 侧车不存在是正常的
    }
  }
  await loadMarkdownIntoEditor(file.name, content, annotations);
  State.currentFile.handle = fileHandle;
  if (State.folderHandle) {
    await HandleStore.putLastFile(State.folderHandle.name, file.name);
  }
}

// --- 文件类型专属图标 (Cursor 风格 - 统一 SVG 图标库)
function fileTypeIcon(name) {
  if (/\.(md|markdown)$/i.test(name)) return { glyph: window.MentorIcons.fileMd, cls: 'icon-md' };
  if (/\.json$/i.test(name)) return { glyph: window.MentorIcons.fileJson, cls: 'icon-json' };
  return { glyph: window.MentorIcons.fileOther, cls: 'icon-other' };
}

// --- tree node 模板（复用）
function treeNodeHTML(name, isActive) {
  const icon = fileTypeIcon(name);
  const isMd = /\.(md|markdown)$/i.test(name);
  const actions = isMd
    ? `<span class="tree-actions">
         <button data-action="copy" title="复制路径" aria-label="复制路径">${window.MentorIcons.copy}</button>
         <button data-action="reload" title="重新加载" aria-label="重新加载">${window.MentorIcons.reload}</button>
         <button data-action="delete" title="删除 .md" aria-label="删除" class="danger">${window.MentorIcons.trash}</button>
       </span>`
    : `<span class="tree-actions">
         <button data-action="copy" title="复制路径" aria-label="复制路径">${window.MentorIcons.copy}</button>
       </span>`;
  return `<div class="tree-node ${isActive ? 'is-active' : ''}" data-handle-name="${escapeHtml(name)}">
    <span class="icon ${icon.cls}">${icon.glyph}</span><span class="filename">${escapeHtml(name)}</span>
    ${actions}
  </div>`;
}

// --- 从 handles 渲染文件树（folder mode）
function renderFileTreeFromHandles(handles, folderHandle = State.folderHandle) {
  const tree = $('#file-tree');
  tree.classList.remove('tree-empty');
  const folderName = folderHandle ? folderHandle.name : '已授权文件';
  let html = `<div class="tree-node tree-folder"><span class="icon icon-folder">${window.MentorIcons.folder}</span><span class="filename">${escapeHtml(folderName)}</span><span class="save-mode-badge">${State.saveMode === 'handle' ? `<span class="badge-check">${window.MentorIcons.check}</span> 已授权` : `<span class="badge-download">${window.MentorIcons.download}</span> 下载`}</span></div>`;
  html += `<div class="tree-children">`;
  for (const h of handles) {
    const isActive = State.currentFile && State.currentFile.name === h.name;
    html += treeNodeHTML(h.name, isActive);
  }
  html += `</div>`;
  tree.innerHTML = html;
  // 切换文件：直接绑 click
  tree.querySelectorAll('.tree-node[data-handle-name]').forEach(el => {
    el.addEventListener('click', async (e) => {
      // 忽略 action 按钮上的点击（事件委托处理）
      if (e.target.closest('.tree-actions')) return;
      const name = el.dataset.handleName;
      const handle = State.fileHandles.find(h => h.name === name);
      if (!handle) return;
      if (State.currentFile && State.currentFile.dirty && !confirm('当前文档有未保存修改，确定切换吗？')) return;
      await openFromHandle(handle);
      tree.querySelectorAll('.tree-node').forEach(n => n.classList.remove('is-active'));
      el.classList.add('is-active');
    });
  });
  // 同步 dirty 圆点
  updateTreeDirtyDots();
  // 重新应用搜索过滤
  filterTree($('#tree-search').value);
}

// --- 从 file list 渲染（legacy fallback）— 修复 preexisting bug
function renderFileTreeFromList(files) {
  const tree = $('#file-tree');
  tree.classList.remove('tree-empty');
  let html = `<div class="tree-node tree-folder"><span class="icon icon-folder">${window.MentorIcons.folder}</span><span class="filename">已下载</span><span class="save-mode-badge">${window.MentorIcons.download} 下载</span></div>`;
  html += `<div class="tree-children">`;
  for (const f of files) {
    const isActive = State.currentFile && State.currentFile.name === f.name;
    html += treeNodeHTML(f.name, isActive);
  }
  html += `</div>`;
  tree.innerHTML = html;
  // 切换文件：legacy 模式用 fileList 而不是 handles
  tree.querySelectorAll('.tree-node[data-handle-name]').forEach(el => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.tree-actions')) return;
      const name = el.dataset.handleName;
      const file = State.fileList.find(f => f.name === name);
      if (!file) return;
      if (State.currentFile && State.currentFile.dirty && !confirm('当前文档有未保存修改，确定切换吗？')) return;
      const content = await file.text();
      const annotations = await tryLoadSidecar(file.name, file);
      await loadMarkdownIntoEditor(file.name, content, annotations);
      State.currentFile.handle = null;
      tree.querySelectorAll('.tree-node').forEach(n => n.classList.remove('is-active'));
      el.classList.add('is-active');
    });
  });
  updateTreeDirtyDots();
  filterTree($('#tree-search').value);
}

// ============================================================
// P0-A: BroadcastChannel - 跨 tab 协调, 检测重复打开同一文件
// 防止两个标签同时编辑同一文件导致数据丢失
// ============================================================
let _docChannel = null;
let _docChannelPath = null;
let _instanceId = Math.random().toString(36).slice(2, 10);
let _docPeers = new Set();

function _getDocPath() {
  if (!State.currentFile) return null;
  if (State.folderHandle) return `Mentor:${State.folderHandle.name}/${State.currentFile.name}`;
  return `Mentor:single/${State.currentFile.name}`;
}

function _closeDocChannel() {
  if (_docChannel) {
    try { _docChannel.postMessage({ type: 'leave', instanceId: _instanceId }); } catch (e) {}
    _docChannel.close();
    _docChannel = null;
    _docChannelPath = null;
  }
  _docPeers.clear();
}

function _openDocChannel() {
  _closeDocChannel();
  const path = _getDocPath();
  if (!path) return;
  _docChannelPath = path;
  _docChannel = new BroadcastChannel('mentor-doc-' + path.slice(0, 60));  // channel 名限长
  _docChannel.onmessage = (e) => {
    if (e.data.instanceId === _instanceId) return;
    if (e.data.type === 'ping') {
      _docPeers.add(e.data.instanceId);
      _docChannel.postMessage({ type: 'pong', instanceId: _instanceId });
    } else if (e.data.type === 'pong') {
      _docPeers.add(e.data.instanceId);
    } else if (e.data.type === 'leave') {
      _docPeers.delete(e.data.instanceId);
    }
  };
  // 主动 ping, 等 300ms 看 peer
  _docChannel.postMessage({ type: 'ping', instanceId: _instanceId });
  setTimeout(() => {
    if (_docPeers.size > 0 && !State.readOnlyMode) {
      State.readOnlyMode = true;
      showToast(`⚠ 另一标签也在编辑此文件 (${_docPeers.size} 个), 已启用只读模式 (Ctrl+S 禁用)`, 6000);
    }
  }, 300);
}

// 关闭 tab 时广播 leave
window.addEventListener('beforeunload', _closeDocChannel);

// ============================================================
// P0-B: 侧车 schema 验证 - 检测重复 threadId / 缺字段
// 防止加载错乱数据导致侧栏 UI 崩溃
// ============================================================
function _validateSidecar(annotations) {
  const report = { warnings: [], duplicates: new Set() };
  if (!Array.isArray(annotations)) {
    report.warnings.push('annotations 不是数组');
    return report;
  }
  const seenIds = new Map();  // threadId -> count
  annotations.forEach((ann, i) => {
    if (!ann) {
      report.warnings.push(`第 ${i + 1} 条批注为 null`);
      return;
    }
    if (!ann.threadId) {
      report.warnings.push(`第 ${i + 1} 条批注缺 threadId`);
    } else {
      const count = seenIds.get(ann.threadId) || 0;
      seenIds.set(ann.threadId, count + 1);
      if (count >= 1) {
        report.duplicates.add(ann.threadId);
        report.warnings.push(`重复 threadId: ${ann.threadId.slice(0, 8)}...`);
      }
    }
    if (!ann.text) {
      report.warnings.push(`threadId ${ann.threadId?.slice(0, 8) || i} 缺 text 字段`);
    }
    if (!ann.comments || !Array.isArray(ann.comments)) {
      report.warnings.push(`threadId ${ann.threadId?.slice(0, 8) || i} comments 字段无效`);
    }
  });
  return report;
}

// ============================================================
// P2-C: 重叠 mark 侧栏 UI - 跳过
// 现状: ProseMirror 允许多 mark 同段, 侧栏独立显示每个 thread (不冲突)
//       activeThreadId 只有一个, click mark 时只激活一个 (其他重叠的仍可见但不 active)
// 已知问题: 重叠 mark 的 activeThread 切换不直观, 但不影响数据正确性
// 修复成本: 改 activeThreadId → activeThreadIds (数组), UI 多选, 复杂度高
// 决策: 不修, 加 todo 留作 follow-up
// ============================================================

// --- tree action 事件委托 (复制路径 / 重新加载 / 删除)
// ============================================================
// 启动时 mock 文件树 (用户没授权真实文件夹时, 显示示例文件列表)
// ============================================================
// (已删除 - 用户不需要一进 app 就看到示例)

function setupTreeActionDelegation() {
  $('#file-tree').addEventListener('click', async (e) => {
    const btn = e.target.closest('.tree-actions button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const node = btn.closest('.tree-node[data-handle-name]');
    if (!node) return;
    const name = node.dataset.handleName;
    const action = btn.dataset.action;
    await handleTreeAction(action, name);
  });
}

// 空文件栏点击 → 打开文件夹 (替代工具栏 "打开文件夹" 按钮)
// 只在 tree-empty 状态触发, 有文件时不拦截 file click
function setupEmptyTreeClick() {
  const tree = $('#file-tree');
  if (!tree) return;
  const handle = () => {
    if (!tree.classList.contains('tree-empty')) return;
    openFolder();
  };
  tree.addEventListener('click', handle);
  // 键盘可达性: Enter / Space 触发
  tree.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (!tree.classList.contains('tree-empty')) return;
      e.preventDefault();
      openFolder();
    }
  });
}

async function handleTreeAction(action, name) {
  if (action === 'copy') {
    // 复制文件名 + 路径（folder 模式有完整路径，legacy 模式只有文件名）
    const path = State.folderHandle ? `${State.folderHandle.name}/${name}` : name;
    try {
      await navigator.clipboard.writeText(path);
      showToast(`已复制路径: ${path}`);
    } catch (e) {
      showToast('复制失败: ' + e.message);
    }
    return;
  }
  if (action === 'reload') {
    // 重新读盘当前文件
    if (State.folderHandle) {
      const handle = State.fileHandles.find(h => h.name === name);
      if (handle) {
        await openFromHandle(handle);
        showToast(`已重新加载: ${name}`);
      }
    } else if (State.fileList) {
      const file = State.fileList.find(f => f.name === name);
      if (file) {
        const content = await file.text();
        const annotations = await tryLoadSidecar(file.name, file);
        await loadMarkdownIntoEditor(file.name, content, annotations);
        showToast(`已重新加载: ${name}`);
      }
    }
    return;
  }
  if (action === 'delete') {
    if (!confirm(`确定删除 "${name}" 吗？\n\n注意：\n- 仅删除 .md 文件，.annotations.json 侧车文件保留\n- 此操作无法撤销`)) return;
    if (State.folderHandle && State.saveMode === 'handle') {
      try {
        await State.folderHandle.removeEntry(name);
        // 从 State.fileHandles 中移除
        State.fileHandles = State.fileHandles.filter(h => h.name !== name);
        // 重新渲染 tree
        renderFileTreeFromHandles(State.fileHandles, State.folderHandle);
        showToast(`已删除: ${name}`);
      } catch (e) {
        showToast('删除失败: ' + e.message);
      }
    } else {
      showToast('下载模式下无法直接删除文件');
    }
    return;
  }
}

// --- tree 搜索过滤
function filterTree(query) {
  const q = (query || '').trim().toLowerCase();
  $$('.tree-node[data-handle-name]').forEach(el => {
    const name = el.dataset.handleName;
    const fn = el.querySelector('.filename');
    if (!q) {
      el.style.display = '';
      if (fn) fn.innerHTML = escapeHtml(name);
    } else if (name.toLowerCase().includes(q)) {
      el.style.display = '';
      if (fn) {
        // 高亮匹配部分
        const idx = name.toLowerCase().indexOf(q);
        const before = escapeHtml(name.slice(0, idx));
        const match = escapeHtml(name.slice(idx, idx + q.length));
        const after = escapeHtml(name.slice(idx + q.length));
        fn.innerHTML = `${before}<mark>${match}</mark>${after}`;
      }
    } else {
      el.style.display = 'none';
    }
  });
  // folder 节点（无 data-handle-name）始终显示
  $$('.tree-node.tree-folder').forEach(el => el.style.display = '');
}

function setupTreeSearch() {
  const input = $('#tree-search');
  const clear = $('#tree-search-clear');
  if (!input) return;
  input.addEventListener('input', () => {
    filterTree(input.value);
    if (input.value) clear.classList.remove('hidden');
    else clear.classList.add('hidden');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      filterTree('');
      clear.classList.add('hidden');
      input.blur();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    filterTree('');
    clear.classList.add('hidden');
    input.focus();
  });
  // 快捷键 Cmd/Ctrl+Shift+E 聚焦搜索
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

// --- 尝试加载侧车 .annotations.json (legacy fallback)
async function tryLoadSidecar(mdFileName, mdFile) {
  const sidecarName = mdFileName.replace(/\.md$/i, '') + '.annotations.json';
  if (State.fileList) {
    const sidecar = State.fileList.find(f => f.name === sidecarName);
    if (sidecar) {
      try {
        return JSON.parse(await sidecar.text());
      } catch (e) {
        showToast(`侧车 JSON 解析失败: ${e.message}`);
      }
    }
  }
  return null;
}

// --- 保存 .md + 侧车 JSON
async function saveCurrent() {
  if (State.readOnlyMode) {
    showToast('只读模式: 另一标签在编辑, 已禁用 Ctrl+S', 3000);
    return;
  }
  if (!State.currentFile) {
    showToast('未打开文档');
    return;
  }
  if (!State.author) {
    await promptAuthor();
    if (!State.author) return;
  }
  // 1. 转 markdown（不带 annotation mark + KaTeX）
  const html = State.editor.getHTML();
  const mdText = htmlToMarkdown(html);
  // 2. 写侧车 JSON
  const sidecar = {
    version: '1',
    document: State.currentFile.name,
    updatedAt: nowISO(),
    author: State.author,
    annotations: State.annotations.map(t => ({
      threadId: t.threadId,
      text: t.text,
      resolved: t.resolved,
      createdAt: t.createdAt,
      comments: t.comments,
    })),
  };
  const sidecarName = State.currentFile.name.replace(/\.md$/i, '') + '.annotations.json';
  const sidecarText = JSON.stringify(sidecar, null, 2);

  // 更新当前内容
  State.currentFile.content = mdText;
  State.currentFile.annotations = sidecar;
  markClean();

  // 3. 尝试用 handle 写回原位置
  const result = await tryWriteBack(mdText, sidecarText, sidecarName);
  if (result.handle) {
    showToast('已保存到原位置 ✓');
    setStatus('已保存', `${State.currentFile.name} + ${sidecarName}`);
  } else if (result.error) {
    showToast('保存失败: ' + result.error);
    setStatus('保存失败', result.error);
  } else {
    // fallback 下载
    downloadFile(State.currentFile.name, mdText);
    downloadFile(sidecarName, sidecarText);
    showToast('已下载 ✓ (浏览器不支持或未授权)');
    setStatus('已下载', `${State.currentFile.name} + ${sidecarName}`);
  }
}

// 写回原文件，返回 { handle: bool, error?: string }
async function tryWriteBack(mdText, sidecarText, sidecarName) {
  // === P0-C: 跨编辑器 mtime 检测 - 防止覆盖外部修改 ===
  // 单文件模式（通过 showOpenFilePicker 打开，无 folderHandle）：
  if (State.currentFile && State.currentFile.handle && State.folderHandle == null) {
    try {
      // 确认权限
      if (await State.currentFile.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        await State.currentFile.handle.requestPermission({ mode: 'readwrite' });
      }
      // P0-C: 检查主 .md 是否在外部被修改
      if (State.fileMtime != null) {
        try {
          const currentFile = await State.currentFile.handle.getFile();
          const currentMtime = currentFile.lastModified;
          if (currentMtime > State.fileMtime) {
            const ok = confirm(
              `⚠ 主文件在外部被修改!\n\n` +
              `你最后一次打开/保存: ${new Date(State.fileMtime).toLocaleTimeString()}\n` +
              `当前文件 mtime: ${new Date(currentMtime).toLocaleTimeString()}\n\n` +
              `继续保存会覆盖外部修改。\n\n` +
              `确定要覆盖吗? (建议先取消, 备份外部改动, 再合并)`
            );
            if (!ok) {
              return { handle: false, error: '用户取消: 检测到外部修改' };
            }
          }
        } catch (e) {
          // mtime 检查失败不阻止保存
          console.warn('[P0-C] mtime 检查失败:', e);
        }
      }
      const writable = await State.currentFile.handle.createWritable();
      await writable.write(mdText);
      await writable.close();
      // 更新 mtime
      try {
        const newFile = await State.currentFile.handle.getFile();
        State.fileMtime = newFile.lastModified;
      } catch (e) { /* 忽略 */ }
      return { handle: true };
    } catch (e) {
      if (e.name === 'NotAllowedError') return { handle: false, error: '权限被拒' };
      return { handle: false, error: e.message };
    }
  }

  // 文件夹模式：通过 folderHandle.getFileHandle 拿 fileHandle
  if (State.folderHandle && State.currentFile) {
    try {
      // 确认文件夹权限
      if (await State.folderHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        const perm = await State.folderHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return { handle: false, error: '未授权文件夹写入' };
      }
      // 写主文件
      const mdHandle = await State.folderHandle.getFileHandle(State.currentFile.name, { create: true });
      const mdWritable = await mdHandle.createWritable();
      await mdWritable.write(mdText);
      await mdWritable.close();
      // 写侧车
      const sidecarHandle = await State.folderHandle.getFileHandle(sidecarName, { create: true });
      const sidecarWritable = await sidecarHandle.createWritable();
      await sidecarWritable.write(sidecarText);
      await sidecarWritable.close();
      return { handle: true };
    } catch (e) {
      if (e.name === 'NotAllowedError') return { handle: false, error: '权限被拒' };
      return { handle: false, error: e.message };
    }
  }

  return { handle: false };
}

function downloadFile(name, content) {
  const blob = new Blob([content], { type: name.endsWith('.json') ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 新建空白文档
function newDocument() {
  if (State.currentFile && State.currentFile.dirty && !confirm('当前文档有未保存修改，确定新建吗？')) return;
  State.editor.commands.setContent('<h1>新文档</h1><p></p>', false);
  State.annotations = [];
  State.currentFile = { name: 'untitled.md', content: '', annotations: null, dirty: true };
  markDirty();
  $('#empty-editor-hint').classList.remove('is-shown');
  renderCommentList();
  renderOutline();
  setStatus('新建空白文档');
}

// ============================================================
// 9. 作者管理
// ============================================================
function promptAuthor() {
  return new Promise(resolve => {
    const modal = $('#author-modal');
    const input = $('#author-input');
    input.value = State.author;
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);
    const handler = () => {
      const v = input.value.trim();
      if (v) {
        State.author = v;
        localStorage.setItem('Mentor:author', v);
        modal.classList.add('hidden');
        $('#author-save').removeEventListener('click', handler);
        input.removeEventListener('keydown', keyHandler);
        resolve();
      }
    };
    const keyHandler = e => { if (e.key === 'Enter') handler(); };
    $('#author-save').addEventListener('click', handler);
    input.addEventListener('keydown', keyHandler);
  });
}

// ============================================================
// 10. 工具栏事件
// ============================================================
function setupToolbar() {
  $('#btn-new').addEventListener('click', newDocument);
  $('#btn-open-files').addEventListener('click', openFiles);
  // 打开文件夹: 已合并到左侧空文件栏点击 (setupEmptyTreeClick), 工具栏不再需要按钮
  $('#btn-save').addEventListener('click', saveCurrent);
  $('#btn-save-as').addEventListener('click', () => {
    if (!State.currentFile) return;
    downloadFile(State.currentFile.name, State.currentFile.content || htmlToMarkdown(State.editor.getHTML()));
    const sidecarName = State.currentFile.name.replace(/\.md$/i, '') + '.annotations.json';
    const sidecar = {
      version: '1', document: State.currentFile.name, updatedAt: nowISO(), author: State.author,
      annotations: State.annotations,
    };
    downloadFile(sidecarName, JSON.stringify(sidecar, null, 2));
    showToast('已下载两个文件');
  });

  // 格式按钮
  $$('#format-toolbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      const c = State.editor.chain().focus();
      switch (cmd) {
        case 'bold': c.toggleBold().run(); break;
        case 'italic': c.toggleItalic().run(); break;
        case 'strike': c.toggleStrike().run(); break;
        case 'code': c.toggleCode().run(); break;
        case 'h1': c.toggleHeading({ level: 1 }).run(); break;
        case 'h2': c.toggleHeading({ level: 2 }).run(); break;
        case 'h3': c.toggleHeading({ level: 3 }).run(); break;
        case 'bulletList': c.toggleBulletList().run(); break;
        case 'orderedList': c.toggleOrderedList().run(); break;
        case 'blockquote': c.toggleBlockquote().run(); break;
        case 'codeBlock': c.toggleCodeBlock().run(); break;
        case 'link': {
          const url = prompt('链接 URL:');
          if (url) c.setLink({ href: url }).run();
          break;
        }
        case 'image': {
          const url = prompt('图片 URL:');
          if (url) c.setImage({ src: url }).run();
          break;
        }
      }
      updateToolbarState();
    });
  });

  // 批注过滤
  $('#filter-open').addEventListener('change', e => {
    State.filterOpen = e.target.checked;
    renderCommentList();
  });
  $('#filter-resolved').addEventListener('change', e => {
    State.filterResolved = e.target.checked;
    renderCommentList();
  });

  // 文件树收起/展开功能已移除 — 大纲栏始终显示 (Word 风格, 不能折叠)

  // 切换 渲染/源码 视图
  $('#btn-toggle-render').addEventListener('click', () => {
    setRenderMode(State.renderMode === 'rendered' ? 'source' : 'rendered');
    updateToggleBtnIcon();
  });
  updateToggleBtnIcon();  // 初始图标

  // Cmd+B 快捷键已移除 (大纲栏不可折叠, 释放给未来的加粗快捷键使用)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      // 占位: 大纲栏不可折叠, 不再 toggleFilePane
      // 如未来需要加粗快捷键, 在此处加 c.toggleBold().run();
    }
  });

  // 键盘快捷键
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrent();
    }
  });
}

function updateToolbarState() {
  const editor = State.editor;
  if (!editor) return;
  $$('#format-toolbar button[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd;
    let isActive = false;
    try {
      switch (cmd) {
        case 'bold': isActive = editor.isActive('bold'); break;
        case 'italic': isActive = editor.isActive('italic'); break;
        case 'strike': isActive = editor.isActive('strike'); break;
        case 'code': isActive = editor.isActive('code'); break;
        case 'h1': isActive = editor.isActive('heading', { level: 1 }); break;
        case 'h2': isActive = editor.isActive('heading', { level: 2 }); break;
        case 'h3': isActive = editor.isActive('heading', { level: 3 }); break;
        case 'bulletList': isActive = editor.isActive('bulletList'); break;
        case 'orderedList': isActive = editor.isActive('orderedList'); break;
        case 'blockquote': isActive = editor.isActive('blockquote'); break;
        case 'codeBlock': isActive = editor.isActive('codeBlock'); break;
        case 'link': isActive = editor.isActive('link'); break;
      }
    } catch (e) {}
    btn.classList.toggle('is-active', isActive);
  });
}

// 编辑器光标变化时更新工具栏
function setupEditorSelectionObserver() {
  State.editor.on('selectionUpdate', updateToolbarState);
  State.editor.on('transaction', updateToolbarState);
}

// ============================================================
// 11. 启动
// ============================================================
async function boot() {
  initEditor();
  setupToolbar();
  setupFloatCommentButton();
  setupEditorSelectionObserver();
  setupTreeActionDelegation();
  setupEmptyTreeClick();
  setupTreeSearch();
  $('#empty-editor-hint').classList.add('is-shown');

  // 检测浏览器兼容性，状态栏提示
  const browserNote = FS_API.browserNote();
  if (browserNote) {
    setStatus('浏览器兼容性提示', browserNote);
  } else {
    setStatus('就绪', '打开或新建 .md 开始批注');
  }

  // 尝试自动重连上次文件
  await tryReconnect();
}

// 尝试从 IndexedDB 重连上次打开的文件夹/文件
async function tryReconnect() {
  try {
    const last = await HandleStore.getLastFile();
    if (!last) return;
    const folderHandle = await HandleStore.getFolder(last.folderPath);
    if (!folderHandle) return;
    // 确认权限
    const perm = await folderHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      setStatus('上次文件夹未授权', `${last.folderPath} (重新打开以授权)`);
      return;
    }
    // 重新加载
    State.folderHandle = folderHandle;
    State.saveMode = 'handle';
    const entries = [];
    for await (const [name, handle] of folderHandle.entries()) {
      if (handle.kind === 'file' && /\.(md|markdown)$/i.test(name)) {
        entries.push({ name, handle });
      }
    }
    State.fileHandles = entries.map(e => e.handle);
    renderFileTreeFromHandles(State.fileHandles, folderHandle);
    // 找上次文件
    const target = State.fileHandles.find(h => h.name === last.fileName);
    if (target) {
      await openFromHandle(target);
      setStatus(`已重连 ${folderHandle.name}`, `${last.fileName} (Ctrl+S 直接保存)`);
    }
  } catch (e) {
    console.warn('重连失败:', e);
  }
}

document.addEventListener('DOMContentLoaded', boot);

// 暴露给 e2e 测试的全局 API
window.__mdAnnotator = {
  State,
  FS_API,
  HandleStore,
  loadMarkdownIntoEditor,
  newDocument,
  saveCurrent: async () => { /* 测试用 */ },
  tryWriteBack,
  tryReconnect,
  promptAuthor,
  renderFileTreeFromHandles,
  openFromHandle,
  openFiles,
  openFilesLegacy,
  openFolderLegacy,
  // HTML → markdown 内部 helper（暴露给 e2e 测试 + 第三方插件使用）
  htmlToMarkdown,
  // File pane 测试 API
  fileTypeIcon,
  filterTree,
  renderFileTreeFromList,
  handleTreeAction,
  // AI 协作协议：结构化 API（不让 AI 通过 UI 模拟点击）
  ai: (() => {
    const AI_AUTHOR = 'AI Reviewer';
    const MAX_BODY = 5000;
    const PROTOCOL = 'ai-collab-v1';

    return {
      __meta: {
        protocol: PROTOCOL,
        author: AI_AUTHOR,
        maxBody: MAX_BODY,
        capabilities: {
          canRead: true,
          canReply: true,
          canSubscribe: true,
          // 不能做的事（防污染）：
          canCreateThread: false,
          canDelete: false,
          canResolve: false,
          canModifyOthers: false,
        },
      },

      // ==================== 读 ====================
      /** 列出所有 thread（不修改任何状态） */
      listThreads() {
        return State.annotations.map(t => ({
          threadId: t.threadId,
          text: t.text,
          resolved: t.resolved,
          createdAt: t.createdAt,
          commentCount: t.comments.length,
          lastComment: t.comments[t.comments.length - 1] ? {
            author: t.comments[t.comments.length - 1].author,
            body: t.comments[t.comments.length - 1].body.slice(0, 100),
            createdAt: t.comments[t.comments.length - 1].createdAt,
          } : null,
          // 是否需要 AI 回复：无 resolved、无 AI 评论
          needsReply: !t.resolved && !t.comments.some(c => c.author === AI_AUTHOR),
        }));
      },

      /** 取单条 thread 详情（拷贝返回，不暴露内部引用） */
      getThread(threadId) {
        const t = State.annotations.find(x => x.threadId === threadId);
        if (!t) return null;
        return {
          threadId: t.threadId,
          text: t.text,
          resolved: t.resolved,
          createdAt: t.createdAt,
          comments: t.comments.map(c => ({ ...c })),
        };
      },

      /** 待回复的 thread 列表（needsReply=true） */
      getPending() {
        return this.listThreads().filter(t => t.needsReply);
      },

      /** 当前文档信息 */
      getDocInfo() {
        return {
          fileName: State.currentFile ? State.currentFile.name : null,
          annotationCount: State.annotations.length,
          pendingCount: this.getPending().length,
          saveMode: State.saveMode,
          author: State.author,
        };
      },

      // ==================== 订阅 ====================
      /** 订阅新评论事件 */
      onNewComment(cb) {
        if (typeof cb !== 'function') throw new TypeError('cb must be a function');
        AIListeners.newComment.push(cb);
        return () => {
          const i = AIListeners.newComment.indexOf(cb);
          if (i >= 0) AIListeners.newComment.splice(i, 1);
        };
      },

      /** 订阅 thread 变更事件（create/reply/delete/resolved） */
      onThreadChange(cb) {
        if (typeof cb !== 'function') throw new TypeError('cb must be a function');
        AIListeners.threadChange.push(cb);
        return () => {
          const i = AIListeners.threadChange.indexOf(cb);
          if (i >= 0) AIListeners.threadChange.splice(i, 1);
        };
      },

      // ==================== 写（只能 reply） ====================
      /**
       * AI 回复批注
       * @param {string} threadId
       * @param {string} body
       * @param {object} [opts]
       * @param {string} [opts.author] - 自定义作者名（默认 'AI Reviewer'）
       * @returns {{ ok: boolean, comment?: object, error?: string }}
       */
      reply(threadId, body, opts = {}) {
        // 1. 验证参数
        if (typeof threadId !== 'string' || !threadId) {
          return { ok: false, error: 'threadId 必须为非空字符串' };
        }
        if (typeof body !== 'string') {
          return { ok: false, error: 'body 必须为字符串' };
        }
        const trimmed = body.trim();
        if (!trimmed) {
          return { ok: false, error: 'body 不能为空' };
        }
        if (trimmed.length > MAX_BODY) {
          return { ok: false, error: `body 超过最大长度 ${MAX_BODY}` };
        }

        // 2. 查找 thread
        const thread = State.annotations.find(t => t.threadId === threadId);
        if (!thread) {
          return { ok: false, error: `thread 不存在: ${threadId}` };
        }
        if (thread.resolved) {
          return { ok: false, error: 'thread 已 resolved，无法回复（请用户 reopen）' };
        }

        // 3. 构造 comment
        const author = (opts.author && typeof opts.author === 'string' && opts.author.trim())
                       ? opts.author.trim()
                       : AI_AUTHOR;
        const comment = {
          id: uuid(),
          author,
          body: trimmed,
          createdAt: nowISO(),
        };

        // 4. 保存（直接 push，绕过 addReply 因为它会用 State.author）
        try {
          thread.comments.push(comment);
          markDirty();
          renderCommentList();
          // 触发监听
          emitAI('newComment', { threadId, comment });
          emitAI('threadChange', { threadId, change: 'reply', comment });
          return { ok: true, comment };
        } catch (e) {
          return { ok: false, error: 'reply 失败: ' + e.message };
        }
      },

      // ==================== 元 ====================
      /** 获取协议元信息 */
      protocol() {
        return { ...this.__meta };
      },
    };
  })(),
  // 调试用
  md,  // 暴露 markdown-it 实例用于测试
  // 用于测试的 helpers
  createTestAnnotation(text) {
    const editor = State.editor;
    const doc = editor.state.doc;
    const found = findTextInDoc(doc, text);
    if (!found) return null;
    createAnnotationThread(found.from, found.to, text);
    return State.annotations[State.annotations.length - 1];
  },
  getAnnotations: () => State.annotations,
  getEditorHTML: () => State.editor.getHTML(),
  setAuthor: name => { State.author = name; localStorage.setItem('Mentor:author', name); },
};