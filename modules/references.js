function cleanBibValue(value) {
  return String(value || "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readBalancedValue(body, start) {
  const opener = body[start];
  if (opener === "{") {
    let depth = 1;
    let i = start + 1;
    let out = "";
    for (; i < body.length && depth > 0; i++) {
      const ch = body[i];
      if (ch === "{") {
        depth += 1;
        out += ch;
      } else if (ch === "}") {
        depth -= 1;
        if (depth > 0) out += ch;
      } else {
        out += ch;
      }
    }
    return { value: out, end: i };
  }
  if (opener === '"') {
    let i = start + 1;
    let out = "";
    for (; i < body.length; i++) {
      const ch = body[i];
      if (ch === '"' && body[i - 1] !== "\\") return { value: out, end: i + 1 };
      out += ch;
    }
    return { value: out, end: i };
  }
  let i = start;
  while (i < body.length && body[i] !== "," && body[i] !== "\n") i += 1;
  return { value: body.slice(start, i), end: i };
}

function splitBibEntries(text) {
  const source = String(text || "");
  const rows = [];
  let i = 0;
  while (i < source.length) {
    const at = source.indexOf("@", i);
    if (at < 0) break;
    const head = source.slice(at).match(/^@(\w+)\s*([({])/);
    if (!head) {
      i = at + 1;
      continue;
    }
    const type = head[1].toLowerCase();
    const opener = head[2];
    const closer = opener === "{" ? "}" : ")";
    const bodyStart = at + head[0].length;
    let depth = 1;
    let quote = false;
    let j = bodyStart;
    for (; j < source.length && depth > 0; j++) {
      const ch = source[j];
      if (ch === '"' && source[j - 1] !== "\\") quote = !quote;
      if (quote) continue;
      if (ch === opener) depth += 1;
      else if (ch === closer) depth -= 1;
    }
    const body = source.slice(bodyStart, Math.max(bodyStart, j - 1));
    rows.push({ type, body, raw: source.slice(at, j) });
    i = Math.max(j, at + 1);
  }
  return rows;
}

export function parseBibTeX(text) {
  const entries = [];
  for (const block of splitBibEntries(text)) {
    const comma = block.body.indexOf(",");
    if (comma < 0) continue;
    const key = block.body.slice(0, comma).trim();
    if (!key) continue;
    const fields = {};
    const body = block.body.slice(comma + 1);
    let i = 0;
    while (i < body.length) {
      while (i < body.length && /[\s,]/.test(body[i])) i += 1;
      const nameMatch = body.slice(i).match(/^([A-Za-z][\w-]*)\s*=\s*/);
      if (!nameMatch) break;
      const name = nameMatch[1].toLowerCase();
      i += nameMatch[0].length;
      const parsed = readBalancedValue(body, i);
      fields[name] = cleanBibValue(parsed.value);
      i = parsed.end;
    }
    entries.push({
      key,
      type: block.type,
      authors: cleanBibValue(fields.author).split(/\s+and\s+/i).filter(Boolean).join("; "),
      year: fields.year || "",
      title: fields.title || "",
      journal: fields.journal || fields.booktitle || fields.publisher || "",
      doi: fields.doi || "",
      raw: block.raw
    });
  }
  return entries;
}

export function makeCitekey(firstAuthor, year, title) {
  let name = String(firstAuthor || "").split(",")[0].split(/\s+/).filter(Boolean).pop() || "anon";
  name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "anon";
  const yearMatch = String(year || "").match(/\d{4}/);
  const word = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).find(x => x.length > 2) || "item";
  return `${name}${yearMatch ? yearMatch[0] : ""}${word}`;
}

export function parseRIS(text) {
  const entries = [];
  let cur = null;
  let lastField = null;
  const flush = () => {
    if (!cur) return;
    const authors = cur.AU || cur.A1 || [];
    const title = (cur.TI || cur.T1 || [""])[0];
    const journal = (cur.JO || cur.JF || cur.JA || cur.T2 || [""])[0];
    const year = (cur.PY || cur.Y1 || [""])[0];
    const doi = (cur.DO || [""])[0];
    entries.push({
      key: makeCitekey(authors[0] || "anon", year, title),
      type: (cur.TY || ["misc"])[0],
      authors: authors.join("; "),
      year,
      title,
      journal,
      doi,
      raw: ""
    });
    cur = null;
    lastField = null;
  };
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9]{2})\s+-\s*(.*)$/);
    if (match) {
      const field = match[1];
      if (field === "TY") {
        flush();
        cur = {};
      }
      cur = cur || {};
      if (field === "ER") {
        flush();
      } else {
        cur[field] = (cur[field] || []).concat(match[2]);
        lastField = field;
      }
    } else if (cur && lastField && /^\s+/.test(line) && cur[lastField]?.length) {
      cur[lastField][cur[lastField].length - 1] += ` ${line.trim()}`;
    }
  }
  flush();
  return entries;
}

export function parseCSLJSON(text) {
  let data;
  try {
    data = JSON.parse(String(text || ""));
  } catch {
    return [];
  }
  const rows = Array.isArray(data) ? data : [data];
  return rows.filter(Boolean).map((item, index) => ({
    key: String(item.id || item.citationKey || `entry${index + 1}`),
    type: item.type || "misc",
    authors: (item.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ")).join("; "),
    year: item.issued?.["date-parts"]?.[0]?.[0] || "",
    title: item.title || "",
    journal: item["container-title"] || item.publisher || "",
    doi: item.DOI || item.doi || "",
    raw: ""
  }));
}

export function parseEndNoteTagged(text) {
  const entries = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const authors = cur.A || [];
    const title = (cur.T || [""])[0];
    const year = (cur.D || [""])[0];
    entries.push({
      key: makeCitekey(authors[0] || "anon", year, title),
      type: (cur["0"] || ["misc"])[0],
      authors: authors.join("; "),
      year,
      title,
      journal: (cur.J || cur.B || [""])[0],
      doi: (cur.R || [""])[0],
      raw: ""
    });
    cur = null;
  };
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^%([0A-Z])\s+(.*)$/);
    if (!match) continue;
    if (match[1] === "0") {
      flush();
      cur = {};
    }
    cur = cur || {};
    cur[match[1]] = (cur[match[1]] || []).concat(match[2].trim());
  }
  flush();
  return entries;
}

function xmlText(node, selector) {
  return node.querySelector(selector)?.textContent?.trim() || "";
}

export function parseEndNoteXML(text) {
  if (typeof DOMParser === "undefined") {
    const rows = [];
    const recordMatches = String(text || "").match(/<record\b[\s\S]*?<\/record>/gi) || [];
    const read = (record, tag) => {
      const match = record.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
    };
    for (const record of recordMatches) {
      const authorsBlock = record.match(/<authors[^>]*>([\s\S]*?)<\/authors>/i)?.[1] || "";
      const authors = [...authorsBlock.matchAll(/<author[^>]*>([\s\S]*?)<\/author>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
      const title = read(record, "title");
      const year = read(record, "year");
      rows.push({
        key: makeCitekey(authors[0] || "anon", year, title),
        type: read(record, "ref-type") || "misc",
        authors: authors.join("; "),
        year,
        title,
        journal: read(record, "secondary-title"),
        doi: read(record, "electronic-resource-num"),
        raw: record
      });
    }
    return rows;
  }
  const doc = new DOMParser().parseFromString(String(text || ""), "application/xml");
  if (doc.querySelector("parsererror")) return [];
  return [...doc.querySelectorAll("record")].map((record) => {
    const authors = [...record.querySelectorAll("contributors authors author")].map(node => node.textContent.trim()).filter(Boolean);
    const title = xmlText(record, "titles title");
    const year = xmlText(record, "dates year");
    return {
      key: makeCitekey(authors[0] || "anon", year, title),
      type: xmlText(record, "ref-type") || "misc",
      authors: authors.join("; "),
      year,
      title,
      journal: xmlText(record, "titles secondary-title"),
      doi: xmlText(record, "electronic-resource-num"),
      raw: record.outerHTML || ""
    };
  });
}

export function detectReferenceFormat(filename, text) {
  const name = String(filename || "");
  const source = String(text || "");
  if (/\.bib$/i.test(name)) return "bibtex";
  if (/\.(ris)$/i.test(name)) return "ris";
  if (/\.enw$/i.test(name)) return "endnote-tagged";
  if (/\.xml$/i.test(name) && /<records?[\s>]/i.test(source)) return "endnote-xml";
  if (/\.json$/i.test(name)) return "csl-json";
  if (/^\s*@\w+\s*[({]/.test(source)) return "bibtex";
  if (/^TY\s+-/m.test(source)) return "ris";
  if (/^%0\s+/m.test(source)) return "endnote-tagged";
  if (/^\s*<\?xml|<records?[\s>]/i.test(source)) return "endnote-xml";
  if (/^\s*[\[{]/.test(source)) return "csl-json";
  return "unknown";
}

export function parseReferenceFile(filename, text) {
  const format = detectReferenceFormat(filename, text);
  if (format === "bibtex") return parseBibTeX(text);
  if (format === "ris") return parseRIS(text);
  if (format === "endnote-tagged") return parseEndNoteTagged(text);
  if (format === "endnote-xml") return parseEndNoteXML(text);
  if (format === "csl-json") return parseCSLJSON(text);
  return [];
}

export function sortReferenceEntries(entries) {
  return [...(entries || [])].sort((a, b) => String(a.key || "").localeCompare(String(b.key || ""), undefined, { sensitivity: "base" }));
}

export function filterReferenceEntries(entries, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...(entries || [])];
  return (entries || []).filter(entry => [entry.key, entry.authors, entry.title, entry.journal, entry.year, entry.doi]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q));
}

// ============================================================================
// Task 1: Pandoc-style citation syntax parsing, serialization, and label format
// ============================================================================

/**
 * Parse a Pandoc-style citation bracket, e.g. `[-@alpha2020first, p. 3; @zeta2024last]`.
 * Returns `{ raw, items: [{ key, suppressAuthor, suffix }] }`. Items that fail to
 * parse are dropped silently (the caller's brace handling will fall back to raw text).
 */
export function parseCitationSyntax(raw) {
  const source = String(raw || "").trim();
  const empty = { raw: source, items: [] };
  if (!source.startsWith("[") || !source.endsWith("]") || source.length < 2) return empty;
  const inner = source.slice(1, -1);
  const parts = inner.split(/\s*;\s*/);
  const items = [];
  for (const part of parts) {
    const match = part.match(/^(-)?@([\w:.\/-]+)(?:,\s*(.*))?$/);
    if (!match) return empty;
    items.push({
      key: match[2],
      suppressAuthor: Boolean(match[1]),
      suffix: String(match[3] || "").trim(),
    });
  }
  if (!items.length) return empty;
  return { raw: source, items };
}

/**
 * Serialize a citation AST back into canonical Pandoc syntax.
 */
export function serializeCitationSyntax(citation) {
  const items = (citation && citation.items) || [];
  if (!items.length) {
    const raw = citation && citation.raw ? String(citation.raw) : "[]";
    return raw;
  }
  const body = items.map(item => {
    const suppress = item.suppressAuthor ? "-" : "";
    const suffix = item.suffix ? `, ${item.suffix}` : "";
    return `${suppress}@${item.key}${suffix}`;
  }).join("; ");
  return `[${body}]`;
}

function splitAuthors(authors) {
  return String(authors || "")
    .split(/[;]|\s+and\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function authorSurname(author) {
  // BibTeX "Family, Given" — take the part before the first comma.
  const comma = author.indexOf(",");
  const head = comma >= 0 ? author.slice(0, comma) : author;
  // Otherwise fall back to the last whitespace-delimited token.
  const tokens = head.split(/\s+/).filter(Boolean);
  return tokens.length ? tokens[tokens.length - 1] : author;
}

function formatSingleItem(item, entry) {
  const year = entry && entry.year ? entry.year : "";
  if (item.suppressAuthor) {
    return year ? (item.suffix ? `${year}, ${item.suffix}` : `${year}`) : (item.suffix || "");
  }
  const list = splitAuthors(entry && entry.authors);
  let authorPart = "";
  if (list.length === 0) {
    authorPart = "";
  } else if (list.length === 1) {
    authorPart = authorSurname(list[0]);
  } else if (list.length === 2) {
    authorPart = `${authorSurname(list[0])} & ${authorSurname(list[1])}`;
  } else {
    authorPart = `${authorSurname(list[0])} et al.`;
  }
  const pieces = [];
  if (authorPart) pieces.push(authorPart);
  if (year) pieces.push(year);
  let head = pieces.join(", ");
  if (item.suffix) head = head ? `${head}, ${item.suffix}` : item.suffix;
  return head;
}

/**
 * Render an author-year display label from a parsed citation AST and an entry map.
 * Returns `{ text, missingKeys }`. If every key in the citation is missing from the
 * map, the label falls back to a visible "missing" marker so the body node never
 * silently loses a reference.
 */
export function formatCitationLabel(parsed, entryMap) {
  const items = (parsed && parsed.items) || [];
  if (!items.length) {
    const raw = parsed && parsed.raw ? String(parsed.raw) : "[]";
    return { text: raw, missingKeys: [] };
  }
  const map = entryMap instanceof Map ? entryMap : new Map((entryMap || []).map(e => [e && e.key, e]));
  const present = [];
  const missing = [];
  for (const item of items) {
    const entry = map.get(item.key);
    if (entry) {
      present.push({ item, text: formatSingleItem(item, entry) });
    } else {
      missing.push(item.key);
    }
  }
  if (present.length === 0) {
    const raw = parsed && parsed.raw ? String(parsed.raw) : `[@${missing.join("; ")}]`;
    return { text: `[缺失：@${missing.join("; ")}]`, missingKeys: missing };
  }
  const body = present.map(p => p.text).filter(Boolean).join("; ");
  return { text: `(${body})`, missingKeys: missing };
}

// ============================================================================
// Task 2: Reference manifest, canonical BibTeX serialization
// ============================================================================

const REFERENCE_FIELDS = [
  "key", "type", "authors", "year", "title", "journal",
  "doi", "url", "volume", "issue", "pages", "publisher",
];

function asString(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function escapeBibValue(value) {
  return asString(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[{}]/g, "\\$&");
}

/**
 * Normalize a reference entry to a canonical string-only schema, defaulting
 * missing fields to empty strings. The canonical schema is the contract used
 * by `serializeReferenceBibTeX` and downstream consumers.
 */
export function normalizeReferenceEntry(entry) {
  const src = entry || {};
  const out = { key: "", type: "misc", authors: "", year: "", title: "", journal: "" };
  for (const field of REFERENCE_FIELDS) {
    out[field] = asString(src[field]).trim();
  }
  if (!out.type) out.type = "misc";
  if (!out.key) out.key = "anon";
  return out;
}

/**
 * Format a normalized entry into an author-year label plus display helpers,
 * suitable for the references side panel. The label intentionally mirrors
 * `formatCitationLabel` for consistency but operates on a single entry.
 */
export function formatReferenceEntry(entry) {
  const normalized = normalizeReferenceEntry(entry);
  const fake = { raw: `[@${normalized.key}]`, items: [{ key: normalized.key, suppressAuthor: false, suffix: "" }] };
  const label = formatCitationLabel(fake, new Map([[normalized.key, normalized]]));
  return {
    key: normalized.key,
    type: normalized.type,
    authors: normalized.authors,
    year: normalized.year,
    title: normalized.title,
    journal: normalized.journal,
    doi: normalized.doi,
    url: normalized.url,
    label: label.text,
  };
}

/**
 * Build a per-document reference manifest: `{ version, source, updatedAt, entries }`.
 * Entries are sorted and normalized so downstream consumers can rely on the schema.
 */
export function createReferenceManifest({ sourceName = "", sourceFormat = "", entries = [] } = {}) {
  return {
    version: "1",
    source: { name: String(sourceName || ""), format: String(sourceFormat || "") },
    updatedAt: new Date().toISOString(),
    entries: sortReferenceEntries(entries).map(normalizeReferenceEntry),
  };
}

/**
 * Re-shape an existing manifest into the canonical v1 schema without touching
 * the source/updatedAt metadata. Useful when restoring from older `.mentor` files.
 */
export function normalizeReferenceManifest(manifest) {
  const src = manifest || {};
  return {
    version: "1",
    source: {
      name: asString(src.source && src.source.name).trim(),
      format: asString(src.source && src.source.format).trim(),
    },
    updatedAt: asString(src.updatedAt).trim() || new Date(0).toISOString(),
    entries: sortReferenceEntries((src.entries || []).map(normalizeReferenceEntry)).map(normalizeReferenceEntry),
  };
}

/**
 * Convenience constructor for an empty manifest (no references yet).
 */
export function emptyReferenceManifest() {
  return {
    version: "1",
    source: { name: "", format: "" },
    updatedAt: new Date(0).toISOString(),
    entries: [],
  };
}

const BIBTEX_TYPE_MAP = {
  article: "article",
  journal: "article",
  jour: "article",
  "article-journal": "article",
  inproceedings: "inproceedings",
  conference: "inproceedings",
  conf: "inproceedings",
  proc: "inproceedings",
  "paper-conference": "inproceedings",
  proceedings: "proceedings",
  book: "book",
  inbook: "incollection",
  incollection: "incollection",
  chapter: "incollection",
  thesis: "phdthesis",
  phdthesis: "phdthesis",
  mastersthesis: "mastersthesis",
  techreport: "techreport",
  manual: "manual",
  misc: "misc",
  gen: "misc",
  unpublished: "unpublished",
};

function bibtexType(entry) {
  const raw = String(entry.type || "misc").toLowerCase();
  return BIBTEX_TYPE_MAP[raw] || raw || "misc";
}

function referenceEntryToBibTeX(entry) {
  const norm = normalizeReferenceEntry(entry);
  const fields = [];
  if (norm.authors) fields.push(`  author = {${escapeBibValue(norm.authors.replace(/;\s*/g, " and "))}}`);
  if (norm.year) fields.push(`  year = {${escapeBibValue(norm.year)}}`);
  if (norm.title) fields.push(`  title = {${escapeBibValue(norm.title)}}`);
  if (norm.journal) fields.push(`  journal = {${escapeBibValue(norm.journal)}}`);
  if (norm.volume) fields.push(`  volume = {${escapeBibValue(norm.volume)}}`);
  if (norm.issue) fields.push(`  number = {${escapeBibValue(norm.issue)}}`);
  if (norm.pages) fields.push(`  pages = {${escapeBibValue(norm.pages)}}`);
  if (norm.publisher) fields.push(`  publisher = {${escapeBibValue(norm.publisher)}}`);
  if (norm.doi) fields.push(`  doi = {${escapeBibValue(norm.doi)}}`);
  if (norm.url) fields.push(`  url = {${escapeBibValue(norm.url)}}`);
  const body = fields.length ? `\n${fields.join(",\n")}\n` : "";
  return `@${bibtexType(norm)}{${norm.key},${body}}`;
}

/**
 * Serialize a list of reference entries (or a manifest's entries) to a portable
 * canonical `references.bib` string. Entries without `doi/url/volume/issue/pages`
 * are silently omitted rather than emitted as empty fields.
 */
export function serializeReferenceBibTeX(entries) {
  const list = Array.isArray(entries) ? entries : (entries && entries.entries) || [];
  if (!list.length) return "";
  return list.map(referenceEntryToBibTeX).join("\n\n") + "\n";
}
