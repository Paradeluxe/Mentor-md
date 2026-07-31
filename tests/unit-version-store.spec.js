// VersionStore IDB unit test — in-memory IDB shim (no fake-indexeddb dep).
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { createVersionStore } = await import(
  pathToFileURL(path.join(ROOT, 'modules/io.js')).href
);
const { DEFAULT_VERSION_POLICY } = await import(
  pathToFileURL(path.join(ROOT, 'modules/version-history.js')).href
);

/** Build a minimal in-memory IDB factory compatible with VersionStore. */
function buildFakeIDB() {
  const databases = new Map();
  function wrapReq(value) {
    return { result: value, set onsuccess(fn) { queueMicrotask(() => fn({ target: this })); } };
  }
  function open(dbName, version) {
    let entry = databases.get(dbName);
    if (!entry) { entry = { version: 0, stores: new Map() }; databases.set(dbName, entry); }
    let onupgradeneededFn, onsuccessFn;
    const req = {
      result: null,
      set onupgradeneeded(fn) { onupgradeneededFn = fn; },
      set onsuccess(fn) {
        onsuccessFn = fn;
        queueMicrotask(() => {
          if (entry.version < version) {
            const db = {
              objectStoreNames: { contains: (n) => entry.stores.has(n), get length() { return entry.stores.size; } },
              createObjectStore(name, opts) {
                const store = { keyPath: opts && opts.keyPath, data: new Map(), indexes: new Map() };
                entry.stores.set(name, store);
                return { keyPath: store.keyPath, createIndex(n, f) { store.indexes.set(n, { field: f }); } };
              }
            };
            onupgradeneededFn({ target: { result: db, oldVersion: entry.version } });
            entry.version = version;
          }
          req.result = {
            objectStoreNames: { contains: (n) => entry.stores.has(n), get length() { return entry.stores.size; } },
            transaction(storeName, _mode) {
              const store = entry.stores.get(storeName);
              if (!store) throw new Error('store missing: ' + storeName);
              return {
                objectStore() {
                  return {
                    put(rec) { const k = store.keyPath ? rec[store.keyPath] : null; store.data.set(k, rec); return wrapReq(k); },
                    get(k) { return wrapReq(store.data.get(k) || null); },
                    getAll() { return wrapReq(Array.from(store.data.values())); },
                    delete(k) { store.data.delete(k); return wrapReq(undefined); },
                    index() { return { getAll() { return wrapReq([]); } }; }
                  };
                },
                set oncomplete(fn) { queueMicrotask(() => fn()); },
                set onerror(fn) { this._onerror = fn; },
                set onabort(fn) { this._onabort = fn; }
              };
            }
          };
          onsuccessFn({ target: req });
        });
      },
      set onerror(fn) { this._onerror = fn; }
    };
    return req;
  }
  return { open };
}

function makeRow(i, kind = 'autosave') {
  return {
    id: 'v' + i,
    documentId: 'doc-1',
    name: 'paper.mentor',
    kind,
    label: null,
    createdAt: 1000 + i,
    hash: 'h' + i,
    byteSize: 10,
    body: '# v' + i,
    annotations: [],
    sidecar: null,
    references: null,
    mediaFiles: null,
    mediaOmitted: false,
  };
}

const factory = buildFakeIDB();
const vs = createVersionStore(factory);

// Schema pins
assert.strictEqual(vs.DB_NAME, 'Mentor-versions');
assert.strictEqual(vs.DB_VERSION, 1);

// put + get roundtrip
await vs.putVersion(makeRow(1));
const got = await vs.getVersion('v1');
assert.ok(got, 'getVersion returns row');
assert.strictEqual(got.body, '# v1');
assert.strictEqual(got.documentId, 'doc-1');

// list sorted newest first, scoped by documentId
await vs.putVersion(makeRow(2));
await vs.putVersion(makeRow(3));
const doc1 = await vs.listByDocumentId('doc-1');
assert.strictEqual(doc1.length, 3);
assert.ok(doc1[0].createdAt >= doc1[1].createdAt && doc1[1].createdAt >= doc1[2].createdAt, 'sorted desc');
const other = await vs.listByDocumentId('doc-other');
assert.strictEqual(other.length, 0, 'scoped by documentId');

// getLatestHash = newest row's hash
const latest = await vs.getLatestHash('doc-1');
assert.strictEqual(latest, 'h3');

// deleteVersion removes one
await vs.deleteVersion('v1');
assert.strictEqual(await vs.getVersion('v1'), null);
assert.strictEqual((await vs.listByDocumentId('doc-1')).length, 2);

// deleteAllForDocument clears doc only
await vs.putVersion({ ...makeRow(9), id: 'v9', documentId: 'doc-other' });
await vs.deleteAllForDocument('doc-1');
assert.strictEqual((await vs.listByDocumentId('doc-1')).length, 0);
assert.strictEqual((await vs.listByDocumentId('doc-other')).length, 1, 'other doc untouched');

// pruneDocument applies policy: keep newest autosave, always keep named
const vs2 = createVersionStore(buildFakeIDB());
const base = makeRow(1);
for (const r of [
  { ...base, id: 'a1', createdAt: 1 },
  { ...base, id: 'a2', createdAt: 2 },
  { ...base, id: 'a3', createdAt: 3 },
  { ...base, id: 'n1', kind: 'named', label: 'pin', createdAt: 4 },
]) await vs2.putVersion(r);
const kept = await vs2.pruneDocument('doc-1', { ...DEFAULT_VERSION_POLICY, maxAutosave: 2, maxTotal: 10 });
const ids = kept.map((r) => r.id).sort();
assert.deepStrictEqual(ids, ['a2', 'a3', 'n1'].sort(), 'prune keeps newest 2 autosaves + named');
assert.strictEqual(await vs2.getVersion('a1'), null, 'oldest autosave pruned');
assert.strictEqual(await vs2.getVersion('n1') != null, true, 'named survives');

console.log('unit-version-store: PASS');
