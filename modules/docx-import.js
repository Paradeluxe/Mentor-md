/**
 * DOCX → Mentor import (OOXML comments → annotations).
 *
 * Pure parse path: JSZip + lightweight XML (no mammoth). Returns
 * { contentMd, annotations, mediaFiles, warnings }.
 *
 * Public:
 *   parseDocxToMentor(uint8ArrayOrArrayBuffer) -> Promise<result>
 *   parseDocumentXml(docXml) -> { contentMd, rangesByCommentId, plainText }
 *   parseCommentsParts({ commentsXml, commentsExtendedXml, ... }) -> threads draft
 */
import JSZip from 'jszip';

// ------------------------------------------------------------
// Minimal XML helpers (no DOMParser — works in Node unit tests)
// ------------------------------------------------------------
function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function parseAttrs(tagInner) {
  const attrs = {};
  const re = /([:\w.-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagInner)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function localName(tag) {
  const t = String(tag || '');
  const i = t.indexOf(':');
  return i >= 0 ? t.slice(i + 1) : t;
}

/** Very small stack parser → tree of { tag, attrs, children, text } */
export function parseXml(xml) {
  const root = { tag: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([:\w.-]+)>|<([:\w.-]+)([^>]*?)\s*\/>|<([:\w.-]+)([^>]*)>|([^<]+)/g;
  let m;
  const src = String(xml || '').replace(/^\uFEFF/, '');
  while ((m = re.exec(src)) !== null) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1] != null) {
      // CDATA
      stack[stack.length - 1].text += m[1];
      continue;
    }
    if (m[2] != null) {
      // close
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (m[3] != null) {
      // self-closing
      const node = { tag: m[3], attrs: parseAttrs(m[4] || ''), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      continue;
    }
    if (m[5] != null) {
      const node = { tag: m[5], attrs: parseAttrs(m[6] || ''), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }
    if (m[7] != null) {
      stack[stack.length - 1].text += decodeEntities(m[7]);
    }
  }
  return root;
}

function findChildren(node, name) {
  const want = localName(name);
  return (node.children || []).filter((c) => localName(c.tag) === want);
}

function findDescendants(node, name, out = []) {
  const want = localName(name);
  for (const c of node.children || []) {
    if (localName(c.tag) === want) out.push(c);
    findDescendants(c, name, out);
  }
  return out;
}

function textOf(node) {
  let t = node.text || '';
  for (const c of node.children || []) t += textOf(c);
  return t;
}

function attr(node, ...keys) {
  for (const k of keys) {
    if (node.attrs && node.attrs[k] != null) return node.attrs[k];
    // bare local name match
    const local = k.includes(':') ? k.split(':')[1] : k;
    for (const [ak, av] of Object.entries(node.attrs || {})) {
      if (localName(ak) === local) return av;
    }
  }
  return '';
}

// ------------------------------------------------------------
// uuid-ish (no crypto dependency for browser/node)
// ------------------------------------------------------------
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ------------------------------------------------------------
// document.xml → markdown + comment ranges
// ------------------------------------------------------------
function pStyleToMdPrefix(pPr) {
  if (!pPr) return { prefix: '', kind: 'p' };
  const styles = findDescendants(pPr, 'pStyle');
  const val = styles.length ? attr(styles[0], 'w:val', 'val') : '';
  const heading = /^Heading([1-6])$/i.exec(val || '');
  if (heading) return { prefix: '#'.repeat(Number(heading[1])) + ' ', kind: 'h' };
  if (/^Quote$/i.test(val || '') || /^BlockText$/i.test(val || '')) {
    return { prefix: '> ', kind: 'quote' };
  }
  // numbered / bullet via numPr
  const numPr = findDescendants(pPr, 'numPr');
  if (numPr.length) {
    const ilvl = findDescendants(numPr[0], 'ilvl');
    const lvl = ilvl.length ? Number(attr(ilvl[0], 'w:val', 'val') || 0) : 0;
    const indent = '  '.repeat(Math.max(0, lvl));
    // Treat as unordered by default (Word numbering abstract nums are external)
    return { prefix: `${indent}- `, kind: 'li' };
  }
  return { prefix: '', kind: 'p' };
}

function runToMd(run) {
  // skip field instruction text
  if (findDescendants(run, 'instrText').length) return '';
  const rPrList = findChildren(run, 'rPr');
  const rPr = rPrList[0] || null;
  let bold = false;
  let italic = false;
  let code = false;
  if (rPr) {
    bold = findDescendants(rPr, 'b').length > 0 || findDescendants(rPr, 'bCs').length > 0;
    italic = findDescendants(rPr, 'i').length > 0 || findDescendants(rPr, 'iCs').length > 0;
    const fonts = findDescendants(rPr, 'rFonts');
    if (fonts.length) {
      const ascii = attr(fonts[0], 'w:ascii', 'ascii') || '';
      if (/consolas|courier|mono/i.test(ascii)) code = true;
    }
  }
  let text = '';
  for (const c of run.children || []) {
    const n = localName(c.tag);
    if (n === 't') text += c.text || '';
    else if (n === 'tab') text += '\t';
    else if (n === 'br' || n === 'cr') text += '\n';
    else if (n === 'drawing') text += ''; // Task 4: images
    else text += textOf(c);
  }
  if (!text) return '';
  // Escape bare markdown markers lightly inside code only
  let out = text;
  if (code) out = '`' + out.replace(/`/g, '\\`') + '`';
  else {
    if (bold) out = '**' + out + '**';
    if (italic) out = '*' + out + '*';
  }
  return out;
}

/**
 * Walk document body; return markdown + map commentId → { start, end, quote }
 * offsets into the *plain* body text (markdown without markers would differ —
 * we track offsets against a parallel plainText built from w:t only).
 */
export function parseDocumentXml(docXml) {
  const tree = parseXml(docXml);
  const bodies = findDescendants(tree, 'body');
  const body = bodies[0] || tree;
  const mdParts = [];
  const plainParts = []; // plain text with same block structure (newlines)
  /** @type {Record<string, { start: number, end: number|null, quote: string }>} */
  const ranges = {};
  let plainPos = 0;
  const openStarts = []; // stack of comment ids opened

  function emitPlain(s) {
    plainParts.push(s);
    plainPos += s.length;
  }

  function walkInline(nodes, mdAcc) {
    for (const node of nodes || []) {
      const n = localName(node.tag);
      if (n === 'commentRangeStart') {
        const id = attr(node, 'w:id', 'id');
        ranges[id] = ranges[id] || { start: plainPos, end: null, quote: '' };
        ranges[id].start = plainPos;
        openStarts.push(id);
        continue;
      }
      if (n === 'commentRangeEnd') {
        const id = attr(node, 'w:id', 'id');
        if (ranges[id]) {
          ranges[id].end = plainPos;
          // quote from plain slice
          const plainAll = plainParts.join('');
          ranges[id].quote = plainAll.slice(ranges[id].start, ranges[id].end);
        }
        const idx = openStarts.lastIndexOf(id);
        if (idx >= 0) openStarts.splice(idx, 1);
        continue;
      }
      if (n === 'commentReference') continue;
      if (n === 'r') {
        // plain from w:t only
        let plain = '';
        for (const c of node.children || []) {
          const cn = localName(c.tag);
          if (cn === 't') plain += c.text || '';
          else if (cn === 'tab') plain += '\t';
          else if (cn === 'br' || cn === 'cr') plain += '\n';
        }
        emitPlain(plain);
        mdAcc.push(runToMd(node));
        continue;
      }
      if (n === 'hyperlink' || n === 'sdt' || n === 'sdtContent' || n === 'smartTag') {
        walkInline(node.children, mdAcc);
        continue;
      }
      // nested
      if (node.children && node.children.length) walkInline(node.children, mdAcc);
    }
  }

  function tableToMd(tbl) {
    const rows = [];
    for (const tr of findDescendants(tbl, 'tr')) {
      const cells = [];
      for (const tc of findChildren(tr, 'tc')) {
        // cell text = concat of p plain
        let cellPlain = '';
        let cellMd = '';
        for (const p of findChildren(tc, 'p')) {
          const mdAcc = [];
          const before = plainPos;
          walkInline(p.children, mdAcc);
          const chunk = mdAcc.join('');
          cellMd += (cellMd ? ' ' : '') + chunk;
          cellPlain += plainParts.join('').slice(before); // not ideal; use mdAcc plain
        }
        // rebuild cell plain simply from md without markers is ok for tables
        cells.push(cellMd.replace(/\|/g, '\\|').trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return '';
    const width = Math.max(...rows.map((r) => r.length));
    const norm = rows.map((r) => {
      const x = r.slice();
      while (x.length < width) x.push('');
      return x;
    });
    const header = norm[0];
    const sep = header.map(() => '---');
    const lines = [
      '| ' + header.join(' | ') + ' |',
      '| ' + sep.join(' | ') + ' |',
      ...norm.slice(1).map((r) => '| ' + r.join(' | ') + ' |'),
    ];
    return lines.join('\n');
  }

  for (const child of body.children || []) {
    const n = localName(child.tag);
    if (n === 'sectPr') continue;
    if (n === 'tbl') {
      const tmd = tableToMd(child);
      if (tmd) {
        if (mdParts.length) mdParts.push('');
        mdParts.push(tmd);
        emitPlain('\n');
      }
      continue;
    }
    if (n !== 'p') continue;
    const pPrList = findChildren(child, 'pPr');
    const { prefix, kind } = pStyleToMdPrefix(pPrList[0] || null);
    const mdAcc = [];
    walkInline(child.children, mdAcc);
    let line = mdAcc.join('');
    // trim end but keep internal spaces; headings strip trailing
    if (kind === 'h') line = line.trim();
    const mdLine = prefix + line;
    mdParts.push(mdLine);
    emitPlain('\n');
  }

  // close dangling ranges at EOF
  const plainText = plainParts.join('');
  for (const id of Object.keys(ranges)) {
    if (ranges[id].end == null) {
      ranges[id].end = plainText.length;
      ranges[id].quote = plainText.slice(ranges[id].start, ranges[id].end);
    }
  }

  // Join markdown with blank lines between non-list blocks
  const contentMd = normalizeMdBlocks(mdParts);
  return { contentMd, rangesByCommentId: ranges, plainText };
}

function normalizeMdBlocks(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    out.push(line);
    const next = parts[i + 1];
    if (next == null) continue;
    const curList = /^\s*([-*+] |\d+\. )/.test(line);
    const nextList = /^\s*([-*+] |\d+\. )/.test(next);
    const curTable = /^\|/.test(line);
    const nextTable = /^\|/.test(next);
    if ((curList && nextList) || (curTable && nextTable)) {
      // single newline already via join
      continue;
    }
    // blank line between blocks
    out.push('');
  }
  // join with \n and collapse 3+ blanks
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '') + (parts.length ? '\n' : '');
}

// ------------------------------------------------------------
// comments parts
// ------------------------------------------------------------
export function parseCommentsParts({
  commentsXml,
  commentsExtendedXml,
  commentsIdsXml,
  commentsExtensibleXml,
  peopleXml,
} = {}) {
  const comments = [];
  if (commentsXml) {
    const tree = parseXml(commentsXml);
    for (const c of findDescendants(tree, 'comment')) {
      const id = attr(c, 'w:id', 'id');
      const author = attr(c, 'w:author', 'author') || '';
      const initials = attr(c, 'w:initials', 'initials') || '';
      const date = attr(c, 'w:date', 'date') || '';
      // paraId on first p
      const ps = findChildren(c, 'p');
      const paraId = ps.length ? attr(ps[0], 'w14:paraId', 'paraId') : '';
      const text = findDescendants(c, 't').map((t) => t.text || '').join('') || textOf(c).trim();
      comments.push({ id, author, initials, date, text, paraId });
    }
  }

  const extended = [];
  if (commentsExtendedXml) {
    const tree = parseXml(commentsExtendedXml);
    for (const ex of findDescendants(tree, 'commentEx')) {
      extended.push({
        paraId: attr(ex, 'w15:paraId', 'paraId'),
        parentParaId: attr(ex, 'w15:paraIdParent', 'paraIdParent') || '',
        done: attr(ex, 'w15:done', 'done') === '1',
      });
    }
  }

  const ids = [];
  if (commentsIdsXml) {
    const tree = parseXml(commentsIdsXml);
    for (const x of findDescendants(tree, 'commentId')) {
      ids.push({
        paraId: attr(x, 'w16cid:paraId', 'paraId'),
        durableId: attr(x, 'w16cid:durableId', 'durableId'),
      });
    }
  }

  const people = [];
  if (peopleXml) {
    const tree = parseXml(peopleXml);
    for (const p of findDescendants(tree, 'person')) {
      const author = attr(p, 'w:author', 'author');
      const info = findDescendants(p, 'presenceInfo')[0];
      people.push({
        author,
        providerId: info ? attr(info, 'w15:providerId', 'providerId') : '',
        userId: info ? attr(info, 'w15:userId', 'userId') : '',
      });
    }
  }

  return { comments, extended, ids, people };
}

function authorPayload(name, people) {
  const n = String(name || '').trim() || '匿名';
  const hit = (people || []).find((p) => p.author === n || p.userId === n);
  return {
    id: (hit && hit.userId) || '',
    name: n,
  };
}

/**
 * Build Mentor annotation threads from parsed comments + ranges.
 * threadId is always fresh (no stable cross-format id).
 */
export function assembleMentorAnnotations({ comments, extended, people, rangesByCommentId, contentMd }) {
  const warnings = [];
  const byPara = new Map();
  for (const c of comments) {
    if (c.paraId) byPara.set(c.paraId, c);
  }
  const extByPara = new Map();
  for (const e of extended) extByPara.set(e.paraId, e);

  // roots = comments whose paraId has no parentParaId (or empty)
  const roots = [];
  const repliesByParentPara = new Map();
  for (const c of comments) {
    const ex = c.paraId ? extByPara.get(c.paraId) : null;
    const parent = ex && ex.parentParaId ? ex.parentParaId : '';
    if (!parent) roots.push(c);
    else {
      if (!repliesByParentPara.has(parent)) repliesByParentPara.set(parent, []);
      repliesByParentPara.get(parent).push(c);
    }
  }

  // Fallback: if no extended info, every comment is its own root keyed by id
  if (!extended.length && comments.length) {
    roots.length = 0;
    for (const c of comments) roots.push(c);
  }

  const annotations = [];
  for (const root of roots) {
    const range = rangesByCommentId[String(root.id)] || null;
    const quote = (range && range.quote) || '';
    // Prefer exact quote; if empty, leave text empty (rebind will fail softly)
    let text = quote;
    // mdRange via indexOf first occurrence of quote in contentMd
    let mdFrom = -1;
    let mdTo = -1;
    if (text && contentMd) {
      mdFrom = contentMd.indexOf(text);
      if (mdFrom >= 0) mdTo = mdFrom + text.length;
    }
    const prefix = mdFrom > 0 ? contentMd.slice(Math.max(0, mdFrom - 32), mdFrom) : '';
    const suffix = mdTo >= 0 ? contentMd.slice(mdTo, mdTo + 32) : '';

    const ex = root.paraId ? extByPara.get(root.paraId) : null;
    const resolved = !!(ex && ex.done);

    const commentEntries = [];
    commentEntries.push({
      id: uuid(),
      author: authorPayload(root.author, people),
      body: root.text || '',
      createdAt: root.date || new Date().toISOString(),
    });
    const replies = root.paraId ? (repliesByParentPara.get(root.paraId) || []) : [];
    for (const r of replies) {
      commentEntries.push({
        id: uuid(),
        author: authorPayload(r.author, people),
        body: r.text || '',
        createdAt: r.date || new Date().toISOString(),
      });
    }

    if (!range) {
      warnings.push(`comment id=${root.id} has no range in document.xml`);
    }

    const threadId = uuid();
    annotations.push({
      threadId,
      text,
      prefix,
      suffix,
      range: mdFrom >= 0 ? { from: mdFrom, to: mdTo } : { from: 0, to: 0 },
      mdRange: mdFrom >= 0 ? { from: mdFrom, to: mdTo } : null,
      resolved,
      pending: false,
      createdAt: root.date || new Date().toISOString(),
      comments: commentEntries,
      anchor: {
        version: '1',
        quote: { exact: text, prefix, suffix },
        position: null,
        status: mdFrom >= 0 ? 'attached' : 'orphan',
        confidence: mdFrom >= 0 ? 1 : 0,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return { annotations, warnings };
}

// ------------------------------------------------------------
// Top-level
// ------------------------------------------------------------
export async function parseDocxToMentor(input) {
  const warnings = [];
  const zip = await JSZip.loadAsync(input);
  const read = async (path) => {
    const f = zip.file(path);
    if (!f) return null;
    return f.async('string');
  };

  const docXml = await read('word/document.xml');
  if (!docXml) {
    throw new Error('DOCX missing word/document.xml');
  }

  const { contentMd, rangesByCommentId, plainText } = parseDocumentXml(docXml);

  const commentsXml = await read('word/comments.xml');
  const commentsExtendedXml = await read('word/commentsExtended.xml');
  const commentsIdsXml = await read('word/commentsIds.xml');
  const commentsExtensibleXml = await read('word/commentsExtensible.xml');
  const peopleXml = await read('word/people.xml');

  const parts = parseCommentsParts({
    commentsXml,
    commentsExtendedXml,
    commentsIdsXml,
    commentsExtensibleXml,
    peopleXml,
  });

  const { annotations, warnings: w2 } = assembleMentorAnnotations({
    comments: parts.comments,
    extended: parts.extended,
    people: parts.people,
    rangesByCommentId,
    contentMd,
  });
  warnings.push(...w2);

  // media: Task 4 fills this; for now empty object
  const mediaFiles = {};

  return {
    contentMd,
    annotations,
    mediaFiles,
    warnings,
    plainText,
    _debug: { rangesByCommentId, commentCount: parts.comments.length },
  };
}

export default { parseDocxToMentor, parseDocumentXml, parseCommentsParts, assembleMentorAnnotations, parseXml };
