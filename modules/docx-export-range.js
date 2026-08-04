/**
 * Character-level OOXML commentRange inject into document body XML.
 * Word-compatible: commentRangeStart/End wrap only the quoted plain text,
 * not the entire paragraph. No fuzzy second-candidate attach.
 *
 * Public:
 *   injectCommentRangeMarkers(bodyXml, commentsParts) -> string
 *   wrapQuoteInParagraph(pXml, commentId, quote) -> { xml, ok, reason? }
 */

function paraPlainText(pXml) {
  let t = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(pXml)) !== null) t += m[1];
  return t;
}

/**
 * Split a single paragraph so commentRangeStart/End wrap `quote` only.
 * Returns { xml, ok, reason }.
 */
export function wrapQuoteInParagraph(pXml, commentId, quote) {
  const q = String(quote || '');
  if (!q) {
    return { xml: pXml, ok: false, reason: 'empty-quote' };
  }
  const plain = paraPlainText(pXml);
  const from = plain.indexOf(q);
  if (from < 0) {
    return { xml: pXml, ok: false, reason: 'quote-not-in-para' };
  }
  // Ambiguous within paragraph: still first occurrence (Word first-hit); caller
  // should prefer unique paragraphs. Do not fuzzy-search other paras.
  const to = from + q.length;
  const id = String(commentId);

  const openEnd = pXml.indexOf('>');
  if (openEnd < 0) return { xml: pXml, ok: false, reason: 'bad-p' };
  const closeIdx = pXml.lastIndexOf('</w:p>');
  if (closeIdx < 0) return { xml: pXml, ok: false, reason: 'bad-p' };
  const openTag = pXml.slice(0, openEnd + 1);
  const inner = pXml.slice(openEnd + 1, closeIdx);
  const pPrMatch = inner.match(/^(\s*<w:pPr\b[\s\S]*?<\/w:pPr>)/);
  const pPr = pPrMatch ? pPrMatch[1] : '';
  const rest = pPrMatch ? inner.slice(pPrMatch[1].length) : inner;

  // Tokenize rest into runs and non-run chunks. We only rewrite w:t text nodes.
  // Strategy: walk all w:t with global plain offset; rebuild rest with splits.
  const tRe = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;
  const pieces = [];
  let last = 0;
  let m;
  let offset = 0;
  const hits = [];
  while ((m = tRe.exec(rest)) !== null) {
    if (m.index > last) {
      pieces.push({ type: 'raw', xml: rest.slice(last, m.index) });
    }
    const attrs = m[1] || '';
    const text = m[2];
    const start = offset;
    const end = offset + text.length;
    hits.push({ attrs, text, start, end, pieceIndex: pieces.length });
    pieces.push({ type: 't', attrs, text, start, end });
    offset = end;
    last = m.index + m[0].length;
  }
  if (last < rest.length) pieces.push({ type: 'raw', xml: rest.slice(last) });

  if (offset < to) {
    return { xml: pXml, ok: false, reason: 'offset-short' };
  }

  function tTag(attrs, text) {
    // Preserve xml:space when leading/trailing space or empty
    let a = attrs || '';
    if ((/^\s|\s$/.test(text) || text === '') && !/xml:space=/.test(a)) {
      a = (a ? a + ' ' : ' ') + 'xml:space="preserve"';
      if (!a.startsWith(' ') && a.length) a = ' ' + a.trim();
      a = a.replace(/^\s*/, ' ').replace(/\s+$/, '');
      if (!a.startsWith(' ')) a = ' ' + a.trim();
    }
    // normalize attrs string
    if (a && !a.startsWith(' ')) a = ' ' + a.trim();
    return `<w:t${a}>${text}</w:t>`;
  }

  // Build new inner: emit pieces, splitting the t that contains from/to.
  let out = '';
  let insertedStart = false;
  let insertedEnd = false;
  const startMarker = `<w:commentRangeStart w:id="${id}"/>`;
  const endMarker = `<w:commentRangeEnd w:id="${id}"/>`;
  const refRun =
    `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>` +
    `<w:commentReference w:id="${id}"/></w:r>`;

  for (const piece of pieces) {
    if (piece.type === 'raw') {
      out += piece.xml;
      continue;
    }
    // type t
    const { attrs, text, start, end } = piece;
    // Cases relative to [from, to)
    if (end <= from || start >= to) {
      // entirely outside
      if (!insertedStart && start >= from && from === end) {
        // edge: empty — shouldn't happen
      }
      if (!insertedStart && start === from) {
        out += startMarker;
        insertedStart = true;
      }
      out += `<w:r>${tTag(attrs, text)}</w:r>`;
      // Wait — original may already be inside a w:r. Our pieces lost run wrappers.
      // Safer approach: replace only w:t in place without inventing runs.
      // Revert strategy below.
    }
  }

  // ---- Re-do with in-place w:t rewrite (preserve surrounding run XML) ----
  // Rebuild from original `rest` by walking w:t matches with string builder.
  out = '';
  last = 0;
  offset = 0;
  insertedStart = false;
  insertedEnd = false;
  tRe.lastIndex = 0;
  const rest2 = rest;
  const re2 = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;
  while ((m = re2.exec(rest2)) !== null) {
    out += rest2.slice(last, m.index);
    const attrs = m[1] || '';
    const text = m[2];
    const start = offset;
    const end = offset + text.length;
    last = m.index + m[0].length;

    // Outside entirely
    if (end <= from || start >= to) {
      if (!insertedStart && start === from) {
        out += startMarker + m[0];
        insertedStart = true;
      } else if (!insertedEnd && start === to) {
        out += endMarker + m[0];
        insertedEnd = true;
      } else {
        out += m[0];
      }
      offset = end;
      continue;
    }

    // Overlaps [from, to)
    const localFrom = Math.max(0, from - start);
    const localTo = Math.min(text.length, to - start);
    const before = text.slice(0, localFrom);
    const mid = text.slice(localFrom, localTo);
    const after = text.slice(localTo);

    if (before) {
      out += tTag(attrs, before);
    }
    if (!insertedStart && localFrom >= 0 && from >= start && from < end) {
      out += startMarker;
      insertedStart = true;
    }
    if (mid) {
      out += tTag(attrs, mid);
    }
    if (!insertedEnd && to > start && to <= end) {
      out += endMarker;
      insertedEnd = true;
    }
    if (after) {
      out += tTag(attrs, after);
    }
    offset = end;
  }
  out += rest2.slice(last);

  if (!insertedStart || !insertedEnd) {
    return { xml: pXml, ok: false, reason: 'markers-not-inserted' };
  }

  // Insert commentReference after end marker (still inside p, after end)
  // Prefer right after commentRangeEnd
  const endTok = `<w:commentRangeEnd w:id="${id}"/>`;
  const ei = out.indexOf(endTok);
  if (ei >= 0) {
    out = out.slice(0, ei + endTok.length) + refRun + out.slice(ei + endTok.length);
  } else {
    out += refRun;
  }

  const xml = openTag + pPr + out + '</w:p>';
  // Verify plain between markers
  const between = xml.split(startMarker)[1];
  const midXml = between ? between.split(endTok)[0] : '';
  const midPlain = (midXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [])
    .map((tag) => {
      const mm = tag.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/);
      return mm ? mm[1] : '';
    })
    .join('');
  if (midPlain !== q) {
    return { xml: pXml, ok: false, reason: 'verify-mismatch:' + midPlain };
  }
  return { xml, ok: true };
}

/**
 * @param {string} bodyXml
 * @param {{ commentEntries?: Array<{isRoot?:boolean, commentId:any, quoteText?:string}> }} commentsParts
 * @returns {string}
 */
export function injectCommentRangeMarkers(bodyXml, commentsParts) {
  if (!commentsParts || !Array.isArray(commentsParts.commentEntries)) return bodyXml;
  const roots = commentsParts.commentEntries.filter((e) => e && e.isRoot);
  if (!roots.length) return bodyXml;

  const parts = [];
  const reP = /<w:p\b[\s\S]*?<\/w:p>/g;
  let last = 0;
  let m;
  const src = String(bodyXml || '');
  while ((m = reP.exec(src)) !== null) {
    if (m.index > last) parts.push({ type: 'raw', xml: src.slice(last, m.index) });
    parts.push({ type: 'p', xml: m[0], used: false });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ type: 'raw', xml: src.slice(last) });

  const warnings = [];
  for (const entry of roots) {
    const quote = String(entry.quoteText || '').trim();
    if (!quote) {
      warnings.push({ commentId: entry.commentId, reason: 'empty-quote' });
      continue;
    }
    let placed = false;
    // Prefer unique plain match among unused paragraphs
    const candidates = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'p' || parts[i].used) continue;
      const plain = paraPlainText(parts[i].xml);
      if (plain.includes(quote)) candidates.push(i);
    }
    if (!candidates.length) {
      warnings.push({ commentId: entry.commentId, reason: 'quote-not-found', quote });
      continue;
    }
    // If multiple paras contain quote, pick first unused — fail-loud via warning when ambiguous
    if (candidates.length > 1) {
      warnings.push({
        commentId: entry.commentId,
        reason: 'ambiguous-paragraph',
        quote,
        count: candidates.length,
      });
    }
    const idx = candidates[0];
    const wrapped = wrapQuoteInParagraph(parts[idx].xml, entry.commentId, quote);
    if (!wrapped.ok) {
      warnings.push({ commentId: entry.commentId, reason: wrapped.reason, quote });
      continue;
    }
    parts[idx] = { type: 'p', xml: wrapped.xml, used: true };
    placed = true;
    void placed;
  }

  if (warnings.length && typeof console !== 'undefined' && console.warn) {
    console.warn('[docx-export-range] inject warnings', warnings);
  }

  return parts.map((p) => p.xml).join('');
}

export { paraPlainText };
