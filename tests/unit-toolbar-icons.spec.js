// Static toolbar icon contract — last generated Lucide mask block wins.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const iconsJs = fs.readFileSync(path.join(root, 'icons.js'), 'utf8');
const buildPy = fs.readFileSync(path.join(root, 'scripts', 'build-icons.py'), 'utf8');

function lastBlock(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[\\s\\S]*?\\}', 'g');
  const all = [...css.matchAll(re)];
  assert.ok(all.length, `missing CSS rule for ${selector}`);
  return all[all.length - 1][0];
}

function assertMaskHas(selector, fragment, label) {
  const block = lastBlock(selector);
  assert.ok(block.includes(fragment), `${selector} should encode ${label}`);
}

// Required CSS_MASKS from build-icons.py
const required = {
  '#btn-new .tb-icon::before': 'M9%2015h6', // filePlus2
  '#btn-open-files .tb-icon::before': 'folder', // loose
  '#btn-save .tb-icon::before': 'save',
  '#btn-save-as .tb-icon::before': 'M10%2012v6', // fileArchive marker
  '#btn-export-md .tb-icon::before': 'm9%2015%203%203%203-3',
  '#btn-export-docx .tb-icon::before': 'file',
  '#btn-refs .tb-icon::before': 'm16%206%204%2014', // library
  '[data-cmd="blockquote"]::before': 'quote',
  '.rc-insert-btn::before': 'quote',
  '.rc-edit-btn::before': 'pencil',
  '.rc-delete-btn::before': 'trash',
  '#refs-add-btn .refs-action-icon': 'book',
  '#refs-import-btn .refs-action-icon': 'upload',
  '#refs-export-btn .refs-action-icon': 'download',
};

for (const [sel, frag] of Object.entries(required)) {
  // For keys that aren't path fragments, just ensure rule exists
  if (frag.includes('%') || frag.startsWith('M') || frag.startsWith('m')) {
    assertMaskHas(sel, frag, frag);
  } else {
    assert.ok(lastBlock(sel).includes('mask-image'), `${sel} has mask`);
  }
  console.log('  ✓', sel);
}

// Generated mask block uses stroke 2 only
const gen = css.split('/* === v1.43.34 Lucide masks')[1] || '';
assert.ok(gen.includes('stroke-width%3D%222%22'), 'generated masks use stroke 2');
assert.ok(!gen.includes("stroke-width%3D%221.5%22"), 'no stroke 1.5 in generated');
assert.ok(!gen.includes("stroke-width%3D%221.75%22"), 'no stroke 1.75');
assert.ok(!gen.includes('↶') && !gen.includes('↷'), 'no unicode arrows');

// build script maps
assert.ok(buildPy.includes("'#btn-refs .tb-icon::before': 'library'"), 'build maps refs->library');
assert.ok(buildPy.includes("'#btn-new .tb-icon::before': 'filePlus2'"), 'build maps new->filePlus2');
assert.ok(buildPy.includes("'#btn-save-as .tb-icon::before': 'fileArchive'"), 'build maps save-as->fileArchive');

// icons.js has library alias
assert.ok(iconsJs.includes('library:'), 'icons.js exports library');
assert.ok(iconsJs.includes("stroke-width='2'"), 'icons.js stroke 2');

console.log('PASS unit-toolbar-icons');
