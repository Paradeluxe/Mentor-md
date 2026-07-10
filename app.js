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
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { Node } from '@tiptap/core';
import TurndownService from 'turndown';
import JSZip from 'jszip';

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
  currentFile: null,        // { name, path, handle?, content, annotations, dirty }
  annotations: [],          // 当前文档所有批注 thread
  activeThreadId: null,     // 当前在侧栏高亮的 thread
  authorId: localStorage.getItem('Mentor:authorId') || '',   // 用户唯一 ID, 永不改变
  author: localStorage.getItem('Mentor:author') || '',       // 显示名, 可改
  // v2-resolve-btn: 默认 filter "all" — 用户解决批注后, 卡片仍可见才能点 "重新打开" 入口
  filterOpen: true,
  filterResolved: true,
  // F18: reply 草稿持久 (Word 行为: 切文档再切回草稿保留)
  // key = threadId, value = textarea 内容
  replyDrafts: {},
  // H2 fix: 解决卡片临时展开状态 (key = threadId, value = true), 仅 session 内
  expandedThreadIds: {},
  // v4-抽屉: 用户手动折叠的批注 (独立于"已解决自动折叠", docx 风格可手动收起任意卡)
  manuallyCollapsedIds: {},
  // H-undo: 批注操作 history stack
  // - 每次 push 一次"修改前快照" (深拷贝 annotations)
  // - undo: pop past → 还原; redo: pop future → 还原
  // - doc 文本撤销走 Tiptap 自带 Ctrl+Z (history: { depth: 100 }), 不入这个 stack
  history: { past: [], future: [], capacity: 100 },
  saveMode: 'unknown',      // 'handle' | 'download' | 'unknown' | 'mentor-handle' | 'mentor-download'
  readOnlyMode: false,      // P0-A: 另一 tab 在编辑时启用只读 (Ctrl+S 禁用)
  fileMtime: null,          // P0-C: 主 .md 的 mtime (last save 时记录的)
  renderMode: 'rendered',   // 'rendered' = WYSIWYG 渲染; 'source' = 显示原始 markdown 源码
  savedSelection: null,     // P-sel: { from, to, text } — rendered→source 时保存, source→rendered 时尝试恢复
  idbCache: {},             // P-reload: { [file.name]: { sidecar, updatedAt } } 启动时预热, loadMarkdownIntoEditor 同步读
  // F-media: .mentor v2 支持 media/ 子目录里的图片
  // - 打开 .mentor 时: readMentorZip 返回的 mediaFiles: Map<path, Blob>
  //   全部转成 blob URL, 写入 mediaUrls (path -> blob URL)
  // - 渲染前: markdownToHtml 用 mediaUrls 把 ![](media/x.png) 重写成 ![](blob:...)
  // - 保存时: 反查 src 把 blob URL 还原成原 path, mediaFiles 一起打进新 ZIP
  // - 切/重开文件前: revoke 所有旧 blob URL 防内存泄漏
  mediaUrls: {},            // { 'media/image5.png': 'blob:http://127.0.0.1:8765/abc-123' }
  mediaFiles: {},           // { 'media/image5.png': Blob } — save 时用, 跟当前 doc 绑定
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
  async removeLastFile() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('lastFile', 'readwrite');
      tx.objectStore('lastFile').delete('last');
      tx.oncomplete = resolve;
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
// 自定义 markdown-it 上/下标插件
// 支持 3 种语法 (优先级从高到低):
//   1. HTML 标签: <sup>text</sup> / <sub>text</sub>  (其他 md 编辑器导出风格)
//   2. 方括号语法糖: ^[text]^ / ~[text]~  (支持多字符+空格, 不与单字符语法冲突)
//   3. Pandoc 单字符: ^x^ / ~x~  (单字符/单词, 内部无空白)
// 转义:
//   \^ / \~  → 字面 ^/~
// 边界:
//   subscript 排除 ~~strike~~ (GFM 删除线)
// ============================================================

// 匹配 <sup>...</sup> 或 <sub>...</sub> 标签
const HTML_SUBSUP_RE = /^<(sup|sub)>([\s\S]*?)<\/\1>/i;

function htmlSubsupRule(state, silent) {
  const pos = state.pos;
  const tail = state.src.slice(pos, pos + 256);
  const m = tail.match(HTML_SUBSUP_RE);
  if (!m) return false;
  const tag = m[1].toLowerCase();
  const content = m[2];
  const fullMatchLen = m[0].length;
  // 安全: 标签内容不应再含 <sup>/<sub> (避免嵌套), 也避免内容含 < > 干扰
  if (/<(sup|sub)\b/i.test(content)) return false;
  if (!silent) {
    const tokenName = tag === 'sup' ? 'sup_inline' : 'sub_inline';
    const token = state.push(tokenName, '', 0);
    token.markup = tag;
    token.content = content;
  }
  state.pos = pos + fullMatchLen;
  return true;
}

function superscriptRule(state, silent) {
  const pos = state.pos;
  if (state.src[pos] !== '^') return false;
  if (pos + 1 >= state.posMax) return false;
  // 语法糖: ^[text]^ 支持多字符+空格
  if (state.src[pos + 1] === '[') {
    let end = pos + 2;
    let depth = 1;
    while (end < state.posMax && depth > 0) {
      const ch = state.src[end];
      if (ch === '\\') { end += 2; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      if (depth === 0) break;
      end++;
    }
    if (depth !== 0) return false; // 未闭合
    if (end + 1 >= state.posMax) return false;
    if (state.src[end + 1] !== '^') return false; // 闭合 ^ 缺失
    const content = state.src.slice(pos + 2, end);
    if (!content) return false; // 空内容
    if (!silent) {
      const token = state.push('sup_inline', '', 0);
      token.markup = '^[]';
      token.content = content;
    }
    state.pos = end + 2;
    return true;
  }
  // Pandoc 单字符: ^x^ (紧跟 ^ 是字符, 内部无空白)
  const next = state.src[pos + 1];
  if (/\s/.test(next)) return false;
  let end = pos + 1;
  while (end < state.posMax) {
    const ch = state.src[end];
    if (ch === '\\') { end += 2; continue; }
    if (ch === '^') break;
    if (/\s/.test(ch)) return false; // 内部含空白不算
    end++;
  }
  if (end >= state.posMax || end === pos + 1) return false;
  const content = state.src.slice(pos + 1, end);
  if (!silent) {
    const token = state.push('sup_inline', '', 0);
    token.markup = '^';
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}

function subscriptRule(state, silent) {
  const pos = state.pos;
  if (state.src[pos] !== '~') return false;
  // 排除 ~~ (GFM 删除线)
  if (state.src[pos + 1] === '~') return false;
  if (pos + 1 >= state.posMax) return false;
  // 语法糖: ~[text]~ 支持多字符+空格
  if (state.src[pos + 1] === '[') {
    let end = pos + 2;
    let depth = 1;
    while (end < state.posMax && depth > 0) {
      const ch = state.src[end];
      if (ch === '\\') { end += 2; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      if (depth === 0) break;
      end++;
    }
    if (depth !== 0) return false;
    if (end + 1 >= state.posMax) return false;
    if (state.src[end + 1] !== '~') return false; // 闭合 ~ 缺失
    if (state.src[end + 1] === '~' && state.src[end + 2] === '~') return false; // ~~ 闭合 (与删除线冲突)
    const content = state.src.slice(pos + 2, end);
    if (!content) return false;
    if (!silent) {
      const token = state.push('sub_inline', '', 0);
      token.markup = '~[]';
      token.content = content;
    }
    state.pos = end + 2;
    return true;
  }
  // Pandoc 单字符: ~x~
  const next = state.src[pos + 1];
  if (/\s/.test(next)) return false;
  let end = pos + 1;
  while (end < state.posMax) {
    const ch = state.src[end];
    if (ch === '\\') { end += 2; continue; }
    if (ch === '~') break;
    if (/\s/.test(ch)) return false;
    end++;
  }
  if (end >= state.posMax || end === pos + 1) return false;
  // 排除 ~~ 闭合 (双 ~)
  if (state.src[end + 1] === '~') return false;
  const content = state.src.slice(pos + 1, end);
  if (!silent) {
    const token = state.push('sub_inline', '', 0);
    token.markup = '~';
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}

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

// 顺序: htmlSubsup (标签) → superscript/subscript (语法糖+单字符) → math_inline
// htmlSubsup 放第一优先, 避免 <sup> 内部的 ^ 被 superscriptRule 误吞
md.inline.ruler.after('escape', 'html_subsup', htmlSubsupRule);
md.inline.ruler.after('html_subsup', 'superscript', superscriptRule);
md.inline.ruler.after('html_subsup', 'subscript', subscriptRule);
md.inline.ruler.after('subscript', 'math_inline', mathInlineRule);
md.block.ruler.after('blockquote', 'math_block', mathBlockRule, {
  alt: ['paragraph', 'reference', 'blockquote', 'list']
});
md.renderer.rules.math_inline = (tokens, idx) => {
  const tex = tokens[idx].content;
  // 用 .katex-wrapper 包裹，让 Tiptap 解析为 KatexInline node
  return `<span class="katex-wrapper" data-tex="${escapeHtml(tex)}" contenteditable="false"><span class="katex-placeholder">${escapeHtml(tex)}</span></span>`;
};
md.renderer.rules.sup_inline = (tokens, idx) => `<sup>${escapeHtml(tokens[idx].content)}</sup>`;
md.renderer.rules.sub_inline = (tokens, idx) => `<sub>${escapeHtml(tokens[idx].content)}</sub>`;
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
// Turndown 规则: <sup>/<sub> → ^x^ / ~x~
// turndown 默认会把 sup/sub 当普通 inline 元素, 输出 <sup>/<sub> HTML
// 这里显式 addRule 让其转回 Pandoc 风格 markdown, 与导入端 round-trip 一致
// 内容若含特殊字符 (^ ~ [ ] \ 空白), 用 ^[...]^ / ~[...]~ 方括号语法糖避免歧义
turndown.addRule('superscript', {
  filter: 'sup',
  replacement: (content) => {
    // 去掉 turndown 给的 trim 后的空白, 但保留内部字符原样
    const inner = content;
    if (/[\^~\\\[\]\s]/.test(inner)) return `^[${inner}]^`;
    return `^${inner}^`;
  },
});
turndown.addRule('subscript', {
  filter: 'sub',
  replacement: (content) => {
    const inner = content;
    if (/[\^~\\\[\]\s]/.test(inner)) return `~[${inner}]~`;
    return `~${inner}~`;
  },
});

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
  // mark + 气泡永远显示 (无开关). 保留 plugin state init 仅为向后兼容 setMeta 调用.
  state: {
    init() { return {}; },
    apply(tr, prev) {
      return prev;
    },
  },
  props: {
    decorations(state) {
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

// G15: 更新侧栏顶 tab 计数 (Word 风格 "5 comments")
// v2: 移除 #comment-count 总数显示 (3 个 tab 数字已说明分布)
function updateCommentCounts() {
  const all = State.annotations.length;
  const open = State.annotations.filter(a => !a.resolved).length;
  const resolved = State.annotations.filter(a => a.resolved).length;
  const allBtn = document.querySelector('[data-count-for="all"]');
  if (allBtn) allBtn.textContent = all;
  const openBtn = document.querySelector('[data-count-for="open"]');
  if (openBtn) openBtn.textContent = open;
  const resolvedBtn = document.querySelector('[data-count-for="resolved"]');
  if (resolvedBtn) resolvedBtn.textContent = resolved;
}

// G16: sync filter tabs active class (Word 风格 All/Open/Resolved tab)
function syncFilterTabsFromCheckboxes() {
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
  // F-media v1.34: status bar 显示图片渲染状态, 帮用户排查"看不到图"
  const imgs = State.editor.view?.dom?.querySelectorAll('img') || [];
  const imgCount = imgs.length;
  const imgLoaded = Array.from(imgs).filter(i => i.complete && i.naturalWidth > 0).length;
  const mediaUrlCount = Object.keys(State.mediaUrls || {}).length;
  let statusRight = `${name} · ${wordCount} 词 · ${lineCount} 行 · ${annCount} 批注`;
  if (imgCount > 0) {
    statusRight += ` · 🖼 ${imgLoaded}/${imgCount} (media=${mediaUrlCount})`;
  } else if (mediaUrlCount > 0) {
    statusRight += ` · 🖼 media=${mediaUrlCount} 但 DOM 无 img`;
  }
  $('#status-right').textContent = statusRight;
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

// ============================================================
// Autosave (handle 模式 30s 自动写回 .mentor)
// ============================================================
//
// 策略:
// - handle 模式 (mentor-handle): 每 30s 检查 dirty, 写回原 .mentor 位置
// - download 模式 (mentor-download): 不自动写 (浏览器无权限, 下载会刷屏)
// - 写盘成功 → markClean (dirty 指示器清)
// - 写盘失败 (权限 revoke 等) → 停 timer + toast, 让用户重选文件

let _autosaveTimer = null;
const AUTOSAVE_INTERVAL = 30000;  // 30 秒

function startAutosaveTimer() {
  stopAutosaveTimer();
  // 只在 handle 模式启动
  if (State.saveMode !== 'mentor-handle') return;
  if (!State.currentFile || !State.currentFile.handle) return;
  _autosaveTimer = setInterval(() => {
    autosaveNow();
  }, AUTOSAVE_INTERVAL);
  console.log('[autosave] timer started (30s interval, handle mode)');
}

function stopAutosaveTimer() {
  if (_autosaveTimer) {
    clearInterval(_autosaveTimer);
    _autosaveTimer = null;
  }
}

async function autosaveNow() {
  if (State.saveMode !== 'mentor-handle') return;
  if (!State.currentFile || !State.currentFile.handle) return;
  if (!State.currentFile.dirty) return;  // 没改动不写
  try {
    const html = State.editor.getHTML();
    const mdText = htmlToMarkdown(html);
    const sidecar = {
      version: '1',
      document: State.currentFile.name,
      updatedAt: nowISO(),
      author: { id: State.authorId, name: State.author },
      annotations: State.annotations.map(t => ({
        threadId: t.threadId,
        text: t.text,
        prefix: t.prefix || '',
        suffix: t.suffix || '',
        resolved: t.resolved,
        createdAt: t.createdAt,
        comments: t.comments,
      })),
    };
    const blob = await buildMentorZipBlob(mdText, sidecar);
    const handle = State.currentFile.handle;
    if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      await handle.requestPermission({ mode: 'readwrite' });
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    markClean();
    const time = new Date().toLocaleTimeString();
    showToast(`已自动保存 (${time})`, 2000);
    console.log(`[autosave] written at ${time}`);
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
      console.warn('[autosave] 权限被拒, 停 timer');
      showToast('自动保存失败: 文件权限被撤销, 请重新打开', 3000);
      stopAutosaveTimer();
    } else {
      console.warn('[autosave] 写盘失败:', e);
    }
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
      StarterKit,  // 默认配置 (history depth 100, 已够用)
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
      Superscript,
      Subscript,
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
      // v1.37: 用户在编辑 PM doc 时的 doc 跟踪 - 通过 PM 自己的 history plugin 处理
      // (这里只 markDirty + 同步侧栏/大纲/mark 验证, 不主动 pushHistory)
      // 之前尝试在 onUpdate 自动 pushHistory 是错的: pushHistory 拍的是 *已应用* 的 tr 后的 state,
      // 多次连续编辑时栈顶和次顶 docText 相同 (snap 是 current state), undo 无效果
      // 正确做法: PM 文本编辑走 ProseMirror 自带 history plugin, 我们 my-history 专管批注 ops
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
  // P-h: 选区在 heading 节点内 → v2.1: 仍允许批注 (heading 也是 textblock)
  // 旧版 reject heading 选区 — 但跨 heading + paragraph 的多段选区需要支持
  // 后面 nodesBetween + isTextblock 处理会涵盖

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
    } else if (($from.parent.type.name === 'paragraph' && $to.parent.type.name === 'paragraph')
            || ($from.parent.type.name === 'heading' && $to.parent.type.name === 'heading')
            || ($from.parent.type.name === 'heading' && $to.parent.type.name === 'paragraph')
            || ($from.parent.type.name === 'paragraph' && $to.parent.type.name === 'heading')) {
      // 跨 textblock 选区 (含 heading + paragraph 组合): 不 reject, 让 handleCreateMultiParagraphAnnotation 后续处理
      // 按钮继续显示 (定位到 from 上沿)
    } else {
      // 其他跨 block (list item, blockquote, codeBlock 跨段) → reject
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

// Pane resizer (左/右栏宽度拖拽)
function setupPaneResizer() {
  const main = $('#main');
  if (!main) return;

  // 配置: paneId, CSS var 名, localStorage key, min, max, 拖动方向
  // 拖右 = 增宽 (右栏); 拖左 = 增宽 (左栏)
  const panes = [
    { paneId: 'comment-pane', varName: '--comment-pane-width', lsKey: 'Mentor:commentPaneWidth', min: 220, max: 900, dir: -1 },
    { paneId: 'file-pane',    varName: '--outline-pane-width', lsKey: 'Mentor:outlinePaneWidth', min: 160, max: 700, dir:  1 },
  ];

  panes.forEach(cfg => {
    const resizer = document.querySelector(`[data-pane-resize="${cfg.paneId === 'file-pane' ? 'outline' : 'comment'}"]`);
    const pane = document.getElementById(cfg.paneId);
    if (!resizer || !pane) return;

    // 恢复上次保存的宽度
    try {
      const saved = localStorage.getItem(cfg.lsKey);
      if (saved) {
        const w = parseInt(saved, 10);
        if (w >= cfg.min && w <= cfg.max) {
          main.style.setProperty(cfg.varName, w + 'px');
        }
      }
    } catch (e) { /* ignore */ }

    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    const onDown = (e) => {
      dragging = true;
      startX = e.clientX;
      startWidth = pane.getBoundingClientRect().width;
      resizer.classList.add('is-dragging');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = (e.clientX - startX) * cfg.dir;  // cfg.dir: -1 (右栏) / +1 (左栏)
      const w = Math.max(cfg.min, Math.min(cfg.max, startWidth + dx));
      main.style.setProperty(cfg.varName, w + 'px');
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const cur = main.style.getPropertyValue(cfg.varName);
      if (cur) {
        try { localStorage.setItem(cfg.lsKey, cur); } catch (e) { /* ignore */ }
      }
    };

    resizer.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
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
    // 判断是不是跨 textblock 多行选区 (PM 标记无法跨 block, 我们对每段各打 mark 共享 threadId)
    // v2.1: 任何 textblock 组合 (paragraph + heading + ...) 都走多段路径
    const { from, to } = sel;
    if (from === to) return;
    const $from = State.editor.state.doc.resolve(from);
    const $to = State.editor.state.doc.resolve(to);
    if ($from.parent !== $to.parent && $from.parent.isTextblock && $to.parent.isTextblock) {
      handleCreateMultiParagraphAnnotation(from, to);
      return;
    }
    const text = State.editor.state.doc.textBetween(from, to, ' ');
    // v2: 不再弹作者 modal 拦截用户, 没作者直接以匿名创建批注 (作者可后改)
    // 老逻辑: !State.author → 弹 modal → then() 再创建 → 用户点不动浮按钮
    createAnnotationThread(from, to, text);
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
  // v2: 不再弹作者 modal, 没作者时第一行 addReply 自动从 State.authorId 派生显示
  // 老逻辑: !State.author → 弹 modal → 用户卡死
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
  pushHistory();
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
  // v2: 不弹作者 modal, 无作者直接匿名创建
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
  pushHistory();
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
  // v2: 不弹作者 modal, 无作者直接匿名创建
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
    // v2.1: 任何 textblock (paragraph / heading / blockquote / listItem / codeBlock) 都参与
    // 旧版只匹配 paragraph → heading 跨段被漏
    if (node.isTextblock) {
      const blockStart = pos;
      const blockEnd = pos + node.nodeSize;
      const textStart = blockStart + 1;  // first text position (inclusive)
      const textEnd = blockEnd - 1;     // last text position (inclusive)
      const rFrom = Math.max(from, textStart);
      // PM addMark 限制: rTo 不能跨过 paragraph close token (textEnd + 1 = blockEnd)
      // 所以 rTo 必须 ≤ textEnd
      const rTo = Math.min(to, textEnd + 1);
      // 只要这段 textblock 跟选区有重叠, 就记录一个 range
      // (即使 rFrom == rTo, 仍代表该 block 被"覆盖"了 - 哪怕只是边界)
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
  pushHistory();
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
  pushHistory();
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
  pushHistory();
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
  // H-undo: 删之前 push, 让用户能 undo 回退
  // (注: confirm 弹窗期间如果用户取消, pushHistory 已被旧版本的副作用污染, 但这没问题 — 实际不修改)
  // 修正: confirm 后再 push, 避免取消时污染 history
  const thread = State.annotations.find(t => t.threadId === threadId);
  if (!thread) return;
  pushHistory();
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
  // v2: 严格按 filter 过滤, 不再 pin activeThread.
  // 旧逻辑会把 "已点开过但当前 tab 不显示" 的 active 强制塞回来,
  // 在 tab 切换时给用户造成 "切到已解决 tab 却看到未解决卡片" 的假象.
  const filtered = State.annotations.filter(t => {
    if (State.filterOpen && !State.filterResolved && t.resolved) return false;
    if (State.filterResolved && !State.filterOpen && !t.resolved) return false;
    return true;
  });

  // F7 docx 一致: 侧栏按 doc 位置排序 (Word 行为), range.from 升序
  // invalid/fuzzy ann (range=null) 排在最后
  const sorted = [...filtered].sort((a, b) => {
    if (a.range == null && b.range == null) return 0;
    if (a.range == null) return 1;
    if (b.range == null) return -1;
    return a.range.from - b.range.from;
  });
  const visibleThreads = sorted;

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
    // v2: 不再 pin activeThread (renderCommentList 已不再做强制显示)
    // F20 docx 一致: 侧栏 thread 加数字标号 (Word 风格 1, 2, 3)
    const number = idx + 1;
    // P-card: 解决后默认折叠 (Word 风格), 只显示 quote + meta 一行. 通过 collapsed class 控制.
    // H2 fix: 解决后点击展开 (临时 expanded 状态, 不持久).
    const isCollapsed = thread.resolved && !State.expandedThreadIds?.[thread.threadId] || !!State.manuallyCollapsedIds?.[thread.threadId];
    // v4: 手动折叠按钮图标 — 已解决(自动折叠)/手动折叠 都显示"展开↘"; 展开时显示"收起↗"
    return `
      <div class="comment-thread ${isActive ? 'is-active' : ''} ${thread.resolved ? 'is-resolved' : ''} ${thread.fuzzy ? 'is-fuzzy' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-thread="${thread.threadId}">
        ${thread.fuzzy ? '<div class="fuzzy-banner">⚠ 位置可能偏移 - 请检查文档</div>' : ''}
        <!-- 卡片头: 序号 + 引文 (可点击跳转) + ⋯ 菜单按钮 -->
        <!-- v5: 点击卡片标题区域 = 折叠/展开 (用户明确要求). 跳转正文走 ⋯ 菜单 "📍 跳转到批注处" -->
        <div class="comment-quote" data-thread="${thread.threadId}" title="点击收起/展开批注">
          <span class="comment-number-badge" data-number="${number}" title="批注 #${number}">${number}</span>
          <span class="comment-quote-text">${escapeHtml((thread.text || '').slice(0, 200))}${(thread.text || '').length > 200 ? '…' : ''}</span>
          <!-- v3: 解决按钮在折叠状态下显示在 header, 展开状态下显示在 form-actions 底部 -->
          <button class="comment-resolve-btn comment-resolve-btn--header ${thread.resolved ? 'is-resolved' : ''}" data-act="resolve" data-thread="${thread.threadId}" title="${thread.resolved ? '重新打开此批注' : '标记为已解决'}" aria-label="${thread.resolved ? '重新打开' : '标记为已解决'}">${thread.resolved ? '↺' : '✓'}</button>
          <button class="comment-menu-btn" data-act="toggle-menu" data-thread="${thread.threadId}" title="更多操作" aria-label="更多操作">⋯</button>
        </div>
        <!-- ⋯ 弹窗菜单 (默认 hidden) — v6: SVG icons, 不用 emoji -->
        <div class="comment-menu hidden" data-menu-for="${thread.threadId}">
          <button data-act="goto" data-thread="${thread.threadId}">
            <span class="menu-icon menu-icon-goto"></span>
            <span class="menu-label">跳转到批注处</span>
          </button>
          <button data-act="resolve" data-thread="${thread.threadId}">
            <span class="menu-icon menu-icon-resolve"></span>
            <span class="menu-label">${thread.resolved ? '重新打开' : '标记为已解决'}</span>
          </button>
          <button data-act="copy" data-thread="${thread.threadId}">
            <span class="menu-icon menu-icon-copy"></span>
            <span class="menu-label">复制引文</span>
          </button>
          <div class="menu-sep"></div>
          <button data-act="delete" data-thread="${thread.threadId}" class="menu-danger">
            <span class="menu-icon menu-icon-delete"></span>
            <span class="menu-label">删除批注</span>
          </button>
        </div>
        <!-- 卡片体: 默认收起 (解决后), active 时展开. 用 details 保留原生折叠能力 -->
        <div class="comment-body-wrap">
          <div class="comment-item">
            <div class="comment-meta">
              <span class="comment-avatar" style="background:${avatarColor(authorName(first.author))}">${escapeHtml(avatar(authorName(first.author)))}</span>
              <span class="comment-author">${escapeHtml(authorName(first.author))}</span>
              <span class="comment-time" title="${escapeHtml(first.createdAt || '')}">${formatTime(first.createdAt)}</span>
            </div>
            ${first.body ? `<div class="comment-body">${escapeHtml(first.body)}</div>` : ''}
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
            <!--
              输入框永远在卡片末尾 (docx 风格, 对话往下追加)
              - 首条未写: placeholder "开始批注..." (新建第一句)
              - 首条已写: placeholder "回复..." (后续追加)
            -->
            <div class="comment-reply-form">
              <textarea data-thread-input="${thread.threadId}" placeholder="${first.body ? '回复...' : '开始批注...'}" autocomplete="off"></textarea>
              <!-- v3: 解决按钮放到 reply 区底部与提交同行 (docx 风格: 次要操作左, 主操作右) -->
              <div class="form-actions">
                <button class="comment-resolve-btn ${thread.resolved ? 'is-resolved' : ''}" data-act="resolve" data-thread="${thread.threadId}" title="${thread.resolved ? '重新打开此批注' : '标记为已解决'}" aria-label="${thread.resolved ? '重新打开' : '标记为已解决'}">${thread.resolved ? '↺ 重新打开' : '✓ 解决'}</button>
                <button data-act="submit-reply" data-thread="${thread.threadId}" class="primary" disabled title="输入内容后可提交 (Ctrl+Enter)">提交</button>
              </div>
            </div>
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
    // v2: 草稿恢复后立刻同步 submit 按钮 disabled (避免渲染后看到禁用按钮但 textarea 有内容)
    const _initBtn = list.querySelector(`[data-act="submit-reply"][data-thread="${tid}"]`);
    if (_initBtn) _initBtn.disabled = !ta.value.trim();
    ta.addEventListener('input', () => {
      State.replyDrafts[tid] = ta.value;
      // v2: 同步 submit 按钮 disabled (空内容 → 禁用)
      const btn = list.querySelector(`[data-act="submit-reply"][data-thread="${tid}"]`);
      if (btn) btn.disabled = !ta.value.trim();
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
      // v6: 标题区域 → 折叠/展开; 正文区域 (body-wrap) → 跳转正文
      const tid = el.dataset.thread;
      if (e.target.closest('.comment-quote')) {
        toggleManualCollapse(tid);
        closeAllCommentMenus();
        renderCommentList();
      } else if (e.target.closest('.comment-body-wrap')) {
        scrollToCommentText(tid);
      }
    });
  });
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

// v17: 标题区域 click → 折叠/展开
// 已解决卡片 isCollapsed = resolved && !expandedThreadIds[tid], 手动折叠任意卡也是 collapsed
// 解决"打不开" bug: 点已解决卡 → 总是设 expandedThreadIds[tid]=true; 点未解决卡 → toggle manuallyCollapsedIds
function toggleManualCollapse(tid) {
  const thread = State.annotations.find(t => t.threadId === tid);
  if (thread?.resolved) {
    // 已解决: toggle expandedThreadIds (确保"打不开"修复)
    if (!State.expandedThreadIds) State.expandedThreadIds = {};
    if (State.expandedThreadIds[tid]) {
      delete State.expandedThreadIds[tid];
    } else {
      State.expandedThreadIds[tid] = true;
    }
    // 同步清掉 manuallyCollapsedIds (避免冲突)
    delete State.manuallyCollapsedIds[tid];
  } else {
    // 未解决: toggle manuallyCollapsedIds
    if (State.manuallyCollapsedIds[tid]) {
      delete State.manuallyCollapsedIds[tid];
    } else {
      State.manuallyCollapsedIds[tid] = true;
    }
  }
}

function scrollToCommentText(tid) {
  State.activeThreadId = tid;
  highlightActiveMark();
  scrollToThread(tid);
  renderCommentList();
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
// F-media: 第二参数可选 mediaUrls { 'media/x.png': 'blob:http://...' }
// 渲染前把 ![](media/x.png) 的 src 重写成 blob URL, 让浏览器能解析
// (相对路径在 sandbox 里没 base 解析不到)
function markdownToHtml(mdText, mediaUrls) {
  let text = mdText;
  if (mediaUrls && Object.keys(mediaUrls).length > 0) {
    // 替换 ![alt](media/path) → ![alt](blob URL); 只对 src 段做精确匹配,
    // 避免误伤正文里的 [text](url) 链接
    text = text.replace(/!\[([^\]]*)\]\((media\/[^)\s]+)\)/g, (m, alt, src) => {
      const blobUrl = mediaUrls[src];
      return blobUrl ? `![${alt}](${blobUrl})` : m;
    });
  }
  return md.render(text);
}

// F-media: 释放旧 doc 的所有 blob URL, 切/重开文件前调用防内存泄漏
function revokeMediaUrls() {
  for (const url of Object.values(State.mediaUrls || {})) {
    try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
  }
  State.mediaUrls = {};
  State.mediaFiles = {};
}

// --- HTML → markdown (turndown)
function htmlToMarkdown(html) {
  // turndown 默认会丢 mark，先去掉 annotation-mark 标签，保留内部文本
  html = html.replace(/<span[^>]*data-thread-id[^>]*>(.*?)<\/span>/gs, '$1');
  return turndown.turndown(html);
}

// F-media: htmlToMarkdown 的包装, 在 turndown 之前把 <img src="blob:...">
// 反查回 'media/image5.png', 保证 markdown 源码里仍是相对路径
// (不打回去会让用户存了 .mentor 后, 下一台机器看到 blob:... 失效)
// url → path 反向表: State.mediaUrls (path -> blob URL) 反过来构造 (URL -> path)
function htmlToMarkdownMedia(html) {
  // turndown 默认会丢 mark，先去掉 annotation-mark 标签
  html = html.replace(/<span[^>]*data-thread-id[^>]*>(.*?)<\/span>/gs, '$1');
  if (State.mediaUrls && Object.keys(State.mediaUrls).length > 0) {
    // 反查表
    const reverseMap = {};
    for (const [path, blobUrl] of Object.entries(State.mediaUrls)) {
      reverseMap[blobUrl] = path;
    }
    // 替换 <img src="blob:..."> 为 <img src="media/...">
    html = html.replace(/<img([^>]*?)src=("|')(blob:[^"']+)\2/gi, (m, attrs, q, blobUrl) => {
      const path = reverseMap[blobUrl];
      return path ? `<img${attrs}src=${q}${path}${q}` : m;
    });
  }
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

  const rows = items;

  pane.innerHTML = rows.map(it =>
    `<div class="outline-item outline-h${it.level}" data-pos="${it.pos}" title="${escapeHtml(it.text)}">` +
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

// ============================================================
// History stack (undo/redo for annotation operations)
// ============================================================
//
// 数据结构: State.history = { past: [], future: [], capacity: 100 }
// 每条 snapshot = { annotations: 深拷贝数组, ts: 时间戳 }
// 不存 md 文本 — md 文本不变, annotations 是 source of truth
// doc 内 annotation mark 在 restoreFromSnapshot 时重建 (rebuildAnnotationMarks)

function deepCloneAnnotations(arr) {
  return JSON.parse(JSON.stringify(arr));
}

// 修改 annotations 前调用: 推入 past, 清空 future
function pushHistory() {
  // v1.37 fix: 同时快照 PM doc 里所有 annotation marks 的物理位置
  // 这样 undo 时, 如果 State.annotations 里的 range stale (跟 PM doc 当前位置对不上),
  // 仍能用 markSnapshot 找回来 — 解决 "完全删除后 ctrl z 丢失批注" 问题
  // (用户报: delete thread → undo → thread 数据在但 mark 丢了, 或 thread+mark 都丢)
  const markSnapshot = snapshotAnnotationMarks();
  State.history.past.push({
    annotations: deepCloneAnnotations(State.annotations),
    markSnapshot,
    ts: Date.now(),
  });
  if (State.history.past.length > State.history.capacity) {
    State.history.past.shift();
  }
  State.history.future = [];
  updateHistoryButtons();
}

// F-media: 从 PM doc 物理扫描所有 annotation marks, 输出 [{threadId, from, to}]
function snapshotAnnotationMarks() {
  const ed = State.editor;
  if (!ed) return [];
  const result = [];
  const markType = ed.schema.marks.annotation;
  if (!markType) return [];
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    node.marks.forEach(m => {
      if (m.type === markType && m.attrs.threadId) {
        // 注意: text node 的 pos + nodeSize = 该 text node 末尾. mark span 跨多个 text node 时记录每个.
        result.push({ threadId: m.attrs.threadId, from: pos, to: pos + node.nodeSize, resolved: !!m.attrs.resolved });
      }
    });
  });
  return result;
}
function undo() {
  if (State.history.past.length === 0) return false;
  // 1. 当前状态推入 future (给 redo 用) — 同时存 markSnapshot
  State.history.future.push({
    annotations: deepCloneAnnotations(State.annotations),
    markSnapshot: snapshotAnnotationMarks(),
    ts: Date.now(),
  });
  if (State.history.future.length > State.history.capacity) {
    State.history.future.shift();
  }
  // 2. 弹出 past 最后一个, 还原
  const prev = State.history.past.pop();
  restoreFromSnapshot(prev);
  return true;
}

function redo() {
  if (State.history.future.length === 0) return false;
  // 1. 当前状态推入 past — 同时存 markSnapshot
  State.history.past.push({
    annotations: deepCloneAnnotations(State.annotations),
    markSnapshot: snapshotAnnotationMarks(),
    ts: Date.now(),
  });
  if (State.history.past.length > State.history.capacity) {
    State.history.past.shift();
  }
  // 2. 弹出 future, 还原
  const next = State.history.future.pop();
  restoreFromSnapshot(next);
  return true;
}

function restoreFromSnapshot(snap) {
  State.annotations = snap.annotations;
  // v1.37 fix: 优先用 markSnapshot 重建 mark (PM 物理位置快照, 跟 annotations 是两个 source of truth)
  // 旧实现只按 annotations.range 重建, range 越界或 stale 时 mark 重建失败 — 用户报的"丢失批注"症状
  // markSnapshot 是 pushHistory 当时的 PM 物理位置, 总是跟 doc 同步
  rebuildAnnotationMarks(snap.markSnapshot);
  renderCommentList();
  markDirty();
  updateHistoryButtons();
}

// 清空所有 annotation mark, 按 State.annotations 或 markSnapshot 重建
// v1.37: 优先用 markSnapshot (PM 物理位置快照), 没有则用 State.annotations.range 兜底
// 解决 "deleteThread + undo 丢失批注" 根因: 旧逻辑只信 annotations.range, 没考虑 PM doc 物理位置
// v1.37 redo 修复: cross-check State.annotations.threadId, 防止 redo 删 thread 后仍
// 通过 stale markSnapshot 加 mark (threadId 已不存在)
function rebuildAnnotationMarks(markSnapshot) {
  const ed = State.editor;
  if (!ed) return;
  const markType = ed.schema.marks.annotation;
  if (!markType) return;
  const docSize = ed.state.doc.content.size;
  let tr = ed.state.tr;
  // 1. 清掉所有 annotation mark
  tr = tr.removeMark(0, docSize, markType);

  // v1.37 redo fix: 收集当前有效的 threadId (避免对已删 thread 加游离 mark)
  const validThreadIds = new Set();
  State.annotations.forEach(t => { if (t.threadId) validThreadIds.add(t.threadId); });

  // 2. 重建 mark — 优先 markSnapshot, fallback 用 ann.range
  const rebuilt = [];  // [{threadId, from, to}] 已成功加入
  const seen = new Set();  // 避免重复 addMark 同一 threadId 同一 range

  const tryAdd = (threadId, from, to, resolved) => {
    if (!threadId) return false;
    if (!validThreadIds.has(threadId)) return false;  // v1.37 redo fix: thread 已被删, 别加 mark
    if (from < 0 || to > docSize || from >= to) return false;
    if (seen.has(`${threadId}:${from}-${to}`)) return false;
    const attrs = { threadId, resolved: !!resolved };
    tr = tr.addMark(from, to, markType.create(attrs));
    seen.add(`${threadId}:${from}-${to}`);
    rebuilt.push({ threadId, from, to });
    return true;
  };

  // Pass 1: markSnapshot (推荐路径, 总是跟 PM 物理位置对得上)
  if (Array.isArray(markSnapshot) && markSnapshot.length > 0) {
    markSnapshot.forEach(snap => {
      tryAdd(snap.threadId, snap.from, snap.to, snap.resolved);
    });
  } else {
    // Pass 2 fallback: 旧路径 — 用 State.annotations.range
    State.annotations.forEach(t => {
      if (!t.range) return;
      tryAdd(t.threadId, t.range.from, t.range.to, t.resolved);
    });
  }

  if (rebuilt.length === 0 && State.annotations.length > 0) {
    console.warn(`[rebuildAnnotationMarks] 所有 ${State.annotations.length} 个 thread 都未重建 mark (snapshot 空 + range 越界 或 thread 已删)`);
  }
  ed.view.dispatch(tr);
  return rebuilt;
}

// 工具栏 undo/redo 按钮的 disabled 状态
function updateHistoryButtons() {
  const undoBtn = $('#btn-undo');
  const redoBtn = $('#btn-redo');
  if (undoBtn) undoBtn.disabled = State.history.past.length === 0;
  if (redoBtn) redoBtn.disabled = State.history.future.length === 0;
}

// 加载新文件 / 新建文档时重置 history (切文件不应该继承旧 history)
function resetHistory() {
  State.history.past = [];
  State.history.future = [];
  updateHistoryButtons();
}

// 从 .md 加载到编辑器
function loadMarkdownIntoEditor(name, content, annotationsData = null) {
  // P1 #6: 立即清掉状态栏, 避免切换文档时短暂闪旧文件名
  $('#status-right').textContent = '加载中...';
  // H-autosave: 切文件停旧 timer (新文件 loadMarkdownIntoEditor 后会按 saveMode 重启)
  stopAutosaveTimer();

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
  const html = markdownToHtml(content, State.mediaUrls);
  // Tiptap 的 setContent 会解析 HTML
  State.editor.commands.setContent(html, false);
  // 如果是源码模式，把新内容同步到 <pre>（而不是 setContent 进编辑器）
  if (State.renderMode === 'source') {
    const md = htmlToMarkdown(html);
    sourceEl.innerText = md;
  }
  // 重置批注
  State.annotations = [];
  // H-undo: 切文件清空 history (旧 history 不属于新文档)
  resetHistory();
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
  // v2.1: 支持跨 block 选区 (2 行正文 + 一级标题) — text 含空格
  //   跨 block 时 ProseMirror 没有跨 block 的 text node, 但 joined 字符串用 ' ' 连接
  //   所以 text 在 joined 里能 indexOf 到, 用 posAtOffset 转 PM pos
  if (text) {
    // 先用单段 P0 (快路径): text 在某一段内完整
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
    } else {
      // 单段内找不到 → 跨 block 选区 (text 含空格)
      // 在 joined 字符串里找 (textBetween 用 ' ' 分 block, 跟 textBetween 选区版一致)
      const firstIdx = joined.indexOf(text);
      if (firstIdx !== -1) {
        // 检查 joined 中 text 出现次数 (避免多匹配)
        let totalOccurrences = 0;
        let searchFrom = 0;
        while ((searchFrom = joined.indexOf(text, searchFrom)) !== -1) {
          totalOccurrences++;
          searchFrom += 1;
        }
        const isUnique = totalOccurrences === 1;
        if (isUnique) {
          // P0 跨 block 唯一, 用 posAtOffset 转 PM pos
          const from = posAtOffset(firstIdx);
          const to = posAtOffset(firstIdx + text.length);
          return { from, to, fuzzy: false };
        }
        // 不唯一时, 用 prefix/suffix 帮助 (P1 跨段 fallback 已有)
        // 不在这里做 — 让下面的 P1 算法处理
      }
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
        // v2 锁死 .mentor: 旧 .md + .json 侧车不再从文件选择器进入, 避免半新半旧体验
        types: [{
          description: 'Mentor 单文件包 (.mentor)',
          accept: {
            'application/zip': ['.mentor'],
          },
        }],
        excludeAcceptAllOption: false,
      });
      if (handles.length === 0) return;
      // 分类: 主 .md / .mentor + 可选 sidecar .annotations.json
      // .mentor 是自包含单文件, 优先于 .md + .json 组合
      const mentorHandle = handles.find(h => /\.mentor$/i.test(h.name));
      if (mentorHandle) {
        // H-autosave: 先设 saveMode 再调 openFromMentorHandle, 让内部 startAutosaveTimer 能正确启动
        State.saveMode = 'mentor-handle';
        await openFromMentorHandle(mentorHandle);
        try { await HandleStore.putFile(mentorHandle.name, mentorHandle); } catch (e) { console.warn('putFile failed:', e); }
        try { await HandleStore.putLastFile(mentorHandle.name); } catch (e) { console.warn('putLastFile failed:', e); }
        renderFilePaneCurrent();
        setStatus('已加载 .mentor 包', `${mentorHandle.name} (Ctrl+S 直接写回原位置)`);
        updateDocMeta();
        return;
      }
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
  input.accept = '.mentor';  // v2 锁死: 文件选择器只接受 .mentor 单文件包
  input.onchange = async () => {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    // 单 .mentor 模式: 自包含包优先 (先用扩展名快速判定, 不匹配再用魔数)
    let mentorFile = files.find(f => /\.mentor$/i.test(f.name));
    if (!mentorFile) {
      // 兜底: 用魔数检测 (用户改后缀的情况) — 顺序 await, 不在 find 里
      for (const f of files) {
        if (await isMentorZip(f)) { mentorFile = f; break; }
      }
    }
    if (mentorFile) {
      await openFromMentorFile(mentorFile);
      return;
    }
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

// --- 通过 FileSystemFileHandle 打开 .mentor 单文件包
async function openFromMentorHandle(fileHandle) {
  const file = await fileHandle.getFile();
  const { mdText, annotations, mediaFiles } = await readMentorZip(file);
  // F-media v1.36 fix: openFromMentorHandle 之前漏注入 mediaUrls — DOM img 是裸 markdown 路径
  // (e.g. <img src="media/image5.png">) ,请求 server /media/ 路径 404 → 图全破图.
  // 现在: revMediaUrls + 注入 State.mediaUrls/State.mediaFiles, 跟 openFromMentorFile 对齐.
  revokeMediaUrls();
  for (const [path, blob] of Object.entries(mediaFiles || {})) {
    State.mediaUrls[path] = URL.createObjectURL(blob);
    State.mediaFiles[path] = blob;
  }
  console.log('[F-media v1.36 handle fix] mediaFiles count=', Object.keys(mediaFiles || {}).length, 'mediaUrls count=', Object.keys(State.mediaUrls).length);
  await loadMarkdownIntoEditor(file.name, mdText, annotations);
  State.currentFile.handle = fileHandle;  // 写回原 .mentor 位置用
  // v1.37: 检测 corrupt .mentor (markdown 引 blob URLs 但 zip 无 media/), 给用户 toast
  const mediaCount = Object.keys(mediaFiles || {}).length;
  const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length;
  if (mediaCount === 0 && blobUrlCount > 0) {
    showToast(`⚠ .mentor 损坏: ${blobUrlCount} 张图引用失效 (zip 无 media/). 用 Pandoc 重新 generate 文档`, 8000);
    setStatus('图全部失效', `${blobUrlCount} 张图引用 blob: URL 失效 — 这份 .mentor 没有 media/ 子目录`);
  }
  try {
    await HandleStore.putFile(file.name, fileHandle);
    await HandleStore.putLastFile(file.name);
  } catch (e) { console.warn('mentor handle persist failed:', e); }
  // H-autosave: handle 模式启动 30s 自动写盘
  startAutosaveTimer();
}

// --- 文件类型专属图标 (Cursor 风格 - 统一 SVG 图标库)
function fileTypeIcon(name) {
  if (/\.(md|markdown)$/i.test(name)) return { glyph: window.MentorIcons.fileMd, cls: 'icon-md' };
  if (/\.json$/i.test(name)) return { glyph: window.MentorIcons.fileJson, cls: 'icon-json' };
  return { glyph: window.MentorIcons.fileOther, cls: 'icon-other' };
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
    // v2: 锁 .mentor 模式 — reload 走 mentor 路径, 不用 .md 路径
    if (State.currentFile && State.currentFile.handle) {
      try {
        if (/\.mentor$/i.test(name)) {
          await openFromMentorHandle(State.currentFile.handle);
        } else {
          // 旧 .md handle 残留, 提示用户手动重开
          showToast('旧格式已不支持, 请重新打开 .mentor');
          return;
        }
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

// ============================================================
// .mentor 包: ZIP(md + annotations.json) — 像 docx 一样, 表面一个文件
// ============================================================
//
// 内部结构 (最小可行):
//   xxx.mentor
//   ├── content.md              (原 .md 文本)
//   └── annotations.json        (原 .annotations.json 侧车)
//
// 加载流程 (loadMentorZip): 用户在文件选择器选 .mentor → JSZip 解压 →
//   提取 content.md 作 mdText, 提取 annotations.json 作 annotations →
//   用 loadMarkdownIntoEditor 渲染 (复用现成路径) → State.saveMode='mentor'
//
// 保存流程 (saveMentorZip): 编辑后 Ctrl+S / Save As → JSZip 重新打包 →
//   handle 模式: 写回原 .mentor 位置; download 模式: 浏览器下载到 Downloads
//
// 双开一致性: v1 不解决 (无文件锁). 注释提示用户避免同时打开同一 .mentor

const MENTOR_ZIP_MAGIC = 'PK\x03\x04'; // ZIP 文件头魔数
const MENTOR_MD_NAME = 'content.md';
const MENTOR_ANN_NAME = 'annotations.json';

// 判定 File 是否为 .mentor 包 (看魔数, 不只看后缀 — 后缀可能错)
async function isMentorZip(file) {
  if (!file) return false;
  // .mentor 后缀: 直接信任
  if (/\.mentor$/i.test(file.name)) return true;
  // 兜底: 读头 4 字节判定 (用于 Legacy 路径下 user 改后缀的情况)
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4B && head[2] === 0x03 && head[3] === 0x04;
  } catch (e) {
    return false;
  }
}

// 从 File 提取 content.md + annotations.json + media/* (v2 schema)
// 失败抛错; 返回 { mdText, annotations, mediaFiles: { [path]: Blob } }
// mediaFiles 只列 zip 顶层下的 media/ 子目录, 其它路径忽略 (避免 zip slip / 恶意 entry)
async function readMentorZip(file) {
  // F-media v1.36 fix: File.arrayBuffer() 跨 iframe / cross-realm 时拿到的是
  // parent realm 的 ArrayBuffer, JSZip (旧版) 拒读 ("Can't read the data of
  // 'the loaded zip file'"). v1.35 试过 `new Blob([buf]).arrayBuffer()`,
  // 但 Blob 构造在同一 realm, 没真复制到 iframe realm → 仍挂。
  // 真修法: 当前 realm 内 new Uint8Array(buf), 再 new Blob([typedArray]),
  // 字节 copy 到本地 realm 的 ArrayBuffer 后再喂 JSZip.
  const rawBuf = await file.arrayBuffer();
  const typed = new Uint8Array(rawBuf);
  // typed 在当前 realm; Blob 接受 typed array 字节并在本 realm 内分配新 buffer
  const blob = new Blob([typed]);
  const safeBuf = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(safeBuf);
  const mdEntry = zip.file(MENTOR_MD_NAME);
  const annEntry = zip.file(MENTOR_ANN_NAME);
  if (!mdEntry) {
    throw new Error(`.mentor 包缺少 ${MENTOR_MD_NAME}`);
  }
  const mdText = await mdEntry.async('string');
  let annotations = null;
  if (annEntry) {
    try {
      const annText = await annEntry.async('string');
      annotations = JSON.parse(annText);
    } catch (e) {
      console.warn('[mentor] annotations.json 解析失败, 当作空批注:', e);
      annotations = null;
    }
  }
  // F-media: 解 media/* 子目录 (Pandoc 解 docx 默认产物)
  const mediaFiles = {};
  const entries = Object.keys(zip.files);
  for (const name of entries) {
    // 只要 media/ 开头, 不要 media.bak/ 这种 backup 目录
    if (!name.startsWith('media/')) continue;
    // 防 zip slip: 不允许 ../ 或绝对路径
    if (name.includes('..') || name.startsWith('/')) continue;
    // 跳过目录 entry
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const blob = await entry.async('blob');
    mediaFiles[name] = blob;
  }
  // v1.37 fix: 检测 corrupt .mentor — content.md 含 blob: URL 但 zip 里没 media/* 时
  // 真实症状: img.naturalWidth=0 (browser 找不到 blob) + State.mediaUrls 空
  // 根因: 这份 .mentor 是在 v1.34 schema 推出之前存的, 或某条保存路径没把 blob 反查成相对路径
  // (见 htmlToMarkdownMedia 第 2569-2574 行做反向 — 如果保存时 State.mediaUrls 误空, blob URL 直接落 markdown)
  const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length;
  const mediaKeysCount = Object.keys(mediaFiles).length;
  if (blobUrlCount > 0) {
    console.warn(`[readMentorZip] ⚠ 检测到 ${blobUrlCount} 张图用 blob: 引用 (来自之前 session, 当前已失效).`);
    if (mediaKeysCount === 0) {
      // 最严重: md 用 blob URL 但 zip 里没 media. 用户在远端机器/老版本设备生成的文件. 图全部丢失
      console.warn(`[readMentorZip] ⚠ zip 里无 media/ 子目录, ${blobUrlCount} 张图永远无法显示. 这是 corrupt .mentor.`);
      console.warn(`[readMentorZip] 建议: 用原始 .docx 通过 Pandoc 重新 generate (.mentor v2 schema) 或换另一工具.`);
    } else {
      console.log(`[readMentorZip] zip 含 ${mediaKeysCount} 个 media 文件但 mdText 没引用 → 这可能是新生成的 .mentor 但 markdown 用旧 blob URL`);
    }
  }
  return { mdText, annotations, mediaFiles, _diag: { blobUrlCount, mediaKeysCount } };
}

// 打开 .mentor 包: 解压 → loadMarkdownIntoEditor → State.saveMode='mentor'
async function openFromMentorFile(file) {
  console.log('[F-media diag] openFromMentorFile start, file=', file?.name, 'size=', file?.size);
  const { mdText, annotations, mediaFiles } = await readMentorZip(file);
  console.log('[F-media diag] readMentorZip done, mediaFiles keys=', Object.keys(mediaFiles || {}));
  // F-media: 释放旧 doc 的 blob URL, 把新 mediaFiles 转 blob URL 注入 State
  revokeMediaUrls();
  for (const [path, blob] of Object.entries(mediaFiles || {})) {
    State.mediaUrls[path] = URL.createObjectURL(blob);
    State.mediaFiles[path] = blob;
  }
  console.log('[F-media diag] state.mediaUrls count=', Object.keys(State.mediaUrls).length);
  // 单文件模式: 没法 handle 写回, 走 download fallback
  State.saveMode = 'mentor-download';
  // 显示用名: 保留原 .mentor 文件名 (title bar / outline)
  const displayName = file.name;
  await loadMarkdownIntoEditor(displayName, mdText, annotations);
  // v1.37 fix: 如果 zip 里没图但 markdown 引 blob URLs, 弹 toast 提醒用户这是 corrupt 文件
  const mediaCount = Object.keys(mediaFiles || {}).length;
  const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length;
  if (mediaCount === 0 && blobUrlCount > 0) {
    showToast(`⚠ .mentor 损坏: ${blobUrlCount} 张图引用失效 (zip 无 media/). 用 Pandoc 重新 generate 文档`, 8000);
    setStatus('图全部失效', `${blobUrlCount} 张图引用 blob: URL 失效 — 这份 .mentor 没有 media/ 子目录`);
  } else if (mediaCount > 0) {
    setStatus('已加载 .mentor 包', `${displayName} · ${mediaCount} 张图片 ✓`);
  } else {
    setStatus('已加载 .mentor 包', `${displayName} (Ctrl+S 下载 .mentor 副本)`);
  }
  updateDocMeta();
  return { displayName, mdText, annotations };
}

// 打包 content.md + annotations.json + media/* → Blob (application/zip)
// v2 schema: mediaFiles 可选 { 'media/image5.png': Blob }
// zip 顶层目录结构:
//   content.md
//   annotations.json
//   media/
//     image5.png
//     ...
async function buildMentorZipBlob(mdText, annotations, mediaFiles) {
  const zip = new JSZip();
  zip.file(MENTOR_MD_NAME, mdText);
  zip.file(MENTOR_ANN_NAME, JSON.stringify(annotations, null, 2));
  if (mediaFiles && Object.keys(mediaFiles).length > 0) {
    // 按 path 直接塞进 zip 顶层, JSZip 会自动建子目录
    for (const [path, blob] of Object.entries(mediaFiles)) {
      // 安全检查: 只允许 media/ 开头 + 无 ../ / /
      if (!path.startsWith('media/') || path.includes('..') || path.startsWith('/')) {
        console.warn('[mentor] buildMentorZipBlob 跳过非法 path:', path);
        continue;
      }
      zip.file(path, blob);
    }
  }
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// 生成导出用 .mentor 文件名: 同前缀, 后缀改 .mentor
function mentorExportName(mdName) {
  return mdName.replace(/\.(md|markdown)$/i, '') + '.mentor';
}

// --- 保存 .md + 侧车 JSON (或 .mentor 单文件包)
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
  // F-media: 反查 <img src="blob:..."> → 'media/image5.png', 保证 markdown 源码里仍是相对路径
  // (不打回去会让用户存了 .mentor 后, 下一台机器看到 blob:... 失效)
  const mdText = htmlToMarkdownMedia(html);
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

  // 3a. .mentor 单文件包模式: 重新打包 ZIP 写回 / 下载
  if (State.saveMode === 'mentor-handle' || State.saveMode === 'mentor-download') {
    const result = await tryWriteBackMentor(mdText, sidecar, State.currentFile.name);
    if (result.handle) {
      showToast('已保存到原位置 ✓ (.mentor)');
      setStatus('已保存', State.currentFile.name);
    } else if (result.error) {
      showToast('保存失败: ' + result.error);
      setStatus('保存失败', result.error);
    } else {
      // download 模式 / 写回失败 → 浏览器下载
      const blob = await buildMentorZipBlob(mdText, sidecar, State.mediaFiles);
      downloadBlob(State.currentFile.name, blob);
      showToast('已下载 ✓ (.mentor)');
      setStatus('已下载', State.currentFile.name);
    }
    return;
  }

  // 3b. 传统 .md + .json 侧车模式 (沿用原 tryWriteBack 路径)
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

// 写回 .mentor 包 (handle 模式直写, 否则 fallback 给 download 路径)
async function tryWriteBackMentor(mdText, sidecar, mentorName) {
  if (State.saveMode === 'mentor-handle' && State.currentFile && State.currentFile.handle) {
    try {
      const handle = State.currentFile.handle;
      if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        await handle.requestPermission({ mode: 'readwrite' });
      }
      const blob = await buildMentorZipBlob(mdText, sidecar, State.mediaFiles);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handle: true };
    } catch (e) {
      if (e.name === 'NotAllowedError') return { handle: false, error: '权限被拒' };
      return { handle: false, error: e.message };
    }
  }
  return { handle: false };
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

// 下载任意 Blob (用于 .mentor 包的 application/zip)
function downloadBlob(name, blob) {
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
  // H-undo: 新建文档重置 history
  resetHistory();
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
  // H-undo: 工具栏 ↶ ↷ 按钮
  $('#btn-undo').addEventListener('click', () => {
    if (undo()) showToast('已撤销');
  });
  $('#btn-redo').addEventListener('click', () => {
    if (redo()) showToast('已重做');
  });
  updateHistoryButtons();  // 初始 disabled 状态
  // 快捷键 (v2/v1.37 Office 风格, 用户要求: Ctrl+Z/Ctrl+Y)
  // - Ctrl+Z: 优先撤销 PM doc 的编辑 (PM history plugin 已经处理 mark 同步)
  //   只有当 PM 历史栈彻底空时才走我们的批注 ops history
  // - Ctrl+Y 或 Ctrl+Shift+Z: 优先 PM redo, 否则批注 redo
  // v1.37 fix: 之前是 "批注优先, 没有才 PM", 但用户报告 "批注内逐字删除+Ctrl+Z" 走错路
  //   (我栈里有建批注 snapshot, 但他期望恢复字符 → 走 PM 才对)
  //   现在改为 PM 优先, 我们 my-history 兜底处理 batch delete (那种情况 PM history 不动)
  document.addEventListener('keydown', (e) => {
    // 避免在 textarea/input 内误触 (用户在输入文字)
    const tag = e.target?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (!((e.metaKey || e.ctrlKey) && !e.altKey)) return;

    // Ctrl+Z (无 shift): 优先 PM undo (doc 文本编辑), 我们的 history 兜底
    if (!e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (undoSmartDispatch()) showToast('已撤销');
      return;
    }
    // Ctrl+Y: 智能 redo
    if (!e.shiftKey && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      if (redoSmartDispatch()) showToast('已重做');
      return;
    }
    // Ctrl+Shift+Z: 备选 redo
    if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (redoSmartDispatch()) showToast('已重做');
      return;
    }
  });

  // v1.37: PM undo 优先, my-history 兜底
  //   - 用户编辑 PM doc (字符增删/格式化) → PM history plugin 已捕获, undo 恢复文本 + mark
  //   - 批注 ops (deleteThread / addReply / toggleResolved 走我们 pushHistory) → 我们的 undo
  function undoSmartDispatch() {
    // 先尝试 PM undo (用户最近一次编辑可能是文本/mark)
    // PM history plugin 暴露 PM 编辑历史栈, 通过编辑器命令访问
    // 在 PM 自带 history 插件的栈里, 编辑 docContent 后再编辑 mark 维度的 patch 都是 PM 范围 (mark 跟 doc 一起回滚)
    // 但 MARK 维度变更 (active / resolved 切换) 不走 PM history stack (用了 __activeMarkSync meta), 所以走我们
    // 简单 rule: my-history.past 顶部项如果它是 "批注 ops" (我们 pushHistory 的, 不是 PM onUpdate 来的), 走 my
    //           否则走 PM. PM 自带 history plugin 我们没主动 push PM history entry (v1.37 撤销了 onUpdate push),
    //           所以 my-history 里也只剩批注 ops
    // 用 try-undo PM first 看是否真的能改 (PM undo 会撤销 tr, docChanged 触发), 否则 fallback my
    const ed = State.editor;
    if (ed) {
      // 真正测 PM undo 是否生效, 通过检查 PM history plugin stack
      try {
        const before = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
        ed.commands.undo();
        const after = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
        if (before !== after) {
          // PM undo 改变了 doc 文本 — 用户想要的 undo 已发生
          // 同时更新 mark (rebuildAnnotationMarks via my-history path 不需要, 因为 PM undo 也撤销 mark)
          return true;
        }
      } catch (e) {
        // PM undo 抛错, 继续 fallback
      }
    }
    // PM undo 无效 (可能 PM history 空了 / 被 my-history 接管)
    if (State.history.past.length > 0 && undo()) {
      showToast('已撤销 (批注)');
      return true;
    }
    return false;
  }

  function redoSmartDispatch() {
    const ed = State.editor;
    if (ed) {
      try {
        const before = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
        ed.commands.redo();
        const after = ed.state.doc.textBetween(0, ed.state.doc.content.size, ' ');
        if (before !== after) return true;
      } catch (e) {}
    }
    if (State.history.future.length > 0 && redo()) {
      showToast('已重做 (批注)');
      return true;
    }
    return false;
  }
  $('#btn-save-as').addEventListener('click', async () => {
    if (!State.currentFile) return;
    const html = State.editor.getHTML();
    const mdText = htmlToMarkdown(html);
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
    // 询问格式: 旧 .md + .json / 新 .mentor 单文件包
    const choice = prompt(
      '另存为:\n' +
      '1) .mentor 单文件包 (推荐 — 像 docx)\n' +
      '2) .md + .annotations.json 两个文件 (兼容旧版)\n' +
      '输入 1 或 2 (默认 1):',
      '1'
    );
    const useMentor = choice !== '2';  // 默认 1
    if (useMentor) {
      const blob = await buildMentorZipBlob(mdText, sidecar);
      const exportName = mentorExportName(State.currentFile.name);
      downloadBlob(exportName, blob);
      showToast(`已下载 ${exportName} ✓`);
    } else {
      const sidecarName = State.currentFile.name.replace(/\.md$/i, '') + '.annotations.json';
      downloadFile(State.currentFile.name, mdText);
      downloadFile(sidecarName, JSON.stringify(sidecar, null, 2));
      showToast('已下载两个文件');
    }
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
        case 'superscript': c.toggleSuperscript().run(); break;
        case 'subscript': c.toggleSubscript().run(); break;
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

  // 文件树收起/展开功能已移除 — 大纲栏始终显示 (Word 风格, 不能折叠)

  // 切换 渲染/源码 视图
  $('#btn-toggle-render').addEventListener('click', () => {
    setRenderMode(State.renderMode === 'rendered' ? 'source' : 'rendered');
    updateToggleBtnIcon();
  });
  updateToggleBtnIcon();  // 初始图标

  // P1-FilePaneCollapse: 文件栏收起按钮 + Ctrl+[ 快捷键
  function toggleFilePane() {
    const collapsed = document.body.classList.toggle('file-pane-collapsed');
    const expandBtn = $('#expand-file-pane-btn');
    if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
  }
  // 绑所有 [data-act='toggle-file-pane'] 元素 (折叠按钮 + 浮起展开按钮)
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="toggle-file-pane"]')) {
      toggleFilePane();
    }
  });
  // Ctrl+[ 收起/展开文件栏 (键盘快捷键)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '[') {
      e.preventDefault();
      toggleFilePane();
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
        case 'superscript': isActive = editor.isActive('superscript'); break;
        case 'subscript': isActive = editor.isActive('subscript'); break;
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

  // 帮助按钮 - 不再 addEventListener, 改 inline onclick (v1.32 inline backup)
  // 之前 addEventListener 在 init 阶段一次性绑定, 但部分浏览器 cache 老 app.js 会保留
  // 旧的 init 路径, 跟新 inline onclick 叠加导致 toggleHelp 跑两次 = 自动抵消
  // 现在只走 inline onclick 一条路径
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
    // v1.32 修复: 去掉 !isHelpOpen() 守卫, toggleHelp 自己判断开/关, 否则按第二次不关闭
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
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
  setupPaneResizer();
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

// 尝试从 IndexedDB 重连上次打开的 .mentor 文件
async function tryReconnect() {
  try {
    const last = await HandleStore.getLastFile();
    if (!last || !last.fileName) return;
    // v2: 只重连 .mentor 格式, 旧 .md handle 视为过期 (格式升级后, 旧 handle 不再适用)
    if (!/\.mentor$/i.test(last.fileName)) {
      console.log(`[P-reconnect] 跳过旧格式 handle: ${last.fileName} (需手动重新打开 .mentor)`);
      // 清理 IDB 中的旧记录, 避免下次启动再尝试
      try { await HandleStore.deleteFile(last.fileName); } catch (e) { /* 忽略 */ }
      try { await HandleStore.removeLastFile(); } catch (e) { /* 忽略 */ }
      setStatus('文件格式已升级', '请手动重新打开 .mentor 文件');
      return;
    }
    const handle = await HandleStore.getFile(last.fileName);
    if (!handle) return;
    // 确认权限 (用户上次授权过的文件, 多数情况仍 granted; revoke 后需要重选)
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'readwrite' }); }
    catch (e) { perm = 'prompt'; }
    if (perm !== 'granted') {
      // v1.37: 加载时主动请求权限 (用户已 navigate tab, 一次 gesture 在我们栈里)
      // 浏览器对 navigation gesture 通常认可 requestPermission 直接调用
      // 如果被拒 (用户手势过期), fallback 提示手动重授权
      try {
        const newPerm = await handle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') {
          setStatus('上次文件未授权', `${last.fileName} — 点击文件树重选文件以授权`);
          return;
        }
        showToast('已重新获得文件权限, autosave 启用', 3000);
      } catch (e) {
        console.warn('[tryReconnect] requestPermission 失败:', e);
        setStatus('上次文件未授权', `${last.fileName} — 点击文件树重选以授权`);
        return;
      }
    }
    State.saveMode = 'mentor-handle';
    await openFromMentorHandle(handle);
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
  openFromMentorHandle,
  openFiles,
  openFilesLegacy,
  openFromMentorFile,
  toggleHelp,  // v1.32: 暴露 help toggle 备用入口, 让 inline onclick 用
  // .mentor 包帮助函数 (给 e2e 测试 + 第三方插件使用)
  isMentorZip,
  readMentorZip,
  buildMentorZipBlob,
  mentorExportName,
  // F-media v1.34: 暴露 media 反查 helper 供诊断用
  revokeMediaUrls,
  htmlToMarkdownMedia,
  __diagMedia: () => {
    // 用户在 DevTools console 输入 __mdAnnotator.__diagMedia() 调出全状态
    const M = window.__mdAnnotator;
    const S = M.State;
    const imgs = Array.from(document.querySelectorAll('#editor img'));
    return {
      appJs: document.querySelector('script[src*="app.js"]')?.src || '?',
      title: document.title,
      saveMode: S.saveMode,
      currentFileName: S.currentFile?.name,
      mediaUrlsKeys: Object.keys(S.mediaUrls || {}),
      mediaFilesKeys: Object.keys(S.mediaFiles || {}),
      mediaUrlsSample: Object.entries(S.mediaUrls || {}).slice(0, 2),
      imgCount: imgs.length,
      imgDetails: imgs.map(i => ({
        srcPrefix: i.src.slice(0, 30),
        complete: i.complete,
        naturalWidth: i.naturalWidth,
        naturalHeight: i.naturalHeight,
      })),
    };
  },
  // H-undo: history stack helpers
  pushHistory,
  undo,
  redo,
  resetHistory,
  rebuildAnnotationMarks,
  // H-autosave: autosave helpers
  startAutosaveTimer,
  stopAutosaveTimer,
  autosaveNow,
  // HTML → markdown 内部 helper（暴露给 e2e 测试 + 第三方插件使用）
  htmlToMarkdown,
  // File pane 测试 API
  fileTypeIcon,
  filterTree,
  renderFilePaneCurrent,
  handleTreeAction,
  // AI 协作协议：结构化 API（不让 AI 通过 UI 模拟点击）
  ai: (() => {
    // P1 #10: 默认署名是 'AI Reviewer', 但用户可以在 settings 改 ai.author
    // 所有 reply 操作都用 ai.author (动态)
    let AI_AUTHOR = 'AI Reviewer';
    const MAX_BODY = 5000;
    const PROTOCOL = 'ai-collab-v1';

    function setAuthor(name) {
      if (typeof name === 'string' && name.trim()) {
        AI_AUTHOR = name.trim();
        return true;
      }
      return false;
    }

    // P0 #3: 阻止议长+参议并发 reply 产生重复内容
    // 1) Map<threadId, Promise> 锁: 同 threadId 第 2 个调用 await 同一 Promise, 不产生第 2 条 comment
    // 2) 2s 内 body 内容去重: 防止 sleep + re-send
    const _replyLock = new Map();  // threadId -> Promise<{ok, comment|error}>
    const _DEDUP_WINDOW_MS = 2000;

    return {
      __meta: {
        protocol: PROTOCOL,
        get author() { return AI_AUTHOR; },
        setAuthor,
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
      async reply(threadId, body, opts = {}) {
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

        // 2. 锁合并: 同 threadId 的第 2 个调用复用第 1 个的 Promise (合并而非拒绝)
        // 这是关键 — 防止议长 + 参议两个 AI 同时 reply 都用相同 threadId + body 时推 2 条 comment
        if (_replyLock.has(threadId)) {
          return _replyLock.get(threadId);
        }

        const promise = (async () => {
          // 3. 查 thread + 状态
          const thread = State.annotations.find(t => t.threadId === threadId);
          if (!thread) {
            return { ok: false, error: `thread 不存在: ${threadId}` };
          }
          if (thread.resolved) {
            return { ok: false, error: 'thread 已 resolved，无法回复（请用户 reopen）' };
          }

          // 4. 内容去重: 最后一条 comment body 相同 + createdAt 在 2s 内 → 幂等返回
          // 防止 sleep + accidentally re-reply
          const lastComment = thread.comments?.[thread.comments.length - 1];
          if (lastComment && lastComment.body === trimmed) {
            const ms = Date.now() - new Date(lastComment.createdAt).getTime();
            if (ms < _DEDUP_WINDOW_MS) {
              return { ok: true, comment: lastComment, dedup: true };
            }
          }

          // 5. 构造 + push
          const author = (opts.author && typeof opts.author === 'string' && opts.author.trim())
                         ? opts.author.trim()
                         : AI_AUTHOR;
          const comment = {
            id: uuid(),
            author,
            body: trimmed,
            createdAt: nowISO(),
          };
          try {
            thread.comments.push(comment);
            markDirty();
            renderCommentList();
            emitAI('newComment', { threadId, comment });
            emitAI('threadChange', { threadId, change: 'reply', comment });
            return { ok: true, comment };
          } catch (e) {
            return { ok: false, error: 'reply 失败: ' + e.message };
          }
        })();

        _replyLock.set(threadId, promise);
        try {
          return await promise;
        } finally {
          _replyLock.delete(threadId);
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