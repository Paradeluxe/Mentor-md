/**
 * unit/e2e-lite: DOCX image extraction
 * Run: node tests/e2e-docx-images.spec.js
 */
'use strict';

const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const JSZip = require('jszip');
const { makeMinimalDocx } = require('./helpers/docx-fixture');

// 1x1 PNG
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, '..', 'modules', 'docx-import.js')).href;
  const { parseDocxToMentor } = await import(modUrl);

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<w:body>' +
    '<w:p><w:r><w:t>Before </w:t></w:r>' +
    '<w:commentRangeStart w:id="0"/>' +
    '<w:r><w:t>pic zone</w:t></w:r>' +
    '<w:commentRangeEnd w:id="0"/>' +
    '<w:r><w:commentReference w:id="0"/></w:r></w:p>' +
    '<w:p><w:r><w:drawing><wp:inline>' +
    '<a:graphic><a:graphicData>' +
    '<pic:pic><pic:blipFill><a:blip r:embed="rIdImage1"/></pic:blipFill></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' +
    '<w:p><w:r><w:t>After</w:t></w:r></w:p>' +
    '</w:body></w:document>';

  const commentsXml =
    '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
    '<w:comment w:id="0" w:author="Img" w:date="2026-01-01T00:00:00Z">' +
    '<w:p w14:paraId="A1B2C3D4"><w:r><w:t>on text near image</w:t></w:r></w:p></w:comment></w:comments>';

  // Build zip with custom rels + media
  const base = await makeMinimalDocx({ documentXml, commentsXml });
  const zip = await JSZip.loadAsync(base);
  // Patch rels to include image
  let rels = await zip.file('word/_rels/document.xml.rels').async('string');
  if (!/rIdImage1/.test(rels)) {
    rels = rels.replace(
      '</Relationships>',
      '<Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>' +
        '</Relationships>',
    );
    zip.file('word/_rels/document.xml.rels', rels);
  }
  zip.file('word/media/image1.png', PNG_1x1);
  // Content types Override for png if needed
  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!/image\/png/.test(ct)) {
    ct = ct.replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/></Types>',
    );
    zip.file('[Content_Types].xml', ct);
  }
  const buf = await zip.generateAsync({ type: 'uint8array' });

  const res = await parseDocxToMentor(buf);
  assert.ok(Object.keys(res.mediaFiles).length >= 1, 'mediaFiles');
  const key = Object.keys(res.mediaFiles)[0];
  assert.ok(/^media\/image\d+\.png$/i.test(key), key);
  assert.ok(res.contentMd.includes('![](media/'), res.contentMd);
  assert.ok(res.annotations.length >= 1, 'comment preserved');
  assert.ok(
    res.annotations[0].text.includes('pic') || res.annotations.some((t) => /pic zone/.test(t.text)),
    'text comment anchors: ' + JSON.stringify(res.annotations.map((a) => a.text)),
  );
  assert.ok(res.annotations.some((t) => t.comments.some((c) => /on text near image/.test(c.body))));

  console.log('PASS e2e-docx-images media+comment');
  console.log('mediaKeys', Object.keys(res.mediaFiles));
  console.log('md snippet', res.contentMd.slice(0, 200));
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
