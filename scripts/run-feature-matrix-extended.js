/**
 * Extended Mentor regression — remaining e2e not in core matrix.
 * Usage: node scripts/run-feature-matrix-extended.js
 * Needs mentor-server :8787
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'tmp', 'feature-matrix-extended-report.json');

const E2E = [
  'tests/e2e-annotation-color-system.spec.js',
  'tests/e2e-annotation-overlap.spec.js',
  'tests/e2e-app-layout-live-sync-banner.spec.js',
  'tests/e2e-author-display.spec.js',
  'tests/e2e-authorize-writeback.spec.js',
  'tests/e2e-bibliography-marker.spec.js',
  'tests/e2e-cell-selection.spec.js',
  'tests/e2e-citation-full-flow.spec.js',
  'tests/e2e-citation-node.spec.js',
  'tests/e2e-comment-pane.spec.js',
  'tests/e2e-cross-block.spec.js',
  'tests/e2e-cross-tab-live-sync.spec.js',
  'tests/e2e-docx-comments-export.spec.js',
  'tests/e2e-docx-dfc-roundtrip.spec.js',
  'tests/e2e-docx-images.spec.js',
  'tests/e2e-docx-import-open.spec.js',
  'tests/e2e-external-mentor-refresh.spec.js',
  'tests/e2e-history.spec.js',
  'tests/e2e-media-gc.spec.js',
  'tests/e2e-mentor-pack.spec.js',
  'tests/e2e-mouse-drag.spec.js',
  'tests/e2e-mouse-drag-regression.spec.js',
  'tests/e2e-multi-cell-drag.spec.js',
  'tests/e2e-multi-paragraph.spec.js',
  'tests/e2e-multi-tab-draft-identity.spec.js',
  'tests/e2e-p0-data-integrity.spec.js',
  'tests/e2e-p1-save-media-zip.spec.js',
  'tests/e2e-p3a-active-mark.spec.js',
  'tests/e2e-reference-card-citation-cycle.spec.js',
  'tests/e2e-reference-management.spec.js',
  'tests/e2e-reference-pane-layout.spec.js',
  'tests/e2e-reference-pane-ux.spec.js',
  'tests/e2e-refs-library.spec.js',
  'tests/e2e-save-commit-lifecycle.spec.js',
  'tests/e2e-save-dialog.spec.js',
  'tests/e2e-structural-archive.spec.js',
  'tests/e2e-structural-media-hydrate.spec.js',
  'tests/e2e-supervision-f5.spec.js',
  'tests/e2e-todo-p1-remaining.spec.js',
  'tests/e2e-toolbar-popovers.spec.js',
  'tests/e2e-url-open-strip.spec.js',
  'tests/e2e-v2-picker-lock.spec.js',
  'tests/e2e-version-history.spec.js',
  'tests/e2e-version-identity.spec.js',
  'tests/e2e-workspace-f5-restore.spec.js',
  'tests/e2e-workspace-restore-partial.spec.js',
  'tests/e2e-workspace-session-persistence.spec.js',
  'tests/roundtrip-real-mentor.spec.js',
];

function run(rel, timeoutMs = 180000) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { name: rel, status: 'missing' };
  const isPy = rel.endsWith('.py');
  const cmd = isPy ? 'python' : 'node';
  const t0 = Date.now();
  const r = spawnSync(cmd, [abs], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, MENTOR_BASE: process.env.MENTOR_BASE || 'http://127.0.0.1:8787' },
  });
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  const tail = ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-12).join('\n');
  return { name: rel, status: ok ? 'pass' : 'fail', code: r.status, ms, tail };
}

function main() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const results = [];
  console.log('=== EXTENDED E2E ===');
  for (const t of E2E) {
    process.stdout.write(t + ' ... ');
    const r = run(t);
    results.push(r);
    if (r.status === 'pass') console.log('OK', r.ms + 'ms');
    else if (r.status === 'missing') console.log('MISSING');
    else {
      console.log('FAIL', r.code);
      console.log(r.tail);
    }
  }
  const summary = {
    total: results.length,
    pass: results.filter((x) => x.status === 'pass').length,
    fail: results.filter((x) => x.status === 'fail').length,
    missing: results.filter((x) => x.status === 'missing').length,
    fails: results.filter((x) => x.status === 'fail').map((x) => ({ name: x.name, code: x.code, tail: x.tail })),
  };
  fs.writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('report', reportPath);
  process.exit(summary.fail ? 1 : 0);
}

main();
