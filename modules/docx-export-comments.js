/**
 * Pure OOXML comment-thread parts builder for DOCX export.
 *
 * Hand-rolls the five Microsoft Word comment-related parts so we don't have
 * to pull in dolanmiu/docx or another heavyweight library:
 *   - word/comments.xml              (root + every reply)
 *   - word/commentsExtended.xml      (threading + resolved/done)
 *   - word/commentsIds.xml           (durable ids)
 *   - word/commentsExtensible.xml    (per-comment UTC dates)
 *   - word/people.xml                (only when at least one author carries id)
 *
 * The consumer (app.js buildDocxBlob) feeds annotations from
 * State.annotations and writes the returned strings into the JSZip instance
 * along with [Content_Types].xml overrides and document.xml.rels entries.
 *
 * Public API:
 *   buildCommentsParts(annotations) -> {
 *     commentsXml, commentsExtendedXml, commentsIdsXml,
 *     commentsExtensibleXml, peopleXml, // null when no author id is present
 *     threadMap, commentEntries
 *   }
 *   authorInitials(name) -> string  (1-2 char uppercase initials, '?' fallback)
 *   escXml(s)            -> string  (escapes & < > " for XML text/attribute values)
 *
 * All XML strings are emitted without a leading XML declaration so the
 * caller can prepend it (or include it inline as the rest of the zip parts
 * already do). Each part string includes the declaration in the final
 * output so that consumers can write it verbatim to zip.file(path, ...).
 */

// ------------------------------------------------------------
// Namespace URIs — keep in sync with docx-fixture.js helpers
// ------------------------------------------------------------
const NS_W       = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_W14     = 'http://schemas.microsoft.com/office/word/2010/wordml';
const NS_W15     = 'http://schemas.microsoft.com/office/word/2012/wordml';
const NS_W16CID  = 'http://schemas.microsoft.com/office/word/2016/wordml/cid';
const NS_W16CEX  = 'http://schemas.microsoft.com/office/word/2018/wordml/cex';

// ------------------------------------------------------------
// XML safety
// ------------------------------------------------------------
export function escXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ------------------------------------------------------------
// authorInitials: at most two uppercase initials; fall back to '?'
// when the name is empty. Word tolerates a single initial.
// ------------------------------------------------------------
export function authorInitials(name) {
  if (name == null) return '?';
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  // First non-whitespace character always contributes an initial.
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0] || trimmed;
  const firstChar = (first.charAt(0) || '?').toUpperCase();
  if (parts.length >= 2) {
    const secondChar = (parts[1].charAt(0) || '').toUpperCase();
    return firstChar + secondChar;
  }
  return firstChar;
}

// ------------------------------------------------------------
// Helpers — purely functional; no module-level state
// ------------------------------------------------------------
function getAuthorName(comment) {
  const a = comment && comment.author;
  if (!a) return '';
  if (typeof a === 'string') return a.trim();
  if (typeof a === 'object') return String(a.name || '').trim();
  return '';
}

function getAuthorId(comment) {
  const a = comment && comment.author;
  if (!a || typeof a !== 'object') return '';
  return String(a.id || '').trim();
}

function getCommentBody(comment) {
  return String((comment && comment.body) || '').trim();
}

function isPending(thread) {
  if (!thread) return true;
  if (thread.pending === true) return true;
  // Treat as draft if there are zero comments with non-empty bodies.
  if (!Array.isArray(thread.comments) || thread.comments.length === 0) return true;
  return !thread.comments.some((c) => getCommentBody(c));
}

function isValidThread(thread) {
  if (!thread || typeof thread !== 'object') return false;
  if (typeof thread.threadId !== 'string' || !thread.threadId) return false;
  if (isPending(thread)) return false;
  return true;
}

// Eight-character uppercase hex (paraId / durableId).
// Word OOXML constraint (MS-DOCX / ECMA-376 extended):
//   w14:paraId  must be in [0x00000000, 0x7FFFFFFF]
//   w16cid:durableId must be in [0x00000000, 0x7FFFFFFE]
// High-bit ids make Word report "file may be corrupted".
function makeParaId(counter) {
  const n = ((counter * 0x9e3779b1) >>> 0) & 0x7fffffff;
  const v = n === 0 ? 1 : n;
  return ('0000000' + v.toString(16).toUpperCase()).slice(-8);
}

function makeDurableId(counter) {
  // Keep strictly below 0x7FFFFFFF and distinct from paraId stream.
  let n = ((counter * 0x85ebca77) >>> 0) & 0x7ffffffe;
  if (n === 0) n = 2;
  return ('0000000' + n.toString(16).toUpperCase()).slice(-8);
}

// ISO date — Word accepts the same ISO-8601 strings we already store on
// threads/comments. Fall back to epoch for safety.
function toIsoDate(s) {
  if (!s) return '1970-01-01T00:00:00Z';
  // Strip sub-millisecond noise (Word sometimes complains about >3-digit ms).
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '1970-01-01T00:00:00Z';
    return d.toISOString();
  } catch {
    return '1970-01-01T00:00:00Z';
  }
}

// ------------------------------------------------------------
// buildCommentsParts(annotations) — pure function, no DOM, no I/O
// ------------------------------------------------------------
export function buildCommentsParts(annotations) {
  const result = {
    commentsXml: '',
    commentsExtendedXml: '',
    commentsIdsXml: '',
    commentsExtensibleXml: '',
    peopleXml: null,
    threadMap: {},
    commentEntries: [],
  };

  if (!Array.isArray(annotations) || annotations.length === 0) {
    return result;
  }

  // Filter out invalid / pending threads up front.
  const validThreads = annotations.filter(isValidThread);
  if (validThreads.length === 0) return result;

  // ----- walk threads and emit one w:comment per reply + root -----
  const commentItems = [];   // for comments.xml
  const extendedItems = [];  // for commentsExtended.xml
  const idsItems = [];       // for commentsIds.xml
  const extensibleItems = []; // for commentsExtensible.xml
  const peopleMap = new Map(); // author key → { author, userId }

  let commentIdCounter = 0;
  let paraIdCounter = 1;

  for (const thread of validThreads) {
    const rootEntry = {
      commentId: commentIdCounter,
      threadId: thread.threadId,
      quoteText: String(thread.text || ''),
      isRoot: true,
      parentCommentId: null,
    };
    result.commentEntries.push(rootEntry);

    const comments = Array.isArray(thread.comments) ? thread.comments : [];
    const rootComment = comments[0];
    const replyComments = comments.slice(1).filter((c) => getCommentBody(c));

    const rootParaId = makeParaId(paraIdCounter++);
    const rootDurableId = makeDurableId(paraIdCounter);
    const rootBody = getCommentBody(rootComment);
    const rootAuthorName = getAuthorName(rootComment) || '匿名';
    const rootAuthorId = getAuthorId(rootComment);
    const rootAuthorInitials = authorInitials(rootAuthorName);
    const rootCreated = toIsoDate((rootComment && rootComment.createdAt) || thread.createdAt);

    rootEntry.paraId = rootParaId;
    rootEntry.durableId = rootDurableId;

    commentItems.push({
      id: rootEntry.commentId,
      author: rootAuthorName,
      initials: rootAuthorInitials,
      date: rootCreated,
      paraId: rootParaId,
      durableId: rootDurableId,
      body: rootBody,
    });

    extendedItems.push({
      paraId: rootParaId,
      done: thread.resolved === true ? '1' : '0',
    });

    idsItems.push({
      paraId: rootParaId,
      durableId: rootDurableId,
    });

    extensibleItems.push({
      paraId: rootParaId,
      durableId: rootDurableId,
      dateUtc: rootCreated,
    });

    if (rootAuthorId) {
      const key = rootAuthorId;
      if (!peopleMap.has(key)) {
        peopleMap.set(key, { author: rootAuthorName || key, userId: key });
      }
    }

    // remember threadMap for the consumer (app.js uses this to place ranges)
    result.threadMap[thread.threadId] = {
      commentId: rootEntry.commentId,
      paraId: rootParaId,
      durableId: rootDurableId,
      parentCommentId: null,
    };

    commentIdCounter++;

    // ----- replies -----
    for (const reply of replyComments) {
      commentIdCounter++;
      const replyEntry = {
        commentId: commentIdCounter - 1,
        threadId: thread.threadId,
        quoteText: '',
        isRoot: false,
        parentCommentId: rootEntry.commentId,
      };
      result.commentEntries.push(replyEntry);

      const replyParaId = makeParaId(paraIdCounter++);
      const replyDurableId = makeDurableId(paraIdCounter);
      const replyBody = getCommentBody(reply);
      const replyAuthorName = getAuthorName(reply) || '匿名';
      const replyAuthorId = getAuthorId(reply);
      const replyAuthorInitials = authorInitials(replyAuthorName);
      const replyCreated = toIsoDate(reply.createdAt);

      replyEntry.paraId = replyParaId;
      replyEntry.durableId = replyDurableId;
      replyEntry.parentParaId = rootParaId;

      commentItems.push({
        id: replyEntry.commentId,
        author: replyAuthorName,
        initials: replyAuthorInitials,
        date: replyCreated,
        paraId: replyParaId,
        durableId: replyDurableId,
        body: replyBody,
        parentParaId: rootParaId,
      });

      extendedItems.push({
        paraId: replyParaId,
        parentParaId: rootParaId,
        done: thread.resolved === true ? '1' : '0',
      });

      idsItems.push({
        paraId: replyParaId,
        durableId: replyDurableId,
      });

      extensibleItems.push({
        paraId: replyParaId,
        durableId: replyDurableId,
        dateUtc: replyCreated,
      });

      if (replyAuthorId) {
        const key = replyAuthorId;
        if (!peopleMap.has(key)) {
          peopleMap.set(key, { author: replyAuthorName || key, userId: key });
        }
      }
    }
  }

  // ----- assemble XML strings -----
  result.commentsXml = renderCommentsXml(commentItems);
  result.commentsExtendedXml = renderCommentsExtendedXml(extendedItems);
  result.commentsIdsXml = renderCommentsIdsXml(idsItems);
  result.commentsExtensibleXml = renderCommentsExtensibleXml(extensibleItems);
  // people.xml is intentionally omitted: Word Desktop rejects several
  // presenceInfo shapes as "file may be corrupted". Comments open fine
  // without it (verified via COM). Re-enable only with a Word-proven part.
  result.peopleXml = null;

  return result;
}

// ------------------------------------------------------------
// XML renderers
// ------------------------------------------------------------
function renderCommentsXml(items) {
  const inner = items
    .map((c) => {
      const attrs = [
        `w:id="${c.id}"`,
        `w:author="${escXml(c.author)}"`,
        `w:initials="${escXml(c.initials)}"`,
        `w:date="${escXml(c.date)}"`,
      ].join(' ');
      // Multi-paragraph body support: split on \n\n, otherwise keep one para.
      // First para carries the Word-required annotationRef + unique paraId
      // used by commentsEx / commentsIds. Extra paras get fresh paraIds.
      const paras = String(c.body || '').split(/\n{2,}/);
      const bodyXml = paras
        .map((p, pi) => {
          const lines = p.split('\n');
          const runs = lines
            .map((line, i) => {
              const br = i < lines.length - 1 ? '<w:br/>' : '';
              return (
                `<w:r><w:rPr><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` +
                `<w:t xml:space="preserve">${escXml(line)}</w:t>${br}</w:r>`
              );
            })
            .join('');
          const textRuns = runs || '<w:r><w:t xml:space="preserve"></w:t></w:r>';
          const paraId = pi === 0 ? c.paraId : makeParaId(c.id * 1000 + pi + 17);
          const annRef =
            pi === 0
              ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>'
              : '';
          return `<w:p w14:paraId="${escXml(paraId)}" w14:textId="77777777">${annRef}${textRuns}</w:p>`;
        })
        .join('');
      return `<w:comment ${attrs}>${bodyXml}</w:comment>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:comments xmlns:w="${NS_W}" xmlns:w14="${NS_W14}" xmlns:w15="${NS_W15}" ` +
    `xmlns:w16cid="${NS_W16CID}" xmlns:w16cex="${NS_W16CEX}" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
    `mc:Ignorable="w14 w15 w16cid w16cex">${inner}</w:comments>`
  );
}

function renderCommentsExtendedXml(items) {
  const inner = items
    .map((e) => {
      const attrs = [
        `w15:paraId="${escXml(e.paraId)}"`,
        e.parentParaId ? `w15:paraIdParent="${escXml(e.parentParaId)}"` : '',
        `w15:done="${e.done}"`,
      ].filter(Boolean).join(' ');
      return `<w15:commentEx ${attrs}/>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w15:commentsEx xmlns:w15="${NS_W15}" xmlns:w="${NS_W}" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
    `mc:Ignorable="w15">${inner}</w15:commentsEx>`
  );
}

function renderCommentsIdsXml(items) {
  const inner = items
    .map((i) => `<w16cid:commentId w16cid:paraId="${escXml(i.paraId)}" w16cid:durableId="${escXml(i.durableId)}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w16cid:commentsIds xmlns:w16cid="${NS_W16CID}" xmlns:w="${NS_W}" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
    `mc:Ignorable="w16cid">${inner}</w16cid:commentsIds>`
  );
}

function renderCommentsExtensibleXml(items) {
  // Word/skill format uses durableId (NOT paraId) on commentExtensible.
  const inner = items
    .map((i) => `<w16cex:commentExtensible w16cex:durableId="${escXml(i.durableId)}" w16cex:dateUtc="${escXml(i.dateUtc)}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w16cex:commentsExtensible xmlns:w16cex="${NS_W16CEX}" xmlns:w="${NS_W}" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
    `mc:Ignorable="w16cex">${inner}</w16cex:commentsExtensible>`
  );
}

function renderPeopleXml(peopleMap) {
  const inner = Array.from(peopleMap.values())
    .map((p) =>
      `<w15:person w:author="${escXml(p.author)}">` +
      `<w15:presenceInfo w15:providerId="None" w15:userId="${escXml(p.userId)}"/>` +
      `</w15:person>`
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w15:people xmlns:w15="${NS_W15}" xmlns:w="${NS_W}">${inner}</w15:people>`
  );
}