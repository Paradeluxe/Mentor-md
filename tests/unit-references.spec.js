const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const refs = await import(pathToFileURL(path.resolve(__dirname, '../modules/references.js')).href);

  const bib = `@article{zeta2024last,
  author = {Zeta, Zoe},
  title = {Last title},
  journal = {Journal Z},
  year = {2024},
  doi = {10.1/zeta}
}

@article{alpha2020first,
  author = {Alpha, Ann and Beta, Bob},
  title = {{First} title},
  journal = {Journal A},
  year = {2020},
  doi = {10.1/alpha}
}`;
  const bibRows = refs.sortReferenceEntries(refs.parseBibTeX(bib));
  assert.deepStrictEqual(bibRows.map(x => x.key), ['alpha2020first', 'zeta2024last']);
  assert.strictEqual(bibRows[0].authors, 'Alpha, Ann; Beta, Bob');
  assert.strictEqual(bibRows[0].title, 'First title');

  const ris = `TY  - JOUR\nAU  - Gamma, Grace\nAU  - Delta, Dan\nTI  - RIS title\nJO  - RIS Journal\nPY  - 2021\nDO  - 10.2/ris\nER  - \n`;
  const risRows = refs.parseRIS(ris);
  assert.strictEqual(risRows.length, 1);
  assert.strictEqual(risRows[0].authors, 'Gamma, Grace; Delta, Dan');
  assert.strictEqual(risRows[0].title, 'RIS title');
  assert.strictEqual(risRows[0].year, '2021');
  assert.strictEqual(risRows[0].key, 'gamma2021ris');

  const cslRows = refs.parseCSLJSON(JSON.stringify([{
    id: 'omega2022json',
    type: 'article-journal',
    author: [{ given: 'Ola', family: 'Omega' }],
    issued: { 'date-parts': [[2022]] },
    title: 'JSON title',
    'container-title': 'JSON Journal',
    DOI: '10.3/json'
  }]));
  assert.strictEqual(cslRows.length, 1);
  assert.strictEqual(cslRows[0].key, 'omega2022json');
  assert.strictEqual(cslRows[0].authors, 'Ola Omega');

  assert.strictEqual(refs.detectReferenceFormat('a.bib', bib), 'bibtex');
  assert.strictEqual(refs.detectReferenceFormat('a.ris', ris), 'ris');
  assert.strictEqual(refs.detectReferenceFormat('a.json', '[]'), 'csl-json');

  const enw = `%0 Journal Article\n%A Endnote, Erin\n%A Other, Owen\n%T Tagged title\n%J EndNote Journal\n%D 2023\n%R 10.4/endnote\n`;
  const enwRows = refs.parseEndNoteTagged(enw);
  assert.strictEqual(enwRows.length, 1);
  assert.strictEqual(enwRows[0].authors, 'Endnote, Erin; Other, Owen');
  assert.strictEqual(enwRows[0].title, 'Tagged title');
  assert.strictEqual(refs.detectReferenceFormat('a.enw', enw), 'endnote-tagged');

  const xml = `<xml><records><record><rec-number>42</rec-number><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Xml, Xena</author></authors></contributors><titles><title>XML title</title><secondary-title>XML Journal</secondary-title></titles><dates><year>2024</year></dates><electronic-resource-num>10.5/xml</electronic-resource-num></record></records></xml>`;
  const xmlRows = refs.parseEndNoteXML(xml);
  assert.strictEqual(xmlRows.length, 1);
  assert.strictEqual(xmlRows[0].authors, 'Xml, Xena');
  assert.strictEqual(xmlRows[0].title, 'XML title');
  assert.strictEqual(refs.detectReferenceFormat('a.xml', xml), 'endnote-xml');

  assert.deepStrictEqual(refs.filterReferenceEntries(bibRows, 'Alpha').map(x => x.key), ['alpha2020first']);

  // ---- Task 1: citation syntax + author-year label ----
  const parsed = refs.parseCitationSyntax('[-@alpha2020first, p. 3; @zeta2024last]');
  assert.deepStrictEqual(parsed.items, [
    { key: 'alpha2020first', suppressAuthor: true, suffix: 'p. 3' },
    { key: 'zeta2024last', suppressAuthor: false, suffix: '' },
  ]);
  assert.strictEqual(parsed.raw, '[-@alpha2020first, p. 3; @zeta2024last]');
  assert.strictEqual(
    refs.serializeCitationSyntax(parsed),
    '[-@alpha2020first, p. 3; @zeta2024last]'
  );

  const entryMap = new Map([
    ['alpha2020first', { key: 'alpha2020first', authors: 'Alpha, Ann; Beta, Bob', year: '2020' }],
    ['zeta2024last', { key: 'zeta2024last', authors: 'Zeta, Zoe', year: '2024' }],
  ]);
  const label = refs.formatCitationLabel(parsed, entryMap);
  assert.strictEqual(label.text, '(2020, p. 3; Zeta, 2024)');
  assert.deepStrictEqual(label.missingKeys, []);

  const missing = refs.formatCitationLabel(refs.parseCitationSyntax('[@ghost]'), new Map());
  assert.strictEqual(missing.text, '[缺失：@ghost]');
  assert.deepStrictEqual(missing.missingKeys, ['ghost']);

  // 3+ author et al. format
  const threeMap = new Map([
    ['multi2025', { key: 'multi2025', authors: 'Aaa, One; Bbb, Two; Ccc, Three', year: '2025' }],
  ]);
  const threeLabel = refs.formatCitationLabel(
    refs.parseCitationSyntax('[@multi2025]'),
    threeMap
  );
  assert.strictEqual(threeLabel.text, '(Aaa et al., 2025)');

  // ---- Task 2: reference manifest + canonical BibTeX ----
  const manifest = refs.createReferenceManifest({
    sourceName: 'library.ris',
    sourceFormat: 'ris',
    entries: risRows,
  });
  assert.strictEqual(manifest.version, '1');
  assert.strictEqual(manifest.source.name, 'library.ris');
  assert.strictEqual(manifest.source.format, 'ris');
  assert.strictEqual(manifest.entries[0].key, 'gamma2021ris');
  assert.strictEqual(typeof manifest.updatedAt, 'string');

  const canonical = refs.serializeReferenceBibTeX(manifest.entries);
  assert.match(canonical, /@article\{gamma2021ris,/);
  assert.match(canonical, /author = \{Gamma, Grace and Delta, Dan\}/);
  assert.match(canonical, /year = \{2021\}/);
  assert.match(canonical, /title = \{RIS title\}/);

  // Normalize preserves doi/url/volume/issue/pages/publisher
  const normalized = refs.normalizeReferenceEntry({
    key: 'k2024',
    type: 'article',
    authors: 'Doe, J.',
    year: '2024',
    title: 'T',
    journal: 'J',
    doi: '10.1/k',
    url: 'https://example.com/k',
    volume: '12',
    issue: '3',
    pages: '1-10',
    publisher: 'Pub',
  });
  for (const field of ['key', 'type', 'authors', 'year', 'title', 'journal', 'doi', 'url', 'volume', 'issue', 'pages', 'publisher']) {
    assert.ok(typeof normalized[field] === 'string', `normalized.${field} must be string`);
  }
  assert.strictEqual(normalized.doi, '10.1/k');
  assert.strictEqual(normalized.url, 'https://example.com/k');
  assert.strictEqual(normalized.volume, '12');
  assert.strictEqual(normalized.issue, '3');
  assert.strictEqual(normalized.pages, '1-10');
  assert.strictEqual(normalized.publisher, 'Pub');

  const normManifest = refs.normalizeReferenceManifest(manifest);
  assert.strictEqual(normManifest.version, '1');
  assert.strictEqual(normManifest.entries.length, manifest.entries.length);

  const empty = refs.emptyReferenceManifest();
  assert.strictEqual(empty.version, '1');
  assert.deepStrictEqual(empty.entries, []);
  assert.strictEqual(empty.source.name, '');

  const formatted = refs.formatReferenceEntry(normalized);
  assert.strictEqual(formatted.key, 'k2024');
  assert.match(formatted.label, /Doe/);
  assert.match(formatted.label, /2024/);

  // Canonical BibTeX includes volume/issue/pages/publisher/url
  const bibOut = refs.serializeReferenceBibTeX([normalized]);
  assert.match(bibOut, /volume = \{12\}/);
  assert.match(bibOut, /number = \{3\}/);
  assert.match(bibOut, /pages = \{1-10\}/);
  assert.match(bibOut, /publisher = \{Pub\}/);
  assert.match(bibOut, /url = \{https:\/\/example\.com\/k\}/);
  assert.match(bibOut, /doi = \{10\.1\/k\}/);


  // ---- CRUD / merge / rename helpers ----
  const emptyErr = refs.validateReferenceEntry({ key: '', title: 'Paper' });
  assert.strictEqual(emptyErr.valid, false);
  assert.deepStrictEqual(emptyErr.errors, { key: 'citekey 不能为空' });
  const badKey = refs.validateReferenceEntry({ key: 'bad key', title: 'Paper' });
  assert.strictEqual(badKey.valid, false);
  assert.deepStrictEqual(badKey.errors, { key: 'citekey 只能包含字母、数字、_、-、:、.、/' });
  assert.strictEqual(
    refs.referenceEntriesEqual(
      { key: 'doe2024', type: 'article', title: ' Paper ' },
      { key: 'doe2024', type: 'article', title: 'Paper' }
    ),
    true
  );

  const base = refs.createReferenceManifest({ entries: [normalized] });
  const added = refs.upsertReferenceEntry(base, {
    key: 'new2025', type: 'article', title: 'New paper'
  });
  assert.strictEqual(base.entries.length, 1, 'upsert is immutable');
  assert.strictEqual(Object.keys(added.errors).length, 0);
  assert.strictEqual(added.manifest.entries.length, 2);
  assert.ok(added.manifest.entries.some((e) => e.key === 'new2025'));

  const renamed = refs.upsertReferenceEntry(added.manifest, {
    key: 'renamed2025', type: 'article', title: 'New paper'
  }, { originalKey: 'new2025' });
  assert.strictEqual(Object.keys(renamed.errors).length, 0);
  assert.deepStrictEqual(renamed.manifest.entries.map((x) => x.key).sort(), ['k2024', 'renamed2025']);

  const collision = refs.upsertReferenceEntry(renamed.manifest, {
    key: 'k2024', type: 'article', title: 'Dup'
  }, { originalKey: 'renamed2025' });
  assert.deepStrictEqual(collision.errors, { key: 'citekey 已存在' });
  assert.deepStrictEqual(collision.manifest.entries.map((x) => x.key).sort(), ['k2024', 'renamed2025']);

  const removed = refs.removeReferenceEntry(renamed.manifest, 'renamed2025');
  assert.deepStrictEqual(removed.entries.map((x) => x.key), ['k2024']);

  const merged = refs.mergeReferenceEntries(base, [
    { key: 'k2024', type: 'article', title: 'T', authors: 'Doe, J.', year: '2024', journal: 'J', doi: '10.1/k', url: 'https://example.com/k', volume: '12', issue: '3', pages: '1-10', publisher: 'Pub' },
    { key: 'new2025', type: 'article', title: 'New' },
    { key: 'k2024', type: 'article', title: 'Changed' },
  ]);
  assert.deepStrictEqual(merged.added.map((x) => x.key), ['new2025']);
  assert.strictEqual(merged.duplicates.length, 1);
  assert.strictEqual(merged.conflicts.length, 1);
  assert.strictEqual(merged.manifest.entries.length, 2);
  assert.strictEqual(merged.manifest.entries.find((e) => e.key === 'k2024').title, 'T');

  assert.strictEqual(
    refs.renameCitationKey('[-@old, p. 3; @other]', 'old', 'new'),
    '[-@new, p. 3; @other]'
  );
  assert.strictEqual(refs.renameCitationKey('[@other]', 'old', 'new'), '[@other]');
  assert.strictEqual(refs.renameCitationKey('[@old; @new]', 'old', 'new'), '[@new]');

  console.log('PASS references module');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
