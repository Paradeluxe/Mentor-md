const fs = require('fs');
const path = require('path');
function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAIL: ${msg}`); console.log(`✓ ${msg}`); }
const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'SCHEMA.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
assert(schema.includes('references.json'), 'schema declares references.json');
assert(schema.includes('references.bib'), 'schema declares references.bib');
assert(schema.includes('可选 normalized reference manifest v1'), 'schema marks citation files optional');
assert(readme.includes('正文引文联动'), 'README documents body citation linkage');
assert(readme.includes('Pandoc citeproc'), 'README states Pandoc precision path');
assert(readme.includes('不可直接编辑'), 'README states bibliography is read-only');
console.log('PASS citation docs contract');
