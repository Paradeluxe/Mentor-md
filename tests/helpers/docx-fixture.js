/**
 * Test-only DOCX fixture factory.
 *
 * Builds minimal valid OOXML zips in memory via JSZip so DOCX-bridge unit
 * tests can drive parsers without touching the filesystem or depending on
 * external sample files.
 *
 * Exports:
 *   makeMinimalDocx({ documentXml, commentsXml, commentsExtendedXml,
 *                     commentsIdsXml, commentsExtensibleXml, peopleXml,
 *                     rels, contentTypes }) -> Promise<Uint8Array>
 *
 *   makeCommentDocxFixture() -> Promise<Uint8Array>
 *     A realistic minimal docx with:
 *       - 2 paragraphs: "Hello world" + "Second para"
 *       - comment id=0 on "Hello" (author Alice, body "root note")
 *       - comment id=1 reply, parentParaId referencing id=0
 *       - commentsExtended + commentsIds + commentsExtensible + people.xml
 */
'use strict';

const JSZip = require('jszip');

// ------------------------------------------------------------
// Namespace URIs used in fixtures
// ------------------------------------------------------------
const NS = {
  w:     'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  w14:   'http://schemas.microsoft.com/office/word/2010/wordml',
  w15:   'http://schemas.microsoft.com/office/word/2012/wordml',
  w16cid:'http://schemas.microsoft.com/office/word/2016/wordml/cid',
  w16cex:'http://schemas.microsoft.com/office/word/2018/wordml/cex',
  rels:  'http://schemas.openxmlformats.org/package/2006/relationships',
  mc:    'http://schemas.openxmlformats.org/markup-compatibility/2006',
};

const CONTENT_TYPE = {
  document: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  comments: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
  commentsExtended: 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml',
  commentsIds:     'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml',
  commentsExtensible: 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml',
  people: 'application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml',
  rels:   'application/vnd.openxmlformats-package.relationships+xml',
};

// ------------------------------------------------------------
// Default rels for the document
// ------------------------------------------------------------
function defaultDocumentRels(extraRels) {
  // Build dynamic rels based on which optional comment parts are present.
  const baseRels = [
    { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' },
    { id: 'rId2', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable', target: 'fontTable.xml' },
    { id: 'rId3', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', target: 'settings.xml' },
  ];
  // Comments-related rels are appended with monotonically increasing rIds.
  let nextId = 4;
  const commentRelationships = [];
  if (extraRels && extraRels.commentsXml) {
    commentRelationships.push({ id: 'rId' + nextId++, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments', target: 'comments.xml' });
  }
  if (extraRels && extraRels.commentsExtendedXml) {
    commentRelationships.push({ id: 'rId' + nextId++, type: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended', target: 'commentsExtended.xml' });
  }
  if (extraRels && extraRels.commentsIdsXml) {
    commentRelationships.push({ id: 'rId' + nextId++, type: 'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds', target: 'commentsIds.xml' });
  }
  if (extraRels && extraRels.commentsExtensibleXml) {
    commentRelationships.push({ id: 'rId' + nextId++, type: 'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible', target: 'commentsExtensible.xml' });
  }
  if (extraRels && extraRels.peopleXml) {
    commentRelationships.push({ id: 'rId' + nextId++, type: 'http://schemas.microsoft.com/office/2011/relationships/people', target: 'people.xml' });
  }
  return baseRels.concat(commentRelationships);
}

function renderRels(rels) {
  const inner = rels
    .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<Relationships xmlns="${NS.rels}">${inner}</Relationships>`
  );
}

// ------------------------------------------------------------
// [Content_Types].xml — declarative Overrides for every part we ship
// ------------------------------------------------------------
function buildContentTypes(parts) {
  const overrides = [];
  overrides.push(`<Override PartName="/word/document.xml" ContentType="${CONTENT_TYPE.document}"/>`);
  overrides.push(`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`);
  overrides.push(`<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`);
  overrides.push(`<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>`);
  if (parts.commentsXml)              overrides.push(`<Override PartName="/word/comments.xml" ContentType="${CONTENT_TYPE.comments}"/>`);
  if (parts.commentsExtendedXml)      overrides.push(`<Override PartName="/word/commentsExtended.xml" ContentType="${CONTENT_TYPE.commentsExtended}"/>`);
  if (parts.commentsIdsXml)           overrides.push(`<Override PartName="/word/commentsIds.xml" ContentType="${CONTENT_TYPE.commentsIds}"/>`);
  if (parts.commentsExtensibleXml)    overrides.push(`<Override PartName="/word/commentsExtensible.xml" ContentType="${CONTENT_TYPE.commentsExtensible}"/>`);
  if (parts.peopleXml)                overrides.push(`<Override PartName="/word/people.xml" ContentType="${CONTENT_TYPE.people}"/>`);

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="' + CONTENT_TYPE.rels + '"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    overrides.join('') +
    '</Types>'
  );
}

// ------------------------------------------------------------
// Minimal stub parts Word always requires
// ------------------------------------------------------------
function stubStyles() {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`
  );
}
function stubFontTable() {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:fonts xmlns:w="${NS.w}"><w:font w:name="Calibri"/></w:fonts>`
  );
}
function stubSettings() {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:settings xmlns:w="${NS.w}"><w:zoom w:percent="100"/></w:settings>`
  );
}

// ------------------------------------------------------------
// Minimal _rels/.rels for the package
// ------------------------------------------------------------
function packageRels() {
  return renderRels([
    { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument', target: 'word/document.xml' },
  ]);
}

// ------------------------------------------------------------
// makeMinimalDocx(opts)
// ------------------------------------------------------------
async function makeMinimalDocx(opts) {
  const o = opts || {};
  const zip = new JSZip();

  // Mandatory parts
  zip.file('[Content_Types].xml', buildContentTypes(o));
  zip.folder('_rels').file('.rels', packageRels());

  const wordFolder = zip.folder('word');
  wordFolder.folder('_rels').file('document.xml.rels', renderRels(defaultDocumentRels(o)));
  wordFolder.file('document.xml', o.documentXml || (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${NS.w}"><w:body>` +
    '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>' +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    '</w:body></w:document>'
  ));

  // Stub parts that some parsers expect
  wordFolder.file('styles.xml', stubStyles());
  wordFolder.file('fontTable.xml', stubFontTable());
  wordFolder.file('settings.xml', stubSettings());

  // Optional comment-related parts (only when supplied)
  if (o.commentsXml)            wordFolder.file('comments.xml', o.commentsXml);
  if (o.commentsExtendedXml)    wordFolder.file('commentsExtended.xml', o.commentsExtendedXml);
  if (o.commentsIdsXml)         wordFolder.file('commentsIds.xml', o.commentsIdsXml);
  if (o.commentsExtensibleXml)  wordFolder.file('commentsExtensible.xml', o.commentsExtensibleXml);
  if (o.peopleXml)              wordFolder.file('people.xml', o.peopleXml);

  return await zip.generateAsync({ type: 'uint8array' });
}

// ------------------------------------------------------------
// Realistic fixture with two threaded comments
// ------------------------------------------------------------
async function makeCommentDocxFixture() {
  const ROOT_PARA_ID = '0A000001';
  const REPLY_PARA_ID = '0A000002';

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${NS.w}" xmlns:w14="${NS.w14}" xmlns:w15="${NS.w15}" xmlns:w16cid="${NS.w16cid}" xmlns:w16cex="${NS.w16cex}" xmlns:mc="${NS.mc}" mc:Ignorable="w14 w15 w16cid w16cex">` +
    '<w:body>' +
    `<w:p>` +
      `<w:commentRangeStart w:id="0"/>` +
      '<w:r><w:t xml:space="preserve">Hello world</w:t></w:r>' +
      `<w:commentRangeEnd w:id="0"/>` +
      `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>` +
    '</w:p>' +
    `<w:p>` +
      '<w:r><w:t>Second para</w:t></w:r>' +
    '</w:p>' +
    `<w:p>` +
      `<w:commentRangeStart w:id="1"/>` +
      '<w:r><w:t xml:space="preserve">reply anchor</w:t></w:r>' +
      `<w:commentRangeEnd w:id="1"/>` +
      `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="1"/></w:r>` +
    '</w:p>' +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    '</w:body></w:document>';

  const commentsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:comments xmlns:w="${NS.w}" xmlns:w14="${NS.w14}">` +
      `<w:comment w:id="0" w:author="Alice" w:initials="A" w:date="2026-01-01T00:00:00Z">` +
        `<w:p w14:paraId="${ROOT_PARA_ID}" w14:textId="77777777">` +
          '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' +
          '<w:r><w:t>root note</w:t></w:r></w:p>' +
      '</w:comment>' +
      `<w:comment w:id="1" w:author="Bob" w:initials="B" w:date="2026-01-02T00:00:00Z">` +
        `<w:p w14:paraId="${REPLY_PARA_ID}" w14:textId="77777777">` +
          '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' +
          '<w:r><w:t>reply note</w:t></w:r></w:p>' +
      '</w:comment>' +
    '</w:comments>';

  const commentsExtendedXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w15:commentsEx xmlns:w15="${NS.w15}" xmlns:w="${NS.w}">` +
      `<w15:commentEx w15:paraId="${ROOT_PARA_ID}" w15:done="0"/>` +
      `<w15:commentEx w15:paraId="${REPLY_PARA_ID}" w15:paraIdParent="${ROOT_PARA_ID}" w15:done="0"/>` +
    '</w15:commentsEx>';

  const commentsIdsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w16cid:commentsIds xmlns:w16cid="${NS.w16cid}" xmlns:w="${NS.w}">` +
      `<w16cid:commentId w16cid:paraId="${ROOT_PARA_ID}" w16cid:durableId="11111111"/>` +
      `<w16cid:commentId w16cid:paraId="${REPLY_PARA_ID}" w16cid:durableId="22222222"/>` +
    '</w16cid:commentsIds>';

  const commentsExtensibleXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w16cex:commentsExtensible xmlns:w16cex="${NS.w16cex}" xmlns:w="${NS.w}">` +
      `<w16cex:commentExtensible w16cex:durableId="11111111" w16cex:dateUtc="2026-01-01T00:00:00Z"/>` +
      `<w16cex:commentExtensible w16cex:durableId="22222222" w16cex:dateUtc="2026-01-02T00:00:00Z"/>` +
    '</w16cex:commentsExtensible>';

  const peopleXml = null; // people part currently omitted — Word-desktop compatibility

  return await makeMinimalDocx({
    documentXml,
    commentsXml,
    commentsExtendedXml,
    commentsIdsXml,
    commentsExtensibleXml,
    peopleXml,
  });
}

module.exports = {
  makeMinimalDocx,
  makeCommentDocxFixture,
  NS,
  CONTENT_TYPE,
};
