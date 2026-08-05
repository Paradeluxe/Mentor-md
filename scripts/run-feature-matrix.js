/**
 * Mentor core regression matrix runner.
 * Usage: node scripts/run-feature-matrix.js
 * Needs mentor-server on PORT for e2e/python server specs.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'tmp', 'feature-matrix-report.json');

const UNIT = [
  'tests/unit-md-range.spec.js',
  'tests/unit-anchor-no-compat.spec.js',
  'tests/unit-annotation-anchor.spec.js',
  'tests/unit-annotations.spec.js',
  'tests/unit-comment-selection.spec.js',
  'tests/unit-cursor-tokens.spec.js',
  'tests/unit-supervision.spec.js',
  'tests/unit-supervision-poller.spec.js',
  'tests/unit-mentor-doctor.spec.js',
  'tests/unit-save-lifecycle.spec.js',
  'tests/unit-version-history.spec.js',
  'tests/unit-version-store.spec.js',
  'tests/unit-version-capture.spec.js',
  'tests/unit-workspace-session.spec.js',
  'tests/unit-workspace-store.spec.js',
  'tests/unit-markdown-normalize.spec.js',
  'tests/unit-mentor-archive.spec.js',
  'tests/unit-modules.spec.js',
  'tests/unit-toolbar-actions.spec.js',
  'tests/unit-external-change-reconcile.spec.js',
  'tests/unit-external-change-watcher.spec.js',
  'tests/unit-external-revision-watcher.spec.js',
  'tests/unit-docx-char-range-inject.spec.js',
  'tests/unit-docx-export-comments.spec.js',
  'tests/unit-docx-import.spec.js',
  'tests/unit-docx-edge-cases.spec.js',
  'tests/unit-docx-anchor-contract.spec.js',
  'tests/unit-citation-ui.spec.js',
  'tests/unit-references.spec.js',
  'tests/unit-cross-tab-sync.spec.js',
  'tests/unit-save-dialog.spec.js',
  'tests/unit-legacy-bibliography-migration.spec.js',
  'tests/unit-zip-worker-citations.spec.js',
  'tests/unit-zip-worker-structural.spec.js',
];

const PY = [
  'tests/mentor-server-supervision.spec.py',
  'tests/mentor-server-revision.spec.py',
  'tests/mentor-server-fix-mentor-job.spec.py',
  'tests/test_write_mentor_package.py',
];

const E2E_CORE = [
  'tests/orphan-deleted-banner-multipass.spec.js',
  'tests/pet-supervision-multipass.spec.js',
  'tests/survive-deleted.spec.js',
  'tests/e2e-comment-multi-delete.spec.js',
  'tests/e2e-doctor-path-ai.spec.js',
  'tests/e2e-annotation-locate-recover.spec.js',
  'tests/e2e-annotation-active-switch.spec.js',
  'tests/e2e-body-resolved-jump.spec.js',
  'tests/e2e-card-jump-center.spec.js',
  'tests/e2e-autosave-toggle.spec.js',
  'tests/e2e-autosave-disk-real.spec.js',
  'tests/e2e-file-ops-disk-real.spec.js',
  'tests/e2e-ann-reply-save-orders.spec.js',
  'tests/e2e-ann-reply-save-extra.spec.js',
  'tests/e2e-mentor-pack.spec.js',
  'tests/e2e-external-mentor-refresh.spec.js',
  'tests/v143-open-save-lifecycle.spec.js',
  'tests/v143-draft-vs-external-write.spec.js',
  'tests/roundtrip-real-mentor.spec.js',
  'tests/v143-autosave-simple.spec.js',
  'tests/e2e-save-clears-dirty.spec.js',
  'tests/e2e-toolbar-contract.spec.js',
  'tests/e2e-mentor-ux-optimization.spec.js',
  'tests/e2e-supervision-lifecycle.spec.js',
  'tests/e2e-supervision-statusbar.spec.js',
  'tests/e2e-supervision-navigation.spec.js',
  'examples/probe-supervision-pet.mjs',
];

function runOne(cmd, args, timeoutMs = 180000) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: false,
  });
  const ms = Date.now() - t0;
  const out = ((r.stdout || '') + '\n' + (r.stderr || '')).trim();
  const tail = out.split(/\r?\n/).slice(-12).join('\n');
  return {
    ok: r.status === 0,
    status: r.status,
    ms,
    tail,
    signal: r.signal || null,
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function runNode(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { ok: false, status: null, ms: 0, tail: 'MISSING', missing: true };
  return { name: rel, ...runOne(process.execPath, [abs], 240000) };
}

function runPy(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { ok: false, status: null, ms: 0, tail: 'MISSING', missing: true };
  return { name: rel, ...runOne('python', [abs], 180000) };
}

function main() {
  fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  // refresh session token for probes that read .mentor-session
  try {
    const http = require('http');
    // sync-ish via spawn curl if available
    const c = spawnSync('curl', ['-sS', 'http://127.0.0.1:8787/session'], { encoding: 'utf8', cwd: ROOT });
    if (c.status === 0 && c.stdout) {
      const j = JSON.parse(c.stdout);
      if (j.token) fs.writeFileSync(path.join(ROOT, '.mentor-session'), j.token, 'utf8');
    }
  } catch (_) {}

  const results = { startedAt: new Date().toISOString(), unit: [], py: [], e2e: [] };

  console.log('=== UNIT ===');
  for (const u of UNIT) {
    process.stdout.write(u + ' ... ');
    const r = runNode(u);
    results.unit.push({ name: u, ...r });
    console.log(r.missing ? 'MISS' : r.ok ? `OK ${r.ms}ms` : `FAIL ${r.status}`);
    if (!r.ok && !r.missing) console.log(r.tail.slice(0, 500));
  }

  console.log('=== PY SERVER ===');
  for (const u of PY) {
    process.stdout.write(u + ' ... ');
    const r = runPy(u);
    results.py.push({ name: u, ...r });
    console.log(r.missing ? 'MISS' : r.ok ? `OK ${r.ms}ms` : `FAIL ${r.status}`);
    if (!r.ok && !r.missing) console.log(r.tail.slice(0, 500));
  }

  console.log('=== E2E CORE ===');
  for (const u of E2E_CORE) {
    process.stdout.write(u + ' ... ');
    const r = runNode(u);
    results.e2e.push({ name: u, ...r });
    console.log(r.missing ? 'MISS' : r.ok ? `OK ${r.ms}ms` : `FAIL ${r.status}`);
    if (!r.ok && !r.missing) console.log(r.tail.slice(0, 800));
  }

  const flat = [...results.unit, ...results.py, ...results.e2e];
  const summary = {
    total: flat.length,
    pass: flat.filter((x) => x.ok).length,
    fail: flat.filter((x) => !x.ok && !x.missing).length,
    missing: flat.filter((x) => x.missing).length,
    fails: flat.filter((x) => !x.ok).map((x) => ({ name: x.name, status: x.status, tail: (x.tail || '').slice(0, 400) })),
  };
  results.summary = summary;
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('report', reportPath);
  process.exit(summary.fail ? 1 : 0);
}

main();
