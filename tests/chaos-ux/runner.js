/**
 * chaos-ux runner
 *   node tests/chaos-ux/runner.js --level=smoke
 *   node tests/chaos-ux/runner.js --level=full
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const LEVEL = (() => {
  const a = process.argv.find((x) => x.startsWith('--level='));
  return a ? a.split('=')[1] : 'smoke';
})();

const CORE = [
  'matrix/01-toolbar.spec.js',
  'matrix/03-tabs.spec.js',
  'matrix/04b-ann-anchors.spec.js',
  'matrix/04b-extra-anchors.spec.js',
  'matrix/04c-ann-bodies.spec.js',
  'matrix/04c-extra-bodies.spec.js',
  'matrix/04d-ann-state-machine.spec.js',
  'matrix/04e-ann-roundtrip.spec.js',
  'matrix/04f-ann-context.spec.js',
  'matrix/06-float-comment.spec.js',
  'matrix/07-export.spec.js',
  'matrix/08-settings-help.spec.js',
  'matrix/09-outline.spec.js',
  'matrix/11-keyboard.spec.js',
  'interleave/sequences-handcrafted.spec.js',
];

const SUITES = {
  smoke: [
    'matrix/01-toolbar.spec.js',
    'matrix/03-tabs.spec.js',
    'matrix/04b-ann-anchors.spec.js',
    'matrix/04c-ann-bodies.spec.js',
    'matrix/06-float-comment.spec.js',
    'interleave/sequences-handcrafted.spec.js',
  ],
  full: CORE,
  chaos: CORE.concat(['interleave/fuzzer.spec.js', 'interleave/fuzzer-multiseed.spec.js']),
};

function runOne(rel) {
  return new Promise((resolve) => {
    const file = path.join(__dirname, rel);
    console.log('\n>>>', rel);
    const child = spawn(process.execPath, [file], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    let out = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => resolve({ rel, code: code || 0, out }));
  });
}

(async () => {
  const list = SUITES[LEVEL] || SUITES.smoke;
  console.log(`chaos-ux runner level=${LEVEL} suites=${list.length}`);
  const results = [];
  for (const rel of list) {
    const r = await runOne(rel);
    results.push(r);
  }
  const failed = results.filter((r) => r.code !== 0);
  const summary = {
    level: LEVEL,
    total: results.length,
    failed: failed.length,
    ok: results.length - failed.length,
    failedSuites: failed.map((f) => f.rel),
    at: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, 'coverage-last.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log('\n======== chaos-ux summary ========');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
