// ============================================================
// Mentor — WYSIWYG Markdown editor with docx-style comments
// ============================================================
// RECOVERED from app.bundle.js (v1.43.50) after accidental git checkout.
// Offline bundle via esbuild (app.bundle.js).

import { Editor, Node, Mark, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Gapcursor from '@tiptap/extension-gapcursor';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import TurndownService from 'turndown';
import JSZip from 'jszip';
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import {
  fingerprintDocument as fingerprintDocumentPure,
  createDocumentSession,
  sessionIdentity,
  sessionsMatch
} from './modules/document-session.js';
import {
  createSerialWriteQueue,
  createHandleStore,
  createDraftStore,
  createAnnotationStore,
  createVersionStore
} from './modules/io.js';
import {
  contentFingerprint as contentFingerprintPure,
  shouldCaptureVersion as shouldCaptureVersionPure,
  pruneVersionList as pruneVersionListPure,
  packMediaForVersion,
  estimateVersionByteSize,
  createVersionRow,
  DEFAULT_VERSION_POLICY
} from './modules/version-history.js';
import {
  createWorkspaceSession,
  normalizeWorkspaceSession,
  orderRestoredTabs
} from './modules/workspace-session.js';
import {
  singleNewlinesToParagraphBreaks,
  unwrapSoleImageParagraphs
} from './modules/markdown-normalize.js';
import {
  deepCloneAnnotations as deepCloneAnnotationsPure,
  computeInverseAnnPatch,
  applyAnnPatch,
  collectChangedRanges,
  scanAnnotationMarksInRanges,
  coalesceAnnotationMarkPieces,
  createActiveHighlightPlugin,
  activeHighlightKey,
  setActiveHighlightMeta,
  createPatchHistory,
  pushInverseHistory,
  undoInverseHistory,
  redoInverseHistory,
  isPatchHistoryEntry
} from './modules/annotations.js';
import {
  genTabId as genTabIdPure,
  findTabByDocument as findTabByDocumentPure,
  snapshotTabState,
  tabLabel,
  sanitizeSupervisionSource
} from './modules/tabs.js';
import {
  parseReferenceFile,
  sortReferenceEntries,
  filterReferenceEntries,
  parseCitationSyntax,
  serializeCitationSyntax,
  formatCitationLabel,
  stripNarrativeAuthorBeforeSuppressCitations,
  narrativePrefixMatches,
  formatAuthorPart,
  normalizeReferenceManifest,
  emptyReferenceManifest,
  createReferenceManifest,
  normalizeBibliographyConfig,
  serializeReferenceBibTeX,
  formatReferenceEntry,
  normalizeReferenceEntry,
  validateReferenceEntry,
  referenceEntriesEqual,
  upsertReferenceEntry,
  removeReferenceEntry,
  mergeReferenceEntries,
  renameCitationKey,
  BIBLIOGRAPHY_MARKER,
  selectBibliographyEntries,
  buildBibliographyModel,
  materializeBibliographyMarkdown,
  planLegacyBibliographyMigration,
  splitLegacyReferencesSection
} from './modules/references.js';
import {
  findOccurrences,
  scoreCandidate,
  resolveAnchor,
  resolveAnchorSet,
  mapAnchorRange,
  captureAnchorEvidence,
  projectLegacyFlags,
  auditAnnotationInvariants,
  applyStatusToThread
} from './modules/annotation-anchor.js';
import {
  annotationAnchorKey,
  createAnnotationAnchorPlugin,
  setAnnotationAnchorResetMeta,
  getAnnotationAnchorState
} from './modules/annotation-anchor-plugin.js';
import {
  STRUCTURAL_HTML_NAME,
  ARCHIVE_MANIFEST_NAME,
  createArchiveManifest,
  verifyStructuralArchive,
} from './modules/mentor-archive.js';
import {
  LIVE_SYNC_SCHEMA,
  channelNameForDocument,
  compareLease,
  nextLease,
  createEnvelopeGate,
  mapImageSources,
  mediaRevision
} from './modules/cross-tab-sync.js';
import {
  getToolbarActionState,
  PRIMARY_TOOLBAR_ACTIONS
} from './modules/toolbar-actions.js';
import {
  buildSaveDialogModel,
  buildSaveResultCopy
} from './modules/save-dialog.js';
import { buildCommentsParts } from './modules/docx-export-comments.js';
import { parseDocxToMentor } from './modules/docx-import.js';
import {
  classifySaveOutcome,
  shouldPromptForUnsavedChanges as shouldPromptForUnsavedChangesPure
} from './modules/save-lifecycle.js';
import { createExternalChangeWatcher } from './modules/external-change-watcher.js';
import { createExternalRevisionWatcher } from './modules/external-revision-watcher.js';
import { decideExternalRefresh } from './modules/external-change-reconcile.js';
import {
  createSupervisionPlugin,
  supervisionKey,
  setSupervisionMeta,
  supervisionBannerText,
  supervisionSignalPhase,
  normalizeSupervisionPayload,
  SUPERVISION_BYPASS_META,
} from './modules/supervision.js';
import { createSupervisionPoller, SupervisionPollError } from './modules/supervision-poller.js';

var KatexInline = Node.create({
  name: "katex",
  group: "inline",
  inline: true,
  atom: true,
  // 不可分割
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      // 原始 LaTeX 源码（保存时用）
      tex: { default: "" }
    };
  },
  parseHTML() {
    return [{
      tag: "span.katex-wrapper",
      getAttrs: (node) => ({ tex: node.getAttribute("data-tex") || "" })
    }];
  },
  renderHTML({ HTMLAttributes, node }) {
    let inner2 = "";
    try {
      inner2 = katex.renderToString(node.attrs.tex, { throwOnError: false });
    } catch (e) {
      inner2 = `<span class="katex-error">${node.attrs.tex}</span>`;
    }
    return ["span", { class: "katex-wrapper", "data-tex": node.attrs.tex, contenteditable: "false" }, inner2];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "katex-wrapper";
      dom.setAttribute("contenteditable", "false");
      dom.setAttribute("data-tex", node.attrs.tex);
      try {
        dom.innerHTML = katex.renderToString(node.attrs.tex, { throwOnError: false });
      } catch (e) {
        dom.textContent = node.attrs.tex;
      }
      return { dom };
    };
  }
});
var KatexBlock = Node.create({
  name: "katexBlock",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return { tex: { default: "" } };
  },
  parseHTML() {
    return [{
      tag: "div.katex-wrapper-display",
      getAttrs: (node) => ({ tex: node.getAttribute("data-tex") || "" })
    }];
  },
  renderHTML({ node }) {
    let inner2 = "";
    try {
      inner2 = katex.renderToString(node.attrs.tex, { throwOnError: false, displayMode: true });
    } catch (e) {
      inner2 = `<span class="katex-error">${node.attrs.tex}</span>`;
    }
    return ["div", { class: "katex-wrapper-display", "data-tex": node.attrs.tex, contenteditable: "false" }, inner2];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "katex-wrapper-display";
      dom.setAttribute("contenteditable", "false");
      dom.setAttribute("data-tex", node.attrs.tex);
      try {
        dom.innerHTML = katex.renderToString(node.attrs.tex, { throwOnError: false, displayMode: true });
      } catch (e) {
        dom.textContent = node.attrs.tex;
      }
      return { dom };
    };
  }
});

// v1.43.51+: CitationNode — Pandoc citation inline atom.
// `[@key]`, `[-@key, p. 3]`, `[@a; @b]` become a single read-only inline
// node whose display label is computed from the document's reference
// manifest. The original raw syntax is preserved on the node and used as
// the source of truth when serializing back to Markdown via Turndown.
function buildCitationLabel(raw, references) {
  // Fall back to the raw syntax when no manifest is provided so nothing
  // is silently lost during round-trip with an unattached editor.
  if (!references || !(references.entries && references.entries.length)) {
    return { label: raw || "[]", keys: [], missingKeys: [] };
  }
  try {
    const parsed = parseCitationSyntax(raw);
    const entryMap = new Map((references.entries || []).map((e) => [e.key, e]));
    const formatted = formatCitationLabel(parsed, entryMap);
    return {
      label: formatted.text,
      keys: (parsed.items || []).map((item) => item.key),
      missingKeys: formatted.missingKeys || []
    };
  } catch (e) {
    return { label: raw || "[]", keys: [], missingKeys: [] };
  }
}
function citationRawToHtml(raw) {
  const info = (!State.references || !(State.references.entries || []).length)
    ? { label: raw, keys: parseCitationSyntax(raw).items.map((item) => item.key), missingKeys: [] }
    : buildCitationLabel(raw, State.references);
  return `<span class="mentor-citation${info.missingKeys.length ? " is-missing" : ""}" data-citation-raw="${escapeHtml(raw)}" data-citation-keys="${escapeHtml(JSON.stringify(info.keys))}" data-key="${escapeHtml(info.keys[0] || "")}" data-citation-missing="${escapeHtml(JSON.stringify(info.missingKeys))}" contenteditable="false">${escapeHtml(info.label)}</span>`;
}
var CitationTextNormalizer = Extension.create({
  name: "citationTextNormalizer",
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged) || transactions.some((tr) => tr.getMeta("citation-normalized"))) return null;
        const targets = [];
        newState.doc.descendants((node, pos) => {
          if (node.isText && /\[-?@[\w:.\-\/]+/.test(node.text || "")) targets.push({ node, pos });
        });
        if (!targets.length) return null;
        let tr = newState.tr;
        for (const { node, pos } of targets.reverse()) {
          let text = node.text || "";
          // Strip narrative author prefixes before suppress cites inside this text node
          try {
            if (State.references && (State.references.entries || []).length) {
              text = stripNarrativeAuthorBeforeSuppressCitations(text, State.references);
            }
          } catch (_) {}
          const parts = text.split(/(\[(?:-?@[\w:.\-\/]+(?:\s*,\s*[^;\]]+)?)(?:\s*;\s*-?@[\w:.\-\/]+(?:\s*,\s*[^;\]]+)?)*\])/g);
          if (parts.length < 2 && text === (node.text || "")) continue;
          const nodes = parts.filter(Boolean).map((part) => {
            if (!/^\[-?@/.test(part)) return newState.schema.text(part, node.marks);
            const info = (!State.references || !(State.references.entries || []).length)
              ? { label: part, keys: parseCitationSyntax(part).items.map((item) => item.key), missingKeys: [] }
              : buildCitationLabel(part, State.references);
            return newState.schema.nodes.citation.create({ raw: part, keys: info.keys, label: info.label, missingKeys: info.missingKeys });
          });
          tr = tr.replaceWith(pos, pos + node.nodeSize, nodes);
        }
        tr.setMeta("citation-normalized", true);
        return tr;
      }
    })];
  }
});
var CitationNode = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      raw: { default: "[]" },
      keys: {
        default: [],
        parseHTML: (el) => {
          try {
            const raw = el.getAttribute("data-citation-raw") || "[]";
            return parseCitationSyntax(raw).items.map((item) => item.key);
          } catch (e) { return []; }
        },
        renderHTML: (attrs) => ({ "data-citation-keys": JSON.stringify(attrs.keys || []) })
      },
      label: { default: "" },
      missingKeys: {
        default: [],
        parseHTML: (el) => {
          try { return JSON.parse(el.getAttribute("data-citation-missing") || "[]"); }
          catch (e) { return []; }
        },
        renderHTML: (attrs) => ({ "data-citation-missing": JSON.stringify(attrs.missingKeys || []) })
      }
    };
  },
  parseHTML() {
    return [{
      tag: "span[data-citation-raw]",
      getAttrs: (node) => ({
        raw: node.getAttribute("data-citation-raw") || "[]",
        label: (node.textContent || "").trim(),
        keys: (() => {
          try {
            const raw = node.getAttribute("data-citation-raw") || "[]";
            return parseCitationSyntax(raw).items.map((item) => item.key);
          } catch (e) { return []; }
        })(),
        missingKeys: (() => {
          try { return JSON.parse(node.getAttribute("data-citation-missing") || "[]"); }
          catch (e) { return []; }
        })()
      })
    }];
  },
  renderHTML({ node }) {
    const attrs = node.attrs || {};
    const missing = (attrs.missingKeys || []).length > 0;
    const label = attrs.label || attrs.raw || "[]";
    return ["span", {
      class: `mentor-citation${missing ? " is-missing" : ""}`,
      "data-citation-raw": attrs.raw || "[]",
      "data-citation-keys": JSON.stringify(attrs.keys || []),
      "data-key": (attrs.keys || [])[0] || "",
      "data-citation-missing": JSON.stringify(attrs.missingKeys || []),
      contenteditable: "false"
    }, label];
  }
});

// v1.45.7+: BibliographyNode — EndNote-style generated references block.
// Semantically a non-editable atom that lives at one fixed position in the
// document. On the wire it serializes back to a `<!-- mentor:bibliography -->`
// marker; in the WYSIWYG view the heading + entries are read from the
// reference library via `buildBibliographyModel`.
var BibliographyNode = Node.create({
  name: "bibliography",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      heading: { default: "References" },
      scope: { default: "cited" },
      items: {
        default: [],
        parseHTML: (el) => {
          try {
            const raw = el.getAttribute("data-bibliography-items") || "[]";
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
          } catch (e) { return []; }
        },
        renderHTML: (attrs) => ({ "data-bibliography-items": JSON.stringify(attrs.items || []) })
      },
      keys: {
        default: [],
        parseHTML: (el) => {
          try {
            const raw = el.getAttribute("data-bibliography-keys") || "[]";
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
          } catch (e) { return []; }
        },
        renderHTML: (attrs) => ({ "data-bibliography-keys": JSON.stringify(attrs.keys || []) })
      },
      enabled: { default: false, renderHTML: (attrs) => ({}) }
    };
  },
  parseHTML() {
    return [{
      tag: "section[data-mentor-bibliography]",
      getAttrs: (node) => ({
        heading: node.getAttribute("data-bibliography-heading") || "References",
        scope: node.getAttribute("data-bibliography-scope") || "cited",
        items: (() => {
          try {
            const arr = JSON.parse(node.getAttribute("data-bibliography-items") || "[]");
            return Array.isArray(arr) ? arr : [];
          } catch (e) { return []; }
        })(),
        keys: (() => {
          try {
            const arr = JSON.parse(node.getAttribute("data-bibliography-keys") || "[]");
            return Array.isArray(arr) ? arr : [];
          } catch (e) { return []; }
        })()
      })
    }];
  },
  renderHTML({ node }) {
    const attrs = node.attrs || {};
    const heading = attrs.heading || "References";
    const items = Array.isArray(attrs.items) ? attrs.items : [];
    const entryXml = items.map((item) => {
      const txt = (item && (item.markdown || item.plainText)) || "";
      return ["p", {
        class: "mentor-bibliography-entry",
        "data-key": (item && item.key) || ""
      }, txt];
    });
    return ["section", {
      class: "mentor-bibliography",
      "data-mentor-bibliography": "true",
      "data-bibliography-heading": heading,
      "data-bibliography-scope": attrs.scope || "cited",
      "data-bibliography-keys": JSON.stringify(attrs.keys || []),
      "data-bibliography-items": JSON.stringify(items),
      contenteditable: "false"
    }, ["h1", { class: "mentor-bibliography-heading" }, heading], ...entryXml];
  }
});

// Helper: read citation keys (first occurrence order) across the document.
function _collectCitationKeys(doc) {
  const keys = [];
  const seen = new Set();
  doc.descendants((node) => {
    if (!node || !node.type || node.type.name !== "citation") return;
    for (const k of (node.attrs && node.attrs.keys) || []) {
      if (!k || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  });
  return keys;
}
// HTML-side helper used by DOCX & export where we have a raw HTML string,
// not a live PM doc.
function _collectCitationKeysFromHtml(html) {
  const re = /data-citation-raw="([^"]+)"/g;
  const seen = new Set();
  const keys = [];
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    try {
      const raw = m[1];
      const items = parseCitationSyntax(raw).items || [];
      for (const it of items) {
        if (it && it.key && !seen.has(it.key)) { seen.add(it.key); keys.push(it.key); }
      }
    } catch (e) {}
  }
  return keys;
}

// Update existing BibliographyNode attrs in-place. Never inserts new ones —
// user must click "插入文献列表" for the first install. Never rewrites library.
function reconcileBibliographyNode() {
  if (!State.editor) return null;
  const editor2 = State.editor;
  const refConfig = normalizeBibliographyConfig(
    (State.references && State.references.bibliography) || { enabled: false, scope: "cited", heading: "References" }
  );
  if (!refConfig.enabled) return null;
  const keys = _collectCitationKeys(editor2.state.doc);
  const model = buildBibliographyModel(State.references || emptyReferenceManifest(), keys, refConfig);
  let tr = editor2.state.tr;
  let updated = false;
  let count = 0;
  editor2.state.doc.descendants((node, pos) => {
    if (!node.type || node.type.name !== "bibliography") return;
    count += 1;
    const attrs = { ...node.attrs, heading: model.heading, scope: model.scope, keys: model.keys, items: model.items };
    if (JSON.stringify(attrs) !== JSON.stringify(node.attrs)) {
      tr = tr.setNodeMarkup(pos, undefined, attrs);
      updated = true;
    }
  });
  if (updated) {
    tr.setMeta("addToHistory", false);
    tr.setMeta("__bibliographyRecon", true);
    try { editor2.view.dispatch(tr); } catch (e) { /* best-effort */ }
  }
  return { updated, count, model };
}

function insertBibliographyField() {
  if (!State.editor) return false;
  const editor2 = State.editor;
  const refConfig = normalizeBibliographyConfig(
    (State.references && State.references.bibliography) || { enabled: false, scope: "cited", heading: "References" }
  );
  // Reject when an enabled bibliography atom is already present
  let existing = 0;
  editor2.state.doc.descendants((node) => {
    if (node.type && node.type.name === "bibliography" && (node.attrs.enabled || refConfig.enabled)) existing += 1;
  });
  if (existing > 0) return false;
  const newConfig = normalizeBibliographyConfig({ ...refConfig, enabled: true });
  State.references = createReferenceManifest({
    sourceName: (State.references && State.references.source && State.references.source.name) || "",
    sourceFormat: (State.references && State.references.source && State.references.source.format) || "",
    entries: (State.references && State.references.entries) || [],
    bibliography: newConfig
  });
  const model = buildBibliographyModel(State.references, _collectCitationKeys(editor2.state.doc), newConfig);
  const attrs = { heading: model.heading, scope: model.scope, keys: model.keys, items: model.items, enabled: true };
  let placed = false;
  const emptySelection =
    editor2.state.selection && editor2.state.selection.from === editor2.state.selection.to;
  if (emptySelection) {
    // Find last heading boundary; if no headings, append to end of doc
    let appendPos = editor2.state.doc.content.size;
    editor2.state.doc.descendants((node, pos) => {
      if (node.type && node.type.name === "heading" && pos >= 0) appendPos = pos;
    });
    try {
      const tr = editor2.state.tr.insert(appendPos, editor2.schema.nodes.bibliography.create(attrs));
      tr.setMeta("addToHistory", true);
      editor2.view.dispatch(tr);
      placed = true;
    } catch (e) { placed = false; }
  }
  if (!placed) {
    try {
      editor2.chain().focus().insertContent({ type: "bibliography", attrs }).run();
      placed = true;
    } catch (e) { placed = false; }
  }
  if (placed) {
    markDirty();
    scheduleIdbCacheWrite();
    try { if (typeof snapshotActiveTab === "function") snapshotActiveTab(); } catch (_) {}
  }
  return placed;
}

function removeBibliographyField({ confirm = true } = {}) {
  if (!State.editor) return false;
  const editor2 = State.editor;
  let count = 0;
  editor2.state.doc.descendants((node) => {
    if (node.type && node.type.name === "bibliography") count += 1;
  });
  if (count === 0) return false;
  if (confirm) {
    let proceed = true;
    try { proceed = typeof window.confirm === "function" ? window.confirm("确定移除文献列表？只移除显示区，正文引用与文献库不变。") : true; } catch (_) { proceed = true; }
    if (!proceed) return false;
  }
  const refConfig = normalizeBibliographyConfig(
    (State.references && State.references.bibliography) || { enabled: false, scope: "cited", heading: "References" }
  );
  const newConfig = normalizeBibliographyConfig({ ...refConfig, enabled: false });
  State.references = createReferenceManifest({
    sourceName: (State.references && State.references.source && State.references.source.name) || "",
    sourceFormat: (State.references && State.references.source && State.references.source.format) || "",
    entries: (State.references && State.references.entries) || [],
    bibliography: newConfig
  });
  let tr = editor2.state.tr;
    const kills = [];
    editor2.state.doc.descendants((node, pos) => {
      if (node.type && node.type.name === "bibliography") kills.push({ pos, size: node.nodeSize });
    });
    // delete from back so earlier positions stay valid; use full nodeSize
    kills.sort((a, b) => b.pos - a.pos).forEach((k) => { tr = tr.delete(k.pos, k.pos + k.size); });
    tr.setMeta("addToHistory", true);
    tr.setMeta("__bibliographyRecon", true);
    editor2.view.dispatch(tr);
  markDirty();
  scheduleIdbCacheWrite();
  try { if (typeof snapshotActiveTab === "function") snapshotActiveTab(); } catch (_) {}
  return true;
}

function setBibliographyScope(scope) {
  const target = scope === "all" ? "all" : "cited";
  const refConfig = normalizeBibliographyConfig(
    (State.references && State.references.bibliography) || { enabled: false, scope: "cited", heading: "References" }
  );
  const newConfig = normalizeBibliographyConfig({ ...refConfig, scope: target });
  State.references = createReferenceManifest({
    sourceName: (State.references && State.references.source && State.references.source.name) || "",
    sourceFormat: (State.references && State.references.source && State.references.source.format) || "",
    entries: (State.references && State.references.entries) || [],
    bibliography: newConfig
  });
  reconcileBibliographyNode();
  markDirty();
  scheduleIdbCacheWrite();
  try { if (typeof snapshotActiveTab === "function") snapshotActiveTab(); } catch (_) {}
  return newConfig.scope;
}

var State = {
  editor: null,
  currentFile: null,
  // { name, path, handle?, content, annotations, dirty }
  annotations: [],
  // 当前文档所有批注 thread
  activeThreadId: null,
  // 当前在侧栏高亮的 thread
  authorId: localStorage.getItem("Mentor:authorId") || "",
  // 用户唯一 ID, 永不改变
  author: localStorage.getItem("Mentor:author") || "",
  // 显示名, 可改
  // v1.43.51+: 当前文档的参考引用库. v2 manifest 形状:
  //   { version: "2", source: {name, format}, updatedAt,
  //     bibliography: {enabled, scope, heading}, entries: [...] }
  // bibliography 默认 cited scope: 仅显示正文中引用过的条目；
  // scope=all 走完整文献库。enabled=false 时不渲染 References 区块。
  references: createReferenceManifest({ sourceName: "", sourceFormat: "", entries: [], bibliography: { enabled: false, scope: "cited", heading: "References" } }),
  // Default filter: open only — unresolved first; reopen via 已解决/全部 tabs
  filterOpen: true,
  commentListLimit: 60,
  // v1.43.46: 侧栏分窗首屏条数
  commentListWindowStart: 0,
  // v1.43.50: 滑动窗口起点
  commentListShowAll: false,
  filterResolved: false,
  // F18: reply 草稿持久 (Word 行为: 切文档再切回草稿保留)
  // key = threadId, value = textarea 内容
  replyDrafts: {},
  // v1.42: 批注数量硬上限 (perf + UX 双重保险)
  // perf 实测: 200 张卡片时 insert→undo p95 = 108ms (明显卡顿)
  // 用户可在工具栏 ⚙ 改 (50 / 200 / 500 / 1000 / 0=无限制)
  // localStorage 持久, 跨 session 保留
  maxAnnotations: (() => {
    const saved = parseInt(localStorage.getItem("Mentor:maxAnnotations") || "500", 10);
    return [0, 50, 200, 500, 1e3].includes(saved) ? saved : 500;
  })(),
  // H2 fix: 解决卡片临时展开状态 (key = threadId, value = true), 仅 session 内
  expandedThreadIds: {},
  // v4-抽屉: 用户手动折叠的批注 (独立于"已解决自动折叠", docx 风格可手动收起任意卡)
  manuallyCollapsedIds: {},
  // v1.42.6: reattach 流程: 哪条 deleted ann 正在等用户选新文字
  // null = 无 reattach 进行; string = threadId 等待中
  reattachTarget: null,
  // H-undo: inverse-patch history (not full annotation snapshots per step)
  // - past/future store { kind:'inverse-patch', annPatch, markSwap }
  // - doc 文本撤销走 Tiptap 自带 Ctrl+Z, 不入这个 stack
  history: createPatchHistory(100),
  // lastOp: 'pm'|'ann' v1.43.21
  // Validate marks: last transaction changed ranges (incremental path)
  _lastChangedRanges: null,
  _validateScanMode: "full",
  // 'incremental' | 'full' — last _validateMarksAfterEdit scan mode
  saveMode: "unknown",
  // 'handle' | 'download' | 'unknown' | 'mentor-handle' | 'mentor-download'
  readOnlyMode: false,
  // P0-A: 另一 tab 在编辑时启用只读 (Ctrl+S 禁用)
  fileMtime: null,
  // P0-C: 主 .md 的 mtime (last save 时记录的)
  renderMode: "rendered",
  // 'rendered' = WYSIWYG 渲染; 'source' = 显示原始 markdown 源码
  savedSelection: null,
  // P-sel: { from, to, text } — rendered→source 时保存, source→rendered 时尝试恢复
  idbCache: {},
  // P-reload: { [file.name]: { sidecar, updatedAt } } 启动时预热, loadMarkdownIntoEditor 同步读
  // F-media: .mentor v2 支持 media/ 子目录里的图片
  // - 打开 .mentor 时: readMentorZip 返回的 mediaFiles: Map<path, Blob>
  //   全部转成 blob URL, 写入 mediaUrls (path -> blob URL)
  // - 渲染前: markdownToHtml 用 mediaUrls 把 ![](media/x.png) 重写成 ![](blob:...)
  // - 保存时: 反查 src 把 blob URL 还原成原 path, mediaFiles 一起打进新 ZIP
  // - 切/重开文件前: revoke 所有旧 blob URL 防内存泄漏
  mediaUrls: {},
  // { 'media/image5.png': 'blob:http://127.0.0.1:8787/abc-123' }
  mediaFiles: {},
  // { 'media/image5.png': Blob } — save 时用, 跟当前 doc 绑定
  // v1.43.31: 多标签 — 同时开多份文档, 测试/新开不再覆盖 dFC
  tabs: [],
  // [{ id, name, html, annotations, dirty, handle, saveMode, mediaUrls, mediaFiles, ... }]
  activeTabId: null,
  // 磁盘路径提示 (来自 pending-open / handle 名)。v1.45.6: 取消「受保护文档」写盘拦截。
  diskPathHint: "",
  // Runtime-only external path watch (pending-open / server path; never left in URL).
  externalWatchPath: "",
  externalWatchToken: "",
  externalWatch: {
    mode: "off",
    generation: 0,
    lastMtime: 0,
    lastRevision: "",
    lastFingerprint: "",
    writeQuietUntil: 0,
    pending: null,
    resolving: false,
    watcher: null,
    debounceTimer: null,
    retryTimer: null,
    autosavePausedForExternal: false,
  },
  // outline pane tab: 'headings' | 'images'
  outlineTab: "headings",
  // session-only feedback for card → body citation cycle navigation
  citationNavigation: {
    key: "",
    pos: null,
    ordinal: 0,
    total: 0
  },
  // fix-mentor supervision mode (sidecar <file>.mentor.supervision.json)
  supervision: {
    active: false,
    lockMode: "pending-paragraphs",
    pendingThreadIds: [],
    processedThreadIds: [],
    currentThreadId: "",
    phase: "idle",
    message: "",
    tool: "",
    updatedAt: "",
    lastFingerprint: "",
    lastCurrentId: "",
    // health/error from poller snapshot (timer ownership is in supervision-poller.js)
    health: "ok",
    error: "",
  },
};

function mentorBaseName(nameOrPath) {
  if (!nameOrPath) return "";
  const s = String(nameOrPath);
  return s.split("\\").pop().split("/").pop() || s;
}
// modules/io.js — UUID primary key HandleStore + serial queues
var HandleStore = createHandleStore();
var AnnotationStore = createAnnotationStore();
// Atomic body + annotations draft (crash recovery)
var DraftStore = createDraftStore();
// Multi-version snapshots (Word-like version history)
var VersionStore = createVersionStore();
var _idbDocWriteQueue = createSerialWriteQueue();
var md = new MarkdownIt({ html: false, linkify: true, breaks: false });
var HTML_SUBSUP_RE = /^<(sup|sub)>([\s\S]*?)<\/>/i;
function htmlSubsupRule(state, silent) {
  const pos = state.pos;
  const tail = state.src.slice(pos, pos + 256);
  const m = tail.match(HTML_SUBSUP_RE);
  if (!m) return false;
  const tag = m[1].toLowerCase();
  const content = m[2];
  const fullMatchLen = m[0].length;
  if (/<(sup|sub)\b/i.test(content)) return false;
  if (!silent) {
    const tokenName = tag === "sup" ? "sup_inline" : "sub_inline";
    const token = state.push(tokenName, "", 0);
    token.markup = tag;
    token.content = content;
  }
  state.pos = pos + fullMatchLen;
  return true;
}
function superscriptRule(state, silent) {
  const pos = state.pos;
  if (state.src[pos] !== "^") return false;
  if (pos + 1 >= state.posMax) return false;
  if (state.src[pos + 1] === "[") {
    let end2 = pos + 2;
    let depth = 1;
    while (end2 < state.posMax && depth > 0) {
      const ch = state.src[end2];
      if (ch === "\\") {
        end2 += 2;
        continue;
      }
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      if (depth === 0) break;
      end2++;
    }
    if (depth !== 0) return false;
    if (end2 + 1 >= state.posMax) return false;
    if (state.src[end2 + 1] !== "^") return false;
    const content2 = state.src.slice(pos + 2, end2);
    if (!content2) return false;
    if (!silent) {
      const token = state.push("sup_inline", "", 0);
      token.markup = "^[]";
      token.content = content2;
    }
    state.pos = end2 + 2;
    return true;
  }
  const next2 = state.src[pos + 1];
  if (/\s/.test(next2)) return false;
  let end = pos + 1;
  while (end < state.posMax) {
    const ch = state.src[end];
    if (ch === "\\") {
      end += 2;
      continue;
    }
    if (ch === "^") break;
    if (/\s/.test(ch)) return false;
    end++;
  }
  if (end >= state.posMax || end === pos + 1) return false;
  const content = state.src.slice(pos + 1, end);
  if (!silent) {
    const token = state.push("sup_inline", "", 0);
    token.markup = "^";
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}
function subscriptRule(state, silent) {
  const pos = state.pos;
  if (state.src[pos] !== "~") return false;
  if (state.src[pos + 1] === "~") return false;
  if (pos + 1 >= state.posMax) return false;
  if (state.src[pos + 1] === "[") {
    let end2 = pos + 2;
    let depth = 1;
    while (end2 < state.posMax && depth > 0) {
      const ch = state.src[end2];
      if (ch === "\\") {
        end2 += 2;
        continue;
      }
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      if (depth === 0) break;
      end2++;
    }
    if (depth !== 0) return false;
    if (end2 + 1 >= state.posMax) return false;
    if (state.src[end2 + 1] !== "~") return false;
    if (state.src[end2 + 1] === "~" && state.src[end2 + 2] === "~") return false;
    const content2 = state.src.slice(pos + 2, end2);
    if (!content2) return false;
    if (!silent) {
      const token = state.push("sub_inline", "", 0);
      token.markup = "~[]";
      token.content = content2;
    }
    state.pos = end2 + 2;
    return true;
  }
  const next2 = state.src[pos + 1];
  if (/\s/.test(next2)) return false;
  let end = pos + 1;
  while (end < state.posMax) {
    const ch = state.src[end];
    if (ch === "\\") {
      end += 2;
      continue;
    }
    if (ch === "~") break;
    if (/\s/.test(ch)) return false;
    end++;
  }
  if (end >= state.posMax || end === pos + 1) return false;
  if (state.src[end + 1] === "~") return false;
  const content = state.src.slice(pos + 1, end);
  if (!silent) {
    const token = state.push("sub_inline", "", 0);
    token.markup = "~";
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}
function mathInlineRule(state, silent) {
  const pos = state.pos;
  if (state.src[pos] !== "$") return false;
  if (state.src[pos + 1] === "$") return false;
  const prevChar = pos > 0 ? state.src[pos - 1] : "";
  if (/[a-zA-Z0-9]/.test(prevChar)) {
    if (!silent) state.pending += "$";
    state.pos = pos + 1;
    return true;
  }
  let end = pos + 1;
  while (end < state.posMax) {
    if (state.src[end] === "\\") {
      end += 2;
      continue;
    }
    if (state.src[end] === "$") break;
    end++;
  }
  if (end >= state.posMax) {
    if (!silent) state.pending += "$";
    state.pos = pos + 1;
    return true;
  }
  const nextChar = end + 1 < state.posMax ? state.src[end + 1] : "";
  if (/[a-zA-Z0-9]/.test(nextChar)) {
    if (!silent) state.pending += "$";
    state.pos = pos + 1;
    return true;
  }
  const content = state.src.slice(pos + 1, end);
  if (!silent) {
    const token = state.push("math_inline", "span", 0);
    token.markup = "$";
    token.content = content;
  }
  state.pos = end + 1;
  return true;
}
function mathBlockRule(state, startLine, endLine, silent) {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const maxPos = state.eMarks[startLine];
  if (startPos + 2 > maxPos) return false;
  if (state.src.slice(startPos, startPos + 2) !== "$$") return false;
  let line = startLine;
  let content = "";
  let found2 = false;
  while (line < endLine) {
    const lineStart = state.bMarks[line] + state.tShift[line];
    const lineEnd = state.eMarks[line];
    const lineText = state.src.slice(lineStart, lineEnd);
    if (line === startLine) {
      const trimmed = lineText.slice(2);
      if (trimmed.endsWith("$$") && trimmed.length > 2) {
        content = trimmed.slice(0, -2);
        found2 = true;
        break;
      }
      content = trimmed + "\n";
    } else {
      const idx = lineText.indexOf("$$");
      if (idx !== -1) {
        content += lineText.slice(0, idx);
        found2 = true;
        break;
      }
      content += lineText + "\n";
    }
    line++;
  }
  if (!found2) return false;
  state.line = line + 1;
  if (!silent) {
    const token = state.push("math_block", "div", 0);
    token.markup = "$$";
    token.block = true;
    token.content = content.trim();
    token.map = [startLine, state.line];
  }
  return true;
}
md.inline.ruler.after("escape", "html_subsup", htmlSubsupRule);
md.inline.ruler.after("html_subsup", "superscript", superscriptRule);
md.inline.ruler.after("html_subsup", "subscript", subscriptRule);
md.inline.ruler.after("subscript", "math_inline", mathInlineRule);
md.block.ruler.after("blockquote", "math_block", mathBlockRule, {
  alt: ["paragraph", "reference", "blockquote", "list"]
});

// v1.43.51+: Pandoc-style citation inline rule.
// Matches `[@key]`, `[-@key, p. 3]`, `[@a; @b]` etc. as a single token.
// Anything that doesn't fully match (broken brackets, stray `[@`) falls
// through and is left as plain text — same behaviour as markdown-it
// defaults.
const MENTOR_CITATION_RE = /^\[(-?@[\w:.\/-]+(?:\s*,\s*[^;\]]+)?(?:\s*;\s*-?@[\w:.\/-]+(?:\s*,\s*[^;\]]+)?)*)\]/;
function mentorCitationInlineRule(state, silent) {
  const pos = state.pos;
  const tail = state.src.slice(pos);
  const match = tail.match(MENTOR_CITATION_RE);
  if (!match) return false;
  if (!silent) {
    const token = state.push("mentor_citation", "", 0);
    token.markup = "[]";
    token.content = match[0];
  }
  state.pos = pos + match[0].length;
  return true;
}
md.inline.ruler.before("link", "mentor_citation", mentorCitationInlineRule);
md.renderer.rules.mentor_citation = (tokens, idx) => {
  const raw = tokens[idx].content;
  // Quote-escape the raw bytes so an unescaped `&` etc. never leaks through
  // the data-citation-raw attribute.
  const safeRaw = escapeHtml(raw);
  const parsed = (() => {
    try { return parseCitationSyntax(raw); } catch (e) { return { raw, items: [] }; }
  })();
  const keys = JSON.stringify((parsed.items || []).map((item) => item.key));
  // Renderer cannot run an async manifest fetch — when State.references is
  // populated we substitute the author-year label here. Without it we fall
  // back to the raw syntax so users always see *something* meaningful.
  let label = raw;
  let missingKeys = [];
  try {
    if (State && State.references && State.references.entries && State.references.entries.length) {
      const entryMap = new Map(State.references.entries.map((e) => [e.key, e]));
      const formatted = formatCitationLabel(parsed, entryMap);
      label = formatted.text;
      missingKeys = formatted.missingKeys || [];
    }
  } catch (e) {
    label = raw;
  }
  const isMissing = missingKeys.length > 0;
  const safeLabel = escapeHtml(label);
  return `<span class="mentor-citation${isMissing ? " is-missing" : ""}" data-citation-raw="${safeRaw}" data-citation-keys="${escapeHtml(keys)}" data-citation-missing="${escapeHtml(JSON.stringify(missingKeys))}" contenteditable="false">${safeLabel}</span>`;
};
md.renderer.rules.math_inline = (tokens, idx) => {
  const tex = tokens[idx].content;
  return `<span class="katex-wrapper" data-tex="${escapeHtml(tex)}" contenteditable="false"><span class="katex-placeholder">${escapeHtml(tex)}</span></span>`;
};
md.renderer.rules.sup_inline = (tokens, idx) => `<sup>${escapeHtml(tokens[idx].content)}</sup>`;
md.renderer.rules.sub_inline = (tokens, idx) => `<sub>${escapeHtml(tokens[idx].content)}</sub>`;
md.renderer.rules.math_block = (tokens, idx) => {
  const tex = tokens[idx].content;
  return `<div class="katex-wrapper-display" data-tex="${escapeHtml(tex)}" contenteditable="false"><span class="katex-placeholder">${escapeHtml(tex)}</span></div>
`;
};
var turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
turndown.addRule("superscript", {
  filter: "sup",
  replacement: (content) => {
    const inner2 = content;
    if (/[\^~\\\[\]\s]/.test(inner2)) return `^[${inner2}]^`;
    return `^${inner2}^`;
  }
});
turndown.addRule("subscript", {
  filter: "sub",
  replacement: (content) => {
    const inner2 = content;
    if (/[\^~\\\[\]\s]/.test(inner2)) return `~[${inner2}]~`;
    return `~${inner2}~`;
  }
});
turndown.addRule("katex-wrapper-inline", {
  filter: (node) => {
    if (!node || !node.classList) return false;
    return node.classList.contains("katex-wrapper") && !node.classList.contains("katex-wrapper-display");
  },
  replacement: (content, node) => {
    const tex = node.getAttribute("data-tex") || "";
    return tex ? `$${tex}$` : content;
  }
});
turndown.addRule("katex-wrapper-block", {
  filter: (node) => {
    if (!node || !node.classList) return false;
    return node.classList.contains("katex-wrapper-display");
  },
  replacement: (content, node) => {
    const tex = node.getAttribute("data-tex") || "";
    return tex ? `

$$${tex}$$

` : content;
  }
});
// v1.43.51+: CitationNode ↔ Pandoc citation syntax round-trip.
// Must run BEFORE the default text rule so the atom's data-citation-raw
// is emitted as-is, never escaped, never replaced by the display label.
turndown.addRule("mentor-citation", {
  filter: (node) => {
    if (!node || !node.getAttribute) return false;
    return node.nodeName === "SPAN" && node.hasAttribute("data-citation-raw");
  },
  replacement: (_content, node) => node.getAttribute("data-citation-raw") || "[]"
});
// v1.45.7+: Bibliography atom — turn the section back into the semantic
// marker so the markdown source-of-truth remains the marker, not APA text.
turndown.addRule("mentor-bibliography", {
  filter: (node) => {
    if (!node || !node.getAttribute) return false;
    return node.nodeName === "SECTION" && node.getAttribute("data-mentor-bibliography") === "true";
  },
  replacement: () => `\n\n${BIBLIOGRAPHY_MARKER}\n\n`
});
turndown.addRule("gfm-table", {
  filter: "table",
  replacement: (content, node) => {
    if (!node || !node.rows || node.rows.length === 0) return content;
    const headerRow = (() => {
      const thead = node.tHead;
      if (thead && thead.rows.length > 0) return thead.rows[0];
      const firstRow = node.rows[0];
      if (firstRow && firstRow.cells.length > 0 && firstRow.cells[0].tagName === "TH") {
        return firstRow;
      }
      return null;
    })();
    const headerCells = headerRow ? Array.from(headerRow.cells).map((c) => extractCellText(c).trim() || " ") : null;
    let dataRows;
    if (headerRow && headerRow.parentNode === node.tHead) {
      dataRows = Array.from(node.tBodies).flatMap((tb) => Array.from(tb.rows));
    } else {
      dataRows = Array.from(node.rows).slice(headerRow ? 1 : 0);
    }
    const colCount = Math.max(
      headerCells ? headerCells.length : 0,
      ...dataRows.map((r) => r.cells.length)
    );
    const rows = [];
    if (headerCells) {
      rows.push(headerCells);
      rows.push(Array.from({ length: colCount }, () => "---"));
    }
    for (const row of dataRows) {
      const cells = Array.from(row.cells).map((c) => extractCellText(c).trim() || " ");
      while (cells.length < colCount) cells.push(" ");
      rows.push(cells);
    }
    return rows.map((r) => "| " + r.join(" | ") + " |").join("\n") + "\n\n";
  }
});
function extractCellText(cell) {
  const katexInline = cell.querySelector(".katex-wrapper:not(.katex-wrapper-display)");
  if (katexInline && katexInline.getAttribute("data-tex")) {
    const onlyKatex = cell.children.length === 1 && cell.firstElementChild === katexInline;
    if (onlyKatex) return "$" + katexInline.getAttribute("data-tex") + "$";
  }
  const katexBlock = cell.querySelector(".katex-wrapper-display");
  if (katexBlock && katexBlock.getAttribute("data-tex") && cell.children.length === 1) {
    return "$$" + katexBlock.getAttribute("data-tex") + "$$";
  }
  return turndown.turndown(cell.innerHTML).replace(/\n+/g, " ").trim();
}
var AnnotationMark = Mark.create({
  name: "annotation",
  inclusive: false,
  // 不延伸到光标位置，避免新增文字继承 mark
  exitable: true,
  // Same-type annotation marks normally replace one another in ProseMirror.
  // Allow distinct thread marks to coexist over nested/overlapping text.
  excludes: "",
  // 光标可以移出 mark
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-thread-id"),
        renderHTML: (attrs) => attrs.threadId ? { "data-thread-id": attrs.threadId } : {}
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-resolved") === "true",
        renderHTML: (attrs) => ({ "data-resolved": attrs.resolved ? "true" : "false" })
      },
      // P3-A: 把 'is-active' 提升为 schema attr, 避免 ProseMirror view rebuild 时丢失
      // highlightActiveMark 通过 setMark + dispatch 同步这个 attr, 切换瞬间 renderHTML
      // 会输出 is-active class, 新 mark 元素天然带 class.
      active: {
        default: false,
        parseHTML: (el) => el.classList.contains("is-active"),
        renderHTML: (attrs) => attrs.active ? { "data-active": "true" } : {}
      },
      // P-D10: mark 颜色按 author 分配 (Word 8 色自动)
            // 8 色循环分配, 同 author 同色 — human 批注用; AI/review 由 data-thread-type 覆盖为模式色
            authorColor: {
              default: 0,
              parseHTML: (el) => parseInt(el.getAttribute("data-author-color") || "0", 10),
              renderHTML: (attrs) => ({ "data-author-color": String(attrs.authorColor || 0) })
            },
            // Mode identity on the mark so body highlight matches card rail (AI cyan / review violet)
            threadType: {
              default: null,
              parseHTML: (el) => {
                const t = el.getAttribute("data-thread-type");
                return t === "ai" || t === "review" ? t : null;
              },
              renderHTML: (attrs) =>
                attrs.threadType === "ai" || attrs.threadType === "review"
                  ? { "data-thread-type": attrs.threadType }
                  : {}
            }
          };
        },
        parseHTML() {
          return [{ tag: "span[data-thread-id]" }];
        },
        renderHTML({ HTMLAttributes, node }) {
          const resolved = HTMLAttributes["data-resolved"] === "true" || node?.attrs?.resolved === true;
          const active = HTMLAttributes["data-active"] === "true" || node?.attrs?.active === true;
          const t = HTMLAttributes["data-thread-type"] || node?.attrs?.threadType || null;
          const modeCls = t === "ai" ? " is-ai" : t === "review" ? " is-review" : "";
          return ["span", {
            class: `annotation-mark${resolved ? " is-resolved" : ""}${active ? " is-active" : ""}${modeCls}`,
            ...HTMLAttributes
          }, 0];
        }
      });
      var annotationBubbleKey = new PluginKey("annotation-bubble");
      var AnnotationBubblePlugin = new Plugin({
        key: annotationBubbleKey,
        // mark + 气泡永远显示 (无开关). 保留 plugin state init 仅为向后兼容 setMeta 调用.
        state: {
          init() {
            return {};
          },
          apply(tr2, prev) {
            return prev;
          }
        },
        props: {
          decorations(state) {
            const { doc: doc5 } = state;
            const decorations = [];
            const seenThreads = /* @__PURE__ */ new Set();
            try {
              doc5.descendants((node, pos) => {
                if (!node.isText) return;
                const annMarks = node.marks.filter((m) => m.type.name === "annotation");
                for (const annMark of annMarks) {
                  const threadId = annMark.attrs.threadId;
                  if (!threadId || seenThreads.has(threadId)) continue;
                  seenThreads.add(threadId);
                  try {
                    decorations.push(Decoration.widget(pos, () => {
                      const el = document.createElement("span");
                      const tt = annMark.attrs.threadType;
                      el.className = `annotation-bubble${annMark.attrs.resolved ? " is-resolved" : ""}${tt === "ai" ? " is-ai" : tt === "review" ? " is-review" : ""}`;
                      el.setAttribute("data-annotation-thread-id", String(threadId));
                      el.setAttribute("data-author-color", String(annMark.attrs.authorColor || 0));
                      if (tt === "ai" || tt === "review") el.setAttribute("data-thread-type", tt);
                      el.setAttribute("aria-hidden", "true");
                      return el;
                    }, { side: -1, ignoreSelection: true, stopEvent: () => true }));
                  } catch (err) {
                    console.warn("[AnnotationBubble] widget 创建失败:", err);
                  }
                }
              });
            } catch (err) {
              console.warn("[AnnotationBubble] descendants \u5931\u8D25:", err);
            }
            return DecorationSet.create(doc5, decorations);
          }
        }
      });
var AnnotationBubbleExtension = Extension.create({
  name: "annotation-bubble",
  addProseMirrorPlugins() {
    return [AnnotationBubblePlugin];
  }
});
var ActiveHighlightExtension = Extension.create({
  name: "active-annotation-highlight",
  addProseMirrorPlugins() {
    return [
      createActiveHighlightPlugin(
        () => State.activeThreadId,
        (tid) => {
          try {
            const thr = (State.annotations || []).find((a) => a && a.threadId === tid);
            return thr ? (threadTypeOf(thr) || thr.threadType || null) : null;
          } catch (_) {
            return null;
          }
        }
      )
    ];
  }
});
var SupervisionExtension = Extension.create({
  name: "mentor-supervision",
  addProseMirrorPlugins() {
    return [createSupervisionPlugin()];
  }
});
var AnnotationAnchorExtension = Extension.create({
  name: "annotation-anchor-map",
  addProseMirrorPlugins() {
    return [
      createAnnotationAnchorPlugin({
        getThreads: () => State.annotations || [],
        onAnchorsChanged: (patches, sourceDoc) => {
          if (!patches || !patches.length || !State.annotations) return;
          if (State._suspendAnnValidate) return;
          // Plugin callbacks are microtask-deferred. Ignore stale patches from a
          // document that has already been replaced/switched.
          if (!State.editor || !sourceDoc || State.editor.state.doc !== sourceDoc) return;
          let dirty = false;
          for (const p of patches) {
            const t = State.annotations.find((x) => x && x.threadId === p.threadId);
            if (!t) continue;
            // Full-replace orphans are noise — only honor moved ranges here.
            // True deletion is decided by mark validation.
            if (p.status === "orphaned") continue;
            if (p.range) {
              const nextStatus = p.status === "moved" ? "moved" : (t.anchor && t.anchor.status) || "attached";
              syncThreadAnchorEvidence(t, sourceDoc, p.range, {
                exact: t.text || "",
                status: nextStatus
              });
              if (Array.isArray(t.ranges) && t.ranges.length === 1) {
                t.ranges = [{ from: p.range.from, to: p.range.to }];
              }
              dirty = true;
            }
          }
          if (dirty) {
            try {
              if (typeof scheduleRenderComments === "function") scheduleRenderComments();
            } catch (_) {}
          }
        }
      })
    ];
  }
});
function collectImageAnchors(doc5, from2, to) {
  const anchors = [];
  if (from2 == null || to == null || from2 > to) return anchors;
  try {
    doc5.nodesBetween(from2, to, (node, pos) => {
      if (node.type.name === "image") {
        anchors.push({
          from: pos,
          to: pos + node.nodeSize,
          src: node.attrs.src || "",
          alt: node.attrs.alt || "",
          title: node.attrs.title || ""
        });
      }
    });
  } catch (e) {
  }
  return anchors;
}
function imageAnchorLabel(anc) {
  if (!anc) return "[\u56FE\u7247]";
  const a = (anc.alt || "").trim();
  if (a) return a;
  const ti = (anc.title || "").trim();
  if (ti) return ti;
  return "[\u56FE\u7247]";
}
function applyImageSrcChange(attrs) {
  const ed = State.editor;
  if (!ed || !attrs || !attrs.src) return false;
  const sel = ed.state.selection;
  const replacing = isImageNodeSelection(sel);
  const pos = replacing ? sel.from : null;
  const ok = ed.chain().focus().setImage(attrs).run();
  if (replacing && typeof pos === "number") {
    const doc5 = ed.state.doc;
    for (const ann of State.annotations || []) {
      if (!ann || !Array.isArray(ann.imageAnchors)) continue;
      const hit = ann.imageAnchors.some((a) => a && a.from === pos);
      if (!hit) continue;
      resyncImageAnchors(ann, doc5);
      if (ann.deleted || ann.invalid || ann.fuzzy) {
        ann.deleted = false;
        ann.invalid = false;
        ann.fuzzy = false;
        ann.invalidReason = void 0;
      }
      if ((!ann.ranges || !ann.ranges.length) && ann.imageAnchors && ann.imageAnchors.length === 1) {
        const lab = imageAnchorLabel(ann.imageAnchors[0]);
        if (lab) ann.text = lab;
      }
    }
    try {
      refreshAnnotationImageDecos();
    } catch (e) {
    }
    try {
      renderCommentList();
    } catch (e) {
    }
  }
  return ok;
}
function isImageNodeSelection(sel) {
  if (!sel) return false;
  if (sel.node && sel.node.type && sel.node.type.name === "image") return true;
  try {
    if (sel.from != null && sel.to === sel.from + 1 && State.editor) {
      const n = State.editor.state.doc.nodeAt(sel.from);
      if (n && n.type.name === "image") return true;
    }
  } catch (e) {
  }
  return false;
}
function positionFloatCommentAt(editor2, from2, sel) {
  const btn = $("#float-comment-btn");
  const editorPane = $("#editor-pane");
  if (!btn || !editorPane || !editor2) return false;
  try {
    let leftV = null, topV = null;
    if (isImageNodeSelection(sel) || sel && sel.node && sel.node.type.name === "image") {
      let dom = null;
      try {
        dom = editor2.view.nodeDOM(sel.from != null ? sel.from : from2);
      } catch (e) {
        dom = null;
      }
      const img = dom && (dom.tagName === "IMG" ? dom : dom.querySelector && dom.querySelector("img"));
      if (img) {
        const r = img.getBoundingClientRect();
        const paneRect = editorPane.getBoundingClientRect();
        topV = r.top - paneRect.top + editorPane.scrollTop + 8;
        leftV = r.left - paneRect.left + editorPane.scrollLeft + Math.max(24, r.width - 48);
      }
    }
    if (leftV == null) {
      const start = editor2.view.coordsAtPos(from2);
      const paneRect = editorPane.getBoundingClientRect();
      topV = start.top - paneRect.top + editorPane.scrollTop - 32;
      leftV = start.left - paneRect.left + editorPane.scrollLeft;
    }
    btn.style.top = `${Math.max(0, topV)}px`;
    btn.style.left = `${Math.max(0, leftV)}px`;
    btn.classList.remove("hidden");
    return true;
  } catch (e) {
    btn.classList.add("hidden");
    return false;
  }
}
function refreshAnnotationImageDecos() {
  const ed = State.editor;
  if (!ed || !ed.view) return;
  try {
    const root2 = ed.view.dom;
    root2.querySelectorAll("img[data-annotation-image], img.annotation-image").forEach((el) => {
      el.classList.remove("annotation-image", "is-active", "is-resolved");
      el.removeAttribute("data-thread-id");
      el.removeAttribute("data-thread-type");
      el.removeAttribute("data-annotation-image");
    });
    const anns = State.annotations || [];
    const activeTid = State.activeThreadId;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== "image") return;
      const src = node.attrs.src || "";
      const nodeEnd = pos + node.nodeSize;
      const hits = [];
      for (const a of anns) {
        if (!a || typeof a !== "object" || !a.threadId || a.invalid) continue;
        let hit = false;
        const anchors = Array.isArray(a.imageAnchors) ? a.imageAnchors : [];
        for (const anc of anchors) {
          if (!anc) continue;
          if (typeof anc.from === "number" && anc.from === pos) {
            hit = true;
            break;
          }
          // Once an image anchor has a live PM position, position is the identity.
          // Falling back to src here decorates every copied image with the same src.
          if (typeof anc.from !== "number" && anc.src && src && anc.src === src) {
            hit = true;
            break;
          }
        }
        if (!hit && a.range && typeof a.range.from === "number") {
          if (a.range.from === pos && a.range.to === nodeEnd) hit = true;
          else if (a.range.from <= pos && a.range.to >= nodeEnd) hit = true;
        }
        if (!hit && Array.isArray(a.ranges)) {
          for (const r of a.ranges) {
            if (r && r.from <= pos && r.to >= nodeEnd) {
              hit = true;
              break;
            }
            if (r && r.from === pos && r.to === nodeEnd) {
              hit = true;
              break;
            }
          }
        }
        if (hit) hits.push(a);
      }
      if (!hits.length) return;
      let dom = null;
      try {
        dom = ed.view.nodeDOM(pos);
      } catch (e) {
        dom = null;
      }
      if (!dom) return;
      const img = dom.tagName === "IMG" ? dom : dom.querySelector && dom.querySelector("img");
      if (!img) return;
      const active = hits.some((h) => h.threadId === activeTid);
      const resolved = hits.every((h) => h.resolved);
      const primary = hits.find((h) => h.threadId === activeTid) || hits[0];
      img.classList.add("annotation-image");
      if (active) img.classList.add("is-active");
      if (resolved) img.classList.add("is-resolved");
      img.setAttribute("data-annotation-image", "1");
      img.setAttribute("data-thread-id", String(primary.threadId));
      const threadType = threadTypeOf(primary);
      if (threadType) img.setAttribute("data-thread-type", threadType);
    });
  } catch (e) {
    console.warn("[AnnotationImage] refresh failed:", e);
  }
}
var $ = (sel) => document.querySelector(sel);
var $$ = (sel) => Array.from(document.querySelectorAll(sel));
function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(s) { return escapeHtml(s); }

/** Short stable label from UUID (matches author chip when display name unset). */
function authorIdToShortName(id) {
  if (!id) return "";
  return String(id).replace(/-/g, "").slice(0, 8);
}

/** Identity written into new comments (name may be empty until user sets it). */
function currentAuthorPayload() {
  return {
    id: State.authorId || "",
    name: (State.author || "").trim()
  };
}

/**
 * Normalize author for display.
 * Prefer stored name → same-user current State.author → id short → 匿名.
 * Fixes cards showing 匿名 while chip already shows id-derived / user name.
 */
function normalizeAuthor(a) {
  let id = "";
  let name = "";
  if (a == null || a === "") {
    // keep empty
  } else if (typeof a === "string") {
    name = a.trim();
  } else if (typeof a === "object") {
    id = String(a.id || "").trim();
    name = String(a.name || "").trim();
  } else {
    name = String(a).trim();
  }
  if (!name) {
    if (id && State.authorId && id === State.authorId) {
      const me = (State.author || "").trim();
      if (me) name = me;
    }
  }
  if (!name && id) name = authorIdToShortName(id);
  if (!name) name = "\u533F\u540D";
  return { id, name };
}
function authorName(a) {
  return normalizeAuthor(a).name;
}
const THEMES = new Set(["light", "system", "dark"]);
function getTheme() {
  const saved = localStorage.getItem("Mentor:theme") || "light";
  return THEMES.has(saved) ? saved : "light";
}
function setTheme(theme, options = {}) {
  const next = THEMES.has(theme) ? theme : "light";
  document.documentElement.dataset.theme = next;
  if (options.persist !== false) localStorage.setItem("Mentor:theme", next);
  syncSettingsActiveState();
  return next;
}
function isAiAuthor(a, aiAuthor = "AI Reviewer") {
  const normalized = normalizeAuthor(a);
  const name = String(normalized.name || "").trim().toLowerCase().replace(/[ _-]+/g, "");
  const id = String(normalized.id || "").trim().toLowerCase().replace(/[ _-]+/g, "");
  const configured = String(aiAuthor || "AI Reviewer").trim().toLowerCase().replace(/[ _-]+/g, "");
  return name === configured || name === "aireviewer" || id === "aireviewer";
}
function threadTypeClass(thread) {
  const t = threadTypeOf(thread);
  if (!t) return "";
  if (t === "ai") return " is-ai";
  if (t === "review") return " is-review";
  return "";
}
function threadTypeOf(thread) {
  if (!thread || typeof thread !== "object") return null;
  if (thread.threadType === "ai" || thread.threadType === "review") return thread.threadType;
  const visit = (comments) => {
    for (const comment of comments || []) {
      const type = getMarkerType(comment && comment.body);
      if (type) return type;
      const nestedType = visit(comment?.replies || comment?.comments || comment?.children || []);
      if (nestedType) return nestedType;
    }
    return null;
  };
  return visit(Array.isArray(thread.comments) ? thread.comments : []);
}
/**
 * Legacy sidecars already store threadType. Preserve it without rewriting user
 * comment bodies; this is a non-destructive compatibility path.
 */
function migrateLegacyThread(thread) {
  if (!thread || typeof thread !== "object") return thread;
  if (thread.threadType !== "ai" && thread.threadType !== "review") delete thread.threadType;
  return thread;
}
function normalizeLegacyThreadType(thread) {
  if (!thread || typeof thread !== "object") return thread;
  if (thread.threadType === "ai" || thread.threadType === "review") return thread;
  const marker = threadTypeOf({ ...thread, threadType: null });
  if (marker) thread.threadType = marker;
  else delete thread.threadType;
  return thread;
}
function prepareAnnotationForMarkerMode(annotation) {
  if (!annotation || typeof annotation !== "object") return annotation;
  const copy = typeof structuredClone === "function"
    ? structuredClone(annotation)
    : JSON.parse(JSON.stringify(annotation));
  return normalizeLegacyThreadType(migrateLegacyThread(copy));
}
/** Persistent AI cards and legacy AI Reviewer roots accept bare human work. */
function isAiCard(thread, aiAuthor = "AI Reviewer") {
  if (!thread || typeof thread !== "object") return false;
  if (thread.threadType === "ai") return true;
  const root = Array.isArray(thread.comments) ? thread.comments[0] : null;
  return !!root && isAiAuthor(root.author, aiAuthor);
}
/** Does this human comment count as pending AI work on this card? */
function humanCommentIsWork(thread, comment, aiAuthor = "AI Reviewer") {
  if (!comment || isAiAuthor(comment.author, aiAuthor)) return false;
  const body = String(comment.body || "").trim();
  if (!body) return false;
  if (isAiCard(thread, aiAuthor)) return true;
  return bodyHasMarker(body);
}
/**
 * Unanswered explicit-marker work on a thread (window rule mirrors mentor_io).
 */
function threadNeedsAiReply(thread, aiAuthor = "AI Reviewer") {
  if (!thread || thread.resolved) return false;
  const walk = (list) => {
    if (!Array.isArray(list) || !list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || typeof c !== "object") continue;
      const nested = c.replies || c.comments || c.children || [];
      if (isAiAuthor(c.author, aiAuthor)) {
        if (walk(nested)) return true;
        continue;
      }
      if (!humanCommentIsWork(thread, c, aiAuthor)) {
        if (walk(nested)) return true;
        continue;
      }
      // answered if direct nested AI reply
      let answered = Array.isArray(nested) && nested.some((r) => r && isAiAuthor(r.author, aiAuthor));
      // or sibling-window AI reply before next human work item
      if (!answered) {
        for (let j = i + 1; j < list.length; j++) {
          const n = list[j];
          if (!n) continue;
          if (isAiAuthor(n.author, aiAuthor)) {
            answered = true;
            break;
          }
          if (humanCommentIsWork(thread, n, aiAuthor)) break;
        }
      }
      if (!answered) return true;
      if (walk(nested)) return true;
    }
    return false;
  };
  return walk(thread.comments || []);
}
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad2 = (n) => String(n).padStart(2, "0");
  const full = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  // 未来时间 / 异常 → 回退绝对时间
  if (diffSec < -60) return full;
  if (diffSec < 45) return "刚刚";
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`;
  // 同年只显示 月-日 时:分；跨年显示完整
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return full;
}
function updateCommentCounts() {
  const safeAnn = State.annotations.filter((a) => a && typeof a === "object");
  const all = safeAnn.length;
  const open2 = safeAnn.filter((a) => !a.resolved).length;
  const resolved = safeAnn.filter((a) => a.resolved).length;
  const allBtn = document.querySelector('[data-count-for="all"]');
  if (allBtn) allBtn.textContent = all;
  const openBtn = document.querySelector('[data-count-for="open"]');
  if (openBtn) openBtn.textContent = open2;
  const resolvedBtn = document.querySelector('[data-count-for="resolved"]');
  if (resolvedBtn) resolvedBtn.textContent = resolved;
}
function syncFilterTabsFromCheckboxes() {
  let mode = "open";
  if (State.filterOpen && State.filterResolved) mode = "all";
  else if (!State.filterOpen && State.filterResolved) mode = "resolved";
  else if (State.filterOpen && !State.filterResolved) mode = "open";
  else mode = "none";
  document.querySelectorAll(".filter-tab").forEach((btn) => {
    const selected = btn.dataset.filterTab === mode;
    btn.classList.toggle("is-active", selected);
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    btn.tabIndex = selected ? 0 : -1;
  });
}
function showToast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), ms);
}
function setStatus(left, right) {
  if (left !== void 0) $("#status-left").textContent = left;
  if (right !== void 0) $("#status-right").textContent = right;
}
var _docMetaTimer = null;
function updateDocMeta({ immediate = false } = {}) {
  if (immediate) {
    if (_docMetaTimer) {
      clearTimeout(_docMetaTimer);
      _docMetaTimer = null;
    }
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
  const docText = State.editor.state.doc.textContent || "";
  const wordCount = docText.trim() ? docText.trim().split(/\s+/).filter(Boolean).length : 0;
  const lineCount = docText.split("\n").length;
  const annCount = (State.annotations || []).length;
  const name = State.currentFile.name || "";
  const imgs = State.editor.view?.dom?.querySelectorAll("img") || [];
  const imgCount = imgs.length;
  const imgLoaded = Array.from(imgs).filter((i) => i.complete && i.naturalWidth > 0).length;
  const mediaUrlCount = Object.keys(State.mediaUrls || {}).length;
  let statusRight = `${name} \xB7 ${wordCount} \u8BCD \xB7 ${lineCount} \u884C \xB7 ${annCount} \u6279\u6CE8`;
  if (imgCount > 0) {
    statusRight += ` \xB7 \u{1F5BC} ${imgLoaded}/${imgCount} (media=${mediaUrlCount})`;
  } else if (mediaUrlCount > 0) {
    statusRight += ` \xB7 \u{1F5BC} media=${mediaUrlCount} \u4F46 DOM \u65E0 img`;
  }
  $("#status-right").textContent = statusRight;
}
function markDirty() {
  if (_liveSync && _liveSync.applying) return;
  if (State.currentFile) {
    State.currentFile.dirty = true;
    // Generation stamp: only markClean after a save if gen is unchanged
    // (edits during async zip/write must keep the dirty flag).
    State.currentFile.dirtyGen = (State.currentFile.dirtyGen || 0) + 1;
    $("#dirty-indicator").classList.add("is-dirty");
    $("#current-file-name").textContent = State.currentFile.name;
    try {
      const t = State.tabs.find((x) => x && x.id === State.activeTabId);
      if (t) {
        t.dirty = true;
        t.name = State.currentFile.name;
      }
      renderDocTabs();
    } catch {
    }
    updateTreeDirtyDots();
    scheduleIdbCacheWrite();
    try {
      scheduleLiveSyncPublish();
    } catch {
    }
  }
  try { syncToolbarActionState(); } catch {}
}
function resyncImageAnchors(ann, doc5) {
  if (!ann || !doc5 || !Array.isArray(ann.imageAnchors) || ann.imageAnchors.length === 0) {
    return { resolved: 0, changed: false };
  }
  let changed = false;
  const out = [];
  const usedPos = /* @__PURE__ */ new Set();
  const pushLive = (node, pos) => {
    if (!node || node.type.name !== "image" || usedPos.has(pos)) return false;
    usedPos.add(pos);
    out.push({
      from: pos,
      to: pos + node.nodeSize,
      src: node.attrs.src || "",
      alt: node.attrs.alt || "",
      title: node.attrs.title || ""
    });
    return true;
  };
  for (const anc of ann.imageAnchors) {
    if (!anc) {
      changed = true;
      continue;
    }
    let hit = false;
    if (typeof anc.from === "number") {
      try {
        const n = doc5.nodeAt(anc.from);
        if (n && n.type.name === "image") {
          const srcMatches = !anc.src || (n.attrs.src || "") === anc.src || mediaPathForSrc(n.attrs.src || "") === mediaPathForSrc(anc.src);
          const altMatches = !anc.alt || (n.attrs.alt || "") === anc.alt;
          const titleMatches = !anc.title || (n.attrs.title || "") === anc.title;
          if (srcMatches && altMatches && titleMatches) {
            const prev = anc;
            pushLive(n, anc.from);
            const cur = out[out.length - 1];
            if (!prev || prev.src !== cur.src || prev.alt !== cur.alt || prev.title !== cur.title || prev.from !== cur.from || prev.to !== cur.to) changed = true;
            hit = true;
          }
        }
      } catch (e) {
      }
    }
    if (!hit && anc.src) {
      const matches = [];
      const want = anc.src;
      const wantPath = mediaPathForSrc(want);
      const wantBlob = State.mediaUrls && wantPath && State.mediaUrls[wantPath] || (want.startsWith("blob:") ? want : "");
      const wantBase = (wantPath || want).split("/").pop();
      doc5.descendants((n, pos) => {
        if (n.type.name !== "image" || usedPos.has(pos)) return;
        const s = n.attrs.src || "";
        const sPath = mediaPathForSrc(s);
        const sBase = (sPath || s).split("/").pop();
        const srcMatch = s === want || s === wantBlob || sPath === wantPath || wantPath && sPath === wantPath || wantBase && sBase === wantBase && wantBase.includes(".");
        if (!srcMatch) return;
        const altMatch = !!(anc.alt && n.attrs.alt === anc.alt);
        const titleMatch = !!(anc.title && n.attrs.title === anc.title);
        const distance = ann.range && typeof ann.range.from === "number" ? Math.abs(pos - ann.range.from) : Number.MAX_SAFE_INTEGER;
        matches.push({ n, pos, altMatch, titleMatch, distance });
      });
      if (matches.length) {
        // Same src/path is common after copy/paste. Prefer stable metadata, then the
        // previous aggregate range. Only positional order is the final fallback.
        matches.sort((a, b) =>
          Number(b.altMatch) - Number(a.altMatch) ||
          Number(b.titleMatch) - Number(a.titleMatch) ||
          a.distance - b.distance ||
          a.pos - b.pos
        );
        const best = matches[0];
        pushLive(best.n, best.pos);
        if (best.pos !== anc.from) changed = true;
        hit = true;
      }
    }
    if (!hit && ann.range && typeof ann.range.from === "number" && typeof ann.range.to === "number") {
      const lo = Math.min(ann.range.from, ann.range.to);
      const hi = Math.max(ann.range.from, ann.range.to);
      try {
        doc5.nodesBetween(lo, hi, (n, pos) => {
          if (hit) return false;
          if (n.type.name === "image" && !usedPos.has(pos)) {
            pushLive(n, pos);
            changed = true;
            hit = true;
            return false;
          }
        });
      } catch (e) {
      }
    }
    if (!hit) changed = true;
  }
  if (out.length === 0 && ann.range && typeof ann.range.from === "number") {
    const recovered = collectImageAnchors(doc5, ann.range.from, ann.range.to);
    if (recovered.length) {
      out.push(...recovered);
      changed = true;
    }
  }
  if (changed || out.length !== ann.imageAnchors.length) {
    ann.imageAnchors = out;
    changed = true;
  } else {
    for (let i = 0; i < out.length; i++) {
      const a = ann.imageAnchors[i], b = out[i];
      if (!a || a.from !== b.from || a.to !== b.to || a.src !== b.src || a.alt !== b.alt) {
        ann.imageAnchors = out;
        changed = true;
        break;
      }
    }
  }
  if (out.length) {
    const from2 = Math.min(...out.map((a) => a.from));
    const to = Math.max(...out.map((a) => a.to));
    if (!ann.range || ann.range.from !== from2 || ann.range.to !== to) {
      const pureImage = !ann.ranges || !ann.ranges.length;
      if (pureImage) {
        ann.range = { from: from2, to };
        changed = true;
      } else if (ann.range) {
        const nf = Math.min(ann.range.from, from2);
        const nt = Math.max(ann.range.to, to);
        if (nf !== ann.range.from || nt !== ann.range.to) {
          ann.range = { from: nf, to: nt };
          changed = true;
        }
      }
    }
  }
  return { resolved: out.length, changed };
}
function _annOverlapsChangedRanges(ann, changedRanges, pad = 48) {
  if (!changedRanges || !changedRanges.length) return true;
  const ranges = [];
  if (ann.range && typeof ann.range.from === "number" && typeof ann.range.to === "number") {
    ranges.push(ann.range);
  }
  if (Array.isArray(ann.ranges)) {
    for (const r of ann.ranges) {
      if (r && typeof r.from === "number") ranges.push(r);
    }
  }
  if (Array.isArray(ann.imageAnchors)) {
    for (const a of ann.imageAnchors) {
      if (a && typeof a.from === "number") ranges.push({ from: a.from, to: a.to });
    }
  }
  if (!ranges.length) return false;
  for (const ar of ranges) {
    const from = (ar.from || 0) - pad;
    const to = (ar.to || 0) + pad;
    for (const cr of changedRanges) {
      const cFrom = (cr.from || 0) - pad;
      const cTo = (cr.to || 0) + pad;
      if (from < cTo && cFrom < to) return true;
    }
  }
  return false;
}
function _validateMarksAfterEdit(editor2, opts) {
  if (!State.annotations || State.annotations.length === 0) return false;
  if (State._suspendAnnValidate) return false;
  const phase = opts && opts.phase || "full";
  const markType = editor2.schema.marks.annotation;
  const doc5 = editor2.state.doc;
  let hasAnyImageAnn = false;
  // Incremental: light phase + changed ranges → scan only those ranges
  const changedRanges = opts && opts.changedRanges || State._lastChangedRanges || null;
  const useIncremental = phase === "light" && changedRanges && changedRanges.length > 0;
  const INCREMENTAL_PAD = 48;
  State._validateScanMode = useIncremental ? "incremental" : "full";
  const scan = scanAnnotationMarksInRanges(
    doc5,
    markType,
    useIncremental ? changedRanges : null,
    INCREMENTAL_PAD
  );
  const threadFound = scan.threadFound;
  const threadCurrentText = scan.threadCurrentText;
  const threadMarkRange = scan.threadMarkRange;
  const textCount = scan.textCount;
  const occupiedRanges = [];
  for (const [tid, r] of threadMarkRange) occupiedRanges.push({ from: r.from, to: r.to, tid });
  let joinedCache = null;
  const getJoined = () => {
    if (joinedCache === null) {
      try {
        joinedCache = doc5.textBetween(0, doc5.content.size, " ");
      } catch (e) {
        joinedCache = "";
      }
    }
    return joinedCache;
  };
  let changed = false;
  let uiChanged = false;
  const uiTouched = /* @__PURE__ */ new Set();
  const touchUi = (ann) => {
    uiChanged = true;
    if (ann && ann.threadId) uiTouched.add(ann.threadId);
  };
  const pendingRemarks = [];
  for (const ann of State.annotations) {
    if (!ann || typeof ann !== "object" || !ann.threadId) continue;
    // Incremental: marks outside the scanned window were not visited — never
    // treat them as mark-missing / text-deleted. Full pass (48ms) will cover them.
    if (useIncremental) {
      const foundInScan = threadFound.has(ann.threadId);
      const touches = _annOverlapsChangedRanges(ann, changedRanges, INCREMENTAL_PAD);
      if (!foundInScan && !touches) continue;
    }
    const hasImg = Array.isArray(ann.imageAnchors) && ann.imageAnchors.length > 0;
    if (hasImg) hasAnyImageAnn = true;
    let imgSync = { resolved: 0, changed: false };
    if (hasImg) {
      imgSync = resyncImageAnchors(ann, doc5);
      if (imgSync.changed) changed = true;
    }
    const treatAsImageAnn = hasImg && !threadFound.has(ann.threadId) && (!ann.ranges || ann.ranges.length === 0);
    if (treatAsImageAnn) {
      if (imgSync.resolved > 0 && ann.imageAnchors && ann.imageAnchors.length > 0) {
        if (ann.imageAnchors.length === 1) {
          const lab = imageAnchorLabel(ann.imageAnchors[0]);
          if (!ann.text || ann.text === "[\u56FE\u7247]" || ann.deleted || ann.invalid) {
            if (lab && ann.text !== lab) {
              ann.text = lab;
              changed = true;
            }
          }
        }
        if (ann.deleted || ann.invalid || ann.fuzzy) {
          ann.deleted = false;
          ann.fuzzy = false;
          ann.invalid = false;
          ann.invalidReason = void 0;
          changed = true;
          touchUi(ann);
        }
        continue;
      }
      if (!ann.deleted) {
        ann.deleted = true;
        ann.fuzzy = false;
        ann.invalid = true;
        ann.invalidReason = ann.invalidReason || "image-deleted";
        changed = true;
        touchUi(ann);
      }
      continue;
    }
    if (threadFound.has(ann.threadId)) {
      const live = threadMarkRange.get(ann.threadId);
      let rangeMoved = false;
      if (live && (!ann.range || ann.range.from !== live.from || ann.range.to !== live.to)) {
        ann.range = { from: live.from, to: live.to };
        rangeMoved = true;
        changed = true;
      }
      const currentText = (() => {
        const literal = threadCurrentText.get(ann.threadId) || "";
        if (!Array.isArray(ann.ranges) || ann.ranges.length <= 1) return literal;
        const pieces = [];
        for (const r of ann.ranges) {
          if (!r || typeof r.from !== "number" || typeof r.to !== "number" || r.from >= r.to) continue;
          try {
            const piece = doc5.textBetween(r.from, r.to, " ");
            if (piece) pieces.push(piece);
          } catch (_) {}
        }
        return pieces.length ? pieces.join(" ") : literal;
      })();
      const textMatches = currentText === ann.text;
      if (live) {
        const status = textMatches && ann.invalidReason !== "text-edited"
          ? ((ann.anchor && ann.anchor.status) === "moved" ? "moved" : "attached")
          : "edited";
        const oldPrefix = ann.prefix || "";
        const oldSuffix = ann.suffix || "";
        const oldAnchorQuote = JSON.stringify(ann.anchor && ann.anchor.quote || null);
        const oldAnchorPosition = JSON.stringify(ann.anchor && ann.anchor.position || null);
        const oldAnchorStatus = ann.anchor && ann.anchor.status || "";
        const oldAnchorConfidence = ann.anchor && ann.anchor.confidence;
        syncThreadAnchorEvidence(ann, doc5, live, {
          exact: currentText || ann.text || "",
          status,
          confidence: status === "edited" ? 0.75 : 1
        });
        if (
          oldPrefix !== (ann.prefix || "") ||
          oldSuffix !== (ann.suffix || "") ||
          oldAnchorQuote !== JSON.stringify(ann.anchor && ann.anchor.quote || null) ||
          oldAnchorPosition !== JSON.stringify(ann.anchor && ann.anchor.position || null) ||
          oldAnchorStatus !== (ann.anchor && ann.anchor.status || "") ||
          oldAnchorConfidence !== (ann.anchor && ann.anchor.confidence)
        ) changed = true;
        if (Array.isArray(ann.ranges) && ann.ranges.length === 1) {
          ann.ranges = [{ from: live.from, to: live.to }];
        }
      }
      if (textMatches) {
        if (ann.deleted) {
          ann.deleted = false;
          changed = true;
          touchUi(ann);
        }
        // Sticky: partial mark edits auto-sync ann.text to the new mark
        // content, so a later light→full validate would see textMatches and
        // wrongly clear fuzzy. Keep text-edited until reattach / resolve UX.
        const stickyEdited = ann.invalidReason === "text-edited";
        if ((ann.fuzzy || ann.invalid) && !stickyEdited) {
          ann.fuzzy = false;
          ann.invalid = false;
          ann.invalidReason = void 0;
          changed = true;
          touchUi(ann);
        }
        if (rangeMoved && live) {
          changed = true;
        }
      } else {
        if (ann.text !== currentText) {
          ann.text = currentText;
          changed = true;
          touchUi(ann);
        }
        if (live) {
          syncThreadAnchorEvidence(ann, doc5, live, {
            exact: currentText,
            status: "edited",
            confidence: 0.75
          });
        }
        if (!ann.fuzzy || ann.invalidReason !== "text-edited") {
          ann.fuzzy = true;
          ann.deleted = false;
          ann.invalidReason = "text-edited";
          changed = true;
          touchUi(ann);
        }
        if (ann.invalid) {
          ann.invalid = false;
          changed = true;
          touchUi(ann);
        }
      }
      continue;
    }
    let textFound = false;
    if (ann.text) {
      if ((textCount.get(ann.text) || 0) > 0) textFound = true;
      else {
        for (const [nodeText, cnt] of textCount) {
          if (cnt > 0 && nodeText && nodeText.includes(ann.text)) {
            textFound = true;
            break;
          }
        }
      }
      if (!textFound) {
        if (getJoined().includes(ann.text)) textFound = true;
      }
    }
    if (!textFound) {
      if (!ann.deleted) {
        ann.deleted = true;
        ann.fuzzy = false;
        ann.invalid = true;
        ann.invalidReason = ann.invalidReason || "text-deleted";
        changed = true;
        touchUi(ann);
      }
    } else {
      if (phase === "light") {
        // Soft only: full pass will reattach or confirm missing.
        // Stamping invalid here flashes false "锚点失效" banners mid-edit.
        if (ann.deleted) {
          ann.deleted = false;
          changed = true;
          touchUi(ann);
        }
        if (!ann.fuzzy) {
          ann.fuzzy = true;
          changed = true;
        }
        continue;
      }
      let rePos = null;
      try {
        rePos = findAnnotationRange(doc5, ann);
      } catch (e) {
        rePos = null;
      }
      // Overlapping comments are supported. A mark held by another thread is only
      // a conflict when both threads resolve to the exact same range; partial/nested
      // overlap is valid and must not block recovery.
      if (rePos && typeof rePos.from === "number" && typeof rePos.to === "number" && rePos.from < rePos.to && !occupiedRanges.some((o) => o.tid !== ann.threadId && o.from === rePos.from && o.to === rePos.to)) {
        pendingRemarks.push({
          threadId: ann.threadId,
          from: rePos.from,
          to: rePos.to,
          resolved: !!ann.resolved,
          authorColor: annotationAuthorColor(ann),
          fuzzy: !!rePos.fuzzy
        });
        occupiedRanges.push({ from: rePos.from, to: rePos.to, tid: ann.threadId });
        syncThreadAnchorEvidence(ann, doc5, rePos, {
          exact: ann.text || "",
          status: rePos.fuzzy ? "edited" : "attached",
          confidence: rePos.fuzzy ? 0.5 : 1
        });
        const wantFuzzy = !!rePos.fuzzy;
        if (ann.deleted) {
          ann.deleted = false;
          changed = true;
        }
        if (ann.invalid !== wantFuzzy) {
          ann.invalid = wantFuzzy;
          changed = true;
        }
        if (ann.fuzzy !== wantFuzzy) {
          ann.fuzzy = wantFuzzy;
          changed = true;
        }
        if (wantFuzzy) ann.invalidReason = ann.invalidReason || "mark-reattached-fuzzy";
        else ann.invalidReason = void 0;
        changed = true;
        touchUi(ann);
      } else if (!ann.fuzzy || !ann.invalid) {
        ann.deleted = false;
        ann.fuzzy = true;
        ann.invalid = true;
        ann.invalidReason = ann.invalidReason || (rePos ? "mark-collision" : "mark-missing");
        changed = true;
        touchUi(ann);
      }
    }
  }
  if (pendingRemarks.length) {
    uiChanged = true;
    for (const r of pendingRemarks) if (r && r.threadId) uiTouched.add(r.threadId);
    try {
      let tr2 = editor2.state.tr;
      let any = false;
      for (const r of pendingRemarks) {
        if (r.from < 0 || r.to > editor2.state.doc.content.size || r.from >= r.to) continue;
        const _thr = State.annotations.find((a) => a && a.threadId === r.threadId);
        tr2 = tr2.addMark(r.from, r.to, markType.create(annotationMarkAttrs(_thr, {
          threadId: r.threadId,
          resolved: !!r.resolved,
          authorColor: r.authorColor
        })));
        any = true;
      }
      if (any) {
        tr2.setMeta("addToHistory", false);
        tr2.setMeta("__activeMarkSync", true);
        editor2.view.dispatch(tr2);
        changed = true;
      }
    } catch (e) {
      console.warn("[_validateMarksAfterEdit] re-mark", e);
    }
  }
  if (hasAnyImageAnn || phase === "full") {
    try {
      refreshAnnotationImageDecos();
    } catch (e) {
    }
  }
  _validateMarksAfterEdit._lastChanged = changed;
  _validateMarksAfterEdit._lastUiChanged = uiChanged;
  _validateMarksAfterEdit._lastUiTouchedIds = uiTouched;
  return uiChanged;
}
var _validateFullTimer = null;
var VALIDATE_FULL_DEBOUNCE_MS = 48;

  var _broadcastChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mentor-save") : null;
function scheduleValidateMarks(editor2, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const immediate = !!o.immediate;
  const forceFull = o.phase === "full" || !!o.force || immediate;
  if (o.changedRanges) State._lastChangedRanges = o.changedRanges;
  if (o.transaction) {
    const cr = collectChangedRanges(o.transaction);
    if (cr) State._lastChangedRanges = cr;
  }
  if (!editor2) editor2 = State.editor;
  if (!editor2) return false;
  if (immediate || forceFull) {
    if (_broadcastChannel) _broadcastChannel.postMessage({type: "validate", phase: forceFull ? "full" : "light"});
    if (_validateFullTimer) {
      clearTimeout(_validateFullTimer);
      _validateFullTimer = null;
    }
    const ch = _validateMarksAfterEdit(editor2, { phase: "full", changedRanges: null });
    if (ch && o.render !== false) {
      try {
        scheduleCommentListUi({ immediate: true });
      } catch (e) {
      }
    }
    return ch;
  }
  let lightChanged = false;
  try {
    lightChanged = !!_validateMarksAfterEdit(editor2, {
      phase: "light",
      changedRanges: State._lastChangedRanges
    });
  } catch (e) {
    console.warn("[scheduleValidateMarks] light", e);
  }
  if (lightChanged && o.render !== false) {
    try {
      scheduleCommentListUi();
    } catch (e) {
    }
  }
  if (_validateFullTimer) return lightChanged;
  _validateFullTimer = setTimeout(() => {
    _validateFullTimer = null;
    const ed = State.editor;
    if (!ed || State._suspendAnnValidate) return;
    try {
      const ch = _validateMarksAfterEdit(ed, { phase: "full" });
      if (ch) scheduleCommentListUi({ immediate: true });
    } catch (e) {
      console.warn("[scheduleValidateMarks] full", e);
    }
  }, VALIDATE_FULL_DEBOUNCE_MS);
  return lightChanged;
}
var _commentListUiTimer = null;
var COMMENT_LIST_UI_DEBOUNCE_MS = 24;
function scheduleCommentListUi(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  if (o.immediate) {
    if (_commentListUiTimer) {
      clearTimeout(_commentListUiTimer);
      _commentListUiTimer = null;
    }
    return flushCommentListUi();
  }
  if (_commentListUiTimer) return false;
  _commentListUiTimer = setTimeout(() => {
    _commentListUiTimer = null;
    flushCommentListUi();
  }, COMMENT_LIST_UI_DEBOUNCE_MS);
  return false;
}
function flushCommentListUi() {
  const ids = _validateMarksAfterEdit._lastUiTouchedIds;
  if (ids && ids.size > 0 && ids.size <= 12) {
    let allOk = true;
    for (const tid of ids) {
      const ann = (State.annotations || []).find((a) => a && a.threadId === tid);
      if (!ann || !patchCommentCard(ann)) {
        allOk = false;
        break;
      }
    }
    if (allOk) {
      try {
        updateCommentCounts();
      } catch (e) {
      }
      return false;
    }
  }
  renderCommentList();
  return true;
}
function patchCommentCard(ann) {
  if (!ann || !ann.threadId) return false;
  const list = document.getElementById("comment-list");
  if (!list) return false;
  const el = list.querySelector(`.comment-thread[data-thread="${ann.threadId}"]`);
  if (!el) return false;
  el.classList.toggle("is-fuzzy", !!ann.fuzzy && !ann.deleted);
  el.classList.toggle("is-deleted", !!ann.deleted);
  el.classList.toggle("is-resolved", !!ann.resolved);
  el.classList.toggle("is-pending", !!ann.pending);
  el.classList.toggle("is-active", State.activeThreadId === ann.threadId);
  const type = threadTypeOf(ann);
  el.classList.toggle("is-ai", type === "ai");
  el.classList.toggle("is-review", type === "review");
  if (type) el.dataset.threadType = type;
  else delete el.dataset.threadType;
  const qt = el.querySelector(".comment-quote-text");
  if (qt) {
    const tx = String(ann.text || "");
    qt.textContent = tx.slice(0, 200) + (tx.length > 200 ? "\u2026" : "");
  }
  let banner = el.querySelector(".deleted-banner, .fuzzy-banner");
  const wantDeleted = !!ann.deleted;
  const wantFuzzy = !wantDeleted && !!ann.fuzzy;
  if (wantDeleted) {
    if (!banner || !banner.classList.contains("deleted-banner")) {
      if (banner) banner.remove();
      const div = document.createElement("div");
      div.className = "deleted-banner";
      const safeThreadId = escapeHtml(ann.threadId);
      div.innerHTML = '\u{1F4CD} \u539F\u6587\u5DF2\u88AB\u5220\u9664 - <button class="link-btn" data-act="reattach" data-thread="' + safeThreadId + '">\u91CD\u65B0\u9009\u62E9\u6B63\u6587</button> \xB7 <button class="link-btn link-danger" data-act="delete-orphan" data-thread="' + safeThreadId + '">\u5220\u9664</button>';
      el.insertBefore(div, el.firstChild);
    }
  } else if (wantFuzzy) {
    if (!banner || !banner.classList.contains("fuzzy-banner")) {
      if (banner) banner.remove();
      const div = document.createElement("div");
      div.className = "fuzzy-banner";
      div.textContent = "\u26A0 \u4F4D\u7F6E\u53EF\u80FD\u504F\u79FB - \u8BF7\u68C0\u67E5\u6587\u6863";
      el.insertBefore(div, el.firstChild);
    }
  } else if (banner) {
    banner.remove();
  }
  return true;
}
var _idbCacheWriteTimer = null;
var _idbCacheWriting = false;
/** Sync snapshot of current doc draft — must run before any tab/state switch. */
function captureAtomicDraftForCurrent() {
  if (!State.currentFile) return null;
  const documentId = State.currentFile.documentId || State.activeTabId || State.currentFile.name;
  const name = State.currentFile.name || "untitled.md";
  let body = State.currentFile.content || "";
  try {
    const flushed = flushSourceView();
    body = flushed !== null ? flushed : (State.editor ? htmlToMarkdownMedia(State.editor.getHTML()) : body);
  } catch (_) {}
  const annotations = buildAnnotationsSidecar();
  return {
    documentId,
    name,
    body,
    annotations,
    sidecar: {
      version: "1",
      document: name,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      author: { id: State.authorId, name: State.author },
      annotations
    },
    references: JSON.parse(JSON.stringify(State.references || emptyReferenceManifest())),
    updatedAt: Date.now()
  };
}
/** Persist a previously captured draft record (never re-reads State.currentFile). */
async function persistAtomicDraftRecord(record) {
  if (!record?.documentId) return null;
  return _idbDocWriteQueue.enqueue(record.documentId, async () => {
    State.idbCache[record.documentId] = record;
    if (record.name) State.idbCache[record.name] = record;
    await DraftStore.putDraft(record);
    await AnnotationStore.put(record.name, record.sidecar, record.documentId);
    return record;
  });
}
/** Atomic body+ann draft write (DraftStore) + legacy AnnotationStore sidecar. */
async function putAtomicDraftForCurrent(opts = {}) {
  return persistAtomicDraftRecord(captureAtomicDraftForCurrent());
}
let _workspacePersistTimer = null;
let _restoringWorkspaceSession = false;
function queueActiveDraftPersist() {
  const record = captureAtomicDraftForCurrent();
  return record ? persistAtomicDraftRecord(record) : Promise.resolve(null);
}
async function persistWorkspaceSessionNow() {
  if (_restoringWorkspaceSession) return null;
  try { snapshotActiveTab(); } catch (_) {}
  const session = createWorkspaceSession({ tabs: State.tabs, activeTabId: State.activeTabId });
  if (!session.tabs.length) {
    await HandleStore.removeWorkspaceSession();
    return session;
  }
  await HandleStore.putWorkspaceSession(session);
  return session;
}
function scheduleWorkspaceSessionPersist() {
  if (_restoringWorkspaceSession) return;
  clearTimeout(_workspacePersistTimer);
  _workspacePersistTimer = setTimeout(() => {
    _workspacePersistTimer = null;
    persistWorkspaceSessionNow().catch((error) =>
      console.warn("[workspace] persist failed", error)
    );
  }, 50);
}
async function restoreDraftIfAny(documentId, name) {
  if (!documentId && !name) return null;
  try {
    let row = documentId ? await DraftStore.getDraft(documentId) : null;
    if (!row && name) row = await DraftStore.getDraft(name);
    if (!row) return null;
    return {
      documentId: row.documentId,
      name: row.name,
      body: row.body || "",
      annotations: row.annotations || (row.sidecar && row.sidecar.annotations) || [],
      sidecar: row.sidecar || null,
      references: normalizeReferenceManifest(row.references || emptyReferenceManifest()),
      updatedAt: row.updatedAt || 0
    };
  } catch (e) {
    console.warn("[DraftStore] restore failed:", e);
    return null;
  }
}
/**
 * Decide whether crash-recovery should use IDB draft or disk bytes.
 * Disk is the cross-tool source of truth; draft only wins when clearly newer.
 * @returns {'disk'|'draft'|'prompt'}
 */
function resolveDraftConflict({ diskBody, diskAnns, diskMtime, draft, forceDisk } = {}) {
  if (forceDisk || !draft) return "disk";
  const draftBody = typeof draft.body === "string" ? draft.body : "";
  const draftAnns = draft.annotations || (draft.sidecar && draft.sidecar.annotations) || [];
  const diskBodyStr = typeof diskBody === "string" ? diskBody : "";
  const diskAnnsArr = Array.isArray(diskAnns) ? diskAnns : [];
  const bodyDiff = draftBody.length > 0 && draftBody !== diskBodyStr;
  const annDiff = draftAnns.length > 0 && JSON.stringify(draftAnns) !== JSON.stringify(diskAnnsArr);
  if (!bodyDiff && !annDiff) return "disk";
  const dAt = Number(draft.updatedAt || 0);
  const mAt = diskMtime == null || diskMtime === "" ? null : Number(diskMtime);
  if (mAt != null && !Number.isNaN(mAt) && dAt > 0) {
    if (dAt > mAt) return "draft";
    return "disk"; // disk newer or equal → external/tool win
  }
  return "prompt";
}


function mediaPathForSrc(src) {
  if (!src || typeof src !== "string") return "";
  if (src.startsWith("media/")) return src;
  if (State.mediaUrls) {
    for (const [path2, blobUrl] of Object.entries(State.mediaUrls)) {
      if (blobUrl === src) return path2;
    }
  }
  return src;
}
/** Normalize a candidate path to media/* or empty. */
function normalizeMediaPath(path2) {
  if (!path2 || typeof path2 !== "string") return "";
  let s = path2.trim().replace(/\\/g, "/");
  if (s.startsWith("./")) s = s.slice(2);
  // strip query/hash
  s = s.split("#")[0].split("?")[0];
  if (!s.startsWith("media/")) return "";
  if (s.includes("..") || s.startsWith("media//")) return "";
  return s;
}
/**
 * Collect media/* paths still referenced by body md/html, blob reverse map,
 * PM/image anchors in annotations, or live editor image nodes.
 */
function collectReferencedMediaPaths({
  mdText = "",
  html = "",
  annotations = null,
  mediaUrls = null,
  editor = null
} = {}) {
  const refs = /* @__PURE__ */ new Set();
  const add = (raw) => {
    const pth = normalizeMediaPath(raw);
    if (pth) refs.add(pth);
  };
  const reverseBlob = /* @__PURE__ */ new Map();
  const urls = mediaUrls || State.mediaUrls || {};
  for (const [path2, blobUrl] of Object.entries(urls)) {
    if (blobUrl) reverseBlob.set(blobUrl, path2);
  }
  const addMaybeBlob = (src) => {
    if (!src || typeof src !== "string") return;
    if (src.startsWith("blob:") && reverseBlob.has(src)) {
      add(reverseBlob.get(src));
      return;
    }
    add(src);
  };
  const scanText = (text2) => {
    if (!text2 || typeof text2 !== "string") return;
    // markdown images
    const mdRe = /!\[[^\]]*\]\((media\/[^)\s]+)\)/g;
    let m;
    while ((m = mdRe.exec(text2)) !== null) add(m[1]);
    // bare media/ in src-like contexts
    const bareRe = /(?:src|href)=["'](media\/[^"']+)["']/gi;
    while ((m = bareRe.exec(text2)) !== null) add(m[1]);
    // loose media/foo.ext tokens (html/md leftovers)
    const looseRe = /(?:^|[\s("'=])(media\/[A-Za-z0-9_./\u4e00-\u9fff-]+\.(?:png|jpe?g|gif|webp|svg|bmp|pdf))/gi;
    while ((m = looseRe.exec(text2)) !== null) add(m[1]);
    // blob: URLs
    const blobRe = /blob:[^\s"')]+/g;
    while ((m = blobRe.exec(text2)) !== null) addMaybeBlob(m[0]);
  };
  scanText(mdText);
  scanText(html);
  let annList = [];
  if (Array.isArray(annotations)) annList = annotations;
  else if (annotations && Array.isArray(annotations.annotations)) annList = annotations.annotations;
  else if (Array.isArray(State.annotations)) annList = State.annotations;
  for (const ann of annList) {
    if (!ann || typeof ann !== "object") continue;
    if (Array.isArray(ann.imageAnchors)) {
      for (const a of ann.imageAnchors) {
        if (a && a.src) addMaybeBlob(a.src);
      }
    }
  }
  const ed = editor || State.editor;
  if (ed && ed.state && ed.state.doc) {
    try {
      ed.state.doc.descendants((node) => {
        if (node && node.type && node.type.name === "image" && node.attrs && node.attrs.src) {
          addMaybeBlob(node.attrs.src);
        }
      });
    } catch (_) {}
  }
  return refs;
}
/** Keep only mediaFiles keys present in referenced Set. */
function pruneMediaFiles(mediaFiles, referenced) {
  const out = {};
  const ref = referenced instanceof Set ? referenced : new Set(referenced || []);
  for (const [k, v] of Object.entries(mediaFiles || {})) {
    if (ref.has(k)) out[k] = v;
  }
  return out;
}
function filterMediaFilesForArchive(mediaFiles, {
  mdText = "",
  html = "",
  annotations = null,
  mediaUrls = null,
  editor = null
} = {}) {
  const refs = collectReferencedMediaPaths({ mdText, html, annotations, mediaUrls, editor });
  return pruneMediaFiles(mediaFiles, refs);
}
function serializeImageAnchors(anchors) {
  if (!Array.isArray(anchors) || !anchors.length) return void 0;
  return anchors.map((a) => {
    if (!a || typeof a !== "object") return null;
    const out = {
      from: a.from,
      to: a.to,
      src: mediaPathForSrc(a.src || ""),
      alt: a.alt || "",
      title: a.title || ""
    };
    return out;
  }).filter(Boolean);
}
function serializeAnnotationThread(t) {
  if (!t || typeof t !== "object" || !t.threadId) return null;
  const o = {
    threadId: t.threadId,
    text: t.text,
    prefix: t.prefix || "",
    suffix: t.suffix || "",
    resolved: !!t.resolved,
    createdAt: t.createdAt,
    comments: Array.isArray(t.comments) ? t.comments : []
  };
  if (t.threadType === "ai" || t.threadType === "review") o.threadType = t.threadType;
  if (t.range && typeof t.range.from === "number" && typeof t.range.to === "number") {
    o.range = { from: t.range.from, to: t.range.to };
  }
  if (Array.isArray(t.ranges) && t.ranges.length) {
    const doc = State.editor && State.editor.state && State.editor.state.doc;
    o.ranges = t.ranges.map((r) => {
      const out = { from: r.from, to: r.to };
      if (r.text != null) out.text = String(r.text);
      if (r.prefix != null) out.prefix = String(r.prefix);
      if (r.suffix != null) out.suffix = String(r.suffix);
      if (doc && typeof r.from === "number" && typeof r.to === "number" && r.from < r.to) {
        try { out.text = doc.textBetween(r.from, r.to, " "); } catch (_) {}
        const context = computeContextAt(doc, r.from, r.to);
        out.prefix = context.prefix;
        out.suffix = context.suffix;
      }
      return out;
    });
  }
  const ia = serializeImageAnchors(t.imageAnchors);
  if (ia && ia.length) o.imageAnchors = ia;
  if (t.deleted) o.deleted = true;
  if (t.invalid) o.invalid = true;
  if (t.invalidReason) o.invalidReason = t.invalidReason;
  if (t.fuzzy) o.fuzzy = true;
  // Multi-evidence anchor (v1 optional); legacy flags remain authoritative for old readers
  if (t.anchor && typeof t.anchor === "object") {
    const a = t.anchor;
    o.anchor = {
      version: a.version || "1",
      quote: a.quote ? {
        exact: a.quote.exact != null ? a.quote.exact : t.text,
        prefix: a.quote.prefix != null ? a.quote.prefix : t.prefix || "",
        suffix: a.quote.suffix != null ? a.quote.suffix : t.suffix || ""
      } : {
        exact: t.text,
        prefix: t.prefix || "",
        suffix: t.suffix || ""
      },
      position: a.position && typeof a.position.from === "number" ? {
        from: a.position.from,
        to: a.position.to,
        startAssoc: a.position.startAssoc != null ? a.position.startAssoc : 1,
        endAssoc: a.position.endAssoc != null ? a.position.endAssoc : -1
      } : t.range ? {
        from: t.range.from,
        to: t.range.to,
        startAssoc: 1,
        endAssoc: -1
      } : void 0,
      structure: a.structure || void 0,
      status: a.status || "attached",
      confidence: a.confidence != null ? a.confidence : 1,
      updatedAt: a.updatedAt || t.createdAt || nowISO()
    };
    const proj = projectLegacyFlags(o.anchor.status);
    if (proj.invalid && !o.invalid) o.invalid = true;
    if (proj.deleted && !o.deleted) o.deleted = true;
    if (proj.fuzzy && !o.fuzzy) o.fuzzy = true;
    if (proj.invalidReason && !o.invalidReason) o.invalidReason = proj.invalidReason;
  }
  return o;
}
function buildAnnotationsSidecar() {
  return State.annotations.filter((x) => x && typeof x === "object" && x.threadId).map(serializeAnnotationThread).filter(Boolean);
}
function collectLiveAnnotationAudit() {
  if (!State.editor) {
    return auditAnnotationInvariants({ threads: State.annotations || [], marks: [], doc: "" });
  }
  const doc5 = State.editor.state.doc;
  const markType = State.editor.schema.marks.annotation;
  const marks = [];
  doc5.descendants((node, pos) => {
    if (!node.isText || !node.marks) return;
    for (const m of node.marks) {
      if (m.type === markType && m.attrs && m.attrs.threadId) {
        marks.push({
          threadId: m.attrs.threadId,
          from: pos,
          to: pos + node.nodeSize,
          text: node.text || ""
        });
      }
    }
  });
  // Keep physical pieces; auditAnnotationInvariants coalesces by threadId so
  // nested/partial-overlap fragmentation is not treated as duplicate anchors.
  const sep = String.fromCharCode(10);
  const plain = doc5.textBetween(0, doc5.content.size, sep, sep);
  return auditAnnotationInvariants({ threads: State.annotations || [], marks, doc: plain });
}
function exportAnchorDiagnosis() {
  const audit = collectLiveAnnotationAudit();
  const threads = (State.annotations || []).map((t) => ({
    threadId: t.threadId,
    text: t.text,
    prefix: t.prefix,
    suffix: t.suffix,
    range: t.range,
    fuzzy: !!t.fuzzy,
    invalid: !!t.invalid,
    deleted: !!t.deleted,
    invalidReason: t.invalidReason,
    anchorStatus: t.anchor && t.anchor.status,
    anchor: t.anchor || null
  }));
  return {
    version: "1",
    exportedAt: nowISO(),
    healthy: !!(audit && audit.healthy),
    errors: audit && audit.errors || [],
    threads,
    archive: {
      restoreMode: State._archiveRestoreMode || "legacy",
      verification: State._archiveVerification || null
    }
  };
}
function createSaveSnapshot(options = {}) {
  if (!State.currentFile) throw new Error("\u672A\u6253\u5F00\u6587\u6863");
  // Hard-block structurally inconsistent archives before write
  // skipHardAudit: diagnostic / 另存副本 only — never use for in-place write-back.
  try {
    const audit = collectLiveAnnotationAudit();
    State._lastAnchorAudit = audit;
    if (!options.skipHardAudit && audit && !audit.healthy) {
      const hardCodes = new Set([
        "duplicate-threadId",
        "duplicate-mark",
        "mark-unknown-thread",
        "mark-collision",
        "ambiguous-has-mark",
        "orphan-status-has-mark",
        "range-mismatch",
        "text-mismatch",
        "attached-missing-mark"
      ]);
      const hard = (audit.errors || []).filter((e) => e && hardCodes.has(e.code));
      if (hard.length) {
        console.warn("[anchor-audit] hard invariant failures", hard);
        const err = new Error("\u6279\u6CE8\u951A\u70B9\u4E0D\u4E00\u81F4\uFF0C\u5DF2\u505C\u6B62\u4FDD\u5B58");
        err.code = "ANNOTATION_ANCHOR_AUDIT_FAILED";
        err.audit = hard;
        throw err;
      }
    }
  } catch (e) {
    if (e && e.code === "ANNOTATION_ANCHOR_AUDIT_FAILED") throw e;
    console.warn("[anchor-audit]", e);
  }
  const sourceMarkdown = flushSourceView();
  const currentFile = State.currentFile;
  const liveHtml = State.editor ? State.editor.getHTML() : "";
  // Archive must store media/* not session blob: URLs (reload would break all figures).
  const documentHtml = htmlWithMediaPaths(liveHtml, State.mediaUrls);
  const mdText = sourceMarkdown !== null ? sourceMarkdown : htmlToMarkdownMedia(liveHtml);
  const sidecar = {
    version: "1",
    document: currentFile.name,
    updatedAt: nowISO(),
    author: { id: State.authorId, name: State.author },
    annotations: buildAnnotationsSidecar()
  };
  const mediaFiles = filterMediaFilesForArchive(State.mediaFiles || {}, {
    mdText,
    html: documentHtml,
    annotations: sidecar,
    mediaUrls: State.mediaUrls,
    editor: State.editor
  });
  return {
    tabId: State.activeTabId,
    documentId: currentFile.documentId || State.activeTabId,
    name: currentFile.name,
    handle: currentFile.handle || null,
    dirtyGen: currentFile.dirtyGen || 0,
    saveMode: State.saveMode,
    fileMtime: State.fileMtime,
    mdText,
    documentHtml,
    sidecar: JSON.parse(JSON.stringify(sidecar)),
    mediaFiles,
    references: JSON.parse(JSON.stringify(State.references || emptyReferenceManifest()))
  };
}
function activeDocumentMatches(snapshot) {
  return !!snapshot && !!State.currentFile && State.activeTabId === snapshot.tabId &&
    (State.currentFile.documentId || State.activeTabId) === snapshot.documentId;
}
function scheduleIdbCacheWrite() {
  if (_idbCacheWriteTimer) clearTimeout(_idbCacheWriteTimer);
  const record = captureAtomicDraftForCurrent();
  if (record) {
    const cacheKeys = [record.documentId, record.name].filter(Boolean);
    for (const key of cacheKeys) {
      State.idbCache[key] = record;
    }
  }
  _idbCacheWriteTimer = setTimeout(async () => {
    _idbCacheWriteTimer = null;
    if (_idbCacheWriting) return;
    if (!record) return;
    _idbCacheWriting = true;
    try {
      await persistAtomicDraftRecord(record);
    } catch (e) {
      console.warn("[P-reload] debounce IDB put \u5931\u8D25:", e);
    } finally {
      _idbCacheWriting = false;
    }
  }, 200);
}
function markClean() {
  if (State.currentFile) {
    State.currentFile.dirty = false;
    $("#dirty-indicator").classList.remove("is-dirty");
    $("#current-file-name").textContent = State.currentFile.name;
    try {
      const t = State.tabs.find((x) => x && x.id === State.activeTabId);
      if (t) {
        t.dirty = false;
        t.name = State.currentFile.name;
      }
      renderDocTabs();
    } catch {
    }
    updateTreeDirtyDots();
  }
  try { syncToolbarActionState(); } catch {}
}
// ---------------------------------------------------------------------------
// Save / Autosave — Office-style split (classic local Word):
//  1. Autosave = AutoRecover only: DraftStore/IDB draft. Never writes the
//     official .mentor/.md handle and never markClean.
//  2. Manual save (Ctrl+S / Save) = user-confirmed commit to disk handle
//     (or download). markClean + last user baseline.
//  3. Office-like AutoSave toggle (default ON): when on + write handle,
//     debounced autosave writes disk and markClean (OneDrive-style).
//     When off or no handle: draft-only AutoRecover (dirty stays).
//  4. Exit/close: dirty relative to last confirmed/disk-autosave baseline → prompt.
//  5. Disk writes remain single-flight; dirtyGen-safe on save.
//  6. Draft autosave failures: throttle toast, keep timer.
// ---------------------------------------------------------------------------
var _autosaveTimer = null;
var AUTOSAVE_INTERVAL = 3e4;
var AUTOSAVE_DEBOUNCE_ALLOWED = [1e3, 3e3, 5e3, 1e4, 3e4];
function getAutosaveDebounceMs() {
  const v = parseInt(localStorage.getItem("Mentor:autosaveDebounce") || "5000", 10);
  return AUTOSAVE_DEBOUNCE_ALLOWED.includes(v) ? v : 5e3;
}
/** Office AutoSave preference. Default ON (missing key => true). */
function getAutoSaveEnabled() {
  try {
    const v = localStorage.getItem("Mentor:autoSave");
    if (v == null || v === "") return true;
    return v === "1" || v === "true" || v === "on";
  } catch (_) {
    return true;
  }
}
/** Version-history master preference. Default ON (missing key => true). */
function getVersionHistoryEnabled() {
  try {
    const v = localStorage.getItem("Mentor:versionHistory");
    if (v == null || v === "") return true;
    return v === "1" || v === "true" || v === "on";
  } catch (_) {
    return true;
  }
}
/** Retention policy from settings (falls back to defaults). */
function getVersionPolicyFromSettings() {
  const pol = Object.assign({}, DEFAULT_VERSION_POLICY);
  try {
    const a = parseInt(localStorage.getItem("Mentor:versionMaxAutosave") || "", 10);
    if (Number.isFinite(a) && a >= 0) pol.maxAutosave = a;
    const n = parseInt(localStorage.getItem("Mentor:versionMaxNamed") || "", 10);
    if (Number.isFinite(n) && n >= 0) pol.maxNamed = n;
  } catch (_) {}
  return pol;
}
function setVersionHistoryEnabled(on) {
  const next = !!on;
  try { localStorage.setItem("Mentor:versionHistory", next ? "1" : "0"); } catch (_) {}
  try { syncSettingsActiveState(); } catch (_) {}
  return next;
}
function setVersionMaxAutosave(n) {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
  try { localStorage.setItem("Mentor:versionMaxAutosave", String(v)); } catch (_) {}
  try { syncSettingsActiveState(); } catch (_) {}
  return v;
}
function setAutoSaveEnabled(on, { silent = false } = {}) {
  const next = !!on;
  try { localStorage.setItem("Mentor:autoSave", next ? "1" : "0"); } catch (_) {}
  try { syncToolbarActionState(); } catch (_) {}
  if (!silent) {
    if (next) {
      const disk = isAutoSaveDiskActive();
      setStatus(
        disk ? "自动保存已开启" : "自动保存已开启（草稿）",
        disk ? "停手后写回已授权文件" : "尚无写回目标 · 先保存到本地后才会写盘"
      );
      if (!disk) {
        try { showToast("自动保存已开：请先保存到本地文件，之后才会写回磁盘", 2800); } catch (_) {}
      }
    } else {
      setStatus("自动保存已关闭", "仅手动保存写回文件 · 草稿仍会自动保存");
    }
  }
  return next;
}
/** Preference ON and current doc can be written in place. */
function isAutoSaveDiskActive() {
  return getAutoSaveEnabled() && hasWriteHandle() && !State.readOnlyMode && canWriteLiveDocument();
}
function syncAutosaveToggleUi() {
  // Compatibility shim: AutoSave visuals come from the single toolbar renderer.
  try { syncToolbarActionState(); } catch (_) {}
}
var AUTOSAVE_DEBOUNCE = getAutosaveDebounceMs();
var _saveInFlight = false;
var _saveQueued = false;
var _autosaveFailToastAt = 0;
/** True when the active doc can be written back in place. */
function hasWriteHandle() {
  return !!(
    State.currentFile &&
    State.currentFile.handle &&
    (State.saveMode === "mentor-handle" || State.saveMode === "handle")
  );
}
function isMentorPackMode() {
  const name = State.currentFile && State.currentFile.name || "";
  return (
    State.saveMode === "mentor-handle" ||
    State.saveMode === "mentor-download" ||
    /\.mentor$/i.test(name)
  );
}
/** Query-only permission check (safe from timers / background). */
async function hasGrantedWrite(handle) {
  if (!handle) return false;
  try {
    if (typeof handle.queryPermission === "function") {
      return await handle.queryPermission({ mode: "readwrite" }) === "granted";
    }
    return true;
  } catch {
    return false;
  }
}
/**
 * Low-level: write bytes/string/Blob to a handle. Single-flight.
 * Returns { ok, error?, skipped? }.
 */
async function writeToHandle(handle, data) {
  if (!handle) return { ok: false, error: "\u65E0\u6587\u4EF6\u53E5\u67C4" };
  if (_saveInFlight) {
    _saveQueued = true;
    return { ok: false, skipped: true, error: "busy" };
  }
  _saveInFlight = true;
  let writable = null;
  try {
    writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    writable = null;
    return { ok: true };
  } catch (e) {
    if (writable) {
      try {
        await writable.abort();
      } catch {
      }
    }
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      return { ok: false, error: "\u6743\u9650\u88AB\u62D2" };
    }
    return { ok: false, error: e && e.message ? e.message : String(e) };
  } finally {
    _saveInFlight = false;
    if (_saveQueued) {
      _saveQueued = false;
      if (State.currentFile && State.currentFile.dirty) {
        // Coalesce: draft autosave after in-flight write settles
        scheduleAutosaveDebounce();
      }
    }
  }
}
/**
 * Build current editor payload and write to the open handle.
 * reason: 'autosave' | 'manual'
 */
async function writeCurrentToHandle({ reason = "manual", showProgress = false, forceOverwriteExternal = false } = {}) {
  const options = { forceOverwriteExternal };
  if (!State.currentFile || !State.currentFile.handle) {
    return { ok: false, error: "\u65E0\u6587\u4EF6\u53E5\u67C4" };
  }
  if (!canWriteLiveDocument()) {
    return { ok: false, skipped: true, error: "live-follower" };
  }
  if (State.readOnlyMode) {
    return { ok: false, error: "\u53EA\u8BFB\u6A21\u5F0F" };
  }
  let snapshot;
    try {
      snapshot = createSaveSnapshot();
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
        code: e && e.code || undefined,
        audit: e && e.audit || undefined
      };
    }
  const handle = snapshot.handle;
  if (!handle) return { ok: false, error: "\u65E0\u6587\u4EF6\u53E5\u67C4" };
  // Permission: background autosave must already be granted (no user gesture).
  if (reason === "autosave") {
    if (!(await hasGrantedWrite(handle))) {
      return { ok: false, error: "need-permission" };
    }
  } else {
    const perm = await ensureWritePermission(handle);
    if (perm === "denied") {
      return { ok: false, error: "\u6743\u9650\u88AB\u62D2" };
    }
  }
  // External-edit check for both plain .md and .mentor handle writes (manual + autosave).
  if (snapshot.fileMtime != null && (snapshot.saveMode === "handle" || snapshot.saveMode === "mentor-handle")) {
    try {
      const currentFile = await handle.getFile();
      if (currentFile.lastModified > snapshot.fileMtime) {
        if (reason === "autosave") {
          return { ok: false, skipped: true, error: "external-modified" };
        }
        if (!options.forceOverwriteExternal) {
          return {
            ok: false,
            conflict: {
              kind: "external-modified",
              fileName: snapshot.name,
              fileMtime: snapshot.fileMtime,
              diskMtime: currentFile.lastModified
            },
            error: "external-modified"
          };
        }
      }
    } catch (e) {
      console.warn("[save] mtime \u68C0\u67E5\u5931\u8D25:", e);
    }
  }
  let payload;
  try {
    if (snapshot.saveMode === "mentor-handle" || /\.mentor$/i.test(snapshot.name)) {
      if (showProgress) showExportProgress("\u6B63\u5728\u6253\u5305 .mentor\u2026");
      payload = await buildMentorZipBlob(snapshot.mdText, snapshot.sidecar, snapshot.mediaFiles, snapshot.references, { documentHtml: snapshot.documentHtml });
    } else {
      payload = snapshot.mdText;
    }
  } catch (e) {
    if (showProgress) hideExportProgress("\u4FDD\u5B58\u5931\u8D25");
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
  const wr = await writeToHandle(handle, payload);
  if (!wr.ok) {
    if (showProgress) hideExportProgress("\u4FDD\u5B58\u5931\u8D25");
    return wr;
  }
  let diskMtime = 0;
  try {
    const newFile = await handle.getFile();
    diskMtime = newFile.lastModified || 0;
  } catch (_) {}
  const finalized = await finalizeOfficialCommit(snapshot, {
    reason,
    diskMtime,
    captureVersion: true,
  });
  if (showProgress) hideExportProgress("已保存");
  return { ok: true, warnings: finalized.warnings || [], version: finalized.version || null };
}
/**
 * Align DraftStore + idbCache with a committed official snapshot.
 * Returns warning code or null.
 */
async function alignDraftWithCommittedSnapshot(snapshot) {
  try {
    const docId = snapshot.documentId || snapshot.name;
    const mem = {
      body: snapshot.mdText,
      sidecar: snapshot.sidecar,
      annotations: (snapshot.sidecar && snapshot.sidecar.annotations) || [],
      updatedAt: Date.now(),
      documentId: docId,
      name: snapshot.name,
      references: snapshot.references
    };
    if (State.idbCache) {
      State.idbCache[docId] = mem;
      if (snapshot.name) State.idbCache[snapshot.name] = mem;
    }
    await DraftStore.putDraft({
      documentId: docId,
      name: snapshot.name,
      body: snapshot.mdText,
      annotations: mem.annotations,
      sidecar: snapshot.sidecar,
      references: snapshot.references
    });
    return null;
  } catch (e) {
    console.warn("[save] DraftStore sync failed:", e);
    return "draft-sync";
  }
}

function applyCommittedSnapshotToActiveDocument(snapshot, diskMtime, outcome) {
  if (!State.currentFile) return;
  State.currentFile.content = snapshot.mdText;
  State.currentFile.annotations = snapshot.sidecar;
  if (diskMtime) {
    State.fileMtime = diskMtime;
    try { noteExternalOwnWrite(diskMtime); } catch (_) {}
  }
  if (outcome.markClean) {
    markClean();
  } else if (outcome.queueFollowup) {
    _saveQueued = true;
    if (!_saveInFlight) {
      _saveQueued = false;
      scheduleAutosaveDebounce();
    }
  }
  try { snapshotActiveTab(); } catch (_) {}
}


/**
 * One coordinator for official commits (handle write or user-confirmed download-as-save).
 * Draft-only AutoRecover never calls this.
 */
async function finalizeOfficialCommit(snapshot, {
  reason = "manual",
  diskMtime = 0,
  captureVersion = true,
} = {}) {
  const warnings = [];
  const active = activeDocumentMatches(snapshot);
  const currentGen = active ? (State.currentFile.dirtyGen || 0) : null;
  const outcome = classifySaveOutcome({
    officialCommit: true,
    snapshotGen: snapshot.dirtyGen,
    currentGen,
    activeDocument: active,
  });

  if (active) {
    applyCommittedSnapshotToActiveDocument(snapshot, diskMtime, outcome);
  } else {
    // Inactive tab save: clear dirty only when gen matches.
    const savedTab = State.tabs.find((tab) => tab && tab.id === snapshot.tabId);
    if (savedTab && (savedTab.currentFile?.dirtyGen || 0) === snapshot.dirtyGen) {
      savedTab.dirty = false;
      if (savedTab.currentFile) {
        savedTab.currentFile.dirty = false;
        savedTab.currentFile.content = snapshot.mdText;
      }
    }
  }

  try {
    await AnnotationStore.put(snapshot.name, snapshot.sidecar);
  } catch (e) {
    console.warn("[save] IDB AnnotationStore put 失败:", e);
  }

  if (outcome.syncDraft) {
    const draftWarn = await alignDraftWithCommittedSnapshot(snapshot);
    if (draftWarn) warnings.push(draftWarn);
  }

  let version = null;
  if (captureVersion && outcome.captureVersion) {
    try {
      version = await recordVersionFromSnapshot(snapshot, {
        kind: reason === "autosave" ? "autosave" : "manual",
      });
      if (version && version.ok === false && !version.skipped) {
        warnings.push("version-history");
      }
    } catch (e) {
      console.warn("[save] version capture failed:", e);
      warnings.push("version-history");
      version = { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  return { ok: true, outcome, warnings, version };
}

async function recordVersionFromSnapshot(snapshot, { kind = "manual", label = null } = {}) {
  try {
    if (!getVersionHistoryEnabled()) return { ok: false, skipped: true, error: "disabled" };
    if (!snapshot || !snapshot.documentId) return { ok: false, skipped: true, error: "no-documentId" };
    const packed = packMediaForVersion(snapshot.mediaFiles || {});
    const hash = contentFingerprintPure({
      body: snapshot.mdText,
      annotations: (snapshot.sidecar && snapshot.sidecar.annotations) || [],
      references: snapshot.references,
      mediaManifest: mediaManifestForFingerprint(packed.mediaFiles)
    });
    // Policy gate only (draft vs named/manual/autosave). Hash dedup is atomic inside the store.
    if (!shouldCaptureVersionPure({ reason: kind, prevHash: null, nextHash: hash })) {
      return { ok: true, skipped: true };
    }
    const row = createVersionRow({
      id: crypto.randomUUID(),
      documentId: snapshot.documentId,
      name: snapshot.name,
      kind,
      label,
      createdAt: Date.now(),
      hash,
      body: snapshot.mdText,
      annotations: (snapshot.sidecar && snapshot.sidecar.annotations) || [],
      sidecar: snapshot.sidecar,
      references: snapshot.references,
      mediaFiles: packed.mediaFiles,
      mediaOmitted: packed.mediaOmitted,
      byteSize: estimateVersionByteSize({
        body: snapshot.mdText,
        annotations: (snapshot.sidecar && snapshot.sidecar.annotations) || [],
        sidecar: snapshot.sidecar,
        references: snapshot.references,
        mediaBytes: packed.mediaBytes
      })
    });
    return await VersionStore.captureVersionAtomic(row, getVersionPolicyFromSettings());
  } catch (e) {
    console.warn("[versions] capture failed:", e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
/** Stable, cheap media manifest for dedup fingerprints: sorted path:size list. */
function mediaManifestForFingerprint(mediaFiles) {
  return Object.entries(mediaFiles || {})
    .map(([path2, blob]) => [path2, (blob && (blob.size || blob.byteLength)) || 0])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
// ---------------------------------------------------------------------------
// Version history drawer (Word-like): list / restore / export / delete / pin
// ---------------------------------------------------------------------------
var _versionPaneOpen = false;
function openVersionHistory() {
  if (!State.currentFile) return;
  _versionPaneOpen = true;
  const drawer = document.querySelector("#version-history-drawer");
  if (drawer) drawer.classList.remove("hidden");
  renderVersionHistory();
  try { syncToolbarActionState(); } catch (_) {}
}
function closeVersionHistory() {
  _versionPaneOpen = false;
  const drawer = document.querySelector("#version-history-drawer");
  if (drawer) drawer.classList.add("hidden");
  try { syncToolbarActionState(); } catch (_) {}
}
async function renderVersionHistory() {
  const list = document.querySelector("#version-history-list");
  const empty = document.querySelector("#version-history-empty");
  if (!list) return;
  const requestedDocumentId = (State.currentFile && State.currentFile.documentId) || State.activeTabId;
  let rows = [];
  try {
    rows = await VersionStore.listByDocumentId(requestedDocumentId);
  } catch (e) {
    console.warn("[versions] list failed:", e);
  }
  // Stale async: tab switched while IDB listed another document.
  // Still allow programmatic render when drawer is closed (tests / reopen).
  const liveDocumentId = (State.currentFile && State.currentFile.documentId) || State.activeTabId;
  if (liveDocumentId !== requestedDocumentId) return;
  list.innerHTML = "";
  if (empty) empty.classList.toggle("hidden", rows.length > 0);
  const count = document.querySelector("#version-history-count");
  if (count) count.textContent = rows.length ? rows.length + " 个版本" : "";
  for (const row of rows) {
    list.appendChild(renderVersionRow(row));
  }
}
function renderVersionRow(row) {
  const item = document.createElement("div");
  item.className = "version-item";
  const kindLabel = row.kind === "named" ? "命名" : row.kind === "manual" ? "手动" : "自动";
  const time = new Date(row.createdAt).toLocaleString();
  const label = row.label ? `<span class="version-label">${escapeHtml(row.label)}</span>` : "";
  const size = row.byteSize ? ` · ${formatBytes(row.byteSize)}` : "";
  const omitted = row.mediaOmitted ? " · 图片未含" : "";
  item.innerHTML =
    `<div class="version-item-head">
       <span class="version-kind">${kindLabel}</span>
       <span class="version-time">${time}</span>
     </div>
     <div class="version-item-sub">${label}${size}${omitted}</div>
     <div class="version-item-actions">
       <button type="button" class="version-act version-act-restore" data-version-restore="${row.id}">恢复此版本</button>
       <button type="button" class="version-act" data-version-export="${row.id}">另存</button>
       <button type="button" class="version-act version-act-delete" data-version-delete="${row.id}">删除</button>
     </div>`;
  item.querySelector('[data-version-restore]').addEventListener("click", () => restoreVersion(row.id));
  item.querySelector('[data-version-export]').addEventListener("click", () => exportVersionAsMentor(row.id));
  item.querySelector('[data-version-delete]').addEventListener("click", () => deleteVersion(row.id));
  return item;
}
function formatBytes(n) {
  if (!n || n < 1024) return (n || 0) + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
async function restoreVersion(id) {
  const requestedDocumentId = (State.currentFile && State.currentFile.documentId) || State.activeTabId || null;
  let row = null;
  try {
    row = await VersionStore.getVersion(id);
  } catch (e) {
    showToast("读取版本失败", 3000);
    return { ok: false, error: "read-failed" };
  }
  if (!row) {
    showToast("版本不存在", 3000);
    return { ok: false, error: "missing" };
  }
  const activeDocumentId = (State.currentFile && State.currentFile.documentId) || State.activeTabId || null;
  if (requestedDocumentId && activeDocumentId && requestedDocumentId !== activeDocumentId) {
    return { ok: false, error: "document-mismatch" };
  }
  if (row.documentId && activeDocumentId && row.documentId !== activeDocumentId) {
    showToast("版本属于其他文档", 3000);
    return { ok: false, error: "document-mismatch" };
  }
  if (State.currentFile && State.currentFile.dirty) {
    const ok = confirm("当前有未保存修改，恢复版本将覆盖编辑器内容（可保存前取消）。继续？");
    if (!ok) return { ok: false, cancelled: true };
  }
  try {
    const current = State.currentFile || {};
    const refs = row.references
      ? normalizeReferenceManifest(row.references)
      : emptyReferenceManifest();
    const sidecar = row.sidecar || { annotations: row.annotations || [], version: "1" };
    await activateOpenedDocument({
      name: row.name || current.name || "untitled.md",
      content: row.body || "",
      annotations: sidecar,
      references: refs,
      mediaFiles: row.mediaFiles || {},
      handle: current.handle || null,
      saveMode: State.saveMode,
      documentId: current.documentId || row.documentId || State.activeTabId,
      forceDisk: true,
      preferDraft: false,
      quiet: true,
    });
    // Restore never writes disk: mark dirty so only a subsequent save commits.
    try { markDirty(); } catch (_) {}
    try { await putAtomicDraftForCurrent(); } catch (_) {}
    try { snapshotActiveTab(); } catch (_) {}
    try { resetHistory(); } catch (_) {}
    try { clearPmHistory(); } catch (_) {}
    setStatus("已恢复版本", row.label || new Date(row.createdAt).toLocaleString());
    showToast("已恢复到历史版本（未写盘，保存后生效）", 3200);
    closeVersionHistory();
    return { ok: true };
  } catch (e) {
    showToast("恢复失败: " + (e && e.message ? e.message : e), 4000);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
async function deleteVersion(id) {
  const ok = confirm("删除这个版本？此操作不可撤销。");
  if (!ok) return { ok: false, cancelled: true };
  try {
    let row = null;
    try { row = await VersionStore.getVersion(id); } catch (_) {}
    const activeDocumentId = (State.currentFile && State.currentFile.documentId) || State.activeTabId;
    if (row && row.documentId && activeDocumentId && row.documentId !== activeDocumentId) {
      showToast("版本属于其他文档", 3000);
      return { ok: false, error: "document-mismatch" };
    }
    const documentId = (row && row.documentId) || activeDocumentId;
    if (documentId) await VersionStore.deleteVersion(documentId, id);
    else await VersionStore.deleteVersion(id);
    renderVersionHistory();
    return { ok: true };
  } catch (e) {
    showToast("删除失败", 3000);
    return { ok: false, error: "delete-failed" };
  }
}
async function exportVersionAsMentor(id) {
  let row = null;
  try {
    row = await VersionStore.getVersion(id);
  } catch (_) {}
  if (!row) {
    showToast("版本不存在", 3000);
    return;
  }
  try {
    const outName = /\.mentor$/i.test(row.name)
      ? row.name
      : String(row.name || "version").replace(/\.md$/i, "") + ".mentor";
    const sidecar = row.sidecar || {
      version: "1",
      document: row.name,
      updatedAt: new Date().toISOString(),
      author: { id: State.authorId, name: State.author },
      annotations: row.annotations || []
    };
    showExportProgress("正在打包 .mentor…");
    const blob = await buildMentorZipBlob(
      row.body || "",
      sidecar,
      row.mediaFiles || {},
      row.references || emptyReferenceManifest(),
      { documentHtml: undefined }
    );
    downloadBlob(outName, blob);
    hideExportProgress("已下载");
    showToast(`已导出版本 ${outName}`, 2500);
  } catch (e) {
    hideExportProgress("导出失败");
    showToast("导出失败: " + (e && e.message ? e.message : e), 4000);
  }
}
async function runNamedVersionPin() {
  if (!State.currentFile) return;
  let snapshot;
  try {
    snapshot = createSaveSnapshot();
  } catch (e) {
    showToast("保存失败: " + (e && e.message ? e.message : e), 4000);
    return;
  }
  const defaultLabel = "版本 " + new Date().toLocaleString();
  let label = prompt("版本名称（留空使用默认）", defaultLabel);
  if (label === null) return;
  label = (label || defaultLabel).trim();
  const res = await recordVersionFromSnapshot(snapshot, { kind: "named", label });
  if (res && res.ok) {
    showToast("已保存此版本 ✓", 2000);
    renderVersionHistory();
  } else if (res && res.error === "disabled") {
    showToast("版本历史已关闭（设置中开启）", 3000);
  } else {
    showToast("保存版本失败", 3000);
  }
}
function startAutosaveTimer() {
  stopAutosaveTimer();
  if (!canWriteLiveDocument()) return;
  // Draft AutoRecover for any open doc (handle or download / deep-link).
  _autosaveTimer = setInterval(() => {
    if (State.currentFile && State.currentFile.dirty) scheduleAutosaveDebounce();
  }, AUTOSAVE_INTERVAL);
  console.log("[autosave] timer started (debounce + 30s; disk if AutoSave ON + handle)");
}
function stopAutosaveTimer() {
  if (_autosaveTimer) {
    clearInterval(_autosaveTimer);
    _autosaveTimer = null;
  }
  if (scheduleAutosaveDebounce._t) {
    clearTimeout(scheduleAutosaveDebounce._t);
    scheduleAutosaveDebounce._t = null;
  }
}
function scheduleAutosaveDebounce() {
  if (!canWriteLiveDocument()) return;
  if (!State.currentFile || !State.currentFile.dirty) return;
  if (State.externalWatch && State.externalWatch.autosavePausedForExternal) return;
  if (scheduleAutosaveDebounce._t) clearTimeout(scheduleAutosaveDebounce._t);
  scheduleAutosaveDebounce._t = setTimeout(() => {
    scheduleAutosaveDebounce._t = null;
    if (State.currentFile && State.currentFile.dirty) autosaveNow();
  }, AUTOSAVE_DEBOUNCE);
}
/**
 * Autosave tick:
 * - Always keep DraftStore AutoRecover.
 * - When Office AutoSave toggle is ON and a write handle is available, also
 *   write the official file and markClean (Word/OneDrive-style).
 * - When toggle OFF or no handle: draft only; dirty stays until manual save.
 */
async function autosaveNow() {
  if (!canWriteLiveDocument()) return { ok: false, skipped: true, error: "live-follower" };
  if (!State.currentFile || !State.currentFile.dirty) return { ok: false, skipped: true, error: "clean" };
  if (State.readOnlyMode) return { ok: false, skipped: true, error: "read-only" };
  if (State.externalWatch && State.externalWatch.autosavePausedForExternal) {
    return { ok: false, skipped: true, error: "external-paused" };
  }
  const time = (/* @__PURE__ */ new Date()).toLocaleTimeString();
  const wantDisk = getAutoSaveEnabled() && hasWriteHandle();
  if (wantDisk) {
    try {
      const wr = await writeCurrentToHandle({ reason: "autosave", showProgress: false });
      if (wr && wr.ok) {
        setStatus("已自动保存", time);
        console.log(`[autosave] disk at ${time}`);
        try { syncAutosaveToggleUi(); } catch (_) {}
        try { syncToolbarActionState(); } catch (_) {}
        return { ok: true, disk: true, draft: true };
      }
      if (wr && wr.skipped) {
        console.log("[autosave] disk skipped:", wr.error || "skipped");
      } else if (wr && wr.error === "need-permission") {
        console.log("[autosave] disk needs permission; draft only");
      } else if (wr && wr.error) {
        console.warn("[autosave] disk failed:", wr.error);
      }
    } catch (eDisk) {
      console.warn("[autosave] disk threw:", eDisk);
    }
  }
  try {
    await putAtomicDraftForCurrent();
    setStatus("已自动保存草稿", time);
    console.log(`[autosave] draft only at ${time}`);
    return { ok: true, draft: true, disk: false };
  } catch (e) {
    const err = e && e.message ? e.message : String(e);
    const now = Date.now();
    if (now - _autosaveFailToastAt > 15e3) {
      _autosaveFailToastAt = now;
      showToast("自动保存草稿失败: " + err, 3e3);
    }
    console.warn("[autosave] draft failed:", err);
    return { ok: false, error: err };
  }
}
/** True if close/reload should warn — dirty vs last user-confirmed save. */
function shouldPromptUnload() {
  try {
    if (State.currentFile && State.currentFile.dirty) return true;
    const tabs = State.tabs || [];
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i] && tabs[i].dirty) return true;
    }
  } catch (_) {}
  return false;
}
function onBeforeUnload(e) {
  try { _closeDocChannelFull(); } catch (_) {}
  if (!shouldPromptUnload()) return;
  e.preventDefault();
  e.returnValue = "";
  return "";
}
function updateTreeDirtyDots() {
  $$(".tree-node[data-handle-name]").forEach((el) => {
    const name = el.dataset.handleName;
    const isCurrent = State.currentFile && State.currentFile.name === name;
    const isDirty = isCurrent && State.currentFile.dirty;
    const existing = el.querySelector(".dirty-dot-mini");
    if (isDirty && !existing) {
      const dot = document.createElement("span");
      dot.className = "dirty-dot-mini";
      dot.title = "\u672A\u4FDD\u5B58";
      const fn = el.querySelector(".filename");
      if (fn) fn.after(dot);
      else el.appendChild(dot);
    } else if (!isDirty && existing) {
      existing.remove();
    }
  });
}
var ImageBlock = Image.extend({
  inline: false,
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,
  allowBase64: true,
  parseHTML() {
    return [{
      tag: "img[src]"
    }];
  },
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("src"),
        renderHTML: (a) => a.src ? { src: a.src } : {}
      },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute("alt"),
        renderHTML: (a) => a.alt ? { alt: a.alt } : {}
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("title"),
        renderHTML: (a) => a.title ? { title: a.title } : {}
      },
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute("width"),
        renderHTML: (a) => a.width ? { width: a.width } : {}
      },
      height: {
        default: null,
        parseHTML: (el) => el.getAttribute("height"),
        renderHTML: (a) => a.height ? { height: a.height } : {}
      }
    };
  }
});
var ImageCaretNav = Extension.create({
  name: "imageCaretNav",
  priority: 1e3,
  addKeyboardShortcuts() {
    const jump = (dir, dirStr) => () => {
      const editor2 = this.editor;
      const { state, view } = editor2;
      const sel = state.selection;
      const doc5 = state.doc;
      if (sel.node && sel.node.type.name === "image") {
        const imgPos2 = sel.from;
        const imgEnd = sel.to;
        if (dir > 0) {
          const $a = doc5.resolve(imgEnd);
          if ($a.nodeAfter && $a.nodeAfter.isTextblock) {
            return editor2.commands.setTextSelection(imgEnd + 1);
          }
          return editor2.chain().insertContentAt(imgEnd, { type: "paragraph" }).setTextSelection(imgEnd + 1).run();
        }
        const $b2 = doc5.resolve(imgPos2);
        if ($b2.nodeBefore && $b2.nodeBefore.isTextblock) {
          return editor2.commands.setTextSelection(imgPos2 - 1);
        }
        return editor2.chain().insertContentAt(imgPos2, { type: "paragraph" }).setTextSelection(imgPos2 + 1).run();
      }
      if (!sel.empty) return false;
      if (!view.endOfTextblock(dirStr)) return false;
      const $pos = dir > 0 ? sel.$to : sel.$from;
      if (dir > 0) {
        let after;
        try {
          after = $pos.after($pos.depth);
        } catch (e) {
          return false;
        }
        const node = doc5.nodeAt(after);
        if (!node || node.type.name !== "image") return false;
        const imgEnd = after + node.nodeSize;
        const $a = doc5.resolve(imgEnd);
        if ($a.nodeAfter && $a.nodeAfter.isTextblock) {
          return editor2.commands.setTextSelection(imgEnd + 1);
        }
        return editor2.chain().insertContentAt(imgEnd, { type: "paragraph" }).setTextSelection(imgEnd + 1).run();
      }
      let before;
      try {
        before = $pos.before($pos.depth);
      } catch (e) {
        return false;
      }
      if (before <= 0) return false;
      const $b = doc5.resolve(before);
      const prev = $b.nodeBefore;
      if (!prev || prev.type.name !== "image") return false;
      const imgPos = before - prev.nodeSize;
      const $i = doc5.resolve(imgPos);
      if ($i.nodeBefore && $i.nodeBefore.isTextblock) {
        return editor2.commands.setTextSelection(imgPos - 1);
      }
      return editor2.chain().insertContentAt(imgPos, { type: "paragraph" }).setTextSelection(imgPos + 1).run();
    };
    return {
      ArrowRight: jump(1, "right"),
      ArrowDown: jump(1, "down"),
      ArrowLeft: jump(-1, "left"),
      ArrowUp: jump(-1, "up")
    };
  }
});
function initEditor() {
  const editorEl = $("#editor");
  State.editor = new Editor({
    element: editorEl,
    extensions: [
      StarterKit.configure({
        history: {
          // v1.38: 用户要求"最大连续撤回 20 个和恢复 20 个改动".
          //   - depth: PM history plugin 的 stack 上限 (transaction 数). 设 20.
          //   - newGroupDelay: 同类型 transaction 在 N ms 内合并为 1 步. 500ms (默认) 保留.
          //   - 合并后用户连按 Ctrl+Z, 实际只回退 group 数, 不超过 depth.
          //   日常编辑间隔 (>500ms) 自然每字 1 step, 20 step 足够.
          depth: 20,
          newGroupDelay: 500
        },
        // v1.43.30: 关掉 StarterKit 内置 gapcursor, 只留下面显式 Gapcursor 一份
        // 双注册会 log "Duplicate extension names: gapCursor", 实测箭头/点击进 gap 失败
        gapcursor: false
      }),
      // v1.38: PM Ctrl+Z 容量 20
      Highlight.configure({ multicolor: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      ImageBlock,
      // v1.43.27/30: 显式唯一 Gapcursor — 仅对 atom↔atom / 文档边界等 closed 缝有效
      Gapcursor,
      // v1.43.30: 段落↔图片 的箭头跨图 + (配合 setupImageGapClick) 点空隙插空段
      ImageCaretNav,
      Placeholder.configure({ placeholder: "\u5728\u6B64\u8F93\u5165 Markdown\uFF0C\u6216\u4ECE\u5DE5\u5177\u680F\u6253\u5F00\u6587\u4EF6\u2026" }),
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: "md-table" }
      }),
      TableRow,
      TableHeader,
      TableCell,
      Superscript,
      Subscript,
      CitationTextNormalizer,
      CitationNode,
      BibliographyNode,
      AnnotationMark,
            AnnotationBubbleExtension,
            ActiveHighlightExtension,
            SupervisionExtension,
            AnnotationAnchorExtension,
            KatexInline,
            KatexBlock
          ],
    content: "",
    onUpdate: ({ editor: editor2, transaction }) => {
          if (transaction?.getMeta("__activeMarkSync") || transaction?.getMeta("__tableDragSelect")) {
            return;
          }
          // Cross-page apply: do not dirty / autosave / history from remote setContent
          if (_liveSync && _liveSync.applying) {
            if (transaction?.docChanged) {
              scheduleRenderOutline();
            }
            return;
          }
          // TipTap also emits onUpdate for non-doc changes (e.g. setEditable from live-sync
          // setLiveRole). Those must NOT markDirty — otherwise dirtyGen bumps mid-save and
          // markClean is skipped → user sees toast「已保存」但脏点仍在，像保存失败。
          if (!transaction?.docChanged) {
            return;
          }
          if (transaction?.getMeta("addToHistory") !== false) {
            State.history.lastOp = "pm";
          }
          markDirty();
          scheduleAutosaveDebounce();
          const cr = collectChangedRanges(transaction);
          if (cr) State._lastChangedRanges = cr;
          scheduleValidateMarks(editor2, { render: true, transaction, changedRanges: cr });
          scheduleRenderOutline();
        },
    onSelectionUpdate: ({ editor: editor2 }) => {
      handleSelectionChange();
      updateTableControls();
    }
  });
  setupTableDragCapture(editorEl);
  setupKatexDblClick(editorEl);
  try {
    const ed = State.editor;
    const _setContentOrig = ed.commands.setContent.bind(ed.commands);
        ed.commands.setContent = (content, emitUpdate, parseOptions) => {
          let normalizedContent = content;
          if (typeof content === "string" && (content.includes("[@") || content.includes("[-@")) && !content.includes("data-citation-raw")) {
            if (/^\s*</.test(content)) {
              normalizedContent = content.replace(/\[(?:-?@[\w:.\-\/]+(?:\s*,\s*[^;\]]+)?)(?:\s*;\s*-?@[\w:.\-\/]+(?:\s*,\s*[^;\]]+)?)*\]/g, (raw) => citationRawToHtml(raw));
            } else {
              normalizedContent = markdownToHtml(content, State.mediaUrls);
            }
          }
          // Full doc replace: drop mapped-anchor cache so old ranges never orphan new threads
          try {
            const trClear = ed.state.tr;
            setAnnotationAnchorResetMeta(trClear, []);
            trClear.setMeta("addToHistory", false);
            try { trClear.setMeta(SUPERVISION_BYPASS_META, true); } catch (_) {}
            ed.view.dispatch(trClear);
          } catch (_) {}
          const r = _setContentOrig(normalizedContent, emitUpdate, parseOptions);
          try {
            reconcileCitationNodes();
            reconcileBibliographyNode();
            if (State._suspendAnnValidate) return r;
            if (State.annotations && State.annotations.length) {
              scheduleValidateMarks(ed, { immediate: true, phase: "full" });
            }
          } catch (e) {
          }
          return r;
        };
  } catch (e) {
    console.warn("[setContent wrap]", e);
  }
}
function setupTableDragCapture(editorEl) {
  if (!editorEl) return;
  let downCellInfo = null;
  let isDragging = false;
  function findCellPos(domCell) {
    if (!domCell || !State.editor) return null;
    try {
      const pos = State.editor.view.posAtDOM(domCell, 0);
      const $pos = State.editor.state.doc.resolve(pos);
      let cellDepth = -1;
      for (let d = $pos.depth; d > 0; d--) {
        const t = $pos.node(d).type.name;
        if (t === "tableCell" || t === "tableHeader") {
          cellDepth = d;
          break;
        }
      }
      if (cellDepth < 0) return null;
      const cellPos = $pos.before(cellDepth);
      return {
        cellPos,
        contentStart: $pos.start(cellDepth),
        contentEnd: $pos.end(cellDepth)
      };
    } catch (e) {
      return null;
    }
  }
  editorEl.addEventListener("mousedown", (e) => {
    const cell = e.target.closest("td, th");
    if (!cell) {
      downCellInfo = null;
      isDragging = false;
      return;
    }
    downCellInfo = findCellPos(cell);
    isDragging = !!downCellInfo;
  });
  editorEl.addEventListener("mouseup", (e) => {
    if (!isDragging || !downCellInfo) {
      isDragging = false;
      return;
    }
    isDragging = false;
    const upCell = e.target.closest("td, th");
    if (!upCell || !State.editor) return;
    const upInfo = findCellPos(upCell);
    if (!upInfo) return;
    if (downCellInfo.cellPos === upInfo.cellPos) return;
    try {
      const ok = State.editor.commands.setCellSelection({
        anchorCell: downCellInfo.cellPos,
        headCell: upInfo.cellPos
      });
      if (!ok) throw new Error("setCellSelection returned false");
      const tr2 = State.editor.state.tr;
      tr2.setMeta("__tableDragSelect", true);
      State.editor.view.dispatch(tr2);
      setStatus("\u63D0\u793A", `\u5DF2\u9009\u4E2D\u591A\u5355\u5143\u683C, \u6279\u6CE8\u5C06\u8986\u76D6\u5168\u90E8\u6587\u5B57`);
    } catch (err) {
      console.warn("[tableDrag] CellSelection \u5931\u8D25, \u9000\u56DE\u5355 cell:", err);
      try {
        State.editor.chain().focus().setTextSelection({ from: downCellInfo.contentStart, to: downCellInfo.contentEnd }).setMeta("__tableDragSelect", true).run();
      } catch (e2) {
      }
    }
  });
}
function setupKatexDblClick(editorEl) {
  if (!editorEl) {
    console.warn("[MathEdit] no editorEl");
    return;
  }
  editorEl.addEventListener("dblclick", (e) => {
    const target = e.target.closest(".katex-wrapper, .katex-wrapper-display");
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      editKatexInPlace(target);
    } catch (err) {
      console.warn("[MathEdit] dblclick handler error:", err);
      showToast("\u516C\u5F0F\u7F16\u8F91\u5931\u8D25: " + err.message);
    }
  });
}
function editKatexInPlace(target) {
  const targetTex = target.getAttribute("data-tex") || "";
  let foundNode = null;
  let foundPos = null;
  State.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "katex" || node.type.name === "katexBlock") {
      if (node.attrs.tex === targetTex) {
        foundNode = node;
        foundPos = pos;
        return false;
      }
    }
    return true;
  });
  if (!foundNode) {
    State.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "katex" || node.type.name === "katexBlock") {
        foundNode = node;
        foundPos = pos;
        return false;
      }
      return true;
    });
  }
  if (!foundNode) {
    console.warn("[MathEdit] no katex node found in doc");
    return;
  }
  openEditModal(foundNode, foundPos);
}
function openEditModal(pmNode, pos) {
  const modal = $("#author-modal");
  const titleEl = $("#author-modal-title");
  const descEl = $("#author-modal-desc");
  const inputEl = $("#author-input");
  const saveBtn = $("#author-save");
  const cancelBtn = $("#author-cancel");
  const origTitle = titleEl.textContent;
  const origDesc = descEl.textContent;
  const origSaveText = saveBtn.textContent;
  const origPlaceholder = inputEl.placeholder;
  const origModalDisplay = modal.style.display;
  titleEl.textContent = "\u7F16\u8F91\u516C\u5F0F LaTeX \u6E90\u7801";
  descEl.innerHTML = `<strong>\u8282\u70B9\u7C7B\u578B:</strong> ${pmNode.type.name}<br><strong>\u5F53\u524D\u6E90\u7801:</strong> <code style="font-family:var(--font-mono);font-size:12px;background:var(--panel-3);padding:2px 6px;border-radius:3px;">${escapeHtml(pmNode.attrs.tex || "")}</code>`;
  saveBtn.textContent = "\u4FDD\u5B58";
  inputEl.placeholder = "e.g. \\\\frac{a}{b}";
  inputEl.value = pmNode.attrs.tex || "";
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  openEditModal._lastPos = pos;
  modal.classList.remove("hidden");
  setTimeout(() => {
    inputEl.focus();
    inputEl.select();
  }, 50);
  let resolved = false;
  const close3 = (val) => {
    if (resolved) return;
    resolved = true;
    modal.classList.add("hidden");
    titleEl.textContent = origTitle;
    descEl.textContent = origDesc;
    saveBtn.textContent = origSaveText;
    inputEl.placeholder = origPlaceholder;
    inputEl.value = "";
    const rb = newSaveBtn.parentNode.replaceChild(saveBtn, newSaveBtn);
    const rc = newCancelBtn.parentNode.replaceChild(cancelBtn, newCancelBtn);
    inputEl.removeEventListener("keydown", keyHandler);
  };
  const saveHandler = () => {
    const v = inputEl.value.trim();
    if (!v) {
      showToast("\u516C\u5F0F\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    close3(v);
    applyKatexEdit(pmNode, openEditModal._lastPos, v);
  };
  const cancelHandler = () => close3(null);
  const backdropHandler = (e) => {
    if (e.target === modal) close3(null);
  };
  const keyHandler = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveHandler();
    } else if (e.key === "Escape") close3(null);
  };
  newSaveBtn.addEventListener("click", saveHandler);
  newCancelBtn.addEventListener("click", cancelHandler);
  inputEl.addEventListener("keydown", keyHandler);
  modal.addEventListener("click", backdropHandler);
}
function applyKatexEdit(pmNode, pos, newTex) {
  if (typeof pos !== "number") return;
  if (newTex === pmNode.attrs.tex) return;
  try {
    const tr2 = State.editor.state.tr.setNodeMarkup(pos, void 0, { tex: newTex });
    State.editor.view.dispatch(tr2);
    markDirty();
    updateDocMeta();
    showToast("\u2713 \u516C\u5F0F\u5DF2\u66F4\u65B0");
  } catch (err) {
    showToast("\u516C\u5F0F\u66F4\u65B0\u5931\u8D25: " + err.message);
  }
}
/**
 * Pointer gesture state for selection + float bar.
 * Critical: pointerup fires BEFORE mouseup/PM selection commit on many browsers.
 * Never trust selection in the same turn as pointerup — always wait for post-mouseup rAF.
 */
var _selPtr = {
  down: false,
  x: 0,
  y: 0,
  moved: false,
  inEditor: false,
  // Annotation mark mousedown (no preventDefault — drag-select must work inside marks)
  markClick: null,
  // click count from mousedown (pointerup.detail is always 0)
  clickDetail: 1,
  // Bumps on each pointerdown/up so stale afterSelectionSettled callbacks are ignored
  // (double-click: click1's deferred caret must not wipe click2's word selection).
  gen: 0,
  // Modifier keys at pointerdown (shift-click extends selection; do not collapse)
  shift: false,
  meta: false,
  ctrl: false,
  alt: false
};
function _selPtrIsDown() {
  return !!_selPtr.down;
}
/**
 * Selection UI update.
 * opts.forceFloat: show float after gesture ends (post mouseup, selection settled).
 * During pointer-down we must NOT rewrite selection or show the float bar.
 */
function handleSelectionChange(opts = {}) {
  const editor2 = State.editor;
  if (!editor2) return;
  const forceFloat = !!(opts && opts.forceFloat);
  const dragging = _selPtrIsDown() && !forceFloat;
  const { from: from2, to, empty: empty4 } = editor2.state.selection;
  const btn = $("#float-comment-btn");
  const markType = editor2.schema.marks.annotation;
  const isAttachedStatus = (status) => status === "attached" || status === "moved" || status === "edited";
  const pickActiveThread = (marks) => {
    const ids = (marks || []).filter((m) => m.type === markType && m.attrs.threadId).map((m) => m.attrs.threadId);
    if (!ids.length) return null;
    if (State.activeThreadId && ids.includes(State.activeThreadId)) return State.activeThreadId;
    let best = null;
    let bestSpan = Infinity;
    for (const tid of ids) {
      const thread = State.annotations.find((a) => a && a.threadId === tid);
      const status = thread && thread.anchor && thread.anchor.status;
      if (thread && !thread.invalid && !thread.deleted && (!status || isAttachedStatus(status))) {
        const range = thread.range || thread.anchor && thread.anchor.position;
        const span = range && typeof range.from === "number" && typeof range.to === "number" ? range.to - range.from : Infinity;
        if (span < bestSpan) {
          best = tid;
          bestSpan = span;
        }
      }
    }
    return best || ids[ids.length - 1];
  };
  let activeMarkThreadId = null;
  if (empty4) {
    const $pos = editor2.state.doc.resolve(from2);
    activeMarkThreadId = pickActiveThread($pos.marks());
  } else {
    const $from2 = editor2.state.doc.resolve(from2);
    const $to2 = editor2.state.doc.resolve(to);
    activeMarkThreadId = pickActiveThread([...$from2.marks(), ...$to2.marks()]);
  }
  // While dragging: keep float hidden, never dispatch highlight/list re-renders
  // (those transactions interrupt native drag-select inside annotation marks).
  if (dragging) {
    if (activeMarkThreadId && State.activeThreadId !== activeMarkThreadId) {
      State.activeThreadId = activeMarkThreadId;
    }
    if (btn) btn.classList.add("hidden");
    return;
  }
  if (activeMarkThreadId) {
    activateAndRevealThread(activeMarkThreadId);
  }
  const popover = $("#mark-delete-popover");
  if (popover) {
    if (!empty4) {
      if (!popover.classList.contains("hidden")) popover.classList.add("hidden");
    } else if (State.activeThreadId) {
      positionMarkDeletePopover();
    }
  }
  const sel0 = State.editor.state.selection;
  if (isImageNodeSelection(sel0)) {
    try {
      const imgNode = sel0.node || editor2.state.doc.nodeAt(sel0.from);
      const src = imgNode?.attrs?.src || "";
      const hit = (State.annotations || []).find(
        (a) => a && !a.invalid && Array.isArray(a.imageAnchors) && a.imageAnchors.some((x) => x && (x.from === sel0.from || src && x.src === src))
      );
      if (hit) {
        activateAndRevealThread(hit.threadId);
        refreshAnnotationImageDecos();
      }
    } catch (e) {
    }
    positionFloatCommentAt(editor2, from2, sel0);
    return;
  }
  if (empty4 || from2 === to) {
    const isCellSel2 = State.editor.state.selection.forEachCell && State.editor.state.selection.$anchorCell && State.editor.state.selection.$headCell;
    if (!isCellSel2) {
      if (btn) btn.classList.add("hidden");
      return;
    }
  }
  const sel = State.editor.state.selection;
  const isCellSel = sel.forEachCell && sel.$anchorCell && sel.$headCell;
  if (isCellSel) {
    try {
      const start = editor2.view.coordsAtPos(sel.from);
      const editorPane = $("#editor-pane");
      const paneRect = editorPane.getBoundingClientRect();
      const top = start.top - paneRect.top + editorPane.scrollTop - 32;
      const left = start.left - paneRect.left + editorPane.scrollLeft;
      btn.style.top = `${Math.max(0, top)}px`;
      btn.style.left = `${left}px`;
      btn.classList.remove("hidden");
    } catch (e) {
      btn.classList.add("hidden");
    }
    return;
  }
  const $from = editor2.state.doc.resolve(from2);
  const $to = editor2.state.doc.resolve(to);
  if ($from.parent !== $to.parent) {
    let fromCell = null;
    let fromCellDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      const t = $from.node(d).type.name;
      if (t === "tableCell" || t === "tableHeader") {
        fromCell = t;
        fromCellDepth = d;
        break;
      }
    }
    if (fromCell) {
      // Only clamp after the gesture ends (forceFloat / not dragging) — never mid-drag.
      const cellNode = $from.node(fromCellDepth);
      const cellStart = $from.start(fromCellDepth);
      const cellContentEnd = cellStart + cellNode.content.size;
      const cellEnd = cellContentEnd - 1;
      let newFrom = Math.max(from2, cellStart);
      let newTo = Math.min(to, cellEnd);
      if (newFrom >= newTo) {
        newFrom = cellStart;
        newTo = cellEnd;
        if (newFrom >= newTo) {
          btn.classList.add("hidden");
          setStatus("\u63D0\u793A", "\u6240\u9009\u5355\u5143\u683C\u4E3A\u7A7A");
          return;
        }
      }
      try {
        editor2.chain().setTextSelection({ from: newFrom, to: newTo }).run();
        setStatus("\u63D0\u793A", "\u6279\u6CE8\u5DF2\u81EA\u52A8\u843D\u5230\u8D77\u59CB\u5355\u5143\u683C");
      } catch (e) {
        btn.classList.add("hidden");
        return;
      }
    } else if ($from.parent.type.name === "paragraph" && $to.parent.type.name === "paragraph" || $from.parent.type.name === "heading" && $to.parent.type.name === "heading" || $from.parent.type.name === "heading" && $to.parent.type.name === "paragraph" || $from.parent.type.name === "paragraph" && $to.parent.type.name === "heading" || $from.parent.isTextblock && $to.parent.isTextblock || collectImageAnchors(editor2.state.doc, from2, to).length > 0) {
    } else {
      btn.classList.add("hidden");
      setStatus("\u63D0\u793A", "\u6279\u6CE8\u6682\u4E0D\u652F\u6301\u8DE8\u5757\u9009\u533A, \u8BF7\u9009\u6BB5\u843D\u5185\u3001\u8DE8\u6BB5\u6587\u5B57\u6216\u56FE\u7247");
      return;
    }
  }
  positionFloatCommentAt(editor2, from2, sel);
}
function setupPaneResizer() {
  const main2 = $("#main");
  if (!main2) return;
  const panes = [
    { paneId: "comment-pane", varName: "--comment-pane-width", lsKey: "Mentor:commentPaneWidth", min: 220, max: 900, dir: -1 },
    { paneId: "file-pane", varName: "--outline-pane-width", lsKey: "Mentor:outlinePaneWidth", min: 160, max: 700, dir: 1 }
  ];
  panes.forEach((cfg) => {
    const resizer = document.querySelector(`[data-pane-resize="${cfg.paneId === "file-pane" ? "outline" : "comment"}"]`);
    const pane = document.getElementById(cfg.paneId);
    if (!resizer || !pane) return;
    try {
      const saved = localStorage.getItem(cfg.lsKey);
      if (saved) {
        const w = parseInt(saved, 10);
        if (w >= cfg.min && w <= cfg.max) {
          main2.style.setProperty(cfg.varName, w + "px");
        }
      }
    } catch (e) {
    }
    let dragging = false;
    let startX = 0;
    let startWidth = 0;
    let activePointerId = null;
    const onDown = (e) => {
      dragging = true;
      startX = e.clientX;
      startWidth = pane.getBoundingClientRect().width;
      resizer.classList.add("is-dragging");
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      if (e.pointerId != null && resizer.setPointerCapture) {
        try {
          resizer.setPointerCapture(e.pointerId);
          activePointerId = e.pointerId;
        } catch (_) {}
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = (e.clientX - startX) * cfg.dir;
      const w = Math.max(cfg.min, Math.min(cfg.max, startWidth + dx));
      main2.style.setProperty(cfg.varName, w + "px");
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("is-dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (activePointerId != null && resizer.releasePointerCapture) {
        try {
          resizer.releasePointerCapture(activePointerId);
        } catch (_) {}
        activePointerId = null;
      }
      const cur = main2.style.getPropertyValue(cfg.varName);
      if (cur) {
        try {
          localStorage.setItem(cfg.lsKey, cur);
        } catch (err) {
        }
      }
    };
    // Pointer Events primary path (mouse + touch + pen)
    resizer.addEventListener("pointerdown", onDown);
    resizer.addEventListener("pointermove", onMove);
    resizer.addEventListener("pointerup", onUp);
    resizer.addEventListener("pointercancel", onUp);
    // Fallback for older browsers
    resizer.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
/** Marker types for fix-mentor /mentor_io annotation classification.
 *  Marker identity is derived from explicit `@AI` / `@REVIEW` comment bodies.
 *  Legacy threadType values are migrated only while loading old sidecars.
 *  Markers are never auto-seeded into drafts.
 */
var MENTION_TYPES = {
  ai: {
    prefix: "@AI ",
    label: "AI\u8C03\u6574",
    shortLabel: "AI\u8C03\u6574",
    title: "AI\u8C03\u6574\uFF1A\u5728\u6279\u6CE8\u6B63\u6587\u4E2D\u5199 @AI\uFF1B\u4FDD\u5B58\u540E\u53EF\u7531 /fix-mentor \u5904\u7406",
    shortcut: "",
    placeholder: "\u544A\u8BC9 AI \u6539\u4EC0\u4E48 / \u95EE\u4EC0\u4E48\u2026"
  },
  // legacy parse only — not creatable from UI
  review: {
    prefix: "@REVIEW ",
    label: "\u5BA1\u9605",
    shortLabel: "\u5BA1\u9605",
    title: "\u5386\u53F2\u5BA1\u9605\u6279\u6CE8\uFF08\u4EC5\u52A0\u8F7D\u663E\u793A\uFF09",
    shortcut: "",
    placeholder: "\u5199\u5BA1\u9605\u610F\u89C1\u2026"
  }
};
var MARKER_TOKEN_RE = /(?:@AI|@REVIEW)\b/i;
function bodyHasMarker(body) {
  return MARKER_TOKEN_RE.test(body || "");
}
function getMarkerType(body) {
  const t = body || "";
  // Prefer leading / first-occurring known marker (order: AI then REVIEW as defined)
  for (const [type, cfg] of Object.entries(MENTION_TYPES)) {
    if (new RegExp(cfg.prefix.trim() + "\\b", "i").test(t)) return type;
  }
  return null;
}
/** Remove leading @AI / @REVIEW tags (mutually exclusive cleanup). */
function stripMarkers(body) {
  let t = String(body || "");
  let prev;
  do {
    prev = t;
    t = t.replace(/^\s*(?:@AI|@REVIEW)\b\s*/i, "");
  } while (t !== prev);
  return t;
}
/**
 * Optional: force a leading marker on body text (human-card invoke path).
 * AI mode cards must NOT use this for drafts — identity is threadType only.
 */
function ensureMarker(body, type) {
  if (!type || !MENTION_TYPES[type]) return stripMarkers(body);
  const cfg = MENTION_TYPES[type];
  const rest = stripMarkers(body).replace(/^\s+/, "");
  if (!rest) return cfg.prefix;
  return cfg.prefix + rest;
}
function markerPlaceholder(type, isReply) {
  if (isReply) return "\u56DE\u590D\u2026";
  if (type && MENTION_TYPES[type]) return MENTION_TYPES[type].placeholder;
  return "\u5199\u8C03\u6574\u8BF4\u660E\u2026";
}
function typeLabel(type) {
  if (type === "ai") return "AI\u8C03\u6574";
  if (type === "review") return "\u5BA1\u9605"; // legacy display
  return "\u4EBA\u7C7B\u8C03\u6574";
}
/**
 * Seed an empty draft for new threads. Markers are manual input only.
 * @AI / @REVIEW must never be prefilled.
 */
function seedDraft(threadId, type) {
  if (!threadId) return;
  // Always start empty — including AI mode. Do not prefill "@AI ".
  if (State.replyDrafts[threadId] == null) {
    State.replyDrafts[threadId] = "";
  }
}
/**
 * Programmatic marker conversion for legacy tests/tools. No in-card UI.
 * It never touches a draft; user-entered @AI remains the normal path.
 */
function applyThreadType(threadId, type) {
  // Compatibility/test hook only: converts a body to explicit marker mode.
  const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === threadId);
  if (!thread) return;
  let draft = State.replyDrafts[threadId];
  if (draft == null) {
    const taLive = document.querySelector(`[data-thread-input="${threadId}"]`);
    draft = taLive ? taLive.value : "";
  }
  State.replyDrafts[threadId] = stripMarkers(draft);
  const root = Array.isArray(thread.comments) ? thread.comments[0] : null;
  if (root && String(root.body || "").trim()) {
    const body = String(root.body || "");
    root.body = type === "ai" ? ensureMarker(body, "ai") : stripMarkers(body);
  }
  if (type === "ai" || type === "review") thread.threadType = type;
  else delete thread.threadType;
  markDirty();
  try { if (typeof syncAnnotationMarkModeAttrs === "function") syncAnnotationMarkModeAttrs(threadId); } catch (_) {}
  try { if (typeof refreshAnnotationImageDecos === "function") refreshAnnotationImageDecos(); } catch (_) {}
  try { if (typeof highlightActiveMark === "function") highlightActiveMark(); } catch (_) {}
  renderCommentList();
  focusThreadInput(threadId);
}
// backward-compat aliases
var AI_MENTION_PREFIX = MENTION_TYPES.ai.prefix;
function bodyHasAiMarker(body) { return getMarkerType(body) === "ai"; }
function ensureAiMarker(body) { return ensureMarker(body, "ai"); }
function seedAiDraft(threadId) { return seedDraft(threadId, "ai"); }
function focusThreadInput(threadId, { type = undefined } = {}) {
  setTimeout(() => {
    const ta2 = document.querySelector(`[data-thread-input="${threadId}"]`);
    if (!ta2) return;
    if (type !== undefined) {
      let v;
      if (State.replyDrafts[threadId] != null) {
        v = State.replyDrafts[threadId];
      } else {
        v = ta2.value || "";
      }
      // Never inject @AI / @REVIEW into the box — mode is threadType / blue card only.
      ta2.value = v;
      const thr = State.annotations.find((t) => t && t.threadId === threadId);
      const hasBody = !!(thr && Array.isArray(thr.comments) && thr.comments[0] && String(thr.comments[0].body || "").trim());
      ta2.placeholder = markerPlaceholder(type, hasBody);
      ta2.focus();
      try {
        const n = ta2.value.length;
        ta2.setSelectionRange(n, n);
      } catch {
      }
      const btn = document.querySelector(`[data-act="submit-reply"][data-thread="${threadId}"]`);
      if (btn) btn.disabled = !ta2.value.trim();
      // keep one-line autosize in sync if present
      try {
        ta2.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}
    } else {
      ta2.focus();
    }
  }, 50);
}
/**
 * Create annotation from current editor selection.
 * The public opts parameter remains for legacy callers but typed creation is disabled;
 * AI mode is selected only by an explicit @AI body marker after submission.
 */
function createAnnotationFromSelection(opts = {}) {
  const options = opts && typeof opts === "object" ? opts : {};
  // UI no longer creates typed cards; retain only the legacy marker-free human path.
  const type = null;
  void options;
  if (!State.editor) return null;
  const sel = State.editor.state.selection;
  try {
    if (!sel.empty && isRangeSupervisionLocked(sel.from, sel.to)) {
      try { showToast("AI 监管中：未处理段落暂不可批注", 2200); } catch (_) {}
      return null;
    }
  } catch (_) {}
  if (sel.empty && (!sel.$anchor || !sel.$head)) return null;
  const isCellSel = sel.constructor && (sel.constructor.name === "CellSelection" || sel.forEachCell && sel.$anchorCell && sel.$headCell);
  if (isCellSel) {
    return handleCreateMultiCellAnnotation(sel, { type }) || null;
  }
  const { from: from2, to } = sel;
  if (from2 === to) return null;
  let node = sel.node;
  if ((!node || node.type.name !== "image") && isImageNodeSelection(sel)) {
    try {
      node = State.editor.state.doc.nodeAt(sel.from);
    } catch (e) {
      node = null;
    }
  }
  if (node && node.type && node.type.name === "image") {
    const anc = {
      from: from2,
      to: from2 + node.nodeSize,
      src: node.attrs.src || "",
      alt: node.attrs.alt || "",
      title: node.attrs.title || ""
    };
    return createAnnotationThread(anc.from, anc.to, imageAnchorLabel(anc), {
      imageAnchors: [anc],
      skipMark: true,
      type
    });
  }
  const imageAnchors = collectImageAnchors(State.editor.state.doc, from2, to);
  const $from = State.editor.state.doc.resolve(from2);
  const $to = State.editor.state.doc.resolve(to);
  if ($from.parent !== $to.parent) {
    if ($from.parent.isTextblock && $to.parent.isTextblock || imageAnchors.length > 0) {
      return handleCreateMultiParagraphAnnotation(from2, to, { type }) || null;
    }
  }
  const text2 = State.editor.state.doc.textBetween(from2, to, " ");
  if ((!text2 || !text2.trim()) && imageAnchors.length) {
    const label = imageAnchors.map(imageAnchorLabel).join(" ");
    return createAnnotationThread(from2, to, label, { imageAnchors, skipMark: true, type });
  }
  return createAnnotationThread(from2, to, text2, imageAnchors.length ? { imageAnchors, type } : { type });
}
function triggerCommentCreate() {
  const sel = State.editor && State.editor.state.selection;
  if (!sel || sel.empty || sel.from === sel.to) {
    setStatus("\u63D0\u793A", "\u8BF7\u5148\u9009\u4E2D\u4E00\u6BB5\u6587\u5B57\u518D\u70B9\u6279\u6CE8");
    return false;
  }
  createAnnotationFromSelection();
  const fb = $("#float-comment-btn");
  if (fb) fb.classList.add("hidden");
  return true;
}
function setupFloatCommentButton() {
  const floatWrap = $("#float-comment-btn");
  if (floatWrap) {
    // Keep editor selection when pressing float buttons (do not steal focus).
    const preserveSel = (e) => {
      e.preventDefault();
    };
    floatWrap.addEventListener("mousedown", preserveSel);
    floatWrap.addEventListener("pointerdown", preserveSel);
    floatWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-float-act]");
      if (!btn || !floatWrap.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const actType = btn.getAttribute("data-float-act");
      if (actType !== "comment") return;
      const sel = State.editor && State.editor.state.selection;
      if (!sel || sel.empty || sel.from === sel.to) {
        setStatus("\u63D0\u793A", "\u8BF7\u5148\u9009\u4E2D\u4E00\u6BB5\u6587\u5B57\u518D\u70B9\u6279\u6CE8");
        floatWrap.classList.add("hidden");
        return;
      }
      createAnnotationFromSelection();
      floatWrap.classList.add("hidden");
    });
  }
  $("#mark-delete-btn").addEventListener("click", () => {
    const threadId = State.activeThreadId;
    if (!threadId) return;
    deleteThread(threadId);
  });

  const isEditorTarget = (t) => !!(t && t.closest && t.closest("#editor .ProseMirror, #editor .tiptap, #editor"));
  const hideFloat = () => {
    const fb = $("#float-comment-btn");
    if (fb) fb.classList.add("hidden");
  };
  /** Run after browser + ProseMirror have committed the final selection. */
  const afterSelectionSettled = (fn) => {
    // pointerup runs before mouseup/PM commit — double rAF is still early on some engines;
    // setTimeout(0) waits until after the current input event cascade.
    setTimeout(() => {
      try {
        fn();
      } catch (err) {
      }
    }, 0);
  };

  // MouseEvent.detail has real click-count; PointerEvent.detail is always 0.
  document.addEventListener("mousedown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (typeof e.detail === "number" && e.detail > 0) _selPtr.clickDetail = e.detail;
  }, true);

  // Use ONLY pointer events for down/move/up bookkeeping (avoid double with mouseup).
  document.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest("#float-comment-btn")) return;
    const inEditor = isEditorTarget(e.target);
    _selPtr.down = inEditor;
    _selPtr.inEditor = inEditor;
    _selPtr.x = e.clientX;
    _selPtr.y = e.clientY;
    _selPtr.moved = false;
    _selPtr.gen = (_selPtr.gen || 0) + 1;
    if (typeof e.detail === "number" && e.detail > 0) _selPtr.clickDetail = e.detail;
    _selPtr.shift = !!e.shiftKey;
    _selPtr.meta = !!e.metaKey;
    _selPtr.ctrl = !!e.ctrlKey;
    _selPtr.alt = !!e.altKey;
    if (!inEditor) _selPtr.markClick = null;
    // Any outside/editor click hides float immediately (stale full-doc float is confusing).
    hideFloat();
  }, true);

  document.addEventListener("pointermove", (e) => {
    if (!_selPtr.down) return;
    const dx = e.clientX - _selPtr.x;
    const dy = e.clientY - _selPtr.y;
    if (dx * dx + dy * dy > 16) _selPtr.moved = true; // >4px
  }, true);

  const endPtr = (e) => {
    if (!_selPtr.down) return;
    const wasInEditor = _selPtr.inEditor;
    const moved = _selPtr.moved;
    const upX = e && typeof e.clientX === "number" ? e.clientX : _selPtr.x;
    const upY = e && typeof e.clientY === "number" ? e.clientY : _selPtr.y;
    const markClick = _selPtr.markClick;
    // pointerup.detail is always 0 — use mousedown/pointerdown-captured click count
    const detail = markClick && markClick.detail > 0
      ? markClick.detail
      : _selPtr.clickDetail > 0
        ? _selPtr.clickDetail
        : e && typeof e.detail === "number" && e.detail > 0
          ? e.detail
          : 1;
    const hadMod = _selPtr.shift || _selPtr.meta || _selPtr.ctrl || _selPtr.alt;
    const genAtEnd = _selPtr.gen;
    _selPtr.down = false;
    _selPtr.markClick = null;
    if (!wasInEditor) return;
    afterSelectionSettled(() => {
      // A newer pointerdown (e.g. 2nd click of a double-click) supersedes this settle.
      if (genAtEnd !== _selPtr.gen) return;
      if (!State.editor || !State.editor.view) return;
      const sel = State.editor.state.selection;
      const docSize = State.editor.state.doc.content.size;
      const span = Math.abs(sel.to - sel.from);
      // Shift/mod click extends selection — never collapse.
      if (!moved && hadMod) {
        if (!sel.empty) handleSelectionChange({ forceFloat: true });
        else hideFloat();
        return;
      }
      // Double/triple click → word/paragraph select; keep it and show float.
      if (!moved && detail > 1) {
        if (!sel.empty) handleSelectionChange({ forceFloat: true });
        else hideFloat();
        return;
      }
      // Pure single click (no drag).
      if (!moved) {
        // Image NodeSelection set by setupImageAnnotationSelect mousedown handler —
        // do NOT collapse to caret. Keep float comment button visible so user can
        // click 批注 to annotate the image.
        if (isImageNodeSelection(sel)) {
          handleSelectionChange({ forceFloat: true });
          return;
        }
        hideFloat();
        // Click on annotation mark: caret at click (never leave whole-mark range).
        if (markClick && markClick.threadId) {
          const pos = caretPosForMarkClick(markClick.threadId, upX, upY);
          if (pos != null) {
            try {
              State.editor.chain().focus().setTextSelection(pos).run();
            } catch (err) {
              try {
                State.editor.commands.setTextSelection(pos);
              } catch (e2) {
              }
            }
          }
          activateAndRevealThread(markClick.threadId);
          positionMarkDeletePopover();
          return;
        }
        // Elsewhere: collapse accidental multi-char flash (stale select-all), keep real caret.
        if (!sel.empty && span > 1) {
          let pos = null;
          try {
            const c = State.editor.view.posAtCoords({ left: upX, top: upY });
            if (c && typeof c.pos === "number") pos = c.pos;
          } catch (err) {
          }
          if (pos == null) pos = sel.from;
          try {
            State.editor.chain().focus().setTextSelection(pos).run();
          } catch (err) {
            try {
              State.editor.commands.setTextSelection(pos);
            } catch (e2) {
            }
          }
        }
        return;
      }
      // Drag: keep selection (including near-full-doc if user really dragged that far).
      handleSelectionChange({ forceFloat: true });
    });
  };
  document.addEventListener("pointerup", endPtr, true);
  document.addEventListener("pointercancel", endPtr, true);
  window.addEventListener("blur", () => {
    if (_selPtr.down) endPtr();
  });

  const editorPane = $("#editor-pane");
  if (editorPane) editorPane.addEventListener("scroll", positionMarkDeletePopover);
  setupImageAnnotationSelect();
}
function resolveImagePosFromDom(img) {
  if (!img || !State.editor) return -1;
  let imgPos = -1;
  try {
    const posInfo = State.editor.view.posAtDOM(img, 0);
    let p = typeof posInfo === "number" ? posInfo : posInfo && posInfo.pos;
    if (typeof p === "number") {
      const $p = State.editor.state.doc.resolve(Math.min(Math.max(p, 0), State.editor.state.doc.content.size));
      if ($p.nodeAfter && $p.nodeAfter.type.name === "image") imgPos = $p.pos;
      else if ($p.nodeBefore && $p.nodeBefore.type.name === "image") imgPos = $p.pos - $p.nodeBefore.nodeSize;
    }
    if (imgPos < 0) {
      State.editor.state.doc.descendants((n, pos) => {
        if (n.type.name === "image" && imgPos < 0) {
          const dom = State.editor.view.nodeDOM(pos);
          const el = dom && (dom.tagName === "IMG" ? dom : dom.querySelector && dom.querySelector("img"));
          if (el === img || el && el.contains && el.contains(img) || dom === img) imgPos = pos;
        }
      });
    }
  } catch (err) {
    console.warn("[imageSelect] pos fail", err);
  }
  return imgPos;
}
function selectionCoversImage(sel, imgPos, imgEnd) {
  if (!sel) return false;
  if (sel.node && sel.from === imgPos) return true;
  if (!sel.empty && sel.from <= imgPos && sel.to >= imgEnd) return true;
  return false;
}
function posJustAfterImage(imgPos, imgEnd) {
  const doc5 = State.editor.state.doc;
  if (imgEnd >= doc5.content.size) return imgEnd;
  try {
    const $a = doc5.resolve(imgEnd);
    if ($a.parent && $a.parent.inlineContent) return imgEnd;
    if ($a.nodeAfter && $a.nodeAfter.isTextblock) return imgEnd + 1;
  } catch (e) {
  }
  return Math.min(imgEnd + 1, doc5.content.size);
}
function posJustBeforeImage(imgPos) {
  const doc5 = State.editor.state.doc;
  if (imgPos <= 0) return 0;
  try {
    const $b = doc5.resolve(imgPos);
    if ($b.parent && $b.parent.inlineContent) return imgPos;
    if ($b.nodeBefore && $b.nodeBefore.isTextblock) return imgPos - 1;
  } catch (e) {
  }
  return Math.max(imgPos - 1, 0);
}
function extendSelectionThroughImage(img) {
  if (!State.editor || !img) return false;
  const imgPos = resolveImagePosFromDom(img);
  if (imgPos < 0) return false;
  const node = State.editor.state.doc.nodeAt(imgPos);
  if (!node || node.type.name !== "image") return false;
  const imgEnd = imgPos + node.nodeSize;
  const sel = State.editor.state.selection;
  if (selectionCoversImage(sel, imgPos, imgEnd)) return false;
  let from2 = sel.from;
  let to = sel.to;
  if (from2 > to) {
    const t = from2;
    from2 = to;
    to = t;
  }
  if (sel.empty || from2 === to) {
    try {
      State.editor.chain().focus().setNodeSelection(imgPos).run();
    } catch (err) {
      try {
        State.editor.commands.setNodeSelection(imgPos);
      } catch (e2) {
      }
    }
    return true;
  }
  if (to <= imgPos) {
    to = posJustAfterImage(imgPos, imgEnd);
  } else if (from2 >= imgEnd) {
    from2 = posJustBeforeImage(imgPos);
  } else {
    if (from2 > imgPos) from2 = posJustBeforeImage(imgPos);
    if (to < imgEnd) to = posJustAfterImage(imgPos, imgEnd);
  }
  const onlyImage = from2 === imgPos && to === imgEnd || from2 === posJustBeforeImage(imgPos) && to === posJustAfterImage(imgPos, imgEnd) && !State.editor.state.doc.textBetween(from2, to, "").trim();
  try {
    if (onlyImage || from2 >= imgPos && to <= imgEnd) {
      State.editor.chain().focus().setNodeSelection(imgPos).run();
    } else {
      State.editor.chain().focus().setTextSelection({ from: from2, to }).run();
    }
  } catch (err) {
    try {
      State.editor.commands.setNodeSelection(imgPos);
    } catch (e2) {
      try {
        State.editor.commands.setTextSelection({ from: from2, to });
      } catch (e3) {
      }
    }
  }
  return true;
}
function tryPlaceCaretInImageGap(e) {
  if (!State.editor || !State.editor.view) return false;
  if (e.target && e.target.closest && e.target.closest(".ProseMirror img, .ProseMirror .ProseMirror-selectednode img")) {
    return false;
  }
  const view = State.editor.view;
  const doc5 = view.state.doc;
  const BAND = 48;
  let best = null;
  doc5.descendants((n, pos) => {
    if (n.type.name !== "image") return;
    let dom = null;
    try {
      dom = view.nodeDOM(pos);
    } catch (err) {
      return;
    }
    const el = dom && (dom.tagName === "IMG" ? dom : dom.querySelector && dom.querySelector("img"));
    if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left - 20 || e.clientX > r.right + 20) return;
    const distBefore = r.top - e.clientY;
    const distAfter = e.clientY - r.bottom;
    if (distBefore > 0 && distBefore <= BAND) {
      if (!best || distBefore < best.d) best = { pos, d: distBefore, side: "before", r };
    } else if (distAfter > 0 && distAfter <= BAND) {
      if (!best || distAfter < best.d) best = { pos, d: distAfter, side: "after", r };
    }
  });
  if (!best) return false;
  try {
    const coords = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (coords && coords.inside != null && coords.inside >= 0) {
      const n = doc5.nodeAt(coords.inside);
      if (n && n.isTextblock && n.content.size > 0) {
        let tbDom = null;
        try {
          tbDom = view.nodeDOM(coords.inside);
        } catch (err) {
          tbDom = null;
        }
        if (tbDom && tbDom.getBoundingClientRect) {
          const tr2 = tbDom.getBoundingClientRect();
          const nearImg = best.d <= 16;
          const inTextCore = e.clientY >= tr2.top + 4 && e.clientY <= tr2.bottom - 4;
          if (inTextCore && !nearImg) return false;
        }
      }
      if (n && n.type.name === "image") return false;
    }
  } catch (err) {
  }
  const imgPos = best.pos;
  const node = doc5.nodeAt(imgPos);
  if (!node || node.type.name !== "image") return false;
  const imgEnd = imgPos + node.nodeSize;
  const side = best.side;
  const ed = State.editor;
  if (side === "before") {
    const resolvedBefore = doc5.resolve(imgPos);
    const prev = resolvedBefore.nodeBefore;
    if (prev && prev.type.name === "paragraph" && prev.content.size === 0) {
      ed.chain().focus().setTextSelection(imgPos - 1).run();
    } else if (prev && prev.isTextblock && prev.content.size > 0) {
      ed.chain().focus().insertContentAt(imgPos, { type: "paragraph" }).setTextSelection(imgPos + 1).run();
    } else {
      ed.chain().focus().insertContentAt(imgPos, { type: "paragraph" }).setTextSelection(imgPos + 1).run();
    }
  } else {
    const resolvedAfter = doc5.resolve(imgEnd);
    const next2 = resolvedAfter.nodeAfter;
    if (next2 && next2.type.name === "paragraph" && next2.content.size === 0) {
      ed.chain().focus().setTextSelection(imgEnd + 1).run();
    } else if (next2 && next2.isTextblock && next2.content.size > 0) {
      ed.chain().focus().insertContentAt(imgEnd, { type: "paragraph" }).setTextSelection(imgEnd + 1).run();
    } else {
      ed.chain().focus().insertContentAt(imgEnd, { type: "paragraph" }).setTextSelection(imgEnd + 1).run();
    }
  }
  try {
    view.focus();
  } catch (err) {
  }
  queueMicrotask(() => handleSelectionChange());
  return true;
}
function setupImageAnnotationSelect() {
  const editorEl = $("#editor");
  if (!editorEl || editorEl._imageAnnSelectBound) return;
  editorEl._imageAnnSelectBound = true;
  let downOnImage = false;
  let pointerDown = false;
  let lastImgOver = null;
  let finishScheduled = false;
  const imgFromEvent = (e) => {
    let img = e.target && e.target.closest && e.target.closest(".ProseMirror img, .ProseMirror .ProseMirror-selectednode img");
    if (!img && typeof e.clientX === "number") {
      try {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        img = el && el.closest && el.closest(".ProseMirror img, .ProseMirror .ProseMirror-selectednode img");
      } catch (err) {
      }
    }
    return img || null;
  };
  editorEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || !State.editor) return;
    pointerDown = true;
    finishScheduled = false;
    try {
      const fb = $("#float-comment-btn");
      if (fb && !fb.classList.contains("hidden") && !(e.target && e.target.closest && e.target.closest("#float-comment-btn"))) {
        fb.classList.add("hidden");
      }
    } catch (err) {
    }
    const img = imgFromEvent(e);
    downOnImage = !!img;
    lastImgOver = img;
    if (!img) {
      if (tryPlaceCaretInImageGap(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const imgPos = resolveImagePosFromDom(img);
    if (imgPos < 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      State.editor.chain().focus().setNodeSelection(imgPos).run();
    } catch (err) {
      try {
        State.editor.commands.setNodeSelection(imgPos);
      } catch (e2) {
      }
    }
    queueMicrotask(() => handleSelectionChange());
  }, true);
  const onMove = (e) => {
    if (!pointerDown || !State.editor || downOnImage) return;
    const img = imgFromEvent(e);
    if (img) lastImgOver = img;
  };
  editorEl.addEventListener("mousemove", onMove, true);
  document.addEventListener("mousemove", onMove, true);
  const finishDrag = (e) => {
    if (e && e.button != null && e.button !== 0) return;
    if (!pointerDown && !downOnImage) return;
    const startedOnImage = downOnImage;
    const img = e && imgFromEvent(e) || lastImgOver;
    pointerDown = false;
    downOnImage = false;
    lastImgOver = null;
    if (startedOnImage) return;
    if (!img || !State.editor) return;
    if (finishScheduled) return;
    finishScheduled = true;
    const run3 = () => {
      finishScheduled = false;
      if (!State.editor) return;
      if (extendSelectionThroughImage(img)) {
        queueMicrotask(() => handleSelectionChange());
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run3);
    });
    setTimeout(run3, 0);
  };
  editorEl.addEventListener("mouseup", finishDrag, true);
  document.addEventListener("mouseup", finishDrag, true);
  // Double-click an image → open fullscreen lightbox zoom.
  // Use click count on mousedown to detect double-click reliably across browsers
  // (dblclick event fires on the img target, but we intercept at editor capture).
  let lastImgClick = 0;
  editorEl.addEventListener("dblclick", (e) => {
    if (e.button !== 0) return;
    const img = imgFromEvent(e);
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    // Hide float comment button — lightbox takes over.
    try { $("#float-comment-btn").classList.add("hidden"); } catch (_) {}
    openImageLightbox(img);
  }, true);
}
/**
 * Open a fullscreen lightbox overlay showing the clicked image at native resolution.
 * Click outside the image (or press Esc / 左方向键) to close.
 */
function openImageLightbox(img) {
  if (!img) return;
  const src = img.getAttribute("src") || img.src || "";
  if (!src) return;
  const alt = img.getAttribute("alt") || "";
  // Reuse existing overlay if present (double-trigger safety).
  let overlay = document.getElementById("image-lightbox");
  if (overlay) overlay.remove();
  overlay = document.createElement("div");
  overlay.id = "image-lightbox";
  overlay.className = "image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", alt ? "图片放大：" + alt : "图片放大");
  const figure = document.createElement("figure");
  const imgEl = document.createElement("img");
  imgEl.src = src;
  imgEl.alt = alt;
  imgEl.draggable = false;
  figure.appendChild(imgEl);
  if (alt) {
    const cap = document.createElement("figcaption");
    cap.textContent = alt;
    figure.appendChild(cap);
  }
  overlay.appendChild(figure);
  const close = () => {
    overlay.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onClick = (e) => {
    // Click on overlay backdrop (not on the image itself) closes.
    if (e.target === overlay || e.target === figure) close();
  };
  const onKey = (e) => {
    if (e.key === "Escape" || e.key === "ArrowLeft" || e.key === "Backspace") {
      e.preventDefault();
      close();
    }
  };
  overlay.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  // Focus overlay for keyboard capture.
  overlay.tabIndex = -1;
  overlay.focus();
}
var AIListeners = { newComment: [], threadChange: [] };
function emitAI(event, payload) {
  (AIListeners[event] || []).forEach((cb) => {
    try {
      cb(payload);
    } catch (e) {
      console.warn("AI listener error:", e);
    }
  });
}
function checkAnnotationCap() {
  const cap = State.maxAnnotations || 0;
  if (cap === 0) return true;
  if (State.annotations.length < cap) return true;
  showToast(`\u5DF2\u8FBE\u6279\u6CE8\u4E0A\u9650 (${cap} \u6761). \u5728\u5DE5\u5177\u680F \u2699 \u8C03\u6574\u4E0A\u9650, \u6216\u6E05\u7406\u5DF2\u89E3\u51B3\u6279\u6CE8`, 4e3);
  setStatus("\u521B\u5EFA\u88AB\u62D2", `\u5DF2\u8FBE ${State.annotations.length}/${cap} \u6761\u6279\u6CE8\u4E0A\u9650. \u2699 \u8BBE\u7F6E\u91CC\u6539\u6216\u5220\u9664\u65E7\u6279\u6CE8`);
  return false;
}
function createAnnotationThread(from2, to, text2, opts = null) {
  const options = opts && typeof opts === "object" ? opts : {};
  if (!text2 || text2.length === 0) {
    showToast("\u6279\u6CE8\u6587\u5B57\u4E0D\u80FD\u4E3A\u7A7A", 2e3);
    return null;
  }
  if (!checkAnnotationCap()) return null;
  if (State.annotations.some((a) => a.range && a.range.from === from2 && a.range.to === to)) {
    showToast("\u8BE5\u4F4D\u7F6E\u5DF2\u6709\u6279\u6CE8", 1800);
    setStatus("\u63D0\u793A", `\u8303\u56F4 ${from2}-${to} \u5DF2\u6709\u6279\u6CE8\uFF0C\u8BF7\u9009\u62E9\u4E0D\u540C\u7684\u8303\u56F4`);
    return null;
  }
  const threadId = uuid();
  const { prefix, suffix } = computeContextAt(State.editor.state.doc, from2, to);
  const anchorEv = {
    version: "1",
    quote: { exact: text2, prefix: prefix || "", suffix: suffix || "" },
    position: { from: from2, to, startAssoc: 1, endAssoc: -1 },
    status: "attached",
    confidence: 1,
    updatedAt: nowISO()
  };
    const thread = {
      threadId,
      range: { from: from2, to },
      text: text2,
      // 锚定文字
      prefix,
      // text 前的上下文 (max 20 字符, 换行截断)
      suffix,
      // text 后的上下文
      anchor: anchorEv,
      resolved: false,
      createdAt: nowISO(),
      comments: [],
      // P-card fix: 初始空, 第一次 addReply 时填充
      // v1.43.25: 未提交首条评论前是 draft — 不入 undo 栈, 避免改正文/Ctrl+Z 误删整条
      pending: true,
      authorColor: authorColorIndex(State.authorId || threadId)
    };
  if (Array.isArray(options.imageAnchors) && options.imageAnchors.length) {
    thread.imageAnchors = options.imageAnchors.map((a) => ({ ...a }));
  } else if (State.editor) {
    const autoImg = collectImageAnchors(State.editor.state.doc, from2, to);
    if (autoImg.length) thread.imageAnchors = autoImg;
  }
  if (Array.isArray(options.ranges) && options.ranges.length) {
    thread.ranges = options.ranges.map((r) => ({ ...r }));
  }
  State.annotations.push(thread);
  let skipMark = !!options.skipMark;
  if (!skipMark && thread.imageAnchors && thread.imageAnchors.length === 1) {
    const a0 = thread.imageAnchors[0];
    if (a0.from === from2 && a0.to === to) skipMark = true;
  }
  if (!skipMark && from2 < to) {
    applyAnnotationMark(threadId, from2, to);
  }
  refreshAnnotationImageDecos();
  activateAnnotationThread(threadId, { ensureCard: false });
  if (options.type) seedDraft(threadId, options.type);
  renderCommentList();
  positionMarkDeletePopover();
  focusThreadInput(threadId, { type: options.type });
  setStatus(
    options.type === "ai" ? "AI\u8C03\u6574" : "\u4EBA\u7C7B\u8C03\u6574",
    options.type ? `\u5199\u5185\u5BB9\u540E\u63D0\u4EA4 \xB7 ${threadId.slice(0, 8)}` : `\u7EBF\u7A0B ${threadId.slice(0, 8)}`
  );
  emitAI("threadChange", { threadId, change: "create", thread });
  return thread;
}
function handleCreateMultiCellAnnotation(cellSel, opts = {}) {
  const options = opts && typeof opts === "object" ? opts : {};
  if (!checkAnnotationCap()) return;
  const ranges = [];
  let totalText = "";
  cellSel.forEachCell((node, pos) => {
    const from2 = pos + 1;
    const to = pos + node.nodeSize - 1;
    if (from2 < to) {
      ranges.push({ from: from2, to });
      totalText += State.editor.state.doc.textBetween(from2, to, " ") + " ";
    }
  });
  if (ranges.length === 0) {
    showToast("\u6240\u9009\u5355\u5143\u683C\u4E3A\u7A7A", 2e3);
    return;
  }
  if (State.annotations.some((a) => a.range && a.range.from === ranges[0].from && a.range.to === ranges[0].to)) {
    showToast("\u8BE5\u4F4D\u7F6E\u5DF2\u6709\u6279\u6CE8", 1800);
    setStatus("\u63D0\u793A", `\u8303\u56F4 ${ranges[0].from}-${ranges[0].to} \u5DF2\u6709\u6279\u6CE8\uFF0C\u8BF7\u9009\u62E9\u4E0D\u540C\u7684\u8303\u56F4`);
    return;
  }
  const text2 = totalText.trim() || "(\u7A7A)";
  const threadId = uuid();
  const commentId = uuid();
  const { prefix, suffix } = computeContextAt(State.editor.state.doc, ranges[0].from, ranges[0].to);
  const thread = {
    threadId,
    range: ranges[0],
    // 主 range 用于 activeMark 等单点逻辑
    ranges,
    // 多 cell 范围数组 (table multi-cell annotation)
    text: text2,
    prefix,
    suffix,
    anchor: {
      version: "1",
      quote: { exact: text2, prefix: prefix || "", suffix: suffix || "" },
      position: { from: ranges[0].from, to: ranges[0].to, startAssoc: 1, endAssoc: -1 },
      status: "attached",
      confidence: 1,
      updatedAt: nowISO()
    },
    resolved: false,
    createdAt: nowISO(),
    comments: [{
      id: commentId,
      author: currentAuthorPayload(),
      body: "",
      createdAt: nowISO()
    }],
    pending: true,
    authorColor: authorColorIndex(State.authorId || threadId)
    // v1.43.25
  };
  State.annotations.push(thread);
  applyAnnotationMarksMultiCell(threadId, ranges);
  State.editor.commands.setTextSelection(ranges[0].from);
  activateAnnotationThread(threadId, { ensureCard: false });
  if (options.type) seedDraft(threadId, options.type);
  renderCommentList();
  focusThreadInput(threadId, { type: options.type });
  setStatus(options.type === "ai" ? "AI \u6279\u6CE8" : "\u5DF2\u521B\u5EFA\u6279\u6CE8", `${ranges.length} \u4E2A\u5355\u5143\u683C \xB7 ${threadId.slice(0, 8)}`);
  emitAI("threadChange", { threadId, change: "create", thread });
  return thread;
}
function authorColorIndex(authorId) {
  if (!authorId) return 0;
  let h = 0;
  for (let i = 0; i < authorId.length; i++) h = h * 31 + authorId.charCodeAt(i) | 0;
  return Math.abs(h) % 8;
}
function annotationAuthorColor(thread) {
  const savedColor = Number(thread?.authorColor);
  if (Number.isInteger(savedColor) && savedColor >= 0 && savedColor < 8) {
    return savedColor;
  }
  const firstAuthorId = thread && thread.comments?.[0]?.author?.id;
  return authorColorIndex(firstAuthorId || thread?.threadId || "");
}
/**
 * Single source for annotation mark attrs.
 * Human: authorColor drives body tint. AI/review: threadType drives body tint (CSS),
 * matching card rail / badge / float — authorColor still stored for avatars.
 */
function annotationMarkAttrs(thread, extra = {}) {
  const tid = extra.threadId != null ? extra.threadId : thread && thread.threadId;
  let tt = extra.threadType !== undefined
    ? extra.threadType
    : thread
      ? threadTypeOf(thread)
      : null;
  if (tt !== "ai" && tt !== "review") tt = null;
  const resolved = extra.resolved != null ? !!extra.resolved : !!(thread && thread.resolved);
  const authorColor = extra.authorColor != null
    ? extra.authorColor
    : annotationAuthorColor(thread);
  const out = {
    threadId: tid || null,
    resolved,
    authorColor: Number.isInteger(Number(authorColor)) ? Number(authorColor) : 0,
    threadType: tt
  };
  if (extra.active != null) out.active = !!extra.active;
  return out;
}
/** Rewrite live marks so data-thread-type / resolved match State.annotations (mode color parity). */
function syncAnnotationMarkModeAttrs(threadIdFilter = null) {
  const ed = State.editor;
  if (!ed) return;
  const markType = ed.schema.marks.annotation;
  if (!markType) return;
  const patches = [];
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type !== markType) continue;
      const tid = mark.attrs.threadId;
      if (!tid) continue;
      if (threadIdFilter && tid !== threadIdFilter) continue;
      const thr = State.annotations.find((a) => a && a.threadId === tid);
      if (!thr) continue;
      const next = annotationMarkAttrs(thr, { active: !!mark.attrs.active });
      const same =
        mark.attrs.threadType === next.threadType &&
        !!mark.attrs.resolved === !!next.resolved &&
        Number(mark.attrs.authorColor || 0) === Number(next.authorColor || 0);
      if (same) continue;
      patches.push({ from: pos, to: pos + node.nodeSize, mark, next });
    }
  });
  if (!patches.length) return;
  let tr2 = ed.state.tr;
  for (const p of patches) {
    tr2 = tr2.removeMark(p.from, p.to, p.mark);
    tr2 = tr2.addMark(p.from, p.to, markType.create(p.next));
  }
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  ed.view.dispatch(tr2);
}
function applyAnnotationMark(threadId, from2, to) {
  const tr2 = State.editor.state.tr;
  const thread = State.annotations.find((item) => item && item.threadId === threadId);
  tr2.addMark(from2, to, State.editor.schema.marks.annotation.create(annotationMarkAttrs(thread, { threadId, resolved: false })));
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  State.editor.view.dispatch(tr2);
}
function applyAnnotationMarksMultiCell(threadId, ranges) {
  const tr2 = State.editor.state.tr;
  const thread = State.annotations.find((item) => item && item.threadId === threadId);
  const mark = State.editor.schema.marks.annotation.create(annotationMarkAttrs(thread, { threadId, resolved: false }));
  for (const r of ranges) {
    tr2.addMark(r.from, r.to, mark);
  }
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  State.editor.view.dispatch(tr2);
}
function handleCreateMultiParagraphAnnotation(from2, to, opts = {}) {
  const options = opts && typeof opts === "object" ? opts : {};
  if (!checkAnnotationCap()) return;
  if (State.annotations.some((a) => a.range && a.range.from === from2 && a.range.to === to)) {
    showToast("\u8BE5\u4F4D\u7F6E\u5DF2\u6709\u6279\u6CE8", 1800);
    setStatus("\u63D0\u793A", `\u8303\u56F4 ${from2}-${to} \u5DF2\u6709\u6279\u6CE8\uFF0C\u8BF7\u9009\u62E9\u4E0D\u540C\u7684\u8303\u56F4`);
    return;
  }
  const ed = State.editor;
  const ranges = [];
  ed.state.doc.nodesBetween(from2, to, (node, pos) => {
    if (node.isTextblock) {
      const blockStart = pos;
      const blockEnd = pos + node.nodeSize;
      const textStart = blockStart + 1;
      const textEnd = blockEnd - 1;
      const rFrom = Math.max(from2, textStart);
      const rTo = Math.min(to, textEnd + 1);
      if (rFrom <= rTo && rTo > textStart && rFrom <= textEnd) {
        ranges.push({ from: rFrom, to: Math.max(rTo, rFrom) });
      }
    }
  });
  const imageAnchors = collectImageAnchors(ed.state.doc, from2, to);
  if (ranges.length === 0 && imageAnchors.length === 0) {
    showToast("\u6240\u9009\u6BB5\u843D\u4E3A\u7A7A", 2e3);
    return;
  }
  let text2 = ed.state.doc.textBetween(from2, to, " ");
  if ((!text2 || !text2.trim()) && imageAnchors.length) {
    text2 = imageAnchors.map(imageAnchorLabel).join(" ");
  } else if (imageAnchors.length) {
    const labels = imageAnchors.map(imageAnchorLabel).filter(Boolean);
    if (labels.length) {
      text2 = (text2 + " " + labels.map((l) => l.startsWith("[") ? l : `[\u56FE:${l}]`).join(" ")).trim();
    }
  }
  if (ranges.length === 0 && imageAnchors.length) {
    return createAnnotationThread(imageAnchors[0].from, imageAnchors[imageAnchors.length - 1].to, text2, {
      imageAnchors,
      skipMark: true,
      type: options.type
    });
  }
  const threadId = uuid();
  const commentId = uuid();
  const { prefix, suffix } = computeContextAt(ed.state.doc, ranges[0].from, ranges[0].to);
  const thread = {
    threadId,
    range: ranges[0],
    ranges,
    text: text2,
    prefix,
    suffix,
    anchor: {
      version: "1",
      quote: { exact: text2, prefix: prefix || "", suffix: suffix || "" },
      position: { from: ranges[0].from, to: ranges[0].to, startAssoc: 1, endAssoc: -1 },
      status: "attached",
      confidence: 1,
      updatedAt: nowISO()
    },
    resolved: false,
    createdAt: nowISO(),
    comments: [{
      id: commentId,
      author: currentAuthorPayload(),
      body: "",
      createdAt: nowISO()
    }]
  };
  if (imageAnchors.length) thread.imageAnchors = imageAnchors;
  thread.pending = true;
  thread.authorColor = authorColorIndex(State.authorId || threadId);
  State.annotations.push(thread);
  const tr2 = ed.state.tr;
  const mark = ed.schema.marks.annotation.create(annotationMarkAttrs(thread, { threadId, resolved: false }));
  for (const r of ranges) {
    if (r.from < r.to) {
      tr2.addMark(r.from, r.to, mark);
    }
  }
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  ed.view.dispatch(tr2);
  refreshAnnotationImageDecos();
  ed.commands.setTextSelection(ranges[0].from);
  activateAnnotationThread(threadId, { ensureCard: false });
  if (options.type) seedDraft(threadId, options.type);
  renderCommentList();
  focusThreadInput(threadId, { type: options.type });
  setStatus(
    options.type === "ai" ? "AI\u8C03\u6574" : ranges.length > 1 ? "\u4EBA\u7C7B\u8C03\u6574\uFF08\u591A\u6BB5\uFF09" : "\u4EBA\u7C7B\u8C03\u6574",
    `${ranges.length} \u6BB5 \xB7 ${threadId.slice(0, 8)}`
  );
  emitAI("threadChange", { threadId, change: "create", thread });
  return thread;
}
function editComment(threadId, commentIndex, body) {
  const thread = State.annotations.find((t) => t && t.threadId === threadId);
  if (!thread || !Array.isArray(thread.comments)) return false;
  const index = Number(commentIndex);
  const comment = thread.comments[index];
  const nextBody = String(body || "").trim();
  if (!comment || !nextBody) return false;
  pushHistory();
  comment.body = nextBody;
  comment.updatedAt = nowISO();
  const markerType = getMarkerType(nextBody);
  if (markerType) thread.threadType = markerType;
  else if (index === 0) delete thread.threadType;
  if (thread.pending) thread.pending = false;
  commitHistoryIfNeeded();
  markDirty();
  try { syncAnnotationMarkModeAttrs(threadId); } catch (_) {}
  renderCommentList();
  emitAI("threadChange", { threadId, change: "edit", comment });
  return true;
}
function addReply(threadId, body) {
  const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === threadId);
  if (!thread || !body.trim()) return;
  pushHistory();
  const comment = {
    id: uuid(),
    author: currentAuthorPayload(),
    body: body.trim(),
    createdAt: nowISO()
  };
  const markerType = getMarkerType(comment.body);
  if (markerType) thread.threadType = markerType;
  else if (thread.threadType !== "ai" && thread.threadType !== "review") delete thread.threadType;
  if (thread.pending) thread.pending = false;
  if (Array.isArray(thread.comments) && thread.comments.length === 1 && !String(thread.comments[0].body || "").trim()) {
    thread.comments[0] = { ...thread.comments[0], ...comment, body: comment.body };
  } else {
    if (!Array.isArray(thread.comments)) thread.comments = [];
    thread.comments.push(comment);
  }
  delete State.replyDrafts[threadId];
  commitHistoryIfNeeded();
  markDirty();
  try { syncAnnotationMarkModeAttrs(threadId); } catch (_) {}
  renderCommentList();
  emitAI("newComment", { threadId, comment });
  emitAI("threadChange", { threadId, change: "reply", comment });
}
function toggleResolved(threadId) {
  const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === threadId);
  if (!thread) return;
  pushHistory();
  thread.resolved = !thread.resolved;
  if (thread.resolved) {
    thread.resolvedAt = nowISO();
    thread.resolvedBy = State.authorId || State.author || "";
  } else {
  }
  const editor2 = State.editor;
  const tr2 = editor2.state.tr;
  const markType = editor2.schema.marks.annotation;
  editor2.state.doc.descendants((node, pos) => {
    node.marks.forEach((m) => {
      if (m.type === markType && m.attrs.threadId === threadId) {
        tr2.removeMark(pos, pos + node.nodeSize, m);
        tr2.addMark(pos, pos + node.nodeSize, markType.create({
          ...m.attrs,
          threadId,
          resolved: thread.resolved
        }));
      }
    });
  });
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  editor2.view.dispatch(tr2);
  commitHistoryIfNeeded();
  refreshAnnotationImageDecos();
  markDirty();
  renderCommentList();
  emitAI("threadChange", { threadId, change: "resolved", resolved: thread.resolved });
}
function startReattach(threadId) {
  const thread = State.annotations.find((t) => t && t.threadId === threadId);
  if (!thread) return;
  State.reattachTarget = threadId;
  setStatus("\u91CD\u65B0\u9009\u62E9\u6B63\u6587", "\u8BF7\u5728\u7F16\u8F91\u5668\u4E2D\u9009\u4E2D\u65B0\u6587\u5B57 (\u6309 Esc \u53D6\u6D88)");
  showToast("\u8BF7\u9009\u4E2D\u65B0\u6587\u5B57, \u7136\u540E\u6309\u56DE\u8F66\u6216\u70B9\u786E\u8BA4", 3e3);
  document.querySelectorAll(".comment-thread").forEach((c) => c.classList.remove("is-active"));
  if (window.__mdAnnotator.renderCommentList) {
  }
  const card = document.querySelector('.comment-thread[data-thread="' + threadId + '"]');
  if (card) card.classList.add("awaiting-reattach");
  document.addEventListener("keydown", reattachKeyHandler, { once: true });
}
var _reattachKeyHandler = null;
function reattachKeyHandler(e) {
  if (e.key === "Escape") {
    cancelReattach();
    return;
  }
  if (e.key === "Enter") {
    applyReattach();
    return;
  }
  document.addEventListener("keydown", reattachKeyHandler, { once: true });
}
_reattachKeyHandler = reattachKeyHandler;
function cancelReattach() {
  const tid = State.reattachTarget;
  if (tid) {
    const card = document.querySelector('.comment-thread[data-thread="' + tid + '"]');
    if (card) card.classList.remove("awaiting-reattach");
  }
  State.reattachTarget = null;
  setStatus("", "\u5DF2\u53D6\u6D88");
}
function applyReattach() {
  const tid = State.reattachTarget;
  if (!tid) return;
  const ed = State.editor;
  const sel = ed.state.selection;
  if (sel.empty || sel.from === sel.to) {
    showToast("\u672A\u9009\u6587\u5B57, \u8BF7\u5148\u5728\u7F16\u8F91\u5668\u4E2D\u9009\u4E2D\u65B0\u6587\u5B57", 2500);
    document.addEventListener("keydown", reattachKeyHandler, { once: true });
    return;
  }
  const thread = State.annotations.find((t) => t && t.threadId === tid);
  if (!thread) {
    cancelReattach();
    return;
  }
  const newText = ed.state.doc.textBetween(sel.from, sel.to, "\n");
  const markType = ed.schema.marks.annotation;
  const tr2 = ed.state.tr;
  const toRemove = [];
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type === markType && mark.attrs.threadId === tid) {
        toRemove.push({ from: pos, to: pos + node.nodeSize, mark });
      }
    }
  });
  toRemove.sort((a, b) => a.from - b.from);
  for (let i = toRemove.length - 1; i >= 0; i--) {
    tr2.removeMark(toRemove[i].from, toRemove[i].to, toRemove[i].mark);
  }
  tr2.addMark(sel.from, sel.to, markType.create(annotationMarkAttrs(thread, { threadId: tid })));
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  ed.view.dispatch(tr2);
  thread.text = newText;
  thread.fuzzy = false;
  thread.deleted = false;
  thread.invalid = false;
  thread.invalidReason = void 0;
  syncThreadAnchorEvidence(thread, ed.state.doc, { from: sel.from, to: sel.to }, {
    exact: newText,
    status: "attached",
    confidence: 1
  });
    // reseat plugin cache
    try {
      const tr3 = ed.state.tr;
      setAnnotationAnchorResetMeta(tr3, State.annotations);
      tr3.setMeta("addToHistory", false);
      ed.view.dispatch(tr3);
    } catch (_) {}

  State.reattachTarget = null;
  document.querySelectorAll(".comment-thread.awaiting-reattach").forEach((c) => c.classList.remove("awaiting-reattach"));
  setStatus("\u5DF2\u91CD\u65B0\u9009\u62E9\u6B63\u6587", `\u7EBF\u7A0B ${tid.slice(0, 8)} \xB7 "${newText.slice(0, 20)}${newText.length > 20 ? "\u2026" : ""}"`);
  showToast("\u6279\u6CE8\u5DF2\u91CD\u65B0\u9009\u62E9\u6B63\u6587 \u2713", 2e3);
  markDirty();
  renderCommentList();
  emitAI("threadChange", { threadId: tid, change: "reattach", range: thread.range, text: newText });
}
function deleteThread(threadId) {
  if (!confirm("\u5220\u9664\u6B64\u6279\u6CE8\u7EBF\u7A0B\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002")) return;
  const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === threadId);
  if (!thread) return;
  pushHistory();
  const editor2 = State.editor;
  const tr2 = editor2.state.tr;
  const markType = editor2.schema.marks.annotation;
  const oldSel = { from: editor2.state.selection.from, to: editor2.state.selection.to };
  editor2.state.doc.descendants((node, pos) => {
    node.marks.forEach((m) => {
      if (m.type === markType && m.attrs.threadId === threadId) {
        tr2.removeMark(pos, pos + node.nodeSize, m);
      }
    });
  });
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  editor2.view.dispatch(tr2);
  State.annotations = State.annotations.filter((t) => t.threadId !== threadId);
  if (State.activeThreadId === threadId) State.activeThreadId = null;
  commitHistoryIfNeeded();
  markDirty();
  try { syncAnnotationMarkModeAttrs(threadId); } catch (_) {}
  renderCommentList();
  updateDocMeta();
  positionMarkDeletePopover();
  // Restore caret only — never briefly select 0..docSize (that flashes "select all").
  try {
    const size = editor2.state.doc.content.size;
    const from2 = Math.max(0, Math.min(oldSel.from, size));
    const to = Math.max(0, Math.min(oldSel.to, size));
    if (from2 === to) editor2.commands.setTextSelection(from2);
    else editor2.commands.setTextSelection({ from: from2, to });
  } catch (e) {
  }
  emitAI("threadChange", { threadId, change: "delete" });
  refreshAnnotationImageDecos();
}
function threadHiddenByFilter(thread) {
  if (!thread) return true;
  if (State.filterOpen && !State.filterResolved && thread.resolved) return true;
  if (State.filterResolved && !State.filterOpen && !thread.resolved) return true;
  return false;
}
/**
 * Body/card navigation may target a thread outside the current filter tab.
 * Switch filter so the card can render; do not change resolved state.
 * Returns true when filter flags changed.
 */
function ensureFilterIncludesThread(thread) {
  if (!thread || !threadHiddenByFilter(thread)) return false;
  if (thread.resolved) {
    // Prefer 已解决 tab when jumping to a resolved mark from 未解决.
    State.filterOpen = false;
    State.filterResolved = true;
  } else {
    State.filterOpen = true;
    State.filterResolved = false;
  }
  try { syncFilterTabsFromCheckboxes(); } catch (_) {}
  return true;
}
function ensureCommentCardVisible(threadId) {
  if (!threadId) return false;
  const list = document.getElementById("comment-list");
  if (list && list.querySelector(`.comment-thread[data-thread="${threadId}"]`)) return true;
  if (State.commentListShowAll) return false;
  const filtered = (State.annotations || []).filter((th) => {
    if (!th || typeof th !== "object" || !th.threadId) return false;
    if (State.filterOpen && !State.filterResolved && th.resolved) return false;
    if (State.filterResolved && !State.filterOpen && !th.resolved) return false;
    return true;
  });
  filtered.sort((a, b) => {
    if (a.range == null && b.range == null) return 0;
    if (a.range == null) return 1;
    if (b.range == null) return -1;
    if (typeof a.range.from !== "number" || typeof b.range.from !== "number") return 0;
    return a.range.from - b.range.from;
  });
  const idx = filtered.findIndex((th) => th.threadId === threadId);
  if (idx < 0) return false;
  const need = idx + 1;
  const cur = Math.max(20, State.commentListLimit || 60);
  if (need > cur) {
    State.commentListLimit = Math.min(filtered.length, Math.max(need + 10, cur + 60));
  }
  if ((State.commentListLimit || 0) < need) State.commentListShowAll = true;
  renderCommentList();
  return !!document.querySelector(`#comment-list .comment-thread[data-thread="${threadId}"]`);
}
function annotationHasLiveMark(threadId) {
  const editor2 = State.editor;
  if (!editor2 || !threadId) return false;
  const markType = editor2.schema.marks.annotation;
  let found = false;
  editor2.state.doc.descendants((node) => {
    if (found || !node.isText || !node.marks) return;
    for (const m of node.marks) {
      if (m.type === markType && m.attrs && m.attrs.threadId === threadId) {
        found = true;
        return;
      }
    }
  });
  return found;
}
function annotationWarningState(thread) {
  if (!thread || typeof thread !== "object") return null;
  const status = thread.anchor && thread.anchor.status;
  const reason = thread.invalidReason || "";
  if (status === "ambiguous" || reason === "ambiguous") return { kind: "ambiguous" };
  if (status === "collision" || reason === "mark-collision" || reason === "collision") return { kind: "collision" };
  if (status === "image-missing" || reason === "image-deleted") return { kind: "image-missing" };
  // Live mark + lagging mark-missing flags ⇒ heal false orphan banner.
  // Explicit orphaned/deleted (full-pass or user) still shows.
  if (thread.threadId && annotationHasLiveMark(thread.threadId)) {
    if (reason === "mark-missing" || reason === "mark-reattached-fuzzy") {
      thread.deleted = false;
      thread.invalid = false;
      thread.invalidReason = void 0;
      if (thread.anchor && thread.anchor.status === "orphaned") {
        // Only clear status when it was driven by lagging mark-missing.
        thread.anchor = { ...thread.anchor, status: "attached" };
      }
      return null;
    }
  }
  if (status === "orphaned" || thread.deleted || thread.invalid) return { kind: "orphaned" };
  return null;
}
function activateAnnotationThread(threadId, options = {}) {
  if (!threadId) {
    const switched = State.activeThreadId != null;
    State.activeThreadId = null;
    if (options.skipHighlight !== true) highlightActiveMark();
    if (options.ensureCard !== false && switched) {
      setActiveCommentCard(null);
    }
    return true;
  }
  const thread = (State.annotations || []).find((item) => item && item.threadId === threadId);
  if (!thread) return false;
  const ensureCard = options.ensureCard !== false;
  State.activeThreadId = threadId;
  if (options.skipHighlight !== true) highlightActiveMark();
  if (ensureCard) {
    // Always sync card active class (not only on switch) so body clicks
    // that re-activate the same or another thread paint is-active reliably.
    if (!setActiveCommentCard(threadId)) {
      ensureCommentCardVisible(threadId);
      renderCommentList();
      setActiveCommentCard(threadId);
    }
  }
  return true;
}
/**
 * Body/image/card navigation entry: activate thread, expand if needed,
 * ensure card is in the list window, and scroll the pane to it.
 */
function activateAndRevealThread(threadId, options = {}) {
  if (!threadId) return false;
  const thread = (State.annotations || []).find((item) => item && item.threadId === threadId);
  if (!thread) return false;
  let needsRender = false;
  // Open comment drawer so the target card can be scrolled into view.
  try {
    if (document.body.classList.contains("comment-pane-collapsed")) {
      const toggles = window.__mdAnnotatorTogglePanes;
      if (toggles && typeof toggles.toggleCommentPane === "function") toggles.toggleCommentPane();
      else document.body.classList.remove("comment-pane-collapsed");
    }
  } catch (_) {}
  // Body clicks on resolved marks must leave the default 未解决 filter.
  if (options.preserveFilter !== true && ensureFilterIncludesThread(thread)) {
    needsRender = true;
  }
  if (State.manuallyCollapsedIds && State.manuallyCollapsedIds[threadId]) {
    delete State.manuallyCollapsedIds[threadId];
    needsRender = true;
  }
  if (thread.resolved) {
    if (!State.expandedThreadIds) State.expandedThreadIds = {};
    if (!State.expandedThreadIds[threadId]) {
      State.expandedThreadIds[threadId] = true;
      needsRender = true;
    }
  }
  if (needsRender) renderCommentList();
  const ok = activateAnnotationThread(threadId, { ensureCard: true, ...options });
  if (!ok) return false;
  if (!setActiveCommentCard(threadId)) {
    ensureCommentCardVisible(threadId);
    renderCommentList();
    setActiveCommentCard(threadId);
  }
  return true;
}

/** Sync body pet/active mark with comment card when supervision current changes. */
function revealSupervisionThread(threadId) {
  const id = String(threadId || "").trim();
  if (!id) return { found: false, filtered: false };
  const thread = (State.annotations || []).find((item) => item && item.threadId === id);
  if (!thread) return { found: false, filtered: false };
  const filtered =
    (State.filterOpen && !State.filterResolved && thread.resolved) ||
    (State.filterResolved && !State.filterOpen && !thread.resolved);
  try {
    if (document.body.classList.contains("comment-pane-collapsed")) {
      const toggles = window.__mdAnnotatorTogglePanes;
      if (toggles && typeof toggles.toggleCommentPane === "function") toggles.toggleCommentPane();
    }
  } catch (_) {}
  if (!filtered) {
    try { activateAndRevealThread(id, { source: "supervision", preserveFilter: true }); } catch (_) {}
  }
  return { found: true, filtered: Boolean(filtered) };
}
/** Explicit card @AI invoke — seeds composer only for this thread. */
function invokeAiForThread(threadId) {
  if (!threadId) return false;
  const thread = (State.annotations || []).find((item) => item && item.threadId === threadId);
  if (!thread) return false;
  activateAndRevealThread(threadId);
  const ta = document.querySelector(`[data-thread-input="${threadId}"]`);
  let draft = "";
  if (State.replyDrafts[threadId] != null) draft = String(State.replyDrafts[threadId]);
  else if (ta) draft = ta.value || "";
  const cleaned = stripMarkers(draft).replace(/^\s+/, "");
  const next = cleaned ? ensureMarker(cleaned, "ai") : (MENTION_TYPES.ai && MENTION_TYPES.ai.prefix) || "@AI ";
  State.replyDrafts[threadId] = next;
  if (ta) {
    ta.value = next;
    try {
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_) {}
    try {
      ta.focus();
      const n = ta.value.length;
      ta.setSelectionRange(n, n);
    } catch (_) {}
  }
  const btn = document.querySelector(`[data-act="submit-reply"][data-thread="${threadId}"]`);
  if (btn) btn.disabled = !String(next).trim();
  return true;
}
function setActiveCommentCard(threadId) {
  const list = document.getElementById("comment-list");
  if (!list) return false;
  let found2 = null;
  let cards = list.querySelectorAll(".comment-thread");
  if (threadId && !list.querySelector(`.comment-thread[data-thread="${threadId}"]`)) {
    if (ensureCommentCardVisible(threadId)) {
      cards = list.querySelectorAll(".comment-thread");
    }
  }
  if (!cards.length) return false;
  cards.forEach((el) => {
    const on = !!(threadId && el.dataset.thread === threadId);
    el.classList.toggle("is-active", on);
    if (on) found2 = el;
  });
  if (found2) {
    try {
      const lr = list.getBoundingClientRect();
      const cr = found2.getBoundingClientRect();
      if (cr.top < lr.top + 4 || cr.bottom > lr.bottom - 4) {
        found2.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } catch (e) {
    }
    return true;
  }
  return false;
}
function scrollCommentMessagesToBottom(root = document) {
  const boxes = root.querySelectorAll ? root.querySelectorAll(".comment-messages") : [];
  boxes.forEach((box) => {
    try {
      const thread = box.closest(".comment-thread");
      if (thread && thread.classList.contains("is-collapsed")) return;
      box.scrollTop = box.scrollHeight;
    } catch (_) {}
  });
}
function renderCommentList() {
  const list = $("#comment-list");
  const empty4 = $("#comment-empty");
  queueMicrotask(() => refreshAnnotationImageDecos());
  const SOFT_LIMIT = (State.maxAnnotations || 0) === 0 ? Infinity : (State.maxAnnotations || 0) * 2;
  const overSoft = State.annotations.length > SOFT_LIMIT;
  let _softBannerHtml = "";
  if (overSoft) {
    _softBannerHtml = `<div class="comment-overflow-warn comment-overflow-warn--inline"><div class="warn-title">\u6279\u6CE8\u8F83\u591A (${State.annotations.length})</div><div class="warn-hint">\u5DF2\u5206\u7A97\u6E32\u67D3\u4EE5\u4FDD\u6D41\u7545. \u53EF\u8C03\u9AD8 \u2699 \u4E0A\u9650, \u6216\u70B9\u4E0B\u65B9\u300C\u663E\u793A\u66F4\u591A\u300D. \u5EFA\u8BAE\u6E05\u7406\u5197\u4F59\u6279\u6CE8.</div></div>`;
  }
  const filtered = State.annotations.filter((t) => {
    if (!t || typeof t !== "object") return false;
    if (State.filterOpen && !State.filterResolved && t.resolved) return false;
    if (State.filterResolved && !State.filterOpen && !t.resolved) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return 0;
    if (a.range == null && b.range == null) return 0;
    if (a.range == null) return 1;
    if (b.range == null) return -1;
    if (typeof a.range.from !== "number" || typeof b.range.from !== "number") return 0;
    return a.range.from - b.range.from;
  });
  const allVisibleThreads = sorted.filter((t) => t && typeof t === "object" && t.threadId);
  const limit = State.commentListShowAll ? allVisibleThreads.length : Math.max(20, State.commentListLimit || 60);
  const hasMoreComments = allVisibleThreads.length > limit;
  let windowStart = 0;
  if (hasMoreComments && !State.commentListShowAll) {
    const act = State.activeThreadId;
    const maxStart = Math.max(0, allVisibleThreads.length - limit);
    if (act) {
      const aidx = allVisibleThreads.findIndex((th) => th.threadId === act);
      if (aidx >= 0) {
        windowStart = Math.max(0, Math.min(aidx - 5, maxStart));
      }
    } else {
      windowStart = Math.max(0, Math.min(State.commentListWindowStart || 0, maxStart));
    }
  }
  const visibleThreads = hasMoreComments ? allVisibleThreads.slice(windowStart, windowStart + limit) : allVisibleThreads;
  const hiddenBefore = windowStart;
  const hiddenAfter = Math.max(0, allVisibleThreads.length - (windowStart + visibleThreads.length));
  const hiddenCommentCount = hiddenBefore + hiddenAfter;
  if (allVisibleThreads.length === 0) {
    list.innerHTML = "";
    empty4.classList.remove("hidden");
    syncCommentEmptyPresentation();
    refreshEmptyRecentFiles();
    updateCommentCounts();
    syncFilterTabsFromCheckboxes();
    return;
  }
  empty4.classList.add("hidden");
  empty4.removeAttribute("data-empty-mode");
  updateCommentCounts();
  syncFilterTabsFromCheckboxes();
  const avatarColor = (author, fallback = "") => {
      const normalized = normalizeAuthor(author);
      return authorColorIndex(normalized.id || normalized.name || fallback);
    };
    const avatar = (name) => (name || "\u533F").trim().charAt(0).toUpperCase() || "?";
    /** AI Reviewer → Lucide bot avatar (same glyph as float AI); humans keep letter. */
    const avatarSpan = (author, colorSlot) => {
      if (isAiAuthor(author)) {
        return `<span class="comment-avatar is-ai-bot" title="AI Reviewer" aria-label="AI Reviewer"></span>`;
      }
      const slot = colorSlot != null ? colorSlot : avatarColor(author, "");
      return `<span class="comment-avatar" data-author-color="${slot}">${escapeHtml(avatar(authorName(author)))}</span>`;
    };
    list.innerHTML = visibleThreads.map((thread, idx) => {
    const first3 = thread.comments?.[0] || {
      author: currentAuthorPayload(),
      body: "",
      createdAt: thread.createdAt || (/* @__PURE__ */ new Date()).toISOString()
    };
    const safeComments = Array.isArray(thread.comments) ? thread.comments : [];
    const replies = safeComments.slice(1);
    const isActive2 = State.activeThreadId === thread.threadId;
    const warnState = annotationWarningState(thread);
    const warnKind = warnState && warnState.kind;
    const number = (windowStart || 0) + idx + 1;
    const isCollapsed = thread.resolved && !State.expandedThreadIds?.[thread.threadId] || !!State.manuallyCollapsedIds?.[thread.threadId];
    const threadType = threadTypeOf(thread);
    const safeThreadId = escapeHtml(thread.threadId);
    return `
      <div class="comment-thread ${isActive2 ? "is-active" : ""} ${thread.resolved ? "is-resolved" : ""} ${thread.fuzzy ? "is-fuzzy" : ""} ${thread.deleted ? "is-deleted" : ""} ${(warnKind === "ambiguous" || thread.invalidReason === "ambiguous") ? "is-ambiguous" : ""} ${isCollapsed ? "is-collapsed" : ""} ${thread.pending ? "is-pending" : ""}${threadTypeClass(thread)}" data-thread="${safeThreadId}" data-thread-type="${threadType || ""}">
        ${(warnKind === "orphaned" || thread.deleted) ? '<div class="deleted-banner">📍 原文已被删除 - <button class="link-btn" data-act="reattach" data-thread="' + safeThreadId + '">重新选择正文</button> · <button class="link-btn link-danger" data-act="delete-orphan" data-thread="' + safeThreadId + '">删除</button></div>' : (warnKind === "ambiguous") ? '<div class="ambiguous-banner">⚠ 无法唯一确定原文位置（重复锚点）— <button class="link-btn" data-act="reattach" data-thread="' + safeThreadId + '">重新选择正文</button> · <button class="link-btn link-danger" data-act="delete-orphan" data-thread="' + safeThreadId + '">删除</button></div>' : (warnKind === "collision" || warnKind === "image-missing" || (thread.invalid && !thread.deleted)) ? '<div class="invalid-banner">⚠ 批注锚点失效 — <button class="link-btn" data-act="reattach" data-thread="' + safeThreadId + '">重新选择正文</button> · <button class="link-btn link-danger" data-act="delete-orphan" data-thread="' + safeThreadId + '">删除</button></div>' : thread.fuzzy ? '<div class="fuzzy-banner">⚠ 位置可能偏移 - 请检查文档</div>' : ""}
        <!-- card header: number + quote + menu -->
        <div class="comment-quote" data-thread="${safeThreadId}" title="点击收起/展开批注">
          <span class="comment-number-badge" data-number="${number}" title="批注 #${number}">${number}</span>
          <span class="comment-quote-text">${escapeHtml((thread.text || "").slice(0, 200))}${(thread.text || "").length > 200 ? "…" : ""}</span>
          ${threadType === "ai" ? '<span class="comment-type-badge is-ai" title="AI">AI</span>' : threadType === "review" ? '<span class="comment-type-badge is-review" title="历史审阅">审阅</span>' : ""}
          ${thread.pending ? '<span class="comment-pending-badge" title="未提交首条评论">草稿</span>' : ""}

          <button class="comment-menu-btn" data-act="toggle-menu" data-thread="${safeThreadId}" title="更多操作" aria-label="更多操作">⋯</button>
        </div>
        <div class="comment-menu hidden" data-menu-for="${safeThreadId}">
          <button data-act="goto" data-thread="${safeThreadId}">
            <span class="menu-icon menu-icon-goto"></span>
            <span class="menu-label">跳转到批注处</span>
          </button>
          <button data-act="resolve" data-thread="${safeThreadId}">
            <span class="menu-icon menu-icon-resolve"></span>
            <span class="menu-label">${thread.resolved ? "重新打开" : "标记为已解决"}</span>
          </button>
          <button data-act="copy" data-thread="${safeThreadId}">
            <span class="menu-icon menu-icon-copy"></span>
            <span class="menu-label">复制引文</span>
          </button>
          <div class="menu-sep"></div>
          <button data-act="delete" data-thread="${safeThreadId}" class="menu-danger">
            <span class="menu-icon menu-icon-delete"></span>
            <span class="menu-label">删除批注</span>
          </button>
        </div>
        <div class="comment-body-wrap">
          <div class="comment-messages">
          <div class="comment-item" data-msg-index="0">
            <div class="comment-meta">
                          ${avatarSpan(first3.author, annotationAuthorColor(thread))}
                          <span class="comment-author">${escapeHtml(authorName(first3.author))}</span>
                          <span class="comment-time" title="${escapeHtml(first3.createdAt || "")}">${escapeHtml(formatTime(first3.createdAt))}</span>
                        </div>
                        ${first3.body ? `<div class="comment-body-row" data-body-row="${safeThreadId}:0"><div class="comment-body">${escapeHtml(first3.body)}</div><button type="button" class="comment-edit-btn" data-act="edit-comment" data-thread="${safeThreadId}" data-comment-index="0">编辑</button></div>` : ""}
                        <div class="comment-edit-form hidden" data-edit-form="${safeThreadId}:0"><textarea data-edit-input="${safeThreadId}:0" rows="1">${escapeHtml(first3.body || "")}</textarea><div class="form-actions"><button type="button" data-act="cancel-comment-edit" data-thread="${safeThreadId}" data-comment-index="0">取消</button><button type="button" data-act="save-comment-edit" data-thread="${safeThreadId}" data-comment-index="0" class="primary">保存</button></div></div>
          </div>
                        ${replies.map((r, replyIndex) => {
              const commentIndex = replyIndex + 1;
              const editKey = `${safeThreadId}:${commentIndex}`;
              return `
                          <div class="comment-reply" data-msg-index="${commentIndex}">
                            <div class="comment-meta">
                              ${avatarSpan(r.author, avatarColor(r.author, thread.threadId))}
                              <span class="comment-author">${escapeHtml(authorName(r.author))}</span>
                              <span class="comment-time" title="${escapeHtml(r.createdAt || "")}">${escapeHtml(formatTime(r.createdAt))}</span>
                            </div>
                <div class="comment-body-row" data-body-row="${editKey}"><div class="comment-body">${escapeHtml(r.body)}</div><button type="button" class="comment-edit-btn" data-act="edit-comment" data-thread="${safeThreadId}" data-comment-index="${commentIndex}">编辑</button></div>
                <div class="comment-edit-form hidden" data-edit-form="${editKey}"><textarea data-edit-input="${editKey}" rows="1">${escapeHtml(r.body || "")}</textarea><div class="form-actions"><button type="button" data-act="cancel-comment-edit" data-thread="${safeThreadId}" data-comment-index="${commentIndex}">取消</button><button type="button" data-act="save-comment-edit" data-thread="${safeThreadId}" data-comment-index="${commentIndex}" class="primary">保存</button></div></div>
              </div>
            `;
            }).join("")}
          </div>
            <div class="comment-reply-form">
              <textarea data-thread-input="${safeThreadId}" rows="1" placeholder="${escapeHtml(markerPlaceholder(threadType, !!first3.body))}" autocomplete="off"></textarea>
              <div class="form-actions">
                <button type="button" class="comment-invoke-ai-btn" data-act="invoke-ai" data-thread="${safeThreadId}" title="在回复中插入 @AI（显式唤起 AI）" aria-label="插入 @AI">@AI</button>
                <button class="comment-resolve-btn ${thread.resolved ? "is-resolved" : ""}" data-act="resolve" data-thread="${safeThreadId}" title="${thread.resolved ? "重新打开此批注" : "标记为已解决"}" aria-label="${thread.resolved ? "重新打开" : "标记为已解决"}">${thread.resolved ? "重开" : "解决"}</button>
                <button data-act="submit-reply" data-thread="${safeThreadId}" class="primary" disabled title="输入后可回复 (Ctrl+Enter)">回复</button>
              </div>
            </div>
        </div>
      </div>
    `;
  }).join("");
  if (_softBannerHtml) {
    try {
      list.insertAdjacentHTML("afterbegin", _softBannerHtml);
    } catch (e) {
    }
  }
  if (hasMoreComments || State.commentListShowAll) {
    const foot = document.createElement("div");
    foot.className = "comment-list-more";
    if (hasMoreComments) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "comment-list-more-btn";
      btn.textContent = hiddenAfter > 0 ? `\u5411\u4E0B\u663E\u793A\u66F4\u591A (\u540E ${hiddenAfter} \xB7 \u5171\u9690 ${hiddenCommentCount})` : `\u663E\u793A\u66F4\u591A (\u8FD8\u6709 ${hiddenCommentCount} \u6761)`;
      btn.addEventListener("click", () => {
        State.commentListLimit = (State.commentListLimit || 60) + 60;
        renderCommentList();
      });
      if (hiddenBefore > 0) {
        const btnUp = document.createElement("button");
        btnUp.type = "button";
        btnUp.className = "comment-list-more-btn";
        btnUp.textContent = `\u5411\u4E0A\u663E\u793A (\u524D ${hiddenBefore} \u6761)`;
        btnUp.addEventListener("click", () => {
          const cur = typeof State.commentListWindowStart === "number" ? State.commentListWindowStart : windowStart;
          State.commentListWindowStart = Math.max(0, cur - Math.max(20, State.commentListLimit || 60));
          State.commentListLimit = (State.commentListLimit || 60) + 30;
          State.activeThreadId = null;
          renderCommentList();
        });
        foot.appendChild(btnUp);
      }
      foot.appendChild(btn);
      const btnAll = document.createElement("button");
      btnAll.type = "button";
      btnAll.className = "comment-list-more-btn";
      btnAll.textContent = `\u663E\u793A\u5168\u90E8 ${allVisibleThreads.length} \u6761`;
      btnAll.addEventListener("click", () => {
        State.commentListShowAll = true;
        renderCommentList();
      });
      foot.appendChild(btnAll);
      const hint = document.createElement("p");
      hint.className = "comment-list-more-hint";
      hint.textContent = "\u5DF2\u6E32\u67D3 " + visibleThreads.length + " / " + allVisibleThreads.length + " \xB7 \u4E3A\u4FDD\u6301\u4FA7\u680F\u6D41\u7545\u5206\u6279\u52A0\u8F7D";
      foot.appendChild(hint);
    } else if (State.commentListShowAll && allVisibleThreads.length > 60) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "comment-list-more-btn";
      btn.textContent = "\u6536\u8D77\u4E3A\u524D 60 \u6761";
      btn.addEventListener("click", () => {
        State.commentListShowAll = false;
        State.commentListLimit = 60;
        renderCommentList();
      });
      foot.appendChild(btn);
    }
    list.appendChild(foot);
  }
  list.querySelectorAll("[data-thread-input]").forEach((ta2) => {
      const tid = ta2.getAttribute("data-thread-input");
      if (State.replyDrafts[tid] && !ta2.value) {
        ta2.value = State.replyDrafts[tid];
      }
      const _initBtn = list.querySelector(`[data-act="submit-reply"][data-thread="${tid}"]`);
      if (_initBtn) _initBtn.disabled = !ta2.value.trim();
      // One-line default; grow with content (docs-style compose box)
      const autosize = () => {
        try {
          ta2.style.height = "0px";
          const maxH = 160;
          const next = Math.min(Math.max(ta2.scrollHeight, 0), maxH);
          ta2.style.height = `${next}px`;
          ta2.style.overflowY = ta2.scrollHeight > maxH + 1 ? "auto" : "hidden";
        } catch (_) {}
      };
      autosize();
      ta2.addEventListener("input", () => {
        State.replyDrafts[tid] = ta2.value;
        const btn = list.querySelector(`[data-act="submit-reply"][data-thread="${tid}"]`);
        if (btn) btn.disabled = !ta2.value.trim();
        autosize();
      });
      ta2.addEventListener("focus", () => {
        autosize();
        ta2.closest(".comment-reply-form")?.classList.add("is-composing");
      });
      ta2.addEventListener("blur", () => {
        // keep shadow while moving focus to resolve/reply buttons inside the form
        requestAnimationFrame(() => {
          const form = ta2.closest(".comment-reply-form");
          if (!form) return;
          if (!form.contains(document.activeElement)) form.classList.remove("is-composing");
        });
      });
      ta2.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (ta2.value.trim()) addReply(tid, ta2.value);
        }
      });
    });
  list.querySelectorAll('[data-act="submit-reply"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const tid = btn.dataset.thread;
      const ta2 = document.querySelector(`[data-thread-input="${tid}"]:not(details [data-thread-input="${tid}"])`) || document.querySelector(`details [data-thread-input="${tid}"]`);
      const fallback = list.querySelector(`[data-thread-input="${tid}"]`);
      const input = ta2 || fallback;
      if (input && input.value.trim()) {
        addReply(tid, input.value);
      }
    });
  });
  list.querySelectorAll('[data-act="invoke-ai"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      invokeAiForThread(btn.dataset.thread);
    });
  });
  list.querySelectorAll('[data-act="edit-comment"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = `${btn.dataset.thread}:${btn.dataset.commentIndex}`;
      // 隐藏原正文行，只显示编辑表单 (docs/linear 风格，替代 in-place)
      list.querySelector(`[data-body-row="${key}"]`)?.classList.add("hidden");
      const form = list.querySelector(`[data-edit-form="${key}"]`);
      form?.classList.remove("hidden");
      // autosize + focus + 光标末尾
      const ta = form?.querySelector(`[data-edit-input="${key}"]`);
      if (ta) {
        ta.style.height = "0px";
        const maxH = 160;
        ta.style.height = Math.min(ta.scrollHeight, maxH) + "px";
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  });
  // 编辑框 autosize + Ctrl+Enter 保存 + Esc 取消
  list.querySelectorAll("[data-edit-input]").forEach((ta) => {
    const key = ta.getAttribute("data-edit-input");
    const tid = key.split(":")[0];
    const idx = key.split(":")[1];
    const autosize = () => {
      try {
        ta.style.height = "0px";
        const maxH = 160;
        ta.style.height = Math.min(ta.scrollHeight, maxH) + "px";
        ta.style.overflowY = ta.scrollHeight > maxH + 1 ? "auto" : "hidden";
      } catch (_) {}
    };
    autosize();
    ta.addEventListener("input", autosize);
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (ta.value.trim()) editComment(tid, idx, ta.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        const form = ta.closest(".comment-edit-form");
        form?.classList.add("hidden");
        list.querySelector(`[data-body-row="${key}"]`)?.classList.remove("hidden");
      }
    });
  });
  list.querySelectorAll('[data-act="cancel-comment-edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = `${btn.dataset.thread}:${btn.dataset.commentIndex}`;
      const input = list.querySelector(`[data-edit-input="${key}"]`);
      const thread = State.annotations.find((item) => item && item.threadId === btn.dataset.thread);
      const current = thread?.comments?.[Number(btn.dataset.commentIndex)]?.body || "";
      if (input) input.value = current;
      list.querySelector(`[data-edit-form="${key}"]`)?.classList.add("hidden");
      list.querySelector(`[data-body-row="${key}"]`)?.classList.remove("hidden");
    });
  });
  list.querySelectorAll('[data-act="save-comment-edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = `${btn.dataset.thread}:${btn.dataset.commentIndex}`;
      const input = list.querySelector(`[data-edit-input="${key}"]`);
      if (input) editComment(btn.dataset.thread, btn.dataset.commentIndex, input.value);
    });
  });
  list.querySelectorAll('[data-act="goto"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      activateAndRevealThread(btn.dataset.thread);
      scrollToThread(btn.dataset.thread);
      closeAllCommentMenus();
    });
  });
  list.querySelectorAll('[data-act="resolve"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleResolved(btn.dataset.thread);
      closeAllCommentMenus();
    });
  });
  list.querySelectorAll('[data-act="delete"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteThread(btn.dataset.thread);
      closeAllCommentMenus();
    });
  });
  list.querySelectorAll('[data-act="reattach"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      startReattach(btn.dataset.thread);
    });
  });
  list.querySelectorAll('[data-act="delete-orphan"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("\u786E\u5B9A\u5220\u9664\u6B64\u6279\u6CE8\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002")) {
        deleteThread(btn.dataset.thread);
      }
    });
  });
  list.querySelectorAll('[data-act="copy"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tid = btn.dataset.thread;
      const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === tid);
      if (!thread) return;
      const text2 = thread.text || "";
      try {
        await navigator.clipboard.writeText(text2);
        showToast("\u5DF2\u590D\u5236\u5F15\u6587\u5230\u526A\u8D34\u677F", 1500);
      } catch (err) {
        const ta2 = document.createElement("textarea");
        ta2.value = text2;
        document.body.appendChild(ta2);
        ta2.select();
        try {
          document.execCommand("copy");
          showToast("\u5DF2\u590D\u5236\u5F15\u6587", 1500);
        } catch {
          showToast("\u590D\u5236\u5931\u8D25, \u8BF7\u624B\u52A8\u9009\u4E2D", 2e3);
        }
        document.body.removeChild(ta2);
      }
      closeAllCommentMenus();
    });
  });
  list.querySelectorAll('[data-act="toggle-menu"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tid = btn.dataset.thread;
      const menu = list.querySelector(`[data-menu-for="${tid}"]`);
      if (!menu) return;
      const isOpen = !menu.classList.contains("hidden");
      list.querySelectorAll(".comment-menu:not(.hidden)").forEach((m) => {
        if (m !== menu) m.classList.add("hidden");
      });
      if (isOpen) menu.classList.add("hidden");
      else menu.classList.remove("hidden");
    });
  });
  list.querySelectorAll(".comment-thread").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const tid = el.dataset.thread;
      if (!tid) return;
      const mark = document.querySelector(`.annotation-mark[data-thread-id="${tid}"]`);
      if (mark) mark.classList.add("is-hover");
      document.querySelectorAll(`img.annotation-image[data-thread-id="${tid}"]`).forEach((img) => {
        img.classList.add("is-hover");
      });
    });
    el.addEventListener("mouseleave", () => {
      const tid = el.dataset.thread;
      if (!tid) return;
      const mark = document.querySelector(`.annotation-mark[data-thread-id="${tid}"]`);
      if (mark) mark.classList.remove("is-hover");
      document.querySelectorAll(`img.annotation-image[data-thread-id="${tid}"]`).forEach((img) => {
        img.classList.remove("is-hover");
      });
    });
    el.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("textarea") || e.target.closest("details summary") || e.target.closest("a") || e.target.closest("input")) return;
      const tid = el.dataset.thread;
      if (e.target.closest(".comment-quote")) {
        toggleManualCollapse(tid);
        closeAllCommentMenus();
        renderCommentList();
      } else {
        // Body / messages / empty chrome: jump body mark to editor center.
        scrollToCommentText(tid);
      }
    });
  });
  // Keep latest messages in view inside the fixed-height viewport.
  requestAnimationFrame(() => scrollCommentMessagesToBottom(list));
}
function closeAllCommentMenus() {
  document.querySelectorAll(".comment-menu:not(.hidden)").forEach((m) => m.classList.add("hidden"));
}
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".comment-menu") && !e.target.closest('[data-act="toggle-menu"]')) {
    closeAllCommentMenus();
  }
});
function toggleManualCollapse(tid) {
  const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === tid);
  if (thread?.resolved) {
    if (!State.expandedThreadIds) State.expandedThreadIds = {};
    if (State.expandedThreadIds[tid]) {
      delete State.expandedThreadIds[tid];
    } else {
      State.expandedThreadIds[tid] = true;
    }
    delete State.manuallyCollapsedIds[tid];
  } else {
    if (State.manuallyCollapsedIds[tid]) {
      delete State.manuallyCollapsedIds[tid];
    } else {
      State.manuallyCollapsedIds[tid] = true;
    }
  }
}
function scrollEditorPosIntoCenter(pos, { behavior = "smooth" } = {}) {
  const editor2 = State.editor;
  const pane = document.querySelector("#editor-pane");
  if (!editor2 || !editor2.view || !pane || pos == null || !Number.isFinite(pos)) return false;
  try {
    const safePos = Math.max(0, Math.min(pos, editor2.state.doc.content.size));
    const coords = editor2.view.coordsAtPos(safePos);
    const paneRect = pane.getBoundingClientRect();
    const yInContent = (coords.top - paneRect.top) + pane.scrollTop;
    const next = Math.max(0, yInContent - (pane.clientHeight / 2));
    if (typeof pane.scrollTo === "function") pane.scrollTo({ top: next, behavior });
    else pane.scrollTop = next;
    return true;
  } catch (_) {
    try {
      const dom = editor2.view.domAtPos(pos);
      let node = dom && dom.node;
      if (node && node.nodeType === 3) node = node.parentElement;
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ block: "center", behavior, inline: "nearest" });
        return true;
      }
    } catch (__) {}
    return false;
  }
}
function scrollToCommentText(tid) {
  if (!activateAndRevealThread(tid)) return;
  scrollToThread(tid);
}
function scrollToThread(threadId) {
  const thread = State.annotations.find((t) => t && typeof t === "object" && t.threadId === threadId);
  if (!thread) return;
  const editor2 = State.editor;
  if (!editor2) return;
  // Prefer live mark extent in the document (never trust a corrupt full-doc range).
  let markFrom = null;
  let markTo = null;
  editor2.state.doc.descendants((node, p) => {
    if (!node.isText) return;
    node.marks.forEach((m) => {
      if (m.type === editor2.schema.marks.annotation && m.attrs.threadId === threadId) {
        const end = p + node.nodeSize;
        if (markFrom === null || p < markFrom) markFrom = p;
        if (markTo === null || end > markTo) markTo = end;
      }
    });
  });
  if (markFrom !== null && markTo !== null && markFrom < markTo) {
    // Cap highlight length so a bad mark span cannot flash-select the whole doc.
    const docSize = editor2.state.doc.content.size;
    let from2 = Math.max(0, markFrom);
    let to = Math.min(docSize, markTo);
    const MAX_JUMP_SEL = 800;
    if (to - from2 > MAX_JUMP_SEL) {
      to = from2 + 1;
    }
    // Avoid ProseMirror default edge-scroll; we center in #editor-pane ourselves.
    try {
      editor2.commands.focus(from2, { scrollIntoView: false });
    } catch (e) {
      try { editor2.commands.focus(undefined, { scrollIntoView: false }); } catch (e2) {}
    }
    try {
      editor2.commands.setTextSelection({ from: from2, to });
    } catch (e) {
      try {
        editor2.commands.setTextSelection(from2);
      } catch (e2) {
      }
    }
    activateAnnotationThread(threadId, { ensureCard: true });
    // Double-rAF: first after selection paint, second beats any late PM scrollIntoView.
    const center = () => scrollEditorPosIntoCenter(from2, { behavior: "smooth" });
    center();
    try {
      requestAnimationFrame(() => {
        scrollEditorPosIntoCenter(from2, { behavior: "auto" });
        requestAnimationFrame(() => scrollEditorPosIntoCenter(from2, { behavior: "auto" }));
      });
    } catch (_) {}
    return;
  }
  try {
    if (Array.isArray(thread.imageAnchors) && thread.imageAnchors.length) resyncImageAnchors(thread, editor2.state.doc);
  } catch (e) {
  }
  let imgPos = null;
  if (Array.isArray(thread.imageAnchors)) {
    for (const anc of thread.imageAnchors) {
      if (!anc || typeof anc.from !== "number") continue;
      try {
        const n = editor2.state.doc.nodeAt(anc.from);
        if (n && n.type.name === "image") {
          imgPos = anc.from;
          break;
        }
      } catch (e) {
      }
    }
  }
  if (imgPos == null && thread.range && typeof thread.range.from === "number") {
    try {
      const n = editor2.state.doc.nodeAt(thread.range.from);
      if (n && n.type.name === "image") imgPos = thread.range.from;
    } catch (e) {
    }
  }
  if (imgPos != null) {
    try {
      editor2.chain().focus().setNodeSelection(imgPos).run();
    } catch (e) {
      try {
        editor2.commands.setNodeSelection(imgPos);
      } catch (e2) {
      }
    }
    try {
      const dom = editor2.view.nodeDOM(imgPos);
      const el = dom && (dom.tagName === "IMG" ? dom : dom.querySelector && dom.querySelector("img"));
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
      else scrollEditorPosIntoCenter(imgPos, { behavior: "smooth" });
    } catch (e) {
      try { scrollEditorPosIntoCenter(imgPos, { behavior: "smooth" }); } catch (e2) {}
    }
    activateAnnotationThread(threadId, { ensureCard: true });
    try {
      refreshAnnotationImageDecos();
    } catch (e) {
    }
    return;
  }
  // Recover text mark from quote/prefix/suffix or saved range before declaring 失效.
  try {
    let recovered = null;
    try {
      recovered = findAnnotationRange(editor2.state.doc, thread);
    } catch (_) {
      recovered = null;
    }
    if ((!recovered || typeof recovered.from !== "number") && thread.range &&
        typeof thread.range.from === "number" && typeof thread.range.to === "number" &&
        thread.range.from < thread.range.to) {
      try {
        const docSize = editor2.state.doc.content.size;
        const f = Math.max(0, Math.min(thread.range.from, docSize));
        const tt = Math.max(0, Math.min(thread.range.to, docSize));
        if (f < tt) {
          const slice = editor2.state.doc.textBetween(f, tt, " ");
          if (slice && thread.text && (slice === thread.text || slice.includes(thread.text) || thread.text.includes(slice))) {
            recovered = { from: f, to: tt, fuzzy: slice !== thread.text };
          }
        }
      } catch (_) {}
    }
    if (recovered && typeof recovered.from === "number" && typeof recovered.to === "number" && recovered.from < recovered.to) {
      const markType = editor2.schema.marks.annotation;
      const tr2 = editor2.state.tr;
      tr2.addMark(
        recovered.from,
        recovered.to,
        markType.create(annotationMarkAttrs(thread, {
          threadId,
          resolved: !!thread.resolved,
          authorColor: annotationAuthorColor(thread),
          active: false
        }))
      );
      tr2.setMeta("addToHistory", false);
      tr2.setMeta("__activeMarkSync", true);
      editor2.view.dispatch(tr2);
      try {
        syncThreadAnchorEvidence(thread, editor2.state.doc, recovered, {
          exact: thread.text || "",
          status: recovered.fuzzy ? "edited" : "attached",
          confidence: recovered.fuzzy ? 0.5 : 1
        });
      } catch (_) {}
      thread.deleted = false;
      thread.fuzzy = !!recovered.fuzzy;
      thread.invalid = !!recovered.fuzzy;
      thread.invalidReason = recovered.fuzzy ? (thread.invalidReason || "mark-reattached-fuzzy") : void 0;
      thread.range = { from: recovered.from, to: recovered.to };
      try { markDirty(); } catch (_) {}
      try { renderCommentList(); } catch (_) {}
      const docSize = editor2.state.doc.content.size;
      let from2 = Math.max(0, recovered.from);
      let to = Math.min(docSize, recovered.to);
      const MAX_JUMP_SEL = 800;
      if (to - from2 > MAX_JUMP_SEL) to = from2 + 1;
      try { editor2.commands.focus(from2, { scrollIntoView: false }); } catch (e) {
        try { editor2.commands.focus(undefined, { scrollIntoView: false }); } catch (e2) {}
      }
      try { editor2.commands.setTextSelection({ from: from2, to }); } catch (e) {
        try { editor2.commands.setTextSelection(from2); } catch (e2) {}
      }
      activateAnnotationThread(threadId, { ensureCard: true });
      scrollEditorPosIntoCenter(from2, { behavior: "smooth" });
      try {
        requestAnimationFrame(() => {
          scrollEditorPosIntoCenter(from2, { behavior: "auto" });
          requestAnimationFrame(() => scrollEditorPosIntoCenter(from2, { behavior: "auto" }));
        });
      } catch (_) {}
      return;
    }
  } catch (eRec) {
    console.warn("[scrollToThread] recover failed", eRec);
  }
  showToast("\u6279\u6CE8\u4F4D\u7F6E\u5DF2\u5931\u6548\uFF08\u53EF\u80FD\u6587\u6863\u88AB\u4FEE\u6539\uFF09");
}
function highlightActiveMark() {
  const editor2 = State.editor;
  if (!editor2) return;
  const targetTid = State.activeThreadId;
  // DecorationSet path: single meta dispatch, no double full-doc mark rewrite
  try {
    let tr2 = editor2.state.tr;
    tr2 = setActiveHighlightMeta(tr2, targetTid);
    tr2.setMeta("addToHistory", false);
    tr2.setMeta("__activeMarkSync", true);
    editor2.view.dispatch(tr2);
    highlightActiveMark._usedDecorationSet = true;
    highlightActiveMark._scanCount = 1;
  } catch (e) {
    console.warn("[highlightActiveMark] deco", e);
  }
  // Do NOT toggle .annotation-mark.is-active via classList.
  // Mutating mark DOM under contenteditable triggers ProseMirror
  // DOMObserver.readDOMChange, which drops coexisting annotation marks.
  // Active styling is carried only by ActiveHighlight decorations.
  const hasImgAnn = (State.annotations || []).some((a) => a && Array.isArray(a.imageAnchors) && a.imageAnchors.length);
  if (hasImgAnn) {
    try {
      refreshAnnotationImageDecos();
    } catch (e) {
    }
  }
  positionMarkDeletePopover();
}
function positionMarkDeletePopover() {
  const popover = $("#mark-delete-popover");
  if (!popover) return;
  const threadId = State.activeThreadId;
  if (!threadId) {
    popover.classList.add("hidden");
    return;
  }
  const sel = State.editor?.state?.selection;
  if (sel && !sel.empty) {
    popover.classList.add("hidden");
    return;
  }
  const editor2 = State.editor;
  let pos = null;
  editor2.state.doc.descendants((node, p) => {
    node.marks.forEach((m) => {
      if (m.type === editor2.schema.marks.annotation && m.attrs.threadId === threadId) {
        if (pos === null) pos = p;
      }
    });
  });
  if (pos === null) {
    popover.classList.add("hidden");
    return;
  }
  try {
    const coords = editor2.view.coordsAtPos(pos);
    const editorPane = $("#editor-pane");
    const paneRect = editorPane.getBoundingClientRect();
    popover.style.left = coords.left - paneRect.left + editorPane.scrollLeft + "px";
    popover.style.top = coords.top - paneRect.top + editorPane.scrollTop - 26 + "px";
    popover.classList.remove("hidden");
  } catch (e) {
    popover.classList.add("hidden");
  }
}
var DISPLAY_MAX_EDGE = 1600;
async function createDisplayObjectURL(blob, path2 = "") {
  if (!blob) return "";
  const isImg = blob.type && blob.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path2 || "");
  if (!isImg) return URL.createObjectURL(blob);
  if (/\.svg$/i.test(path2 || "") || blob.type === "image/svg+xml") {
    return URL.createObjectURL(blob);
  }
  try {
    if (typeof createImageBitmap !== "function") return URL.createObjectURL(blob);
    const bmp = await createImageBitmap(blob);
    const maxEdge = Math.max(bmp.width, bmp.height);
    if (!maxEdge || maxEdge <= DISPLAY_MAX_EDGE) {
      try {
        bmp.close();
      } catch (_) {
      }
      return URL.createObjectURL(blob);
    }
    const scale = DISPLAY_MAX_EDGE / maxEdge;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      try {
        bmp.close();
      } catch (_) {
      }
      return URL.createObjectURL(blob);
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    try {
      bmp.close();
    } catch (_) {
    }
    const preferJpeg = !/\.png$/i.test(path2 || "") && blob.type !== "image/png";
    const displayBlob = await new Promise((resolve) => {
      const done = (b) => resolve(b);
      if (preferJpeg) canvas.toBlob(done, "image/jpeg", 0.86);
      else canvas.toBlob((b) => b ? done(b) : canvas.toBlob(done, "image/jpeg", 0.86), "image/png");
    });
    return URL.createObjectURL(displayBlob || blob);
  } catch (e) {
    console.warn("[media-display] downsample fail, use original:", path2, e);
    return URL.createObjectURL(blob);
  }
}
async function injectMediaFiles(mediaFiles) {
  for (const [path2, raw] of Object.entries(mediaFiles || {})) {
    let blob = raw;
    if (raw && !(typeof Blob !== "undefined" && raw instanceof Blob)) {
      // Accept Uint8Array / ArrayBuffer from importers
      const ext = (/\.([a-z0-9]+)$/i.exec(path2) || [])[1] || "bin";
      const mime =
        ext === "png" ? "image/png" :
        ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
        ext === "gif" ? "image/gif" :
        ext === "webp" ? "image/webp" :
        ext === "svg" ? "image/svg+xml" :
        "application/octet-stream";
      try {
        blob = new Blob([raw], { type: mime });
      } catch (e) {
        console.warn("[injectMediaFiles] coerce failed:", path2, e);
        continue;
      }
    }
    State.mediaFiles[path2] = blob;
    State.mediaUrls[path2] = await createDisplayObjectURL(blob, path2);
  }
}
function markdownToHtml(mdText, mediaUrls) {
  let text2 = mdText;
  // Body rule: a single newline between prose lines is a full paragraph break
  // (not a soft same-paragraph join). Fenced code + pipe tables are preserved.
  try {
    text2 = singleNewlinesToParagraphBreaks(text2);
  } catch (_) {}
  // Absorb "Author et al. [-@key]" → "[-@key]" so the citation atom can show
  // the full narrative label "Author et al. (year)" without duplicated prose.
  try {
    if (State && State.references && (State.references.entries || []).length) {
      text2 = stripNarrativeAuthorBeforeSuppressCitations(text2, State.references);
    }
  } catch (_) {}
  // markdown-it runs with html:false, so we cannot inject raw <section> before
  // render. Swap the semantic marker for a plain placeholder that survives as
  // text/paragraph content, then re-inject the section after render.
  const BIB_PLACEHOLDER = "MENTOR_BIBLIOGRAPHY_FIELD_PLACEHOLDER";
  let hadBibMarker = false;
  if (text2 && typeof text2 === "string" && text2.indexOf(BIBLIOGRAPHY_MARKER) !== -1) {
    hadBibMarker = true;
    text2 = text2.replace(/[ \t]*<!--\s*mentor:bibliography\s*-->[ \t]*\n?/g, `\n\n${BIB_PLACEHOLDER}\n\n`);
  }
  if (mediaUrls && Object.keys(mediaUrls).length > 0) {
    text2 = text2.replace(/!\[([^\]]*)\]\((media\/[^)\s]+)\)/g, (m, alt, src) => {
      const blobUrl = mediaUrls[src];
      return blobUrl ? `![${alt}](${blobUrl})` : m;
    });
  }
  let html = md.render(text2 || "");
  // Block images: bare <img> so TipTap ImageBlock is a direct child
  try {
    html = unwrapSoleImageParagraphs(html);
  } catch (_) {}
  if (hadBibMarker) {
    const section = '<section data-mentor-bibliography="true"></section>';
    html = html
      .replace(new RegExp(`<p>\\s*${BIB_PLACEHOLDER}\\s*</p>`, "g"), section)
      .replace(new RegExp(BIB_PLACEHOLDER, "g"), section);
  }
  return html;
}
function collectKeptMediaUrls({ exceptTabId = null, includeState = true } = {}) {
  const keep = /* @__PURE__ */ new Set();
  for (const tab of State.tabs || []) {
    if (!tab || exceptTabId && tab.id === exceptTabId) continue;
    for (const u of Object.values(tab.mediaUrls || {})) if (u) keep.add(u);
  }
  if (includeState) {
    for (const u of Object.values(State.mediaUrls || {})) if (u) keep.add(u);
  }
  return keep;
}
function revokeUrlSet(urls, keep) {
  for (const url of urls) {
    if (url && !(keep && keep.has(url))) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
      }
    }
  }
}
function revokeMediaUrls() {
  const keep = collectKeptMediaUrls({ exceptTabId: State.activeTabId, includeState: false });
  for (const tab of State.tabs || []) {
    if (!tab) continue;
    for (const u of Object.values(tab.mediaUrls || {})) if (u) keep.add(u);
  }
  revokeUrlSet(Object.values(State.mediaUrls || {}), keep);
  State.mediaUrls = {};
  State.mediaFiles = {};
}
function revokeTabMedia(tab, { dyingState = false } = {}) {
  if (!tab) return;
  const keep = collectKeptMediaUrls({
    exceptTabId: tab.id,
    includeState: !dyingState
  });
  revokeUrlSet(Object.values(tab.mediaUrls || {}), keep);
  if (dyingState) {
    revokeUrlSet(Object.values(State.mediaUrls || {}), keep);
  }
}
function htmlToMarkdown(html) {
  html = html.replace(/<span[^>]*data-thread-id[^>]*>(.*?)<\/span>/gs, "$1");
  return turndown.turndown(html);
}
function htmlToMarkdownMedia(html) {
  html = html.replace(/<span[^>]*data-thread-id[^>]*>(.*?)<\/span>/gs, "$1");
  if (State.mediaUrls && Object.keys(State.mediaUrls).length > 0) {
    const reverseMap = {};
    for (const [path2, blobUrl] of Object.entries(State.mediaUrls)) {
      reverseMap[blobUrl] = path2;
    }
    html = html.replace(/<img([^>]*?)src=("|')(blob:[^"']+)\2/gi, (m, attrs, q, blobUrl) => {
      const path2 = reverseMap[blobUrl];
      return path2 ? `<img${attrs}src=${q}${path2}${q}` : m;
    });
  }
  return turndown.turndown(html);
}
/** Durable archive HTML: live blob: src → media/* paths (session-independent). */
function htmlWithMediaPaths(html, mediaUrls = null) {
  if (!html || typeof html !== "string") return html || "";
  const urls = mediaUrls || State.mediaUrls || {};
  const reverseMap = {};
  for (const [path2, blobUrl] of Object.entries(urls)) {
    if (blobUrl) reverseMap[blobUrl] = path2;
  }
  if (!Object.keys(reverseMap).length) return html;
  return html.replace(/(\ssrc\s*=\s*)("|')(blob:[^"']+)\2/gi, (m, pre, q, blobUrl) => {
    const path2 = reverseMap[blobUrl];
    return path2 ? `${pre}${q}${path2}${q}` : m;
  });
}
/**
 * Load-time hydrate: media/* → current blob URLs.
 * Also recovers dead session blob: srcs by pairing with content.md image order.
 */
function htmlWithBlobUrls(html, mediaUrls = null, mdText = "") {
  if (!html || typeof html !== "string") return html || "";
  const urls = mediaUrls || State.mediaUrls || {};
  let out = html;
  if (Object.keys(urls).length) {
    out = out.replace(/(\ssrc\s*=\s*)("|')(media\/[^"']+)\2/gi, (m, pre, q, path2) => {
      const blobUrl = urls[path2] || urls[path2.replace(/^\.\//, "")];
      return blobUrl ? `${pre}${q}${blobUrl}${q}` : m;
    });
  }
  const reverseLive = new Set(Object.values(urls || {}).filter(Boolean));
  const mdPaths = [];
  if (typeof mdText === "string" && mdText) {
    const re = /!\[[^\]]*\]\((media\/[^)\s]+)\)/g;
    let mm;
    while ((mm = re.exec(mdText)) !== null) mdPaths.push(mm[1]);
  }
  let deadIdx = 0;
  out = out.replace(/(\ssrc\s*=\s*)("|')(blob:[^"']+)\2/gi, (m, pre, q, blobUrl) => {
    if (reverseLive.has(blobUrl)) return m;
    while (deadIdx < mdPaths.length) {
      const pth = mdPaths[deadIdx++];
      const live = urls[pth];
      if (live) return `${pre}${q}${live}${q}`;
    }
    return m;
  });
  return out;
}
function structuralHtmlHasUnresolvedBlobs(html, mediaUrls = null) {
  if (!html || typeof html !== "string") return false;
  const urls = mediaUrls || State.mediaUrls || {};
  const live = new Set(Object.values(urls || {}).filter(Boolean));
  const re = /\ssrc\s*=\s*("|')(blob:[^"']+)\1/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!live.has(m[2])) return true;
  }
  return false;
}
function flushSourceView() {
  const sourceEl = $("#source-view");
  if (State.renderMode !== "source" || !sourceEl || sourceEl.style.display === "none") return null;
  // Rebuild markdown with bibliography chips → semantic marker (never chip label text).
  let markdown = "";
  try {
    const parts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 1) {
        if (node.classList && node.classList.contains("source-bibliography-marker")) {
          parts.push(BIBLIOGRAPHY_MARKER);
          return; // skip chip descendants (label text)
        }
        if (node.tagName === "BR") {
          parts.push("\n");
          return;
        }
        for (const child of node.childNodes) walk(child);
        return;
      }
      if (node.nodeType === 3) parts.push(node.nodeValue || "");
    };
    walk(sourceEl);
    markdown = parts.join("");
  } catch (_) {
    markdown = sourceEl.innerText || "";
  }
  if (!markdown.includes(BIBLIOGRAPHY_MARKER) && sourceEl.querySelector(".source-bibliography-marker")) {
    // Fallback: replace chip labels in innerText
    markdown = (sourceEl.innerText || "").split("References（由文献库生成）").join(BIBLIOGRAPHY_MARKER);
  }
  const editor2 = State.editor;
  const markSnapshots = [];
  editor2.state.doc.descendants((node) => {
    node.marks.forEach((mark) => {
      if (mark.type === editor2.schema.marks.annotation) {
        markSnapshots.push({
          threadId: mark.attrs.threadId,
          resolved: mark.attrs.resolved,
          authorColor: mark.attrs.authorColor,
          text: node.text
        });
      }
    });
  });
  State._suspendAnnValidate = true;
    try {
      State.editor.commands.setContent(markdownToHtml(markdown, State.mediaUrls), false);
    } finally {
      State._suspendAnnValidate = false;
    }
    try { reconcileCitationNodes(); } catch (_) {}
    try { reconcileBibliographyNode(); } catch (_) {}
    if (markSnapshots.length > 0) {
    const tr2 = editor2.state.tr;
    const markType = editor2.schema.marks.annotation;
    const failedThreadIds = /* @__PURE__ */ new Set();
    const uniqueThreads = [];
    const seenThreadIds = new Set();
    for (const snap of markSnapshots) {
      if (!snap || !snap.threadId || seenThreadIds.has(snap.threadId)) continue;
      seenThreadIds.add(snap.threadId);
      uniqueThreads.push(snap);
    }
    for (const snap of uniqueThreads) {
      const ann = State.annotations.find((item) => item && item.threadId === snap.threadId);
      if (!ann || !ann.text) {
        failedThreadIds.add(snap.threadId);
        continue;
      }
      const found2 = findAnnotationRange(editor2.state.doc, ann);
      if (found2 && typeof found2.from === "number" && typeof found2.to === "number" && found2.from < found2.to) {
        tr2.addMark(found2.from, found2.to, markType.create(annotationMarkAttrs(ann, {
          threadId: snap.threadId,
          resolved: snap.resolved,
          authorColor: snap.authorColor,
          active: false
        })));
        syncThreadAnchorEvidence(ann, editor2.state.doc, found2, {
          exact: ann.text,
          status: found2.fuzzy ? "edited" : "attached",
          confidence: found2.fuzzy ? 0.5 : 1
        });
        ann.fuzzy = !!found2.fuzzy;
        ann.invalid = !!found2.fuzzy;
        ann.deleted = false;
        ann.invalidReason = found2.fuzzy ? "text-changed" : void 0;
      } else {
        failedThreadIds.add(snap.threadId);
        console.warn(`[P-mark] mark restore 失败: threadId=${String(snap.threadId).slice(0, 8)} reason=${found2 && found2.ambiguous ? "ambiguous" : "not-found"}`);
      }
    }
    tr2.setMeta("addToHistory", false);
    tr2.setMeta("__activeMarkSync", true);
    editor2.view.dispatch(tr2);
    for (const ann of State.annotations) {
      if (failedThreadIds.has(ann.threadId)) {
        ann.fuzzy = true;
        ann.invalid = true;
        ann.invalidReason = ann.invalidReason || "text-changed";
        if (ann.anchor && typeof ann.anchor === "object") {
          ann.anchor = { ...ann.anchor, status: "ambiguous", confidence: 0, updatedAt: nowISO() };
        }
      }
    }
    // A save/draft snapshot can run immediately after flushSourceView. Complete the
    // lifecycle synchronously instead of waiting for the debounced validator.
    try {
      _validateMarksAfterEdit(editor2, { phase: "full", changedRanges: null });
    } catch (e) {
      console.warn("[P-mark] post-source validation", e);
    }
    if (failedThreadIds.size > 0) renderCommentList();
    try {
      const trSeed = editor2.state.tr;
      setAnnotationAnchorResetMeta(trSeed, State.annotations || []);
      trSeed.setMeta("addToHistory", false);
      editor2.view.dispatch(trSeed);
    } catch (_) {}
  }
  if (State.currentFile) State.currentFile.content = markdown;
  return markdown;
}
function setRenderMode(mode) {
  if (mode !== "rendered" && mode !== "source") return;
  if (mode === State.renderMode) return;
  const editorPane = $("#editor-pane");
  const tiptapEl = $("#editor");
  let sourceEl = $("#source-view");
  if (mode === "source") {
    State.renderMode = mode;
    try {
      const sel = State.editor.state.selection;
      if (sel && !sel.empty && sel.from !== sel.to) {
        const text2 = State.editor.state.doc.textBetween(sel.from, sel.to, "\n", "\n");
        if (text2) {
          const context = computeContextAt(State.editor.state.doc, sel.from, sel.to);
          State.savedSelection = { from: sel.from, to: sel.to, text: text2, prefix: context.prefix, suffix: context.suffix };
        }
      }
    } catch (e) {
    }
    const html = State.editor.getHTML();
        const md2 = htmlToMarkdown(html);
        if (!sourceEl) {
          sourceEl = document.createElement("pre");
          sourceEl.id = "source-view";
          sourceEl.className = "source-view";
          sourceEl.setAttribute("spellcheck", "false");
          sourceEl.setAttribute("tabindex", "0");
          sourceEl.setAttribute("contenteditable", "true");
          sourceEl.addEventListener("input", () => {
            if (!State.currentFile) return;
            // Prefer chip-aware reconstruction when possible
            try {
              const parts = [];
              const walk = (node) => {
                if (!node) return;
                if (node.nodeType === 1 && node.classList && node.classList.contains("source-bibliography-marker")) {
                  parts.push({ type: "chip" });
                  return;
                }
                if (node.nodeType === 3) { parts.push({ type: "text", value: node.nodeValue || "" }); return; }
                if (node.childNodes) for (const c of node.childNodes) walk(c);
              };
              walk(sourceEl);
              if (parts.some((p) => p.type === "chip")) {
                State.currentFile.content = parts.map((p) => p.type === "chip" ? BIBLIOGRAPHY_MARKER : p.value).join("");
              } else {
                State.currentFile.content = sourceEl.innerText;
              }
            } catch (_) {
              State.currentFile.content = sourceEl.innerText;
            }
            markDirty();
            State.savedSelection = null;
          });
          editorPane.appendChild(sourceEl);
        }
        sourceEl.innerHTML = highlightSelectionInSource(md2, State.savedSelection?.text);
        tiptapEl.style.display = "none";
        sourceEl.style.display = "block";
        const selInfo = State.savedSelection ? `\u5DF2\u5207\u6362 (${md2.length} \u5B57\u7B26, \u9009\u533A\u9AD8\u4EAE: ${State.savedSelection.text.length} \u5B57)` : `\u5DF2\u5207\u6362 (${md2.length} \u5B57\u7B26)`;
        setStatus("\u6E90\u7801\u6A21\u5F0F", selInfo);
  } else {
    let savedText = null;
    if (sourceEl) {
      savedText = State.savedSelection?.text || null;
      // Must flush while still in source mode so source text + mark restore run.
      flushSourceView();
      sourceEl.style.display = "none";
    }
    State.renderMode = mode;
    tiptapEl.style.display = "";
    let restored = false;
    if (savedText && State.savedSelection) {
      try {
        const selectionAnchor = {
          text: savedText,
          prefix: State.savedSelection.prefix || "",
          suffix: State.savedSelection.suffix || "",
          range: {
            from: State.savedSelection.from,
            to: State.savedSelection.to
          }
        };
        const found2 = findAnnotationRange(State.editor.state.doc, selectionAnchor);
        if (found2 && typeof found2.from === "number" && typeof found2.to === "number") {
          const to = found2.to;
          State.editor.commands.focus(found2.from, { scrollIntoView: false });
          State.editor.commands.setTextSelection({ from: found2.from, to });
          restored = true;
        }
      } catch (e) {
      }
    }
    if (!restored) {
      try {
        const pos = Math.min(State.editor.state.selection.from, State.editor.state.doc.content.size);
        State.editor.commands.setTextSelection(pos);
        State.editor.commands.focus(pos, { scrollIntoView: false });
      } catch (e) {
      }
    }
    State.savedSelection = null;
    setStatus("\u6E32\u67D3\u6A21\u5F0F", restored ? "\u5DF2\u5207\u6362\u56DE WYSIWYG, \u9009\u533A\u5DF2\u6062\u590D" : "\u5DF2\u5207\u6362\u56DE WYSIWYG");
  }
  try { syncToolbarActionState(); } catch {}
}
function highlightSelectionInSource(md2, selectedText) {
  // Escape first, then inject protected bibliography chip (after escape so markup stays live).
  const chip = '<span class="source-bibliography-marker" contenteditable="false" data-source-token="bibliography">References（由文献库生成）</span>';
  const token = "\u0000BIBMARK\u0000";
  const withToken = String(md2 || "").split(BIBLIOGRAPHY_MARKER).join(token);
  let escaped = withToken.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (selectedText && selectedText.trim()) {
    const needle = selectedText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const idx = escaped.indexOf(needle);
    if (idx !== -1) {
      escaped = escaped.slice(0, idx) + '<mark class="source-selection">' + escaped.slice(idx, idx + needle.length) + "</mark>" + escaped.slice(idx + needle.length);
    }
  }
  return escaped.split(token).join(chip);
}
function updateToggleBtnIcon() {
  // Compatibility shim: source/preview button state is owned by syncToolbarActionState.
  try { syncToolbarActionState(); } catch {}
}
var _renderOutlineTimer = null;
function scheduleRenderOutline() {
  if (_renderOutlineTimer) return;
  _renderOutlineTimer = setTimeout(() => {
    _renderOutlineTimer = null;
    renderOutline();
  }, 200);
}
function renderOutline() {
  const pane = $("#outline-pane");
  if (!pane) return;
  const editor2 = State.editor;
  const tab = State.outlineTab === "images" ? "images" : "headings";
  // Header tabs live next to collapse — peer of 大纲/图片, not nested under content.
  const headerTabs = document.querySelectorAll('#file-pane .pane-header [data-outline-tab]');
  headerTabs.forEach((el) => {
    const isOn = el.getAttribute("data-outline-tab") === tab;
    el.classList.toggle("is-active", isOn);
    el.setAttribute("aria-selected", isOn ? "true" : "false");
  });
  if (!editor2) {
    pane.innerHTML = tab === "images"
      ? '<p class="outline-empty">打开文档以查看图片</p>'
      : '<p class="outline-empty">打开文档以查看大纲</p>';
    return;
  }
  const headings = [];
  const images = [];
  let imageIndex = 0;
  editor2.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.level >= 1 && node.attrs.level <= 3) {
      headings.push({ level: node.attrs.level, text: node.textContent || "", pos, kind: "heading" });
    } else if (node.type.name === "bibliography") {
      headings.push({
        level: 1,
        text: (node.attrs && node.attrs.heading) || "References",
        pos,
        kind: "bibliography"
      });
    } else if (node.type.name === "image") {
      imageIndex += 1;
      const src = (node.attrs && node.attrs.src) || "";
      const alt = (node.attrs && node.attrs.alt) || "";
      const title = (node.attrs && node.attrs.title) || "";
      const path2 = mediaPathForSrc(src) || src;
      const base = mentorBaseName(path2) || "";
      const label = (alt && String(alt).trim()) || (title && String(title).trim()) || base || (`图片 ${imageIndex}`);
      images.push({ pos, src, alt, title, label, index: imageIndex, kind: "image" });
    }
  });

  // Optional count badge on 图片 tab
  const imgTab = document.querySelector('#file-pane .pane-header [data-outline-tab="images"]');
  if (imgTab) {
    imgTab.textContent = images.length ? `图片 (${images.length})` : "图片";
  }
  const headTab = document.querySelector('#file-pane .pane-header [data-outline-tab="headings"]');
  if (headTab) headTab.textContent = "大纲";

  let bodyHtml = "";
  if (tab === "images") {
    if (!images.length) {
      bodyHtml = '<p class="outline-empty">暂无图片</p>';
    } else {
      bodyHtml = images.map((it) =>
        `<div class="outline-item outline-image-item" role="treeitem" tabindex="0" data-pos="${it.pos}" data-kind="image" data-image-pos="${it.pos}" title="${escapeHtml(it.label)}"><span class="outline-text">${escapeHtml(it.label)}</span></div>`
      ).join("");
    }
  } else if (!headings.length) {
    bodyHtml = '<p class="outline-empty">本文档暂无标题</p>';
  } else {
    bodyHtml = headings.map(
      (it) => `<div class="outline-item outline-h${it.level}" role="treeitem" tabindex="0" data-pos="${it.pos}" data-kind="${it.kind || "heading"}" title="${escapeHtml(it.text)}"><span class="outline-text">${escapeHtml(it.text) || "(无标题)"}</span></div>`
    ).join("");
  }

  pane.innerHTML = bodyHtml;
  pane.setAttribute("data-outline-mode", tab);

  const jumpOutline = (el) => {
    const pos = parseInt(el.dataset.pos, 10);
    if (Number.isNaN(pos)) return;
    try {
      const kind = el.dataset.kind || "heading";
      if (kind === "bibliography" || kind === "image") {
        try { editor2.chain().focus().setNodeSelection(pos).run(); } catch (_) {
          editor2.commands.focus();
          try { editor2.commands.setNodeSelection(pos); } catch (e2) {}
        }
        if (kind === "image") {
          try {
            const hit = (State.annotations || []).find(
              (a) => a && !a.invalid && Array.isArray(a.imageAnchors) && a.imageAnchors.some((x) => x && x.from === pos)
            );
            if (hit) activateAndRevealThread(hit.threadId);
            refreshAnnotationImageDecos();
          } catch (_) {}
        }
      } else {
        const $pos = editor2.state.doc.resolve(pos + 1);
        editor2.chain().focus().setTextSelection($pos.pos).run();
      }
      const dom = editor2.view.nodeDOM(pos);
      if (dom && dom.scrollIntoView) {
        const target = kind === "image" && dom.querySelector ? (dom.tagName === "IMG" ? dom : dom.querySelector("img") || dom) : dom;
        target.scrollIntoView({ behavior: "smooth", block: kind === "image" ? "center" : "start" });
      }
    } catch (e) {
      console.warn("大纲跳转失败:", e);
    }
  };
  pane.querySelectorAll(".outline-item").forEach((el) => {
    el.addEventListener("click", () => jumpOutline(el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        jumpOutline(el);
      }
    });
  });
}

/** Wire 大纲|图片 header tabs once (delegated on file-pane header). */
function setupOutlineModeTabs() {
  const header = document.querySelector("#file-pane .pane-header");
  if (!header || header.dataset.outlineTabsBound === "1") return;
  header.dataset.outlineTabsBound = "1";
  header.addEventListener("click", (e) => {
    const el = e.target.closest("[data-outline-tab]");
    if (!el || !header.contains(el)) return;
    e.preventDefault();
    const next = el.getAttribute("data-outline-tab") === "images" ? "images" : "headings";
    if (State.outlineTab === next) return;
    State.outlineTab = next;
    renderOutline();
  });
}
function deepCloneAnnotations(arr) {
  return deepCloneAnnotationsPure(arr);
}
/**
 * Inverse-patch history.
 * Call sites invoke pushHistory() BEFORE mutating annotations (legacy contract).
 * We keep _prePush = state at last push. On the next pushHistory (or commitHistoryIfNeeded),
 * we push an inverse patch from _prePush → current, then set _prePush = current.
 * Entries never store full `annotations` arrays — only annPatch.ops + markSwap.
 */
function pushHistory() {
  const marksNow = snapshotAnnotationMarks();
  const annNow = deepCloneAnnotations(State.annotations);
  if (State.history._prePush) {
    const pre = State.history._prePush;
    const inverse = computeInverseAnnPatch(pre.annotations, annNow);
    const marksChanged = JSON.stringify(pre.markSnapshot || []) !== JSON.stringify(marksNow);
    if ((inverse.ops && inverse.ops.length) || marksChanged) {
      State.history.past.push({
        kind: "inverse-patch",
        annPatch: inverse,
        markSwap: {
          kind: "mark-snapshot-swap",
          before: pre.markSnapshot || [],
          after: marksNow || []
        },
        ts: Date.now()
      });
      if (State.history.past.length > State.history.capacity) State.history.past.shift();
    }
  }
  // Also push a restore-point entry for the state at THIS push (pre-mutation of upcoming op).
  // That matches legacy: undo returns to the snapshot taken when pushHistory was called.
  // We encode it as inverse from (post-mutation unknown) — deferred until commit/next push.
  // Seed: store checkpoint as the target of the next commit.
  State.history._prePush = { annotations: annNow, markSnapshot: marksNow };
  State.history._baseAnnotations = annNow;
  State.history._baseMarks = marksNow;
  // Explicit checkpoint entry so one pushHistory + mutation + undo works without second push:
  // Store entry that undoes from any later state back to annNow by capturing checkpoint id.
  State.history._checkpoint = { annotations: annNow, markSnapshot: marksNow };
  State.history.future = [];
  State.history.lastOp = "ann";
  updateHistoryButtons();
}
function snapshotAnnotationMarks() {
  const ed = State.editor;
  if (!ed) return [];
  const result = [];
  const markType = ed.schema.marks.annotation;
  if (!markType) return [];
  const doc5 = ed.state.doc;
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    node.marks.forEach((m) => {
      if (m.type === markType && m.attrs.threadId) {
        const from = pos;
        const to = pos + node.nodeSize;
        let prefix = "";
        let suffix = "";
        try {
          const ctx = typeof computeContextAt === "function" ? computeContextAt(doc5, from, to) : null;
          if (ctx) {
            prefix = ctx.prefix || "";
            suffix = ctx.suffix || "";
          }
        } catch (_) {}
        result.push({
          threadId: m.attrs.threadId,
          from,
          to,
          text: node.text || "",
          prefix,
          suffix,
          resolved: !!m.attrs.resolved
        });
      }
    });
  });
  return result;
}
/** Commit deferred inverse patch for mutations since last pushHistory/checkpoint. */
function commitHistoryIfNeeded() {
  if (!State.history || !State.history._checkpoint) return;
  const pre = State.history._checkpoint;
  const nowAnn = State.annotations;
  const nowMarks = snapshotAnnotationMarks();
  if (
    JSON.stringify(pre.annotations) === JSON.stringify(nowAnn) &&
    JSON.stringify(pre.markSnapshot || []) === JSON.stringify(nowMarks)
  ) {
    return;
  }
  const inverse = computeInverseAnnPatch(pre.annotations, nowAnn);
  State.history.past.push({
    kind: "inverse-patch",
    annPatch: inverse,
    markSwap: {
      kind: "mark-snapshot-swap",
      before: pre.markSnapshot || [],
      after: nowMarks || []
    },
    ts: Date.now()
  });
  if (State.history.past.length > State.history.capacity) State.history.past.shift();
  State.history._checkpoint = {
    annotations: deepCloneAnnotations(nowAnn),
    markSnapshot: nowMarks
  };
  State.history._prePush = State.history._checkpoint;
  State.history._baseAnnotations = State.history._checkpoint.annotations;
  State.history._baseMarks = nowMarks;
  State.history.future = [];
  updateHistoryButtons();
}
function undo2() {
  commitHistoryIfNeeded();
  if (State.history.past.length === 0) return false;
  while (State.history.past.length > 0) {
    const peek = State.history.past[State.history.past.length - 1];
    let prevAnn;
    if (peek.kind === "inverse-patch") {
      prevAnn = applyAnnPatch(State.annotations, peek.annPatch);
    } else if (peek.annotations) {
      prevAnn = peek.annotations;
    } else {
      prevAnn = [];
    }
    const prevIds = new Set((prevAnn || []).filter((a) => a && a.threadId).map((a) => a.threadId));
    const pendingNow = State.annotations.filter((a) => a && a.pending && a.threadId);
    const wouldLoseDraft = pendingNow.some((a) => !prevIds.has(a.threadId));
    if (!wouldLoseDraft) break;
    State.history.past.pop();
  }
  if (State.history.past.length === 0) {
    updateHistoryButtons();
    return false;
  }
  const entry = State.history.past.pop();
  const currentAnn = deepCloneAnnotations(State.annotations);
  const currentMarks = snapshotAnnotationMarks();
  let restoredAnn;
  let restoredMarks;
  if (entry.kind === "inverse-patch") {
    restoredAnn = applyAnnPatch(State.annotations, entry.annPatch);
    restoredMarks = entry.markSwap ? entry.markSwap.before : currentMarks;
  } else {
    restoredAnn = entry.annotations;
    restoredMarks = entry.markSnapshot;
  }
  // Redo applies inverse(current→restored) inverted = inverse(restored, current)
  State.history.future.push({
    kind: "inverse-patch",
    annPatch: computeInverseAnnPatch(currentAnn, restoredAnn),
    markSwap: {
      kind: "mark-snapshot-swap",
      before: currentMarks,
      after: restoredMarks || []
    },
    // redo: apply inverse(restored, current) to restored → current
    // store patch that restores current from restored:
    _toAnn: currentAnn,
    _toMarks: currentMarks,
    ts: Date.now()
  });
  if (State.history.future.length > State.history.capacity) State.history.future.shift();
  restoreFromSnapshot({ annotations: restoredAnn, markSnapshot: restoredMarks });
  State.history._checkpoint = {
    annotations: deepCloneAnnotations(restoredAnn),
    markSnapshot: restoredMarks || []
  };
  State.history._prePush = State.history._checkpoint;
  return true;
}
function redo2() {
  if (State.history.future.length === 0) return false;
  const entry = State.history.future.pop();
  const preAnn = deepCloneAnnotations(State.annotations);
  const preMarks = snapshotAnnotationMarks();
  let nextAnn;
  let nextMarks;
  if (entry._toAnn) {
    nextAnn = deepCloneAnnotations(entry._toAnn);
    nextMarks = entry._toMarks || [];
  } else if (entry.kind === "inverse-patch") {
    // entry.annPatch was computeInverseAnnPatch(current, restored) at undo = restore current from restored
    // apply(restored=State, that) → current. Good.
    nextAnn = applyAnnPatch(State.annotations, entry.annPatch);
    nextMarks = entry.markSwap ? entry.markSwap.before : preMarks;
  } else if (entry.annotations) {
    nextAnn = entry.annotations;
    nextMarks = entry.markSnapshot;
  } else {
    return false;
  }
  State.history.past.push({
    kind: "inverse-patch",
    annPatch: computeInverseAnnPatch(preAnn, nextAnn),
    markSwap: {
      kind: "mark-snapshot-swap",
      before: preMarks,
      after: nextMarks || []
    },
    ts: Date.now()
  });
  if (State.history.past.length > State.history.capacity) State.history.past.shift();
  restoreFromSnapshot({ annotations: nextAnn, markSnapshot: nextMarks });
  State.history._checkpoint = {
    annotations: deepCloneAnnotations(nextAnn),
    markSnapshot: nextMarks || []
  };
  State.history._prePush = State.history._checkpoint;
  return true;
}
function restoreFromSnapshot(snap) {
  State.annotations = snap.annotations;
  rebuildAnnotationMarks(snap.markSnapshot);
  renderCommentList();
  markDirty();
  updateHistoryButtons();
}
function rebuildAnnotationMarks(markSnapshot) {
  const ed = State.editor;
  if (!ed) return;
  const markType = ed.schema.marks.annotation;
  if (!markType) return;
  const docSize = ed.state.doc.content.size;
  let tr2 = ed.state.tr;
  tr2 = tr2.removeMark(0, docSize, markType);
  const validThreadIds = /* @__PURE__ */ new Set();
  State.annotations.forEach((t) => {
    if (t.threadId) validThreadIds.add(t.threadId);
  });
  const isMarklessImageAnn = (t) => {
    if (!t || typeof t !== "object") return false;
    if (!Array.isArray(t.imageAnchors) || t.imageAnchors.length === 0) return false;
    if (t.skipMark) return true;
    const lab = String(t.text || "").trim();
    if (lab === "[\u56FE\u7247]" || lab.startsWith("[\u56FE\u7247]")) return true;
    if (t.imageAnchors.length === 1 && t.range && t.imageAnchors[0].from === t.range.from && t.imageAnchors[0].to === t.range.to && (!Array.isArray(t.ranges) || t.ranges.length <= 1)) {
      return true;
    }
    return false;
  };
  const rebuilt = [];
  const seen = /* @__PURE__ */ new Set();
  const tryAdd = (threadId, from2, to, resolved) => {
    if (!threadId) return false;
    if (!validThreadIds.has(threadId)) return false;
    if (from2 < 0 || to > docSize || from2 >= to) return false;
    if (seen.has(`${threadId}:${from2}-${to}`)) return false;
    const thr = State.annotations.find((x) => x && x.threadId === threadId);
    if (thr && isMarklessImageAnn(thr) && (!Array.isArray(thr.ranges) || thr.ranges.length === 0)) {
      return false;
    }
    const thrForMark = State.annotations.find((x) => x && x.threadId === threadId);
    const attrs = annotationMarkAttrs(thrForMark, { threadId, resolved: !!resolved });
    tr2 = tr2.addMark(from2, to, markType.create(attrs));
    seen.add(`${threadId}:${from2}-${to}`);
    rebuilt.push({ threadId, from: from2, to });
    return true;
  };
  if (Array.isArray(markSnapshot) && markSnapshot.length > 0) {
    markSnapshot.forEach((snap) => {
      if (!snap || !snap.threadId) return;
      let from2 = snap.from;
      let to = snap.to;
      let okPos = typeof from2 === "number" && typeof to === "number" && from2 >= 0 && to <= docSize && from2 < to;
      if (okPos) {
        try {
          const live = ed.state.doc.textBetween(from2, to, " ");
          if (snap.text != null && String(snap.text) && live !== String(snap.text)) okPos = false;
        } catch (_) {
          okPos = false;
        }
      }
      if (!okPos && (snap.text || snap.prefix || snap.suffix)) {
        const found = findAnnotationRange(ed.state.doc, {
          text: snap.text || "",
          prefix: snap.prefix || "",
          suffix: snap.suffix || "",
          range: { from: snap.from, to: snap.to },
          anchor: { position: { from: snap.from, to: snap.to } }
        });
        if (found && !found.ambiguous && typeof found.from === "number" && found.from < found.to) {
          from2 = found.from;
          to = found.to;
          okPos = true;
        } else {
          const thr = State.annotations.find((x) => x && x.threadId === snap.threadId);
          if (thr) {
            thr.invalid = true;
            thr.fuzzy = !!(found && found.ambiguous);
            thr.invalidReason = found && found.ambiguous ? "ambiguous" : "text-not-found";
            thr.range = null;
            if (thr.anchor && typeof thr.anchor === "object") {
              thr.anchor = {
                ...thr.anchor,
                status: found && found.ambiguous ? "ambiguous" : "orphaned",
                confidence: 0
              };
            }
          }
          return;
        }
      }
      if (okPos) tryAdd(snap.threadId, from2, to, snap.resolved);
    });
  } else {
    State.annotations.forEach((t) => {
      if (!t || typeof t !== "object") return;
      if (isMarklessImageAnn(t) && (!Array.isArray(t.ranges) || t.ranges.length === 0)) return;
      if (Array.isArray(t.ranges) && t.ranges.length) {
        t.ranges.forEach((r) => tryAdd(t.threadId, r.from, r.to, t.resolved));
      } else if (t.range) {
        tryAdd(t.threadId, t.range.from, t.range.to, t.resolved);
      }
    });
  }
  const needMark = State.annotations.filter((t) => t && t.threadId && !isMarklessImageAnn(t));
  if (rebuilt.length === 0 && needMark.length > 0) {
    console.warn(`[rebuildAnnotationMarks] \u6240\u6709 ${needMark.length} \u4E2A text thread \u90FD\u672A\u91CD\u5EFA mark (snapshot \u7A7A + range \u8D8A\u754C \u6216 thread \u5DF2\u5220)`);
  }
  tr2.setMeta("addToHistory", false);
  tr2.setMeta("__activeMarkSync", true);
  ed.view.dispatch(tr2);
  try {
    const doc5 = ed.state.doc;
    for (const ann of State.annotations) {
      if (!ann || !Array.isArray(ann.imageAnchors) || !ann.imageAnchors.length) continue;
      try {
        resyncImageAnchors(ann, doc5);
      } catch (e) {
      }
    }
    refreshAnnotationImageDecos();
  } catch (e) {
    console.warn("[rebuildAnnotationMarks] image deco", e);
  }
  try { syncAnnotationMarkModeAttrs(); } catch (_) {}
  return rebuilt;
}
function updateHistoryButtons() {
  try { syncToolbarActionState(); } catch {}
}

const TOOLBAR_ACTION_SELECTORS = Object.freeze({
  new: "#btn-new",
  open: "#btn-open-files",
  autoSave: "#btn-autosave",
  save: "#btn-save",
  saveAs: "#btn-save-as",
  versionHistory: "#btn-version-history",
  exportMd: "#btn-export-md",
  exportDocx: "#btn-export-docx",
  references: "#btn-refs",
  undo: "#btn-undo",
  redo: "#btn-redo",
  source: "#btn-toggle-render",
  filePane: "#btn-toggle-file-pane",
  commentPane: "#btn-toggle-comment-pane",
});

function applyToolbarActionState(target, state) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el || !state) return;
  if ("disabled" in state) el.disabled = !!state.disabled;
  if ("label" in state) {
    const lab = el.querySelector(".tb-label");
    if (lab) lab.textContent = state.label;
  }
  if ("pressed" in state) el.setAttribute("aria-pressed", state.pressed ? "true" : "false");
  if ("expanded" in state) el.setAttribute("aria-expanded", state.expanded ? "true" : "false");
  if ("ariaLabel" in state) el.setAttribute("aria-label", state.ariaLabel);
  if ("title" in state) el.title = state.title;
  if ("intent" in state) el.dataset.intent = state.intent;
  if ("mode" in state) el.dataset.mode = state.mode;
  if ("disk" in state) el.dataset.disk = state.disk ? "true" : "false";
  if ("dirty" in state) el.dataset.dirty = state.dirty ? "true" : "false";
  if (state.detail) el.dataset.detail = state.detail;
  if (state.busy) el.setAttribute("aria-busy", "true");
  else el.removeAttribute("aria-busy");
}

function syncToolbarActionState() {
  let canUndo = State.history.past.length > 0;
  let canRedo = State.history.future.length > 0;
  try {
    if (State.editor?.can?.().undo?.()) canUndo = true;
    if (State.editor?.can?.().redo?.()) canRedo = true;
  } catch {}
  const refsPane = document.querySelector("#refs-pane");
  const referencesOpen = !!(refsPane && !refsPane.classList.contains("hidden"));
  const filePaneOpen = !document.body.classList.contains("file-pane-collapsed");
  const commentPaneOpen = !document.body.classList.contains("comment-pane-collapsed");
  const autoSaveEnabled = getAutoSaveEnabled();
  const autoSaveDisk = isAutoSaveDiskActive();
  const busyAction = typeof State._toolbarBusyAction === "string" ? State._toolbarBusyAction : "";
  const actionState = getToolbarActionState({
    hasDocument: !!State.currentFile,
    hasWriteHandle: hasWriteHandle(),
    dirty: !!(State.currentFile && State.currentFile.dirty),
    readOnly: !!State.readOnlyMode || !canWriteLiveDocument(),
    saveMode: State.saveMode,
    renderMode: State.renderMode === "source" ? "source" : "rendered",
    referencesOpen,
    canUndo,
    canRedo,
    busy: !!State._toolbarBusy && !busyAction,
    busyAction,
    filePaneOpen,
    commentPaneOpen,
    autoSaveEnabled,
    autoSaveDisk,
    versionPaneOpen: !!_versionPaneOpen,
    hasAnnotations: Array.isArray(State.annotations) && State.annotations.some((t) => t && t.pending !== true && Array.isArray(t.comments) && t.comments.some((c) => String((c && c.body) || "").trim())),
  });
  for (const [id, selector] of Object.entries(TOOLBAR_ACTION_SELECTORS)) {
    applyToolbarActionState(selector, actionState[id]);
  }
}

function resetHistory() {
  State.history = createPatchHistory(100);
  updateHistoryButtons();
}
function clearPmHistory() {
  const ed = State.editor;
  if (!ed) return;
  try {
    const EditorStateCtor = ed.state.constructor;
    const next2 = EditorStateCtor.create({
      schema: ed.schema,
      doc: ed.state.doc,
      selection: ed.state.selection,
      plugins: ed.state.plugins
    });
    ed.view.updateState(next2);
  } catch (e) {
    console.warn("[clearPmHistory]", e);
  }
}
function genTabId() {
  return genTabIdPure();
}
function isPlaceholderDocName(name) {
  if (!name) return true;
  return /^(untitled\.md|\u672A\u547D\u540D|\u672A\u547D\u540D\.md)$/i.test(String(name).trim());
}
function isActivePlaceholderTab() {
  const name = State.currentFile && State.currentFile.name;
  if (!isPlaceholderDocName(name)) return false;
  if ((State.annotations || []).length > 0) return false;
  try {
    const body = (State.editor && State.editor.state.doc.textContent || "").trim();
    // empty, or only openNewTabBlank seed — even if marked dirty, safe to replace in place
    return !body || body === "\u65B0\u6587\u6863";
  } catch {
    return true;
  }
}
function snapshotActiveTab() {
  if (!State.editor) return null;
  flushSourceView();
  const hasFile = !!(State.currentFile && State.currentFile.name);
  const bodyLen = (() => {
    try {
      return (State.editor.state.doc.textContent || "").trim().length;
    } catch {
      return 0;
    }
  })();
  // Completely empty editor with no file name: skip (caller may reuse activeTabId)
  if (!hasFile && bodyLen === 0 && !(State.annotations || []).length) {
    return null;
  }
  if (!State.activeTabId) State.activeTabId = genTabId();
  const id = State.activeTabId;
  const name = State.currentFile && State.currentFile.name || "\u672A\u547D\u540D";
  let html = "";
  try {
    html = State.editor.getHTML();
  } catch {
    html = "";
  }
  const handle = State.currentFile && State.currentFile.handle ? State.currentFile.handle : null;
  const snap = {
    id,
    name,
    html,
    annotations: JSON.parse(JSON.stringify(State.annotations || [])),
    dirty: !!(State.currentFile && State.currentFile.dirty),
    handle,
    saveMode: State.saveMode || "unknown",
    mediaUrls: Object.assign({}, State.mediaUrls || {}),
    mediaFiles: Object.assign({}, State.mediaFiles || {}),
    activeThreadId: State.activeThreadId || null,
    replyDrafts: Object.assign({}, State.replyDrafts || {}),
    references: JSON.parse(JSON.stringify(State.references || emptyReferenceManifest())),
    currentFile: State.currentFile ? {
      documentId: State.currentFile.documentId || id,
      name: State.currentFile.name,
      content: State.currentFile.content,
      dirty: !!State.currentFile.dirty,
      dirtyGen: State.currentFile.dirtyGen || 0,
      handle,
      path: State.currentFile.path || State.externalWatchPath || null
    } : { documentId: id, name, content: "", dirty: false, dirtyGen: 0, handle: null },
    supervisionSource: sanitizeSupervisionSource({
      path: State.externalWatchPath || (State.currentFile && State.currentFile.path) || "",
      name: (State.currentFile && State.currentFile.name) || name
    }, name)
  };
  const idx = State.tabs.findIndex((t) => t && t.id === id);
  if (idx >= 0) {
    const prev = State.tabs[idx];
    State.tabs[idx] = snap;
    // Drop blob URLs that the previous snap held and nobody else needs
    if (prev && prev.mediaUrls) {
      const keep = collectKeptMediaUrls({ exceptTabId: null, includeState: true });
      for (const u of Object.values(snap.mediaUrls || {})) if (u) keep.add(u);
      revokeUrlSet(Object.values(prev.mediaUrls || {}), keep);
    }
  } else {
    State.tabs.push(snap);
  }
  return snap;
}
function restoreTab(tab) {
  if (!tab || !State.editor) return false;
  stopAutosaveTimer();
  try {
    closeLiveSync();
  } catch {
  }
  State.activeTabId = tab.id;
  State.mediaUrls = Object.assign({}, tab.mediaUrls || {});
  State.mediaFiles = Object.assign({}, tab.mediaFiles || {});
  State.saveMode = tab.saveMode || "unknown";
  State.activeThreadId = tab.activeThreadId || null;
  State.replyDrafts = Object.assign({}, tab.replyDrafts || {});
  State.references = normalizeReferenceManifest(tab.references || emptyReferenceManifest());
  State.citationNavigation = { key: "", pos: null, ordinal: 0, total: 0 };
  State.reattachTarget = null;
  State.annotations = [];
  State._suspendAnnValidate = true;
  try {
    try {
      State.editor.commands.setContent(tab.html || "<p></p>", false);
    } catch (e) {
      console.warn("[tabs] setContent fail", e);
      State.editor.commands.setContent("<p></p>", false);
    }
  } finally {
    State._suspendAnnValidate = false;
  }
  clearPmHistory();
  resetHistory();
  State.annotations = JSON.parse(JSON.stringify(tab.annotations || []));
  try {
    rebuildAnnotationMarks();
  } catch (e) {
    console.warn("[tabs] rebuild marks", e);
  }
  State.currentFile = tab.currentFile ? {
    documentId: tab.currentFile.documentId || tab.id,
    name: tab.currentFile.name || tab.name,
    content: tab.currentFile.content || "",
    dirty: !!tab.dirty,
    dirtyGen: tab.currentFile.dirtyGen || 0,
    handle: tab.handle || tab.currentFile.handle || null,
    path: tab.currentFile.path || null,
    annotations: null
  } : { documentId: tab.id, name: tab.name, content: "", dirty: !!tab.dirty, dirtyGen: 0, handle: tab.handle || null };
  if (tab.dirty) markDirty();
  else markClean();
  const nameEl = $("#current-file-name");
  if (nameEl) nameEl.textContent = tab.name || "\u672A\u547D\u540D";
  renderCommentList();
  try {
    refreshAnnotationImageDecos();
  } catch {
  }
  renderOutline();
  renderDocTabs();
  updateDocMeta({ immediate: true });
  setStatus("\u5DF2\u5207\u6362", tab.name || "");
  try {
    openLiveSyncForCurrentDocument();
  } catch {
  }
  try {
    startAutosaveTimer();
  } catch {
  }
  try {
    syncAutosaveToggleUi();
  } catch {
  }
  try {
    const src = sanitizeSupervisionSource(tab.supervisionSource || {
      path: (tab.currentFile && tab.currentFile.path) || "",
      name: tab.name || ""
    }, tab.name || "");
    State.externalWatchPath = src.path || "";
    // Never restore tokens across tabs; re-fetch via /session.
    State.externalWatchToken = "";
  } catch {
    State.externalWatchPath = "";
    State.externalWatchToken = "";
  }
  try {
    startSupervisionPolling();
  } catch {
  }
  return true;
}
function switchToTab(tabId) {
  if (!tabId || tabId === State.activeTabId) return false;
  const target = State.tabs.find((t) => t && t.id === tabId);
  if (!target) return false;
  try {
    closeLiveSync();
  } catch {
  }
  try {
    getSupervisionPoller().stop();
  } catch {
  }
  try {
    clearSupervisionLocal();
  } catch {
  }
  void queueActiveDraftPersist();
  snapshotActiveTab();
  const ok = restoreTab(target);
  scheduleWorkspaceSessionPersist();
  // Version drawer follows the active document (per-documentId history).
  try {
    const drawer = document.querySelector("#version-history-drawer");
    if (drawer && !drawer.classList.contains("hidden")) renderVersionHistory();
  } catch (_) {}
  return ok;
}
function closeTab(tabId) {
  if (!tabId) return false;
  if (tabId === State.activeTabId) {
    void queueActiveDraftPersist();
    snapshotActiveTab();
  }
  const tab = State.tabs.find((t) => t && t.id === tabId);
  if (!tab) return false;
  if (tab.dirty) {
    if (!confirm(`\u300C${tab.name}\u300D\u6709\u672A\u786E\u8BA4\u4FDD\u5B58\u7684\u4FEE\u6539\uFF08\u76F8\u5BF9\u4E0A\u6B21 Ctrl+S\uFF09\uFF0C\u786E\u5B9A\u5173\u95ED\uFF1F`)) return false;
  }
  const wasActive = State.activeTabId === tabId;
  State.tabs = State.tabs.filter((t) => t && t.id !== tabId);
  revokeTabMedia(tab, { dyingState: wasActive });
  if (wasActive) {
    State.mediaUrls = {};
    State.mediaFiles = {};
    if (State.tabs.length > 0) {
      restoreTab(State.tabs[State.tabs.length - 1]);
    } else {
      State.activeTabId = null;
      State.currentFile = null;
      State.annotations = [];
      resetHistory();
      try {
        State.annotations = [];
        State._suspendAnnValidate = true;
        try {
          State.editor.commands.setContent("", false);
        } finally {
          State._suspendAnnValidate = false;
        }
        clearPmHistory();
      } catch {
      }
      markClean();
      const nameEl = $("#current-file-name");
      if (nameEl) nameEl.textContent = "\u672A\u6253\u5F00\u6587\u6863";
      renderCommentList();
      renderOutline();
      setStatus("\u5DF2\u5173\u95ED\u5168\u90E8\u6807\u7B7E");
    }
  }
  renderDocTabs();
  if (!State.tabs.length) {
    HandleStore.removeWorkspaceSession().catch(() => {});
  } else {
    scheduleWorkspaceSessionPersist();
  }
  return true;
}
function openNewTabBlank() {
  void queueActiveDraftPersist();
  snapshotActiveTab();
  State.activeTabId = genTabId();
  stopAutosaveTimer();
  revokeMediaUrls();
  State.annotations = [];
  State.references = emptyReferenceManifest();
  State.citationNavigation = { key: "", pos: null, ordinal: 0, total: 0 };
  State.activeThreadId = null;
  State._suspendAnnValidate = true;
  try {
    State.editor.commands.setContent("<h1>\u65B0\u6587\u6863</h1><p></p>", false);
  } finally {
    State._suspendAnnValidate = false;
  }
  resetHistory();
  clearPmHistory();
  State.currentFile = { documentId: State.activeTabId, name: "untitled.md", content: "", annotations: null, dirty: true };
  State.saveMode = "unknown";
  State.activeThreadId = null;
  markDirty();
  renderCommentList();
  renderOutline();
  snapshotActiveTab();
  renderDocTabs();
  scheduleWorkspaceSessionPersist();
  setStatus("\u65B0\u5EFA\u6807\u7B7E");
}
function findTabByName(name) {
  if (!name) return null;
  return State.tabs.find((t) => t && t.name === name) || null;
}
function findTabByDocument(documentId, name) {
  const pure = findTabByDocumentPure(State.tabs, documentId, name);
  if (pure) return pure;
  if (documentId) {
    const byId = State.tabs.find((tab) => tab && (tab.currentFile?.documentId || tab.id) === documentId);
    if (byId) return byId;
  }
  if (!name) return null;
  return findTabByName(name);
}
function fingerprintDocument(name, content) {
  // Prefer module pure helper; keep stable file- prefix for existing tests
  const pure = fingerprintDocumentPure(name, content);
  if (pure && String(pure).startsWith("doc-")) {
    const input = `${name || ""}\0${content || ""}`;
    return `file-${String(pure).slice(4)}-${input.length.toString(16)}`;
  }
  const input = `${name || ""}\0${content || ""}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `file-${(hash >>> 0).toString(16).padStart(8, "0")}-${input.length.toString(16)}`;
}
async function resolveDocumentId({ name, content, handle, documentId } = {}) {
  if (documentId) return documentId;
  if (handle) {
    for (const tab of State.tabs || []) {
      const tabHandle = tab?.handle || tab?.currentFile?.handle;
      if (!tabHandle) continue;
      try {
        if (tabHandle === handle || typeof tabHandle.isSameEntry === "function" && await tabHandle.isSameEntry(handle)) {
          return tab.currentFile?.documentId || tab.id;
        }
      } catch {
      }
    }
    return uuid();
  }
  return fingerprintDocument(name, content);
}
/**
 * Claim a tab slot before loading document content from disk/memory.
 * Modes:
 *  - reload-same: already the active document → keep activeTabId
 *  - reuse-tab: same document already open in another tab → snapshot current, claim that id
 *  - reuse-blank: active is empty placeholder → keep id, no extra tab
 *  - new-tab: snapshot current (if any), allocate fresh id
 *
 * Prefer stable documentId; basename fallback keeps legacy single-file reopen UX.
 */
function prepareOpenDocument(name, documentId = null) {
  if (State.currentFile && State.activeTabId) {
    const sameId = documentId && State.currentFile.documentId === documentId;
    const sameName = !documentId && name && State.currentFile.name === name;
    if (sameId || sameName) {
      return { mode: "reload-same", tabId: State.activeTabId };
    }
  }
  const existing = findTabByDocument(documentId, name);
  if (existing) {
    if (State.activeTabId && State.activeTabId !== existing.id) {
      snapshotActiveTab();
    }
    State.activeTabId = existing.id;
    State.replyDrafts = Object.assign({}, existing.replyDrafts || {});
    State.activeThreadId = existing.activeThreadId || null;
    return { mode: "reuse-tab", tab: existing, tabId: existing.id };
  }
  if (State.activeTabId) {
    if (isActivePlaceholderTab()) {
      return { mode: "reuse-blank", tabId: State.activeTabId };
    }
    snapshotActiveTab();
  }
  State.activeTabId = genTabId();
  return { mode: "new-tab", tabId: State.activeTabId };
}
/** Persist FileSystemFileHandle + last-opened name (IDB). UUID primary key + basename fallback. */
async function rememberOpenedFile(handleOrName, handle = null) {
  const name = typeof handleOrName === "string" ? handleOrName : handleOrName && handleOrName.name;
  const h = handle || (handleOrName && typeof handleOrName !== "string" ? handleOrName : null);
  if (!name) return;
  const documentId = State.currentFile?.documentId || uuid();
  if (State.currentFile && !State.currentFile.documentId) {
    State.currentFile.documentId = documentId;
  }
  try {
    if (h) await HandleStore.putFile(name, h, documentId);
    await HandleStore.putLastFile(name, documentId);
    try {
      refreshFileListDropdown();
    } catch {
    }
  } catch (e) {
    console.warn("[rememberOpenedFile] failed:", e);
  }
  return documentId;
}
/**
 * Shared post-read path for .mentor / .md open:
 * prepare tab → swap media → load editor → attach handle/saveMode → remember handle.
 */
async function activateOpenedDocument({
  name,
  content,
  annotations = null,
  references = null,
  mediaFiles = null,
  handle = null,
  documentId = null,
  saveMode = "unknown",
  quiet = false,
  // preferDraft default false: intentional open uses disk. tryReconnect passes true for crash recovery.
  preferDraft = false,
  forceDisk = false,
  // disk file lastModified (ms) when opened from handle — used to beat stale IDB drafts
  diskMtime = null,
  structuralHtml = null,
  archiveVerification = null
} = {}) {
  if (!name) throw new Error("activateOpenedDocument: name required");
  const resolvedDocumentId = await resolveDocumentId({ name, content, handle, documentId });
  stopAutosaveTimer();
  prepareOpenDocument(name, resolvedDocumentId);
  // Snapshot of previous tab already kept its media; clear active state media only
  revokeMediaUrls();
  if (mediaFiles && Object.keys(mediaFiles).length > 0) {
    await injectMediaFiles(mediaFiles);
  }
  // Crash recovery (preferDraft=true): DraftStore only if draft is newer than disk (or prompt).
  // External tools (fix-mentor) often write the zip while a stale IDB draft still exists —
  // disk mtime wins so AI replies / body edits are not wiped on reconnect.
  let contentOut = content;
  let annotationsOut = annotations;
  let referencesOut = normalizeReferenceManifest(references || emptyReferenceManifest());
  if (preferDraft && !forceDisk) {
    try {
      let draft = await restoreDraftIfAny(resolvedDocumentId, null);
      if (!draft) {
        const byName = await restoreDraftIfAny(null, name);
        if (byName && (!byName.documentId || byName.documentId === resolvedDocumentId || byName.documentId === name)) {
          draft = byName;
        }
      }
      if (!draft) {
        const cached = State.idbCache && (State.idbCache[resolvedDocumentId] || null);
        if (cached && (typeof cached.body === "string" || cached.annotations || cached.sidecar)) {
          draft = {
            documentId: cached.documentId || resolvedDocumentId,
            name: cached.name || name,
            body: cached.body || "",
            annotations: cached.annotations || (cached.sidecar && cached.sidecar.annotations) || [],
            sidecar: cached.sidecar || null,
            updatedAt: cached.updatedAt || 0
          };
        }
      }
      if (draft) {
        const diskBody = typeof content === "string" ? content : "";
        const draftBody = typeof draft.body === "string" ? draft.body : "";
        const draftAnns = draft.annotations || (draft.sidecar && draft.sidecar.annotations) || [];
        const diskAnns = annotations && Array.isArray(annotations.annotations)
          ? annotations.annotations
          : Array.isArray(annotations) ? annotations : [];
        let decision = resolveDraftConflict({
          diskBody,
          diskAnns,
          diskMtime,
          draft,
          forceDisk: false
        });
        if (decision === "prompt") {
          // Default = disk (safer when external tools may have written). OK = disk, Cancel = draft.
          let useDisk = true;
          try {
            useDisk = confirm(
              "\u78C1\u76D8\u4E0E\u672C\u5730\u8349\u7A3F\u4E0D\u4E00\u81F4\u3002\n\n" +
              "\u786E\u5B9A = \u4F7F\u7528\u78C1\u76D8\uFF08\u63A8\u8350\uFF1B\u5916\u90E8\u5DE5\u5177\u521A\u6539\u8FC7\u65F6\u9009\u8FD9\u4E2A\uFF09\n" +
              "\u53D6\u6D88 = \u4F7F\u7528\u672C\u5730\u8349\u7A3F"
            );
          } catch (_) {
            useDisk = true;
          }
          decision = useDisk ? "disk" : "draft";
        }
        if (decision === "draft") {
          const bodyDiffers = draftBody.length > 0 && draftBody !== diskBody;
          if (bodyDiffers) contentOut = draftBody;
          if (draftAnns.length > 0) {
            annotationsOut = draft.sidecar && draft.sidecar.annotations
              ? draft.sidecar
              : {
                  version: "1",
                  document: name,
                  updatedAt: new Date(draft.updatedAt || Date.now()).toISOString(),
                  author: { id: State.authorId, name: State.author },
                  annotations: draftAnns
                };
          }
          if (draft.references) referencesOut = normalizeReferenceManifest(draft.references);
          console.log(
            `[Draft] preferred unsaved draft over disk (updatedAt=${draft.updatedAt || 0}, diskMtime=${diskMtime})`
          );
          try {
            showToast("\u5DF2\u4ECE\u672C\u5730\u8349\u7A3F\u6062\u590D\u672A\u4FDD\u5B58\u4FEE\u6539", 2800);
          } catch (_) {}
        } else {
          console.log(
            `[Draft] kept disk over draft (decision=disk, draftAt=${draft.updatedAt || 0}, diskMtime=${diskMtime})`
          );
          try {
            const did = draft.documentId || resolvedDocumentId;
            if (did) await DraftStore.deleteDraft(did);
            if (State.idbCache) {
              if (resolvedDocumentId) delete State.idbCache[resolvedDocumentId];
              if (name) delete State.idbCache[name];
            }
          } catch (eDel) {
            console.warn("[Draft] delete stale draft failed:", eDel);
          }
        }
      }
    } catch (e) {
      console.warn("[Draft] prefer-on-open failed:", e);
    }
  }
  loadMarkdownIntoEditor(name, contentOut, annotationsOut, {
    handle,
    saveMode,
    documentId: resolvedDocumentId,
    alreadyPrepared: true,
    preferDraft: false,
    forceDisk,
    references: referencesOut,
    structuralHtml,
    archiveVerification
  });
  if (handle) {
    await rememberOpenedFile(handle);
  }
  try {
    startAutosaveTimer();
  } catch {
  }
  if (!quiet) {
    renderFilePaneCurrent();
  }
  scheduleWorkspaceSessionPersist();
  return { name, saveMode, documentId: resolvedDocumentId };
}
function renderDocTabs() {
  const bar = $("#doc-tabs");
  if (!bar) return;
  if (State.activeTabId && State.currentFile && State.currentFile.name) {
    const exists = State.tabs.some((t) => t && t.id === State.activeTabId);
    if (!exists) snapshotActiveTab();
    else {
      const t = State.tabs.find((x) => x && x.id === State.activeTabId);
      if (t) {
        t.name = State.currentFile.name;
        t.dirty = !!State.currentFile.dirty;
      }
    }
  }
  const tabs = State.tabs.slice();
  if (tabs.length === 0 && State.currentFile && State.currentFile.name) {
    snapshotActiveTab();
  }
  const list = State.tabs;
  bar.innerHTML = "";
  bar.classList.toggle("is-empty", list.length === 0);
  for (const t of list) {
    if (!t) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doc-tab" + (t.id === State.activeTabId ? " is-active" : "") + (t.dirty ? " is-dirty" : "");
    btn.dataset.tabId = t.id;
    btn.title = t.name + (t.dirty ? " (\u672A\u4FDD\u5B58)" : "");
    const label = document.createElement("span");
    label.className = "doc-tab-label";
    label.textContent = t.name || "\u672A\u547D\u540D";
    btn.appendChild(label);
    const x = document.createElement("span");
    x.className = "doc-tab-close";
    x.setAttribute("role", "button");
    x.setAttribute("aria-label", "\u5173\u95ED");
    x.textContent = "\xD7";
    btn.appendChild(x);
    btn.addEventListener("click", (e) => {
      if (e.target.closest(".doc-tab-close")) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(t.id);
        return;
      }
      switchToTab(t.id);
    });
    bar.appendChild(btn);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.id = "doc-tab-new";
  add.className = "doc-tab-new";
  add.title = "\u65B0\u5EFA\u6807\u7B7E\u9875";
  add.setAttribute("aria-label", "\u65B0\u5EFA\u6807\u7B7E\u9875");
  add.textContent = "+";
  add.addEventListener("click", () => openNewTabBlank());
  bar.appendChild(add);
}
function setupDocTabs() {
  renderDocTabs();
}
/**
 * Load markdown (+ optional annotations) into the editor.
 * options:
 *  - handle: FileSystemFileHandle for write-back
 *  - saveMode: 'mentor-handle' | 'mentor-download' | 'handle' | 'download' | ...
 *  - alreadyPrepared: skip prepareOpenDocument (caller already claimed a tab + media)
 */
function sanitizeStructuralHtml(html) {
  if (typeof html !== "string") return "";
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    doc.querySelectorAll("script,style,iframe,object,embed").forEach((el) => el.remove());
    doc.querySelectorAll("*").forEach((el) => {
      for (const attr of Array.from(el.attributes || [])) {
        const n = String(attr.name || "").toLowerCase();
        if (n.startsWith("on") || n === "srcdoc") el.removeAttribute(attr.name);
      }
    });
    return doc.body ? doc.body.innerHTML : "";
  } catch (_) {
    return String(html);
  }
}

function collectEmbeddedAnnotationRanges(doc, markType) {
  const byId = new Map();
  if (!doc || !markType) return byId;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks || []) {
      if (mark.type !== markType || !mark.attrs || !mark.attrs.threadId) continue;
      const list = byId.get(mark.attrs.threadId) || [];
      const next = { from: pos, to: pos + node.nodeSize, text: node.text || "" };
      const last = list[list.length - 1];
      if (last && last.to === next.from) {
        last.to = next.to;
        last.text += next.text;
      } else {
        list.push(next);
      }
      byId.set(mark.attrs.threadId, list);
    }
  });
  return byId;
}

function loadMarkdownIntoEditor(name, content, annotationsData = null, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const fileHandle = opts.handle || null;
  const saveModeOpt = opts.saveMode != null ? opts.saveMode : null;
  const alreadyPrepared = !!opts.alreadyPrepared;
  const documentId = opts.documentId || null;
  const structuralHtmlRaw = typeof opts.structuralHtml === "string" ? opts.structuralHtml : null;
  const structuralHtml = structuralHtmlRaw ? sanitizeStructuralHtml(structuralHtmlRaw) : null;
  const archiveVerification = opts.archiveVerification || null;
  let useStructuralHtml = !!(structuralHtml && archiveVerification && archiveVerification.usable);
  let preservedTabThreadId = null;
  let preservedTabAnnotations = null;
  if (opts.references !== undefined) {
    State.references = normalizeReferenceManifest(opts.references);
  }
  State.citationNavigation = { key: "", pos: null, ordinal: 0, total: 0 };
  if (annotationsData && annotationsData.annotations) {
    const schemaReport = _validateSidecar(annotationsData.annotations);
    if (schemaReport.errors.length > 0) {
      throw new Error(`annotations.json \u6570\u636E\u65E0\u6548: ${schemaReport.errors[0]}`);
    }
  }
  $("#status-right").textContent = "\u52A0\u8F7D\u4E2D...";
  if (!alreadyPrepared) {
    stopAutosaveTimer();
    const preparation = prepareOpenDocument(name, documentId);
    if (preparation.mode === "reuse-tab") {
      preservedTabThreadId = State.activeThreadId || null;
      preservedTabAnnotations = preparation.tab && Array.isArray(preparation.tab.annotations)
        ? { annotations: preparation.tab.annotations }
        : null;
    }
  }
  $("#current-file-name").textContent = name;
  const sourceEl = $("#source-view");
  // P-reload: when annotationsData is null, restore sidecar from idbCache by name/documentId
  // (original behavior). Body draft only when preferDraft/restoreDraft/empty content.
  let draftBody = null;
  const cached = State.idbCache && (
    (documentId && State.idbCache[documentId]) ||
    State.idbCache[name]
  );
  if (!opts.forceDisk && cached) {
    if (!annotationsData) {
      if (cached.sidecar && Array.isArray(cached.sidecar.annotations)) {
        annotationsData = cached.sidecar;
        console.log(`[P-reload] IDB \u6062\u590D ${annotationsData.annotations.length} \u4E2A\u6279\u6CE8 (${name})`);
      } else if (Array.isArray(cached.annotations)) {
        annotationsData = { annotations: cached.annotations };
        console.log(`[P-reload] IDB \u6062\u590D ${annotationsData.annotations.length} \u4E2A\u6279\u6CE8 (${name})`);
      }
    }
    const wantBodyDraft = !!(opts.preferDraft || opts.restoreDraft || !content || content === "");
    if (wantBodyDraft && typeof cached.body === "string" && cached.body.length > 0) {
      draftBody = cached.body;
      console.log(`[P-reload] IDB draft body restore (${draftBody.length} chars)`);
    }
  }
  if (!annotationsData && preservedTabAnnotations) {
    annotationsData = preservedTabAnnotations;
  }
  if (draftBody != null) content = draftBody;
  let useHtml = useStructuralHtml;
  let structuralReady = structuralHtml;
  if (useHtml && structuralReady) {
    structuralReady = htmlWithBlobUrls(structuralReady, State.mediaUrls, content || "");
    if (structuralHtmlHasUnresolvedBlobs(structuralReady, State.mediaUrls)) {
      // Still dead blobs and no md mapping — fall back to markdown body so figures load from media/*
      console.warn("[mentor-archive] structural html has unresolved blob: image src; falling back to markdown");
      useHtml = false;
      State._archiveRestoreMode = "markdown-fallback-dead-blob";
    }
  }
  if (useHtml) {
    State._archiveRestoreMode = "html";
  } else if (State._archiveRestoreMode === "markdown-fallback-dead-blob") {
    // keep
  } else if (archiveVerification && archiveVerification.reason) {
    State._archiveRestoreMode = "markdown-fallback";
  } else {
    State._archiveRestoreMode = "legacy";
  }
  State._archiveVerification = archiveVerification || null;
  if (!useHtml && archiveVerification && typeof archiveVerification.reason === "string" && archiveVerification.reason.endsWith("-mismatch")) {
    console.warn("[mentor-archive] ignored stale document.html:", archiveVerification.reason);
  }
  const html = useHtml ? structuralReady : markdownToHtml(content, State.mediaUrls);
  // remaining load path must follow actual decision
  useStructuralHtml = useHtml;
  State.annotations = [];
  State.activeThreadId = null;
  State._suspendAnnValidate = true;
  try {
    State.editor.commands.setContent(html, false);
      } finally {
        State._suspendAnnValidate = false;
      }
      reconcileCitationNodes();
      try { reconcileBibliographyNode(); } catch (_) {}
      if (State.renderMode === "source") {
    const md2 = useStructuralHtml ? (content || htmlToMarkdown(html)) : htmlToMarkdown(html);
    sourceEl.innerText = md2;
  }
  resetHistory();
  clearPmHistory();
  if (useStructuralHtml && annotationsData && annotationsData.annotations) {
    const markType = State.editor.schema.marks.annotation;
    const doc5 = State.editor.state.doc;
    const embedded = collectEmbeddedAnnotationRanges(doc5, markType);
    const schemaReport = _validateSidecar(annotationsData.annotations);
    if (schemaReport.warnings.length > 0) {
      schemaReport.warnings.forEach((w) => showToast(`⚠ 侧车数据警告: ${w}`, 5e3));
    }
    const validAnns = annotationsData.annotations.filter((a) => a && a.threadId).map(prepareAnnotationForMarkerMode);
    const seenThreadIds = new Set();
    for (const ann of validAnns) {
      const isDuplicate = ann.threadId && seenThreadIds.has(ann.threadId);
      if (ann.threadId) seenThreadIds.add(ann.threadId);
      const ranges = !isDuplicate ? (embedded.get(ann.threadId) || []) : [];
      const hasImgAnchors = Array.isArray(ann.imageAnchors) && ann.imageAnchors.length > 0;
      const pureImageLabel = !!(ann.text && (/^\[图片\]$/i.test(String(ann.text).trim()) || /^\[image\]$/i.test(String(ann.text).trim())));
      const savedStatus = ann.anchor && ann.anchor.status;
      const intentionallyUnattached = ["ambiguous", "orphaned", "collision", "image-missing"].includes(savedStatus);
      if (isDuplicate) {
        State.annotations.push({
          ...ann,
          authorColor: annotationAuthorColor(ann),
          range: null,
          ranges: [],
          invalid: true,
          invalidReason: "duplicate-threadId"
        });
        continue;
      }
      if (hasImgAnchors && (!ranges.length || pureImageLabel)) {
        const thread = {
          ...ann,
          authorColor: annotationAuthorColor(ann),
          imageAnchors: ann.imageAnchors.map((a) => ({ ...a })),
          invalid: false,
          deleted: false,
          fuzzy: false,
          invalidReason: void 0
        };
        const sync = resyncImageAnchors(thread, doc5);
        if (sync.resolved > 0 && thread.imageAnchors && thread.imageAnchors.length) {
          if (ranges.length) {
            thread.ranges = ranges.map((r) => ({ from: r.from, to: r.to }));
            thread.range = { from: ranges[0].from, to: ranges[ranges.length - 1].to };
            const parts = ranges.map((r) => r.text).filter(Boolean);
            if (parts.length) thread.text = parts.join(" ");
            syncThreadAnchorEvidence(thread, doc5, thread.range, { exact: thread.text, status: "attached", confidence: 1 });
          }
          State.annotations.push(thread);
          continue;
        }
        State.annotations.push({ ...thread, range: null, invalid: true, invalidReason: "image-deleted" });
        continue;
      }
      if (ranges.length) {
        const thread = {
          ...ann,
          authorColor: annotationAuthorColor(ann),
          ranges: ranges.map((r) => ({ from: r.from, to: r.to })),
          range: { from: ranges[0].from, to: ranges[ranges.length - 1].to },
          invalid: false,
          deleted: false,
          fuzzy: false,
          invalidReason: void 0
        };
        const parts = ranges.map((r) => r.text).filter(Boolean);
        if (parts.length) thread.text = parts.join(" ");
        syncThreadAnchorEvidence(thread, doc5, thread.range, {
          exact: thread.text,
          status: "attached",
          confidence: 1
        });
        if (hasImgAnchors) {
          thread.imageAnchors = ann.imageAnchors.map((a) => ({ ...a }));
          resyncImageAnchors(thread, doc5);
        }
        State.annotations.push(thread);
        continue;
      }
      if (intentionallyUnattached) {
        State.annotations.push({
          ...ann,
          authorColor: annotationAuthorColor(ann),
          range: null,
          ranges: [],
          invalid: true,
          fuzzy: savedStatus === "ambiguous" || !!ann.fuzzy,
          deleted: false,
          invalidReason: ann.invalidReason || savedStatus
        });
        continue;
      }
      // HTML verified but mark missing: do NOT text-search.
      const thr = {
        ...ann,
        authorColor: annotationAuthorColor(ann),
        range: null,
        ranges: [],
        invalid: true,
        fuzzy: false,
        deleted: false,
        invalidReason: "structural-mark-missing"
      };
      thr.anchor = ann.anchor && typeof ann.anchor === "object"
        ? { ...ann.anchor, status: "orphaned", confidence: 0, updatedAt: nowISO() }
        : {
            version: "1",
            quote: { exact: ann.text || "", prefix: ann.prefix || "", suffix: ann.suffix || "" },
            status: "orphaned",
            confidence: 0,
            updatedAt: nowISO()
          };
      State.annotations.push(thr);
    }
    // Ghost marks in HTML without sidecar threads are left as schema marks;
    // collectLiveAnnotationAudit reports mark-unknown-thread on save/open.
  } else if (annotationsData && annotationsData.annotations) {
    const schemaReport = _validateSidecar(annotationsData.annotations);
    if (schemaReport.warnings.length > 0) {
      schemaReport.warnings.forEach((w) => showToast(`\u26A0 \u4FA7\u8F66\u6570\u636E\u8B66\u544A: ${w}`, 5e3));
      console.warn("[P0-B] \u4FA7\u8F66\u9A8C\u8BC1:", schemaReport);
    }
    const validAnns = annotationsData.annotations.filter((a) => a && a.threadId).map(prepareAnnotationForMarkerMode);
    const cap = State.maxAnnotations || 0;
    if (cap > 0 && validAnns.length > cap) {
      showToast(`\u26A0 \u6587\u6863\u542B ${validAnns.length} \u6761\u6279\u6CE8, \u8D85\u51FA\u65B0\u5EFA\u4E0A\u9650 ${cap}. \u5DF2\u65E0\u635F\u52A0\u8F7D\u5168\u90E8\u6279\u6CE8`, 6e3);
      setStatus("\u5DF2\u65E0\u635F\u52A0\u8F7D", `${validAnns.length} \u6761\u6279\u6CE8 \xB7 \u4E0A\u9650\u4EC5\u9650\u5236\u65B0\u5EFA`);
    } else if (cap > 0 && validAnns.length > cap * 0.8) {
      showToast(`\u26A0 \u6587\u6863\u542B ${validAnns.length}/${cap} \u6761\u6279\u6CE8, \u63A5\u8FD1\u4E0A\u9650. \u2699 \u53EF\u8C03\u6574`, 4e3);
    }
    const annsToProcess = validAnns;
    const seenThreadIds = /* @__PURE__ */ new Set();
    const plainForAnchorSet = State.editor.state.doc.textBetween(0, State.editor.state.doc.content.size, " ");
    const anchorSetJobs = validAnns.filter((ann) => {
      if (!ann || !ann.threadId || !ann.text) return false;
      if (Array.isArray(ann.imageAnchors) && ann.imageAnchors.length) return false;
      if (Array.isArray(ann.ranges) && ann.ranges.length > 1) return false;
      // Legacy sidecars may carry an expanded range while `text` still contains
      // the shorter quote (e.g. nested-extension comments). Those ranges are
      // intentionally distinct and must not be collapsed into one quote claim.
      const saved = ann.anchor && ann.anchor.position || ann.range;
      if (saved && typeof saved.from === "number" && typeof saved.to === "number" && saved.to - saved.from !== String(ann.text).length) return false;
      return true;
    });
    const anchorSet = resolveAnchorSet(plainForAnchorSet, anchorSetJobs);
    const anchorSetById = new Map(anchorSetJobs.map((ann) => [ann.threadId, ann]));
    const anchorSetCollisionIds = new Set();
    for (const collision of anchorSet.collisions || []) {
      const ann = anchorSetById.get(collision.threadId);
      const saved = ann && (ann.anchor && ann.anchor.position || ann.range);
      const savedFrom = saved && typeof saved.from === "number"
        ? State.editor.state.doc.textBetween(0, Math.max(0, Math.min(State.editor.state.doc.content.size, saved.from)), " ").length
        : null;
      // If two comments intentionally shared a healthy live range, preserve them.
      // A collision is dangerous only when saved identity does not corroborate the
      // shared candidate (external/legacy duplicate claim).
      if (savedFrom == null || savedFrom !== collision.range.from || ann.invalid || ann.deleted || ann.fuzzy) {
        anchorSetCollisionIds.add(collision.threadId);
      }
    }
    for (const ann of annsToProcess) {
      const isDuplicate = ann.threadId && seenThreadIds.has(ann.threadId);
      if (ann.threadId) seenThreadIds.add(ann.threadId);
      const isAnchorCollision = !!(ann.threadId && anchorSetCollisionIds.has(ann.threadId));
      const isIncomplete = !ann.threadId || !ann.text;
      const doc5 = State.editor.state.doc;
      const hasImgAnchors = Array.isArray(ann.imageAnchors) && ann.imageAnchors.length > 0;
      const hasTextRanges = Array.isArray(ann.ranges) && ann.ranges.length > 1;
      const resolveSavedRanges = () => {
        if (!hasTextRanges) return null;
        const live = [];
        const used = new Set();
        for (const saved of ann.ranges) {
          if (!saved || typeof saved.from !== "number" || typeof saved.to !== "number" || saved.from >= saved.to) return null;
          const expected = (() => {
            if (saved.text != null && String(saved.text)) return String(saved.text);
            // Legacy sidecars lack per-range text. Use the saved slice only when
            // it still belongs to the aggregate exact text; otherwise derive the
            // component by ordered whitespace-separated parts.
            try {
              const atSaved = doc5.textBetween(saved.from, saved.to, " ");
              if (atSaved && String(ann.text || "").includes(atSaved)) return atSaved;
            } catch (_) {}
            const parts = String(ann.text || "").split(/\s+/).filter(Boolean);
            const idx = ann.ranges.indexOf(saved);
            return parts[idx] || "";
          })();
          if (!expected) return null;
          const candidate = findAnnotationRange(doc5, {
            text: expected,
            prefix: saved.prefix || "",
            suffix: saved.suffix || "",
            range: saved,
            anchor: { position: saved }
          });
          if (!candidate || candidate.ambiguous || typeof candidate.from !== "number" || candidate.from >= candidate.to) return null;
          const key = `${candidate.from}:${candidate.to}`;
          if (used.has(key)) return null;
          used.add(key);
          live.push({ from: candidate.from, to: candidate.to });
        }
        return live.length === ann.ranges.length ? live : null;
      };
      const pureImageLabel = !!(ann.text && (/^\[图片\]$/i.test(String(ann.text).trim()) || /^\[image\]$/i.test(String(ann.text).trim())));
      if (!isDuplicate && !isIncomplete && hasImgAnchors) {
        const thread = {
          ...ann,
          authorColor: annotationAuthorColor(ann),
          imageAnchors: ann.imageAnchors.map((a) => ({ ...a })),
          invalid: false,
          deleted: false,
          fuzzy: false,
          invalidReason: void 0
        };
        const sync = resyncImageAnchors(thread, doc5);
        if (sync.resolved > 0 && thread.imageAnchors && thread.imageAnchors.length) {
          State.annotations.push(thread);
          const pure = !thread.ranges || !thread.ranges.length;
          if (!pure && thread.range && typeof thread.range.from === "number") {
            const tr2 = State.editor.state.tr;
            tr2.addMark(
              thread.range.from,
              thread.range.to,
              State.editor.schema.marks.annotation.create(annotationMarkAttrs(thread))
            );
            tr2.setMeta("addToHistory", false);
            tr2.setMeta("__activeMarkSync", true);
            State.editor.view.dispatch(tr2);
          }
          continue;
        }
        State.annotations.push({
          ...thread,
          range: null,
          invalid: true,
          invalidReason: "image-deleted"
        });
        continue;
      }
      if (isAnchorCollision) {
        const thr = {
          ...ann,
          authorColor: annotationAuthorColor(ann),
          range: null,
          invalid: true,
          fuzzy: true,
          deleted: false,
          invalidReason: "collision"
        };
        thr.anchor = ann.anchor && typeof ann.anchor === "object"
          ? { ...ann.anchor, status: "collision", confidence: 0 }
          : {
              version: "1",
              quote: { exact: ann.text || "", prefix: ann.prefix || "", suffix: ann.suffix || "" },
              status: "collision",
              confidence: 0,
              updatedAt: nowISO()
            };
        State.annotations.push(thr);
        continue;
      }
      const resolvedTextRanges = !isDuplicate && !isIncomplete ? resolveSavedRanges() : null;
      if (resolvedTextRanges) {
        const first = resolvedTextRanges[0];
        const last = resolvedTextRanges[resolvedTextRanges.length - 1];
        const thread = {
          ...ann,
          authorColor: annotationAuthorColor(ann),
          ranges: resolvedTextRanges,
          range: { from: first.from, to: last.to },
          invalid: false,
          deleted: false,
          fuzzy: false,
          invalidReason: void 0
        };
        const parts = resolvedTextRanges.map((r) => {
          try { return doc5.textBetween(r.from, r.to, " "); } catch (_) { return ""; }
        }).filter(Boolean);
        if (parts.length) thread.text = parts.join(" ");
        syncThreadAnchorEvidence(thread, doc5, thread.range, {
          exact: thread.text,
          status: "attached",
          confidence: 1
        });
        State.annotations.push(thread);
        const tr2 = State.editor.state.tr;
        const mark = State.editor.schema.marks.annotation.create(annotationMarkAttrs(thread));
        for (const r of resolvedTextRanges) tr2.addMark(r.from, r.to, mark);
        tr2.setMeta("addToHistory", false);
        tr2.setMeta("__activeMarkSync", true);
        State.editor.view.dispatch(tr2);
        continue;
      }
      const positions = isDuplicate || isAnchorCollision || isIncomplete || hasTextRanges ? null : findAnnotationRange(doc5, ann);
            if (positions && positions.ambiguous) {
              const thr = {
                ...ann,
                authorColor: annotationAuthorColor(ann),
                range: null,
                invalid: true,
                fuzzy: true,
                deleted: false,
                invalidReason: "ambiguous"
              };
              if (thr.anchor && typeof thr.anchor === "object") {
                thr.anchor = { ...thr.anchor, status: "ambiguous" };
              } else {
                thr.anchor = {
                  version: "1",
                  quote: { exact: ann.text || "", prefix: ann.prefix || "", suffix: ann.suffix || "" },
                  status: "ambiguous",
                  confidence: 0,
                  updatedAt: nowISO()
                };
              }
              State.annotations.push(thr);
            } else if (positions && typeof positions.from === "number" && typeof positions.to === "number") {
              const thread = {
                ...ann,
                authorColor: annotationAuthorColor(ann),
                range: { from: positions.from, to: positions.to },
                fuzzy: !!positions.fuzzy
                // P1-A: 降级匹配时标 fuzzy
              };
              if (thread.anchor && typeof thread.anchor === "object") {
                thread.anchor = {
                  ...thread.anchor,
                  status: positions.fuzzy ? "edited" : "attached",
                  position: {
                    from: positions.from,
                    to: positions.to,
                    startAssoc: 1,
                    endAssoc: -1
                  }
                };
              } else {
                try {
                  const plain = doc5.textBetween(0, doc5.content.size, String.fromCharCode(10), String.fromCharCode(10));
                  const pf = plain.indexOf(ann.text || "");
                  const ev = captureAnchorEvidence(plain, pf >= 0 ? pf : 0, pf >= 0 ? pf + String(ann.text || "").length : 0, { now: nowISO() });
                  ev.position = { from: positions.from, to: positions.to, startAssoc: 1, endAssoc: -1 };
                  ev.quote = { exact: ann.text || "", prefix: ann.prefix || "", suffix: ann.suffix || "" };
                  ev.status = positions.fuzzy ? "edited" : "attached";
                  thread.anchor = ev;
                } catch (_) {}
              }
              if (hasImgAnchors) {
                thread.imageAnchors = ann.imageAnchors.map((a) => ({ ...a }));
                resyncImageAnchors(thread, doc5);
              }
              State.annotations.push(thread);
              const skipMark = pureImageLabel || thread.imageAnchors && thread.imageAnchors.length === 1 && thread.range && thread.imageAnchors[0].from === thread.range.from && thread.imageAnchors[0].to === thread.range.to;
              if (!skipMark) {
                const tr2 = State.editor.state.tr;
                tr2.addMark(
                  positions.from,
                  positions.to,
                  State.editor.schema.marks.annotation.create(annotationMarkAttrs(thread))
                );
                tr2.setMeta("addToHistory", false);
                tr2.setMeta("__activeMarkSync", true);
                State.editor.view.dispatch(tr2);
              }
            } else {
              let reason = isDuplicate ? "duplicate-threadId" : isIncomplete ? "incomplete-data" : "text-not-found";
              if (reason === "text-not-found" && hasTextRanges) {
                reason = "multi-range-not-found";
              }
              if (reason === "text-not-found" && ann.text && ann.text.includes("\n")) {
                reason = "cross-block";
              }
              if (reason === "text-not-found" && pureImageLabel) {
                reason = "image-anchor-missing";
              }
              State.annotations.push({
                ...ann,
                authorColor: annotationAuthorColor(ann),
                range: null,
                invalid: true,
                invalidReason: reason,
                anchor: ann.anchor && typeof ann.anchor === "object"
                  ? { ...ann.anchor, status: "orphaned" }
                  : {
                    version: "1",
                    quote: { exact: ann.text || "", prefix: ann.prefix || "", suffix: ann.suffix || "" },
                    status: "orphaned",
                    confidence: 0,
                    updatedAt: nowISO()
                  }
              });
            }
    }
  }
  // Collision audit: identical ranges are valid for distinct threadIds because
  // overlapping/nested comments are a supported editor feature. Ambiguity is
  // determined by resolver evidence, not by range equality after resolution.
  try {
    const seenThreadIds = new Set();
    for (const t of State.annotations || []) {
      if (!t || !t.threadId) continue;
      if (seenThreadIds.has(t.threadId)) {
        t.invalid = true;
        t.fuzzy = true;
        t.invalidReason = "duplicate-threadId";
        if (t.anchor && typeof t.anchor === "object") t.anchor = { ...t.anchor, status: "ambiguous", confidence: 0 };
      }
      seenThreadIds.add(t.threadId);
    }
  } catch (_) {}
  // Reseed live anchor map from restored threads (never carry pre-setContent orphans)
  try {
    if (State.editor) {
      const trSeed = State.editor.state.tr;
      setAnnotationAnchorResetMeta(trSeed, State.annotations || []);
      trSeed.setMeta("addToHistory", false);
      State.editor.view.dispatch(trSeed);
    }
  } catch (_) {}
  if (preservedTabThreadId && State.annotations.some((a) => a && a.threadId === preservedTabThreadId)) {
    State.activeThreadId = preservedTabThreadId;
  }
  State.currentFile = {
    documentId: documentId || State.activeTabId || fingerprintDocument(name, content),
    name,
    content,
    annotations: annotationsData,
    dirty: false,
    dirtyGen: 0,
    handle: fileHandle || null
  };
  if (saveModeOpt != null) {
    State.saveMode = saveModeOpt;
  }
  markClean();
  $("#current-file-name").textContent = name;
  try {
    refreshFileListDropdown();
  } catch {
  }
  renderCommentList();
    try { syncAnnotationMarkModeAttrs(); } catch (_) {}
    refreshAnnotationImageDecos();
    renderOutline();
    setStatus("\u5DF2\u52A0\u8F7D", "");
    updateDocMeta({ immediate: true });
    if (typeof _openDocChannel === "function") _openDocChannel();
    if (State.currentFile && State.currentFile.handle && typeof State.currentFile.handle.getFile === "function") {
      State.currentFile.handle.getFile().then((f) => {
        State.fileMtime = f.lastModified;
        try {
          if (State.externalWatch) State.externalWatch.lastMtime = f.lastModified || 0;
        } catch (_) {}
      }).catch(() => {
      });
    } else {
      State.fileMtime = null;
    }
    if (!State.activeTabId) State.activeTabId = genTabId();
    // Snapshot AFTER handle/saveMode are on State so tab switch keeps write-back
    snapshotActiveTab();
    renderDocTabs();
    try {
      // Owner election may still be pending; startExternalWatchForCurrentDocument is also
      // invoked from setLiveRole when ownership settles.
      if (canWriteLiveDocument()) startExternalWatchForCurrentDocument();
    } catch (e) {
      console.warn("[external-watch] start after load failed", e);
    }
}

function findAnnotationRange(doc5, annotation) {
  _anchorResolveCallCount++;
  if (!annotation) return null;
  const text2 = annotation.text || "";
  const prefix = annotation.prefix || "";
  const suffix = annotation.suffix || "";
  const segments = [];
  doc5.descendants((node, pos) => {
    if (node.isText) segments.push({ pos, text: node.text });
  });
  if (segments.length === 0) return null;
  const joined = doc5.textBetween(0, doc5.content.size, " ");
  const segTotalLen = segments.reduce((sum, s) => sum + s.text.length, 0);
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
  const findNthOccurrence = (searchStr, n) => {
    if (!searchStr) return null;
    let count = 0;
    for (let i = 0; i < segments.length; i++) {
      const text3 = segments[i].text;
      let searchFrom = 0;
      while (searchFrom < text3.length) {
        const idx = text3.indexOf(searchStr, searchFrom);
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
  const posAtOffset = (offset) => {
    if (offset <= 0) return segments[0]?.pos || 0;
    let lo = 0, hi = doc5.content.size;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const len = doc5.textBetween(0, mid, " ").length;
      if (len < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const makeRange = (from2, to, fuzzy) => {
    const r = { from: posAtOffset(from2), to: posAtOffset(to) };
    if (fuzzy) r.fuzzy = true;
    return r;
  };
  // Exact quote resolution is owned by modules/annotation-anchor.js. Convert
  // PM positions to plain offsets here; app-specific fuzzy recovery remains
  // below for edited/deleted quote fallbacks.
  if (text2) {
    let plainPosition = null;
    const prior = annotation.anchor && annotation.anchor.position || annotation.range;
    if (prior && typeof prior.from === "number" && typeof prior.to === "number") {
      try {
        const fromPm = Math.max(0, Math.min(doc5.content.size, prior.from));
        const toPm = Math.max(fromPm, Math.min(doc5.content.size, prior.to));
        plainPosition = {
          from: doc5.textBetween(0, fromPm, " ").length,
          to: doc5.textBetween(0, toPm, " ").length
        };
      } catch (_) {
        plainPosition = null;
      }
    }
    const exactResolution = resolveAnchor(joined, {
      text: text2,
      prefix,
      suffix,
      position: plainPosition
    });
    if (exactResolution.status === "attached" && exactResolution.range) {
      const r = makeRange(exactResolution.range.from, exactResolution.range.to, false);
      r.confidence = exactResolution.confidence;
      r.score = exactResolution.score;
      return r;
    }
    if (exactResolution.status === "ambiguous") {
      const candidates = (exactResolution.candidates || []).slice(0, 5).map((c) => ({
        ...makeRange(c.from, c.to, false),
        score: c.score
      }));
      return { ambiguous: true, fuzzy: true, candidates };
    }
  }
  if (text2) {
    const first3 = findInSegments(text2);
    if (first3) {
      let totalOccurrences = 0;
      for (const seg of segments) {
        let searchFrom = 0;
        while ((searchFrom = seg.text.indexOf(text2, searchFrom)) !== -1) {
          totalOccurrences++;
          searchFrom += 1;
        }
      }
      const isUnique = totalOccurrences === 1;
      if (isUnique) {
        return {
          from: segments[first3.foundNodeIdx].pos + first3.inSegOffset,
          to: segments[first3.foundNodeIdx].pos + first3.inSegOffset + text2.length,
          fuzzy: false
        };
      }
      if (prefix || suffix) {
        const scored = [];
        for (let si = 0; si < segments.length; si++) {
          const seg = segments[si];
          let searchFrom = 0;
          while (searchFrom < seg.text.length) {
            const idx = seg.text.indexOf(text2, searchFrom);
            if (idx === -1) break;
            const from2 = seg.pos + idx;
            const to = from2 + text2.length;
            let localPre = "";
            let localSuf = "";
            try {
              localPre = doc5.textBetween(Math.max(0, from2 - 60), from2, " ");
            } catch (e) {
            }
            try {
              localSuf = doc5.textBetween(to, Math.min(doc5.content.size, to + 60), " ");
            } catch (e) {
            }
            let score = 0;
            if (prefix) {
              if (localPre.endsWith(prefix)) score += 100 + prefix.length;
              else if (prefix.length >= 2 && localPre.endsWith(prefix.slice(-Math.min(prefix.length, 12)))) score += 40;
              else if (prefix.length >= 4 && localPre.includes(prefix.slice(-8))) score += 15;
            }
            if (suffix) {
              if (localSuf.startsWith(suffix)) score += 100 + suffix.length;
              else if (suffix.length >= 2 && localSuf.startsWith(suffix.slice(0, Math.min(suffix.length, 12)))) score += 40;
              else if (suffix.length >= 4 && localSuf.includes(suffix.slice(0, 8))) score += 15;
            }
            scored.push({ from: from2, to, score });
            searchFrom = idx + 1;
          }
        }
        scored.sort((a, b) => b.score - a.score || a.from - b.from);
                if (scored.length && scored[0].score >= 40) {
                  const best = scored[0];
                  const second = scored[1];
                  // P0: equal top scores → refuse auto-attach (never silent first-hit)
                  // Weak includes-only (15) is below 40 and never attaches among duplicates.
                  if (second && (second.score === best.score || best.score - second.score < 10)) {
                    return { ambiguous: true, candidates: scored.slice(0, 5), fuzzy: true };
                  }
                  return { from: best.from, to: best.to, fuzzy: best.score < 100 };
                }
              }
              // Multi-hit without usable unique context → ambiguous, do NOT pick first
              if (!prefix && !suffix) {
                return { ambiguous: true, fuzzy: true, candidates: [] };
              }
              // Context present but no positive score winner → ambiguous
              return { ambiguous: true, fuzzy: true, candidates: [] };
            } else {
              const firstIdx = joined.indexOf(text2);
              if (firstIdx !== -1) {
                let totalOccurrences = 0;
                let searchFrom = 0;
                while ((searchFrom = joined.indexOf(text2, searchFrom)) !== -1) {
                  totalOccurrences++;
                  searchFrom += 1;
                }
                const isUnique = totalOccurrences === 1;
                if (isUnique) {
                  const from2 = posAtOffset(firstIdx);
                  const to = posAtOffset(firstIdx + text2.length);
                  return { from: from2, to, fuzzy: false };
                }
                // multi across-block join path without unique context
                return { ambiguous: true, fuzzy: true };
              }
            }
          }
          if (prefix && suffix) {
            const pTail = prefix.slice(-5);
            const sHead = suffix.slice(0, 5);
            if (pTail && sHead) {
              const softHits = [];
              for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                let searchFrom = 0;
                while (searchFrom < seg.text.length) {
                  const pIdx = seg.text.indexOf(pTail, searchFrom);
                  if (pIdx === -1) break;
                  const estTextStart = pIdx + pTail.length;
                  const sSearchFromInSeg = estTextStart;
                  let sIdx = seg.text.indexOf(sHead, sSearchFromInSeg);
                  if (sIdx === -1 && i + 1 < segments.length) {
                    const sFoundInSegOffset = segments[i + 1].text.indexOf(sHead);
                    if (sFoundInSegOffset !== -1) {
                      softHits.push({
                        from: seg.pos + estTextStart,
                        to: seg.pos + estTextStart + text2.length,
                        fuzzy: true
                      });
                    }
                  } else if (sIdx !== -1) {
                    softHits.push({
                      from: seg.pos + estTextStart,
                      to: seg.pos + estTextStart + text2.length,
                      fuzzy: true
                    });
                  }
                  searchFrom = pIdx + 1;
                }
              }
              if (softHits.length === 1) return softHits[0];
              if (softHits.length > 1) return { ambiguous: true, fuzzy: true, candidates: softHits.slice(0, 5) };
            }
          }
          if (text2 && prefix && prefix.length >= 5) {
            const pTail = prefix.slice(-5);
            const tHead = text2.slice(0, Math.min(text2.length, 5));
            const combined = pTail + tHead;
            const hits = [];
            for (let i = 0; i < segments.length; i++) {
              let searchFrom = 0;
              const text3 = segments[i].text;
              while (searchFrom < text3.length) {
                const idx = text3.indexOf(combined, searchFrom);
                if (idx === -1) break;
                hits.push({
                  from: segments[i].pos + idx + pTail.length,
                  to: segments[i].pos + idx + pTail.length + text2.length,
                  fuzzy: true
                });
                searchFrom = idx + 1;
              }
            }
            if (hits.length === 1) return hits[0];
            if (hits.length > 1) return { ambiguous: true, fuzzy: true, candidates: hits.slice(0, 5) };
          }
          if (prefix && suffix) {
            const combined = prefix + suffix;
            const hits = [];
            for (let i = 0; i < segments.length; i++) {
              let searchFrom = 0;
              const text3 = segments[i].text;
              while (searchFrom < text3.length) {
                const idx = text3.indexOf(combined, searchFrom);
                if (idx === -1) break;
                hits.push({
                  from: segments[i].pos + idx + prefix.length,
                  to: segments[i].pos + idx + prefix.length + text2.length,
                  fuzzy: true
                });
                searchFrom = idx + 1;
              }
            }
            if (hits.length === 1) return hits[0];
            if (hits.length > 1) return { ambiguous: true, fuzzy: true, candidates: hits.slice(0, 5) };
          }
          return null;
        }
function findTextInDoc(doc5, text2) {
  if (!text2) return null;
  return findAnnotationRange(doc5, { text: text2 });
}
function computeContextAt(doc5, from2, to, maxLen = 40) {
  if (!doc5 || typeof from2 !== "number" || typeof to !== "number" || from2 >= to) {
    return { prefix: "", suffix: "" };
  }
  const size = doc5.content.size;
  const preFrom = Math.max(0, from2 - maxLen);
  const sufTo = Math.min(size, to + maxLen);
  let prefix = "";
  let suffix = "";
  try {
    prefix = doc5.textBetween(preFrom, from2, " ");
  } catch (e) {
    prefix = "";
  }
  try {
    suffix = doc5.textBetween(to, sufTo, " ");
  } catch (e) {
    suffix = "";
  }
  if (prefix.length > maxLen) prefix = prefix.slice(-maxLen);
  if (suffix.length > maxLen) suffix = suffix.slice(0, maxLen);
  return { prefix, suffix };
}
function syncThreadAnchorEvidence(ann, doc5, range, opts = {}) {
  if (!ann || !doc5 || !range || typeof range.from !== "number" || typeof range.to !== "number" || range.from >= range.to) return ann;
  const context = opts.context || computeContextAt(doc5, range.from, range.to);
  const exact = opts.exact != null ? String(opts.exact) : String(ann.text || "");
  ann.range = { from: range.from, to: range.to };
  ann.prefix = context.prefix || "";
  ann.suffix = context.suffix || "";
  const previous = ann.anchor && typeof ann.anchor === "object" ? ann.anchor : {};
  const previousPosition = previous.position && typeof previous.position === "object" ? previous.position : {};
  const status = opts.status || previous.status || "attached";
  ann.anchor = {
    ...previous,
    version: previous.version || "1",
    quote: {
      exact,
      prefix: ann.prefix,
      suffix: ann.suffix
    },
    position: {
      from: range.from,
      to: range.to,
      startAssoc: previousPosition.startAssoc != null ? previousPosition.startAssoc : 1,
      endAssoc: previousPosition.endAssoc != null ? previousPosition.endAssoc : -1
    },
    status,
    confidence: opts.confidence != null ? opts.confidence : (status === "attached" || status === "moved" ? 1 : previous.confidence != null ? previous.confidence : 0.5),
    updatedAt: nowISO()
  };
  return ann;
}
function computeContext(text2, fullDocText, maxLen = 40) {
  if (!text2) return { prefix: "", suffix: "" };
  const idx = fullDocText.indexOf(text2);
  if (idx === -1) {
    return { prefix: "", suffix: "" };
  }
  const minLen = 15;
  let prefixStart = Math.max(0, idx - maxLen);
  const prefixSlice = fullDocText.substring(prefixStart, idx);
  const lastSepInPrefix = prefixSlice.lastIndexOf(" ");
  if (lastSepInPrefix !== -1) {
    const newPrefixStart = prefixStart + lastSepInPrefix + 1;
    const newPrefixLen = idx - newPrefixStart;
    if (newPrefixLen >= minLen && prefixSlice.length - lastSepInPrefix < 30) {
      prefixStart = newPrefixStart;
    }
  }
  const prefix = fullDocText.substring(prefixStart, idx);
  const afterIdx = idx + text2.length;
  let suffixEnd = Math.min(fullDocText.length, afterIdx + maxLen);
  const suffixSlice = fullDocText.substring(afterIdx, suffixEnd);
  const firstSepInSuffix = suffixSlice.indexOf(" ");
  if (firstSepInSuffix !== -1) {
    const newSuffixLen = firstSepInSuffix;
    if (newSuffixLen >= minLen && firstSepInSuffix < 30) {
      suffixEnd = afterIdx + firstSepInSuffix;
    }
  }
  const suffix = fullDocText.substring(afterIdx, suffixEnd);
  return { prefix, suffix };
}
var FS_API = {
  supported: typeof window.showOpenFilePicker === "function" && typeof window.showDirectoryPicker === "function",
  // 检测浏览器
  browserNote() {
    if (this.supported) return "";
    if (typeof window.showOpenFilePicker === "undefined") {
      return "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 File System Access API\uFF08\u9700\u8981 Chrome/Edge 113+\uFF09\uFF0C\u4FDD\u5B58\u65F6\u5C06\u4E0B\u8F7D\u6587\u4EF6\u800C\u975E\u5199\u56DE\u539F\u4F4D\u7F6E\u3002";
    }
    return "";
  }
};
function _isMentorName(name) {
  return /\.mentor$/i.test(name || "");
}
function _isMdName(name) {
  return /\.md(markdown)?$/i.test(name || "");
}
function _isDocxName(name) {
  return /\.docx$/i.test(name || "");
}
function _findSidecarHandle(handles, mdHandle) {
  if (!mdHandle || !handles) return null;
  const base = mdHandle.name.replace(/\.md(markdown)?$/i, "").toLowerCase();
  return handles.find(
    (h) => /\.annotations\.json$/i.test(h.name) && h.name.replace(/\.annotations\.json$/i, "").toLowerCase() === base
  ) || null;
}
/** Open one or many FileSystemFileHandles as tabs; last one stays active. */
async function openMultipleHandles(handles) {
  if (!handles || handles.length === 0) return;
  const mentors = handles.filter((h) => _isMentorName(h.name));
  const docxs = handles.filter((h) => _isDocxName(h.name));
  const mds = handles.filter((h) => _isMdName(h.name));
  // Prefer .mentor packages; else .docx; else .md; else first pick
  const targets = mentors.length ? mentors : docxs.length ? docxs : mds.length ? mds : [handles[0]];
  const multi = targets.length > 1;
  let opened = 0;
  let lastName = "";
  for (const h of targets) {
    try {
      if (_isMentorName(h.name)) {
        await openFromMentorHandle(h, { quiet: multi });
      } else if (_isDocxName(h.name)) {
        const file = await h.getFile();
        await openFromDocxFile(file, { quiet: multi });
      } else {
        await openFromHandle(h, _findSidecarHandle(handles, h), { quiet: multi });
      }
      opened++;
      lastName = h.name;
    } catch (e) {
      console.error("[openMultipleHandles] failed:", h.name, e);
      showToast(`打开失败 ${h.name}: ${e.message || e}`, 4e3);
    }
  }
  renderFilePaneCurrent();
  updateDocMeta({ immediate: true });
  if (opened === 0) {
    setStatus("打开失败", "");
    return;
  }
  if (opened > 1) {
    setStatus(`已打开 ${opened} 个文档`, lastName);
    showToast(`已打开 ${opened} 个标签`, 2500);
  }
}
async function openFiles() {
  if (FS_API.supported) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        // .mentor primary; .docx import-with-comments also allowed
        types: [{
          description: "Mentor 单文件包 (.mentor)",
          accept: {
            "application/zip": [".mentor"]
          }
        }, {
          description: "Word 文档 (.docx)",
          accept: {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"]
          }
        }],
        excludeAcceptAllOption: false
      });
      if (handles.length === 0) return;
      await openMultipleHandles(handles);
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
      console.error("showOpenFilePicker 失败:", e);
    }
  }
  await openFilesLegacy();
}
async function openFilesLegacy() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".mentor,.docx";
  input.onchange = async () => {
    const files = Array.from(input.files || []);
    if (files.length === 0) return;
    // Collect .mentor (by extension or zip sniff) and .docx
    const mentors = [];
    const docxs = [];
    for (const f of files) {
      if (_isDocxName(f.name)) docxs.push(f);
      else if (_isMentorName(f.name) || await isMentorZip(f)) mentors.push(f);
    }
    if (mentors.length > 0) {
      const multi = mentors.length > 1;
      let opened = 0;
      for (const f of mentors) {
        try {
          await openFromMentorFile(f, { quiet: multi });
          opened++;
        } catch (e) {
          console.error("[openFilesLegacy] mentor failed:", f.name, e);
          showToast(`打开失败 ${f.name}: ${e.message || e}`, 4e3);
        }
      }
      renderFilePaneCurrent();
      updateDocMeta({ immediate: true });
      if (opened === 0) {
        setStatus("打开失败", "");
        return;
      }
      if (opened > 1) {
        setStatus(`已打开 ${opened} 个文档`, mentors[mentors.length - 1].name);
        showToast(`已打开 ${opened} 个标签`, 2500);
      }
      return;
    }
    if (docxs.length > 0) {
      const multi = docxs.length > 1;
      let opened = 0;
      let lastName = "";
      for (const f of docxs) {
        try {
          await openFromDocxFile(f, { quiet: multi });
          opened++;
          lastName = f.name;
        } catch (e) {
          console.error("[openFilesLegacy] docx failed:", f.name, e);
          showToast(`打开失败 ${f.name}: ${e.message || e}`, 4e3);
        }
      }
      renderFilePaneCurrent();
      updateDocMeta({ immediate: true });
      if (opened === 0) {
        setStatus("打开失败", "");
        return;
      }
      if (opened > 1) {
        setStatus(`已打开 ${opened} 个文档`, lastName);
        showToast(`已打开 ${opened} 个标签`, 2500);
      }
      return;
    }
    // No mentor/docx — leave legacy path empty (md no longer primary)
    showToast("请选择 .mentor 或 .docx 文件", 3200);
  };
  input.click();
}

/**
 * Import a .docx (optionally with Word comments) into a download-mode Mentor tab.
 * saveMode is always "download" — user should Save As .mentor to persist comments.
 */
async function openFromDocxFile(file, options = {}) {
  const quiet = !!(options && options.quiet);
  if (!file) throw new Error("openFromDocxFile: file required");
  if (typeof JSZip === "undefined" && typeof parseDocxToMentor !== "function") {
    throw new Error("DOCX import unavailable");
  }
  try {
    if (!quiet) {
      try { showToast("正在导入 .docx…", 1800); } catch (_) {}
    }
    const buf = await file.arrayBuffer();
    const parsed = await parseDocxToMentor(buf);
    const rawName = file.name || "document.docx";
    const base = rawName.replace(/\.docx$/i, "") || "document";
    // Keep a .md working name so save-as-mentor flow is natural
    const name = base + ".md";
    const anns = Array.isArray(parsed.annotations) ? parsed.annotations : [];
    const sidecar = {
      version: "1",
      document: name,
      updatedAt: new Date().toISOString(),
      author: { id: State.authorId, name: State.author },
      annotations: anns,
    };
    // parseDocxToMentor returns Uint8Array media — injectMediaFiles needs Blob
    const mediaFiles = {};
    for (const [k, v] of Object.entries(parsed.mediaFiles || {})) {
      if (!v) continue;
      if (typeof Blob !== "undefined" && v instanceof Blob) {
        mediaFiles[k] = v;
      } else {
        const ext = (/\.([a-z0-9]+)$/i.exec(k) || [])[1] || "bin";
        const mime =
          ext === "png" ? "image/png" :
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
          ext === "gif" ? "image/gif" :
          ext === "webp" ? "image/webp" :
          ext === "svg" ? "image/svg+xml" :
          "application/octet-stream";
        mediaFiles[k] = new Blob([v], { type: mime });
      }
    }
    await activateOpenedDocument({
      name,
      content: parsed.contentMd || "",
      annotations: sidecar,
      mediaFiles: Object.keys(mediaFiles).length ? mediaFiles : null,
      handle: null,
      saveMode: "download",
      quiet,
      forceDisk: true,
    });
    const n = anns.length;
    if (!quiet) {
      const detail = n > 0
        ? `${rawName} · ${n} 条批注（请另存为 .mentor）`
        : `${rawName} · 无批注（请另存为 .mentor）`;
      setStatus("已导入 DOCX", detail);
      showToast(n > 0 ? `已导入 ${n} 条 Word 批注` : "已导入 DOCX 正文", 2800);
    }
    if (parsed.warnings && parsed.warnings.length) {
      console.warn("[openFromDocxFile] warnings:", parsed.warnings);
    }
    return true;
  } catch (e) {
    console.error("[openFromDocxFile]", e);
    if (!quiet) showToast(`DOCX 导入失败: ${e.message || e}`, 4500);
    throw e;
  }
}

async function ensureWritePermission(fileHandle) {
  if (!fileHandle || !fileHandle.requestPermission) return "unknown";
  try {
    let perm = "prompt";
    try {
      perm = await fileHandle.queryPermission({ mode: "readwrite" });
    } catch (e) {
    }
    if (perm === "granted") return "granted";
    const newPerm = await fileHandle.requestPermission({ mode: "readwrite" });
    return newPerm;
  } catch (e) {
    console.warn("[ensureWritePermission] \u5931\u8D25:", e);
    return "unknown";
  }
}
async function openFromHandle(fileHandle, sidecarHandle = null, options = {}) {
  const quiet = !!(options && options.quiet);
  await ensureWritePermission(fileHandle);
  const file = await fileHandle.getFile();
  const content = await file.text();
  let annotations = null;
  if (sidecarHandle) {
    try {
      const sf = await sidecarHandle.getFile();
      annotations = JSON.parse(await sf.text());
    } catch (e) {
      showToast(`\u4FA7\u8F66 JSON \u89E3\u6790\u5931\u8D25: ${e.message}`);
    }
  }
  if (!annotations) {
    try {
      const cached = await AnnotationStore.get(file.name);
      if (cached && cached.sidecar && cached.sidecar.annotations) {
        annotations = cached.sidecar;
        console.log(`[IDB] \u4ECE\u672C\u5730\u7F13\u5B58\u6062\u590D ${cached.sidecar.annotations.length} \u4E2A\u6279\u6CE8 (${file.name})`);
      }
    } catch (e) {
      console.warn("AnnotationStore.get \u5931\u8D25:", e);
    }
  }
  await activateOpenedDocument({
    name: file.name,
    content,
    annotations,
    handle: fileHandle,
    saveMode: "handle",
    quiet
  });
  if (!quiet) {
    const statusMsg = sidecarHandle ? `${file.name} + \u6279\u6CE8\u5DF2\u52A0\u8F7D` : `${file.name} (Ctrl+S \u76F4\u63A5\u4FDD\u5B58\u5230\u539F\u4F4D\u7F6E)`;
    setStatus("\u5DF2\u52A0\u8F7D \xB7 " + statusMsg, "");
  }
}
async function openFromMentorHandle(fileHandle, options = {}) {
  clearExternalWatchSource();
  const quiet = !!(options && options.quiet);
  const preferDraft = !!(options && options.preferDraft);
  const forceDisk = !!(options && options.forceDisk);
  const documentIdOpt = options && options.documentId || null;
  await ensureWritePermission(fileHandle);
  const file = await fileHandle.getFile();
  const { mdText, annotations, references, mediaFiles, archive } = await readMentorZip(file);
  console.log("[openFromMentorHandle] mediaFiles=", Object.keys(mediaFiles || {}).length);
  await activateOpenedDocument({
    name: file.name,
    content: mdText,
    annotations,
    references,
    mediaFiles,
    handle: fileHandle,
    documentId: documentIdOpt,
    saveMode: "mentor-handle",
    quiet,
    preferDraft,
    forceDisk,
    diskMtime: file.lastModified,
    structuralHtml: archive && archive.documentHtml || null,
    archiveVerification: archive && archive.verification || null
  });
  if (!State.diskPathHint) State.diskPathHint = file.name;
  try { startSupervisionPolling(); } catch (_) {}
  const mediaCount = Object.keys(mediaFiles || {}).length;
  const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length;
  if (mediaCount === 0 && blobUrlCount > 0) {
    showToast(`\u26A0 .mentor \u635F\u574F: ${blobUrlCount} \u5F20\u56FE\u5F15\u7528\u5931\u6548 (zip \u65E0 media/). \u7528 Pandoc \u91CD\u65B0 generate \u6587\u6863`, 8e3);
    setStatus("\u56FE\u5168\u90E8\u5931\u6548", `${blobUrlCount} \u5F20\u56FE\u5F15\u7528 blob: URL \u5931\u6548 \u2014 \u8FD9\u4EFD .mentor \u6CA1\u6709 media/ \u5B50\u76EE\u5F55`);
  } else if (!quiet) {
    setStatus("\u5DF2\u52A0\u8F7D .mentor \u5305", `${file.name} (Ctrl+S \u76F4\u63A5\u5199\u56DE\u539F\u4F4D\u7F6E)`);
  }
}
function fileTypeIcon(name) {
  if (/\.(md|markdown)$/i.test(name)) return { glyph: window.MentorIcons.fileMd, cls: "icon-md" };
  if (/\.json$/i.test(name)) return { glyph: window.MentorIcons.fileJson, cls: "icon-json" };
  return { glyph: window.MentorIcons.fileOther, cls: "icon-other" };
}
function renderFilePaneCurrent() {
  const tree = $("#file-tree");
  if (!tree) return;
  const name = State.currentFile?.name || "\u672A\u6253\u5F00\u6587\u6863";
  tree.classList.toggle("tree-empty", !State.currentFile);
  const isHandle = State.saveMode === "handle";
  const badge = isHandle ? `<span class="save-mode-badge"><span class="badge-check">${window.MentorIcons.check}</span> \u5DF2\u6388\u6743</span>` : `<span class="save-mode-badge">${window.MentorIcons.download} \u4E0B\u8F7D</span>`;
  tree.innerHTML = `<div class="tree-node tree-folder"><span class="icon icon-folder">${window.MentorIcons.folder}</span><span class="filename">${escapeHtml(name)}</span>${badge}</div>`;
  const handle = () => openFiles();
  tree.addEventListener("click", handle);
  const searchInput = $("#tree-search");
  filterTree(searchInput ? searchInput.value : "");
}
// ============================================================
// Cross-page live sync (BroadcastChannel): one owner + followers
// Same browser profile only — not multi-device collaboration.
// ============================================================
var _instanceId = Math.random().toString(36).slice(2, 10);
var _liveSync = {
  channel: null,
  documentKey: null,
  role: "off", // off | owner | follower
  lease: { term: 0, ownerId: "" },
  seq: 0,
  gate: null,
  ownerSeenAt: 0,
  heartbeat: null,
  electTimer: null,
  applying: false,
  publishTimer: null,
  lastSentMediaRevision: "",
  lastAppliedRev: "",
  stateMsgCount: 0,
  mediaPayloadCount: 0
};
// Back-compat aliases used by tests / diagnostics
var _docChannel = null;
var _docChannelPath = null;
var _docPeers = /* @__PURE__ */ new Set();
var _docHeartbeatTimer = null;

function liveDocumentKey() {
  const cf = State.currentFile;
  if (!cf) return null;
  // Match legacy room identity: handle+documentId → id room; else basename room
  if (cf.handle && cf.documentId) return `id:${cf.documentId}`;
  if (cf.name) return `name:${cf.name}`;
  if (cf.documentId) return `id:${cf.documentId}`;
  return State.activeTabId ? `tab:${State.activeTabId}` : null;
}

function canWriteLiveDocument() {
  return !_liveSync || _liveSync.role === "off" || _liveSync.role === "owner";
}

function getLiveSyncState() {
  return {
    role: _liveSync.role,
    documentKey: _liveSync.documentKey,
    lease: { term: _liveSync.lease.term, ownerId: _liveSync.lease.ownerId },
    ownerSeenAt: _liveSync.ownerSeenAt,
    instanceId: _instanceId,
    stateMsgCount: _liveSync.stateMsgCount,
    mediaPayloadCount: _liveSync.mediaPayloadCount
  };
}

function renderLiveSyncBanner() {
  const el = document.getElementById("live-sync-banner");
  const text = document.getElementById("live-sync-text");
  if (!el || !text) return;
  if (!_liveSync.documentKey || _liveSync.role === "off") {
    el.classList.add("hidden");
    el.dataset.role = "";
    return;
  }
  el.classList.remove("hidden");
  el.dataset.role = _liveSync.role;
  text.textContent = _liveSync.role === "owner"
    ? "此页面正在编辑 · 其他页面会实时更新"
    : "实时查看 · 修改来自另一页面";
  const button = el.querySelector('[data-act="live-sync-takeover"]');
  if (button) button.hidden = _liveSync.role !== "follower";
}



/* ===== fix-mentor supervision mode ===== */

function isRangeSupervisionLocked(from, to) {
  const s = getSupervisionState();
  if (!s.active) return false;
  if (s.lockMode === "document") return true;
  try {
    if (!State.editor || !State.editor.state) return false;
    const ps = supervisionKey.getState(State.editor.state);
    const ranges = (ps && ps.lockedRanges) || [];
    for (const r of ranges) {
      if (from < r.to && to > r.from) return true;
    }
  } catch (_) {}
  return false;
}

function getSupervisionState() {
  return State.supervision || {
    active: false,
    lockMode: "pending-paragraphs",
    pendingThreadIds: [],
    processedThreadIds: [],
    currentThreadId: "",
    phase: "idle",
    message: "",
    tool: "",
    updatedAt: "",
    lastFingerprint: "",
    lastCurrentId: "",
    health: "ok",
    error: "",
  };
}

function supervisionFingerprint(payload) {
  const n = normalizeSupervisionPayload(payload || {});
  return JSON.stringify({
    a: n.active,
    m: n.lockMode,
    p: n.pendingThreadIds,
    d: n.processedThreadIds,
    c: n.currentThreadId,
    ph: n.phase,
    h: n.health || "ok",
    e: n.error || "",
    msg: n.message,
    t: n.tool,
    u: n.updatedAt,
  });
}

function renderSupervisionBanner() {
  const el = document.getElementById("supervision-banner");
  const textEl = document.getElementById("supervision-banner-text");
  const lamp = document.getElementById("supervision-signal");
  if (!el || !textEl) return;
  const s = getSupervisionState();
  const sig = supervisionSignalPhase(s);
  if (!s.active) {
    el.classList.add("hidden");
    el.dataset.active = "0";
    el.dataset.phase = "off";
    el.dataset.health = "ok";
    textEl.textContent = "";
    if (lamp) {
      lamp.dataset.phase = "off";
      lamp.dataset.health = "ok";
      lamp.title = "监管未开启";
    }
    try {
      document.body.classList.remove("supervision-active");
      document.body.removeAttribute("data-supervision-lock");
      document.body.removeAttribute("data-supervision-phase");
    } catch (_) {}
    return;
  }
  el.classList.remove("hidden");
  el.dataset.active = "1";
  el.dataset.lock = s.lockMode || "pending-paragraphs";
  el.dataset.phase = sig;
  el.dataset.health = s.health || "ok";
  textEl.textContent = supervisionBannerText(s) || "AI 监管中";
  if (lamp) {
    lamp.dataset.phase = sig;
    lamp.dataset.health = s.health || "ok";
    lamp.title = s.health === "stale"
      ? "监管连接异常"
      : s.health === "degraded"
        ? "监管锚点未定位"
        : sig === "working" ? "正在改一段" : "监管等待中";
  }
  try {
    document.body.classList.add("supervision-active");
    document.body.setAttribute("data-supervision-lock", s.lockMode || "pending-paragraphs");
    document.body.setAttribute("data-supervision-phase", sig);
  } catch (_) {}
}

function scrollSupervisionPetIntoView(behavior) {
  try {
    const pet = document.querySelector(".ProseMirror .supervision-pet");
    if (pet && typeof pet.scrollIntoView === "function") {
      const b = behavior === "auto" ? "auto" : "smooth";
      pet.scrollIntoView({ block: "nearest", behavior: b, inline: "nearest" });
    }
  } catch (_) {}
}

function applySupervisionPayload(raw, { force = false } = {}) {
  const normalized = normalizeSupervisionPayload(raw || { active: false });
  const fp = supervisionFingerprint(normalized);
  const s = getSupervisionState();
  if (!force && fp === s.lastFingerprint) {
    // Same sidecar, but re-materialize while active so late-loaded annotation
    // marks still get the pet/lock decos (open race: poll before marks paint).
    if (normalized.active && State.editor && State.editor.view) {
      try {
        const { state, view } = State.editor;
        const tr = setSupervisionMeta(state.tr, normalized);
        tr.setMeta("addToHistory", false);
        tr.setMeta(SUPERVISION_BYPASS_META, true);
        view.dispatch(tr);
      } catch (_) {}
      renderSupervisionBanner();
    }
    return s;
  }
  const prevCurrent = s.currentThreadId || s.lastCurrentId || "";
  s.active = normalized.active;
  s.lockMode = normalized.lockMode;
  s.pendingThreadIds = normalized.pendingThreadIds.slice();
  s.processedThreadIds = normalized.processedThreadIds.slice();
  s.currentThreadId = normalized.currentThreadId || "";
  s.phase = normalized.phase || "idle";
  s.message = normalized.message;
  s.tool = normalized.tool;
  s.updatedAt = normalized.updatedAt;
  s.health = normalized.health || "ok";
  s.error = normalized.error || "";
  s.lastFingerprint = fp;
  State.supervision = s;
  try {
    if (State.editor && State.editor.view) {
      const { state, view } = State.editor;
      const tr = setSupervisionMeta(state.tr, normalized);
      tr.setMeta("addToHistory", false);
      tr.setMeta(SUPERVISION_BYPASS_META, true);
      view.dispatch(tr);
    }
  } catch (e) {
    console.warn("[supervision] dispatch failed", e);
  }
  renderSupervisionBanner();
  if (normalized.active && normalized.currentThreadId && normalized.currentThreadId !== prevCurrent) {
    s.lastCurrentId = normalized.currentThreadId;
    State.supervision = s;
    let revealInfo = { found: false, filtered: false };
    try { revealInfo = revealSupervisionThread(normalized.currentThreadId) || revealInfo; } catch (_) {}
    if (revealInfo.filtered) {
      // Keep filter contract; surface that current task is outside current filter.
      try {
        const textEl = document.getElementById("supervision-banner-text");
        if (textEl && textEl.textContent && !/筛选外/.test(textEl.textContent)) {
          textEl.textContent = textEl.textContent + " · 当前批注位于筛选外";
        }
      } catch (_) {}
    }
    try {
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => {
        try { scrollSupervisionPetIntoView(reduce ? "auto" : "smooth"); } catch (_) {}
      });
    } catch (_) {
      try { scrollSupervisionPetIntoView(); } catch (_) {}
    }
  } else if (!normalized.active) {
    s.lastCurrentId = "";
    State.supervision = s;
  }
  try { syncToolbarActionState(); } catch (_) {}
  return s;
}

function clearSupervisionLocal() {
  applySupervisionPayload({ active: false }, { force: true });
}

async function ensureLocalSessionToken() {
  if (State.externalWatchToken) return State.externalWatchToken;
  try {
    const host = location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return "";
    const res = await fetch(location.origin + "/session", { cache: "no-store" });
    if (!res.ok) return "";
    const data = await res.json();
    if (data && data.token) {
      State.externalWatchToken = String(data.token);
      return State.externalWatchToken;
    }
  } catch (_) {}
  return "";
}

async function fetchSupervisionStatus(pathOrOpts, tokenArg) {
  // Back-compat: (path, token) or ({ path, name, token })
  let path = "";
  let name = "";
  let token = "";
  if (pathOrOpts && typeof pathOrOpts === "object") {
    path = pathOrOpts.path || "";
    name = pathOrOpts.name || "";
    token = pathOrOpts.token || tokenArg || "";
  } else {
    path = pathOrOpts || "";
    token = tokenArg || "";
  }
  if ((!path && !name) || !token) return { active: false, health: "missing" };
  const q = new URLSearchParams({ token: String(token) });
  if (path) q.set("path", String(path));
  else q.set("name", String(name));
  const url = location.origin + "/supervision?" + q.toString();
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new SupervisionPollError("network", { cause: error });
  }
  if (res.status === 403 || res.status === 404 || res.status >= 500) {
    throw new SupervisionPollError("http-" + res.status, { status: res.status });
  }
  if (!res.ok) {
    throw new SupervisionPollError("http-" + res.status, { status: res.status });
  }
  let data;
  try {
    data = await res.json();
  } catch (error) {
    throw new SupervisionPollError("invalid-json", { cause: error });
  }
  if (!data || typeof data !== "object") {
    throw new SupervisionPollError("invalid-json");
  }
  return data;
}

var _supervisionPoller = null;
function getSupervisionPoller() {
  if (_supervisionPoller) return _supervisionPoller;
  _supervisionPoller = createSupervisionPoller({
    pollMs: 1000,
    fetchStatus: async (ctx) => fetchSupervisionStatus(ctx),
    onSnapshot: (snap) => {
      try {
        applySupervisionPayload(snap || { active: false });
      } catch (e) {
        console.warn("[supervision] apply snapshot failed", e);
      }
    },
  });
  return _supervisionPoller;
}

function supervisionDocumentId(path) {
  return String(
    path ||
      (State.externalWatchPath || "") ||
      ((State.currentFile && State.currentFile.name) || "") ||
      ((State.currentFile && State.currentFile.path) || "") ||
      (State.diskPathHint || "")
  );
}

async function bindSupervisionToActiveDocument() {
  const poller = getSupervisionPoller();
  try { poller.stop(); } catch (_) {}
  try { clearSupervisionLocal(); } catch (_) {}
  const token = (State.externalWatchToken || "") || (await ensureLocalSessionToken());
  const path = State.externalWatchPath || (State.currentFile && State.currentFile.path) || "";
  const name =
    (State.currentFile && State.currentFile.name) ||
    (State.diskPathHint && (() => {
      const s = String(State.diskPathHint);
      const ia = s.lastIndexOf("/");
      const ib = s.lastIndexOf("\\");
      const i = ia > ib ? ia : ib;
      return i >= 0 ? s.slice(i + 1) : s;
    })()) ||
    "";
  const documentId = supervisionDocumentId(path || name);
  if ((!path && !name) || !token || !documentId) return false;
  // Auto-poll only for deep-link path or .mentor packages — plain .md opens stay local.
  const isMentor = /\.mentor$/i.test(String(name || "")) || /\.mentor$/i.test(String(path || ""));
  if (!path && !isMentor) return false;
  await poller.start({ path, name, token, documentId });
  return true;
}

function startSupervisionPolling() {
  // Fire-and-forget async: may need GET /session for normal Open (no deep-link token).
  void bindSupervisionToActiveDocument().catch((error) =>
    console.warn("[supervision] bind failed", error)
  );
}

async function startSupervisionPollingAsync() {
  try {
    await bindSupervisionToActiveDocument();
  } catch (e) {
    console.warn("[supervision] start failed", e);
  }
}

function stopSupervisionPolling() {
  try {
    getSupervisionPoller().stop();
  } catch (_) {}
  clearSupervisionLocal();
}

function clearExternalWatchSource() {
  State.externalWatchPath = "";
  State.externalWatchToken = "";
  try { stopSupervisionPolling(); } catch (_) {}
}

function getExternalWatchState() {
  const watch = State.externalWatch || {};
  return {
    mode: watch.mode || "off",
    generation: watch.generation || 0,
    pending: Boolean(watch.pending),
    resolving: Boolean(watch.resolving),
    lastMtime: watch.lastMtime || 0,
    lastRevision: watch.lastRevision || "",
    lastFingerprint: watch.lastFingerprint || "",
    path: State.externalWatchPath || "",
    hasToken: Boolean(State.externalWatchToken),
  };
}

function stopExternalWatch() {
  const watch = State.externalWatch;
  if (!watch) return;
  watch.generation = (watch.generation || 0) + 1;
  if (watch.debounceTimer) {
    clearTimeout(watch.debounceTimer);
    watch.debounceTimer = null;
  }
  if (watch.retryTimer) {
    clearTimeout(watch.retryTimer);
    watch.retryTimer = null;
  }
  try { watch.watcher && watch.watcher.stop && watch.watcher.stop(); } catch (_) {}
  watch.watcher = null;
  watch.mode = "off";
  watch.pending = null;
  watch.resolving = false;
}

async function startExternalWatchForCurrentDocument() {
  stopExternalWatch();
  if (!canWriteLiveDocument()) return;
  if (!State.currentFile) return;
  const generation = State.externalWatch.generation;
  const handle = State.currentFile && State.currentFile.handle;
  if (handle && typeof handle.getFile === "function") {
    const watcher = createExternalChangeWatcher({
      handle,
      onHint: (hint) => scheduleExternalRefresh({ generation, hint }),
    });
    State.externalWatch.watcher = watcher;
    State.externalWatch.mode = await watcher.start();
    // Path+token (deep-link) may coexist with handle — still poll supervision sidecar.
    try { startSupervisionPolling(); } catch (_) {}
    return;
  }
  if (State.externalWatchPath && State.externalWatchToken) {
    const watcher = createExternalRevisionWatcher({
      path: State.externalWatchPath,
      getToken: () => State.externalWatchToken,
      fetchImpl: window.fetch.bind(window),
      onHint: (hint) => scheduleExternalRefresh({ generation, hint }),
    });
    State.externalWatch.watcher = watcher;
    State.externalWatch.mode = await watcher.start();
  }
  try { startSupervisionPolling(); } catch (_) {}
}

function noteExternalOwnWrite(mtimeMs = 0, revision = "") {
  const watch = State.externalWatch;
  if (!watch) return;
  const quietMs = 2200;
  watch.writeQuietUntil = Date.now() + quietMs;
  if (mtimeMs) {
    watch.lastMtime = mtimeMs;
    State.fileMtime = mtimeMs;
  }
  if (revision) watch.lastRevision = String(revision);
  try {
    if (watch.watcher && typeof watch.watcher.noteOwnWrite === "function") {
      watch.watcher.noteOwnWrite({ mtime: mtimeMs || undefined, revision: revision || undefined, quietMs });
    }
  } catch (_) {}
}

async function bytesToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  if (globalThis.crypto && crypto.subtle && typeof crypto.subtle.digest === "function") {
    const dig = await crypto.subtle.digest("SHA-256", data);
    return bytesToHex(dig);
  }
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

async function externalArchiveFingerprint(archive) {
  const media = archive && archive.mediaFiles ? archive.mediaFiles : {};
  const mediaNames = Object.keys(media).sort();
  const mediaParts = [];
  for (const name of mediaNames) {
    const blob = media[name];
    let digest = name + ":" + (blob && blob.size || 0) + ":" + (blob && blob.type || "");
    try {
      if (blob && typeof blob.arrayBuffer === "function") {
        const buf = await blob.arrayBuffer();
        if (globalThis.crypto && crypto.subtle && typeof crypto.subtle.digest === "function") {
          digest = name + ":" + await bytesToHex(await crypto.subtle.digest("SHA-256", buf));
        } else {
          digest = name + ":" + await bytesToHex(buf.slice(0, Math.min(buf.byteLength, 64)));
        }
      }
    } catch (_) {}
    mediaParts.push(digest);
  }
  const payload = JSON.stringify({
    mdText: archive && archive.mdText || "",
    annotations: archive && archive.annotations || null,
    references: archive && archive.references || null,
    structuralHtml: archive && archive.archive && archive.archive.documentHtml || "",
    verification: archive && archive.archive && archive.archive.verification || null,
    media: mediaParts,
  });
  return sha256Hex(payload);
}

async function fetchExternalMentorFile(path, token) {
  if (!path || !token) throw new Error("missing external mentor source");
  const url = location.origin + "/open?path=" + encodeURIComponent(path) + "&token=" + encodeURIComponent(token);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("external open failed HTTP " + r.status);
  const blob = await r.blob();
  const baseName = String(path).split("\\").pop().split("/").pop() || "open.mentor";
  return new File([blob], baseName, {
    type: "application/zip",
    lastModified: Date.now(),
  });
}

function scheduleExternalRefresh({ generation, hint } = {}) {
  const watch = State.externalWatch;
  if (!watch) return;
  if (generation != null && generation !== watch.generation) return;
  if (watch.resolving) return;
  if (Date.now() < (watch.writeQuietUntil || 0)) return;
  watch.pending = {
    detectedAt: Date.now(),
    mtime: hint && hint.mtime || 0,
    revision: hint && hint.revision || "",
    cause: hint && hint.cause || "unknown",
  };
  if (watch.debounceTimer) return;
  watch.debounceTimer = setTimeout(() => {
    watch.debounceTimer = null;
    refreshFromExternalDisk({ generation: watch.generation }).catch((e) => {
      console.warn("[external-watch] refresh failed", e);
    });
  }, 180);
}

function pauseAutosaveForExternalConflict(pause) {
  const watch = State.externalWatch;
  if (!watch) return;
  watch.autosavePausedForExternal = !!pause;
  try {
    if (pause) stopAutosaveTimer();
    else if (canWriteLiveDocument()) startAutosaveTimer();
  } catch (_) {}
}

function showExternalUnreadableState() {
  try {
    showToast("磁盘文件暂时无法读取，将保持本地内容", 3200);
  } catch (_) {}
}

async function openExternalConflictDialog({ generation, file, archive, fingerprint }) {
  pauseAutosaveForExternalConflict(true);
  const choice = window.confirm(
    "磁盘上的 .mentor 已被外部程序修改，且本地有未保存修改。\n\n确定 = 采用磁盘版本（丢弃本地未保存修改）\n取消 = 保留本地编辑"
  );
  const watch = State.externalWatch;
  if (!watch || generation !== watch.generation) {
    pauseAutosaveForExternalConflict(false);
    return;
  }
  if (choice) {
    await applyExternalArchiveReload({ generation, file, archive, fingerprint });
  } else {
    if (file && file.lastModified) watch.lastMtime = file.lastModified;
    if (fingerprint) watch.lastFingerprint = fingerprint;
    if (watch.pending && watch.pending.revision) watch.lastRevision = watch.pending.revision;
    watch.pending = null;
  }
  pauseAutosaveForExternalConflict(false);
}

async function applyExternalArchiveReload({ generation, file, archive, fingerprint }) {
  const watch = State.externalWatch;
  if (!watch || generation !== watch.generation) return;
  if (!canWriteLiveDocument()) return;
  const handle = State.currentFile && State.currentFile.handle || null;
  const documentId = State.currentFile && State.currentFile.documentId || null;
  const pendingRevision = watch.pending && watch.pending.revision || "";
  await activateOpenedDocument({
    name: file && file.name || (State.currentFile && State.currentFile.name) || "open.mentor",
    content: archive.mdText,
    annotations: archive.annotations,
    references: archive.references,
    mediaFiles: archive.mediaFiles,
    handle: handle || null,
    saveMode: handle ? "mentor-handle" : "mentor-download",
    structuralHtml: archive.archive && archive.archive.documentHtml || null,
    archiveVerification: archive.archive && archive.archive.verification || null,
    documentId,
    diskMtime: file && file.lastModified || Date.now(),
    forceDisk: true,
    preferDraft: false,
    quiet: true,
  });
  // activateOpenedDocument restarts the watcher and bumps generation — rebaseline the live watch.
  const live = State.externalWatch;
  live.lastMtime = file && file.lastModified || live.lastMtime || 0;
  live.lastFingerprint = fingerprint || "";
  if (pendingRevision) live.lastRevision = pendingRevision;
  State.fileMtime = live.lastMtime || State.fileMtime;
  live.pending = null;
  try {
    if (live.watcher && typeof live.watcher.noteOwnWrite === "function") {
      live.watcher.noteOwnWrite({ mtime: live.lastMtime, revision: live.lastRevision, quietMs: 500 });
    }
  } catch (_) {}
  if (canWriteLiveDocument()) {
    try { scheduleLiveSyncPublish({ full: true }); } catch (_) {}
  }
  try { showToast("已从磁盘刷新外部修改", 2800); } catch (_) {}
}

async function refreshFromExternalDisk({ generation, interactive = false } = {}) {
  const watch = State.externalWatch;
  if (!watch) return;
  const handle = State.currentFile && State.currentFile.handle;
  const path = State.externalWatchPath;
  if (generation != null && generation !== watch.generation) return;
  if ((!handle || typeof handle.getFile !== "function") && !path) return;
  if (watch.resolving) return;
  if (Date.now() < (watch.writeQuietUntil || 0) && !interactive) return;
  watch.resolving = true;
  try {
    let file = null;
    try {
      file = handle && typeof handle.getFile === "function"
        ? await handle.getFile()
        : await fetchExternalMentorFile(path, State.externalWatchToken);
    } catch (err) {
      const decision = decideExternalRefresh({
        dirty: Boolean(State.currentFile && State.currentFile.dirty),
        sameFingerprint: false,
        unreadable: true,
        isOwner: canWriteLiveDocument(),
        hasSource: Boolean(handle || path),
        isCurrentGeneration: generation === watch.generation,
      });
      if (decision.action === "unreadable") showExternalUnreadableState();
      return;
    }
    const archive = await readMentorZip(file);
    const fingerprint = await externalArchiveFingerprint(archive);
    const decision = decideExternalRefresh({
      dirty: Boolean(State.currentFile && State.currentFile.dirty),
      sameFingerprint: fingerprint === watch.lastFingerprint,
      unreadable: false,
      isOwner: canWriteLiveDocument(),
      hasSource: Boolean(handle || path),
      isCurrentGeneration: generation === watch.generation,
    });
    if (decision.action === "reload") {
      await applyExternalArchiveReload({ generation, file, archive, fingerprint });
    } else if (decision.action === "prompt") {
      await openExternalConflictDialog({ generation, file, archive, fingerprint });
    } else if (decision.action === "unreadable") {
      showExternalUnreadableState();
    } else {
      if (file && file.lastModified) watch.lastMtime = file.lastModified;
      if (watch.pending && watch.pending.revision) watch.lastRevision = watch.pending.revision;
      watch.pending = null;
    }
  } catch (error) {
    console.warn("[external-watch] refresh error", error);
    if (!watch.retryTimer) {
      watch.retryTimer = setTimeout(() => {
        watch.retryTimer = null;
        refreshFromExternalDisk({ generation: watch.generation }).catch(() => {});
      }, 800);
    }
  } finally {
    if (generation == null || generation === watch.generation) watch.resolving = false;
  }
}

async function flushExternalRefreshForTest() {
  const watch = State.externalWatch;
  if (!watch) return false;
  if (watch.debounceTimer) {
    clearTimeout(watch.debounceTimer);
    watch.debounceTimer = null;
  }
  await refreshFromExternalDisk({ generation: watch.generation, interactive: true });
  return true;
}


function setLiveRole(role) {
  const prev = _liveSync.role;
  _liveSync.role = role;
  State.readOnlyMode = role === "follower";
  if (State.editor) {
    try {
      const wantEditable = role !== "follower";
      // Avoid no-op setEditable → TipTap onUpdate → false markDirty (breaks save markClean).
      if (State.editor.isEditable !== wantEditable) {
        State.editor.setEditable(wantEditable);
      }
    } catch {
    }
  }
  renderLiveSyncBanner();
  try { syncToolbarActionState(); } catch {}
  if (role === "owner" && prev !== "owner") {
    try {
      startAutosaveTimer();
    } catch {
    }
    try {
      startExternalWatchForCurrentDocument();
    } catch (e) {
      console.warn("[external-watch] start on owner role failed", e);
    }
  } else if (role === "follower") {
    try {
      stopAutosaveTimer();
    } catch {
    }
    try {
      stopExternalWatch();
    } catch (_) {}
  }
}

function acceptLease(lease) {
  if (!lease) return false;
  if (compareLease(lease, _liveSync.lease) < 0) return false;
  _liveSync.lease = {
    term: Number(lease.term || 0),
    ownerId: String(lease.ownerId || "")
  };
  _liveSync.ownerSeenAt = Date.now();
  const isOwner = _liveSync.lease.ownerId === _instanceId;
  setLiveRole(isOwner ? "owner" : "follower");
  return true;
}

function postLive(type, payload = {}) {
  if (!_liveSync.channel || !_liveSync.documentKey) return;
  try {
    _liveSync.channel.postMessage({
      schema: LIVE_SYNC_SCHEMA,
      type,
      documentKey: _liveSync.documentKey,
      instanceId: _instanceId,
      lease: { term: _liveSync.lease.term, ownerId: _liveSync.lease.ownerId },
      seq: ++_liveSync.seq,
      ...payload
    });
  } catch (e) {
    console.warn("[live-sync] post failed", e);
  }
}

function liveFileState() {
  return {
    documentId: State.currentFile?.documentId || State.activeTabId,
    name: State.currentFile?.name || "untitled.md",
    dirty: !!(State.currentFile && State.currentFile.dirty),
    dirtyGen: State.currentFile?.dirtyGen || 0
  };
}

function captureLiveState({ includeMedia = false } = {}) {
  let pm = { type: "doc", content: [] };
  try {
    pm = mapImageSources(State.editor.getJSON(), mediaPathForSrc);
  } catch (e) {
    console.warn("[live-sync] getJSON failed", e);
  }
  let annotations = [];
  try {
    const side = buildAnnotationsSidecar();
    annotations = side && Array.isArray(side.annotations) ? side.annotations : (State.annotations || []);
  } catch {
    annotations = JSON.parse(JSON.stringify(State.annotations || []));
  }
  const revision = mediaRevision(State.mediaFiles || {});
  const changed = revision !== _liveSync.lastSentMediaRevision;
  if (includeMedia || changed) {
    _liveSync.lastSentMediaRevision = revision;
    if (includeMedia || changed) _liveSync.mediaPayloadCount += 1;
  }
  const out = {
    pm,
    annotations: JSON.parse(JSON.stringify(annotations || [])),
    references: normalizeReferenceManifest(State.references || emptyReferenceManifest()),
    file: liveFileState(),
    mediaRevision: revision
  };
  if (includeMedia || changed) {
    out.mediaFiles = Object.assign({}, State.mediaFiles || {});
  }
  return out;
}

function scheduleLiveSyncPublish({ full = false } = {}) {
  if (_liveSync.role !== "owner" || _liveSync.applying || !_liveSync.channel) return;
  clearTimeout(_liveSync.publishTimer);
  const size = (() => {
    try {
      return State.editor?.state.doc.content.size || 0;
    } catch {
      return 0;
    }
  })();
  const delay = size > 1_000_000 ? 500 : size > 250_000 ? 180 : 60;
  _liveSync.publishTimer = setTimeout(() => {
    _liveSync.publishTimer = null;
    if (_liveSync.role !== "owner" || !_liveSync.channel) return;
    const state = captureLiveState({ includeMedia: full });
    _liveSync.stateMsgCount += 1;
    postLive(full ? "state-full" : "state", { state });
  }, delay);
}

async function applyLiveState(snapshot) {
  if (!snapshot || _liveSync.role !== "follower" || !State.editor) return false;
  const rev = JSON.stringify({
    pm: snapshot.pm,
    annotations: snapshot.annotations,
    references: snapshot.references,
    file: snapshot.file,
    mediaRevision: snapshot.mediaRevision
  });
  if (rev === _liveSync.lastAppliedRev) return true;
  _liveSync.lastAppliedRev = rev;
  const localHandle = State.currentFile?.handle || null;
  _liveSync.applying = true;
  State._suspendAnnValidate = true;
  try {
    if (snapshot.mediaFiles && Object.keys(snapshot.mediaFiles).length) {
      try {
        await injectMediaFiles(snapshot.mediaFiles);
      } catch (e) {
        console.warn("[live-sync] injectMedia failed", e);
      }
    }
    const hydrated = mapImageSources(snapshot.pm || { type: "doc", content: [] }, (src) => {
      if (State.mediaUrls && State.mediaUrls[src]) return State.mediaUrls[src];
      return src;
    });
    State.annotations = [];
    State.editor.commands.setContent(hydrated, false);
    clearPmHistory();
    resetHistory();
    State.annotations = JSON.parse(JSON.stringify(snapshot.annotations || []));
    try {
      rebuildAnnotationMarks();
    } catch (e) {
      console.warn("[live-sync] rebuild marks", e);
    }
    State.references = normalizeReferenceManifest(snapshot.references || emptyReferenceManifest());
    try {
      reconcileCitationNodes();
    } catch {
    }
    State.currentFile = {
      documentId: (snapshot.file && snapshot.file.documentId) || State.currentFile?.documentId || State.activeTabId,
      name: (snapshot.file && snapshot.file.name) || State.currentFile?.name || "untitled.md",
      content: State.currentFile?.content || "",
      dirty: !!(snapshot.file && snapshot.file.dirty),
      dirtyGen: (snapshot.file && snapshot.file.dirtyGen) || 0,
      handle: localHandle,
      annotations: null
    };
    if (State.currentFile.dirty) {
      $("#dirty-indicator")?.classList.add("is-dirty");
    } else {
      $("#dirty-indicator")?.classList.remove("is-dirty");
    }
    const nameEl = $("#current-file-name");
    if (nameEl) nameEl.textContent = State.currentFile.name;
    try {
      renderCommentList();
    } catch {
    }
    try {
      _renderReferencesPane();
    } catch {
    }
    try {
      renderOutline();
    } catch {
    }
    try {
      refreshAnnotationImageDecos();
    } catch {
    }
    try {
      renderDocTabs();
    } catch {
    }
    try {
      updateDocMeta({ immediate: true });
    } catch {
    }
  } finally {
    State._suspendAnnValidate = false;
    _liveSync.applying = false;
  }
  return true;
}

function onLiveMessage(ev) {
  const msg = ev && ev.data;
  if (!msg || msg.instanceId === _instanceId) return;
  if (msg.documentKey !== _liveSync.documentKey) return;
  if (msg.schema !== LIVE_SYNC_SCHEMA) return;

  if (msg.type === "leave") {
    if (msg.lease && msg.lease.ownerId === msg.instanceId) {
      // Owner left — start short election
      if (_liveSync.role === "follower") {
        clearTimeout(_liveSync.electTimer);
        _liveSync.electTimer = setTimeout(() => {
          if (_liveSync.role !== "follower") return;
          if (Date.now() - _liveSync.ownerSeenAt < 200) return;
          acceptLease(nextLease(_liveSync.lease, _instanceId));
          postLive("claim");
          scheduleLiveSyncPublish({ full: true });
        }, 150);
      }
    }
    return;
  }

  // Lease messages
  if (msg.type === "hello") {
    if (_liveSync.role === "owner") {
      postLive("heartbeat");
      scheduleLiveSyncPublish({ full: true });
    }
    return;
  }

  if (msg.type === "claim" || msg.type === "heartbeat") {
    const cmp = compareLease(msg.lease, _liveSync.lease);
    if (cmp > 0) {
      acceptLease(msg.lease);
      if (_liveSync.role === "follower" && (msg.type === "heartbeat" || msg.type === "claim")) {
        postLive("state-request");
      }
    } else if (cmp === 0 && msg.lease && msg.lease.ownerId === _liveSync.lease.ownerId) {
      _liveSync.ownerSeenAt = Date.now();
    } else if (cmp < 0 && _liveSync.role === "owner") {
      // Stale claim — reassert
      postLive("heartbeat");
    }
    return;
  }

  if (msg.type === "state-request") {
    if (_liveSync.role === "owner") scheduleLiveSyncPublish({ full: true });
    return;
  }

  if (msg.type === "state" || msg.type === "state-full") {
    // Only apply from current owner lease
    if (compareLease(msg.lease, _liveSync.lease) < 0) return;
    if (compareLease(msg.lease, _liveSync.lease) > 0) acceptLease(msg.lease);
    if (_liveSync.role !== "follower") return;
    if (_liveSync.gate && !_liveSync.gate.accept(msg)) return;
    _liveSync.ownerSeenAt = Date.now();
    applyLiveState(msg.state).catch((e) => console.warn("[live-sync] apply failed", e));
  }
}

function closeLiveSync() {
  clearTimeout(_liveSync.publishTimer);
  _liveSync.publishTimer = null;
  clearTimeout(_liveSync.electTimer);
  _liveSync.electTimer = null;
  if (_liveSync.heartbeat) {
    clearInterval(_liveSync.heartbeat);
    _liveSync.heartbeat = null;
  }
  if (_docHeartbeatTimer) {
    clearInterval(_docHeartbeatTimer);
    _docHeartbeatTimer = null;
  }
  if (_liveSync.channel) {
    try {
      postLive("leave");
    } catch {
    }
    try {
      _liveSync.channel.close();
    } catch {
    }
  }
  _liveSync.channel = null;
  _liveSync.documentKey = null;
  _liveSync.gate = null;
  _liveSync.role = "off";
  _liveSync.lease = { term: 0, ownerId: "" };
  _liveSync.seq = 0;
  _liveSync.lastAppliedRev = "";
  _docChannel = null;
  _docChannelPath = null;
  _docPeers.clear();
  State.readOnlyMode = false;
  try {
    stopExternalWatch();
  } catch (_) {}
  if (State.editor) {
    try {
      if (State.editor.isEditable !== true) {
        State.editor.setEditable(true);
      }
    } catch {
    }
  }
  renderLiveSyncBanner();
}

function openLiveSyncForCurrentDocument() {
  closeLiveSync();
  const documentKey = liveDocumentKey();
  if (!documentKey || typeof BroadcastChannel === "undefined") {
    setLiveRole("owner");
    return;
  }
  _liveSync.documentKey = documentKey;
  _liveSync.channel = new BroadcastChannel(channelNameForDocument(documentKey));
  _liveSync.gate = createEnvelopeGate(documentKey);
  _liveSync.channel.onmessage = onLiveMessage;
  _docChannel = _liveSync.channel;
  _docChannelPath = documentKey;
  _liveSync.role = "off";
  renderLiveSyncBanner();
  postLive("hello");
  clearTimeout(_liveSync.electTimer);
  _liveSync.electTimer = setTimeout(() => {
    if (_liveSync.role !== "off") return;
    acceptLease(nextLease(_liveSync.lease, _instanceId));
    postLive("claim");
    scheduleLiveSyncPublish({ full: true });
  }, 250);
  _liveSync.heartbeat = setInterval(() => {
    if (!_liveSync.channel) return;
    if (_liveSync.role === "owner") {
      postLive("heartbeat");
    } else if (_liveSync.role === "follower") {
      if (Date.now() - _liveSync.ownerSeenAt > 3500) {
        acceptLease(nextLease(_liveSync.lease, _instanceId));
        postLive("claim");
        scheduleLiveSyncPublish({ full: true });
      }
    } else if (_liveSync.role === "off") {
      // stuck off — claim
      acceptLease(nextLease(_liveSync.lease, _instanceId));
      postLive("claim");
    }
  }, 1000);
  _docHeartbeatTimer = _liveSync.heartbeat;
}

function takeOverLiveEditing() {
  if (!_liveSync.channel || _liveSync.role === "owner") return false;
  acceptLease(nextLease(_liveSync.lease, _instanceId));
  postLive("claim");
  scheduleLiveSyncPublish({ full: true });
  showToast("已接管编辑", 1800);
  return true;
}

/** Test helper: inject a crafted live message into this page's handler. */
function __injectLiveMessageForTest(msg) {
  onLiveMessage({ data: msg });
}

// Legacy names → live sync
function _getDocPath() {
  return liveDocumentKey();
}
function _closeDocChannel() {
  closeLiveSync();
}
function _openDocChannel() {
  openLiveSyncForCurrentDocument();
}
function _reevaluateReadOnly() {
  // no-op: role driven by lease now
}
function _closeDocChannelFull() {
  closeLiveSync();
}
window.addEventListener("beforeunload", onBeforeUnload);
window.addEventListener("pagehide", () => {
  try { void persistWorkspaceSessionNow(); } catch (_) {}
});
function _validateSidecar(annotations) {
  const report = { errors: [], warnings: [], duplicates: /* @__PURE__ */ new Set() };
  const safeId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const validTime = (value) => typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
  if (!Array.isArray(annotations)) {
    report.errors.push("annotations \u4E0D\u662F\u6570\u7EC4");
    return report;
  }
  const seenIds = /* @__PURE__ */ new Map();
  annotations.forEach((ann, i) => {
    if (!ann) {
      report.errors.push(`\u7B2C ${i + 1} \u6761\u6279\u6CE8\u4E3A null`);
      return;
    }
    if (!ann.threadId || !safeId.test(String(ann.threadId))) {
      report.errors.push(`\u7B2C ${i + 1} \u6761\u6279\u6CE8 threadId \u65E0\u6548`);
    } else {
      const count = seenIds.get(ann.threadId) || 0;
      seenIds.set(ann.threadId, count + 1);
      if (count >= 1) {
        report.duplicates.add(ann.threadId);
        report.warnings.push(`\u91CD\u590D threadId: ${ann.threadId.slice(0, 8)}...`);
      }
    }
    if (!ann.text) {
      report.warnings.push(`threadId ${ann.threadId?.slice(0, 8) || i} \u7F3A text \u5B57\u6BB5`);
    }
    if (!ann.comments || !Array.isArray(ann.comments)) {
      report.errors.push(`threadId ${ann.threadId?.slice(0, 8) || i} comments \u5B57\u6BB5\u65E0\u6548`);
      return;
    }
    if (ann.createdAt && !validTime(ann.createdAt)) {
      report.errors.push(`threadId ${ann.threadId?.slice(0, 8) || i} createdAt \u65E0\u6548`);
    }
    ann.comments.forEach((comment, commentIndex) => {
      if (!comment || typeof comment !== "object") {
        report.errors.push(`threadId ${ann.threadId?.slice(0, 8) || i} \u7B2C ${commentIndex + 1} \u6761\u8BC4\u8BBA\u65E0\u6548`);
        return;
      }
      if (comment.id && !safeId.test(String(comment.id))) {
        report.errors.push(`threadId ${ann.threadId?.slice(0, 8) || i} comment.id \u65E0\u6548`);
      }
      if (comment.createdAt && !validTime(comment.createdAt)) {
        report.errors.push(`threadId ${ann.threadId?.slice(0, 8) || i} comment.createdAt \u65E0\u6548`);
      }
    });
  });
  return report;
}
function setupTreeActionDelegation() {
  $("#file-tree").addEventListener("click", async (e) => {
    const btn = e.target.closest(".tree-actions button[data-action]");
    if (!btn) return;
    e.stopPropagation();
    const node = btn.closest(".tree-node[data-handle-name]");
    if (!node) return;
    const name = node.dataset.handleName;
    const action = btn.dataset.action;
    await handleTreeAction(action, name);
  });
}
function setupEmptyTreeClick() {
  const tree = $("#file-tree");
  if (!tree) return;
  const handle = () => {
    if (!tree.classList.contains("tree-empty")) return;
    openFiles();
  };
  tree.addEventListener("click", handle);
  tree.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (!tree.classList.contains("tree-empty")) return;
      e.preventDefault();
      openFiles();
    }
  });
}
async function handleTreeAction(action, name) {
  if (action === "copy") {
    const path2 = name;
    try {
      await navigator.clipboard.writeText(path2);
      showToast(`\u5DF2\u590D\u5236\u8DEF\u5F84: ${path2}`);
    } catch (e) {
      showToast("\u590D\u5236\u5931\u8D25: " + e.message);
    }
    return;
  }
  if (action === "reload") {
    if (State.currentFile && State.currentFile.name === name && State.currentFile.dirty) {
      if (!confirm(`\u5F53\u524D\u6587\u6863\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u786E\u5B9A\u91CD\u65B0\u52A0\u8F7D "${name}" \u5417\uFF1F

\u52A0\u8F7D\u540E\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\u4F1A\u4E22\u5931\u3002`)) return;
    }
    if (State.currentFile && State.currentFile.handle) {
      try {
        if (/\.mentor$/i.test(name)) {
          await openFromMentorHandle(State.currentFile.handle);
        } else {
          showToast("\u65E7\u683C\u5F0F\u5DF2\u4E0D\u652F\u6301, \u8BF7\u91CD\u65B0\u6253\u5F00 .mentor");
          return;
        }
        showToast(`\u5DF2\u91CD\u65B0\u52A0\u8F7D: ${name}`);
      } catch (e) {
        showToast("\u91CD\u65B0\u52A0\u8F7D\u5931\u8D25: " + e.message);
      }
    }
    return;
  }
  if (action === "delete") {
    showToast("\u5355 .md \u6A21\u5F0F\u4E0B\u8BF7\u7528\u64CD\u4F5C\u7CFB\u7EDF\u5220\u9664\u6587\u4EF6");
    return;
  }
}
function filterTree(query) {
  const q = (query || "").trim().toLowerCase();
  $$(".tree-node[data-handle-name]").forEach((el) => {
    const name = el.dataset.handleName;
    const fn = el.querySelector(".filename");
    if (!q) {
      el.style.display = "";
      if (fn) fn.innerHTML = escapeHtml(name);
    } else if (name.toLowerCase().includes(q)) {
      el.style.display = "";
      if (fn) {
        const idx = name.toLowerCase().indexOf(q);
        const before = escapeHtml(name.slice(0, idx));
        const match = escapeHtml(name.slice(idx, idx + q.length));
        const after = escapeHtml(name.slice(idx + q.length));
        fn.innerHTML = `${before}<mark>${match}</mark>${after}`;
      }
    } else {
      el.style.display = "none";
    }
  });
  $$(".tree-node.tree-folder").forEach((el) => el.style.display = "");
}
function setupTreeSearch() {
  const input = $("#tree-search");
  const clear = $("#tree-search-clear");
  if (!input) return;
  input.addEventListener("input", () => {
    filterTree(input.value);
    if (input.value) clear.classList.remove("hidden");
    else clear.classList.add("hidden");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      filterTree("");
      clear.classList.add("hidden");
      input.blur();
    }
  });
  clear.addEventListener("click", () => {
    input.value = "";
    filterTree("");
    clear.classList.add("hidden");
    input.focus();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}
async function tryLoadSidecar(mdFileName, mdFile) {
  const sidecarName = mdFileName.replace(/\.md$/i, "") + ".annotations.json";
  if (State.fileList) {
    const sidecar = State.fileList.find((f) => f.name === sidecarName);
    if (sidecar) {
      try {
        return JSON.parse(await sidecar.text());
      } catch (e) {
        showToast(`\u4FA7\u8F66 JSON \u89E3\u6790\u5931\u8D25: ${e.message}`);
      }
    }
  }
  return null;
}
var MENTOR_MD_NAME = "content.md";
var MENTOR_ANN_NAME = "annotations.json";
var MENTOR_HTML_NAME = STRUCTURAL_HTML_NAME;
var MENTOR_MANIFEST_NAME = ARCHIVE_MANIFEST_NAME;
var _anchorResolveCallCount = 0;
function __anchorResolveCount() { return _anchorResolveCallCount; }
function __resetAnchorResolveCount() { _anchorResolveCallCount = 0; }
var MENTOR_ZIP_MAX_COMPRESSED = 80 * 1024 * 1024;
var MENTOR_ZIP_MAX_ENTRIES = 500;
var MENTOR_ZIP_MAX_UNCOMPRESSED = 200 * 1024 * 1024;
var MENTOR_ZIP_MAX_ENTRY = 40 * 1024 * 1024;
function assertMentorZipBudget(file, zip) {
  if (file && typeof file.size === "number" && file.size > MENTOR_ZIP_MAX_COMPRESSED) {
    throw new Error(`.mentor \u8FC7\u5927 (${Math.round(file.size / 1024 / 1024)}MB > ${Math.round(MENTOR_ZIP_MAX_COMPRESSED / 1024 / 1024)}MB)`);
  }
  if (!zip || !zip.files) return;
  const names = Object.keys(zip.files);
  if (names.length > MENTOR_ZIP_MAX_ENTRIES) {
    throw new Error(`.mentor \u6761\u76EE\u8FC7\u591A (${names.length} > ${MENTOR_ZIP_MAX_ENTRIES})`);
  }
  let total = 0;
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const size = Number(entry._data && entry._data.uncompressedSize != null ? entry._data.uncompressedSize : entry.uncompressedSize || 0);
    if (size > MENTOR_ZIP_MAX_ENTRY) {
      throw new Error(`.mentor \u5355\u6587\u4EF6\u8FC7\u5927: ${name}`);
    }
    total += size;
    if (total > MENTOR_ZIP_MAX_UNCOMPRESSED) {
      throw new Error(`.mentor \u89E3\u538B\u540E\u8FC7\u5927 (>${Math.round(MENTOR_ZIP_MAX_UNCOMPRESSED / 1024 / 1024)}MB)`);
    }
  }
}
async function isMentorZip(file) {
  if (!file) return false;
  if (/\.mentor$/i.test(file.name)) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return head[0] === 80 && head[1] === 75 && head[2] === 3 && head[3] === 4;
  } catch (e) {
    return false;
  }
}
async function finishMentorArchiveRead({
  mdText,
  annotations,
  annotationsText,
  documentHtml,
  manifestText,
  references,
  referencesBib,
  mediaFiles,
  _diag
}) {
  let manifest = null;
  try {
    manifest = manifestText ? JSON.parse(manifestText) : null;
  } catch (_) {
    manifest = null;
  }
  const annTextRaw = typeof annotationsText === "string"
    ? annotationsText
    : JSON.stringify(annotations == null ? { annotations: [] } : annotations, null, 2);
  const verification = await verifyStructuralArchive({
    mdText,
    annotationsText: annTextRaw,
    documentHtml: typeof documentHtml === "string" ? documentHtml : null,
    manifest
  });
  return {
    mdText,
    annotations,
    references,
    referencesBib: referencesBib || "",
    mediaFiles,
    archive: {
      documentHtml: verification.usable ? documentHtml : null,
      verification
    },
    _diag
  };
}
async function readMentorZip(file) {
  if (file && typeof file.size === "number" && file.size > MENTOR_ZIP_MAX_COMPRESSED) throw new Error(`.mentor 过大 (${Math.round(file.size / 1024 / 1024)}MB)`);
  const rawBuf = await file.arrayBuffer();
  if (_zipWorker && _zipWorkerReady) {
    try {
      const transferBuf = rawBuf.slice(0);
      const workerResult = await _zipWorkerCall("load", { bytes: transferBuf }, [transferBuf]);
      const mediaFiles = {};
      for (const [k, ab] of Object.entries(workerResult.mediaFiles || {})) mediaFiles[k] = new Blob([ab]);
      const mdText = workerResult.mdText;
      const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length;
      const mediaKeysCount = Object.keys(mediaFiles).length;
      _zipWorkerStats.loads++;
      return await finishMentorArchiveRead({
        mdText,
        annotations: workerResult.annotations,
        annotationsText: workerResult.annotationsText,
        documentHtml: workerResult.documentHtml,
        manifestText: workerResult.manifestText,
        references: normalizeReferenceManifest(workerResult.referencesJson || emptyReferenceManifest()),
        referencesBib: workerResult.referencesBib || "",
        mediaFiles,
        _diag: { blobUrlCount, mediaKeysCount }
      });
    } catch (e) {
      console.warn("[zip-worker] load failed, falling back to main thread:", e);
      _zipWorkerStats.errors++; _zipWorkerStats.lastError = e.message || String(e); _zipWorkerStats.fallbacks++;
      _resetZipWorker(e); _initZipWorker().then((w) => { _zipWorker = w; });
    }
  }
  const zip = await JSZip.loadAsync(rawBuf);
  assertMentorZipBudget(file, zip);
  const mdEntry = zip.file(MENTOR_MD_NAME), annEntry = zip.file(MENTOR_ANN_NAME);
  const htmlEntry = zip.file(MENTOR_HTML_NAME), manifestEntry = zip.file(MENTOR_MANIFEST_NAME);
  const refsEntry = zip.file("references.json"), refsBibEntry = zip.file("references.bib");
  if (!mdEntry) throw new Error(`.mentor 包缺少 ${MENTOR_MD_NAME}`);
  const mediaNames = Object.keys(zip.files).filter((name) => { const e = zip.files[name]; return name.startsWith("media/") && !name.includes("..") && !name.startsWith("/") && e && !e.dir; });
  const all = await Promise.all([
    mdEntry.async("string"),
    annEntry ? annEntry.async("string") : null,
    htmlEntry ? htmlEntry.async("string") : null,
    manifestEntry ? manifestEntry.async("string") : null,
    refsEntry ? refsEntry.async("string") : null,
    refsBibEntry ? refsBibEntry.async("string") : null,
    ...mediaNames.map((name) => zip.file(name).async("blob").then((blob) => [name, blob]))
  ]);
  const [mdText, annText, documentHtml, manifestText, refsText, referencesBib, ...mediaResults] = all;
  let annotations = null, references = emptyReferenceManifest();
  if (annText !== null) try { annotations = JSON.parse(annText); } catch (e) { console.warn("[mentor] annotations.json 解析失败:", e); }
  if (refsText !== null) try { references = normalizeReferenceManifest(JSON.parse(refsText)); } catch (e) { console.warn("[mentor] references.json 解析失败:", e); }
  const mediaFiles = {}; for (const [name, blob] of mediaResults) mediaFiles[name] = blob;
  const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length, mediaKeysCount = Object.keys(mediaFiles).length;
  return await finishMentorArchiveRead({
    mdText,
    annotations,
    annotationsText: annText,
    documentHtml,
    manifestText,
    references,
    referencesBib: referencesBib || "",
    mediaFiles,
    _diag: { blobUrlCount, mediaKeysCount }
  });
}
async function openFromMentorFile(file, options = {}) {
  const quiet = !!(options && options.quiet);
  console.log("[openFromMentorFile] start, file=", file?.name, "size=", file?.size);
  // Never replace a user-selected File with a same-basename handle; that can open the wrong path.
  const { mdText, annotations, references, mediaFiles, archive } = await readMentorZip(file);
  console.log("[openFromMentorFile] mediaFiles keys=", Object.keys(mediaFiles || {}));
  const displayName = file.name;
  await activateOpenedDocument({
    name: displayName,
    content: mdText,
    annotations,
    references,
    mediaFiles,
    handle: null,
    saveMode: "mentor-download",
    quiet,
    forceDisk: !!(options && options.forceDisk),
    structuralHtml: archive && archive.documentHtml || null,
    archiveVerification: archive && archive.verification || null
  });
  try { startSupervisionPolling(); } catch (_) {}
  const mediaCount = Object.keys(mediaFiles || {}).length;
  const blobUrlCount = (mdText.match(/!\[[^\]]*\]\(blob:[^)]+\)/g) || []).length;
  if (mediaCount === 0 && blobUrlCount > 0) {
    showToast(`\u26A0 .mentor \u635F\u574F: ${blobUrlCount} \u5F20\u56FE\u5F15\u7528\u5931\u6548 (zip \u65E0 media/). \u7528 Pandoc \u91CD\u65B0 generate \u6587\u6863`, 8e3);
    setStatus("\u56FE\u5168\u90E8\u5931\u6548", `${blobUrlCount} \u5F20\u56FE\u5F15\u7528 blob: URL \u5931\u6548 \u2014 \u8FD9\u4EFD .mentor \u6CA1\u6709 media/ \u5B50\u76EE\u5F55`);
  } else if (!quiet) {
    if (mediaCount > 0) {
      setStatus("\u5DF2\u52A0\u8F7D .mentor \u5305", `${displayName} \xB7 ${mediaCount} \u5F20\u56FE\u7247 \u2713`);
    } else {
      setStatus("\u5DF2\u52A0\u8F7D .mentor \u5305", `${displayName} (Ctrl+S \u4E0B\u8F7D .mentor \u526F\u672C)`);
    }
  }
  updateDocMeta();
  return { displayName, mdText, annotations };
}
async function buildMentorZipBlob(mdText, annotations, mediaFiles, references = State.references, archive = {}) {
  const annotationsText = JSON.stringify(annotations, null, 2);
  let documentHtml = null;
  let manifestText = null;
  if (archive && typeof archive.documentHtml === "string") {
    // Never pack session blob: URLs into document.html — they die on next open.
    documentHtml = htmlWithMediaPaths(archive.documentHtml, State.mediaUrls);
    const archManifest = await createArchiveManifest({ mdText, annotationsText, documentHtml });
    manifestText = JSON.stringify(archManifest, null, 2);
  }
  mediaFiles = filterMediaFilesForArchive(mediaFiles || {}, {
    mdText,
    html: typeof documentHtml === "string" ? documentHtml : "",
    annotations,
    mediaUrls: State.mediaUrls,
    editor: State.editor
  });
  const refManifest = normalizeReferenceManifest(references || emptyReferenceManifest());
  if (_zipWorker && _zipWorkerReady) {
    try {
      const mediaList = [];
      const transferList = [];
      if (mediaFiles && Object.keys(mediaFiles).length > 0) {
        for (const [path2, blob] of Object.entries(mediaFiles)) {
          const buf = await blob.arrayBuffer();
          mediaList.push({ path: path2, bytes: buf });
          transferList.push(buf);
        }
      }
      const workerResult = await _zipWorkerCall("build", {
        mdText,
        sidecar: annotations,
        sidecarText: annotationsText,
        documentHtml,
        manifestText,
        referencesJson: refManifest.entries.length ? refManifest : null,
        referencesBib: refManifest.entries.length ? serializeReferenceBibTeX(refManifest.entries) : "",
        mediaFiles: mediaList
      }, transferList);
      _zipWorkerStats.builds++;
      return new Blob([workerResult.bytes], { type: "application/zip" });
    } catch (e) {
      console.warn("[zip-worker] build failed, falling back to main thread:", e);
      _zipWorkerStats.errors++;
      _zipWorkerStats.lastError = e.message || String(e);
      _zipWorkerStats.fallbacks++;
      _resetZipWorker(e);
      _initZipWorker().then((w) => {
        _zipWorker = w;
      });
    }
  }
  const zip = new JSZip();
  zip.file(MENTOR_MD_NAME, mdText);
  zip.file(MENTOR_ANN_NAME, annotationsText);
  if (typeof documentHtml === "string" && typeof manifestText === "string") {
    zip.file(MENTOR_HTML_NAME, documentHtml);
    zip.file(MENTOR_MANIFEST_NAME, manifestText);
  }
  if (refManifest.entries.length) {
    zip.file("references.json", JSON.stringify(refManifest, null, 2));
    zip.file("references.bib", serializeReferenceBibTeX(refManifest.entries));
  }
  if (mediaFiles) {
    for (const [path2, blob] of Object.entries(mediaFiles)) {
      if (!path2.startsWith("media/") || path2.includes("..") || path2.startsWith("/")) {
        console.warn("[mentor] buildMentorZipBlob 跳过非法 path:", path2);
        continue;
      }
      zip.file(path2, blob);
    }
  }
  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}
var _zipWorker = null;
var _zipWorkerReady = false;
var _zipWorkerId = 0;
var _zipWorkerPending = /* @__PURE__ */ new Map();
var _zipWorkerStats = { builds: 0, loads: 0, errors: 0, lastError: null, fallbacks: 0 };
var ZIP_WORKER_TIMEOUT_MS = 6e4;
function _rejectAllZipWorkerPending(error) {
  const err = error instanceof Error ? error : new Error(String(error || "zip worker failed"));
  for (const [, pending] of _zipWorkerPending) {
    try {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(err);
    } catch {
    }
  }
  _zipWorkerPending.clear();
}
function _resetZipWorker(error) {
  _zipWorkerReady = false;
  if (_zipWorker) {
    try {
      _zipWorker.terminate();
    } catch {
    }
  }
  _zipWorker = null;
  _rejectAllZipWorkerPending(error || new Error("zip worker reset"));
}
async function _initZipWorker() {
  try {
    const worker = new Worker(new URL("./workers/zip-worker.js", import.meta.url));
    worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data || {};
      if (id === "init") {
        _zipWorkerReady = true;
        return;
      }
      const pending = _zipWorkerPending.get(id);
      if (pending) {
        _zipWorkerPending.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        if (ok) pending.resolve(result);
        else pending.reject(new Error(error || "zip worker error"));
      }
    };
    worker.onerror = (e) => {
      console.warn("[zip-worker] error:", e.message || e);
      _resetZipWorker(new Error(e.message || "zip worker error"));
    };
    worker.onmessageerror = (e) => {
      console.warn("[zip-worker] messageerror:", e);
      _resetZipWorker(new Error("zip worker messageerror"));
    };
    return worker;
  } catch (e) {
    console.warn("[zip-worker] init failed:", e);
    return null;
  }
}
function _zipWorkerCall(cmd, args, transferList = []) {
  return new Promise((resolve, reject) => {
    if (!_zipWorker) {
      reject(new Error("worker not ready"));
      return;
    }
    const id = ++_zipWorkerId;
    const timer = setTimeout(() => {
      const pending = _zipWorkerPending.get(id);
      if (!pending) return;
      _zipWorkerPending.delete(id);
      reject(new Error("zip worker timeout"));
      _resetZipWorker(new Error("zip worker timeout"));
      _initZipWorker().then((w) => {
        _zipWorker = w;
      });
    }, ZIP_WORKER_TIMEOUT_MS);
    _zipWorkerPending.set(id, { resolve, reject, timer });
    try {
      _zipWorker.postMessage({ id, cmd, ...args }, transferList);
    } catch (e) {
      _zipWorkerPending.delete(id);
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
(async () => {
  const worker = await _initZipWorker();
  if (worker) {
    _zipWorker = worker;
    await new Promise((r) => setTimeout(r, 50));
  }
})();
function mentorExportName(mdName) {
  return mdName.replace(/\.(md|markdown)$/i, "") + ".mentor";
}

var _saveDialogResolver = null;
var _saveDialogBusy = false;
function renderSaveDialog(model) {
  const root = document.querySelector("#save-dialog");
  if (!root || !model) return;
  root.dataset.severity = model.severity || "normal";
  const title = document.querySelector("#save-dialog-title");
  const msg = document.querySelector("#save-dialog-message");
  const details = document.querySelector("#save-dialog-details");
  const err = document.querySelector("#save-dialog-error");
  const primary = document.querySelector("#save-dialog-primary");
  const secondary = document.querySelector("#save-dialog-secondary");
  const cancel = document.querySelector("#save-dialog-cancel");
  if (title) title.textContent = model.title || "";
  if (msg) msg.textContent = model.message || "";
  if (err) { err.textContent = ""; err.classList.add("hidden"); }
  if (details) {
    const rows = Array.isArray(model.details) ? model.details : [];
    details.innerHTML = rows.map((d) => `<dt>${escapeHtml(d.label || "")}</dt><dd>${escapeHtml(d.value || "")}</dd>`).join("");
    details.classList.toggle("hidden", rows.length === 0);
  }
  if (primary) {
    primary.textContent = model.primaryLabel || "确定";
    primary.classList.toggle("hidden", !model.primaryLabel);
  }
  if (secondary) {
    const hasSec = !!(model.secondaryLabel && String(model.secondaryLabel).trim());
    secondary.textContent = model.secondaryLabel || "";
    secondary.classList.toggle("hidden", !hasSec);
  }
  if (cancel) cancel.textContent = model.cancelLabel || "取消";
  root.classList.remove("hidden");
  root.setAttribute("aria-busy", "false");
  try { primary?.focus(); } catch {}
}
function closeSaveDialog() {
  const root = document.querySelector("#save-dialog");
  if (root) {
    root.classList.add("hidden");
    root.removeAttribute("aria-busy");
  }
  _saveDialogBusy = false;
  const prev = openSaveDialog._lastFocus;
  openSaveDialog._lastFocus = null;
  try { if (prev && typeof prev.focus === "function") prev.focus(); } catch {}
}
function openSaveDialog(model) {
  return new Promise((resolve) => {
    initSaveDialog();
    openSaveDialog._lastFocus = document.activeElement;
    const root = document.querySelector("#save-dialog");
    if (!root) {
      resolve("cancel");
      return;
    }
    if (_saveDialogResolver) {
      const prev = _saveDialogResolver;
      _saveDialogResolver = null;
      prev("cancel");
    }
    _saveDialogResolver = resolve;
    renderSaveDialog(model);
  });
}
function initSaveDialog() {
  const root = document.querySelector("#save-dialog");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  const finish = (choice) => {
    if (_saveDialogBusy) return;
    const r = _saveDialogResolver;
    _saveDialogResolver = null;
    closeSaveDialog();
    if (r) r(choice);
  };
  document.querySelector("#save-dialog-primary")?.addEventListener("click", () => finish("primary"));
  document.querySelector("#save-dialog-secondary")?.addEventListener("click", () => finish("secondary"));
  document.querySelector("#save-dialog-cancel")?.addEventListener("click", () => finish("cancel"));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish("cancel");
    }
  });
}
async function downloadMentorSnapshot(snapshot, { markCleanOnSuccess = true } = {}) {
  showExportProgress("正在打包 .mentor…");
  try {
    const blob = await buildMentorZipBlob(snapshot.mdText, snapshot.sidecar, snapshot.mediaFiles, snapshot.references, { documentHtml: snapshot.documentHtml });
    const outName = /\.mentor$/i.test(snapshot.name) ? snapshot.name : mentorExportName(snapshot.name);
    downloadBlob(outName, blob);
    hideExportProgress("已下载");
    let warnings = [];
    if (markCleanOnSuccess) {
      // User-confirmed download-as-save: same official-commit lifecycle as handle write.
      const finalized = await finalizeOfficialCommit(snapshot, {
        reason: "manual",
        diskMtime: 0,
        captureVersion: true,
      });
      warnings = finalized.warnings || [];
    }
    const copy = buildSaveResultCopy({ kind: markCleanOnSuccess ? "save-download-mentor" : "save-copy", fileName: outName });
    if (markCleanOnSuccess && warnings.length) {
      setStatus("已保存", "文件已保存，但本地恢复记录不完整");
      showToast(`已保存 ${outName}（恢复点未完整写入）`, 3200);
    } else {
      setStatus(copy.status, copy.detail);
      showToast(markCleanOnSuccess ? `已保存 ${outName}` : `副本已下载 ${outName} · 原文件未改变`);
    }
    return { ok: true, name: outName, warnings };
  } catch (e) {
    hideExportProgress("导出失败");
    showToast("保存失败: " + (e && e.message ? e.message : e), 4000);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
async function exportMarkdownSnapshot(snapshot, { markCleanOnSuccess = false } = {}) {
  try {
    downloadFile(snapshot.name.replace(/\.mentor$/i, ".md"), snapshot.mdText);
    if (markCleanOnSuccess && activeDocumentMatches(snapshot) && (State.currentFile.dirtyGen || 0) === snapshot.dirtyGen) markClean();
    const copy = buildSaveResultCopy({ kind: "export-md", fileName: snapshot.name });
    setStatus(copy.status, copy.detail);
    showToast("Markdown 已导出 · 原文件未改变");
    return { ok: true };
  } catch (e) {
    showToast("导出失败: " + (e && e.message ? e.message : e), 4000);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}
async function runManualSave() {
  if (!State.currentFile) {
    showToast("请先打开或新建文档");
    return { ok: false, error: "no-document" };
  }
  if (State.readOnlyMode || !canWriteLiveDocument()) {
    showToast("此页面正在实时查看，需先接管编辑", 3000);
    return { ok: false, error: "read-only" };
  }
  if (!State.author) {
    await promptAuthor();
    if (!State.author) return { ok: false, cancelled: true };
  }
  State._toolbarBusy = true;
  try { syncToolbarActionState(); } catch {}
  try {
    if (hasWriteHandle()) {
      const showProgress = isMentorPackMode();
      let result = await writeCurrentToHandle({ reason: "manual", showProgress });
      if (result.conflict?.kind === "external-modified") {
        const choice = await openSaveDialog(buildSaveDialogModel({
          kind: "external-modified",
          fileName: result.conflict.fileName || State.currentFile.name
        }));
        if (choice === "primary") {
          result = await writeCurrentToHandle({ reason: "manual", showProgress, forceOverwriteExternal: true });
        } else if (choice === "secondary") {
          const snap = createSaveSnapshot();
          return await downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
        } else {
          return { ok: false, cancelled: true };
        }
      }
      if (result.ok) {
        const copy = buildSaveResultCopy({ kind: "write-current", fileName: State.currentFile.name });
        const warnings = result.warnings || [];
        if (warnings.length) {
          setStatus("已保存", "文件已保存，但本地恢复记录不完整");
          showToast(isMentorPackMode()
            ? "已保存到原位置 ✓ (.mentor) · 恢复点未完整写入"
            : "已保存到原位置 ✓ · 恢复点未完整写入", 3200);
        } else {
          setStatus(copy.status, copy.detail);
          showToast(isMentorPackMode() ? "已保存到原位置 ✓ (.mentor)" : "已保存到原位置 ✓");
        }
        try { snapshotActiveTab(); } catch {}
        return result;
      }
      if (result.skipped && result.error === "busy") {
        showToast("正在保存…", 1500);
        return result;
      }
      if (result.error === "权限被拒" || result.error === "need-permission") {
        const choice = await openSaveDialog(buildSaveDialogModel({ kind: "permission-denied", fileName: State.currentFile.name }));
        if (choice === "primary") {
          const snap = createSaveSnapshot();
          return await downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
        }
        return { ok: false, cancelled: true };
      }
      if (result.error && /ANNOTATION_ANCHOR_AUDIT_FAILED|批注锚点/.test(String(result.error))) {
              const issueCount = (State._lastAnchorAudit && State._lastAnchorAudit.errors || []).length || 1;
              const choice = await openSaveDialog(buildSaveDialogModel({ kind: "anchor-audit", fileName: State.currentFile.name, issueCount }));
              if (choice === "secondary") {
                try {
                  const snap = createSaveSnapshot({ skipHardAudit: true });
                  return await downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
                } catch (e2) {
                  showToast("无法另存: " + (e2.message || e2), 4000);
                }
              }
              return { ok: false, error: result.error, code: "ANNOTATION_ANCHOR_AUDIT_FAILED" };
            }
      if (result.error) {
        showToast("保存失败: " + result.error);
        setStatus("保存失败", result.error);
      }
      return result;
    }

    // No write handle: explain + recommend .mentor
        let snapshot;
        try {
          snapshot = createSaveSnapshot();
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          const isAudit = (e && e.code === "ANNOTATION_ANCHOR_AUDIT_FAILED") || /ANNOTATION_ANCHOR_AUDIT_FAILED|批注锚点/.test(msg);
          if (isAudit) {
            const issueCount = (e && e.audit && e.audit.length) || (State._lastAnchorAudit && State._lastAnchorAudit.errors || []).length || 1;
            const choice = await openSaveDialog(buildSaveDialogModel({ kind: "anchor-audit", fileName: State.currentFile?.name, issueCount }));
            if (choice === "secondary") {
              try {
                const snap = createSaveSnapshot({ skipHardAudit: true });
                return await downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
              } catch (e2) {
                showToast("无法另存诊断副本: " + (e2.message || e2), 4000);
              }
            }
            return { ok: false, error: msg, code: "ANNOTATION_ANCHOR_AUDIT_FAILED" };
          }
          showToast("保存失败: " + msg, 4000);
          return { ok: false, error: msg };
        }
    const model = buildSaveDialogModel({
      kind: "no-handle",
      fileName: snapshot.name,
      annotations: (snapshot.sidecar && snapshot.sidecar.annotations || []).length,
      references: (snapshot.references && snapshot.references.entries || []).length,
      media: Object.keys(snapshot.mediaFiles || {}).length,
    });
    const choice = await openSaveDialog(model);
    if (choice === "primary") {
      try {
        await AnnotationStore.put(snapshot.name, snapshot.sidecar);
      } catch {}
      return await downloadMentorSnapshot(snapshot, { markCleanOnSuccess: true });
    }
    if (choice === "secondary") {
      return await exportMarkdownSnapshot(snapshot, { markCleanOnSuccess: false });
    }
    return { ok: false, cancelled: true };
  } finally {
    State._toolbarBusy = false;
    try { syncToolbarActionState(); } catch {}
  }
}


async function saveCurrent() {
  return runManualSave();
}
/**
 * Legacy API (tests / plugins): write given mentor payload to current handle.
 * Prefer saveCurrent / writeCurrentToHandle for normal UI paths.
 */
async function tryWriteBackMentor(mdText, sidecar, mentorName) {
  // Compatibility wrapper: prefer the canonical official-commit path when the
  // active document is a mentor handle. Still returns { handle: true|false }.
  if (!(State.saveMode === "mentor-handle" && State.currentFile && State.currentFile.handle)) {
    return { handle: false, deprecated: true };
  }
  try {
    // If caller supplied arbitrary payload that differs from the live editor,
    // still write bytes then finalize from a synthetic snapshot so draft/version
    // stay aligned with what hit disk.
    const liveSnap = (() => {
      try { return createSaveSnapshot(); } catch (_) { return null; }
    })();
    const payloadMatchesLive = !!(
      liveSnap &&
      typeof mdText === "string" &&
      liveSnap.mdText === mdText
    );
    if (payloadMatchesLive) {
      const result = await writeCurrentToHandle({ reason: "manual", showProgress: true });
      return {
        handle: !!result.ok,
        deprecated: true,
        ok: !!result.ok,
        warnings: result.warnings || [],
        error: result.error,
      };
    }
    const handle = State.currentFile.handle;
    const perm = await ensureWritePermission(handle);
    if (perm === "denied") return { handle: false, deprecated: true, error: "权限被拒" };
    showExportProgress("正在打包 .mentor…");
    const blob = await buildMentorZipBlob(
      mdText,
      sidecar,
      State.mediaFiles,
      State.references,
      { documentHtml: State.editor ? htmlWithMediaPaths(State.editor.getHTML(), State.mediaUrls) : undefined }
    );
    const wr = await writeToHandle(handle, blob);
    if (!wr.ok) {
      hideExportProgress("保存失败");
      return { handle: false, deprecated: true, error: wr.error || "写盘失败" };
    }
    let diskMtime = 0;
    try {
      const nf = await handle.getFile();
      diskMtime = nf.lastModified || 0;
    } catch (_) {}
    const snapshot = {
      tabId: State.activeTabId,
      documentId: State.currentFile.documentId || State.activeTabId,
      name: mentorName || State.currentFile.name,
      handle,
      dirtyGen: State.currentFile.dirtyGen || 0,
      saveMode: State.saveMode,
      fileMtime: State.fileMtime,
      mdText: typeof mdText === "string" ? mdText : "",
      documentHtml: State.editor ? htmlWithMediaPaths(State.editor.getHTML(), State.mediaUrls) : "",
      sidecar: sidecar || { version: "1", annotations: [] },
      mediaFiles: State.mediaFiles || {},
      references: State.references || emptyReferenceManifest(),
    };
    const finalized = await finalizeOfficialCommit(snapshot, {
      reason: "manual",
      diskMtime,
      captureVersion: true,
    });
    hideExportProgress("已保存");
    return {
      handle: true,
      deprecated: true,
      ok: true,
      warnings: finalized.warnings || [],
    };
  } catch (e) {
    hideExportProgress("保存失败");
    if (e && e.name === "NotAllowedError") return { handle: false, deprecated: true, error: "权限被拒" };
    return { handle: false, deprecated: true, error: e && e.message ? e.message : String(e) };
  }
}

async function tryWriteBack(mdText, sidecarText, sidecarName) {
  if (!(State.currentFile && State.currentFile.handle)) {
    return { handle: false };
  }
  try {
    await ensureWritePermission(State.currentFile.handle);
    if (State.fileMtime != null) {
      try {
        const currentFile = await State.currentFile.handle.getFile();
        const currentMtime = currentFile.lastModified;
        if (currentMtime > State.fileMtime) {
          const ok = confirm(
            `\u26A0 \u4E3B\u6587\u4EF6\u5728\u5916\u90E8\u88AB\u4FEE\u6539!

\u4F60\u6700\u540E\u4E00\u6B21\u6253\u5F00/\u4FDD\u5B58: ${new Date(State.fileMtime).toLocaleTimeString()}
\u5F53\u524D\u6587\u4EF6 mtime: ${new Date(currentMtime).toLocaleTimeString()}

\u7EE7\u7EED\u4FDD\u5B58\u4F1A\u8986\u76D6\u5916\u90E8\u4FEE\u6539\u3002

\u786E\u5B9A\u8981\u8986\u76D6\u5417? (\u5EFA\u8BAE\u5148\u53D6\u6D88, \u5907\u4EFD\u5916\u90E8\u6539\u52A8, \u518D\u5408\u5E76)`
          );
          if (!ok) {
            return { handle: false, error: "\u7528\u6237\u53D6\u6D88: \u68C0\u6D4B\u5230\u5916\u90E8\u4FEE\u6539" };
          }
        }
      } catch (e) {
        console.warn("[P0-C] mtime \u68C0\u67E5\u5931\u8D25:", e);
      }
    }
    const wr = await writeToHandle(State.currentFile.handle, mdText);
    if (!wr.ok) {
      return { handle: false, error: wr.error || "\u5199\u76D8\u5931\u8D25" };
    }
    try {
      const newFile = await State.currentFile.handle.getFile();
      State.fileMtime = newFile.lastModified;
    } catch {
    }
    return { handle: true };
  } catch (e) {
    if (e && e.name === "NotAllowedError") return { handle: false, error: "\u6743\u9650\u88AB\u62D2" };
    return { handle: false, error: e && e.message ? e.message : String(e) };
  }
}
function downloadFile(name, content) {
  const blob = new Blob([content], { type: name.endsWith(".json") ? "application/json" : "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function exportMd() {
  if (!State.editor || !State.currentFile) {
    showToast("请先打开或新建文档", 2e3);
    return;
  }
  const html = State.editor.getHTML();
  let mdText = htmlToMarkdown(html);
  // v1.45.7+: when semantic BIBLIOGRAPHY marker is present, materialize a
  // readable # References block for export (one-shot, single replacement).
  if (mdText.indexOf(BIBLIOGRAPHY_MARKER) !== -1) {
    const refConfig = normalizeBibliographyConfig(
      (State.references && State.references.bibliography) || { enabled: true, scope: "cited", heading: "References" }
    );
    const model = buildBibliographyModel(State.references || emptyReferenceManifest(), _collectCitationKeys(State.editor.state.doc), refConfig);
    mdText = materializeBibliographyMarkdown(mdText, model);
  }
  const baseName = (State.currentFile.name || "untitled").replace(/\.(md|markdown|mentor)$/i, "");
  const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });
  downloadBlob(`${baseName}.md`, blob);
  const _mdCopy = buildSaveResultCopy({ kind: "export-md", fileName: `${baseName}.md` });
  setStatus(_mdCopy.status, _mdCopy.detail);
  showToast(`${_mdCopy.status} · ${_mdCopy.detail}`, 2500);
}
async function exportDocx() {
  // DOCX export: body + Word comment threads when State.annotations has non-pending threads.
  // Never clears dirty; references library is not embedded (use .mentor for full pack).
  if (!State.editor || !State.currentFile) {
    showToast("请先打开文档");
    return;
  }
  if (typeof JSZip === "undefined") {
    showToast("JSZip 未加载, 无法导出 docx", 3e3);
    return;
  }
  const annotations = Array.isArray(State.annotations) ? State.annotations : [];
  const hasAnns = annotations.some((t) => t && t.pending !== true && Array.isArray(t.comments) && t.comments.some((c) => String((c && c.body) || "").trim()));
  showExportProgress(hasAnns ? "正在生成 .docx（含批注）…" : "正在生成 .docx…");
  showToast(hasAnns ? "正在生成 .docx（含批注）…" : "正在生成 .docx…", 1800);
  try {
    const html = State.editor.getHTML();
    const zip = await buildDocxBlob(html, State.mediaFiles || {}, annotations);
    const baseName = (State.currentFile.name || "untitled").replace(/\.(md|markdown|mentor)$/i, "");
    downloadBlob(`${baseName}.docx`, zip);
    hideExportProgress(hasAnns ? "已导出（含批注）" : "已导出");
    const _docxCopy = buildSaveResultCopy({
      kind: "export-docx",
      fileName: `${baseName}.docx`,
      hasAnnotations: hasAnns
    });
    setStatus(_docxCopy.status, _docxCopy.detail);
    showToast(`${_docxCopy.status} · ${_docxCopy.detail}`, 2800);
  } catch (e) {
    console.error("[exportDocx] 失败:", e);
    hideExportProgress("导出失败");
    showToast("导出 docx 失败: " + (e.message || "未知错误"), 4e3);
  }
}
/**
 * Inject Word comment range markers into bodyXml for root comment entries.
 * Paragraph-granular first-match: wrap the first <w:p> whose plain text contains
 * the thread quote. Replies share the root range (no separate markers).
 */

function injectCommentRangeMarkers(bodyXml, commentsParts) {
  if (!commentsParts || !Array.isArray(commentsParts.commentEntries)) return bodyXml;
  const roots = commentsParts.commentEntries.filter((e) => e && e.isRoot);
  if (!roots.length) return bodyXml;

  function paraPlainText(pXml) {
    let t = "";
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(pXml)) !== null) t += m[1];
    return t;
  }

  function wrapPara(pXml, commentId) {
    // Keep optional <w:pPr>...</w:pPr> at front; wrap the rest of the content.
    const openEnd = pXml.indexOf(">");
    if (openEnd < 0) return pXml;
    const closeIdx = pXml.lastIndexOf("</w:p>");
    if (closeIdx < 0) return pXml;
    const openTag = pXml.slice(0, openEnd + 1);
    const inner = pXml.slice(openEnd + 1, closeIdx);
    const pPrMatch = inner.match(/^(\s*<w:pPr\b[\s\S]*?<\/w:pPr>)/);
    const pPr = pPrMatch ? pPrMatch[1] : "";
    const rest = pPrMatch ? inner.slice(pPrMatch[1].length) : inner;
    const id = String(commentId);
    return (
      openTag +
      pPr +
      `<w:commentRangeStart w:id="${id}"/>` +
      rest +
      `<w:commentRangeEnd w:id="${id}"/>` +
            `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>` +
            "</w:p>"
          );
  }

  // Split body into paragraph chunks while preserving non-p content order.
  // Match each top-level <w:p ...>...</w:p> (non-greedy, no nesting of p in this emitter).
  const parts = [];
  const reP = /<w:p\b[\s\S]*?<\/w:p>/g;
  let last = 0;
  let m;
  const src = String(bodyXml || "");
  while ((m = reP.exec(src)) !== null) {
    if (m.index > last) parts.push({ type: "raw", xml: src.slice(last, m.index) });
    parts.push({ type: "p", xml: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ type: "raw", xml: src.slice(last) });

  const usedQuoteKeys = new Set();
  for (const entry of roots) {
    const quote = String(entry.quoteText || "").trim();
    // Empty quote: attach to first unused paragraph if any.
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type !== "p") continue;
      if (parts[i]._used) continue;
      const plain = paraPlainText(parts[i].xml);
      const hit = quote ? plain.includes(quote) : plain.length > 0;
      if (!hit) continue;
      // Avoid double-wrapping same quote key across threads if identical quote
      const key = quote || `__p${i}`;
      if (quote && usedQuoteKeys.has(key) && plain.indexOf(quote) === plain.lastIndexOf(quote)) {
        // same single occurrence already claimed — still allow if paragraph not used
      }
      parts[i] = { type: "p", xml: wrapPara(parts[i].xml, entry.commentId), _used: true };
      if (quote) usedQuoteKeys.add(key);
      break;
    }
  }

  return parts.map((p) => p.xml).join("");
}
async function buildDocxBlob(html, mediaFiles, annotations = []) {
  if (typeof JSZip === "undefined") throw new Error("JSZip not loaded");
  const zip = new JSZip();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  // Replace raw Pandoc citations (when callers pass plain HTML strings) with
  // the same lightweight author-year labels shown by the editor.
  const entryMapForDocx = new Map((State.references.entries || []).map((e) => [e.key, e]));
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const textNode of textNodes) {
    const value = textNode.nodeValue || "";
    if (!value.includes("[@") && !value.includes("[-@")) continue;
    const parts = value.split(/(\[(?:-?@[\w:.\/-]+(?:\s*,\s*[^;\]]+)?)(?:\s*;\s*-?@[\w:.\/-]+(?:\s*,\s*[^;\]]+)?)*\])/g);
    if (parts.length < 2) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (/^\[-?@/.test(part)) {
        try { frag.appendChild(document.createTextNode(formatCitationLabel(parseCitationSyntax(part), entryMapForDocx).text)); }
        catch (_) { frag.appendChild(document.createTextNode(part)); }
      } else frag.appendChild(document.createTextNode(part));
    }
    textNode.replaceWith(frag);
  }
  const imageMap = /* @__PURE__ */ new Map();
  async function inlineImage(imgEl) {
    const src = imgEl.getAttribute("src");
    if (!src) return null;
    if (imageMap.has(src)) return imageMap.get(src);
    const filename = `media/image${imageMap.size + 1}.${(src.match(/\.(png|jpe?g|gif|svg)(\?|$)/i) || [, ".png"])[1] || "png"}`;
    try {
      let blob;
      if (src.startsWith("blob:")) {
        const r = await fetch(src);
        blob = await r.blob();
      } else if (src.startsWith("http://") || src.startsWith("https://")) {
        const r = await fetch(src);
        blob = await r.blob();
      } else if (mediaFiles[src]) {
        blob = mediaFiles[src];
      } else {
        return null;
      }
      const ext = (blob.type.split("/")[1] || "png").replace(/^jpeg/, "jpg");
      const actualFilename = `media/image${imageMap.size + 1}.${ext}`;
      zip.file(`word/${actualFilename}`, blob);
      const rId2 = `rId${imageMap.size + 1}`;
      const info = { rId: rId2, fileName: actualFilename };
      imageMap.set(src, info);
      return info;
    } catch (e) {
      console.warn("[buildDocxBlob] \u56FE\u7247\u8BFB\u53D6\u5931\u8D25:", src, e);
      return null;
    }
  }
  let pCount = 0, rId = 100;
  function makeRun(text2, opts = {}) {
    const text22 = esc(text2).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
    let rpr = "";
    if (opts.bold) rpr += "<w:b/>";
    if (opts.italic) rpr += "<w:i/>";
    if (opts.underline) rpr += '<w:u w:val="single"/>';
    if (opts.code) {
      rpr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
      rpr += '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>';
    }
    const rprEl = rpr ? `<w:rPr>${rpr}</w:rPr>` : "";
    return `<w:r>${rprEl}<w:t xml:space="preserve">${text22}</w:t></w:r>`;
  }
  function makePara(content, opts = {}) {
    const pPrParts = [];
    if (opts.style) pPrParts.push(`<w:pStyle w:val="${opts.style}"/>`);
    if (opts.align) pPrParts.push(`<w:jc w:val="${opts.align}"/>`);
    const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
    return `<w:p>${pPr}${content}</w:p>`;
  }
  function makeImageRun(imageInfo, altText, w, h) {
    const wp = w ? `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${Math.round(w * 9525)}" cy="${Math.round(h * 9525)}"/><wp:docPr id="${imageInfo.id}" name="Picture ${imageInfo.id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageInfo.id}" name="img${imageInfo.id}.${imageInfo.ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${imageInfo.rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>` : `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="3000000" cy="2000000"/><wp:docPr id="${imageInfo.id}" name="Picture ${imageInfo.id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imageInfo.id}" name="img${imageInfo.id}.${imageInfo.ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${imageInfo.rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
    return `<w:r><w:rPr/>${wp}</w:r>`;
  }
  function processBlock(block, indentLevel = 0) {
    pCount++;
    const id = pCount;
    if (block.tagName === "IMG") {
      const src = block.getAttribute("src");
      return makePara(makeImageRun({ id, rId: "REL_PLACEHOLDER", ext: "png" }, block.alt, 300, 200));
    }
    if (/^H[1-6]$/.test(block.tagName)) {
      const level = parseInt(block.tagName[1]);
      return makePara(makeRun(block.textContent), { style: `Heading${Math.min(level, 9)}` });
    }
    if (block.tagName === "BLOCKQUOTE") {
      return makePara(makeRun(block.textContent), { style: "Quote" });
    }
    if (block.tagName === "PRE") {
      const text2 = block.textContent;
      return makePara(makeRun(text2, { code: true }), { style: "Code" });
    }
    if (block.tagName === "HR") {
      return makePara("<w:r><w:hr/></w:r>");
    }
    if (block.tagName === "UL" || block.tagName === "OL") {
      const items = Array.from(block.children).filter((c) => c.tagName === "LI");
      const isOrdered = block.tagName === "OL";
      let out = "";
      for (const li of items) {
        const innerBlocks = Array.from(li.children).filter((c) => !/^UL$|^OL$/.test(c.tagName));
        const nestedLists = Array.from(li.children).filter((c) => /^UL$|^OL$/.test(c.tagName));
        const innerText = innerBlocks.map((ib) => ib.textContent).join(" ").trim();
        out += makePara(makeRun((isOrdered ? "1. " : "\u2022 ") + innerText || "\u2022"));
        for (const nested of nestedLists) {
          out += processBlock(nested, indentLevel + 1);
        }
      }
      return out;
    }
    return makePara(processInlineContent(block));
  }
  function processInlineContent(node) {
    let out = "";
    const TXT = 3;
    const ELEM = 1;
    for (const child of node.childNodes) {
      const t = child.nodeType;
      if (t === TXT) {
        out += makeRun(child.nodeValue || "");
      } else if (t === ELEM) {
        const tag = child.tagName;
        if (tag === "STRONG" || tag === "B") {
          out += makeRun(child.textContent || "", { bold: true });
        } else if (tag === "EM" || tag === "I") {
          out += makeRun(child.textContent || "", { italic: true });
        } else if (tag === "CODE") {
          out += makeRun(child.textContent || "", { code: true });
        } else if (tag === "A") {
          out += makeRun(child.textContent || "", { underline: true });
        } else if (tag === "IMG") {
          out += "";
        } else {
          out += makeRun(child.textContent || "");
        }
      }
    }
    return out;
  }
  const blocks = Array.from(wrapper.children);
  let bodyXml = "";
  const blockEls = blocks.length > 0 ? blocks : Array.from(wrapper.querySelectorAll("p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr"));
  // v1.47+: build comment thread parts first so we can post-process bodyXml
  // to inject <w:commentRangeStart>/<w:commentRangeEnd>/<w:commentReference>
  // markers around the quoted anchor text. Empty annotations short-circuit
  // the entire pipeline so legacy verify-export-buttons stays green.
  const commentsParts = Array.isArray(annotations) && annotations.length
    ? buildCommentsParts(annotations)
    : null;
  function flattenBlocks(parent, list = []) {
    for (const child of parent.children) {
      const tag = child.tagName;
      if (/^(P|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|DIV|IMG)$/.test(tag)) {
        list.push(child);
      }
      if (tag === "UL" || tag === "OL" || tag === "DIV") {
        flattenBlocks(child, list);
      }
    }
    return list;
  }
  const flatBlocks = flattenBlocks(wrapper);
  for (const b of flatBlocks) {
    if (b.tagName === "IMG") {
      await inlineImage(b);
    }
  }
  // v1.45.7+: look for a BibliographyNode position via [data-mentor-bibliography]
  const bibliographyPositions = [];
  for (let i = 0; i < flatBlocks.length; i++) {
    if (flatBlocks[i].getAttribute && flatBlocks[i].getAttribute("data-mentor-bibliography") === "true") {
      bibliographyPositions.push(i);
    }
  }
  const bibliographyModel = bibliographyPositions.length
    ? buildBibliographyModel(
        State.references || emptyReferenceManifest(),
        _collectCitationKeysFromHtml(html || ""),
        normalizeBibliographyConfig(
          (State.references && State.references.bibliography) || { enabled: true, scope: "cited", heading: "References" }
        )
      )
    : null;
  function emitBibliographyHeading(label) {
    return makePara(makeRun(label || "References"), { style: "Heading1" });
  }
  function emitBibliographyEntries(items) {
    let x = "";
    for (const it of items || []) {
      const line = (it && (it.markdown || it.plainText)) || "";
      x += makePara(makeRun(line));
    }
    return x;
  }
  for (const b of flatBlocks) {
    if (b.tagName === "IMG") {
      const info = imageMap.get(b.getAttribute("src"));
      let w = 0, h = 0;
      try {
        if (b.naturalWidth) {
          w = b.naturalWidth / 96;
          h = b.naturalHeight / 96;
        }
      } catch (e) {
      }
      const rIdForImg = info ? info.rId : null;
      const fileName = info ? info.fileName : null;
      let cx = 5760, cy = 4320;
      if (w && h) {
        if (w > 6) {
          const scale = 6 / w;
          w *= scale;
          h *= scale;
        }
        cx = Math.round(w * 1440);
        cy = Math.round(h * 1440);
      }
      pCount++;
      const imgId = pCount;
      const runXml = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${imgId}" name="Picture ${imgId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imgId}" name="Picture ${imgId}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rIdForImg}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
            bodyXml += `<w:p>${runXml}</w:p>`;
      continue;
    }
    if (bibliographyPositions.includes(flatBlocks.indexOf(b))) {
      bodyXml += emitBibliographyHeading(bibliographyModel && bibliographyModel.heading);
      bodyXml += emitBibliographyEntries(bibliographyModel && bibliographyModel.items);
    }
    bodyXml += processBlock(b);
  }
  // v1.45.7+: only emit a fallback References block at end-of-doc when no
  // bibliography atom present AND the doc currently has handwritten ## References
  // (kicked off by 'cited' count heuristic for legacy parity).
  if (bibliographyPositions.length === 0) {
    const cited = new Set();
    const sourceForCites = String(html || "");
    for (const entry of State.references.entries || []) {
      if (sourceForCites.includes(`@${entry.key}`)) cited.add(entry.key);
    }
    if (cited.size) {
      bodyXml += makePara(makeRun("References"), { style: "Heading1" });
      for (const entry of State.references.entries || []) {
        if (!cited.has(entry.key)) continue;
        const rendered = formatReferenceEntry(entry);
        const line = [rendered.authors, rendered.year ? `(${rendered.year}).` : "", rendered.title ? `${rendered.title}.` : "", rendered.journal].filter(Boolean).join(" ");
        bodyXml += makePara(makeRun(line));
      }
    }
  }
  // v1.47+: wrap each root thread's anchor text with commentRangeStart/End +
  // commentReference markers. Replies don't get separate ranges — they share
  // the root's range. First-match-per-thread keeps the mapping unambiguous
  // even when the same word appears in multiple paragraphs.
  if (commentsParts && commentsParts.commentEntries.length) {
    bodyXml = injectCommentRangeMarkers(bodyXml, commentsParts);
  }
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  zip.file("_rels/.rels", rels);
  let imgRels = "";
  let imageSeq = 1;
  for (const [src, info] of imageMap.entries()) {
    imgRels += `  <Relationship Id="${info.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${info.fileName.replace(/^media\//, "")}"/>
`;
  }
  // Comment part relationships (after images + core styles). rId numbers continue after images.
      let commentRels = "";
      // Always wire styles/settings/fontTable so Word accepts the package.
      let nextRel = imageMap.size + 1;
      const corePartRels =
        `  <Relationship Id="rId${nextRel++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ` +
        `  <Relationship Id="rId${nextRel++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  ` +
        `  <Relationship Id="rId${nextRel++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  `;
      const hasCommentParts = !!(commentsParts && commentsParts.commentEntries && commentsParts.commentEntries.length);
    if (hasCommentParts) {
      commentRels += `  <Relationship Id="rId${nextRel++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
  `;
      commentRels += `  <Relationship Id="rId${nextRel++}" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>
  `;
      commentRels += `  <Relationship Id="rId${nextRel++}" Type="http://schemas.microsoft.com/office/2016/09/relationships/commentsIds" Target="commentsIds.xml"/>
  `;
      commentRels += `  <Relationship Id="rId${nextRel++}" Type="http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible" Target="commentsExtensible.xml"/>
  `;
      if (commentsParts.peopleXml) {
        commentRels += `  <Relationship Id="rId${nextRel++}" Type="http://schemas.microsoft.com/office/2011/relationships/people" Target="people.xml"/>
  `;
      }
    }
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${imgRels}${corePartRels}${commentRels}</Relationships>`;
    zip.file("word/_rels/document.xml.rels", docRels);
    let types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Default Extension="png" ContentType="image/png"/>
    <Default Extension="jpg" ContentType="image/jpeg"/>
    <Default Extension="jpeg" ContentType="image/jpeg"/>
    <Default Extension="gif" ContentType="image/gif"/>
    <Default Extension="svg" ContentType="image/svg+xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
    <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`;
    if (hasCommentParts) {
      types += `
    <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
    <Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>
    <Override PartName="/word/commentsIds.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml"/>
        <Override PartName="/word/commentsExtensible.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml"/>`;
          if (commentsParts.peopleXml) {
            types += `
        <Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/>`;
          }
    }
    types += `
  </Types>`;
    zip.file("[Content_Types].xml", types);
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
       xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"
       xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
       xmlns:o="urn:schemas-microsoft-com:office:office"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
       xmlns:v="urn:schemas-microsoft-com:vml"
       xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
       xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
       xmlns:w10="urn:schemas-microsoft-com:office:word"
       xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
       xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
       xmlns:wpg="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingGroup"
       xmlns:wpi="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingInk"
       xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
       xmlns:wps="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingShape"
       mc:Ignorable="w14 w15 wp14">
<w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;
  zip.file("word/document.xml", docXml);
    // Word requires these core parts (even stubs) or it reports "file may be corrupted".
    zip.file(
      "word/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
    <w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
      <w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
  </w:styles>`
    );
    zip.file(
      "word/settings.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/></w:settings>`
    );
    zip.file(
      "word/fontTable.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Calibri"><w:panose1 w:val="020F0502020204030204"/></w:font><w:font w:name="Times New Roman"/><w:font w:name="Consolas"/></w:fonts>`
    );
    if (hasCommentParts) {
    zip.file("word/comments.xml", commentsParts.commentsXml);
    zip.file("word/commentsExtended.xml", commentsParts.commentsExtendedXml);
    zip.file("word/commentsIds.xml", commentsParts.commentsIdsXml);
    zip.file("word/commentsExtensible.xml", commentsParts.commentsExtensibleXml);
    if (commentsParts.peopleXml) zip.file("word/people.xml", commentsParts.peopleXml);
  }
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
              xmlns:dc="http://purl.org/dc/elements/1.1/"
              xmlns:dcterms="http://purl.org/dc/terms/"
              xmlns:dcmitype="http://purl.org/dc/dcmitype/"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Mentor \u5BFC\u51FA\u6587\u6863</dc:title>
  <dc:creator>${esc(State.author || "Mentor")}</dc:creator>
  <cp:lastModifiedBy>${esc(State.author || "Mentor")}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
  zip.file("docProps/core.xml", coreXml);
  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
          xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Mentor Markdown Editor</Application>
  <DocSecurity>0</DocSecurity>
  <AppVersion>1.0</AppVersion>
</Properties>`;
  zip.file("docProps/app.xml", appXml);
  return await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}

function newDocument() {
  openNewTabBlank();
}
function _emptyBodyLen() {
  try {
    if (State.editor) {
      const n = (State.editor.state.doc.textContent || "").trim().length;
      if (n > 0) return n;
    }
  } catch {
  }
  if (State.currentFile && typeof State.currentFile.content === "string") {
    return State.currentFile.content.trim().length;
  }
  return 0;
}
function syncCommentEmptyPresentation() {
  const empty4 = $("#comment-empty");
  if (!empty4) return;
  const h2 = empty4.querySelector("h2");
  const lead = empty4.querySelector(".hint-lead");
  const steps = empty4.querySelector(".empty-hint-steps");
  const totalAnn = (State.annotations || []).filter((t) => t && typeof t === "object" && t.threadId).length;
  if (totalAnn > 0) {
    empty4.dataset.emptyMode = "filter";
    if (h2) h2.textContent = "\u5F53\u524D\u7B5B\u9009\u4E0B\u65E0\u6279\u6CE8";
    if (lead) lead.textContent = "\u5207\u6362\u4E0A\u65B9\u300C\u5168\u90E8 / \u672A\u89E3\u51B3 / \u5DF2\u89E3\u51B3\u300D\u67E5\u770B\u5176\u5B83\u6279\u6CE8";
    if (steps) steps.classList.add("hidden");
    return;
  }
  const hasFile = !!(State.currentFile && State.currentFile.name);
  const bodyLen = _emptyBodyLen();
  if (hasFile && bodyLen > 0) {
    empty4.dataset.emptyMode = "doc";
    if (h2) h2.textContent = "\u8FD8\u6CA1\u6709\u6279\u6CE8";
    if (lead) lead.textContent = "\u62D6\u9009\u6B63\u6587\u4EFB\u610F\u6587\u5B57, \u70B9\u300C\u6279\u6CE8\u300D\u5373\u53EF\u6DFB\u52A0\u5230\u672C\u7BC7";
    if (steps) steps.classList.remove("hidden");
    return;
  }
  empty4.dataset.emptyMode = "cold";
  if (h2) h2.textContent = "\u8FD8\u6CA1\u6709\u6279\u6CE8";
  if (lead) lead.textContent = "\u50CF docx \u4E00\u6837, \u62D6\u9009\u4EFB\u610F\u6587\u5B57\u5373\u53EF\u52A0\u6279\u6CE8, \u70B9 ? \u770B\u793A\u4F8B";
  if (steps) steps.classList.remove("hidden");
}
async function openRecentFileByName(name) {
  if (!name) return false;
  try {
    const handle = await HandleStore.getFile(name);
    if (!handle) {
      showToast("\u6587\u4EF6\u53E5\u67C4\u5DF2\u5931\u6548, \u5DF2\u4ECE\u5217\u8868\u79FB\u9664 \u2014 \u8BF7\u624B\u52A8\u6253\u5F00", 3500);
      try {
        await HandleStore.deleteFile(name);
      } catch {
      }
      refreshFileListDropdown();
      return false;
    }
    let perm = "prompt";
    try {
      perm = await handle.queryPermission({ mode: "readwrite" });
    } catch {
    }
    if (perm !== "granted") {
      try {
        const np = await handle.requestPermission({ mode: "readwrite" });
        if (np !== "granted") {
          showToast("\u672A\u83B7\u5F97\u6743\u9650\u3002\u53EF\u70B9 \xD7 \u4ECE\u6700\u8FD1\u5217\u8868\u79FB\u9664", 3500);
          return false;
        }
      } catch (err) {
        showToast("\u6743\u9650\u8BF7\u6C42\u5931\u8D25\u3002\u53EF\u70B9 \xD7 \u4ECE\u6700\u8FD1\u5217\u8868\u79FB\u9664", 3500);
        return false;
      }
    }
    if (_isMentorName(name)) {
      await openFromMentorHandle(handle);
    } else if (_isMdName(name)) {
      await openFromHandle(handle);
    } else {
      // Unknown extension: try mentor first (zip), else md path
      try {
        await openFromMentorHandle(handle);
      } catch (e) {
        await openFromHandle(handle);
      }
    }
    closeFileListDropdown();
    refreshFileListDropdown();
    renderFilePaneCurrent();
    return true;
  } catch (err) {
    console.warn("[file-list] open failed", err);
    const msg = err && err.name || "";
    if (msg === "NotFoundError" || msg === "InvalidStateError" || /not found|invalid/i.test(String(err.message || ""))) {
      try {
        await HandleStore.deleteFile(name);
      } catch {
      }
      showToast("\u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728\u6216\u53E5\u67C4\u5931\u6548, \u5DF2\u79FB\u9664", 3500);
      refreshFileListDropdown();
    } else {
      showToast("\u6253\u5F00\u5931\u8D25: " + (err.message || err), 3e3);
    }
    return false;
  }
}
function closeFileListDropdown() {
  const wrap2 = document.querySelector("#file-list-wrap");
  const dd = document.querySelector("#file-list-dropdown");
  const trigger = document.querySelector("#file-list-trigger");
  if (dd) dd.classList.add("hidden");
  if (wrap2) wrap2.classList.remove("is-open");
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", positionFileListDropdown);
    window.removeEventListener("scroll", positionFileListDropdown, true);
  }
}
/** 顶栏 overflow 会裁切 absolute 下拉；改为 fixed 并贴合 trigger */
function positionFileListDropdown() {
  const dd = document.querySelector("#file-list-dropdown");
  const trigger = document.querySelector("#file-list-trigger");
  if (!dd || !trigger || dd.classList.contains("hidden")) return;
  const r = trigger.getBoundingClientRect();
  const width = Math.min(340, Math.max(220, window.innerWidth * 0.7));
  let left = r.right - width;
  if (left < 8) left = 8;
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - 8 - width);
  }
  let top = r.bottom + 4;
  const maxH = Math.min(360, window.innerHeight * 0.5);
  if (top + Math.min(maxH, 160) > window.innerHeight - 8) {
    // 下方空间不足时翻到 trigger 上方
    top = Math.max(8, r.top - 4 - Math.min(maxH, dd.offsetHeight || 200));
  }
  dd.style.top = `${Math.round(top)}px`;
  dd.style.left = `${Math.round(left)}px`;
  dd.style.width = `${Math.round(width)}px`;
  dd.style.right = "auto";
}
function openFileListDropdown() {
  const dd = document.querySelector("#file-list-dropdown");
  if (!dd) return;
  const show = () => {
    dd.classList.remove("hidden");
    document.querySelector("#file-list-wrap")?.classList.add("is-open");
    document.querySelector("#file-list-trigger")?.setAttribute("aria-expanded", "true");
    positionFileListDropdown();
    // 下一帧再定位一次（列表异步填充后高度变化）
    requestAnimationFrame(() => positionFileListDropdown());
    window.addEventListener("resize", positionFileListDropdown);
    window.addEventListener("scroll", positionFileListDropdown, true);
  };
  // 列表刷新失败也不挡住打开（至少能看到「打开其他文件」）
  Promise.resolve(refreshFileListDropdown()).then(show, show);
}
function toggleFileListDropdown() {
  const dd = document.querySelector("#file-list-dropdown");
  if (!dd) return;
  if (dd.classList.contains("hidden")) openFileListDropdown();
  else closeFileListDropdown();
}
async function refreshFileListDropdown() {
  const list = document.querySelector("#file-list-items");
  const empty4 = document.querySelector("#file-list-empty");
  if (!list) return;
  try {
    const files = await HandleStore.listFiles();
    const rows = (files || []).slice(0, 12);
    const cur = State.currentFile?.name || "";
    if (rows.length === 0) {
      list.innerHTML = "";
      if (empty4) empty4.classList.remove("hidden");
      return;
    }
    if (empty4) empty4.classList.add("hidden");
    list.innerHTML = rows.map((f) => {
      const when = f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "";
      const isCur = f.name === cur ? " is-current" : "";
      return `<div class="file-list-row${isCur}" data-name="${escapeHtml(f.name)}" role="option" aria-selected="${f.name === cur ? "true" : "false"}">
        <button type="button" class="file-list-item" data-act="open" title="${escapeHtml(when || f.name)}">
          <span class="file-list-item-name">${escapeHtml(f.name)}</span>
          <span class="file-list-item-time">${escapeHtml(when)}</span>
        </button>
        <button type="button" class="file-list-forget" data-act="forget" title="\u4ECE\u6700\u8FD1\u5217\u8868\u79FB\u9664">\xD7</button>
      </div>`;
    }).join("");
    list.querySelectorAll(".file-list-row").forEach((row) => {
      const name = row.dataset.name;
      if (!name) return;
      row.querySelector('[data-act="forget"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await HandleStore.deleteFile(name);
          const last = await HandleStore.getLastFile();
          if (last && last.fileName === name) await HandleStore.removeLastFile();
          showToast("\u5DF2\u4ECE\u6700\u8FD1\u5217\u8868\u79FB\u9664", 2e3);
          refreshFileListDropdown();
        } catch (err) {
          showToast("\u79FB\u9664\u5931\u8D25", 2e3);
        }
      });
      row.querySelector('[data-act="open"]')?.addEventListener("click", async () => {
        if (State.currentFile?.name === name) {
          closeFileListDropdown();
          return;
        }
        await openRecentFileByName(name);
      });
    });
  } catch (e) {
    console.warn("[file-list] list failed", e);
    list.innerHTML = "";
    if (empty4) empty4.classList.remove("hidden");
  }
}
async function refreshEmptyRecentFiles() {
  return refreshFileListDropdown();
}
function setupFileListDropdown() {
  const trigger = document.querySelector("#file-list-trigger");
  const more = document.querySelector("#file-list-open-more");
  if (trigger) {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFileListDropdown();
    });
  }
  if (more) {
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFileListDropdown();
      const openBtn = document.querySelector("#btn-open-files");
      if (openBtn) openBtn.click();
      else if (typeof openFiles === "function") openFiles();
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#file-list-wrap")) closeFileListDropdown();
  });
  document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeFileListDropdown();
    });
    refreshFileListDropdown();
  }

let _renderReferencesPane = () => {};
let _setReferencesPaneOpen = () => {};
const REFERENCE_FORM_FIELDS = ["key", "type", "authors", "year", "title", "journal", "doi", "url", "volume", "issue", "pages", "publisher"];
function collectCitationUsagePositions(key) {
  const target = String(key || "").trim();
  const usages = [];
  if (!target || !State.editor) return usages;
  State.editor.state.doc.descendants((node, pos) => {
    if (!node.type || node.type.name !== "citation") return;
    const keys = Array.isArray(node.attrs.keys) ? node.attrs.keys : [];
    if (keys.includes(target)) usages.push({ pos, node });
  });
  return usages;
}
function getCitationUsages() {
  const usages = {};
  if (!State.editor) return usages;
  State.editor.state.doc.descendants((node) => {
    if (node.type && node.type.name === "citation") for (const key of node.attrs.keys || []) usages[key] = (usages[key] || 0) + 1;
  });
  return usages;
}
function revealCitationAtPosition(pos) {
  if (!State.editor) return false;
  let dom = null;
  try {
    dom = State.editor.view.nodeDOM(pos);
  } catch (_) {}
  if (!(dom instanceof Element)) {
    try {
      const mapped = State.editor.view.domAtPos(pos);
      dom = mapped.node instanceof Element ? mapped.node : mapped.node && mapped.node.parentElement;
    } catch (_) {}
  }
  const atom = dom && dom.matches && dom.matches(".mentor-citation")
    ? dom
    : (dom && dom.closest && dom.closest(".mentor-citation")) || (dom && dom.querySelector && dom.querySelector(".mentor-citation"));
  if (!atom) return false;
  try {
    atom.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (_) {
    try { atom.scrollIntoView(true); } catch (e2) {}
  }
  return true;
}
function activateNextCitationUsage(key) {
  const target = String(key || "").trim();
  const usages = collectCitationUsagePositions(target);
  if (!target || !State.editor || !usages.length) {
    State.citationNavigation = { key: target, pos: null, ordinal: 0, total: 0 };
    try { _setReferencesPaneOpen(true); } catch (_) {}
    _renderReferencesPane();
    if (target) showToast(`正文未引用 @${target}`, 1400);
    return false;
  }
  const sel = State.editor.state.selection;
  const currentIndex = usages.findIndex(({ pos }) =>
    sel instanceof NodeSelection && sel.node && sel.node.type && sel.node.type.name === "citation" && sel.from === pos
  );
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % usages.length : 0;
  const next = usages[nextIndex];
  try {
    const tr = State.editor.state.tr.setSelection(
      NodeSelection.create(State.editor.state.doc, next.pos)
    );
    tr.setMeta("addToHistory", false);
    State.editor.view.dispatch(tr);
    State.editor.view.focus();
  } catch (e) {
    console.warn("[activateNextCitationUsage]", e);
    return false;
  }
  revealCitationAtPosition(next.pos);
  State.citationNavigation = {
    key: target,
    pos: next.pos,
    ordinal: nextIndex + 1,
    total: usages.length
  };
  try { _setReferencesPaneOpen(true); } catch (_) {}
  _renderReferencesPane();
  return true;
}
function commitReferenceManifest(next, { reconcile = true } = {}) {
  State.references = normalizeReferenceManifest(next || emptyReferenceManifest());
  if (reconcile) {
    reconcileCitationNodes();
    reconcileBibliographyNode();
  }
  else _renderReferencesPane();
  markDirty();
  scheduleIdbCacheWrite();
  try { if (typeof snapshotActiveTab === "function") snapshotActiveTab(); } catch (_) {}
  return State.references;
}
function reconcileCitationNodes() {
  if (!State.editor) { _renderReferencesPane(); return; }
  const hasLibrary = !!(State.references && (State.references.entries || []).length);
  const entryMap = new Map((State.references.entries || []).map((e) => [e.key, e]));
  let tr = State.editor.state.tr, changed = false;

  // 1) Absorb leftover handwritten "Author et al." text sitting just before a
  // suppress-author citation atom (narrative form).
  if (hasLibrary) {
    const ops = [];
    State.editor.state.doc.descendants((node, pos) => {
      if (!node.type || node.type.name !== "citation") return;
      let parsed;
      try { parsed = parseCitationSyntax(node.attrs.raw); } catch (_) { return; }
      if (!parsed.items || parsed.items.length !== 1 || !parsed.items[0].suppressAuthor) return;
      const entry = entryMap.get(parsed.items[0].key);
      if (!entry) return;
      const $pos = State.editor.state.doc.resolve(pos);
      const idx = $pos.index();
      if (idx <= 0) return;
      const prev = $pos.parent.child(idx - 1);
      if (!prev || !prev.isText) return;
      const combined = `${prev.text || ""}${node.attrs.raw}`;
      const stripped = stripNarrativeAuthorBeforeSuppressCitations(combined, State.references);
      if (!stripped.endsWith(node.attrs.raw)) return;
      const newBefore = stripped.slice(0, stripped.length - node.attrs.raw.length);
      if (newBefore === (prev.text || "")) return;
      const prevPos = pos - prev.nodeSize;
      ops.push({ prevPos, prevEnd: pos, newBefore, marks: prev.marks });
    });
    // Apply from back so positions stay valid
    ops.sort((a, b) => b.prevPos - a.prevPos).forEach((op) => {
      const nodes = op.newBefore
        ? [State.editor.state.schema.text(op.newBefore, op.marks)]
        : [];
      tr = tr.replaceWith(op.prevPos, op.prevEnd, nodes);
      changed = true;
    });
  }

  // 2) Refresh labels/keys/missing on every citation atom
  // Re-scan on (possibly updated) tr.doc
  const doc2 = tr.doc;
  doc2.descendants((node, pos) => {
    if (!node.type || node.type.name !== "citation") return;
    try {
      const parsed = parseCitationSyntax(node.attrs.raw);
      const formatted = hasLibrary
        ? formatCitationLabel(parsed, entryMap)
        : { text: node.attrs.raw, missingKeys: [] };
      const attrs = { ...node.attrs, keys: parsed.items.map((i) => i.key), label: formatted.text, missingKeys: formatted.missingKeys || [] };
      if (JSON.stringify(attrs) !== JSON.stringify(node.attrs)) { tr = tr.setNodeMarkup(pos, undefined, attrs); changed = true; }
    } catch (_) {}
  });
  if (changed) { tr.setMeta("addToHistory", false); State.editor.view.dispatch(tr); }
  _renderReferencesPane();
}
function renameCitationKeyInDocument(oldKey, newKey) {
  if (!State.editor || !oldKey || !newKey || oldKey === newKey) return false;
  let tr = State.editor.state.tr, changed = false;
  State.editor.state.doc.descendants((node, pos) => {
    if (!node.type || node.type.name !== "citation") return;
    const raw = renameCitationKey(node.attrs.raw, oldKey, newKey);
    if (raw === node.attrs.raw) return;
    const info = buildCitationLabel(raw, State.references);
    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      raw,
      keys: info.keys,
      label: info.label,
      missingKeys: info.missingKeys
    });
    changed = true;
  });
  if (changed) {
    tr.setMeta("addToHistory", false);
    State.editor.view.dispatch(tr);
  }
  return changed;
}
function insertCitation(key) {
  if (!(State.references.entries || []).some((e) => e.key === key)) return false;
  // Source view: insert pandoc cite syntax at caret (contenteditable #source-view)
  if (State.renderMode === "source") {
    const sourceEl = document.querySelector("#source-view");
    const token = `[@${key}]`;
    if (sourceEl) {
      sourceEl.focus();
      let inserted = false;
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          if (sourceEl.contains(range.commonAncestorContainer)) {
            range.deleteContents();
            const node = document.createTextNode(token);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            inserted = true;
          }
        }
      } catch (_) {}
      if (!inserted) {
        try { inserted = document.execCommand("insertText", false, token); } catch (_) { inserted = false; }
      }
      if (!inserted) {
        sourceEl.innerText = (sourceEl.innerText || "") + token;
      }
      sourceEl.dispatchEvent(new Event("input", { bubbles: true }));
      markDirty();
      return true;
    }
  }
  if (!State.editor) return false;
  const sel = State.editor.state.selection;
  let pos = sel.from, selected = sel.node && sel.node.type && sel.node.type.name === "citation" ? sel.node : null;
  if (!selected) {
    const $from = State.editor.state.doc.resolve(sel.from);
    const before = $from.nodeBefore;
    const at = State.editor.state.doc.nodeAt(sel.from);
    if (before && before.type.name === "citation") { selected = before; pos = sel.from - before.nodeSize; }
    else if (at && at.type.name === "citation") { selected = at; pos = sel.from; }
  }
  if (selected) {
    const parsed = parseCitationSyntax(selected.attrs.raw);
    if (!parsed.items.some((i) => i.key === key)) parsed.items.push({ key, suppressAuthor: false, suffix: "" });
    const raw = serializeCitationSyntax(parsed), info = buildCitationLabel(raw, State.references);
    const tr = State.editor.state.tr.setNodeMarkup(pos, undefined, { ...selected.attrs, raw, keys: info.keys, label: info.label, missingKeys: info.missingKeys });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    State.editor.view.dispatch(tr);
  } else {
    const raw = `[@${key}]`, info = buildCitationLabel(raw, State.references);
    State.editor.chain().focus().insertContent({ type: "citation", attrs: { raw, keys: info.keys, label: info.label, missingKeys: info.missingKeys } }).run();
  }
  markDirty(); reconcileCitationNodes(); reconcileBibliographyNode(); return true;
}
function focusCitationByKey(key) {
  _setReferencesPaneOpen(true); _renderReferencesPane();
  const card = document.querySelector(`.refs-card[data-key="${CSS.escape(key)}"]`);
  if (!card) return false;
  document.querySelectorAll(".refs-card.is-citation-target").forEach((x) => x.classList.remove("is-citation-target", "is-current", "is-highlighted"));
  card.classList.add("is-citation-target", "is-current", "is-highlighted"); card.scrollIntoView({ block: "nearest" }); return true;
}
function readReferenceForm() {
  const out = {};
  for (const field of REFERENCE_FORM_FIELDS) {
    const el = document.querySelector(`#reference-${field}`);
    out[field] = el ? String(el.value || "").trim() : "";
  }
  return out;
}
function fillReferenceForm(entry = {}) {
  const norm = normalizeReferenceEntry(entry || {});
  for (const field of REFERENCE_FORM_FIELDS) {
    const el = document.querySelector(`#reference-${field}`);
    if (el) el.value = norm[field] || "";
  }
  const original = document.querySelector("#reference-original-key");
  if (original) original.value = String(entry && entry._originalKey != null ? entry._originalKey : (norm.key || ""));
}
function setReferenceFormError(msg) {
  const box = document.querySelector("#reference-form-error");
  if (!box) return;
  if (!msg) { box.textContent = ""; box.classList.add("hidden"); return; }
  box.textContent = msg;
  box.classList.remove("hidden");
}
function openReferenceEditor({ mode = "add", entry = null, sourceName = "" } = {}) {
  const modal = document.querySelector("#reference-editor-modal");
  const title = document.querySelector("#reference-editor-title");
  if (!modal) return false;
  const base = entry ? normalizeReferenceEntry(entry) : normalizeReferenceEntry({});
  if (mode === "edit") base._originalKey = entry && entry.key ? entry.key : base.key;
  else base._originalKey = "";
  fillReferenceForm(base);
  setReferenceFormError("");
  if (title) {
    if (mode === "edit") title.textContent = "编辑文献";
    else if (mode === "import") title.textContent = sourceName ? `导入文献 · ${sourceName}` : "导入文献";
    else title.textContent = "新建文献";
  }
  modal.classList.remove("hidden");
  const keyInput = document.querySelector("#reference-key");
  if (keyInput) setTimeout(() => keyInput.focus(), 0);
  return true;
}
function closeReferenceEditor() {
  const modal = document.querySelector("#reference-editor-modal");
  if (modal) modal.classList.add("hidden");
  setReferenceFormError("");
}
function addReferenceEntry(entry) {
  const result = upsertReferenceEntry(State.references, entry);
  if (Object.keys(result.errors || {}).length) return result;
  commitReferenceManifest(result.manifest);
  return result;
}
function updateReferenceEntry(originalKey, entry) {
  const from = String(originalKey || "").trim();
  const result = upsertReferenceEntry(State.references, entry, { originalKey: from });
  if (Object.keys(result.errors || {}).length) return result;
  const nextKey = String(entry && entry.key || "").trim();
  State.references = normalizeReferenceManifest(result.manifest);
  if (from && nextKey && from !== nextKey) renameCitationKeyInDocument(from, nextKey);
  commitReferenceManifest(State.references, { reconcile: true });
  return { manifest: State.references, errors: {} };
}
function deleteReferenceEntry(key, { confirmUser = true } = {}) {
  const drop = String(key || "").trim();
  if (!drop) return false;
  const count = getCitationUsages()[drop] || 0;
  if (confirmUser) {
    const message = count
      ? `文献 @${drop} 在正文引用 ${count} 次。删除库条目后正文仍保留 [@${drop}] 并标为缺失。继续？`
      : `从文献库删除 @${drop}？`;
    if (!confirm(message)) return false;
  }
  commitReferenceManifest(removeReferenceEntry(State.references, drop));
  return true;
}
async function importReferenceFile(file) {
  if (!file) return { error: "no-file" };
  let text = "";
  try { text = await file.text(); } catch (e) { return { error: String(e && e.message || e) }; }
  const entries = sortReferenceEntries(parseReferenceFile(file.name, text));
  if (!entries.length) {
    showToast("未识别到文献条目", 2500);
    return { error: "empty" };
  }
  if (entries.length === 1) {
    openReferenceEditor({ mode: "import", entry: entries[0], sourceName: file.name });
    _setReferencesPaneOpen(true);
    return { pending: 1, entries };
  }
  const result = mergeReferenceEntries(State.references, entries);
  if (result.conflicts.length) {
    let applied = result.manifest;
    let overwritten = 0;
    for (const c of result.conflicts) {
      const ok = confirm(
        `文献 @${c.existing.key} 已存在且内容不同。\n\n库中: ${c.existing.authors || "—"} / ${c.existing.year || "—"} / ${c.existing.title || "—"}\n导入: ${c.incoming.authors || "—"} / ${c.incoming.year || "—"} / ${c.incoming.title || "—"}\n\n确定 = 用导入项覆盖；取消 = 保留库中条目`
      );
      if (ok) {
        const up = upsertReferenceEntry(applied, c.incoming, { originalKey: c.existing.key });
        if (!Object.keys(up.errors || {}).length) {
          applied = up.manifest;
          overwritten += 1;
        }
      }
    }
    result.manifest = applied;
    result.overwritten = overwritten;
  }
  const srcName = file.name || State.references.source.name || "";
  const srcFmt = (file.name.split(".").pop() || State.references.source.format || "").toLowerCase();
  const next = createReferenceManifest({
    sourceName: srcName,
    sourceFormat: srcFmt,
    entries: result.manifest.entries
  });
  commitReferenceManifest(next);
  _setReferencesPaneOpen(true);
  const parts = [];
  if (result.added.length) parts.push(`新增 ${result.added.length}`);
  if (result.duplicates.length) parts.push(`跳过重复 ${result.duplicates.length}`);
  if (result.conflicts && result.conflicts.length) {
    parts.push(`冲突 ${result.conflicts.length}${result.overwritten ? `（覆盖 ${result.overwritten}）` : ""}`);
  }
  showToast(parts.length ? `已导入：${parts.join(" · ")}` : `已加载 ${next.entries.length} 条引用`, 2200);
  return { ...result, manifest: next };
}
function exportReferencesBib({ download = true } = {}) {
  const text = serializeReferenceBibTeX(State.references.entries || []);
  if (!download) return text;
  if (!text) { showToast("引用库为空", 1800); return ""; }
  const rawName = typeof mentorBaseName === "function"
    ? mentorBaseName(State.currentFile?.name || "document")
    : String(State.currentFile?.name || "document");
  const base = String(rawName || "document").replace(/\.(md|markdown|mentor)$/i, "") || "document";
  downloadBlob(`${base}.references.bib`, new Blob([text], { type: "application/x-bibtex;charset=utf-8" }));
  showToast("已导出 .bib", 1400);
  return text;
}
function initReferencesPane() {
  const button = document.querySelector("#btn-refs");
  const input = document.querySelector("#refs-file-input");
  const pane = document.querySelector("#refs-pane");
  const main = document.querySelector("#main");
  const list = document.querySelector("#refs-list");
  const sourceName = document.querySelector("#refs-source-name");
  const search = document.querySelector("#refs-search");
  const missing = document.querySelector("#refs-missing-summary");
  const collapse = pane?.querySelector('[data-act="toggle-refs-pane"]');
  const expand = document.querySelector("#expand-refs-pane-btn");
  const addBtn = document.querySelector("#refs-add-btn");
  const importBtn = document.querySelector("#refs-import-btn");
  const exportBtn = document.querySelector("#refs-export-btn");
  const moreBtn = document.querySelector("#refs-more-btn");
  const moreMenu = document.querySelector("#refs-more-menu");
  const bibStatus = document.querySelector("#refs-bibliography-status");
  const modal = document.querySelector("#reference-editor-modal");
  const form = document.querySelector("#reference-editor-form");
  const cancelBtn = document.querySelector("#reference-cancel");
  if (!button || !input || !pane || !main || !list) return;
  const bibToggle = pane.querySelector("#refs-bibliography-toggle");
  const bibScope = pane.querySelector("#refs-bibliography-scope");
  const convertLegacyBtn = pane.querySelector("#refs-convert-legacy-btn");
  let query = "";
  const setMoreOpen = (open, { restoreFocus = false } = {}) => {
    moreMenu?.classList.toggle("hidden", !open);
    moreBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    if (restoreFocus) moreBtn?.focus();
  };
  moreBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    setMoreOpen(!!moreMenu?.classList.contains("hidden"));
  });
  moreMenu?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setMoreOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && moreMenu && !moreMenu.classList.contains("hidden")) {
      setMoreOpen(false, { restoreFocus: true });
    }
  });
  const setOpen = (open) => {
    pane.classList.toggle("hidden", !open);
    main.classList.toggle("refs-pane-open", open);
    document.body.classList.toggle("refs-pane-collapsed", !open);
    expand?.classList.toggle("hidden", open || !(State.references.entries || []).length);
    if (!open) setMoreOpen(false);
    try { syncToolbarActionState(); } catch {}
  };
  const renderBibControls = () => {
    const cfg = normalizeBibliographyConfig(
      (State.references && State.references.bibliography) || { enabled: false, scope: "cited", heading: "References" }
    );
    if (bibScope) bibScope.value = cfg.scope;
    if (bibToggle) {
      bibToggle.dataset.enabled = cfg.enabled ? "true" : "false";
      const labelEl = bibToggle.querySelector(".refs-bib-label");
      if (labelEl) labelEl.textContent = cfg.enabled ? "移除文献列表" : "插入文献列表";
      bibToggle.title = cfg.enabled
        ? "移除显示区（仅 atom），正文引用与文献库不变"
        : "在文档末尾插入文献列表字段（引用条目来自文献库）";
    }
    if (bibStatus) {
      if (!cfg.enabled) bibStatus.textContent = "未插入";
      else bibStatus.textContent = cfg.scope === "all" ? "已插入 · 全部" : "已插入 · 仅引用";
    }
    if (convertLegacyBtn) {
      const md = (State.currentFile && typeof State.currentFile.content === "string") ? State.currentFile.content : "";
      const plan = planLegacyBibliographyMigration(md, State.references);
      const safe = plan && plan.safe;
      const noSection = plan && plan.reason === "no-references-section";
      convertLegacyBtn.disabled = !!noSection;
      convertLegacyBtn.title = safe
        ? `可无损转换 ${plan.originalCount} 条；将使用 scope=all`
        : (noSection
          ? "当前文档无手写 # References 段"
          : `不安全转换：原始 ${plan.originalCount || 0} 条 vs 仅匹配 ${plan.generatedCount || 0} 条`);
    }
  };
  const render = () => {
    const entries = State.references.entries || [];
    const usages = getCitationUsages();
    const rows = filterReferenceEntries(entries, query);
    if (sourceName) sourceName.textContent = entries.length ? `${State.references.source.name || "引用库"} · ${entries.length} 条` : "未加载引用库";
    const missingKeys = [...document.querySelectorAll(".mentor-citation.is-missing")].flatMap((n) => {
      try { return JSON.parse(n.dataset.citationMissing || "[]"); } catch (_) { return []; }
    });
    if (missing) {
      missing.classList.toggle("hidden", !missingKeys.length);
      missing.textContent = missingKeys.length ? `缺失：${[...new Set(missingKeys)].map((k) => "@" + k).join("、")}` : "";
    }
    try { renderBibControls(); } catch (_) {}
    if (!rows.length) {
      list.innerHTML = `<div class="refs-empty">${entries.length ? "没有匹配的引用" : "尚无文献"}</div>`;
      return;
    }
    list.innerHTML = rows.map((entry) => {
      const key = escapeHtml(entry.key);
      const n = usages[entry.key] || 0;
      const nav = State.citationNavigation || {};
      const isNavCard = !!(nav.key === entry.key && nav.total === n && n > 0 && nav.ordinal > 0);
      const usageText = n
        ? (isNavCard ? `第 ${nav.ordinal} / ${n} 处` : `正文 ×${n}`)
        : "未引用";
      const ariaLabel = n
        ? `定位 @${entry.key} 的正文引用，共 ${n} 处`
        : `@${entry.key} 未在正文引用`;
      return `<article class="refs-card${isNavCard ? " is-active" : ""}" data-key="${key}" data-usage-count="${n}"${n ? ' role="button" tabindex="0"' : ""} aria-label="${escapeHtml(ariaLabel)}">
        <div class="rc-copy">
          <div class="rc-heading">
            <span class="rc-authors">${escapeHtml(entry.authors || "未知作者")}</span>
            ${entry.year ? `<span class="rc-year">${escapeHtml(entry.year)}</span>` : ""}
          </div>
          ${entry.title ? `<div class="rc-title">${escapeHtml(entry.title)}</div>` : ""}
          <div class="rc-foot">
            <code class="rc-key">@${key}</code>
            <span class="rc-usage${n ? "" : " is-unused"}" aria-live="polite">${usageText}</span>
          </div>
        </div>
        <div class="rc-actions" aria-label="@${key} 操作">
          <button type="button" class="rc-insert-btn" data-act="insert-cite" data-key="${key}"
            aria-label="插入 @${key}" title="插入引用"><span aria-hidden="true"></span></button>
          <button type="button" class="rc-edit-btn" data-act="edit-reference" data-key="${key}"
            aria-label="编辑 @${key}" title="编辑文献"><span aria-hidden="true"></span></button>
          <button type="button" class="rc-delete-btn" data-act="delete-reference" data-key="${key}"
            aria-label="删除 @${key}" title="删除文献"><span aria-hidden="true"></span></button>
        </div>
      </article>`;
    }).join("");
  };
  _renderReferencesPane = render;
  _setReferencesPaneOpen = setOpen;
  button.addEventListener("click", () => {
    const open = pane.classList.contains("hidden");
    setOpen(open);
    if (open) render();
  });
  addBtn?.addEventListener("click", () => { setOpen(true); openReferenceEditor({ mode: "add" }); });
  importBtn?.addEventListener("click", () => { setMoreOpen(false); input.click(); });
  exportBtn?.addEventListener("click", () => { setMoreOpen(false); exportReferencesBib({ download: true }); });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) importReferenceFile(f).catch((e) => { console.error(e); showToast("引用库解析失败", 2500); });
    input.value = "";
  });
  search?.addEventListener("input", () => { query = search.value || ""; render(); });
  collapse?.addEventListener("click", () => setOpen(false));
  expand?.addEventListener("click", () => setOpen(true));
  list.addEventListener("click", (event) => {
    const insert = event.target.closest('[data-act="insert-cite"]');
    if (insert) {
      if (insertCitation(insert.dataset.key)) {
        showToast(`已插入 [@${insert.dataset.key}]`, 1400);
      }
      return;
    }
    const edit = event.target.closest('[data-act="edit-reference"]');
    if (edit) {
      const entry = (State.references.entries || []).find((e) => e.key === edit.dataset.key);
      if (entry) openReferenceEditor({ mode: "edit", entry });
      return;
    }
    const del = event.target.closest('[data-act="delete-reference"]');
    if (del) {
      if (deleteReferenceEntry(del.dataset.key)) showToast(`已删除 @${del.dataset.key}`, 1400);
      return;
    }
    const card = event.target.closest(".refs-card[data-key]");
    if (card) activateNextCitationUsage(card.dataset.key);
  });
  list.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (event.target.closest("button, input, select, textarea")) return;
    const card = event.target.closest('.refs-card[data-key][data-usage-count]:not([data-usage-count="0"])');
    if (!card) return;
    event.preventDefault();
    activateNextCitationUsage(card.dataset.key);
  });
  bibToggle?.addEventListener("click", () => {
    const cfg = normalizeBibliographyConfig(
      (State.references && State.references.bibliography) || { enabled: false, scope: "cited", heading: "References" }
    );
    if (cfg.enabled) {
      const ok = removeBibliographyField({ confirm: true });
      if (ok) showToast("已移除文献列表", 1400);
    } else {
      const ok = insertBibliographyField();
      if (ok) showToast("已插入文献列表", 1400);
      else showToast("当前无法插入文献列表", 1500);
    }
    render();
  });
  bibScope?.addEventListener("change", () => {
    const next = setBibliographyScope(bibScope.value);
    showToast(next === "all" ? "文献列表：全部文献库" : "文献列表：仅引用条目", 1400);
    render();
  });
  convertLegacyBtn?.addEventListener("click", () => {
    const md = (State.currentFile && typeof State.currentFile.content === "string") ? State.currentFile.content : "";
    const plan = planLegacyBibliographyMigration(md, State.references);
    if (!plan.safe) {
      const msg = plan.reason === "no-references-section"
        ? "未检测到 # References 段"
        : `不安全转换：原 ${plan.originalCount} 条 vs 匹配 ${plan.generatedCount} 条` +
          (plan.missing && plan.missing.length ? "；缺失 " + plan.missing.length + " 条" : "") +
          (plan.ambiguous && plan.ambiguous.length ? "；歧义 " + plan.ambiguous.length + " 条" : "");
      showToast(msg, 4e3);
      return;
    }
    const proceed = typeof window.confirm === "function"
      ? window.confirm(`将 ${plan.originalCount} 条手写引用转换为受控文献列表（scope=all）。此操作会重写正文，确认？`)
      : true;
    if (!proceed) return;
    State.references = createReferenceManifest({
      sourceName: (State.references && State.references.source && State.references.source.name) || "",
      sourceFormat: (State.references && State.references.source && State.references.source.format) || "",
      entries: (State.references && State.references.entries) || [],
      bibliography: plan.config
    });
    if (State.currentFile) State.currentFile.content = plan.markdown;
    const html2 = markdownToHtml(plan.markdown, State.mediaUrls);
    State._suspendAnnValidate = true;
    try {
      State.editor?.commands.setContent(html2, false);
    } finally {
      State._suspendAnnValidate = false;
    }
    markDirty();
    scheduleIdbCacheWrite();
    render();
    showToast("已转换为受控文献列表", 1800);
  });
  document.querySelector("#editor")?.addEventListener("click", (event) => {
    const atom = event.target.closest(".mentor-citation");
    if (atom) {
      let keys = [];
      try { keys = JSON.parse(atom.dataset.citationKeys || "[]"); } catch (_) { keys = []; }
      if (keys[0]) focusCitationByKey(keys[0]);
    }
  });
  cancelBtn?.addEventListener("click", () => closeReferenceEditor());
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeReferenceEditor(); });
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readReferenceForm();
    const originalKey = String(document.querySelector("#reference-original-key")?.value || "").trim();
    const result = originalKey
      ? updateReferenceEntry(originalKey, data)
      : addReferenceEntry(data);
    if (Object.keys(result.errors || {}).length) {
      setReferenceFormError(Object.values(result.errors).join("；") || "保存失败");
      return;
    }
    closeReferenceEditor();
    setOpen(true);
    render();
    showToast(originalKey ? "引用已更新" : "引用已添加", 1400);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      e.preventDefault();
      closeReferenceEditor();
    }
  });
  setOpen(false);
  render();
  try { renderBibControls(); } catch (_) {}
}
function showExportProgress(label) {
  setStatus(label || "\u5BFC\u51FA\u4E2D\u2026", "\u8BF7\u7A0D\u5019");
  const bar = document.querySelector("#export-progress");
  if (bar) {
    bar.classList.remove("hidden");
    bar.setAttribute("aria-busy", "true");
    bar.textContent = label || "\u5BFC\u51FA\u4E2D\u2026";
  }
}
function hideExportProgress(okMsg) {
  const bar = document.querySelector("#export-progress");
  if (bar) {
    bar.classList.add("hidden");
    bar.setAttribute("aria-busy", "false");
    bar.textContent = "";
  }
  if (okMsg) setStatus(okMsg, "");
}
function setAutosaveDebounce(ms) {
  if (!AUTOSAVE_DEBOUNCE_ALLOWED.includes(ms)) return;
  AUTOSAVE_DEBOUNCE = ms;
  localStorage.setItem("Mentor:autosaveDebounce", String(ms));
  syncSettingsActiveState();
  showToast("\u81EA\u52A8\u4FDD\u5B58\u5EF6\u8FDF: " + ms / 1e3 + "s", 2e3);
}
function loadDemoDocument() {
  const bodyLen = _emptyBodyLen();
  const hasAnn = (State.annotations || []).length > 0;
  const dirty = !!(State.currentFile && State.currentFile.dirty);
  if (bodyLen > 0 || hasAnn || dirty) {
    if (!confirm("\u5C06\u7528\u6F14\u793A\u6587\u6863\u66FF\u6362\u5F53\u524D\u5185\u5BB9, \u672A\u5BFC\u51FA\u7684\u4FEE\u6539\u4F1A\u4E22\u5931. \u7EE7\u7EED?")) return;
  }
  State.annotations = [];
  State._suspendAnnValidate = true;
  try {
    State.editor.commands.setContent("", false);
  } finally {
    State._suspendAnnValidate = false;
  }
  const DEMO_MD = `# Mentor \u6F14\u793A\u6587\u6863

\u8FD9\u662F\u4E00\u6BB5\u7528\u4E8E\u6F14\u793A\u6279\u6CE8\u6D41\u7A0B\u7684\u793A\u4F8B\u6587\u5B57. \u4F60\u53EF\u4EE5\u5C1D\u8BD5\u62D6\u9009**"\u793A\u4F8B\u6587\u5B57"**\u8FD9\u51E0\u4E2A\u5B57, \u7136\u540E\u6309\u6D6E\u52A8\u6309\u94AE\u52A0\u6279\u6CE8.

## \u5DF2\u89E3\u51B3\u7684\u6279\u6CE8

\u4E0B\u9762\u8FD9\u53E5\u8BDD\u4E4B\u524D\u8BA8\u8BBA\u8FC7, \u73B0\u5728\u5DF2\u7ECF\u89E3\u51B3. \u4F60\u53EF\u4EE5\u70B9 "\u91CD\u65B0\u6253\u5F00" \u628A\u5B83\u6062\u590D\u4E3A\u672A\u89E3\u51B3\u72B6\u6001.

## \u6570\u636E\u8868

| \u52171 | \u52172 |
|----|----|
| \u6570\u636E1 | \u6570\u636E2 |

\u8BD5\u8BD5\u7ED9\u8868\u683C\u91CC\u7684 "\u6570\u636E1" \u52A0\u6279\u6CE8.

> \u63D0\u793A: \u5728\u8FD9\u91CC\u76F4\u63A5\u6253\u5B57\u4E5F\u53EF\u4EE5 - \u4F60\u521A\u624D\u6253\u5F00\u7684\u5C31\u662F\u4E00\u4E2A\u771F\u5B9E\u7684 .md \u6587\u4EF6, \u53EF\u4EE5\u4FDD\u5B58\u5230\u4EFB\u610F\u4F4D\u7F6E.
`;
  const html = markdownToHtml(DEMO_MD, State.mediaUrls);
  State.annotations = [];
  State._suspendAnnValidate = true;
  try {
    State.editor.commands.setContent(html, false);
  } finally {
    State._suspendAnnValidate = false;
  }
  resetHistory();
  State.currentFile = { name: "\u6F14\u793A\u6587\u6863.md", content: DEMO_MD, annotations: null, dirty: false };
  State.saveMode = "idle";
  stopAutosaveTimer();
  $("#current-file-name").textContent = "\u6F14\u793A\u6587\u6863.md";
  try {
    refreshFileListDropdown();
  } catch {
  }
  setStatus("\u6F14\u793A\u6A21\u5F0F", "\u6B64\u6587\u6863\u4E0D\u4F1A\u81EA\u52A8\u4FDD\u5B58. \u60F3\u4FDD\u7559\u8BF7\u7528 \u5BFC\u51FA\u6210 .mentor \u6216 Ctrl+S");
  const doc5 = State.editor.state.doc;
  const r1 = findAnnotationRange(doc5, { text: "\u793A\u4F8B\u6587\u5B57" });
  if (r1) {
    const t1 = createAnnotationThread(r1.from, r1.to, "\u793A\u4F8B\u6587\u5B57");
    if (t1) {
      t1.comments.push({
        id: uuid(),
        author: State.author || "Mentor",
        body: "\u{1F44B} \u8FD9\u662F\u4E00\u6761\u793A\u4F8B\u6279\u6CE8. \u8BD5\u7740\u56DE\u590D\u6211, \u6216\u8005\u6807\u4E3A\u5DF2\u89E3\u51B3.",
        createdAt: nowISO()
      });
    }
  }
  const r2 = findAnnotationRange(doc5, { text: "\u6570\u636E1" });
  if (r2) {
    const t2 = createAnnotationThread(r2.from, r2.to, "\u6570\u636E1");
    if (t2) {
      t2.resolved = true;
      t2.comments.push({
        id: uuid(),
        author: State.author || "Mentor",
        body: '\u8FD9\u662F\u4E00\u6761\u5DF2\u89E3\u51B3\u7684\u793A\u4F8B\u6279\u6CE8 (\u70B9 "\u91CD\u65B0\u6253\u5F00" \u53EF\u6062\u590D).',
        createdAt: nowISO()
      });
    }
  }
  try {
    localStorage.setItem("mentor.onboarded.v1", "1");
  } catch {
  }
  rebuildAnnotationMarks();
  renderCommentList();
  renderOutline();
  showToast("\u5DF2\u52A0\u8F7D\u6F14\u793A\u6587\u6863, \u8BD5\u8BD5\u62D6\u9009\u6587\u5B57\u52A0\u6279\u6CE8", 3500);
}
function renderAuthorChip() {
  const chip = document.querySelector("#author-chip");
  const name = document.querySelector("#author-chip-name");
  if (!chip || !name) return;
  const userSet = (State.author || "").trim();
  if (userSet) {
    name.textContent = userSet;
    chip.classList.remove("is-anonymous");
    chip.classList.remove("is-id-derived");
    chip.title = `\u5F53\u524D\u4F5C\u8005: ${userSet}
\u70B9\u51FB\u4FEE\u6539\u4F5C\u8005\u540D`;
  } else {
    const idShort = authorIdToShortName(State.authorId);
    if (idShort) {
      name.textContent = idShort;
      chip.classList.remove("is-anonymous");
      chip.classList.add("is-id-derived");
      chip.title = `\u5F53\u524D\u4F5C\u8005: ${idShort} (\u4ECE ID \u6D3E\u751F, \u672A\u8BBE\u7F6E\u663E\u793A\u540D)
\u70B9\u51FB\u8BBE\u7F6E\u540D\u5B57`;
    } else {
      name.textContent = "\u672A\u8BBE\u7F6E";
      chip.classList.add("is-anonymous");
      chip.classList.remove("is-id-derived");
      chip.title = "\u70B9\u51FB\u8BBE\u7F6E\u4F5C\u8005\u540D";
    }
  }
}
function isHelpOpen() {
  const popover = document.querySelector("#help-popover");
  return popover && !popover.classList.contains("hidden");
}
function setToolbarPopoverState(button, popover, open, { restoreFocus = false } = {}) {
  if (!button || !popover) return;
  popover.classList.toggle("hidden", !open);
  button.classList.toggle("is-active", !!open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open && restoreFocus) {
    try { button.focus(); } catch (_) {}
  }
}

function openHelp() {
  const btn = document.querySelector("#help-btn");
  const popover = document.querySelector("#help-popover");
  if (!btn || !popover) return;
  if (typeof isSettingsOpen === "function" && isSettingsOpen()) closeSettings({ restoreFocus: false });
  setToolbarPopoverState(btn, popover, true);
  const popWidth = 340;
  const margin = 16;
  const btnRect = btn.getBoundingClientRect();
  const btnCenterX = btnRect.left + btnRect.width / 2;
  const btnBottomY = btnRect.bottom;
  let popLeft = btnCenterX - popWidth / 2;
  popLeft = Math.max(margin, Math.min(window.innerWidth - popWidth - margin, popLeft));
  const popTop = btnBottomY + 10;
  popover.style.left = popLeft + "px";
  popover.style.top = popTop + "px";
  const arrowRightFromPop = popLeft + popWidth - btnCenterX;
  const safe = Math.max(12, Math.min(popWidth - 20, arrowRightFromPop));
  const arrow3 = popover.querySelector(".help-popover-arrow");
  if (arrow3) arrow3.style.right = safe + "px";
  setTimeout(() => {
    const closeBtn = popover.querySelector(".help-popover-close");
    if (closeBtn) closeBtn.focus();
  }, 50);
}
function closeHelp({ restoreFocus = true } = {}) {
  const btn = document.querySelector("#help-btn");
  const popover = document.querySelector("#help-popover");
  if (!btn || !popover) return;
  setToolbarPopoverState(btn, popover, false, { restoreFocus });
}
function toggleHelp() {
  if (isHelpOpen()) closeHelp();
  else openHelp();
}
function isSettingsOpen() {
  const popover = document.querySelector("#settings-popover");
  return popover && !popover.classList.contains("hidden");
}
function openSettings() {
  const btn = document.querySelector("#settings-btn");
  const popover = document.querySelector("#settings-popover");
  if (!btn || !popover) return;
  if (typeof isHelpOpen === "function" && isHelpOpen()) closeHelp({ restoreFocus: false });
  setToolbarPopoverState(btn, popover, true);
  const btnRect = btn.getBoundingClientRect();
  const popWidth = 320;
  const popLeft = Math.max(8, Math.min(window.innerWidth - popWidth - 8, btnRect.left));
  const popTop = btnRect.bottom + 8;
  popover.style.left = popLeft + "px";
  popover.style.top = popTop + "px";
  const arrowLeftFromPop = btnRect.left + btnRect.width / 2 - popLeft;
  const safe = Math.max(12, Math.min(popWidth - 20, arrowLeftFromPop));
  const arrow3 = popover.querySelector(".settings-popover-arrow");
  if (arrow3) arrow3.style.left = safe + "px";
  syncSettingsActiveState();
  setTimeout(() => {
    const closeBtn = popover.querySelector(".settings-popover-close");
    if (closeBtn) closeBtn.focus();
  }, 50);
}
function closeSettings({ restoreFocus = true } = {}) {
  const btn = document.querySelector("#settings-btn");
  const popover = document.querySelector("#settings-popover");
  if (!btn || !popover) return;
  setToolbarPopoverState(btn, popover, false, { restoreFocus });
}
function toggleSettings() {
  if (isSettingsOpen()) closeSettings();
  else openSettings();
}
function setMaxAnnotations(max) {
  if (![0, 50, 200, 500, 1e3].includes(max)) return;
  State.maxAnnotations = max;
  localStorage.setItem("Mentor:maxAnnotations", String(max));
  syncSettingsActiveState();
  showToast(max === 0 ? "\u5DF2\u8BBE\u4E3A\u65E0\u9650\u5236 (perf \u53EF\u80FD\u5361)" : `\u6279\u6CE8\u4E0A\u9650\u8BBE\u4E3A ${max} \u6761`, 2500);
  if (typeof renderCommentList === "function") renderCommentList();
}
function syncSettingsActiveState() {
  const popover = document.querySelector("#settings-popover");
  if (!popover) return;
  const cur = State.maxAnnotations || 0;
  popover.querySelectorAll("#settings-max-annotations .settings-opt").forEach((btn) => {
    const v = parseInt(btn.dataset.max, 10);
    btn.classList.toggle("is-active", v === cur);
  });
  const current = document.querySelector("#settings-max-annotations-current");
  if (current) {
    const open2 = State.annotations.length;
    const cap = cur === 0 ? "\u221E" : cur;
    current.textContent = `\u5F53\u524D: ${open2} / ${cap}`;
  }
  const deb = getAutosaveDebounceMs();
  popover.querySelectorAll("#settings-autosave-debounce .settings-opt").forEach((btn) => {
    const v = parseInt(btn.dataset.ms, 10);
    btn.classList.toggle("is-active", v === deb);
  });
  const debCur = document.querySelector("#settings-autosave-debounce-current");
  if (debCur) debCur.textContent = `\u5F53\u524D: ${deb / 1e3}s \u505C\u624B\u540E\u81EA\u52A8\u4FDD\u5B58`;
  const vhOn = getVersionHistoryEnabled();
  popover.querySelectorAll("#settings-version-history-toggle .settings-opt").forEach((btn) => {
    btn.classList.toggle("is-active", (btn.dataset.vh === "1") === vhOn);
  });
  const vhCur = document.querySelector("#settings-version-history-current");
  if (vhCur) vhCur.textContent = `\u5F53\u524D: ${vhOn ? "\u8BB0\u5F55\u7248\u672C\u5386\u53F2" : "\u5DF2\u5173\u95ED\uFF08\u4E0D\u8BB0\u5F55\u65B0\u7248\u672C\uFF09"}`;
  const vhMax = getVersionPolicyFromSettings().maxAutosave;
  popover.querySelectorAll("#settings-version-max .settings-opt").forEach((btn) => {
    btn.classList.toggle("is-active", parseInt(btn.dataset.maxv, 10) === vhMax);
  });
  const vhMaxCur = document.querySelector("#settings-version-max-current");
  if (vhMaxCur) vhMaxCur.textContent = `\u5F53\u524D: \u81EA\u52A8\u7248\u672C\u4FDD\u7559 ${vhMax} \u4E2A\uFF08\u547D\u540D\u7248\u672C\u4E0D\u53D7\u6B64\u9650\uFF09`;
  const theme = getTheme();
  popover.querySelectorAll("#settings-theme .settings-opt").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.theme === theme);
  });
}
function promptAuthor(options = {}) {
  const { firstTime = false } = options;
  return new Promise((resolve) => {
    const modal = $("#author-modal");
    const input = $("#author-input");
    const title = $("#author-modal-title");
    const desc = $("#author-modal-desc");
    const saveBtn = $("#author-save");
    const cancelBtn = $("#author-cancel");
    if (firstTime) {
      title.textContent = "\u5148\u8BA4\u8BC6\u4E00\u4E0B";
      desc.textContent = "\u544A\u8BC9 Mentor \u4F60\u7684\u540D\u5B57\uFF0C\u4E4B\u540E\u6240\u6709\u6279\u6CE8\u4F1A\u6807\u6CE8\u4F5C\u8005\u3002\u7559\u7A7A\u5219\u5148\u7528\u77ED ID \u6807\u8BC6\uFF0C\u53EF\u968F\u65F6\u70B9\u53F3\u4E0A\u89D2\u6539\u540D\u3002";
      saveBtn.textContent = "\u5F00\u59CB\u4F7F\u7528";
      cancelBtn.style.display = "";
    } else {
      title.textContent = "\u4FEE\u6539\u4F5C\u8005\u540D";
      desc.textContent = "\u65B0\u7684\u4F5C\u8005\u540D\u5C06\u7528\u4E8E\u4ECA\u540E\u6240\u6709\u6279\u6CE8\u3002\u5DF2\u5B58\u5728\u4E14\u540C\u4E00\u4F5C\u8005 ID \u7684\u7A7A\u540D\u6279\u6CE8\u4F1A\u968F\u4E4B\u663E\u793A\u65B0\u540D\u3002";
      saveBtn.textContent = "\u4FDD\u5B58";
      cancelBtn.style.display = "";
    }
    input.value = State.author || "";
    modal.classList.remove("hidden");
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
    const markPrompted = () => {
      try {
        localStorage.setItem("Mentor:authorPrompted", "1");
      } catch {
      }
    };
    const close3 = (resolved) => {
      modal.classList.add("hidden");
      saveBtn.removeEventListener("click", saveHandler);
      cancelBtn.removeEventListener("click", cancelHandler);
      input.removeEventListener("keydown", keyHandler);
      modal.removeEventListener("click", backdropHandler);
      renderAuthorChip();
      // empty-name cards may resolve to new display name
      try {
        renderCommentList();
      } catch {
      }
      resolve(resolved);
    };
    const saveHandler = () => {
      const v = input.value.trim();
      if (v) {
        State.author = v;
        localStorage.setItem("Mentor:author", v);
      } else {
        State.author = "";
        localStorage.removeItem("Mentor:author");
      }
      markPrompted();
      close3(true);
    };
    const cancelHandler = () => {
      markPrompted();
      close3(false);
    };
    const keyHandler = (e) => {
      if (e.key === "Enter") saveHandler();
      if (e.key === "Escape" && !firstTime) cancelHandler();
    };
    const backdropHandler = (e) => {
      if (e.target === modal) cancelHandler();
    };
    saveBtn.addEventListener("click", saveHandler);
    cancelBtn.addEventListener("click", cancelHandler);
    input.addEventListener("keydown", keyHandler);
    modal.addEventListener("click", backdropHandler);
  });
}
function setupFormatMoreMenu() {
  const btn = document.getElementById("btn-tb-more");
  const menu = document.getElementById("tb-more-menu");
  if (!btn || !menu) return;
  const items = () => [...menu.querySelectorAll("button[data-cmd]")];
  const isWide = () => window.matchMedia("(min-width: 1180px)").matches;
  const open = ({ focus = false } = {}) => {
    if (isWide()) return;
    menu.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    if (focus) items()[0]?.focus();
  };
  const close = ({ restoreFocus = false } = {}) => {
    menu.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      try { btn.focus(); } catch (_) {}
    }
  };
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isWide()) {
      close();
      return;
    }
    if (menu.classList.contains("hidden")) open();
    else close();
  };
  btn.addEventListener("click", toggle);
  btn.addEventListener("keydown", (e) => {
    if (isWide()) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open({ focus: true });
      if (e.key === "ArrowUp") {
        const list = items();
        list[list.length - 1]?.focus();
      }
    }
  });
  menu.addEventListener("keydown", (e) => {
    if (isWide() || menu.classList.contains("hidden")) return;
    const list = items();
    if (!list.length) return;
    const idx = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(idx + 1 + list.length) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(idx - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close({ restoreFocus: true });
    }
  });
  menu.addEventListener("click", (e) => {
    if (e.target.closest("button[data-cmd]") && window.matchMedia("(max-width: 1179px)").matches) {
      setTimeout(() => close(), 0);
    }
  });
  document.addEventListener("mousedown", (e) => {
    if (menu.classList.contains("hidden")) return;
    if (e.target.closest("#tb-more-wrap")) return;
    close();
  });
  window.addEventListener("resize", () => {
    if (isWide()) close();
  });
}

var _toolbarActionInflight = Object.create(null);
function runToolbarAction(id, fn) {
  const key = String(id || "");
  if (!key || typeof fn !== "function") return Promise.resolve();
  if (_toolbarActionInflight[key]) return _toolbarActionInflight[key];
  State._toolbarBusyAction = key;
  State._toolbarBusy = true;
  try { syncToolbarActionState(); } catch {}
  const p = Promise.resolve().then(fn).finally(() => {
    delete _toolbarActionInflight[key];
    State._toolbarBusyAction = Object.keys(_toolbarActionInflight)[0] || "";
    State._toolbarBusy = Object.keys(_toolbarActionInflight).length > 0;
    try { syncToolbarActionState(); } catch {}
  });
  _toolbarActionInflight[key] = p;
  return p;
}

function setupToolbar() {
  $("#btn-new").addEventListener("click", newDocument);
  $("#btn-open-files").addEventListener("click", openFiles);
  
// Office AutoSave toggle (once)
try {
  const autoBtn = document.querySelector("#btn-autosave");
  if (autoBtn && !autoBtn.dataset.boundAutosave) {
    autoBtn.dataset.boundAutosave = "1";
    autoBtn.addEventListener("click", () => {
      setAutoSaveEnabled(!getAutoSaveEnabled());
    });
  }
  syncAutosaveToggleUi();
} catch (_) {}

$("#btn-save").addEventListener("click", () => runToolbarAction("save", saveCurrent));
  $("#btn-export-md").addEventListener("click", () => runToolbarAction("exportMd", exportMd));
  $("#btn-export-docx").addEventListener("click", () => runToolbarAction("exportDocx", exportDocx));
  $("#btn-undo").addEventListener("click", () => {
    if (undoSmartDispatch()) showToast("\u5DF2\u64A4\u9500");
  });
  $("#btn-redo").addEventListener("click", () => {
    if (redoSmartDispatch()) showToast("\u5DF2\u91CD\u505A");
  });
  updateHistoryButtons();
  try { syncToolbarActionState(); } catch {}
  document.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (!((e.metaKey || e.ctrlKey) && !e.altKey)) return;
    if (!e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (undoSmartDispatch()) showToast("\u5DF2\u64A4\u9500");
      return;
    }
    if (!e.shiftKey && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      if (redoSmartDispatch()) showToast("\u5DF2\u91CD\u505A");
      return;
    }
    if (e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (redoSmartDispatch()) showToast("\u5DF2\u91CD\u505A");
      return;
    }
  });
  function undoSmartDispatch() {
    const ed = State.editor;
    const preferAnn = State.history.lastOp === "ann" && State.history.past.length > 0;
    if (preferAnn) {
      if (undo2()) {
        State.history.lastOp = State.history.past.length ? "ann" : ed?.can()?.undo() ? "pm" : null;
        showToast("\u5DF2\u64A4\u9500 (\u6279\u6CE8)");
        return true;
      }
    }
    if (ed) {
      try {
        const beforeDoc = ed.state.doc;
        if (ed.commands.undo() && ed.state.doc !== beforeDoc) {
          State.history.lastOp = ed.can().undo() ? "pm" : State.history.past.length ? "ann" : null;
          try {
            scheduleValidateMarks(ed, { immediate: true, phase: "full" });
          } catch (e) {
          }
          return true;
        }
      } catch (e) {
      }
    }
    if (State.history.past.length > 0 && undo2()) {
      State.history.lastOp = State.history.past.length ? "ann" : null;
      showToast("\u5DF2\u64A4\u9500 (\u6279\u6CE8)");
      return true;
    }
    return false;
  }
  function redoSmartDispatch() {
    const ed = State.editor;
    if (ed) {
      try {
        const beforeDoc = ed.state.doc;
        if (ed.commands.redo() && ed.state.doc !== beforeDoc) {
          State.history.lastOp = "pm";
          try {
            scheduleValidateMarks(ed, { immediate: true, phase: "full" });
          } catch (e) {
          }
          return true;
        }
      } catch (e) {
      }
    }
    if (State.history.future.length > 0 && redo2()) {
      State.history.lastOp = "ann";
      showToast("\u5DF2\u91CD\u505A (\u6279\u6CE8)");
      return true;
    }
    return false;
  }
  $("#btn-save-as").addEventListener("click", () => runToolbarAction("saveAs", async () => {
    if (!State.currentFile) return;
    try {
      const snapshot = createSaveSnapshot();
      await downloadMentorSnapshot(snapshot, { markCleanOnSuccess: false });
    } catch (e) {
      hideExportProgress("导出失败");
      showToast("另存失败: " + (e && e.message ? e.message : e), 4e3);
    }
  }));
  const vhBtn = document.querySelector("#btn-version-history");
  if (vhBtn && !vhBtn.dataset.boundVersionHistory) {
    vhBtn.dataset.boundVersionHistory = "1";
    vhBtn.addEventListener("click", () => {
      if (!State.currentFile) return;
      runToolbarAction("versionHistory", openVersionHistory);
    });
  }
  const vhPin = document.querySelector("#version-history-pin");
  if (vhPin && !vhPin.dataset.boundVersionPin) {
    vhPin.dataset.boundVersionPin = "1";
    vhPin.addEventListener("click", runNamedVersionPin);
  }
  const vhClose = document.querySelector("#version-history-close");
  if (vhClose && !vhClose.dataset.boundVersionClose) {
    vhClose.dataset.boundVersionClose = "1";
    vhClose.addEventListener("click", closeVersionHistory);
  }
  $$("#format-toolbar button[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      const c = State.editor.chain().focus();
      switch (cmd) {
        case "bold":
          c.toggleBold().run();
          break;
        case "italic":
          c.toggleItalic().run();
          break;
        case "strike":
          c.toggleStrike().run();
          break;
        case "code":
          c.toggleCode().run();
          break;
        case "superscript":
          c.toggleSuperscript().run();
          break;
        case "subscript":
          c.toggleSubscript().run();
          break;
        case "h1":
          c.toggleHeading({ level: 1 }).run();
          break;
        case "h2":
          c.toggleHeading({ level: 2 }).run();
          break;
        case "h3":
          c.toggleHeading({ level: 3 }).run();
          break;
        case "bulletList":
          c.toggleBulletList().run();
          break;
        case "orderedList":
          c.toggleOrderedList().run();
          break;
        case "blockquote":
          c.toggleBlockquote().run();
          break;
        case "codeBlock":
          c.toggleCodeBlock().run();
          break;
        case "link": {
          const url = prompt("\u94FE\u63A5 URL:");
          if (url) c.setLink({ href: url }).run();
          break;
        }
        case "image": {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.style.display = "none";
          document.body.appendChild(input);
          input.addEventListener("change", async () => {
            try {
              const file = input.files && input.files[0];
              input.remove();
              if (!file) {
                const url2 = prompt("\u56FE\u7247 URL (\u6216\u53D6\u6D88):");
                if (url2) {
                  applyImageSrcChange({ src: url2 });
                }
                return;
              }
              const safe = (file.name || "image.png").replace(/[^\w.\-\u4e00-\u9fff]+/g, "_");
              const path2 = "media/" + Date.now() + "_" + safe;
              State.mediaFiles[path2] = file;
              const url = await createDisplayObjectURL(file, path2);
              State.mediaUrls[path2] = url;
              applyImageSrcChange({ src: url, alt: file.name || "" });
              markDirty();
              setStatus("\u5DF2\u63D2\u5165\u56FE\u7247", safe + (file.size > 5e5 ? " \xB7 \u663E\u793A\u5DF2\u964D\u91C7\u6837" : ""));
            } catch (e) {
              showToast("\u63D2\u56FE\u5931\u8D25: " + (e.message || e), 3e3);
            }
          }, { once: true });
          setTimeout(() => {
            try {
              if (input.parentNode) input.remove();
            } catch (_) {
            }
          }, 6e4);
          input.click();
          break;
        }
        case "table": {
          if (State.editor.isActive("table")) {
            updateTableControls();
            setStatus("\u8868\u683C", "\u5DF2\u5728\u8868\u683C\u5185 \u2014 \u7528\u6D6E\u52A8\u6761\u589E\u5220\u884C\u5217");
          } else {
            c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            setStatus("\u5DF2\u63D2\u5165\u8868\u683C", "3\xD73 \xB7 \u70B9\u5355\u5143\u683C\u7528\u6D6E\u52A8\u6761 +\u884C/+\u5217");
          }
          break;
        }
      }
      updateToolbarState();
    });
  });
  setupFormatMoreMenu();
  document.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.filterTab;
      if (mode === "all") {
        State.filterOpen = true;
        State.filterResolved = true;
      } else if (mode === "open") {
        State.filterOpen = true;
        State.filterResolved = false;
      } else if (mode === "resolved") {
        State.filterOpen = false;
        State.filterResolved = true;
      }
      syncFilterTabsFromCheckboxes();
      renderCommentList();
    });
    btn.addEventListener("keydown", (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const tabs = Array.from(document.querySelectorAll(".filter-tab"));
      const index = tabs.indexOf(btn);
      if (index < 0) return;
      e.preventDefault();
      let next = index;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      else next = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    });
  });
  $("#btn-toggle-render").addEventListener("click", () => {
    setRenderMode(State.renderMode === "rendered" ? "source" : "rendered");
  });
  updateToggleBtnIcon();
  function syncPaneControls(kind, open) {
    const action = kind === 'outline' ? 'toggle-file-pane' : 'toggle-comment-pane';
    const label = kind === 'outline' ? '大纲栏' : '批注栏';
    document.querySelectorAll(`[data-act="${action}"]`).forEach((btn) => {
      // Toolbar toggles are owned by syncToolbarActionState; only aside expand/collapse buttons stay here.
      if (btn.classList.contains('tb-pane-toggle') || btn.closest('#toolbar')) return;
      const inPane = Boolean(btn.closest('aside'));
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', `${inPane ? '收起' : '展开'}${label}`);
    });
  }
  function syncPaneToggleChips() {
    syncPaneControls('outline', !document.body.classList.contains('file-pane-collapsed'));
    syncPaneControls('comment', !document.body.classList.contains('comment-pane-collapsed'));
    try { syncToolbarActionState(); } catch {}
  }
  function toggleFilePane() {
    const collapsed = document.body.classList.toggle('file-pane-collapsed');
    const expandBtn = $('#expand-file-pane-btn');
    if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
    syncPaneToggleChips();
  }
  function toggleCommentPane() {
    const collapsed = document.body.classList.toggle('comment-pane-collapsed');
    const expandBtn = document.getElementById('expand-comment-pane-btn');
    if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
    syncPaneToggleChips();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="live-sync-takeover"]')) {
      e.preventDefault();
      takeOverLiveEditing();
      return;
    }
    if (e.target.closest('[data-act="toggle-file-pane"]')) {
      toggleFilePane();
    }
    if (e.target.closest('[data-act="toggle-comment-pane"]')) {
      toggleCommentPane();
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "[") {
      e.preventDefault();
      toggleFilePane();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "]") {
      e.preventDefault();
      toggleCommentPane();
    }
  });
  // Narrow / touch: auto-collapse side panes under 900px
  try {
    const mq = window.matchMedia("(max-width: 900px)");
    const applyNarrow = () => {
      if (mq.matches) {
        if (!document.body.classList.contains("file-pane-collapsed")) {
          document.body.classList.add("file-pane-collapsed");
          const expandBtn = $("#expand-file-pane-btn");
          if (expandBtn) expandBtn.classList.remove("hidden");
        }
        document.body.classList.add("is-narrow");
      } else {
        document.body.classList.remove("is-narrow");
      }
      syncPaneToggleChips();
    };
    applyNarrow();
    if (mq.addEventListener) mq.addEventListener("change", applyNarrow);
    else if (mq.addListener) mq.addListener(applyNarrow);
  } catch (_) {}
  // Expose for tests
  window.__mdAnnotatorTogglePanes = { toggleFilePane, toggleCommentPane, syncPaneToggleChips };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "b" || e.key === "B")) {
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const hasOpenMenu = document.querySelector(".comment-menu:not(.hidden)");
      if (hasOpenMenu) {
        e.preventDefault();
        closeAllCommentMenus();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveCurrent();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      triggerCommentCreate();
      return;
    }

  });
}
function updateToolbarState() {
  const editor2 = State.editor;
  if (!editor2) return;
  $$("#format-toolbar button[data-cmd]").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    let isActive2 = false;
    try {
      switch (cmd) {
        case "bold":
          isActive2 = editor2.isActive("bold");
          break;
        case "italic":
          isActive2 = editor2.isActive("italic");
          break;
        case "strike":
          isActive2 = editor2.isActive("strike");
          break;
        case "code":
          isActive2 = editor2.isActive("code");
          break;
        case "superscript":
          isActive2 = editor2.isActive("superscript");
          break;
        case "subscript":
          isActive2 = editor2.isActive("subscript");
          break;
        case "h1":
          isActive2 = editor2.isActive("heading", { level: 1 });
          break;
        case "h2":
          isActive2 = editor2.isActive("heading", { level: 2 });
          break;
        case "h3":
          isActive2 = editor2.isActive("heading", { level: 3 });
          break;
        case "bulletList":
          isActive2 = editor2.isActive("bulletList");
          break;
        case "orderedList":
          isActive2 = editor2.isActive("orderedList");
          break;
        case "blockquote":
          isActive2 = editor2.isActive("blockquote");
          break;
        case "codeBlock":
          isActive2 = editor2.isActive("codeBlock");
          break;
        case "link":
          isActive2 = editor2.isActive("link");
          break;
        // table/image are insert actions, not format toggles — never paint is-active
        // (isActive("table") stays true while the caret is inside a cell and looked "stuck on").
        case "table":
        case "image":
          isActive2 = false;
          break;
      }
    } catch (e) {
    }
    btn.classList.toggle("is-active", isActive2);
  });
  const helpCloseBtn = document.querySelector("#help-popover .help-popover-close");
  const helpDemoBtn = document.querySelector("#help-demo-btn");
  if (helpDemoBtn) {
    helpDemoBtn.addEventListener("click", () => {
      loadDemoDocument();
      closeHelp();
    });
  }
  if (helpCloseBtn) {
    helpCloseBtn.addEventListener("click", closeHelp);
  }
  document.addEventListener("mousedown", (e) => {
    if (!isHelpOpen()) return;
    const popover = document.querySelector("#help-popover");
    const btn = document.querySelector("#help-btn");
    if (popover && !popover.contains(e.target) && btn && !btn.contains(e.target)) {
      closeHelp();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isHelpOpen()) {
      closeHelp();
      e.preventDefault();
    }
    if (e.key === "?" || e.key === "/" && e.shiftKey) {
      const tag = (e.target?.tagName || "").toLowerCase();
      const isEditable = e.target?.isContentEditable || tag === "input" || tag === "textarea";
      if (!isEditable) {
        toggleHelp();
        e.preventDefault();
      }
    }
  });
  const settingsBtn = document.querySelector("#settings-btn");
  if (settingsBtn) settingsBtn.addEventListener("click", toggleSettings);
  const settingsCloseBtn = document.querySelector("#settings-popover .settings-popover-close");
  if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettings);
  document.querySelectorAll("#settings-max-annotations .settings-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = parseInt(btn.dataset.max, 10);
      setMaxAnnotations(v);
    });
  });
  document.querySelectorAll("#settings-autosave-debounce .settings-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = parseInt(btn.dataset.ms, 10);
      setAutosaveDebounce(v);
    });
  });
  document.querySelectorAll("#settings-version-history-toggle .settings-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      setVersionHistoryEnabled(btn.dataset.vh === "1");
    });
  });
  document.querySelectorAll("#settings-version-max .settings-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      setVersionMaxAutosave(parseInt(btn.dataset.maxv, 10));
    });
  });
  document.querySelectorAll("#settings-theme .settings-opt").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.theme));
  });
  document.addEventListener("mousedown", (e) => {
    if (!isSettingsOpen()) return;
    const popover = document.querySelector("#settings-popover");
    const btn = document.querySelector("#settings-btn");
    if (popover && !popover.contains(e.target) && btn && !btn.contains(e.target)) {
      closeSettings();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSettingsOpen()) {
      closeSettings();
      e.preventDefault();
    }
  });
}
function setupEditorSelectionObserver() {
  State.editor.on("selectionUpdate", updateToolbarState);
  State.editor.on("transaction", updateToolbarState);
  State.editor.on("transaction", () => updateDocMeta());
}
/**
 * Resolve a caret position for a pure click on an annotation mark.
 * Clamps into mark interior so the caret is usable for typing next to the highlight.
 */
function caretPosForMarkClick(threadId, clientX, clientY) {
  const editor2 = State.editor;
  if (!editor2 || !editor2.view || !threadId) return null;
  let targetPos = null;
  try {
    const coords = editor2.view.posAtCoords({ left: clientX, top: clientY });
    if (coords && typeof coords.pos === "number") targetPos = coords.pos;
  } catch (err) {
    targetPos = null;
  }
  const markType = editor2.schema.marks.annotation;
  let markFrom = null;
  let markTo = null;
  editor2.state.doc.descendants((node, p) => {
    if (!node.isText) return;
    const m = node.marks.find((mm) => mm.type === markType && mm.attrs.threadId === threadId);
    if (!m) return;
    const end = p + node.nodeSize;
    if (markFrom === null || p < markFrom) markFrom = p;
    if (markTo === null || end > markTo) markTo = end;
  });
  if (markFrom == null || markTo == null || markFrom >= markTo) return targetPos;
  if (targetPos == null) targetPos = markFrom + 1;
  if (targetPos <= markFrom) targetPos = Math.min(markFrom + 1, markTo - 1);
  if (targetPos >= markTo) targetPos = Math.max(markFrom + 1, markTo - 1);
  if (targetPos < markFrom) targetPos = markFrom;
  return targetPos;
}
function setupAnnotationMarkClickObserver() {
  const editorEl = State.editor.view.dom;
  /**
   * Annotation mark pointer handling.
   *
   * CRITICAL: do NOT preventDefault/stopPropagation on mousedown.
   * The old interceptor forced a caret on every mousedown inside .annotation-mark,
   * which made drag-select inside highlighted body text impossible and broke
   * double/triple-click. On long marks that span most of a paragraph/body, the
   * only selection users could still get looked like "select whole body".
   *
   * Pure single click → caret + activate thread (handled in pointerup settle).
   * Drag / multi-click / shift-click → native ProseMirror selection.
   */
  editorEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
      _selPtr.markClick = null;
      return;
    }
    const markEl = e.target.closest && e.target.closest(".annotation-mark");
    if (!markEl) {
      _selPtr.markClick = null;
      return;
    }
    const threadId = markEl.getAttribute("data-thread-id");
    if (!threadId) {
      _selPtr.markClick = null;
      return;
    }
    // Only record intent here. Do NOT dispatch transactions / re-render on mousedown —
    // highlightActiveMark + renderCommentList would interrupt native drag-select inside the mark.
    const detail = e.detail > 0 ? e.detail : 1;
    _selPtr.clickDetail = detail;
    _selPtr.markClick = {
      threadId,
      x: e.clientX,
      y: e.clientY,
      detail
    };
  }, true);
}
function isSelectionInTable(editor2) {
  if (!editor2) return false;
  try {
    if (editor2.isActive("table")) return true;
    const sel = editor2.state.selection;
    if (sel && sel.$anchorCell) return true;
    const $from = editor2.state.doc.resolve(sel.from);
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d).type.name;
      if (n === "table" || n === "tableCell" || n === "tableHeader" || n === "tableRow") return true;
    }
  } catch (e) {
  }
  return false;
}
function updateTableControls() {
  const bar = document.querySelector("#table-controls");
  const editor2 = State.editor;
  if (!bar || !editor2) return;
  if (State.renderMode === "source" || !isSelectionInTable(editor2)) {
    bar.classList.add("hidden");
    return;
  }
  try {
    const sel = editor2.state.selection;
    const pos = sel.from;
    const coords = editor2.view.coordsAtPos(pos);
    const editorPane = document.querySelector("#editor-pane");
    if (!editorPane) return;
    const paneRect = editorPane.getBoundingClientRect();
    let top = coords.top - paneRect.top + editorPane.scrollTop - 40;
    let left = coords.left - paneRect.left + editorPane.scrollLeft;
    try {
      const domAt = editor2.view.domAtPos(pos);
      let el = domAt && domAt.node;
      if (el && el.nodeType === 3) el = el.parentElement;
      const tableEl = el && el.closest ? el.closest("table") : null;
      if (tableEl) {
        const tr2 = tableEl.getBoundingClientRect();
        top = tr2.top - paneRect.top + editorPane.scrollTop - 38;
        left = tr2.left - paneRect.left + editorPane.scrollLeft;
      }
    } catch (e) {
    }
    bar.style.top = Math.max(4, top) + "px";
    bar.style.left = Math.max(4, left) + "px";
    bar.classList.remove("hidden");
  } catch (e) {
    bar.classList.add("hidden");
  }
}
function runTableCommand(act) {
  const ed = State.editor;
  if (!ed || !isSelectionInTable(ed)) {
    setStatus("\u63D0\u793A", "\u8BF7\u5148\u628A\u5149\u6807\u653E\u8FDB\u8868\u683C");
    return;
  }
  const c = ed.chain().focus();
  let ok = false;
  switch (act) {
    case "row-before":
      ok = c.addRowBefore().run();
      break;
    case "row-after":
      ok = c.addRowAfter().run();
      break;
    case "col-before":
      ok = c.addColumnBefore().run();
      break;
    case "col-after":
      ok = c.addColumnAfter().run();
      break;
    case "del-row":
      ok = c.deleteRow().run();
      break;
    case "del-col":
      ok = c.deleteColumn().run();
      break;
    case "del-table":
      if (!confirm("\u5220\u9664\u6574\u5F20\u8868\u683C\uFF1F")) return;
      ok = c.deleteTable().run();
      break;
    default:
      return;
  }
  if (!ok) {
    showToast("\u8868\u683C\u64CD\u4F5C\u5931\u8D25", 1800);
    setStatus("\u8868\u683C", "\u64CD\u4F5C\u672A\u751F\u6548 \u2014 \u786E\u8BA4\u5149\u6807\u5728\u5355\u5143\u683C\u5185");
  } else {
    const labels = {
      "row-before": "\u5DF2\u5728\u4E0A\u65B9\u63D2\u5165\u884C",
      "row-after": "\u5DF2\u5728\u4E0B\u65B9\u63D2\u5165\u884C",
      "col-before": "\u5DF2\u5728\u5DE6\u4FA7\u63D2\u5165\u5217",
      "col-after": "\u5DF2\u5728\u53F3\u4FA7\u63D2\u5165\u5217",
      "del-row": "\u5DF2\u5220\u9664\u884C",
      "del-col": "\u5DF2\u5220\u9664\u5217",
      "del-table": "\u5DF2\u5220\u9664\u8868\u683C"
    };
    setStatus("\u8868\u683C", labels[act] || "\u5DF2\u66F4\u65B0");
  }
  queueMicrotask(() => updateTableControls());
}
function setupTableControls() {
  const bar = document.querySelector("#table-controls");
  if (!bar) return;
  bar.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-table-act]");
    if (!btn) return;
    runTableCommand(btn.dataset.tableAct);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const ed = State.editor;
    if (!ed || !isSelectionInTable(ed)) return;
    e.preventDefault();
    const canNext = typeof ed.can().goToNextCell === "function" ? ed.can().goToNextCell() : true;
    if (canNext && ed.commands.goToNextCell()) {
      updateTableControls();
      return;
    }
    ed.chain().focus().addRowAfter().run();
    try {
      ed.commands.goToNextCell();
    } catch (err) {
    }
    setStatus("\u8868\u683C", "\u5DF2\u81EA\u52A8\u6DFB\u52A0\u4E00\u884C (Tab)");
    queueMicrotask(() => updateTableControls());
  }, true);
  const pane = document.querySelector("#editor-pane");
  if (pane) pane.addEventListener("scroll", () => updateTableControls(), { passive: true });
}

/* ===== v1.44.6 update detection (GitHub Releases, offline-silent) ===== */
const MENTOR_UPDATE_REPO = "Paradeluxe/Mentor-md";
const MENTOR_UPDATE_API = `https://api.github.com/repos/${MENTOR_UPDATE_REPO}/releases/latest`;
const MENTOR_RELEASES_URL = `https://github.com/${MENTOR_UPDATE_REPO}/releases/latest`;
const MENTOR_UPDATE_LS = "Mentor:updateCheck";
const MENTOR_UPDATE_TTL_MS = 24 * 60 * 60 * 1000;

function getLocalMentorVersion() {
  try {
    const meta = document.querySelector('meta[name="build"]');
    const content = (meta && meta.getAttribute("content")) || "";
    const m = content.match(/v(\d+\.\d+\.\d+)/i);
    if (m) return m[1];
  } catch (_) {}
  return "0.0.0";
}

function parseSemver(v) {
  const s = String(v || "").trim().replace(/^v/i, "");
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/** @returns {number} >0 if a>b, 0 equal, <0 if a<b, NaN if unparsable */
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return NaN;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function readUpdateCache() {
  try {
    const raw = localStorage.getItem(MENTOR_UPDATE_LS);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    return o;
  } catch (_) {
    return null;
  }
}

function writeUpdateCache(partial) {
  try {
    const prev = readUpdateCache() || {};
    const next = { ...prev, ...partial, updatedAt: Date.now() };
    localStorage.setItem(MENTOR_UPDATE_LS, JSON.stringify(next));
    return next;
  } catch (_) {
    return null;
  }
}

function dismissUpdateBanner() {
  const banner = document.querySelector("#update-banner");
  if (banner) banner.classList.add("hidden");
  const cache = readUpdateCache() || {};
  writeUpdateCache({ dismissedLatest: cache.latest || null, dismissedAt: Date.now() });
}

function renderUpdateUi(state) {
  const local = state.local || getLocalMentorVersion();
  const curEl = document.querySelector("#settings-version-current");
  const stEl = document.querySelector("#settings-version-status");
  const linkEl = document.querySelector("#settings-version-link");
  const banner = document.querySelector("#update-banner");
  const bannerText = document.querySelector("#update-banner-text");
  const bannerLink = document.querySelector("#update-banner-link");
  if (curEl) curEl.textContent = `当前 v${local}`;
  if (bannerLink) bannerLink.href = state.htmlUrl || MENTOR_RELEASES_URL;
  if (linkEl) linkEl.href = state.htmlUrl || MENTOR_RELEASES_URL;

  const hasNewer = !!(state.latest && compareSemver(state.latest, local) > 0);
  const cache = readUpdateCache() || {};
  const dismissed = hasNewer && cache.dismissedLatest === state.latest;

  if (stEl) {
    if (state.error === "offline") stEl.textContent = "离线 — 无法检查";
    else if (state.error === "network") stEl.textContent = "检查失败（网络）";
    else if (state.error === "api") stEl.textContent = "检查失败（GitHub）";
    else if (state.checking) stEl.textContent = "检查中…";
    else if (hasNewer) stEl.textContent = `有新版本 v${state.latest}`;
    else if (state.latest) stEl.textContent = "已是最新";
    else stEl.textContent = "";
  }
  if (linkEl) linkEl.classList.toggle("hidden", !hasNewer);

  if (banner && bannerText) {
    if (hasNewer && !dismissed && state.showBanner !== false) {
      bannerText.textContent = `Mentor v${state.latest} 可用（当前 v${local}）`;
      banner.classList.remove("hidden");
    } else if (!hasNewer) {
      banner.classList.add("hidden");
    }
  }
}

/**
 * Check GitHub latest release.
 * @param {{force?: boolean, quiet?: boolean, showBanner?: boolean}} opts
 * force: ignore 24h TTL. quiet: no toast on "already latest".
 */
async function checkForUpdate(opts = {}) {
  const force = !!opts.force;
  const quiet = opts.quiet !== false; // default quiet for auto
  const showBanner = opts.showBanner !== false;
  const local = getLocalMentorVersion();
  const cache = readUpdateCache() || {};
  const now = Date.now();

  if (!force && cache.checkedAt && now - cache.checkedAt < MENTOR_UPDATE_TTL_MS && cache.latest) {
    const state = {
      local,
      latest: cache.latest,
      htmlUrl: cache.htmlUrl || MENTOR_RELEASES_URL,
      fromCache: true,
      showBanner,
    };
    renderUpdateUi(state);
    return state;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const state = { local, error: "offline", showBanner: false };
    renderUpdateUi(state);
    return state;
  }

  renderUpdateUi({ local, checking: true, showBanner: false });
  const btn = document.querySelector("#settings-check-update");
  if (btn) btn.classList.add("is-busy");

  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    const res = await fetch(MENTOR_UPDATE_API, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl ? ctrl.signal : undefined,
      cache: "no-store",
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) {
      // No releases yet → fall back to tags
      if (res.status === 404) {
        const tagsRes = await fetch(
          `https://api.github.com/repos/${MENTOR_UPDATE_REPO}/tags?per_page=5`,
          {
            method: "GET",
            headers: { Accept: "application/vnd.github+json" },
            signal: ctrl ? ctrl.signal : undefined,
            cache: "no-store",
          }
        );
        if (tagsRes.ok) {
          const tags = await tagsRes.json();
          const tagName = Array.isArray(tags) && tags[0] ? String(tags[0].name || "") : "";
          const latestFromTag = (parseSemver(tagName) && tagName.replace(/^v/i, "")) || "";
          if (latestFromTag) {
            const htmlUrl = MENTOR_RELEASES_URL;
            writeUpdateCache({ checkedAt: Date.now(), latest: latestFromTag, htmlUrl, tag: tagName, source: "tags" });
            const state = { local, latest: latestFromTag, htmlUrl, tag: tagName, showBanner, source: "tags" };
            renderUpdateUi(state);
            const cmp = compareSemver(latestFromTag, local);
            if (!quiet) {
              if (cmp > 0) showToast(`有新版本 v${latestFromTag}`, 2800);
              else if (cmp === 0) showToast("已是最新版本", 1800);
            }
            return state;
          }
        }
      }
      const state = { local, error: "api", status: res.status, showBanner: false };
      renderUpdateUi(state);
      if (!quiet) showToast("检查更新失败", 2200);
      return state;
    }
    const data = await res.json();
    const tag = String(data.tag_name || data.name || "").trim();
    const latest = (parseSemver(tag) && tag.replace(/^v/i, "")) || "";
    const htmlUrl = data.html_url || MENTOR_RELEASES_URL;
    writeUpdateCache({
      checkedAt: Date.now(),
      latest,
      htmlUrl,
      tag,
    });
    const state = { local, latest, htmlUrl, tag, showBanner };
    renderUpdateUi(state);
    const cmp = compareSemver(latest, local);
    if (!quiet) {
      if (cmp > 0) showToast(`有新版本 v${latest}`, 2800);
      else if (cmp === 0) showToast("已是最新版本", 1800);
      else if (latest) showToast(`当前 v${local}（远端 v${latest}）`, 2200);
    }
    return state;
  } catch (e) {
    const state = { local, error: "network", message: String(e && e.message || e), showBanner: false };
    renderUpdateUi(state);
    if (!quiet) showToast("检查更新失败（网络）", 2200);
    return state;
  } finally {
    if (btn) btn.classList.remove("is-busy");
  }
}

function initUpdateUi() {
  const local = getLocalMentorVersion();
  renderUpdateUi({ local, latest: (readUpdateCache() || {}).latest, htmlUrl: (readUpdateCache() || {}).htmlUrl, showBanner: true });

  const dismiss = document.querySelector("#update-banner-dismiss");
  if (dismiss && !dismiss._mentorBound) {
    dismiss._mentorBound = true;
    dismiss.addEventListener("click", (e) => {
      e.preventDefault();
      dismissUpdateBanner();
    });
  }
  const checkBtn = document.querySelector("#settings-check-update");
  if (checkBtn && !checkBtn._mentorBound) {
    checkBtn._mentorBound = true;
    checkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      checkForUpdate({ force: true, quiet: false, showBanner: true });
    });
  }
  // deferred auto-check: don't compete with boot reconnect
  setTimeout(() => {
    checkForUpdate({ force: false, quiet: true, showBanner: true }).catch(() => {});
  }, 3500);
}

async function boot() {
  setTheme(getTheme(), { persist: false });
  initEditor();
  try {
    setupDocTabs();
  } catch (e) {
    console.warn("[tabs] setup", e);
  }
  setupToolbar();
  initSaveDialog();
  setupFloatCommentButton();
  setupTableControls();
  setupFileListDropdown();
  initReferencesPane();
  setupPaneResizer();
  setupOutlineModeTabs();
  setupEditorSelectionObserver();
  setupAnnotationMarkClickObserver();
  setupTreeActionDelegation();
  setupEmptyTreeClick();
  setupTreeSearch();
  const chip = document.querySelector("#author-chip");
  if (chip) {
    chip.addEventListener("click", () => promptAuthor({ firstTime: false }));
  }
  if (!State.authorId) {
    State.authorId = uuid();
    localStorage.setItem("Mentor:authorId", State.authorId);
  }
  renderAuthorChip();
  try {
    // Preheat atomic drafts (body + ann) first
    try {
      const drafts = await DraftStore.list();
      for (const row of drafts || []) {
        if (!row) continue;
        const mem = {
          body: row.body || "",
          sidecar: row.sidecar || { annotations: row.annotations || [] },
          annotations: row.annotations || (row.sidecar && row.sidecar.annotations) || [],
          updatedAt: row.updatedAt || 0,
          documentId: row.documentId,
          name: row.name
        };
        if (row.documentId) State.idbCache[row.documentId] = mem;
        if (row.name) State.idbCache[row.name] = mem;
      }
    } catch (e) {
      console.warn("[P-reload] DraftStore preheat:", e);
    }
    const allKeys = await AnnotationStore.list();
    if (allKeys && allKeys.length > 0) {
      for (const entry of allKeys) {
        if (entry && entry.name) {
          const prev = State.idbCache[entry.name] || {};
          State.idbCache[entry.name] = {
            ...prev,
            sidecar: entry.sidecar || prev.sidecar,
            annotations: (entry.sidecar && entry.sidecar.annotations) || prev.annotations,
            updatedAt: entry.updatedAt || prev.updatedAt,
            documentId: entry.documentId || prev.documentId
          };
          if (entry.documentId) {
            State.idbCache[entry.documentId] = State.idbCache[entry.name];
          }
        }
      }
      console.log(`[P-reload] IDB \u9884\u70ED ${Object.keys(State.idbCache).length} \u4E2A\u6587\u4EF6`);
    }
  } catch (e) {
    console.warn("[P-reload] IDB \u9884\u70ED\u5931\u8D25 (\u975E\u963B\u585E):", e);
  }
  try {
    new JSZip();
    State.jszipPrewarmed = true;
    console.log("[P-zip] JSZip \u9884\u70ED\u5B8C\u6210");
  } catch (e) {
    console.warn("[P-zip] JSZip \u9884\u70ED\u5931\u8D25 (\u975E\u963B\u585E):", e);
  }
  const browserNote = FS_API.browserNote();
  if (browserNote) {
    setStatus("\u6D4F\u89C8\u5668\u517C\u5BB9\u6027\u63D0\u793A", browserNote);
  } else {
    setStatus("\u5C31\u7EEA", "\u6253\u5F00\u6216\u65B0\u5EFA .md \u5F00\u59CB\u6279\u6CE8");
  }
  const isFirstTime = !localStorage.getItem("Mentor:authorPrompted") && !localStorage.getItem("Mentor:author");
  if (isFirstTime) {
    setTimeout(() => promptAuthor({ firstTime: true }), 400);
  }
  // Word-style only: pending-open before workspace reconnect (no deep-link).
  let launchOpened = false;
  try {
    launchOpened = await consumeLaunchOpen();
  } catch (e) {
    console.warn("[boot] consumeLaunchOpen failed:", e);
  }
  if (!launchOpened) {
    await tryReconnect();
  }
  try {
    initUpdateUi();
  } catch (e) {
    console.warn("[update] init failed", e);
  }
}
async function tryReconnect() {
  try {
    const restored = await restoreWorkspaceSession();
    if (restored) return;
    await tryReconnectLastFile();
  } catch (e) {
    console.warn("\u91CD\u8FDE\u5931\u8D25:", e);
  }
}
async function restoreWorkspaceEntry(entry) {
  if (!entry || !entry.documentId) return false;
  const handle = await HandleStore.getFile(entry.documentId);
  if (handle) {
    let permission = "prompt";
    try { permission = await handle.queryPermission({ mode: "readwrite" }); } catch (_) {}
    if (permission === "granted") {
      await openFromMentorHandle(handle, {
        quiet: true,
        preferDraft: true,
        documentId: entry.documentId
      });
      return true;
    }
  }
  const draft = await restoreDraftIfAny(entry.documentId, entry.name);
  if (!draft) return false;
  await activateOpenedDocument({
    name: entry.name || draft.name || "untitled.md",
    content: draft.body || "",
    annotations: draft.sidecar || { annotations: draft.annotations || [] },
    references: draft.references,
    documentId: entry.documentId,
    saveMode: entry.saveMode || "mentor-download",
    quiet: true,
    preferDraft: false,
    forceDisk: true
  });
  return true;
}
async function restoreWorkspaceSession() {
  const session = normalizeWorkspaceSession(await HandleStore.getWorkspaceSession());
  if (!session.tabs.length) return false;
  _restoringWorkspaceSession = true;
  const failed = [];
  try {
    for (const entry of session.tabs) {
      try {
        if (!(await restoreWorkspaceEntry(entry))) failed.push(entry.name || entry.documentId);
      } catch (error) {
        failed.push(entry.name || entry.documentId);
        console.warn("[workspace] restore entry failed", entry && entry.name, error);
      }
    }
    const ordered = orderRestoredTabs(State.tabs, session);
    State.tabs = ordered.tabs;
    const active = State.tabs.find((tab) =>
      tab && tab.currentFile && tab.currentFile.documentId === ordered.activeDocumentId
    );
    if (active && active.id !== State.activeTabId) restoreTab(active);
    renderDocTabs();
  } finally {
    _restoringWorkspaceSession = false;
  }
  await persistWorkspaceSessionNow();
  try {
    // After hydration finishes, rebind poller once for the active document.
    startSupervisionPolling();
  } catch (_) {}
  if (State.tabs.length > 0) {
    if (failed.length) {
      setStatus(
        `\u5DF2\u6062\u590D ${State.tabs.length} \u4E2A\u6807\u7B7E`,
        `${failed.length} \u4E2A\u6587\u4EF6\u9700\u8981\u91CD\u65B0\u6388\u6743\u6216\u91CD\u65B0\u6253\u5F00`
      );
    } else {
      setStatus(`\u5DF2\u6062\u590D ${State.tabs.length} \u4E2A\u6807\u7B7E`, "F5 \u5DE5\u4F5C\u533A\u5DF2\u6062\u590D");
    }
  }
  return State.tabs.length > 0;
}
async function tryReconnectLastFile() {
  try {
    const last = await HandleStore.getLastFile();
    if (!last || !last.fileName) return;
    if (!/\.mentor$/i.test(last.fileName)) {
      console.log(`[P-reconnect] \u8DF3\u8FC7\u65E7\u683C\u5F0F handle: ${last.fileName} (\u9700\u624B\u52A8\u91CD\u65B0\u6253\u5F00 .mentor)`);
      try {
        await HandleStore.deleteFile(last.documentId || last.fileName);
      } catch (e) {
      }
      try {
        await HandleStore.removeLastFile();
      } catch (e) {
      }
      setStatus("\u6587\u4EF6\u683C\u5F0F\u5DF2\u5347\u7EA7", "\u8BF7\u624B\u52A8\u91CD\u65B0\u6253\u5F00 .mentor \u6587\u4EF6");
      return;
    }
    const handle = await HandleStore.getFile(last.documentId || last.fileName);
    if (!handle) return;
    let perm = "prompt";
    try {
      perm = await handle.queryPermission({ mode: "readwrite" });
    } catch (e) {
      perm = "prompt";
    }
    if (perm !== "granted") {
      try {
        const newPerm = await handle.requestPermission({ mode: "readwrite" });
        if (newPerm !== "granted") {
          setStatus("\u4E0A\u6B21\u6587\u4EF6\u672A\u6388\u6743", `${last.fileName} \u2014 \u70B9\u51FB\u6587\u4EF6\u6811\u91CD\u9009\u6587\u4EF6\u4EE5\u6388\u6743`);
          return;
        }
        showToast("\u5DF2\u91CD\u65B0\u83B7\u5F97\u6587\u4EF6\u6743\u9650, autosave \u542F\u7528", 3e3);
      } catch (e) {
        console.warn("[tryReconnect] requestPermission \u5931\u8D25:", e);
        setStatus("\u4E0A\u6B21\u6587\u4EF6\u672A\u6388\u6743", `${last.fileName} \u2014 \u70B9\u51FB\u6587\u4EF6\u6811\u91CD\u9009\u4EE5\u6388\u6743`);
        return;
      }
    } else {
      console.log("[tryReconnect] write \u6743\u9650\u5DF2 granted, autosave \u542F\u7528");
    }
    // preferDraft: crash recovery after reload — restore unsaved body+ann from DraftStore
    await openFromMentorHandle(handle, {
      preferDraft: true,
      documentId: last.documentId || null
    });
    renderFilePaneCurrent();
    setStatus(`\u5DF2\u91CD\u8FDE ${last.fileName}`, "Ctrl+S \u76F4\u63A5\u4FDD\u5B58\u5230\u539F\u4F4D\u7F6E");
  } catch (e) {
    console.warn("\u91CD\u8FDE\u5931\u8D25:", e);
  }
}
document.addEventListener("DOMContentLoaded", boot);
function _stripOpenQueryFromUrl() {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has("open") && !u.searchParams.has("token")) return;
    u.searchParams.delete("open");
    u.searchParams.delete("token");
    const q = u.searchParams.toString();
    const next = u.pathname + (q ? "?" + q : "") + u.hash;
    history.replaceState(null, "", next);
  } catch (e) {
    console.warn("[?open] strip url failed:", e);
  }
}
async function _fetchSessionToken() {
  try {
    const sr = await fetch(location.origin + "/session", { cache: "no-store" });
    if (!sr.ok) return "";
    const sj = await sr.json();
    return sj && sj.token ? String(sj.token) : "";
  } catch {
    return "";
  }
}
async function _openMentorAbsolutePath(openPath, token) {
  const baseName = openPath.split("\\").pop().split("/").pop() || "open.mentor";
  if (State.currentFile && State.currentFile.name === baseName && hasWriteHandle()) {
    console.log("[launch-open] already loaded with write handle");
    return true;
  }
  let opened = false;
  try {
    try {
      let stored = null;
      try { stored = await HandleStore.getFile(baseName); } catch (_) {}
      if (stored) {
        let perm = "prompt";
        try { perm = await stored.queryPermission({ mode: "readwrite" }); } catch (_) {}
        if (perm === "granted") {
          State.diskPathHint = openPath;
          State.externalWatchPath = openPath;
          State.externalWatchToken = token || "";
          await openFromMentorHandle(stored, { preserveExternalWatch: true });
          try { startSupervisionPolling(); } catch (_) {}
          try {
            if (typeof startExternalWatchForCurrentDocument === "function") {
              await startExternalWatchForCurrentDocument();
            }
          } catch (_) {}
          opened = true;
          showToast("已打开并可写回 " + baseName, 2500);
        }
      }
    } catch (e) {
      console.warn("[launch-open] stored-handle open failed:", e);
    }

    if (!opened) {
      const url = location.origin + "/open?path=" + encodeURIComponent(openPath) + (token ? "&token=" + encodeURIComponent(token) : "");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        console.warn("[launch-open] fetch failed:", r.status, r.statusText);
        showToast("无法打开文件 (HTTP " + r.status + ")", 2800);
      } else {
        const blob = await r.blob();
        const file = new File([blob], baseName, { type: "application/zip" });
        for (let i = 0; i < 100 && !(State.editor && typeof openFromMentorFile === "function"); i++) {
          await new Promise((r2) => setTimeout(r2, 50));
        }
        if (typeof openFromMentorFile === "function" && State.editor) {
          State.diskPathHint = openPath;
          State.externalWatchPath = openPath;
          State.externalWatchToken = token || "";
          await openFromMentorFile(file);
          try { startSupervisionPolling(); } catch (_) {}
          opened = true;
          let upgraded = false;
          try {
            const up = await tryAttachStoredWriteHandle(baseName);
            upgraded = !!(up && up.ok);
          } catch (_) {}
          if (upgraded) {
            showToast("已打开并可写回 " + baseName, 2500);
          } else {
            showToast("已打开 " + baseName + " · 保存时授权一次即可写回", 3200);
            try { setStatus("已打开", baseName + " · 保存时点「授权写回」"); } catch (_) {}
          }
        } else {
          console.warn("[launch-open] openFromMentorFile 不可用或 editor 未就绪");
          showToast("应用未就绪, 请稍后手动打开文件", 4e3);
        }
      }
    }
  } catch (e) {
    console.warn("[launch-open] error:", e);
  }
  return opened;
}

async function _consumePendingOpen(token) {
  try {
    const url = location.origin + "/pending-open?token=" + encodeURIComponent(token || "");
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.ok || !j.path) return null;
    return String(j.path);
  } catch (e) {
    console.warn("[pending-open] fetch failed:", e);
    return null;
  }
}

/** Word-style launch only: clean shell + pending-open. No ?open= deep-link. */
async function consumeLaunchOpen() {
  for (let i = 0; i < 100 && !State.editor; i++) {
    await new Promise((r2) => setTimeout(r2, 50));
  }
  const params = new URLSearchParams(location.search);
  // EXPOSE: deep-link removed. If ?open= still present → strip + loud fail (do not open).
  if (params.has("open")) {
    console.error("[launch] deep-link ?open= is removed; use pending-open / double-click / Open");
    try {
      showToast("深链已拆除 · 请用桌面 Mentor / 双击 .mentor / 工具栏打开", 4500);
    } catch (_) {}
    try { setStatus("深链已拆除", "请重新用 Word 式打开"); } catch (_) {}
    _stripOpenQueryFromUrl();
    return false;
  }

  let token = await _fetchSessionToken();
  const openPath = (await _consumePendingOpen(token)) || "";
  if (!openPath) return false;

  const opened = await _openMentorAbsolutePath(openPath, token);
  if (!opened) {
    console.error("[launch] pending-open path failed to load:", openPath);
    try {
      showToast("pending 打开失败 · 看控制台 — 不再回落深链", 4000);
    } catch (_) {}
  }
  return opened;
}

/** @deprecated deep-link removed — alias routes to consumeLaunchOpen (loud fail on ?open=) */
async function _handleUrlOpen() {
  return consumeLaunchOpen();
}


window.__mdAnnotator = {
  State: State,
  FS_API,
  HandleStore,
  DraftStore,
  AnnotationStore,
  VersionStore,
  recordVersionFromSnapshot,
  openVersionHistory,
  closeVersionHistory,
  renderVersionHistory,
  restoreVersion,
  deleteVersion,
  exportVersionAsMentor,
  runNamedVersionPin,
  putAtomicDraftForCurrent,
  persistWorkspaceSessionNow,
  restoreDraftIfAny,
  resolveDraftConflict,
  scheduleIdbCacheWrite,
  markDirty,
  commitHistoryIfNeeded,
  pushHistory,
  undo2,
  redo2,
  resetHistory,
  isPatchHistoryEntry: (e) => isPatchHistoryEntry(e),
  computeInverseAnnPatch,
  applyAnnPatch,
  collectChangedRanges,
  scanAnnotationMarksInRanges,
  highlightActiveMark,
  scheduleValidateMarks,
  _validateMarksAfterEdit,
  activeHighlightKey,
  modules: {
    documentSession: { fingerprintDocument: fingerprintDocumentPure, createDocumentSession, sessionIdentity, sessionsMatch },
    io: { createSerialWriteQueue, createHandleStore, createDraftStore, createAnnotationStore, createVersionStore },
    versionHistory: {
      contentFingerprint: contentFingerprintPure,
      shouldCaptureVersion: shouldCaptureVersionPure,
      pruneVersionList: pruneVersionListPure,
      DEFAULT_VERSION_POLICY
    },
    annotations: {
      computeInverseAnnPatch,
      applyAnnPatch,
      collectChangedRanges,
      isPatchHistoryEntry,
      activeHighlightKey
    },
    tabs: { genTabId: genTabIdPure, findTabByDocument: findTabByDocumentPure, snapshotTabState, tabLabel },
    annotationAnchor: { findOccurrences, scoreCandidate, resolveAnchor, resolveAnchorSet, mapAnchorRange, captureAnchorEvidence, projectLegacyFlags, auditAnnotationInvariants },
    mentorArchive: { createArchiveManifest, verifyStructuralArchive, STRUCTURAL_HTML_NAME, ARCHIVE_MANIFEST_NAME }
  },
  loadMarkdownIntoEditor,
  insertCitation,
  insertCitationIntoSelection: insertCitation,
  focusCitationByKey,
  getCitationUsages,
  collectCitationUsagePositions,
  activateNextCitationUsage,
  reconcileCitationNodes,
  reconcileBibliographyNode,
  insertBibliographyField,
  removeBibliographyField,
  setBibliographyScope,
  materializeBibliographyMarkdown,
  planLegacyBibliographyMigration,
    BIBLIOGRAPHY_MARKER,
    buildBibliographyModel,
    createReferenceManifest,
    normalizeBibliographyConfig,
    normalizeReferenceManifest,
    emptyReferenceManifest,
    bibliographySourceMarkerHtml() {
    return `<span class="source-bibliography-marker" contenteditable="false" data-source-token="bibliography">References（由文献库生成）</span>`;
  },
  get references() { return normalizeReferenceManifest(State.references); },
  addReferenceEntry,
  updateReferenceEntry,
  deleteReferenceEntry,
  importReferenceFile,
  exportReferencesBib,
  openReferenceEditor,
  closeReferenceEditor,
  commitReferenceManifest,
  syncToolbarActionState,
  getToolbarActionState,
  PRIMARY_TOOLBAR_ACTIONS,
  runManualSave,
  openSaveDialog,
  buildSaveDialogModel,
  buildSaveResultCopy,
  newDocument,
  createAnnotationFromSelection,
  createAnnotationThread,
  bodyHasAiMarker,
  ensureAiMarker,
  ensureMarker,
  annotationMarkAttrs,
  syncAnnotationMarkModeAttrs,
  isAiCard,
  editComment,
  addReply,
  humanCommentIsWork,
  threadNeedsAiReply,
  stripMarkers,
  getMarkerType,
  applyThreadType,
  normalizeLegacyThreadType,
  migrateLegacyThread,
  prepareAnnotationForMarkerMode,
  MENTION_TYPES,
  // v1.43.31 multi-tab · v1.43.52 open/save lifecycle
  snapshotActiveTab,
  switchToTab,
  closeTab,
  checkForUpdate,
  getLocalMentorVersion,
  compareSemver,
  openNewTabBlank,
  createDisplayObjectURL,
  injectMediaFiles,
  DISPLAY_MAX_EDGE,
  mentorBaseName,
  renderDocTabs,
  prepareOpenDocument,
  activateOpenedDocument,
  rememberOpenedFile,
  createSaveSnapshot,
  flushSourceView,
  setRenderMode,
  fingerprintDocument,
  resolveDocumentId,
  openMultipleHandles,
  saveCurrent,
  downloadMentorSnapshot,
  exportMarkdownSnapshot,
  tryWriteBack,
  tryReconnect,
  promptAuthor,
  openFromHandle,
  openFromMentorHandle,
  openFiles,
  openFilesLegacy,
  openFromMentorFile,
  consumeLaunchOpen,
  openFromDocxFile,
  parseDocxToMentor,
  buildCommentsParts,
  toggleHelp,
  // v1.32: 暴露 help toggle 备用入口, 让 inline onclick 用
  // .mentor 包帮助函数 (给 e2e 测试 + 第三方插件使用)
  isMentorZip,
  readMentorZip,
  assertMentorZipBudget,
  buildMentorZipBlob,
  // v1.37: 暴露 buildDocxBlob 给 e2e 调试用 (主 exports 没暴露, 因为内部用闭包)
  buildDocxBlob,
  // v1.42.8: 暴露 ensureWritePermission 给测试 + 第三方插件用
  ensureWritePermission,
  // v1.42: 暴露 cap 工具函数给测试 / 高级用户脚本
  checkAnnotationCap,
  setMaxAnnotations,
  getTheme,
  setTheme,
  renderOutline,
  findAnnotationRange,
  __anchorResolveCount,
  __resetAnchorResolveCount,
  collectEmbeddedAnnotationRanges,
  sanitizeStructuralHtml,
  computeContextAt,
  collectLiveAnnotationAudit,
  exportAnchorDiagnosis,
  resolveAnchor,
  resolveAnchorSet,
  captureAnchorEvidence,
  auditAnnotationInvariants,
  mapAnchorRange,
  computeContext,
  clearPmHistory,
  mentorExportName,
  // v1.43: 演示文档 (first-time empty state CTA)
  loadDemoDocument,
  syncCommentEmptyPresentation,
  // v1.43.22 figure
  collectImageAnchors,
  resyncImageAnchors,
  buildAnnotationsSidecar,
  serializeAnnotationThread,
  mediaPathForSrc,
  normalizeMediaPath,
  collectReferencedMediaPaths,
  pruneMediaFiles,
  filterMediaFilesForArchive,
  htmlWithMediaPaths,
  htmlWithBlobUrls,
  structuralHtmlHasUnresolvedBlobs,
  applyImageSrcChange,
  refreshAnnotationImageDecos,
  scrollToThread,
  scrollToCommentText,
  scrollEditorPosIntoCenter,
  isImageNodeSelection,
  updateTableControls,
  runTableCommand,
  isSelectionInTable,
  refreshFileListDropdown,
  openRecentFileByName,
  // F-media v1.34: 暴露 media 反查 helper 供诊断用
  revokeMediaUrls,
  revokeTabMedia,
  collectKeptMediaUrls,
  htmlToMarkdownMedia,
  // v1.43.7: 暴露 cross-tab diagnostic 给测试
  // 注意: app.js 是 type=module, 模块作用域不能直接被 __mdAnnotator 对象方法访问
  // 用闭包 trick: 通过 import.meta / globalThis 拿不到. 改: 把 diag 暴露在 window._diagTab (module scope)
  _diagTabRef: () => ({
    hasDocChannel: typeof _liveSync !== "undefined" && _liveSync.channel !== null,
    docChannelPath: typeof _liveSync !== "undefined" ? _liveSync.documentKey : null,
    instanceId: typeof _instanceId !== "undefined" ? _instanceId : null,
    peerCount: typeof _liveSync !== "undefined" && _liveSync.role === "follower" ? 1 : 0,
    peers: typeof _liveSync !== "undefined" && _liveSync.lease.ownerId && _liveSync.lease.ownerId !== _instanceId
      ? [_liveSync.lease.ownerId]
      : [],
    live: typeof getLiveSyncState === "function" ? getLiveSyncState() : null
  }),
  getExternalWatchState,
  flushExternalRefreshForTest,
  startExternalWatchForCurrentDocument,
  stopExternalWatch,
  scheduleExternalRefresh,
  noteExternalOwnWrite,
  getLiveSyncState,
  takeOverLiveEditing,
  openLiveSyncForCurrentDocument,
  closeLiveSync,
  __injectLiveMessageForTest,
  canWriteLiveDocument,
  __diagMedia: () => {
    const M = window.__mdAnnotator;
    const S2 = M.State;
    const imgs = Array.from(document.querySelectorAll("#editor img"));
    return {
      appJs: document.querySelector('script[src*="app.js"]')?.src || "?",
      title: document.title,
      saveMode: S2.saveMode,
      currentFileName: S2.currentFile?.name,
      mediaUrlsKeys: Object.keys(S2.mediaUrls || {}),
      mediaFilesKeys: Object.keys(S2.mediaFiles || {}),
      mediaUrlsSample: Object.entries(S2.mediaUrls || {}).slice(0, 2),
      imgCount: imgs.length,
      imgDetails: imgs.map((i) => ({
        srcPrefix: i.src.slice(0, 30),
        complete: i.complete,
        naturalWidth: i.naturalWidth,
        naturalHeight: i.naturalHeight
      }))
    };
  },
  // H-undo: history stack helpers (pushHistory/resetHistory/_validateMarksAfterEdit exported above)
  undo: undo2,
  redo: redo2,
  rebuildAnnotationMarks,
  applySupervisionPayload,
  getSupervisionState,
  startSupervisionPolling,
  stopSupervisionPolling,
  supervisionKey,
  normalizeSupervisionPayload,
  // H-autosave: autosave helpers (v1.43.54 unified write path)
  startAutosaveTimer,
  stopAutosaveTimer,
  autosaveNow,
  getAutoSaveEnabled,
  setAutoSaveEnabled,
  isAutoSaveDiskActive,
  syncAutosaveToggleUi,
  shouldPromptUnload,
  scheduleAutosaveDebounce,
  hasWriteHandle,
  writeCurrentToHandle,
  writeToHandle,
  finalizeOfficialCommit,
  classifySaveOutcome,
  // v1.43.14
  get AUTOSAVE_DEBOUNCE() {
    return getAutosaveDebounceMs();
  },
  // v1.43.18
  setAutosaveDebounce,
  refreshEmptyRecentFiles,
  // v1.43.16: Worker 状态 + stats (e2e 验证 fallback)
  getZipWorkerState: () => ({
    ready: _zipWorkerReady,
    pending: _zipWorkerPending.size,
    stats: { ..._zipWorkerStats }
  }),
  // v1.43.38: e2e 写盘护栏 + 强制 worker 失败路径
  tryWriteBackMentor,
  killZipWorkerForTest: () => {
    try {
      if (_zipWorker) {
        _zipWorker.terminate();
      }
    } catch (e) {
    }
    _zipWorker = null;
    _zipWorkerReady = false;
    for (const [, pend] of _zipWorkerPending) {
      try {
        pend.reject(new Error("killed for test"));
      } catch (e) {
      }
    }
    _zipWorkerPending.clear();
    return { ready: _zipWorkerReady, stats: { ..._zipWorkerStats } };
  },
  // HTML → markdown 内部 helper（暴露给 e2e 测试 + 第三方插件使用）
  htmlToMarkdown,
  // File pane 测试 API
  fileTypeIcon,
  filterTree,
  renderFilePaneCurrent,
  handleTreeAction,
  // AI 协作协议：结构化 API（不让 AI 通过 UI 模拟点击）
  ai: /* @__PURE__ */ (() => {
    let AI_AUTHOR = "AI Reviewer";
    const MAX_BODY = 5e3;
    const PROTOCOL = "ai-collab-v1";
    function setAuthor(name) {
      if (typeof name === "string" && name.trim()) {
        AI_AUTHOR = name.trim();
        return true;
      }
      return false;
    }
    const _replyLock = /* @__PURE__ */ new Map();
    const _DEDUP_WINDOW_MS = 2e3;
    return {
      __meta: {
        protocol: PROTOCOL,
        get author() {
          return AI_AUTHOR;
        },
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
          canModifyOthers: false
        }
      },
      // ==================== 读 ====================
      /** 列出所有 thread（不修改任何状态） */
      listThreads() {
        return State.annotations.filter((t) => t && typeof t === "object").map((t) => ({
          threadId: t.threadId,
          text: t.text,
          resolved: t.resolved,
          createdAt: t.createdAt,
          commentCount: t.comments.length,
          lastComment: t.comments[t.comments.length - 1] ? {
            author: t.comments[t.comments.length - 1].author,
            body: t.comments[t.comments.length - 1].body.slice(0, 100),
            createdAt: t.comments[t.comments.length - 1].createdAt
          } : null,
          // AI 卡：人类留言无论有无 @AI 都待回；人类卡：仅 body 含 @AI/@REVIEW 时待回
          needsReply: threadNeedsAiReply(t, AI_AUTHOR)
        }));
      },
      /** 取单条 thread 详情（拷贝返回，不暴露内部引用） */
      getThread(threadId) {
        const t = State.annotations.find((x) => x.threadId === threadId);
        if (!t) return null;
        return {
          threadId: t.threadId,
          text: t.text,
          resolved: t.resolved,
          createdAt: t.createdAt,
          comments: t.comments.map((c) => ({ ...c }))
        };
      },
      /** 待回复的 thread 列表（needsReply=true） */
      getPending() {
        return this.listThreads().filter((t) => t.needsReply);
      },
      /** 当前文档信息 */
      getDocInfo() {
        return {
          fileName: State.currentFile ? State.currentFile.name : null,
          annotationCount: State.annotations.length,
          pendingCount: this.getPending().length,
          saveMode: State.saveMode,
          author: { id: State.authorId, name: State.author }
        };
      },
      // ==================== 订阅 ====================
      /** 订阅新评论事件 */
      onNewComment(cb) {
        if (typeof cb !== "function") throw new TypeError("cb must be a function");
        AIListeners.newComment.push(cb);
        return () => {
          const i = AIListeners.newComment.indexOf(cb);
          if (i >= 0) AIListeners.newComment.splice(i, 1);
        };
      },
      /** 订阅 thread 变更事件（create/reply/delete/resolved） */
      onThreadChange(cb) {
        if (typeof cb !== "function") throw new TypeError("cb must be a function");
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
        if (typeof threadId !== "string" || !threadId) {
          return { ok: false, error: "threadId \u5FC5\u987B\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32" };
        }
        if (typeof body !== "string") {
          return { ok: false, error: "body \u5FC5\u987B\u4E3A\u5B57\u7B26\u4E32" };
        }
        const trimmed = body.trim();
        if (!trimmed) {
          return { ok: false, error: "body \u4E0D\u80FD\u4E3A\u7A7A" };
        }
        if (trimmed.length > MAX_BODY) {
          return { ok: false, error: `body \u8D85\u8FC7\u6700\u5927\u957F\u5EA6 ${MAX_BODY}` };
        }
        while (_replyLock.has(threadId)) {
          await _replyLock.get(threadId);
        }
        let releaseLock;
        const lockPromise = new Promise((resolve) => {
          releaseLock = resolve;
        });
        _replyLock.set(threadId, lockPromise);
        const promise = (async () => {
          try {
            const thread = State.annotations.find((t) => t.threadId === threadId);
            if (!thread) {
              return { ok: false, error: `thread \u4E0D\u5B58\u5728: ${threadId}` };
            }
            if (thread.resolved) {
              return { ok: false, error: "thread \u5DF2 resolved\uFF0C\u65E0\u6CD5\u56DE\u590D\uFF08\u8BF7\u7528\u6237 reopen\uFF09" };
            }
            const lastComment = thread.comments?.[thread.comments.length - 1];
            if (lastComment && lastComment.body === trimmed) {
              const ms = Date.now() - new Date(lastComment.createdAt).getTime();
              if (ms < _DEDUP_WINDOW_MS) {
                return { ok: true, comment: lastComment, dedup: true };
              }
            }
            const author = opts.author && typeof opts.author === "string" && opts.author.trim() ? opts.author.trim() : AI_AUTHOR;
            const comment = {
              id: uuid(),
              author,
              body: trimmed,
              createdAt: nowISO()
            };
            try {
              thread.comments.push(comment);
              markDirty();
              renderCommentList();
              emitAI("newComment", { threadId, comment });
              emitAI("threadChange", { threadId, change: "reply", comment });
              return { ok: true, comment };
            } catch (e) {
              return { ok: false, error: "reply \u5931\u8D25: " + e.message };
            }
          } finally {
            releaseLock();
            queueMicrotask(() => _replyLock.delete(threadId));
          }
        })();
        return await promise;
      },
      // ==================== 元 ====================
      /** 获取协议元信息 */
      protocol() {
        return { ...this.__meta };
      },
      // v1.42.2 fix: 暴露 setAuthor 到 ai surface (原只在 __meta 里, 外部 AI scripts 无法改)
      // 协议设计: setAuthor 返回 true/false, 让脚本知道是否成功
      setAuthor(name) {
        return setAuthor(name);
      }
    };
  })(),
  // 调试用
  md,
  // 暴露 markdown-it 实例用于测试
  // 用于测试的 helpers
  createTestAnnotation(text2) {
    const editor2 = State.editor;
    const doc5 = editor2.state.doc;
    const found2 = findTextInDoc(doc5, text2);
    if (!found2) return null;
    createAnnotationThread(found2.from, found2.to, text2);
    return State.annotations[State.annotations.length - 1];
  },
  // 测试用: 用已知 from/to 创建批注 (绕开 findTextInDoc, 允许跨 node 选区)
  _testCreateAnnotation(from2, to, text2) {
    if (!from2 || !to || !text2) return null;
    const beforeLen = State.annotations.length;
    const beforeLastTid = State.annotations.length ? State.annotations[State.annotations.length - 1].threadId : null;
    createAnnotationThread(from2, to, text2);
    if (State.annotations.length === beforeLen) return null;
    return State.annotations[State.annotations.length - 1];
  },
  // 测试用: 直接 toggle resolved (跳过 UI)
  _testToggleResolved(threadId) {
    toggleResolved(threadId);
    return true;
  },
  // 测试用: 直接调全局 deleteThread (跳过 confirm dialog)
  _testDeleteThread(threadId) {
    const thread = State.annotations.find((t) => t.threadId === threadId);
    if (!thread) return;
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
  patchCommentCard: (a) => patchCommentCard(a),
  scheduleCommentListUi: (o) => scheduleCommentListUi(o),
  flushCommentListUi: () => flushCommentListUi(),
  // v1.43.47: 只切 active 卡，不整表重渲
  setActiveCommentCard: (tid) => setActiveCommentCard(tid),
  activateAnnotationThread: (tid, opts) => activateAnnotationThread(tid, opts),
  activateAndRevealThread: (tid, opts) => activateAndRevealThread(tid, opts),
  revealSupervisionThread: (tid) => revealSupervisionThread(tid),
  invokeAiForThread: (tid) => invokeAiForThread(tid),
  annotationWarningState: (thread) => annotationWarningState(thread),
  ensureCommentCardVisible: (tid) => ensureCommentCardVisible(tid),
  ensureFilterIncludesThread: (th) => ensureFilterIncludesThread(th),
  threadHiddenByFilter: (th) => threadHiddenByFilter(th),
  // highlightActiveMark exported as function ref above (DecorationSet path)
  // P-reload: 同步列出所有 IDB 缓存 (返回 Object 不返回 Promise, 方便 console.log 检查)
  listAnnotations() {
    const out = {};
    for (const name of Object.keys(State.idbCache || {})) {
      out[name] = ((State.idbCache[name] || {}).sidecar?.annotations || []).map((a) => a.threadId);
    }
    return out;
  },
  // 兼容老 setAuthor: string 设 name; object {id, name} 设完整身份
  // P-name: 空字符串视为清空 (与 promptAuthor saveHandler 一致), 让 authorId 派生接管
  setAuthor: (arg) => {
    if (typeof arg === "string") {
      if (arg.trim()) {
        State.author = arg;
        localStorage.setItem("Mentor:author", arg);
      } else {
        State.author = "";
        localStorage.removeItem("Mentor:author");
      }
    } else if (arg && typeof arg === "object") {
      if (arg.name !== void 0) {
        if (arg.name) {
          State.author = arg.name;
          localStorage.setItem("Mentor:author", arg.name);
        } else {
          State.author = "";
          localStorage.removeItem("Mentor:author");
        }
      }
      if (arg.id) {
        State.authorId = arg.id;
        localStorage.setItem("Mentor:authorId", arg.id);
      }
    }
    renderAuthorChip();
  }
};
window.__mdAnnotator__diagTab = () => ({
  hasDocChannel: _liveSync.channel !== null,
  docChannelPath: _liveSync.documentKey,
  instanceId: _instanceId,
  peerCount: _liveSync.role === "follower" ? 1 : 0,
  peers: _liveSync.lease.ownerId && _liveSync.lease.ownerId !== _instanceId ? [_liveSync.lease.ownerId] : [],
  live: getLiveSyncState()
});
window.__mdAnnotator__openDocChannel = _openDocChannel;
window.__mdAnnotator__closeDocChannel = _closeDocChannelFull;
window.__mdAnnotator__getDocPath = _getDocPath;
