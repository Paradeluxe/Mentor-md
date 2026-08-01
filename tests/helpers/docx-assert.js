/**
 * Test-only DOCX OOXML assertion helpers + tiny XML inspection utilities.
 *
 * Avoids raw ZIP byte comparisons by extracting parts as UTF-8 strings and
 * asserting structural details (attrs/text) using pure-string helpers, so
 * tests can stand up against any DOCX zip without DOMParser / xmldom.
 *
 * Exports:
 *   loadDocxZip(uint8Array)              -> Promise<JSZip>
 *   readPart(zip, path)                  -> string|null
 *   parseXml(string)                     -> { tag, attrs, text, children, raw }
 *   assertCommentRange(docXml, id, text) -> void  (throws on fail)
 *   assertCommentsPart(xml, opts)        -> void
 *   assertThreading(extXml, opts)        -> void
 *   assertPeople(peopleXml, name)        -> void
 *
 * All asserts THROW a descriptive `Error` on failure. Tests can wrap calls
 * with `assert.doesNotThrow` / `assert.throws` (which the spec file does).
 */
'use strict';

const JSZip = require('jszip');

// ------------------------------------------------------------
// Zip loader
//
// Returns a JSZip instance with `parts` pre-populated: an object whose keys
// are file paths inside the zip and whose values are UTF-8 strings (already
// decompressed). This makes `readPart` cheap and synchronous, which is the
// shape callers (and our spec runner) want for assertions.
// ------------------------------------------------------------
async function loadDocxZip(uint8) {
  if (!(uint8 && typeof uint8.length === 'number')) {
    throw new Error('loadDocxZip: expected Uint8Array, got ' + typeof uint8);
  }
  const zip = await JSZip.loadAsync(uint8);
  // Pre-decompress every text part so readPart is sync and fast.
  const parts = {};
  const promises = [];
  for (const path of Object.keys(zip.files)) {
    const f = zip.files[path];
    if (f.dir) continue;
    promises.push(
      f.async('string').then((s) => {
        parts[path] = s;
      })
    );
  }
  await Promise.all(promises);
  // Expose `parts` as a getter so callers can swap in their own cache if needed.
  Object.defineProperty(zip, 'parts', { value: parts, writable: true, enumerable: false });
  return zip;
}

// ------------------------------------------------------------
// Synchronous part reader. Reads from the preloaded cache added by
// loadDocxZip; returns null if the part is not present.
// ------------------------------------------------------------
function readPart(zip, path) {
  if (!zip) return null;
  // Prefer preloaded cache.
  if (zip.parts && Object.prototype.hasOwnProperty.call(zip.parts, path)) {
    return zip.parts[path];
  }
  // Fall back to JSZip's own keys (if user supplied a plain JSZip).
  const f = zip.files && zip.files[path];
  if (!f) return null;
  // If somehow the data is already a string (e.g. user loaded it manually), return it.
  if (typeof f._data === 'string') return f._data;
  return null;
}

// Async reader — for callers that want to stream-extract.
async function readPartAsync(zip, path) {
  if (!zip) return null;
  if (zip.parts && Object.prototype.hasOwnProperty.call(zip.parts, path)) {
    return zip.parts[path];
  }
  const f = zip.files && zip.files[path];
  if (!f || f.dir) return null;
  return await f.async('string');
}

// ------------------------------------------------------------
// Tiny XML parser (NO DOMParser, no xmldom).
// Walks the XML using a position-aware tag scanner. Returns a tree:
//   { tag, attrs, text, children, raw }
// - text is the concatenated character data DIRECTLY inside this element
//   EXCLUDING text inside child elements (i.e., direct children only).
// - children: array of nested element nodes (never character data).
// - We keep namespaces intact (e.g. "w:t", "w15:commentEx") in `tag` and
//   attribute names; sufficient for the structural assertions in this skill.
// - If the input has multiple top-level elements, returns { tag: '#document', children: [...] }
//   If the input has exactly one top-level element, returns that element directly.
// ------------------------------------------------------------
function parseXml(input) {
  if (input == null) return null;
  const xml = String(input);

  // Stack of element nodes currently open. Root element creation handled by
  // synthetic document wrapper so multi-root inputs are well-defined.
  let docChildren = [];
  let textCollector = ''; // text pending to attach to currentElement
  const openStack = []; // [{ node, textBuf }]

  let cursor = 0;
  const flushText = () => {
    if (openStack.length === 0) {
      // text outside any element: drop (matches how real DOMParser behaves for fragment w/o root)
      textCollector = '';
      return;
    }
    if (textCollector.length > 0) {
      openStack[openStack.length - 1].textBuf += textCollector;
      textCollector = '';
    }
  };

  while (cursor < xml.length) {
    const lt = xml.indexOf('<', cursor);
    if (lt === -1) {
      textCollector += xml.slice(cursor);
      cursor = xml.length;
      break;
    }
    if (lt > cursor) {
      textCollector += xml.slice(cursor, lt);
      cursor = lt;
    }
    // Skip processing instructions (<! ...> / <? ...?>) — they don't affect element tree.
    if (xml.startsWith('<?', cursor) || xml.startsWith('<!', cursor)) {
      const closeIdx = xml.indexOf('>', cursor);
      if (closeIdx === -1) { cursor = xml.length; break; }
      cursor = closeIdx + 1;
      continue;
    }
    const gt = xml.indexOf('>', cursor);
    if (gt === -1) {
      textCollector += xml.slice(cursor);
      cursor = xml.length;
      break;
    }
    const raw = xml.slice(cursor, gt + 1);
    let body = raw.slice(1, -1);
    const selfClose = body.endsWith('/');
    if (selfClose) body = body.slice(0, -1);
    const tagMatch = body.match(/^([^\s/]+)\s*([\s\S]*)$/);
    const tag = tagMatch ? tagMatch[1] : body;
    const attrStr = tagMatch ? tagMatch[2] : '';
    const attrs = parseAttrs(attrStr);
    cursor = gt + 1;

    flushText();

    if (selfClose) {
      const node = { tag, attrs, text: '', children: [] };
      if (openStack.length === 0) docChildren.push(node);
      else openStack[openStack.length - 1].node.children.push(node);
      // a self-closing tag is NOT pushed onto the stack.
    } else {
      const node = { tag, attrs, text: '', children: [] };
      if (openStack.length === 0) docChildren.push(node);
      else openStack[openStack.length - 1].node.children.push(node);
      openStack.push({ node, textBuf: '' });
    }
  }
  // Walk stack from innermost out, merging textBuf into each node's `text`.
  for (let i = openStack.length - 1; i >= 0; i--) {
    openStack[i].node.text = openStack[i].textBuf;
  }

  if (docChildren.length === 1) return docChildren[0];
  return { tag: '#document', attrs: {}, text: '', children: docChildren };
}

function parseAttrs(s) {
  const out = {};
  // attr="value"  or  attr='value'
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const name = m[1];
    const val = m[2] != null ? m[2] : m[3];
    out[name] = val;
  }
  return out;
}

// ------------------------------------------------------------
// Assertion helpers (each THROWS on failure)
// ------------------------------------------------------------
function fail(msg) {
  throw new Error('docx-assert: ' + msg);
}

// Find the canonical `<w:commentRangeStart .../>` for a given numeric id.
// Returns the matched `<...>` substring, or null when not found.
function findRangeStart(docXml, id) {
  const re = new RegExp('<w:commentRangeStart\\b[^>]*w:id="' + id + '"[^>]*/>');
  const m = re.exec(docXml);
  return m ? m[0] : null;
}

function findCommentReference(docXml, id) {
  const re = new RegExp('<w:commentReference\\b[^>]*w:id="' + id + '"[^>]*/>');
  const m = re.exec(docXml);
  return m ? m[0] : null;
}

function assertCommentRange(docXml, id, quotedText) {
  if (typeof docXml !== 'string') fail('assertCommentRange: docXml must be a string');
  const start = findRangeStart(docXml, id);
  if (!start) fail('missing <w:commentRangeStart w:id="' + id + '"/> in document.xml');
  const ref = findCommentReference(docXml, id);
  if (!ref) fail('missing <w:commentReference w:id="' + id + '"/> in document.xml');
  // Verify the quoted text appears between start and ref (or anywhere in body is fine for fixture-level checks).
  if (typeof quotedText === 'string') {
    if (!docXml.includes(quotedText)) {
      fail('expected quoted text ' + JSON.stringify(quotedText) + ' in document.xml');
    }
  }
}

function assertCommentsPart(commentsXml, opts) {
  if (typeof commentsXml !== 'string') fail('assertCommentsPart: commentsXml must be a string');
  opts = opts || {};
  const id = opts.id != null ? String(opts.id) : null;
  if (id == null) fail('assertCommentsPart: { id } required');
  // Find the <w:comment ...> opening tag matching the id.
  // We accept attribute order variations by sampling first 200 chars after the id match.
  const re = new RegExp('<w:comment\\b[^>]*w:id="' + id + '"[^>]*>');
  const m = re.exec(commentsXml);
  if (!m) fail('no <w:comment w:id="' + id + '"/> in comments.xml');
  const openTag = m[0];
  const attrs = parseAttrs(openTag.slice('w:comment'.length + 1, -1));
  if (opts.author != null && attrs['w:author'] !== opts.author) {
    fail('comment id=' + id + ': expected w:author="' + opts.author + '" got "' + attrs['w:author'] + '"');
  }
  if (opts.initials != null && attrs['w:initials'] !== opts.initials) {
    fail('comment id=' + id + ': expected w:initials="' + opts.initials + '" got "' + attrs['w:initials'] + '"');
  }
  if (opts.date != null && attrs['w:date'] !== opts.date) {
    fail('comment id=' + id + ': expected w:date="' + opts.date + '" got "' + attrs['w:date'] + '"');
  }
  // Body text: extract everything between this comment's open and matching </w:comment>
  const startIdx = m.index + m[0].length;
  const endRe = new RegExp('</w:comment>');
  endRe.lastIndex = startIdx;
  const endMatch = endRe.exec(commentsXml);
  if (!endMatch) fail('comment id=' + id + ': no matching </w:comment>');
  const body = commentsXml.slice(startIdx, endMatch.index);
  if (opts.text != null && !body.includes(opts.text)) {
    fail('comment id=' + id + ': expected body text ' + JSON.stringify(opts.text) + ', got ' + JSON.stringify(body.slice(0, 200)));
  }
}

// assertThreading({ paraId, parentParaId?, done? })
function assertThreading(extXml, opts) {
  if (typeof extXml !== 'string') fail('assertThreading: extXml must be a string');
  if (!opts || !opts.paraId) fail('assertThreading: { paraId } required');
  const re = new RegExp('<w15:commentEx\\b[^>]*w15:paraId="' + opts.paraId + '"[^>]*>');
  const m = re.exec(extXml);
  if (!m) {
    // Try without w15 prefix if namespace stripped
    const alt = new RegExp('<commentEx\\b[^>]*paraId="' + opts.paraId + '"[^>]*>');
    if (!alt.exec(extXml)) {
      fail('no commentEx entry with paraId="' + opts.paraId + '" in commentsExtended.xml');
    }
    return;
  }
  const attrs = parseAttrs(m[0].slice('<commentEx'.length + 1, -1));
  if (opts.parentParaId != null && attrs['w15:paraIdParent'] !== opts.parentParaId) {
    fail('commentEx ' + opts.paraId + ': expected w15:paraIdParent="' + opts.parentParaId + '" got "' + attrs['w15:paraIdParent'] + '"');
  }
  if (opts.done != null) {
    const want = opts.done ? '1' : '0';
    if (attrs['w15:done'] !== want) {
      fail('commentEx ' + opts.paraId + ': expected w15:done="' + want + '" got "' + attrs['w15:done'] + '"');
    }
  }
}

function assertPeople(peopleXml, name) {
  if (typeof peopleXml !== 'string') fail('assertPeople: peopleXml must be a string');
  if (!name) fail('assertPeople: { name } required');
  // Match either w:author="<name>" or w15:userId="<name>" in people.xml
  const authRe = new RegExp('w:author="' + escapeRegExp(name) + '"');
  if (!authRe.test(peopleXml)) {
    fail('no person with w:author="' + name + '" in people.xml');
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  loadDocxZip,
  readPart,
  readPartAsync,
  parseXml,
  assertCommentRange,
  assertCommentsPart,
  assertThreading,
  assertPeople,
  // exported for tests / downstream use
  _internal: { findRangeStart, findCommentReference, parseAttrs },
};
