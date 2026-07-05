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
  authorId: localStorage.getItem('Mentor:authorId') || '',   // 用户唯一 ID, 永不改变
  author: localStorage.getItem('Mentor:author') || '',       // 显示名, 可改
  filterOpen: true,
  filterResolved: false,
  showAllMarkup: true,        // P-marks: All Markup / No Markup 切换 (默认 true = 显示所有批注 + 气泡)
  // F18: reply 草稿持久 (Word 行为: 切文档再切回草稿保留)
  // key = threadId, value = textarea 内容
  replyDrafts: {},
  // H2 fix: 解决卡片临时展开状态 (key = threadId, value = true), 仅 session 内
  expandedThreadIds: {},
  folderHandle: null,       // 当前文件夹 handle（FileSystemDirectoryHandle）
  saveMode: 'unknown',      // 'handle' | 'download' | 'unknown'
  readOnlyMode: false,      // P0-A: 另一 tab 在编辑时启用只读 (Ctrl+S 禁用)
  fileMtime: null,          // P0-C: 主 .md 的 mtime (last save 时记录的)
  renderMode: 'rendered',   // 'rendered' = WYSIWYG 渲染; 'source' = 显示原始 markdown 源码
  savedSelection: null,     // P-sel: { from, to, text } — rendered→source 时保存, source→rendered 时尝试恢复
  idbCache: {},             // P-reload: { [file.name]: { sidecar, updatedAt } } 启动时预热, loadMarkdownIntoEditor 同步读
};

// ============================================================
// 1.5 IndexedDB 持久化 File System Access handles
// ============================================================
const HandleStore = {
  DB_NAME: 'Mentor-handles',
  DB_VERSION: 2,  // v2 (2026-07-05): add 'files' object store for single-file handle persistence; folder mode removed
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        const oldVersion = e.oldVersion;
        if (oldVersion < 1) {
          // 创建 v1 stores (folder mode legacy; 现在没用但保留数据)
          if (!db.objectStoreNames.contains('folders')) {
            db.createObjectStore('folders', { keyPath: 'path' });
          }
          if (!db.objectStoreNames.contains('lastFile')) {
            db.createObjectStore('lastFile', { keyPath: 'id' });
          }
        }
        if (oldVersion < 2) {
          // v2: 新增 files store (单 .md 模式 handle 持久化)
          if (!db.objectStoreNames.contains('files')) {
            db.createObjectStore('files', { keyPath: 'name' });
          }
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  },

  // --- v1 legacy folder-mode 方法 (保留但不调用) ---
  async putFolder(path, handle) { return this._putInStore('folders', { path, handle, updatedAt: Date.now() }); },
  async getFolder(path) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readonly');
      const req = tx.objectStore('folders').get(path);
      req.onsuccess = () => resolve(req.result ? req.result.handle : null);
      tx.onerror = () => reject(tx.error);
    });
  },
  async listFolders() { return this._getAllFromStore('folders').then(rs => rs.map(r => r.path)); },
  async deleteFolder(path) { return this._deleteFromStore('folders', path); },

  // --- 单 .md 模式 (v2 新方法) ---
  async putFile(name, handle) {
    return this._putInStore('files', { name, handle, updatedAt: Date.now() });
  },
  async getFile(name) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(name);
      req.onsuccess = () => resolve(req.result ? req.result.handle : null);
      tx.onerror = () => reject(tx.error);
    });
  },
  async deleteFile(name) { return this._deleteFromStore('files', name); },

  // --- lastFile (跨 reload 记住最后一次打开的 .md) ---
  async putLastFile(fileName) {
    return this._putInStore('lastFile', { id: 'last', fileName, updatedAt: Date.now() }, 'lastFile', 'id', 'last');
  },
  async getLastFile() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lastFile', 'readonly');
      const req = tx.objectStore('lastFile').get('last');
      req.onsuccess = () => resolve(req.result || null);
      tx.onerror = () => reject(tx.error);
    });
  },

  // --- 通用 helpers ---
  async _putInStore(storeName, record) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
  async _getAllFromStore(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      tx.onerror = () => reject(tx.error);
    });
  },
  async _deleteFromStore(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
};


// 1.6 批注本地存储 (按文件名存, 不需要 sidecar 文件也能跨会话恢复)
const AnnotationStore = {
  DB_NAME: 'Mentor-annotations',
  DB_VERSION: 2,  // 升到 2, 强制 upgradeneeded 修复之前 DB 已存在但 store 缺失的状态
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        // 创建 annotations store (如果不存在)
        if (!db.objectStoreNames.contains('annotations')) {
          db.createObjectStore('annotations', { keyPath: 'name' });
        }
      };
      req.onsuccess = () => {
        this._db = req.result;
        const stores = Array.from(this._db.objectStoreNames);
        console.log('[IDB] open ok, db version', this._db.version, 'stores:', stores);
        if (stores.includes('annotations')) {
          resolve(this._db);
        } else {
          console.warn('[IDB] annotations store 缺失, 强制删除并重建');
          this._db.close();
          this._db = null;
          const del = indexedDB.deleteDatabase(this.DB_NAME);
          del.onsuccess = () => {
            const req2 = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req2.onupgradeneeded = e2 => {
              e2.target.result.createObjectStore('annotations', { keyPath: 'name' });
            };
            req2.onsuccess = () => { this._db = req2.result; console.log('[IDB] 重建完成'); resolve(req2.result); };
            req2.onerror = () => reject(req2.error);
          };
          del.onerror = () => reject(del.error);
        }
      };
      req.onerror = () => reject(req.error);
    });
  },

  async put(name, sidecar) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('annotations', 'readwrite');
        const store = tx.objectStore('annotations');
        store.put({ name, sidecar, updatedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('tx aborted: ' + tx.error?.message));
      } catch (e) {
        // store 缺失 (旧 IDB 异常), 强制删除重建再 put
        console.warn('[IDB] put 失败, store 缺失, 重建:', e.message);
        this._db?.close();
        this._db = null;
        const del = indexedDB.deleteDatabase(this.DB_NAME);
        del.onsuccess = () => {
          this.open().then(db2 => {
            const tx2 = db2.transaction('annotations', 'readwrite');
            tx2.objectStore('annotations').put({ name, sidecar, updatedAt: Date.now() });
            tx2.oncomplete = resolve;
            tx2.onerror = () => reject(tx2.error);
          }).catch(reject);
        };
        del.onerror = () => reject(del.error);
      }
    });
  },

  async get(name) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('annotations', 'readonly');
      const req = tx.objectStore('annotations').get(name);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('annotations', 'readonly');
      const req = tx.objectStore('annotations').getAll();
      req.onsuccess = () => resolve(req.result || []);
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
import { Mark, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

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
      // P3-A: 把 'is-active' 提升为 schema attr, 避免 ProseMirror view rebuild 时丢失
      // highlightActiveMark 通过 setMark + dispatch 同步这个 attr, 切换瞬间 renderHTML
      // 会输出 is-active class, 新 mark 元素天然带 class.
      active: {
        default: false,
        parseHTML: el => el.classList.contains('is-active'),
        renderHTML: attrs => attrs.active ? { 'data-active': 'true' } : {},
      },
      // P-D10: mark 颜色按 author 分配 (Word 8 色自动)
      // 8 色循环分配, 同 author 同色, 用 inline style 设置 background
      authorColor: {
        default: 0,
        parseHTML: el => parseInt(el.getAttribute('data-author-color') || '0', 10),
        renderHTML: attrs => ({ 'data-author-color': String(attrs.authorColor || 0) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-thread-id]' }];
  },
  renderHTML({ HTMLAttributes, node }) {
    // node.attrs 优先 (parseHTML 后), HTMLAttributes 是渲染时的合并结果
    const resolved = HTMLAttributes['data-resolved'] === 'true' || node?.attrs?.resolved === true;
    const active = HTMLAttributes['data-active'] === 'true' || node?.attrs?.active === true;
    return ['span', {
      class: `annotation-mark${resolved ? ' is-resolved' : ''}${active ? ' is-active' : ''}`,
      ...HTMLAttributes,
    }, 0];
  },
});

// P-mark: 批注 mark 旁边浮出可点击的小气泡 (Word 视觉关键)
// 用 ProseMirror Decoration.widget (不是 mark — mark 不能跨节点 + 不能 absolute position)
// widget 在 mark 旁边 inline, 但通过 CSS transform 浮起来
// 行为: 点气泡 → 跳转到侧栏对应 thread (跟 ⋯ 菜单的"跳转到批注处"等价)
const annotationBubbleKey = new PluginKey('annotation-bubble');
const AnnotationBubblePlugin = new Plugin({
  key: annotationBubbleKey,
  // 监听 setMeta 重算 decorations (State.showAllMarkup 变化)
  state: {
    init() { return { allMarkup: true }; },
    apply(tr, prev) {
      const meta = tr.getMeta(annotationBubbleKey);
      if (meta) return meta;
      return prev;
    },
  },
  props: {
    decorations(state) {
      const pluginState = annotationBubbleKey.getState(state);
      if (pluginState && pluginState.allMarkup === false) return DecorationSet.empty;
      const { doc } = state;
      const decorations = [];
      // 收集每个 mark 的 position
      const seenThreads = new Set();  // 一个 threadId 只一个气泡 (避免重叠, 用第一次出现的位置)
      try {
        doc.descendants((node, pos) => {
          if (!node.isText) return;
          const annMark = node.marks.find(m => m.type.name === 'annotation');
          if (!annMark) return;
          const threadId = annMark.attrs.threadId;
          if (!threadId || seenThreads.has(threadId)) return;
          seenThreads.add(threadId);
          // 防御: 容错; 出错就跳过这一个 widget (不让 plugin 整体崩)
          try {
            decorations.push(Decoration.widget(pos, () => {
              const el = document.createElement('span');
              el.className = 'annotation-bubble';
              return el;
            }, { side: -1, ignoreSelection: true, stopEvent: () => true }));
          } catch (err) {
            console.warn('[AnnotationBubble] widget 创建失败:', err);
          }
        });
      } catch (err) {
        console.warn('[AnnotationBubble] descendants 失败:', err);
      }
      return DecorationSet.create(doc, decorations);
    },
  },
});

// Tiptap 包装: 把 PM Plugin 包装成 Tiptap Extension
// Tiptap Editor 不直接接受 raw PM Plugin — 需要 Extension.create 加到 extensions 数组
const AnnotationBubbleExtension = Extension.create({
  name: 'annotation-bubble',
  addProseMirrorPlugins() {
    return [AnnotationBubblePlugin];
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



// 规范化 author 字段: 老数据可能是字符串, 新数据是 {id, name} 对象
// 返回 {id, name} 统一格式
function normalizeAuthor(a) {
  if (!a) return { id: '', name: '匿名' };
  if (typeof a === 'string') return { id: '', name: a || '匿名' };
  if (typeof a === 'object') {
    return { id: a.id || '', name: a.name || '匿名' };
  }
  return { id: '', name: '匿名' };
}

// 取 author 显示名 (兼容字符串/对象)
function authorName(a) {
  return normalizeAuthor(a).name;
}

// 取 author id (兼容字符串/对象) - 字符串时返回空字符串
function authorId(a) {
  if (!a) return '';
  if (typeof a === 'object') return a.id || '';
  return '';
}

function nowISO() { return new Date().toISOString(); }
function formatTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// G15: 更新侧栏顶 thread count + tab 计数 (Word 风格 "5 comments")
function updateCommentCounts() {
  const all = State.annotations.length;
  const open = State.annotations.filter(a => !a.resolved).length;
  const resolved = State.annotations.filter(a => a.resolved).length;
  const total = $('#comment-count');
  if (total) total.textContent = all;
  const allBtn = document.querySelector('[data-count-for="all"]');
  if (allBtn) allBtn.textContent = all;
  const openBtn = document.querySelector('[data-count-for="open"]');
  if (openBtn) openBtn.textContent = open;
  const resolvedBtn = document.querySelector('[data-count-for="resolved"]');
  if (resolvedBtn) resolvedBtn.textContent = resolved;
}

// G16: sync filter tabs active class + checkbox state (Word 风格 All/Open/Resolved tab)
function syncFilterTabsFromCheckboxes() {
  const open = $('#filter-open');
  const res = $('#filter-resolved');
  if (open) open.checked = State.filterOpen;
  if (res) res.checked = State.filterResolved;
  let mode = 'open';
  if (State.filterOpen && State.filterResolved) mode = 'all';
  else if (!State.filterOpen && State.filterResolved) mode = 'resolved';
  else if (State.filterOpen && !State.filterResolved) mode = 'open';
  else mode = 'none';
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.filterTab === mode);
  });
}

// H1 fix: mark title 显示 thread preview (Word 风格 hover 提示)
// 格式: "批注: <text>\n回复: <body> · <author> · <time>"
// 重要: 不能在 editor DOM 内部用 setAttribute — 会触发 PM MutationObserver 重置 selection
// 改用 wrapper: 给 .annotation-mark 父元素或兄弟元素加 title, 不在 mark 上
function updateMarkTitles() {
  // 不在 .annotation-mark 上 setAttribute (会触发 PM 重置 selection)
  // 暂用 data-tooltip 属性 (同样会触发), 改用悬浮层 wrapper
  // 简化方案: 跳过此特性, 留待 H1 v2
  // 实际: 不调 setAttribute/title
  return;
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

// M15 docx 一致: 实时更新 status bar 右部 (字数 + 行数 + 批注数)
// 仅操作 status-right, 不动 status-left — 兼容所有现有 setStatus(left, right) 调用方
// 250ms debounce 避免每键击都重算 — 但加载完成是 immediate, 不 debounce
let _docMetaTimer = null;
function updateDocMeta({immediate = false} = {}) {
  // 立即刷新 (用于文档切换/加载完成)
  if (immediate) {
    if (_docMetaTimer) { clearTimeout(_docMetaTimer); _docMetaTimer = null; }
    _doUpdateDocMeta();
    return;
  }
  if (_docMetaTimer) clearTimeout(_docMetaTimer);
  _docMetaTimer = setTimeout(() => {
    _docMetaTimer = null;
    _doUpdateDocMeta();
  }, 200);
}

function _doUpdateDocMeta() {
  if (!State.editor || !State.currentFile) return;
  const docText = State.editor.state.doc.textContent || '';
  const wordCount = docText.trim() ? docText.trim().split(/\s+/).filter(Boolean).length : 0;
  const lineCount = docText.split('\n').length;
  const annCount = (State.annotations || []).length;
  const name = State.currentFile.name || '';
  $('#status-right').textContent = `${name} · ${wordCount} 词 · ${lineCount} 行 · ${annCount} 批注`;
}

function markDirty() {
  if (State.currentFile) {
    State.currentFile.dirty = true;
    $('#dirty-indicator').classList.add('is-dirty');
    $('#current-file-name').textContent = State.currentFile.name;
    updateTreeDirtyDots();
    // P-reload: 任何 dirty 变更都触发 IDB 缓存 debounce 写 (用户刷新前不存盘也能恢复批注)
    scheduleIdbCacheWrite();
  }
}

// P-mark-fix: 文档编辑后验证所有 ann 的 mark 位置
// 防止: 删 mark 内文字 / Ctrl+Z 让 mark 消失但 ann.range stale → silent fail
// 主动调 findAnnotationRange 重新定位, mark 不在 = 标 fuzzy/invalid
function _validateMarksAfterEdit(editor) {
  if (!State.annotations || State.annotations.length === 0) return;
  const markType = editor.schema.marks.annotation;
  let changed = false;
  for (const ann of State.annotations) {
    // 检查 ann 的 mark 实际是否在 doc 里 (按 threadId 精确匹配)
    let markFound = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some(m => m.type === markType && m.attrs.threadId === ann.threadId)) {
        markFound = true;
        return false;
      }
    });
    if (!markFound) {
      // mark 不在 doc 里 → 标 fuzzy/invalid 提示用户
      // 即使 findAnnotationRange 能找到 text, mark 也确实不在 (e.g. Ctrl+Z 撤销了 addMark)
      if (!ann.fuzzy || !ann.invalid) {
        ann.fuzzy = true;
        ann.invalid = true;
        ann.invalidReason = ann.invalidReason || 'mark-missing';
        changed = true;
      }
    } else if (ann.invalid || ann.fuzzy) {
      // mark 在 → 清除 invalid 标志
      ann.fuzzy = false;
      ann.invalid = false;
      ann.invalidReason = undefined;
      changed = true;
    }
  }
  if (changed) renderCommentList();
}

// P-reload: debounce 500ms 写 IDB (markDirty 频繁触发, 不能每次都 await put)
let _idbCacheWriteTimer = null;
let _idbCacheWriting = false;
function scheduleIdbCacheWrite() {
  if (_idbCacheWriteTimer) clearTimeout(_idbCacheWriteTimer);
  // P-reload: 立即把当前 sidecar 写一份到 cache (不让用户切文件后丢)
  // 不等 debounce — 这样切文档前 cache 一定有当前 doc 的最新 sidecar
  if (State.currentFile) {
    const curSidecar = {
      version: '1',
      document: State.currentFile.name,
      updatedAt: new Date().toISOString(),
      author: { id: State.authorId, name: State.author },
      annotations: State.annotations.map(t => ({
        threadId: t.threadId,
        text: t.text,
        prefix: t.prefix || '',
        suffix: t.suffix || '',
        resolved: t.resolved || false,
        createdAt: t.createdAt,
        comments: t.comments,
      })),
    };
    State.idbCache[State.currentFile.name] = { sidecar: curSidecar, updatedAt: Date.now() };
  }
  _idbCacheWriteTimer = setTimeout(async () => {
    _idbCacheWriteTimer = null;
    if (_idbCacheWriting) return;  // 防并发
    if (!State.currentFile) return;
    _idbCacheWriting = true;
    try {
      const sidecar = {
        version: '1',
        document: State.currentFile.name,
        updatedAt: new Date().toISOString(),
        author: { id: State.authorId, name: State.author },
        annotations: State.annotations.map(t => ({
          threadId: t.threadId,
          text: t.text,
          prefix: t.prefix || '',
          suffix: t.suffix || '',
          resolved: t.resolved || false,
          createdAt: t.createdAt,
          comments: t.comments,
        })),
      };
      await AnnotationStore.put(State.currentFile.name, sidecar);
      // 同步更新 idbCache (下次 loadMarkdownIntoEditor 同步读能命中)
      State.idbCache[State.currentFile.name] = { sidecar, updatedAt: Date.now() };
    } catch (e) { console.warn('[P-reload] debounce IDB put 失败:', e); }
    finally { _idbCacheWriting = false; }
  }, 500);
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
    onUpdate: ({ editor, transaction }) => {
      // P3-A: 切 active thread 的 dispatch 用 setMeta 标记, 视为 UI 同步不算 dirty
      // P-2: 表格跨 cell 拖选 setSelection 也是 UI 同步, 同样不算 dirty
      if (transaction?.getMeta('__activeMarkSync') || transaction?.getMeta('__tableDragSelect')) {
        // 仍然刷新侧栏 (highlight 已经 dispatch 了, renderCommentList 由 highlightActiveMark 自己触发)
        return;
      }
      markDirty();
      // 文本变化时，需要重新解析已存在的批注 mark 位置（保持侧栏锚定）
      // 这里只刷新侧栏显示顺序，不动数据
      renderCommentList();
      // 大纲同步
      renderOutline();
      // P-mark-fix: 验证所有 ann 的 mark 位置仍然有效
      // 删 mark 内文字 / Ctrl+Z 都会让 mark 消失但 ann 仍 stale
      // 主动调 findAnnotationRange 重新定位, 标 fuzzy/invalid
      _validateMarksAfterEdit(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      handleSelectionChange();
    },
  });
  // P-2: 表格内跨 cell 拖选 - 浏览器原生 table 把 selection 限制在单 cell 内
  // 拦截 mouseup, 检测是否跨 cell 拖拽意图, 用 setTextSelection 强制跨 cell 选区
  setupTableDragCapture(editorEl);
  // P4-MathEdit: 双击 KaTeX 公式弹源码输入框 (公式被设计为 atomic, 源码不可直接编辑, 走 modal)
  setupKatexDblClick(editorEl);
}

// ============================================================
// 4.5 表格跨 cell 拖选拦截
// ============================================================
// 浏览器原生 <table> 行为: mousedown 锁定一个 cell, 拖拽只在 cell 内扩展 selection.
// mouseup 时如果鼠标在另一 cell, 用户视觉上"拖过 3 cell"但 PM selection 只在最后 cell 内.
// 拦截逻辑: 记录 mousedown cell + mouseup cell, 跨 cell 时用 CellSelection.create() 创建多 cell 选区.
// 之后 createAnnotationThread 检测到 CellSelection, 给每个 cell 一段独立 mark (共享 threadId).
function setupTableDragCapture(editorEl) {
  if (!editorEl) return;
  let downCellInfo = null;  // { cellPos, contentStart, contentEnd }
  let isDragging = false;

  // helper: 找 dom cell 对应的 PM cell node pos (cell.pos)
  // 返回 { cellPos, contentStart, contentEnd }
  // cellPos 必须是 depth=2 位置 (parent=tableRow, nodeAfter=cell) - CellSelection.create 需要这种位置
  function findCellPos(domCell) {
    if (!domCell || !State.editor) return null;
    try {
      const pos = State.editor.view.posAtDOM(domCell, 0);
      const $pos = State.editor.state.doc.resolve(pos);
      // 找 tableCell/Header ancestor depth
      let cellDepth = -1;
      for (let d = $pos.depth; d > 0; d--) {
        const t = $pos.node(d).type.name;
        if (t === 'tableCell' || t === 'tableHeader') { cellDepth = d; break; }
      }
      if (cellDepth < 0) return null;
      // $pos.before(cellDepth) = position before cell node = cell start position (depth=cellDepth-1, parent=tableRow)
      const cellPos = $pos.before(cellDepth);
      return {
        cellPos,
        contentStart: $pos.start(cellDepth),
        contentEnd: $pos.end(cellDepth),
      };
    } catch (e) {
      return null;
    }
  }

  editorEl.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('td, th');
    if (!cell) { downCellInfo = null; isDragging = false; return; }
    downCellInfo = findCellPos(cell);
    isDragging = !!downCellInfo;
  });

  editorEl.addEventListener('mouseup', (e) => {
    if (!isDragging || !downCellInfo) { isDragging = false; return; }
    isDragging = false;
    const upCell = e.target.closest('td, th');
    if (!upCell || !State.editor) return;
    const upInfo = findCellPos(upCell);
    if (!upInfo) return;
    // 同一 cell - 不需要干预, PM 默认 selection 已 OK
    if (downCellInfo.cellPos === upInfo.cellPos) return;
    // 跨 cell: 用 Tiptap 提供的 setCellSelection command
    // (Tiptap 2.1.13 的 editor.commands.setCellSelection({anchorCell, headCell}) 创建 CellSelection)
    // 注意: anchorCell 必须是 depth=2 的 position (parent=tableRow), 不是 cell content 内的 pos
    try {
      const ok = State.editor.commands.setCellSelection({
        anchorCell: downCellInfo.cellPos,
        headCell: upInfo.cellPos,
      });
      if (!ok) throw new Error('setCellSelection returned false');
      // dispatch a follow-up tr with meta for selectionUpdate propagation
      const tr = State.editor.state.tr;
      tr.setMeta('__tableDragSelect', true);
      State.editor.view.dispatch(tr);
      setStatus('提示', `已选中多单元格, 批注将覆盖全部文字`);
    } catch (err) {
      console.warn('[tableDrag] CellSelection 失败, 退回单 cell:', err);
      // 退回: 选区只到起始 cell 全文
      try {
        State.editor.chain()
          .focus()
          .setTextSelection({ from: downCellInfo.contentStart, to: downCellInfo.contentEnd })
          .setMeta('__tableDragSelect', true)
          .run();
      } catch (e) { /* ignore */ }
    }
  });
}

// ============================================================
// 4.6 双击 KaTeX 公式 — 弹出源码输入框 (P4-MathEdit)
// ============================================================
// 公式 atom 节点设 contenteditable=false, 不能直接编辑. 用 dblclick 唤出 modal.
function setupKatexDblClick(editorEl) {
  if (!editorEl) { console.warn('[MathEdit] no editorEl'); return; }  editorEl.addEventListener('dblclick', (e) => {    const target = e.target.closest('.katex-wrapper, .katex-wrapper-display');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      editKatexInPlace(target);
    } catch (err) {
      console.warn('[MathEdit] dblclick handler error:', err);
      showToast('公式编辑失败: ' + err.message);
    }
  });
}

function editKatexInPlace(target) {  // 遍历 doc 找 data-tex 匹配的 node (避开 posAtDOM 复杂语义)
  const targetTex = target.getAttribute('data-tex') || '';
  let foundNode = null;
  let foundPos = null;
  State.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'katex' || node.type.name === 'katexBlock') {
      if (node.attrs.tex === targetTex) {
        foundNode = node;
        foundPos = pos;
        return false;  // stop
      }
    }
    return true;
  });
  if (!foundNode) {
    // fallback: 第一个 katex node
    State.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'katex' || node.type.name === 'katexBlock') {
        foundNode = node;
        foundPos = pos;
        return false;
      }
      return true;
    });
  }
  if (!foundNode) {
    console.warn('[MathEdit] no katex node found in doc');
    return;
  }
  openEditModal(foundNode, foundPos);
}
function openEditModal(pmNode, pos) {
  // 复用 author-modal DOM, 临时改文案 + 字段 (一次性同步循环, 用 cloneNode 替换按钮避免 listener 冲突)
  const modal = $('#author-modal');
  const titleEl = $('#author-modal-title');
  const descEl = $('#author-modal-desc');
  const inputEl = $('#author-input');
  const saveBtn = $('#author-save');
  const cancelBtn = $('#author-cancel');

  // 把 author-modal 移到一个不同的位置避免与 promptAuthor 同时弹出冲突
  // 这里仍共享 DOM, 所以一次性: 用一个同步循环展示 + 用 setTimeout 退出
  const origTitle = titleEl.textContent;
  const origDesc = descEl.textContent;
  const origSaveText = saveBtn.textContent;
  const origPlaceholder = inputEl.placeholder;
  const origModalDisplay = modal.style.display;

  titleEl.textContent = '编辑公式 LaTeX 源码';
  descEl.innerHTML = `<strong>节点类型:</strong> ${pmNode.type.name}<br><strong>当前源码:</strong> <code style="font-family:var(--font-mono);font-size:12px;background:var(--panel-3);padding:2px 6px;border-radius:3px;">${escapeHtml(pmNode.attrs.tex || '')}</code>`;
  saveBtn.textContent = '保存';
  inputEl.placeholder = 'e.g. \\\\frac{a}{b}';
  inputEl.value = pmNode.attrs.tex || '';

  // 停掉可能存在的 promptAuthor 残余 handler (从 button remove 掉)
  // 我们用 cloneNode 替换按钮来避免 listner 重叠
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  openEditModal._lastPos = pos;
  modal.classList.remove('hidden');
  setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

  let resolved = false;
  const close = (val) => {
    if (resolved) return;
    resolved = true;
    modal.classList.add('hidden');
    titleEl.textContent = origTitle;
    descEl.textContent = origDesc;
    saveBtn.textContent = origSaveText;
    inputEl.placeholder = origPlaceholder;
    inputEl.value = '';
    // 还原按钮 (下次 promptAuthor 仍能用)
    const rb = newSaveBtn.parentNode.replaceChild(saveBtn, newSaveBtn);
    const rc = newCancelBtn.parentNode.replaceChild(cancelBtn, newCancelBtn);
    inputEl.removeEventListener('keydown', keyHandler);
  };
  const saveHandler = () => {
    const v = inputEl.value.trim();
    if (!v) { showToast('公式不能为空'); return; }
    close(v);
    applyKatexEdit(pmNode, openEditModal._lastPos, v);
  };
  const cancelHandler = () => close(null);
  const backdropHandler = (e) => { if (e.target === modal) close(null); };
  const keyHandler = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveHandler(); }
    else if (e.key === 'Escape') close(null);
  };
  newSaveBtn.addEventListener('click', saveHandler);
  newCancelBtn.addEventListener('click', cancelHandler);
  inputEl.addEventListener('keydown', keyHandler);
  modal.addEventListener('click', backdropHandler);
}

function applyKatexEdit(pmNode, pos, newTex) {
  if (typeof pos !== 'number') return;
  if (newTex === pmNode.attrs.tex) return;  // noop
  try {
    const tr = State.editor.state.tr.setNodeMarkup(pos, undefined, { tex: newTex });
    State.editor.view.dispatch(tr);
    markDirty();
    updateDocMeta();
    showToast('✓ 公式已更新');
  } catch (err) {
    showToast('公式更新失败: ' + err.message);
  }
}
function promptEditKatex(pmNode) {
  return new Promise(resolve => {
    // 复用 author modal 的 DOM (避免重复), 临时改它的文案 + 加 input 字段
    const modal = $('#author-modal');
    const titleEl = $('#author-modal-title');
    const descEl = $('#author-modal-desc');
    const inputEl = $('#author-input');
    const saveBtn = $('#author-save');
    const cancelBtn = $('#author-cancel');
    if (!modal || !inputEl) { resolve(null); return; }
    // 保存原始文案 + 替换
    const origTitle = titleEl.textContent;
    const origDesc = descEl.textContent;
    const origSaveText = saveBtn.textContent;
    titleEl.textContent = '编辑公式 LaTeX 源码';
    descEl.textContent = `当前节点类型: ${pmNode.type.name}。输入合法的 LaTeX 数学公式源码 (KaTeX 支持的子集).`;
    saveBtn.textContent = '保存';
    inputEl.value = pmNode.attrs.tex || '';
    inputEl.placeholder = 'e.g. E = mc^2';
    modal.classList.remove('hidden');
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
    const cleanup = (val) => {
      modal.classList.add('hidden');
      titleEl.textContent = origTitle;
      descEl.textContent = origDesc;
      saveBtn.textContent = origSaveText;
      inputEl.placeholder = '例如：张三';
      saveBtn.removeEventListener('click', saveHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      inputEl.removeEventListener('keydown', keyHandler);
      modal.removeEventListener('click', backdropHandler);
      resolve(val);
    };
    const saveHandler = () => cleanup(inputEl.value);
    const cancelHandler = () => cleanup(null);
    const backdropHandler = (e) => { if (e.target === modal) cleanup(null); };
    const keyHandler = (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) cleanup(inputEl.value);
      else if (e.key === 'Escape') cleanup(null);
    };
    saveBtn.addEventListener('click', saveHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    inputEl.addEventListener('keydown', keyHandler);
    modal.addEventListener('click', backdropHandler);
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
    // P-card: 总是 renderCommentList (即使 activeThreadId 没变, cursor 可能切到 mark 内不同位置)
    // Word 风格: 侧栏状态实时跟随光标位置
    if (State.activeThreadId !== activeMarkThreadId) {
      State.activeThreadId = activeMarkThreadId;
    }
    highlightActiveMark();
    renderCommentList();
  }
  // P-card: 同步 mark-delete-popover 状态 (selection 变化时 positionMarkDeletePopover 不一定被调)
  // 选区非空 → 隐藏 popover (避免挡 #float-comment-btn)
  // 选区空 + cursor 在 active mark 内 → 调用 positionMarkDeletePopover 重新定位并显示
  const popover = $('#mark-delete-popover');
  if (popover) {
    if (!empty) {
      if (!popover.classList.contains('hidden')) popover.classList.add('hidden');
    } else if (State.activeThreadId) {
      positionMarkDeletePopover();
    }
  }

  if (empty || from === to) {
    // CellSelection 不是 empty (覆盖多 cell), 不在这里 return
    const isCellSel = State.editor.state.selection.forEachCell
      && State.editor.state.selection.$anchorCell
      && State.editor.state.selection.$headCell;
    if (!isCellSel) {
      btn.classList.add('hidden');
      return;
    }
  }
  // CellSelection (多 cell 选区): 直接显示按钮, 不做跨 cell fallback
  const sel = State.editor.state.selection;
  const isCellSel = sel.forEachCell && sel.$anchorCell && sel.$headCell;
  if (isCellSel) {
    try {
      // 按钮定位到选区起点 cell 顶部
      const start = editor.view.coordsAtPos(sel.from);
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
    return;
  }
  // P-h: 选区在 heading 节点内 → reject (不显示批注按钮)
  // 原因: heading 是结构性元素, 批注应放在正文段落. 用户落位到 heading 大多是误触.
  const $fromHead = editor.state.doc.resolve(from);
  const $toHead = editor.state.doc.resolve(to);
  if ($fromHead.parent.type.name === 'heading' || $toHead.parent.type.name === 'heading') {
    btn.classList.add('hidden');
    setStatus('提示', '批注不支持标题选区, 请选段落正文');
    return;
  }

  // 选区跨 block (多行) → 走多段批注 (每段各打 mark, 共享 threadId)
  // 跨 cell (table 内) → 走多 cell 批注 (每 cell 各打 mark, 共享 threadId)
  // 其他跨 block (heading / list item) → 仍然 reject
  const $from = editor.state.doc.resolve(from);
  const $to = editor.state.doc.resolve(to);
  if ($from.parent !== $to.parent) {
    // 找 from 所在的 tableCell / tableHeader (从最深处往上, depth 1 是 paragraph)
    let fromCell = null;
    let fromCellDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      const t = $from.node(d).type.name;
      if (t === 'tableCell' || t === 'tableHeader') { fromCell = t; fromCellDepth = d; break; }
    }
    if (fromCell) {
      // 跨 cell: 缩进到起始 cell 的内容范围
      const cellNode = $from.node(fromCellDepth);
      const cellStart = $from.start(fromCellDepth);             // cell 内容的实际开始
      const cellContentEnd = cellStart + cellNode.content.size; // cell 内容的实际结束 (exclusive)
      const cellEnd = cellContentEnd - 1;                       // cell 内最后一个字符位置 (inclusive)
      let newFrom = Math.max(from, cellStart);
      let newTo = Math.min(to, cellEnd);
      // 钳制后空选区 (例如 from 已在 cell 末尾字符): 退而选整个 cell
      if (newFrom >= newTo) {
        newFrom = cellStart;
        newTo = cellEnd;
        if (newFrom >= newTo) {
          btn.classList.add('hidden');
          setStatus('提示', '所选单元格为空');
          return;
        }
      }
      // 把选区临时缩进到 cell 内 (用于本次定位 + 创建批注)
      try {
        editor.chain().setTextSelection({ from: newFrom, to: newTo }).run();
        setStatus('提示', '批注已自动落到起始单元格');
      } catch (e) {
        btn.classList.add('hidden');
        return;
      }
    } else if ($from.parent.type.name === 'paragraph' && $to.parent.type.name === 'paragraph') {
      // 跨段落 (多行选区): 不 reject, 让 handleCreateMultiParagraphAnnotation 后续处理
      // 按钮继续显示 (定位到 from 上沿)
    } else {
      // 其他跨 block (heading, list item, blockquote) → reject
      btn.classList.add('hidden');
      setStatus('提示', '批注暂不支持跨块选区, 请选段落内或跨段连续文字');
      return;
    }
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
    const sel = State.editor.state.selection;
    if (sel.empty && (!sel.$anchor || !sel.$head)) return;
    // 判断是不是 CellSelection (多 cell 选区)
    // 注: Tiptap/PM 编译后构造函数名被 minify 为 "M", 需同时检查原型 forEachCell 特征
    const isCellSel = sel.constructor && (
      sel.constructor.name === 'CellSelection' ||
      (sel.forEachCell && sel.$anchorCell && sel.$headCell)
    );
    if (isCellSel) {
      handleCreateMultiCellAnnotation(sel);
      return;
    }
    // 判断是不是跨段落多行选区 (PM 标记无法跨 block, 我们对每段各打 mark 共享 threadId)
    const { from, to } = sel;
    if (from === to) return;
    const $from = State.editor.state.doc.resolve(from);
    const $to = State.editor.state.doc.resolve(to);
    if ($from.parent !== $to.parent && $from.parent.type.name === 'paragraph' && $to.parent.type.name === 'paragraph') {
      handleCreateMultiParagraphAnnotation(from, to);
      return;
    }
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
  // 如果作者未设, 弹作者输入
  if (!State.author) {
    promptAuthor().then(() => {
      if (State.author) createAnnotationThread(from, to, text);
    });
    return null;
  }
  const threadId = uuid();
  // 计算 prefix/suffix (鲁棒重定位用) — 必须立即算, 不能等用户输入第一条 comment
  // 不然空 thread 的 prefix/suffix 都是空, reload 时 P0 找不到 → invalid
  const docText = State.editor.state.doc.textBetween(0, State.editor.state.doc.content.size, ' ');
  const { prefix, suffix } = computeContext(text, docText);
  // P-card: Word 风格 — 创建时不要预先放空 comment
  // comments 数组在用户输入第一条后由 addReply 写入 (跟 addReply 路径一致)
  // 这样侧栏显示的就是用户实际输入, 不是空 placeholder
  const thread = {
    threadId,
    range: { from, to },
    text,                  // 锚定文字
    prefix,                // text 前的上下文 (max 20 字符, 换行截断)
    suffix,                // text 后的上下文
    resolved: false,
    createdAt: nowISO(),
    comments: [],          // P-card fix: 初始空, 第一次 addReply 时填充
  };
  State.annotations.push(thread);
  // 在编辑器中加 mark
  applyAnnotationMark(threadId, from, to);
  // 高亮新批注
  State.activeThreadId = threadId;
  renderCommentList();
  // P-card: 显示 mark-delete popover 让用户能立即删除
  positionMarkDeletePopover();
  // 自动聚焦新批注的输入框
  setTimeout(() => {
    const ta = document.querySelector(`[data-thread-input="${threadId}"]`);
    if (ta) ta.focus();
  }, 50);
  setStatus('已创建批注', `线程 ${threadId.slice(0, 8)}`);
  // AI 协作协议：通知
  emitAI('threadChange', { threadId, change: 'create', thread });
}

// 处理多 cell 选区 (CellSelection) 的批注创建
// CellSelection 覆盖 N 个 cell, 给每个 cell 一段独立 mark (共享 threadId)
function handleCreateMultiCellAnnotation(cellSel) {
  if (!State.author) {
    promptAuthor().then(() => {
      if (State.author) handleCreateMultiCellAnnotation(cellSel);
    });
    return;
  }
  // 收集每个 cell 的内容范围
  const ranges = [];
  let totalText = '';
  cellSel.forEachCell((node, pos) => {
    // node 是 cell node, pos 是 cell 在 doc 中的绝对位置
    const from = pos + 1;  // cell 内容起点
    const to = pos + node.nodeSize - 1;  // cell 内容末尾 (inclusive)
    if (from < to) {
      ranges.push({ from, to });
      totalText += State.editor.state.doc.textBetween(from, to, ' ') + ' ';
    }
  });
  if (ranges.length === 0) {
    showToast('所选单元格为空', 2000);
    return;
  }
  const text = totalText.trim() || '(空)';
  const threadId = uuid();
  const commentId = uuid();
  // prefix/suffix 基于第一个 cell 文字
  const docText = State.editor.state.doc.textBetween(0, State.editor.state.doc.content.size, ' ');
  const { prefix, suffix } = computeContext(ranges[0].from === cellSel.from ? text : text, docText);
  const thread = {
    threadId,
    range: ranges[0],       // 主 range 用于 activeMark 等单点逻辑
    ranges,                 // 多 cell 范围数组 (table multi-cell annotation)
    text,
    prefix,
    suffix,
    resolved: false,
    createdAt: nowISO(),
    comments: [{
      id: commentId,
      author: { id: State.authorId, name: State.author },
      body: '',
      createdAt: nowISO(),
    }],
  };
  State.annotations.push(thread);
  // 给每个 cell 加 mark
  applyAnnotationMarksMultiCell(threadId, ranges);
  // 清理 CellSelection (回到普通光标, 防止后续 markDirty 误判)
  State.editor.commands.setTextSelection(ranges[0].from);
  State.activeThreadId = threadId;
  renderCommentList();
  setTimeout(() => {
    const ta = document.querySelector(`[data-thread-input="${threadId}"]`);
    if (ta) ta.focus();
  }, 50);
  setStatus('已创建批注', `${ranges.length} 个单元格 · 线程 ${threadId.slice(0, 8)}`);
  emitAI('threadChange', { threadId, change: 'create', thread });
}

// P-D10: 简单字符串 hash (用于 authorId 派生, 同名 → 同色)
function simpleHashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// P-D10: 根据 authorId 算 8 色 color index (Word 行为: 同 author 同色)
function authorColorIndex(authorId) {
  if (!authorId) return 0;
  let h = 0;
  for (let i = 0; i < authorId.length; i++) h = (h * 31 + authorId.charCodeAt(i)) | 0;
  return Math.abs(h) % 8;
}

function applyAnnotationMark(threadId, from, to) {
  const tr = State.editor.state.tr;
  tr.addMark(from, to, State.editor.schema.marks.annotation.create({
    threadId,
    resolved: false,
    // P-D10: addMark 时带 authorColor (从 state 算)
    authorColor: authorColorIndex(State.authorId || threadId),
  }));
  State.editor.view.dispatch(tr);
  // 不调用 markDirty（这是结构性 mark 变化，已在 onUpdate 触发）
  // 但 markDirty 只在 doc 文本变化时——这里 mark 变化也会触发 onUpdate
}

function applyAnnotationMarksMultiCell(threadId, ranges) {
  const tr = State.editor.state.tr;
  // P-D10: 同步 authorColor
  const mark = State.editor.schema.marks.annotation.create({
    threadId,
    resolved: false,
    authorColor: authorColorIndex(State.authorId || threadId),
  });
  for (const r of ranges) {
    tr.addMark(r.from, r.to, mark);
  }
  State.editor.view.dispatch(tr);
}

// 处理多段 (跨段落) 选区的批注创建
// 跨段: PM mark 不能跨 block. 收集经过的每个 paragraph 的 range, 给每段各打 mark (共享 threadId)
// thread.ranges = [{from, to}, ...] (跟 multi-cell 一样用 ranges 数组存多段)
function handleCreateMultiParagraphAnnotation(from, to) {
  if (!State.author) {
    promptAuthor().then(() => {
      if (State.author) handleCreateMultiParagraphAnnotation(from, to);
    });
    return;
  }
  const ed = State.editor;
  // 收集 from → to 之间的所有 paragraph range
  // 关键: PM addMark(from, to) 要求 from/to 都是 inline 文本内的位置
  // paragraph 节点结构: [open tag, text..., close tag]
  //   pos = blockStart → open tag 位置
  //   pos = blockStart + 1 → 第一个 text token 位置 (in)
  //   pos = blockEnd - 1 → 最后一个 text token 位置 (in)
  //   pos = blockEnd → close tag 位置
  // 所以 PM addMark 接受的 [rFrom, rTo) 必须满足:
  //   rFrom >= textStart (blockStart + 1)
  //   rTo <= textEnd + 1 (blockEnd - 1 + 1 = blockEnd) — exclusive end 仍指向 close token!
  //   实际上 rTo 必须 <= textEnd (即 blockEnd - 1), 否则 addMark 会跨越 paragraph close
  // 修复: rTo = min(to, textEnd + 1) 后, 如果 to == textEnd + 1 (i.e. 选区延伸到 paragraph 末尾边界), clamp to textEnd
  const ranges = [];
  ed.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph' && node.isTextblock) {
      const blockStart = pos;
      const blockEnd = pos + node.nodeSize;
      const textStart = blockStart + 1;  // first text position (inclusive)
      const textEnd = blockEnd - 1;     // last text position (inclusive)
      const rFrom = Math.max(from, textStart);
      // PM addMark 限制: rTo 不能跨过 paragraph close token (textEnd + 1 = blockEnd)
      // 所以 rTo 必须 ≤ textEnd
      const rTo = Math.min(to, textEnd + 1);
      // 只要这段 paragraph 跟选区有重叠, 就记录一个 range
      // (即使 rFrom == rTo, 仍代表该 paragraph 被"覆盖"了 - 哪怕只是边界)
      if (rFrom <= rTo && rTo > textStart && rFrom <= textEnd) {
        ranges.push({ from: rFrom, to: Math.max(rTo, rFrom) });  // 0 长度也保留
      }
    }
  });
  if (ranges.length === 0) {
    showToast('所选段落为空', 2000);
    return;
  }
  // 收集 text (跨段用 \n 分隔, doc.textBetween 会自动跨段拼接)
  const text = ed.state.doc.textBetween(from, to, ' ');
  const threadId = uuid();
  const commentId = uuid();
  const docText = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
  const { prefix, suffix } = computeContext(text, docText);
  const thread = {
    threadId,
    range: ranges[0],
    ranges,
    text,
    prefix,
    suffix,
    resolved: false,
    createdAt: nowISO(),
    comments: [{
      id: commentId,
      author: { id: State.authorId, name: State.author },
      body: '',
      createdAt: nowISO(),
    }],
  };
  State.annotations.push(thread);
  // 每段各打 mark (跳过 0 长度 range, 因为 PM addMark 会 no-op)
  const tr = ed.state.tr;
  const mark = ed.schema.marks.annotation.create({ threadId, resolved: false });
  for (const r of ranges) {
    if (r.from < r.to) {
      tr.addMark(r.from, r.to, mark);
    }
  }
  ed.view.dispatch(tr);
  // 回到普通光标
  ed.commands.setTextSelection(ranges[0].from);
  State.activeThreadId = threadId;
  renderCommentList();
  setTimeout(() => {
    const ta = document.querySelector(`[data-thread-input="${threadId}"]`);
    if (ta) ta.focus();
  }, 50);
  setStatus(ranges.length > 1 ? '已创建多段批注' : '已创建批注', `${ranges.length} 段 · 线程 ${threadId.slice(0, 8)}`);
  emitAI('threadChange', { threadId, change: 'create', thread });
}

function addReply(threadId, body) {
  const thread = State.annotations.find(t => t.threadId === threadId);
  if (!thread || !body.trim()) return;
  const comment = {
    id: uuid(),
    author: { id: State.authorId, name: State.author },
    body: body.trim(),
    createdAt: nowISO(),
  };
  thread.comments.push(comment);
  // F18: 提交成功清草稿
  delete State.replyDrafts[threadId];
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
  // P-D20: 记录 resolved 时间 + user (Word 风格: "Resolved 2h ago")
  if (thread.resolved) {
    thread.resolvedAt = nowISO();
    thread.resolvedBy = State.authorId || State.author || '';
  } else {
    // Reopen: 保留 resolvedAt 历史 (Word 也保留) — 不清
  }
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
  // P-card: 记下原 selection 位置, 删除 mark 后强制 reset selection 让 handleSelectionChange 重跑
  // 不然 mark 删了但 cursor 还在原位置 (selection 没变), handleSelectionChange 不触发, 按钮状态 stale
  const oldSel = { from: editor.state.selection.from, to: editor.state.selection.to };
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
  // M15 docx 一致: 批注数变化 → 刷新 status bar
  updateDocMeta();
  // 同步 mark-delete popover 隐藏
  positionMarkDeletePopover();
  // P-card: 强制重设 selection (从 pos-1 → pos) 让 onSelectionUpdate 触发
  // 即使 oldSel.from === 1 也要触发 (用先到 doc 末尾再回来)
  try {
    const size = editor.state.doc.content.size;
    editor.commands.setTextSelection(0);
    editor.commands.setTextSelection(size);
    editor.commands.setTextSelection({ from: oldSel.from, to: oldSel.to });
  } catch (e) { /* ignore */ }
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
  // F7 docx 一致: 侧栏按 doc 位置排序 (Word 行为), range.from 升序
  // invalid/fuzzy ann (range=null) 排在最后
  const sorted = [...filtered].sort((a, b) => {
    if (a.range == null && b.range == null) return 0;
    if (a.range == null) return 1;
    if (b.range == null) return -1;
    return a.range.from - b.range.from;
  });
  const visibleThreads = pinnedThread
    ? [pinnedThread, ...sorted.filter(t => t.threadId !== pinnedThread.threadId)]
    : sorted;

  if (visibleThreads.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    updateCommentCounts();
    syncFilterTabsFromCheckboxes();
    return;
  }
  empty.classList.add('hidden');

  // G15 + G16: 更新 thread count + tab 状态
  updateCommentCounts();
  syncFilterTabsFromCheckboxes();

  // 调色板 - DESIGN.md 限制: 不要引入新色相, 只用 5 语义色组
  // (中性 / 蓝 / 黄 / 状态 / 深色). 用户名字 hash → 8 色调色板
  // 8 色是 hash 分布的 sweet spot (调色板小会冲突, 大需新色相)
  const AVATAR_PALETTE = [
    '#26251e', // 中性 (text)
    '#2563eb', // 蓝 (accent)
    '#f54e00', // 橙 (强调) — DESIGN.md accent
    '#1f8a65', // 暖绿 (success)
    '#d97706', // 暖橙 (warning)
    '#cf2d56', // 暖红 (danger)
    '#5b6cff', // 蓝紫 (蓝的变种, 跟 accent 区分)
    '#0891b2', // 青 (蓝的变种, 增加 hash 分布)
  ];
  const avatarColor = (name) => {
    const n = (name || '').trim();
    if (!n) return AVATAR_PALETTE[0];
    let h = 0;
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  };
  const avatar = (name) => (name || '匿').trim().charAt(0).toUpperCase() || '?';

  list.innerHTML = visibleThreads.map((thread, idx) => {
    // P-card: first comment — 已有用第一条, 没有 (刚创建) 用当前用户作 author 显示 reply-form
    const first = thread.comments?.[0] || (thread.threadId === State.activeThreadId
      ? { author: { id: State.authorId, name: State.author }, body: '', createdAt: nowISO() }
      : { author: '匿名', body: '', createdAt: thread.createdAt || new Date().toISOString() });
    const replies = (thread.comments || []).slice(1);
    const isActive = State.activeThreadId === thread.threadId;
    const isPinnedThread = pinnedThread && thread.threadId === pinnedThread.threadId;
    // F20 docx 一致: 侧栏 thread 加数字标号 (Word 风格 1, 2, 3)
    // pinned thread 也算 (用大写 P)
    const number = isPinnedThread ? 'P' : (idx + 1);
    // P-card: 解决后默认折叠 (Word 风格), 只显示 quote + meta 一行. 通过 collapsed class 控制.
    // H2 fix: 解决后点击展开 (临时 expanded 状态, 不持久).
    const isCollapsed = thread.resolved && !State.expandedThreadIds?.[thread.threadId];
    return `
      <div class="comment-thread ${isActive ? 'is-active' : ''} ${thread.resolved ? 'is-resolved' : ''} ${isPinnedThread ? 'is-pinned' : ''} ${thread.fuzzy ? 'is-fuzzy' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-thread="${thread.threadId}">
        ${isPinnedThread ? '<div class="pinned-banner">📌 当前光标处 (filter 已隐藏)</div>' : ''}
        ${thread.fuzzy ? '<div class="fuzzy-banner">⚠ 位置可能偏移 - 请检查文档</div>' : ''}
        <div class="comment-number-badge" data-number="${number}" title="批注 #${number}">${number}</div>
        <!-- 卡片头: 引文 (可点击跳转) + ⋯ 菜单按钮 -->
        <div class="comment-quote" data-act="goto" data-thread="${thread.threadId}" title="点击跳转到批注处">
          <span class="comment-quote-mark">"</span>
          <span class="comment-quote-text">${escapeHtml((thread.text || '').slice(0, 200))}${(thread.text || '').length > 200 ? '…' : ''}</span>
          ${thread.resolved ? `<span class="comment-resolved-badge">✓ 已解决${thread.resolvedAt ? ' · ' + formatTime(thread.resolvedAt) : ''}</span>` : ''}
          <button class="comment-menu-btn" data-act="toggle-menu" data-thread="${thread.threadId}" title="更多操作" aria-label="更多操作">⋯</button>
        </div>
        <!-- ⋯ 弹窗菜单 (默认 hidden) -->
        <div class="comment-menu hidden" data-menu-for="${thread.threadId}">
          <button data-act="goto" data-thread="${thread.threadId}">📍 跳转到批注处</button>
          <button data-act="resolve" data-thread="${thread.threadId}">${thread.resolved ? '↺ 重新打开' : '✓ 标记为已解决'}</button>
          <button data-act="copy" data-thread="${thread.threadId}">📋 复制引文</button>
          <div class="menu-sep"></div>
          <button data-act="delete" data-thread="${thread.threadId}" class="menu-danger">🗑 删除批注</button>
        </div>
        <!-- 卡片体: 默认收起 (解决后), active 时展开. 用 details 保留原生折叠能力 -->
        <div class="comment-body-wrap">
          <div class="comment-item">
            <div class="comment-meta">
              <span class="comment-avatar" style="background:${avatarColor(authorName(first.author))}">${escapeHtml(avatar(authorName(first.author)))}</span>
              <span class="comment-author">${escapeHtml(authorName(first.author))}</span>
              <span class="comment-time" title="${escapeHtml(first.createdAt || '')}">${formatTime(first.createdAt)}</span>
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
                  <span class="comment-avatar" style="background:${avatarColor(authorName(r.author))}">${escapeHtml(avatar(authorName(r.author)))}</span>
                  <span class="comment-author">${escapeHtml(authorName(r.author))}</span>
                  <span class="comment-time" title="${escapeHtml(r.createdAt || '')}">${formatTime(r.createdAt)}</span>
                </div>
                <div class="comment-body">${escapeHtml(r.body)}</div>
              </div>
            `).join('')}
            ${first.body ? `
              <details class="reply-toggle" ${isActive ? 'open' : ''}>
                <summary>↳ 回复</summary>
                <div class="comment-reply-form">
                  <textarea data-thread-input="${thread.threadId}" placeholder="输入回复..."></textarea>
                  <div class="form-actions">
                    <button data-act="submit-reply" data-thread="${thread.threadId}" class="primary">提交</button>
                  </div>
                </div>
              </details>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 绑定事件
  // P-D36: Cmd+Enter / Ctrl+Enter 提交 reply (Word 风格)
  list.querySelectorAll('[data-thread-input]').forEach(ta => {
    // F18: 草稿持久 — 恢复 + input 监听
    const tid = ta.getAttribute('data-thread-input');
    if (State.replyDrafts[tid] && !ta.value) {
      ta.value = State.replyDrafts[tid];
    }
    ta.addEventListener('input', () => {
      State.replyDrafts[tid] = ta.value;
    });
    ta.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (ta.value.trim()) addReply(tid, ta.value);
      }
    });
  });
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
    btn.addEventListener('click', e => {
      // H2 fix: 解决+折叠的卡片, 让 click 冒泡到 card click handler (展开而非跳转)
      const card = btn.closest('.comment-thread');
      if (card?.classList.contains('is-resolved') && card?.classList.contains('is-collapsed')) {
        return;  // 不 stopPropagation, 让 card click handler 处理
      }
      e.stopPropagation();
      scrollToThread(btn.dataset.thread);
      closeAllCommentMenus();
    });
  });
  list.querySelectorAll('[data-act="resolve"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleResolved(btn.dataset.thread);
      closeAllCommentMenus();
    });
  });
  list.querySelectorAll('[data-act="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteThread(btn.dataset.thread);
      closeAllCommentMenus();
    });
  });
  // P-card: 复制引文 → 用 navigator.clipboard
  list.querySelectorAll('[data-act="copy"]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const tid = btn.dataset.thread;
      const thread = State.annotations.find(t => t.threadId === tid);
      if (!thread) return;
      const text = thread.text || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('已复制引文到剪贴板', 1500);
      } catch (err) {
        // Fallback: 临时 textarea + execCommand
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast('已复制引文', 1500); }
        catch { showToast('复制失败, 请手动选中', 2000); }
        document.body.removeChild(ta);
      }
      closeAllCommentMenus();
    });
  });
  // P-card: ⋯ 按钮 → 切换菜单显示 (同卡片的菜单互斥, 跨卡片也互斥)
  list.querySelectorAll('[data-act="toggle-menu"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tid = btn.dataset.thread;
      const menu = list.querySelector(`[data-menu-for="${tid}"]`);
      if (!menu) return;
      const isOpen = !menu.classList.contains('hidden');
      // 关掉所有其他菜单
      list.querySelectorAll('.comment-menu:not(.hidden)').forEach(m => {
        if (m !== menu) m.classList.add('hidden');
      });
      // 切换当前
      if (isOpen) menu.classList.add('hidden');
      else menu.classList.remove('hidden');
    });
  });
  // P-card: 解决后卡片可点击展开/折叠 (Word 风格)
  // 折叠状态展开优先级高于跳转 (避免 "跳到看不见的 mark" 体验)
  list.querySelectorAll('.comment-thread').forEach(el => {
    // K14 fix: card hover 高亮 doc 中对应的 mark (Word 行为: 鼠标悬停卡片 → 批注文字高亮)
    el.addEventListener('mouseenter', () => {
      const tid = el.dataset.thread;
      if (!tid) return;
      // 给 mark 临时加 hover class
      const mark = document.querySelector(`.annotation-mark[data-thread-id="${tid}"]`);
      if (mark) mark.classList.add('is-hover');
    });
    el.addEventListener('mouseleave', () => {
      const tid = el.dataset.thread;
      if (!tid) return;
      const mark = document.querySelector(`.annotation-mark[data-thread-id="${tid}"]`);
      if (mark) mark.classList.remove('is-hover');
    });
    el.addEventListener('click', e => {
      // 交互区 (按钮/textarea/details summary) 不触发
      if (e.target.closest('button') || e.target.closest('textarea') || e.target.closest('details summary')) return;
      // 解决后折叠的卡片: 第一次点击展开 (H2 fix)
      if (el.classList.contains('is-resolved') && el.classList.contains('is-collapsed')) {
        const tid = el.dataset.thread;
        if (!State.expandedThreadIds) State.expandedThreadIds = {};
        State.expandedThreadIds[tid] = true;
        renderCommentList();
        return;
      }
      // 正常卡片: 点击 → 跳转到批注处 (Word 风格: 整张卡片可点跳转)
      State.activeThreadId = el.dataset.thread;
      highlightActiveMark();
      scrollToThread(el.dataset.thread);
      renderCommentList();
    });
  });
}

// P-marks: 全局切换 helper — 改 State 后 dispatch 空 transaction 触发 Plugin 重算
function refreshDecorations() {
  if (State.editor && State.editor.view) {
    // 用 setMeta(pluginKey, state) 通知 plugin 重算 decorations
    const tr = State.editor.state.tr.setMeta(annotationBubbleKey, { allMarkup: State.showAllMarkup });
    State.editor.view.dispatch(tr);
  }
}

// P-marks: 切换 showAllMarkup
function setShowAllMarkup(val) {
  State.showAllMarkup = !!val;
  // 同步 .tiptap.no-markup class (CSS 控制 mark 高亮 + 气泡显示)
  const tiptap = document.querySelector('.tiptap');
  if (tiptap) tiptap.classList.toggle('no-markup', !State.showAllMarkup);
  // 同步 UI 控件状态
  const cb = document.querySelector('#show-all-markup');
  if (cb) cb.checked = State.showAllMarkup;
}

// P-card: 关闭所有 ⋯ 菜单
function closeAllCommentMenus() {
  document.querySelectorAll('.comment-menu:not(.hidden)').forEach(m => m.classList.add('hidden'));
}
// P-card: 全局 mousedown 检测 — 点 ⋯ 菜单外关菜单 (用 mousedown 跟其它 popover 行为一致)
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.comment-menu') && !e.target.closest('[data-act="toggle-menu"]')) {
    closeAllCommentMenus();
  }
});

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
  if (!editor) return;
  const targetTid = State.activeThreadId;
  const markType = editor.schema.marks.annotation;
  // P3-A: 不再 classList.remove/add, 而是用 setMark + dispatch 把 active attr 写进 schema
  // 这样 ProseMirror view rebuild 后 renderHTML 自然输出 is-active class.
  // 用 setMeta 标记这是 UI-only 切换, onUpdate 检测到不会标 dirty.
  // P3-A fix: 用 plugin-style 双向遍历 — 先把所有 active 标为 false, 再给 targetTid 加 true.
  // 原来的 removeMark/addMark 在同一 descendants callback 内会因 tr 已变而位置错位.
  const tr = editor.state.tr;
  let changed = false;
  // Pass 1: 清除所有 active
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    node.marks.forEach(m => {
      if (m.type !== markType) return;
      if (m.attrs.active) {
        tr.removeMark(pos, pos + node.nodeSize, markType);
        tr.addMark(pos, pos + node.nodeSize, markType.create({
          threadId: m.attrs.threadId,
          resolved: m.attrs.resolved,
          active: false,
        }));
        changed = true;
      }
    });
  });
  // Pass 2: 给 targetTid 标 active=true
  if (targetTid) {
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      node.marks.forEach(m => {
        if (m.type !== markType) return;
        if (m.attrs.threadId === targetTid && !m.attrs.active) {
          tr.removeMark(pos, pos + node.nodeSize, markType);
          tr.addMark(pos, pos + node.nodeSize, markType.create({
            threadId: m.attrs.threadId,
            resolved: m.attrs.resolved,
            active: true,
          }));
          changed = true;
        }
      });
    });
  }
  if (changed) {
    tr.setMeta('__activeMarkSync', true);
    editor.view.dispatch(tr);
  }
  // 兼容旧路径: 即便没有 change (mark 已对), 也通过 CSS 选择器兜底加 class
  // (例如首次解析侧车时还没经过 dispatch)
  const editorEl = editor.view.dom;
  editorEl.querySelectorAll('.annotation-mark').forEach(el => el.classList.remove('is-active'));
  if (targetTid) {
    editorEl.querySelectorAll(`.annotation-mark[data-thread-id="${targetTid}"]`).forEach(el => el.classList.add('is-active'));
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
  // P-card: 选区非空 (用户想新建批注) → 隐藏 mark-delete-popover, 避免遮挡 #float-comment-btn
  // 选区为空 (cursor 只在 mark 上, 想删/跳转) → 显示 mark-delete-popover
  const sel = State.editor?.state?.selection;
  if (sel && !sel.empty) {
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
  let sourceEl = $('#source-view');

  if (mode === 'source') {
    // 渲染 → 源码: 取当前 HTML → turndown → 放进 <pre>
    // P-sel: 切之前先保存当前选区 (from/to + text), 让源码视图能高亮, 切回时尝试恢复
    try {
      const sel = State.editor.state.selection;
      if (sel && !sel.empty && sel.from !== sel.to) {
        const text = State.editor.state.doc.textBetween(sel.from, sel.to, '\n', '\n');
        if (text) {
          State.savedSelection = { from: sel.from, to: sel.to, text };
        }
      }
    } catch (e) { /* 选区快照失败不影响切换 */ }
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
      // P-sel: 用户在源码里编辑了文本, saved selection 的位置失效, 清掉 (切回渲染不再尝试恢复)
      sourceEl.addEventListener('input', () => {
        if (!State.currentFile) return;
        State.currentFile.content = sourceEl.innerText;
        markDirty();
        State.savedSelection = null;
      });
      editorPane.appendChild(sourceEl);
    }
    sourceEl.innerHTML = highlightSelectionInSource(md, State.savedSelection?.text);
    tiptapEl.style.display = 'none';
    sourceEl.style.display = 'block';
    // 按钮文案: 当前是源码，点它切回渲染
    btn.dataset.mode = 'source';
    btn.title = '切换为渲染视图';
    btn.querySelector('span:last-child').textContent = '渲染';
    const selInfo = State.savedSelection
      ? `已切换 (${md.length} 字符, 选区高亮: ${State.savedSelection.text.length} 字)`
      : `已切换 (${md.length} 字符)`;
    setStatus('源码模式', selInfo);
  } else {
    // 源码 → 渲染: 把 <pre> 内容 setContent 回编辑器
    let savedText = null;
    if (sourceEl) {
      const md = sourceEl.innerText;
      // P-mark: 保留所有 mark 位置信息 (text + threadId + resolved), setContent 后重新应用
      // 不然切换源码再切回, 所有 mark 丢失 (Bug Y)
      const markSnapshots = [];
      const editor = State.editor;
      editor.state.doc.descendants((node, pos) => {
        node.marks.forEach(m => {
          if (m.type === editor.schema.marks.annotation) {
            markSnapshots.push({ threadId: m.attrs.threadId, resolved: m.attrs.resolved, text: node.text, from: pos });
          }
        });
      });
      const html = markdownToHtml(md);
      // P-sel: 记下 saved text 准备恢复 (setContent 会清空 PM doc)
      savedText = State.savedSelection?.text || null;
      State.editor.commands.setContent(html, false);
      // P-mark: setContent 后重新应用 annotation mark
      // 用 text + findTextInDoc 定位, 标 fuzzy (内容可能略变)
      // P-mark-fix: 找不到位置时, 把 ann 标 fuzzy=true (range=null), 让侧栏显示 ⚠ fuzzy banner
      if (markSnapshots.length > 0) {
        const tr = editor.state.tr;
        const markType = editor.schema.marks.annotation;
        const failedThreadIds = new Set();
        for (const snap of markSnapshots) {
          if (!snap.text) continue;
          const found = findTextInDoc(editor.state.doc, snap.text);
          if (found) {
            tr.addMark(found.from, found.from + snap.text.length, markType.create({
              threadId: snap.threadId,
              resolved: snap.resolved,
              active: false,
            }));
          } else {
            failedThreadIds.add(snap.threadId);
            console.warn(`[P-mark] mark restore 失败: text="${snap.text.slice(0,20)}..." threadId=${snap.threadId.slice(0,8)}`);
          }
        }
        tr.setMeta('__activeMarkSync', true);  // 不标 dirty
        editor.view.dispatch(tr);
        // P-mark-fix: mark 失败的 ann 在侧栏标 fuzzy (range 失效, 提醒用户检查)
        if (failedThreadIds.size > 0) {
          for (const ann of State.annotations) {
            if (failedThreadIds.has(ann.threadId)) {
              ann.fuzzy = true;
              ann.invalid = true;
              ann.invalidReason = ann.invalidReason || 'text-changed';  // 文档已改字, 位置失效
            }
          }
          renderCommentList();  // 触发 fuzzy banner 显示
        }
      }
      sourceEl.style.display = 'none';
    }
    tiptapEl.style.display = '';
    btn.dataset.mode = 'rendered';
    btn.title = '切换为源码视图';
    btn.querySelector('span:last-child').textContent = '源码';
    // P-sel: 尝试用 saved text 找回 PM pos, 恢复 setTextSelection
    let restored = false;
    if (savedText && State.savedSelection) {
      try {
        const found = findTextInDoc(State.editor.state.doc, savedText);
        if (found) {
          // 跨 cell 选区等情况 (range.to - range.from) 长度不一定等于 savedText.length,
          // 用 savedSelection 原 from/to 长度更可靠
          const len = State.savedSelection.to - State.savedSelection.from;
          const to = found.from + Math.min(len, savedText.length);
          // 关键: focus + setTextSelection 都要做, 否则浏览器不绘制选区 (activeElement 仍是按钮)
          State.editor.commands.focus(found.from, { scrollIntoView: false });
          State.editor.commands.setTextSelection({ from: found.from, to });
          restored = true;
        }
      } catch (e) { /* 恢复失败无所谓, 用户可以重新选 */ }
    }
    State.savedSelection = null;
    setStatus('渲染模式', restored ? '已切换回 WYSIWYG, 选区已恢复' : '已切换回 WYSIWYG');
  }
}

// P-sel: 在 markdown 文本中找到 savedSelectionText (首次出现), 用 <mark> 包起来
// 转义顺序: 先 escape md 文本里的 < > &, 再插入 mark 标签, 避免 XSS / 误把 markdown 标解读成 HTML
function highlightSelectionInSource(md, selectedText) {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (!selectedText || !selectedText.trim()) return escaped;
  // 同样的 escape 应用到 selectedText, 用于 indexOf
  const needle = selectedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 跨多行的 selection 文本在 <pre> 里可能含 \n, 先按段找
  const idx = escaped.indexOf(needle);
  if (idx === -1) return escaped;
  return escaped.slice(0, idx) +
    '<mark class="source-selection">' +
    escaped.slice(idx, idx + needle.length) +
    '</mark>' +
    escaped.slice(idx + needle.length);
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

// 从 .md 加载到编辑器
function loadMarkdownIntoEditor(name, content, annotationsData = null) {
  // P1 #6: 立即清掉状态栏, 避免切换文档时短暂闪旧文件名
  $('#status-right').textContent = '加载中...';
  $('#current-file-name').textContent = name;
  // D3 docx 一致性: 切文档时, 如果当前文档 dirty, 弹"是否保存" (Word 行为)
  // 注意: IDB 兜底已经防止数据丢失, 但 Word 仍会让用户主动选择
  if (State.currentFile && State.currentFile.dirty && State.currentFile.name !== name) {
    if (!confirm(`当前文档 "${State.currentFile.name}" 有未保存修改, 确定切换吗?\n(批注会保存到本地, 刷新页面可恢复)`)) {
      return false;  // 用户取消, 不切换
    }
  }
  // 如果当前是源码模式，先把 <pre> 的最新内容写回 content（避免被覆盖）
  const sourceEl = $('#source-view');
  if (State.renderMode === 'source' && sourceEl && sourceEl.style.display !== 'none') {
    content = sourceEl.innerText;
  }
  // P-reload: 如果调用方没传 annotationsData, 尝试从 IDB 缓存读取 (用户刷新前没存盘也能恢复)
  // 这是入口点的统一 fallback — 调用方 (openFilesLegacy / openFromHandle / newDocument) 不必各自处理
  if (!annotationsData) {
    // 同步读 IDB (AnnotationStore.get 是 async, 但这里我们想用 sync 接口, 改用 dispatchEvent 后重 load)
    // 改: 调用方应传 annotationsData; 如果没传, 我们直接同步 try 一次 (但 IDB 是 async, 跳过, 改用 onload)
    // 实际方案: 暴露一个 sync 缓存层 — State.idbCache = { [name]: sidecar }, 启动时一次性预热
    const cached = State.idbCache && State.idbCache[name];
    if (cached?.sidecar?.annotations) {
      annotationsData = cached.sidecar;
      console.log(`[P-reload] IDB 恢复 ${annotationsData.annotations.length} 个批注 (${name})`);
    }
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
    // P0-B fix: 单独跟踪已出现过的 threadId (实时 in-loop), 不依赖 schemaReport
    // schemaReport 把所有重复 threadId 都加进 Set, 第 1 个 ann 也会被误标 dup
    const seenThreadIds = new Set();
    for (const ann of annotationsData.annotations) {
      // 重复 threadId 标 invalid (通过实时 count 判断, 不依赖 schemaReport — 后者会把所有重复的 threadId 都加进 Set, 导致首个也被标)
      const isDuplicate = ann.threadId && seenThreadIds.has(ann.threadId);
      if (ann.threadId) seenThreadIds.add(ann.threadId);
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
          State.editor.schema.marks.annotation.create({
            threadId: ann.threadId,
            resolved: ann.resolved,
            // P-D10: load path 用 ann 作者 authorId 算 color
            authorColor: authorColorIndex((ann.comments?.[0]?.author?.id) || ann.threadId),
          })
        );
        // P-mark-fix: setMeta 避免 _validateMarksAfterEdit 清除 fuzzy 标记
        // load path 一次性 addMark 多个 ann, onUpdate 触发会清 fuzzy
        tr.setMeta('__activeMarkSync', true);
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
  $('#current-file-name').textContent = name;
  renderCommentList();
  renderOutline();
  // M15 docx 一致: status bar 实时显示字数 + 行数 (Word 行为)
  // 加载时初始化一次, 后续编辑由 onTransaction 触发 updateDocMeta 实时刷新
  setStatus('已加载', '');
  updateDocMeta({ immediate: true });  // P1 #6: 文档切换时立即刷新 status bar (不走 200ms debounce)
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
  // 同时构建 joined (textBetween) 字符串用于 prefix/suffix 算法
  const segments = [];
  doc.descendants((node, pos) => {
    if (node.isText) segments.push({ pos, text: node.text });
  });
  if (segments.length === 0) return null;
  const joined = doc.textBetween(0, doc.content.size, ' ');
  const segTotalLen = segments.reduce((sum, s) => sum + s.text.length, 0);

  // 核心查找函数: 直接在 segments 内部用 text.indexOf 找, 不依赖 joined offset 翻译
  // 优先 P0 (精确 text 唯一匹配), 降级 P1/P2/P3 (用 prefix/suffix)
  // 返回 { from, to, fuzzy } 或 null

  // findInSegments: 在所有 text node 中找 searchStr 出现位置
  // searchFromIdx: 从第 N 个 text node 开始找 (0-indexed), 用于 "跳过已匹配位置"
  // 返回: { foundNodeIdx, inSegOffset } 或 null
  const findInSegments = (searchStr, searchFromNodeIdx = 0) => {
    if (!searchStr) return null;
    for (let i = searchFromNodeIdx; i < segments.length; i++) {
      const idx = segments[i].text.indexOf(searchStr);
      if (idx !== -1) {
        return { foundNodeIdx: i, inSegOffset: idx };
      }
    }
    return null;
  };

  // 找第 N 次出现 (0-indexed): 用于多标注定位同一文本
  const findNthOccurrence = (searchStr, n) => {
    if (!searchStr) return null;
    let count = 0;
    for (let i = 0; i < segments.length; i++) {
      const text = segments[i].text;
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const idx = text.indexOf(searchStr, searchFrom);
        if (idx === -1) break;
        if (count === n) {
          return { foundNodeIdx: i, inSegOffset: idx };
        }
        count++;
        searchFrom = idx + 1;
      }
    }
    return null;
  };

  // posAtOffset: 仍需保留 (P1/P2 算法返回 joined offset, 需要翻译)
  // 关键修正: textBetween 的 ' ' 分隔只在 block 间插空格, 不在 inline 间插
  // 所以 joined = segments[0].text + (block 间空格, 数量 = blocks - 1) + segments[1].text + ...
  // 但 segments 之间不一定是 block 边界! heading 自身是一个 block,内含 1 text node
  // 所以 segments 数 = block 数, joined 用 ' ' join 完全等于 textBetween
  // 用 binary search 验证 textBetween(0, midPos, ' ') 与 joined midPos 前缀的关系
  const posAtOffset = (offset) => {
    // 二分搜索: 找 midPos 使得 doc.textBetween(0, midPos, ' ').length >= offset
    // 然后调整 midPos 使其精确
    if (offset <= 0) return segments[0]?.pos || 0;
    let lo = 0, hi = doc.content.size;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const len = doc.textBetween(0, mid, ' ').length;
      if (len < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // P1-A: 内部 helper - 返回 range 对象, fuzzy=true 表示降级匹配
  const makeRange = (from, to, fuzzy) => {
    const r = { from: posAtOffset(from), to: posAtOffset(to) };
    if (fuzzy) r.fuzzy = true;
    return r;
  };
  // === P0 精确 text 匹配 ===
  if (text) {
    const first = findInSegments(text);
    if (first) {
      // 检查 text 在整个 doc 中是否唯一 (跨 segments)
      let totalOccurrences = 0;
      for (const seg of segments) {
        let searchFrom = 0;
        while ((searchFrom = seg.text.indexOf(text, searchFrom)) !== -1) {
          totalOccurrences++;
          searchFrom += 1;
        }
      }
      const isUnique = totalOccurrences === 1;
      if (isUnique) {
        // P0 唯一, 直接返回 ProseMirror pos (精确)
        return {
          from: segments[first.foundNodeIdx].pos + first.inSegOffset,
          to: segments[first.foundNodeIdx].pos + first.inSegOffset + text.length,
          fuzzy: false,
        };
      }
      // 不唯一时, 只有在没有 prefix/suffix 才 fallback 到第一个匹配
      if (!prefix && !suffix) {
        return {
          from: segments[first.foundNodeIdx].pos + first.inSegOffset,
          to: segments[first.foundNodeIdx].pos + first.inSegOffset + text.length,
          fuzzy: false,
        };
      }
      // 有 prefix/suffix, 让 P1-P3 算法决定
    }
  }

  // === P1 prefix + suffix 拼接定位 ===
  // 直接在 segments 内部找 prefix+suffix 拼接边界
  if (prefix && suffix) {
    // 策略: 找 prefix 末 N 字符出现在哪个 segment, 然后检查 suffix 前 M 字符是否在同一段或后续段
    const pTail = prefix.slice(-5);
    const sHead = suffix.slice(0, 5);
    if (pTail && sHead) {
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        let searchFrom = 0;
        while (searchFrom < seg.text.length) {
          const pIdx = seg.text.indexOf(pTail, searchFrom);
          if (pIdx === -1) break;
          // pIdx 是 pTail 起点, text 起点 = pIdx + pTail.length
          // 但 text 在创建时可能改了, 我们用 text.length 估算 text 起点
          const estTextStart = pIdx + pTail.length;
          // 检查 sHead 是否在该 text 之后 (在同一段或后续段)
          const sSearchFromInSeg = estTextStart;
          let sIdx = seg.text.indexOf(sHead, sSearchFromInSeg);
          let sFoundSegIdx = i;
          let sFoundInSegOffset = sIdx;
          // 如果当前段没找到, 跳到下一段继续找 (sHead 可能在下一段)
          if (sIdx === -1 && i + 1 < segments.length) {
            sFoundSegIdx = i + 1;
            sFoundInSegOffset = segments[i + 1].text.indexOf(sHead);
            if (sFoundInSegOffset !== -1) {
              // sHead 在下一段开头 - 跳过 segments 间空格 (1 字符偏移)
              // text 起点跨段, 我们让 text from 落在 pTail 之后 (即使有点偏差)
              // 简化处理: 直接返回 pTail 后位置作为 from, 标 fuzzy
              return {
                from: seg.pos + estTextStart,
                to: seg.pos + estTextStart + text.length,
                fuzzy: true,
              };
            }
          } else if (sIdx !== -1) {
            // sHead 在同一段内
            return {
              from: seg.pos + estTextStart,
              to: seg.pos + estTextStart + text.length,
              fuzzy: true,
            };
          }
          searchFrom = pIdx + 1;
        }
      }
    }
  }

  // === P2 prefix 末 5 字符 + text 前缀 (跨段用 text 起点找) ===
  if (text && prefix && prefix.length >= 5) {
    const pTail = prefix.slice(-5);
    const tHead = text.slice(0, Math.min(text.length, 5));
    const combined = pTail + tHead;
    const found = findInSegments(combined);
    if (found) {
      return {
        from: segments[found.foundNodeIdx].pos + found.inSegOffset + pTail.length,
        to: segments[found.foundNodeIdx].pos + found.inSegOffset + pTail.length + text.length,
        fuzzy: true,
      };
    }
  }

  // === P3 prefix + suffix 完整拼接 ===
  if (prefix && suffix) {
    const combined = prefix + suffix;
    const found = findInSegments(combined);
    if (found) {
      return {
        from: segments[found.foundNodeIdx].pos + found.inSegOffset + prefix.length,
        to: segments[found.foundNodeIdx].pos + found.inSegOffset + prefix.length + text.length,
        fuzzy: true,
      };
    }
  }

  // === P4 全失败 ===
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
        // 同时接受 .md 和 .annotations.json, 让 user 一次选两个文件自动加载批注
        types: [{
          description: 'Markdown (.md) + 批注侧车 (.annotations.json)',
          accept: {
            'text/markdown': ['.md', '.markdown'],
            'application/json': ['.json'],
          },
        }],
        excludeAcceptAllOption: false,
      });
      if (handles.length === 0) return;
      // 分类: 主 .md + 可选 sidecar .annotations.json
      // 用户可一次选 2 个文件 (my.md + my.annotations.json), sidecar 会被加载
      const mdHandle = handles.find(h => /\.md(markdown)?$/i.test(h.name)) || handles[0];
      const sidecarHandle = handles.find(h =>
        /\.annotations\.json$/i.test(h.name) &&
        h.name.replace(/\.annotations\.json$/i, '').toLowerCase() ===
        mdHandle.name.replace(/\.md(markdown)?$/i, '').toLowerCase()
      );
      await openFromHandle(mdHandle, sidecarHandle);
      // 单 .md 模式: 持久化 handle, 直接进入 handle 模式 (可写回原位置)
      State.saveMode = 'handle';
      try { await HandleStore.putFile(mdHandle.name, mdHandle); } catch (e) { console.warn('putFile failed:', e); }
      try { await HandleStore.putLastFile(mdHandle.name); } catch (e) { console.warn('putLastFile failed:', e); }
      renderFilePaneCurrent();
      const statusMsg = sidecarHandle
        ? `${mdHandle.name} + 批注已加载`
        : `${mdHandle.name} (Ctrl+S 直接保存到原位置)`;
      // M15 docx 一致: left 显示状态信息, right 由 updateDocMeta 维护 (字数/行数/批注数)
      setStatus('已加载 · ' + statusMsg, '');
      updateDocMeta();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // 用户取消
      console.error('showOpenFilePicker 失败:', e);
      // 不弹'打开失败' (太凶), 静默 fallback 到 legacy input 让用户仍能选
    }
  }
  // Fallback: <input type="file"> (Picker 失败 / 浏览器不支持)
  await openFilesLegacy();
}

async function openFilesLegacy() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.md,.markdown,.txt,.json';  // 接受 .json 以便同时选 sidecar
  input.onchange = async () => {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    // 单 .md 模式: 只看第一个文件
    const file = files[0];
    const content = await file.text();
    // 加载批注: 1) fileList 中的 sidecar 2) IDB 本地缓存
    let annotations = await tryLoadSidecar(file.name, file);
    if (!annotations) {
      try {
        const cached = await AnnotationStore.get(file.name);
        if (cached?.sidecar?.annotations) {
          annotations = cached.sidecar;
          console.log(`[IDB] legacy 流程恢复 ${annotations.annotations.length} 个批注`);
        }
      } catch (e) { console.warn('AnnotationStore.get 失败:', e); }
    }
    // 单 .md 模式: 文件只能下载保存 (legacy fallback 没 handle)
    State.saveMode = 'download';
    renderFilePaneCurrent();
    await loadMarkdownIntoEditor(file.name, content, annotations);
    setStatus('已加载', `${file.name} (Ctrl+S 下载保存)`);
  };
  input.click();
}

// --- Folder mode removed (2026-07-05): 支持单 .md 模式 only
// (openFolder / openFolderLegacy deleted; showDirectoryPicker no longer called)

// --- 通过 FileSystemFileHandle 打开文件
async function openFromHandle(fileHandle, sidecarHandle = null) {
  const file = await fileHandle.getFile();
  const content = await file.text();
  // 加载批注: 优先级 1) 显式 sidecar handle 2) IDB 本地缓存
  const sidecarName = file.name.replace(/\.md$/i, '') + '.annotations.json';
  let annotations = null;
  if (sidecarHandle) {
    try {
      const sf = await sidecarHandle.getFile();
      annotations = JSON.parse(await sf.text());
    } catch (e) {
      showToast(`侧车 JSON 解析失败: ${e.message}`);
    }
  }
  // 兜底: IDB 本地缓存 (用户重开 .md 时, 之前保存的批注自动恢复)
  if (!annotations) {
    try {
      const cached = await AnnotationStore.get(file.name);
      if (cached && cached.sidecar && cached.sidecar.annotations) {
        annotations = cached.sidecar;
        console.log(`[IDB] 从本地缓存恢复 ${cached.sidecar.annotations.length} 个批注 (${file.name})`);
      }
    } catch (e) {
      console.warn('AnnotationStore.get 失败:', e);
    }
  }
  await loadMarkdownIntoEditor(file.name, content, annotations);
  State.currentFile.handle = fileHandle;
  // 持久化 handle (刷新后自动重连)
  try {
    await HandleStore.putFile(file.name, fileHandle);
    await HandleStore.putLastFile(file.name);
  } catch (e) { console.warn('handle persist failed:', e); }
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

// --- 文件栏渲染 (单 .md 模式): 只显示当前文件名
function renderFilePaneCurrent() {
  const tree = $('#file-tree');
  if (!tree) return;
  const name = State.currentFile?.name || '未打开文档';
  tree.classList.toggle('tree-empty', !State.currentFile);
  const isHandle = State.saveMode === 'handle';
  const badge = isHandle
    ? `<span class="save-mode-badge"><span class="badge-check">${window.MentorIcons.check}</span> 已授权</span>`
    : `<span class="save-mode-badge">${window.MentorIcons.download} 下载</span>`;
  tree.innerHTML = `<div class="tree-node tree-folder"><span class="icon icon-folder">${window.MentorIcons.folder}</span><span class="filename">${escapeHtml(name)}</span>${badge}</div>`;
  // 单文件模式下文件栏点击即重新打开 (等同于 reload)
  const handle = () => openFiles();
  tree.addEventListener('click', handle);
  // 重新应用搜索过滤 (tree-search 元素已隐藏, 安全调用)
  const searchInput = $('#tree-search');
  filterTree(searchInput ? searchInput.value : '');
}

// ============================================================
// P0-A: BroadcastChannel - 跨 tab 协调, 检测重复打开同一文件
// 防止两个标签同时编辑同一文件导致数据丢失
// ============================================================
let _docChannel = null;
let _docChannelPath = null;
let _instanceId = Math.random().toString(36).slice(2, 10);
let _docPeers = new Set();
let _docHeartbeatTimer = null;

function _getDocPath() {
  if (!State.currentFile) return null;
  return `Mentor:single/${State.currentFile.name}`;
}

function _closeDocChannel() {
  // 重定向到 timer-cleanup 版本 (line ~2902)
  if (typeof _closeDocChannelFull === 'function') return _closeDocChannelFull();
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
      const isNewPeer = !_docPeers.has(e.data.instanceId);
      _docPeers.add(e.data.instanceId);
      _docChannel.postMessage({ type: 'pong', instanceId: _instanceId });
      // 晚开 tab 的 fix: 收到新 peer 的 ping, 立即重新评估只读状态
      // 否则早开 tab 不知道自己身边还有 tab 在编辑
      if (isNewPeer) _reevaluateReadOnly();
    } else if (e.data.type === 'pong') {
      const isNewPeer = !_docPeers.has(e.data.instanceId);
      _docPeers.add(e.data.instanceId);
      if (isNewPeer) _reevaluateReadOnly();
    } else if (e.data.type === 'leave') {
      _docPeers.delete(e.data.instanceId);
      // peer 离开 → 重新评估只读状态 (可能回到可写)
      _reevaluateReadOnly();
    }
  };
  // 主动 ping, 等 300ms 看 peer
  _docChannel.postMessage({ type: 'ping', instanceId: _instanceId });
  setTimeout(_reevaluateReadOnly, 300);
  // 每 5s 心跳一次, 防止长时间 idel 后 peer set 过期 (e.g. OS 休眠)
  _docHeartbeatTimer = setInterval(() => {
    if (_docChannel) _docChannel.postMessage({ type: 'ping', instanceId: _instanceId });
  }, 5000);
}

// P0-A 修复: 任意 peer 数变化都触发重新评估 (而非只在 300ms 后一次)
function _reevaluateReadOnly() {
  const hasPeers = _docPeers.size > 0;
  if (hasPeers && !State.readOnlyMode) {
    State.readOnlyMode = true;
    showToast(`⚠ 另一标签也在编辑此文件 (${_docPeers.size} 个), 已启用只读模式 (Ctrl+S 禁用)`, 6000);
  } else if (!hasPeers && State.readOnlyMode) {
    // 所有 peer 离开 → 解除只读
    State.readOnlyMode = false;
    showToast('✓ 所有标签都已关闭, 已恢复可写模式', 3000);
  }
}

function _closeDocChannelFull() {
  // 清除心跳计时器
  if (typeof _docHeartbeatTimer !== 'undefined' && _docHeartbeatTimer) {
    clearInterval(_docHeartbeatTimer);
    _docHeartbeatTimer = null;
  }
  if (_docChannel) {
    try { _docChannel.postMessage({ type: 'leave', instanceId: _instanceId }); } catch (e) {}
    _docChannel.close();
    _docChannel = null;
    _docChannelPath = null;
  }
  _docPeers.clear();
}

// 关闭 tab 时广播 leave + 清理心跳
window.addEventListener('beforeunload', _closeDocChannelFull);

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
  const seenIds = new Map();  // threadId -> 出现次数
  // P0-B fix: 第一次出现的 threadId 合法, 后续出现的标 duplicate
  // duplicates 只装"重复出现的 threadId", 让首次出现仍走 valid 路径
  annotations.forEach((ann, i) => {
    if (!ann) {
      report.warnings.push(`第 ${i + 1} 条批注为 null`);
      return;
    }
    if (!ann.threadId) {
      report.warnings.push(`第 ${i + 1} 条批注缺 threadId`);
    } else {
      // P0-B fix: count 是进入前的次数 (之前出现几次)
      // count === 0 → 本条是首次出现, 不标 dup, 走 valid 路径
      // count >= 1 → 本条是第 2/3/... 次出现, 标 dup
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

// 文件栏空状态点击 → 打开文件 (单 .md 模式; 替代 folder mode)
function setupEmptyTreeClick() {
  const tree = $('#file-tree');
  if (!tree) return;
  const handle = () => {
    if (!tree.classList.contains('tree-empty')) return;
    openFiles();
  };
  tree.addEventListener('click', handle);
  // 键盘可达性: Enter / Space 触发
  tree.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (!tree.classList.contains('tree-empty')) return;
      e.preventDefault();
      openFiles();
    }
  });
}

async function handleTreeAction(action, name) {
  if (action === 'copy') {
    // 单 .md 模式: 只复制文件名
    const path = name;
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
    // P-1: 如果当前打开的就是这个文件且有未保存修改, 弹窗确认
    if (State.currentFile && State.currentFile.name === name && State.currentFile.dirty) {
      if (!confirm(`当前文档有未保存修改，确定重新加载 "${name}" 吗？\n\n加载后未保存的修改会丢失。`)) return;
    }
    // 单 .md 模式: 当前文件就是它, 直接 reload
    if (State.currentFile && State.currentFile.handle) {
      try {
        await openFromHandle(State.currentFile.handle);
        showToast(`已重新加载: ${name}`);
      } catch (e) {
        showToast('重新加载失败: ' + e.message);
      }
    }
    return;
  }
  if (action === 'delete') {
    showToast('单 .md 模式下请用操作系统删除文件');
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
    author: { id: State.authorId, name: State.author },
    annotations: State.annotations.map(t => ({
      threadId: t.threadId,
      text: t.text,
      // P-anchor: 保存 prefix/suffix 让重新打开时仍能定位 (P1/P2 算法依赖)
      prefix: t.prefix || '',
      suffix: t.suffix || '',
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

  // 同时存到 IDB 本地缓存 (即使下载模式, 下次重开同一 .md 也能加载批注)
  try {
    console.log('[IDB] put start:', State.currentFile.name, sidecar.annotations?.length, 'anns');
    await AnnotationStore.put(State.currentFile.name, sidecar);
    console.log('[IDB] put OK');
  } catch (e) { console.warn('[IDB] put 失败:', e); }

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
  // 单 .md 模式 (Chrome/Edge File System Access API)
  if (State.currentFile && State.currentFile.handle) {
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

  // 单 .md 模式不支持文件夹: 没 handle 就 fallback 下载

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
  renderCommentList();
  renderOutline();
  setStatus('新建空白文档');
}

// ============================================================
// 9. 作者管理
// ============================================================

// P-name: 从 authorId 派生短名 (UUID 前 8 字符, 去横线)
// 用途: State.author 为空时, 用它做"默认显示名" — 让作者有 ID 后不会显示"未设置"
function authorIdToShortName(id) {
  if (!id) return '';
  return String(id).replace(/-/g, '').slice(0, 8);
}

// P-name: 派生显示名 (display logic, 不要直接读写)
// 优先 State.author (用户设置的真名) > authorId 短名 > '未设置'
function displayName() {
  const a = (State.author || '').trim();
  if (a) return a;
  const idShort = authorIdToShortName(State.authorId);
  if (idShort) return idShort;
  return '未设置';
}

// 同步工具栏右上 author chip 显示
function renderAuthorChip() {
  const chip = document.querySelector('#author-chip');
  const name = document.querySelector('#author-chip-name');
  if (!chip || !name) return;
  const userSet = (State.author || '').trim();
  if (userSet) {
    // 用户设过名 → 显示真名, 移除 is-anonymous + is-id-derived
    name.textContent = userSet;
    chip.classList.remove('is-anonymous');
    chip.classList.remove('is-id-derived');
    chip.title = `当前作者: ${userSet}\n点击修改作者名`;
  } else {
    // P-name: author 为空但 authorId 已有 → 派生短名 (不再是"未设置")
    const idShort = authorIdToShortName(State.authorId);
    if (idShort) {
      name.textContent = idShort;
      chip.classList.remove('is-anonymous');
      chip.classList.add('is-id-derived');  // 视觉区分: 虚线边/提示"派生自 ID"
      chip.title = `当前作者: ${idShort} (从 ID 派生, 未设置显示名)\n点击设置名字`;
    } else {
      name.textContent = '未设置';
      chip.classList.add('is-anonymous');
      chip.classList.remove('is-id-derived');
      chip.title = '点击设置作者名 (留空用匿名)';
    }
  }
}

// 帮助 popover 控制
function isHelpOpen() {
  const popover = document.querySelector('#help-popover');
  return popover && !popover.classList.contains('hidden');
}
function openHelp() {
  const btn = document.querySelector('#help-btn');
  const popover = document.querySelector('#help-popover');
  if (!btn || !popover) return;
  popover.classList.remove('hidden');
  btn.classList.add('is-active');
  // 动态定位 popover + 箭头: 都用 viewport 坐标 (position: fixed)
  const popWidth = 340;
  const margin = 16;  // 距视窗边缘最小距离
  const btnRect = btn.getBoundingClientRect();
  const btnCenterX = btnRect.left + btnRect.width / 2;
  const btnBottomY = btnRect.bottom;
  // popover 水平居中对齐到按钮, 但不超出视窗
  let popLeft = btnCenterX - popWidth / 2;
  popLeft = Math.max(margin, Math.min(window.innerWidth - popWidth - margin, popLeft));
  const popTop = btnBottomY + 10;  // 按钮下方 10px
  popover.style.left = popLeft + 'px';
  popover.style.top = popTop + 'px';
  // 箭头: 相对 popover 左边缘, 对齐按钮中心
  const arrowRightFromPop = (popLeft + popWidth) - btnCenterX;
  const safe = Math.max(12, Math.min(popWidth - 20, arrowRightFromPop));
  const arrow = popover.querySelector('.help-popover-arrow');
  if (arrow) arrow.style.right = safe + 'px';
  // 让 popover 立刻响应键盘 Esc
  setTimeout(() => {
    const closeBtn = popover.querySelector('.help-popover-close');
    if (closeBtn) closeBtn.focus();
  }, 50);
}
function closeHelp() {
  const btn = document.querySelector('#help-btn');
  const popover = document.querySelector('#help-popover');
  if (!btn || !popover) return;
  popover.classList.add('hidden');
  btn.classList.remove('is-active');
  btn.focus();  // 关闭后焦点回到按钮, 方便继续按 ? 键
}
function toggleHelp() {
  if (isHelpOpen()) closeHelp();
  else openHelp();
}

// 弹作者输入框
// options.firstTime=true  -> 首次进入 (强引导, 文案不同, 不能 esc 关闭)
// options.firstTime=false -> 手动修改 (轻量, 可 esc/cancel)
function promptAuthor(options = {}) {
  const { firstTime = false } = options;
  return new Promise(resolve => {
    const modal = $('#author-modal');
    const input = $('#author-input');
    const title = $('#author-modal-title');
    const desc = $('#author-modal-desc');
    const saveBtn = $('#author-save');
    const cancelBtn = $('#author-cancel');

    // 根据场景切换文案
    if (firstTime) {
      title.textContent = '先认识一下';
      desc.textContent = '告诉 Mentor 你的名字, 之后所有批注会标注作者. 也可以留空用"匿名".';
      saveBtn.textContent = '开始使用';
      cancelBtn.style.display = '';  // 首次也允许跳过
    } else {
      title.textContent = '修改作者名';
      desc.textContent = '新的作者名将用于今后所有批注. 已存在的批注不受影响.';
      saveBtn.textContent = '保存';
      cancelBtn.style.display = '';  // 修改可取消
    }

    input.value = State.author || '';
    modal.classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);

    const close = (resolved) => {
      modal.classList.add('hidden');
      saveBtn.removeEventListener('click', saveHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
      input.removeEventListener('keydown', keyHandler);
      modal.removeEventListener('click', backdropHandler);
      renderAuthorChip();
      resolve(resolved);
    };

    const saveHandler = () => {
      const v = input.value.trim();
      // P-name: 空值不写入"匿名" (旧的硬编码), 而是清空 State.author —
      // 让 authorId 派生接管显示. 只有用户显式输入名字才覆盖.
      if (v) {
        State.author = v;
        localStorage.setItem('Mentor:author', v);
      } else {
        State.author = '';
        localStorage.removeItem('Mentor:author');
      }
      close(true);
    };
    const cancelHandler = () => close(false);
    const keyHandler = e => {
      if (e.key === 'Enter') saveHandler();
      if (e.key === 'Escape' && !firstTime) cancelHandler();  // 首次 Esc 等同"稍后设置"
    };
    const backdropHandler = e => {
      if (e.target === modal) cancelHandler();  // 点背景关闭
    };

    saveBtn.addEventListener('click', saveHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    input.addEventListener('keydown', keyHandler);
    modal.addEventListener('click', backdropHandler);
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
      version: '1', document: State.currentFile.name, updatedAt: nowISO(), author: { id: State.authorId, name: State.author },
      annotations: State.annotations.map(t => ({
        threadId: t.threadId,
        text: t.text,
        // P-anchor: 保留 prefix/suffix 让 reload 时仍能精确定位
        prefix: t.prefix || '',
        suffix: t.suffix || '',
        resolved: t.resolved,
        createdAt: t.createdAt,
        comments: t.comments,
      })),
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

  // 批注过滤 (G16: tabs 已替代 checkbox, 留 fallback)
  const filterOpenEl = $('#filter-open');
  if (filterOpenEl) {
    filterOpenEl.addEventListener('change', e => {
      State.filterOpen = e.target.checked;
      syncFilterTabsFromCheckboxes();
      renderCommentList();
    });
  }
  const filterResolvedEl = $('#filter-resolved');
  if (filterResolvedEl) {
    filterResolvedEl.addEventListener('change', e => {
      State.filterResolved = e.target.checked;
      syncFilterTabsFromCheckboxes();
      renderCommentList();
    });
  }
  // G16: filter tab click
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.filterTab;
      if (mode === 'all') { State.filterOpen = true; State.filterResolved = true; }
      else if (mode === 'open') { State.filterOpen = true; State.filterResolved = false; }
      else if (mode === 'resolved') { State.filterOpen = false; State.filterResolved = true; }
      syncFilterTabsFromCheckboxes();
      renderCommentList();
    });
  });
  // P-marks: All Markup / No Markup 切换 (Word 顶部同名按钮)
  $('#show-all-markup').addEventListener('change', e => {
    setShowAllMarkup(e.target.checked);
  });

  // 文件树收起/展开功能已移除 — 大纲栏始终显示 (Word 风格, 不能折叠)

  // 切换 渲染/源码 视图
  $('#btn-toggle-render').addEventListener('click', () => {
    setRenderMode(State.renderMode === 'rendered' ? 'source' : 'rendered');
    updateToggleBtnIcon();
  });
  updateToggleBtnIcon();  // 初始图标

  // 切换批注侧栏 (窄屏/手机备用入口)
  $('#btn-toggle-comment-pane').addEventListener('click', () => {
    document.body.classList.toggle('comment-pane-open');
  });
  // Ctrl+. 唤出/收下批注侧栏 (窄屏快捷键)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '.') {
      e.preventDefault();
      document.body.classList.toggle('comment-pane-open');
    }
  });

  // Cmd+B 快捷键已移除 (大纲栏不可折叠, 释放给未来的加粗快捷键使用)
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      // 占位: 大纲栏不可折叠, 不再 toggleFilePane
      // 如未来需要加粗快捷键, 在此处加 c.toggleBold().run();
    }
  });

  // 键盘快捷键
  document.addEventListener('keydown', e => {
    // P-key: Esc 关闭 ⋯ 菜单 (跟其他 popover 行为一致)
    if (e.key === 'Escape') {
      const hasOpenMenu = document.querySelector('.comment-menu:not(.hidden)');
      if (hasOpenMenu) {
        e.preventDefault();
        closeAllCommentMenus();
        return;
      }
    }
    // Ctrl+S / Cmd+S → 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrent();
      return;
    }
    // P-key: Ctrl+Alt+M / Cmd+Alt+M → 选区加批注 (Word 默认)
    // 选区在 paragraph/paragraph-跨段/cell/heading 已处理, 走 setupFloatCommentButton 里的 click
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      // 必须先有非空选区
      const sel = State.editor.state.selection;
      if (sel.empty) {
        setStatus('提示', '请先选中文本, 再按 Ctrl+Alt+M 加批注');
        return;
      }
      // 复用浮动按钮的 click 逻辑
      const btn = document.querySelector('#float-comment-btn button');
      if (btn) btn.click();
      return;
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

  // 帮助按钮 - 点击切换 popover
  const helpBtn = $('#help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHelp();
    });
  }
  // popover 内关闭按钮
  const helpCloseBtn = document.querySelector('#help-popover .help-popover-close');
  if (helpCloseBtn) {
    helpCloseBtn.addEventListener('click', closeHelp);
  }
  // 点外部关闭
  document.addEventListener('mousedown', (e) => {
    if (!isHelpOpen()) return;
    const popover = document.querySelector('#help-popover');
    const btn = document.querySelector('#help-btn');
    if (popover && !popover.contains(e.target) && btn && !btn.contains(e.target)) {
      closeHelp();
    }
  });
  // Esc 关闭 (全局键盘监听)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isHelpOpen()) {
      closeHelp();
      e.preventDefault();
    }
    // ? 键 (Shift+/) 切换 (但不能在输入框/可编辑元素中触发)
    if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !isHelpOpen()) {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isEditable = e.target?.isContentEditable || tag === 'input' || tag === 'textarea';
      if (!isEditable) {
        toggleHelp();
        e.preventDefault();
      }
    }
  });
}

// 编辑器光标变化时更新工具栏
function setupEditorSelectionObserver() {
  State.editor.on('selectionUpdate', updateToolbarState);
  State.editor.on('transaction', updateToolbarState);
  // M15 docx 一致: 每次 editor transaction 后 debounced 刷新 status bar (字数+行数+批注数)
  // 注意: updateDocMeta 内部已 250ms debounce, 这里不需要再 debounce
  State.editor.on('transaction', () => updateDocMeta());
}

// P3-A fix: mousedown 在 .annotation-mark 上时主动触发 PM selection + active 切换
// 问题: page.mouse.click / 真实用户点击 mark 时, PM 内部有时不会自动把 selection 移到该位置
// (尤其 mark 元素没监听 onMouseDown). 结果 State.activeThreadId 不更新, highlightActiveMark 不跑.
function setupAnnotationMarkClickObserver() {
  const editorEl = State.editor.view.dom;
  editorEl.addEventListener('mousedown', (e) => {
    const markEl = e.target.closest && e.target.closest('.annotation-mark');
    if (!markEl) return;
    const threadId = markEl.getAttribute('data-thread-id');
    if (!threadId) return;
    // 找该 threadId mark 的 pos, 用 setTextSelection 把 cursor 放进去
    const editor = State.editor;
    const markType = editor.schema.marks.annotation;
    let pos = null;
    editor.state.doc.descendants((node, p) => {
      if (pos !== null) return false;
      if (!node.isText) return;
      const m = node.marks.find(mm => mm.type === markType && mm.attrs.threadId === threadId);
      if (m) pos = p;
    });
    if (pos === null) return;
    // 把 cursor 设到该 mark 内部 (中间位置避免光标到边缘)
    const targetPos = pos + Math.floor((pos + 1 - pos) / 2) || pos;
    editor.commands.setTextSelection(targetPos);
    // 主动 set activeThreadId + dispatch highlight (兜底, 防止 selectionUpdate 没触发)
    State.activeThreadId = threadId;
    highlightActiveMark();
    renderCommentList();
  });
}

// ============================================================
// 11. 启动
// ============================================================
async function boot() {
  initEditor();
  setupToolbar();
  setupFloatCommentButton();
  setupEditorSelectionObserver();
  setupAnnotationMarkClickObserver();
  setupTreeActionDelegation();
  setupEmptyTreeClick();
  setupTreeSearch();

  // 工具栏 author chip 点击 → 弹修改 modal
  const chip = document.querySelector('#author-chip');
  if (chip) {
    chip.addEventListener('click', () => promptAuthor({ firstTime: false }));
  }
  // 首次访问: 自动生成 authorId (永不变, 用来区分同名用户)
  if (!State.authorId) {
    State.authorId = uuid();
    localStorage.setItem('Mentor:authorId', State.authorId);
  }
  // 初次同步 chip 显示
  renderAuthorChip();
  // P-marks: 同步 .tiptap.no-markup class (默认 showAllMarkup=true, 不应加 class)
  setShowAllMarkup(State.showAllMarkup);

  // P-reload: 预热 IDB 缓存 (loadMarkdownIntoEditor 同步读, 不能用 await)
  // 启动时一次性把所有缓存的 sidecar 同步到 State.idbCache
  try {
    const allKeys = await AnnotationStore.list();
    if (allKeys && allKeys.length > 0) {
      for (const entry of allKeys) {
        // entry 可能是 {name, sidecar, updatedAt} 或其他 shape, 适配
        if (entry && entry.name) {
          State.idbCache[entry.name] = { sidecar: entry.sidecar, updatedAt: entry.updatedAt };
        }
      }
      console.log(`[P-reload] IDB 预热 ${Object.keys(State.idbCache).length} 个文件`);
    }
  } catch (e) { console.warn('[P-reload] IDB 预热失败 (非阻塞):', e); }

  // 检测浏览器兼容性，状态栏提示
  const browserNote = FS_API.browserNote();
  if (browserNote) {
    setStatus('浏览器兼容性提示', browserNote);
  } else {
    setStatus('就绪', '打开或新建 .md 开始批注');
  }

  // 首次进入: 延迟 400ms 弹作者 modal (让 UI 先稳定再引导)
  const isFirstTime = !localStorage.getItem('Mentor:author');
  if (isFirstTime) {
    setTimeout(() => promptAuthor({ firstTime: true }), 400);
  }

  // 尝试自动重连上次文件
  await tryReconnect();
}

// 尝试从 IndexedDB 重连上次打开的 .md 文件
async function tryReconnect() {
  try {
    const last = await HandleStore.getLastFile();
    if (!last || !last.fileName) return;
    const handle = await HandleStore.getFile(last.fileName);
    if (!handle) return;
    // 确认权限 (用户上次授权过的文件, 多数情况仍 granted; revoke 后需要重选)
    let perm;
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); }
    catch (e) { perm = 'prompt'; }
    if (perm !== 'granted') {
      setStatus('上次文件未授权', `${last.fileName} (重新打开以授权)`);
      return;
    }
    State.saveMode = 'handle';
    await openFromHandle(handle);
    renderFilePaneCurrent();
    setStatus(`已重连 ${last.fileName}`, 'Ctrl+S 直接保存到原位置');
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
  saveCurrent,
  tryWriteBack,
  tryReconnect,
  promptAuthor,
  openFromHandle,
  openFiles,
  openFilesLegacy,
  // HTML → markdown 内部 helper（暴露给 e2e 测试 + 第三方插件使用）
  htmlToMarkdown,
  // File pane 测试 API
  fileTypeIcon,
  filterTree,
  renderFilePaneCurrent,
  handleTreeAction,
  // Compatibility shims for tests written pre-folder-removal (2026-07-05):
  // these now do nothing / no-op since renderFilePaneCurrent owns the pane
  renderFileTreeFromHandles: () => renderFilePaneCurrent(),
  renderFileTreeFromList: () => renderFilePaneCurrent(),
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
          author: { id: State.authorId, name: State.author },
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
  // 测试用: 用已知 from/to 创建批注 (绕开 findTextInDoc, 允许跨 node 选区)
  _testCreateAnnotation(from, to, text) {
    if (!from || !to || !text) return null;
    createAnnotationThread(from, to, text);
    return State.annotations[State.annotations.length - 1];
  },
  // 测试用: 直接 toggle resolved (跳过 UI)
  _testToggleResolved(threadId) {
    toggleResolved(threadId);
    return true;
  },
  // 测试用: 直接调全局 deleteThread (跳过 confirm dialog)
  _testDeleteThread(threadId) {
    const thread = State.annotations.find(t => t.threadId === threadId);
    if (!thread) return;
    // 临时改写 confirm 返回 true
    const origConfirm = window.confirm;
    window.confirm = () => true;
    try {
      deleteThread(threadId);
    } finally {
      window.confirm = origConfirm;
    }
  },
  getAnnotations: () => State.annotations,
  getEditorHTML: () => State.editor.getHTML(),
  // 当前用户身份 (id 永不变, name 可改)
  getCurrentUser: () => ({ id: State.authorId, name: State.author }),
  // P-H2: render comment list (用于测试 + 调试)
  renderCommentList: () => renderCommentList(),
  // P-reload: 同步列出所有 IDB 缓存 (返回 Object 不返回 Promise, 方便 console.log 检查)
  listAnnotations() {
    const out = {};
    for (const name of Object.keys(State.idbCache || {})) {
      // idbCache[name].sidecar.annotations (不是 .annotations)
      out[name] = ((State.idbCache[name] || {}).sidecar?.annotations || []).map(a => a.threadId);
    }
    return out;
  },
  // 兼容老 setAuthor: string 设 name; object {id, name} 设完整身份
  // P-name: 空字符串视为清空 (与 promptAuthor saveHandler 一致), 让 authorId 派生接管
  setAuthor: (arg) => {
    if (typeof arg === 'string') {
      if (arg.trim()) {
        State.author = arg;
        localStorage.setItem('Mentor:author', arg);
        // 注意: 不动 authorId. P-D10 颜色按当前 authorId 算 (稳定 ID hash).
        // 清名 → authorId 保持, 派生显示, 同色 (稳定).
      } else {
        State.author = '';
        localStorage.removeItem('Mentor:author');
        // authorId 留原值 (派生接管 — authorId 不会变, 之前用 name 派生)
      }
    } else if (arg && typeof arg === 'object') {
      if (arg.name !== undefined) {
        if (arg.name) {
          State.author = arg.name;
          localStorage.setItem('Mentor:author', arg.name);
        } else {
          State.author = '';
          localStorage.removeItem('Mentor:author');
        }
      }
      if (arg.id) {
        State.authorId = arg.id;
        localStorage.setItem('Mentor:authorId', arg.id);
      }
    }
    renderAuthorChip();
  },
};