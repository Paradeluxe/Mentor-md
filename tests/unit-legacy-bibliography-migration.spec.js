const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const refs = await import(pathToFileURL(path.resolve(__dirname, '../modules/references.js')).href);

  const manifest = refs.createReferenceManifest({
    entries: [
      { key: 'alpha2020', authors: 'Alpha, A.', year: '2020', title: 'A title', journal: 'Journal' },
      { key: 'unused2019', authors: 'Unused, U.', year: '2019', title: 'U title', journal: 'Journal' },
    ],
  });

  const md = [
    '# Body',
    '',
    'Text [@alpha2020].',
    '',
    '# References',
    '',
    'Alpha, A. (2020). A title. Journal.',
    '',
    'Unused, U. (2019). U title. Journal.',
    '',
    '# Appendix',
    '',
    'More.',
    '',
  ].join('\n');

  const result = refs.planLegacyBibliographyMigration(md, manifest);
  assert.strictEqual(result.safe, true);
  assert.strictEqual(result.originalCount, 2);
  assert.strictEqual(result.generatedCount, 2);
  assert.ok(result.markdown.includes('<!-- mentor:bibliography -->'));
  assert.ok(result.markdown.includes('# Appendix'));
  assert.ok(!result.markdown.includes('Alpha, A. (2020). A title. Journal.'));
  assert.strictEqual(result.config.scope, 'all');
  assert.strictEqual(result.config.enabled, true);

  const missingManifest = refs.createReferenceManifest({
    entries: [
      { key: 'alpha2020', authors: 'Alpha, A.', year: '2020', title: 'A title', journal: 'Journal' },
    ],
  });
  const mismatch = refs.planLegacyBibliographyMigration(md, missingManifest);
  assert.strictEqual(mismatch.safe, false);
  assert.strictEqual(mismatch.markdown, md);
  assert.strictEqual(mismatch.missing.length, 1);

  // materialize
  const model = refs.buildBibliographyModel(manifest, ['alpha2020'], { scope: 'all', heading: 'References' });
  const out = refs.materializeBibliographyMarkdown(
    '# Body\n\nText [@alpha2020].\n\n<!-- mentor:bibliography -->\n',
    model
  );
  assert.strictEqual((out.match(/^# References$/gm) || []).length, 1);
  assert.ok(out.includes('Alpha'));
  assert.ok(out.includes('Unused'));
  assert.ok(!out.includes('<!-- mentor:bibliography -->'));

  // no marker → unchanged
  const bare = '# Body\n\n# References\n\nAlpha, A. (2020). A title. Journal.\n';
  assert.strictEqual(refs.materializeBibliographyMarkdown(bare, model), bare);

  console.log('PASS unit-legacy-bibliography-migration');
})().catch((err) => {
  console.error(err.stack || err);
  process.exit(1);
});
