import assert from 'node:assert/strict';
import {
  shouldCaptureVersion,
  contentFingerprint,
  pruneVersionList,
  DEFAULT_VERSION_POLICY,
} from '../modules/version-history.js';

// fingerprint stable
assert.equal(
  contentFingerprint({ body: 'a', annotations: [], references: null }),
  contentFingerprint({ body: 'a', annotations: [], references: null })
);
assert.notEqual(
  contentFingerprint({ body: 'a', annotations: [], references: null }),
  contentFingerprint({ body: 'b', annotations: [], references: null })
);

// capture rules
assert.equal(shouldCaptureVersion({ reason: 'manual', prevHash: 'x', nextHash: 'y' }), true);
assert.equal(shouldCaptureVersion({ reason: 'autosave', prevHash: 'x', nextHash: 'x' }), false); // dedup
assert.equal(shouldCaptureVersion({ reason: 'draft', prevHash: null, nextHash: 'y' }), false); // draft-only no version
assert.equal(shouldCaptureVersion({ reason: 'draft-only', prevHash: null, nextHash: 'y' }), false);
assert.equal(shouldCaptureVersion({ reason: 'named', prevHash: 'x', nextHash: 'x' }), true); // named always pins
assert.equal(shouldCaptureVersion({ reason: 'manual', prevHash: null, nextHash: null }), false);
assert.equal(shouldCaptureVersion({ reason: 'bogus', prevHash: 'x', nextHash: 'y' }), false);

// prune: keep all named + newest autosaves up to maxAutosave
const rows = [
  { id: '1', kind: 'autosave', createdAt: 1 },
  { id: '2', kind: 'named', createdAt: 2, label: 'v1' },
  { id: '3', kind: 'autosave', createdAt: 3 },
  { id: '4', kind: 'manual', createdAt: 4 },
  { id: '5', kind: 'autosave', createdAt: 5 },
];
const pruned = pruneVersionList(rows, { ...DEFAULT_VERSION_POLICY, maxAutosave: 2, maxTotal: 10 });
assert.deepEqual(pruned.map((r) => r.id).sort(), ['2', '4', '5'].sort()); // keep newest 2 rolling (5,4) + named '2'

// maxTotal enforcement drops oldest non-named first
const many = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  kind: i % 3 === 0 ? 'named' : 'autosave',
  createdAt: i + 1,
}));
const prunedMany = pruneVersionList(many, { ...DEFAULT_VERSION_POLICY, maxAutosave: 40, maxTotal: 6 });
assert.ok(prunedMany.length <= 6, 'maxTotal respected');
const namedKept = prunedMany.filter((r) => r.kind === 'named').length;
assert.equal(namedKept, 4, 'all named kept when under maxNamed');
assert.ok(!prunedMany.some((r) => r.id === '2'), 'oldest non-named dropped');

// named cap respected
const namedMany = Array.from({ length: 60 }, (_, i) => ({ id: 'n' + i, kind: 'named', createdAt: i }));
const prunedNamed = pruneVersionList(namedMany, { ...DEFAULT_VERSION_POLICY, maxAutosave: 10, maxNamed: 50, maxTotal: 80 });
assert.equal(prunedNamed.filter((r) => r.kind === 'named').length, 50, 'named capped at maxNamed');

console.log('unit-version-history: PASS');
