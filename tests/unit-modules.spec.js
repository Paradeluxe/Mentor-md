/**
 * Node-side pure checks for modules (no browser).
 * Also verifies package.json license + SCHEMA/README presence.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  const results = [];
  const ok = (n) => results.push({ n, ok: true });
  const bad = (n, e) => {
    results.push({ n, ok: false, e: String(e && e.message || e) });
    console.error('FAIL', n, e);
  };

  // package license
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.notStrictEqual(pkg.license, 'MIT');
    assert.ok(/AGPL/i.test(pkg.license), 'license should mention AGPL, got ' + pkg.license);
    assert.ok(pkg.scripts.pretest, 'pretest missing');
    assert.ok(pkg.scripts['build:bundle'], 'build:bundle missing');
    assert.ok(/^1\.(43|44)\b/.test(String(pkg.version)), 'version ' + pkg.version);
    ok('package-agpl-pretest');
  } catch (e) {
    bad('package-agpl-pretest', e);
  }

  // SCHEMA / README
  try {
    const schema = fs.readFileSync(path.join(ROOT, 'SCHEMA.md'), 'utf8');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.ok(schema.includes('imageAnchors') || schema.includes('documentId'), 'SCHEMA missing new fields');
    assert.ok(/\.mentor/.test(readme), 'README missing .mentor');
    assert.ok(/v?1\.(43|44)\b/.test(readme), 'README missing version');
    ok('schema-readme');
  } catch (e) {
    bad('schema-readme', e);
  }

  // modules exist
  try {
    for (const f of [
      'modules/document-session.js',
      'modules/io.js',
      'modules/annotations.js',
      'modules/tabs.js',
    ]) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), 'missing ' + f);
    }
    ok('modules-on-disk');
  } catch (e) {
    bad('modules-on-disk', e);
  }

  // pure ESM imports
  try {
    const ann = await import(pathToFileURL(path.join(ROOT, 'modules/annotations.js')).href);
    const prev = [{ threadId: 'a', text: 'x', comments: [] }];
    const next = [{ threadId: 'a', text: 'y', comments: [] }];
    const inv = ann.computeInverseAnnPatch(prev, next);
    const back = ann.applyAnnPatch(next, inv);
    assert.strictEqual(back[0].text, 'x');
    assert.ok(ann.isPatchHistoryEntry({ kind: 'inverse-patch', annPatch: inv }));
    assert.ok(!ann.isPatchHistoryEntry({ annotations: prev }));
    const ranges = ann.collectChangedRanges({
      docChanged: true,
      mapping: {
        maps: [
          {
            forEach(fn) {
              fn(1, 5, 1, 8);
            },
          },
        ],
      },
    });
    assert.ok(ranges && ranges[0].from === 1);
    ok('pure-annotations-module');
  } catch (e) {
    bad('pure-annotations-module', e);
  }

  try {
    const ds = await import(pathToFileURL(path.join(ROOT, 'modules/document-session.js')).href);
    const fp = ds.fingerprintDocument('a.md', 'hello');
    assert.ok(String(fp).startsWith('doc-'));
    const sess = ds.createDocumentSession({ name: 'a.md', documentId: 'id1' });
    assert.strictEqual(ds.sessionIdentity(sess), 'id1');
    ok('pure-document-session');
  } catch (e) {
    bad('pure-document-session', e);
  }

  try {
    const io = await import(pathToFileURL(path.join(ROOT, 'modules/io.js')).href);
    const q = io.createSerialWriteQueue();
    const order = [];
    await Promise.all([
      q.enqueue('d1', async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
      }),
      q.enqueue('d1', async () => {
        order.push(2);
      }),
      q.enqueue('d2', async () => {
        order.push(3);
      }),
    ]);
    // d1 serialized: 1 then 2; d2 independent
    assert.ok(order.indexOf(1) < order.indexOf(2), 'd1 not serial: ' + order);
    ok('serial-write-queue');
  } catch (e) {
    bad('serial-write-queue', e);
  }

  try {
    const tabs = await import(pathToFileURL(path.join(ROOT, 'modules/tabs.js')).href);
    const id = tabs.genTabId();
    assert.ok(id);
    const found = tabs.findTabByDocument(
      [{ id: 't1', currentFile: { documentId: 'docA', name: 'a.md' }, name: 'a.md' }],
      'docA',
      null
    );
    assert.ok(found && found.id === 't1');
    ok('tabs-module');
  } catch (e) {
    bad('tabs-module', e);
  }

  // snapshotTabState: legacy callers (no references) keep existing shape
  try {
    const tabs = await import(pathToFileURL(path.join(ROOT, 'modules/tabs.js')).href);
    const snap = tabs.snapshotTabState({
      id: 'tab-legacy',
      name: 'legacy.md',
      html: '<p>x</p>',
      annotations: [{ threadId: 't', text: 'y', comments: [] }]
    });
    assert.strictEqual(snap.id, 'tab-legacy');
    assert.strictEqual(snap.name, 'legacy.md');
    assert.strictEqual(snap.html, '<p>x</p>');
    assert.deepStrictEqual(snap.annotations, [{ threadId: 't', text: 'y', comments: [] }]);
    // Legacy snapshot must not introduce a references key when caller
    // omitted it (preserves existing shape for back-compat consumers).
    assert.ok(!Object.prototype.hasOwnProperty.call(snap, 'references'),
      'legacy snapshot should not carry a references key');
    assert.ok(!Object.prototype.hasOwnProperty.call(snap.currentFile, 'references'),
      'legacy snapshot currentFile should not carry a references key');
    ok('snapshot-tab-state-legacy');
  } catch (e) {
    bad('snapshot-tab-state-legacy', e);
  }

  // snapshotTabState: when caller supplies references, snapshot must deep-
  // clone and never share identity with the input array or its entries.
  try {
    const tabs = await import(pathToFileURL(path.join(ROOT, 'modules/tabs.js')).href);
    const refsIn = [
      { key: 'smith2024', type: 'article', authors: 'Smith, J.', year: '2024', tags: ['a', 'b'] },
      { key: 'doe2023', type: 'book', authors: 'Doe, A.', year: '2023', meta: { nested: { v: 1 } } }
    ];
    const snap = tabs.snapshotTabState({
      id: 'tab-refs',
      name: 'with-refs.md',
      html: '<p>r</p>',
      annotations: [],
      references: refsIn
    });
    assert.ok(Array.isArray(snap.references), 'references should be an array on snapshot');
    assert.strictEqual(snap.references.length, 2);
    assert.strictEqual(snap.references[0].key, 'smith2024');
    assert.strictEqual(snap.references[1].meta.nested.v, 1);
    // No shared identity: the snapshot must be a deep clone
    assert.notStrictEqual(snap.references, refsIn, 'top-level array identity leaked');
    assert.notStrictEqual(snap.references[0], refsIn[0], 'entry identity leaked');
    assert.notStrictEqual(snap.references[0].tags, refsIn[0].tags, 'nested array identity leaked');
    // Mutating the input must not affect the snapshot
    refsIn[0].key = 'MUTATED';
    refsIn[0].tags.push('z');
    assert.strictEqual(snap.references[0].key, 'smith2024', 'snapshot caught mutation of key');
    assert.deepStrictEqual(snap.references[0].tags, ['a', 'b'], 'snapshot caught mutation of nested tags');
    // Mutating the snapshot must not affect the input
    snap.references[1].meta.nested.v = 999;
    assert.strictEqual(refsIn[1].meta.nested.v, 1, 'snapshot mutation leaked into input');
    ok('snapshot-tab-state-references-clone');
  } catch (e) {
    bad('snapshot-tab-state-references-clone', e);
  }

  // snapshotTabState: null/undefined references behave the same (no key)
  try {
    const tabs = await import(pathToFileURL(path.join(ROOT, 'modules/tabs.js')).href);
    const nullSnap = tabs.snapshotTabState({
      id: 'a', name: 'a.md', references: null
    });
    assert.strictEqual(nullSnap.references, null, 'null input should yield null field');
    // currentFile.references should also pass through null
    const curSnap = tabs.snapshotTabState({
      id: 'b', name: 'b.md',
      currentFile: { documentId: 'b', name: 'b.md', content: '', dirty: false, dirtyGen: 0, handle: null, references: null }
    });
    assert.strictEqual(curSnap.currentFile.references, null, 'currentFile null references pass-through');
    ok('snapshot-tab-state-references-null');
  } catch (e) {
    bad('snapshot-tab-state-references-null', e);
  }

  // DraftStore: putDraft deep-clones references into the persisted row.
  // Uses a tiny in-memory IDB shim — sufficient for the `drafts` object store
  // semantics DraftStore relies on. Avoids needing `fake-indexeddb` as a dev
  // dep (which isn't installed).
  try {
    const io = await import(pathToFileURL(path.join(ROOT, 'modules/io.js')).href);

    /** Build a minimal in-memory IDB factory compatible with io.js DraftStore. */
    function buildFakeIDB() {
      const databases = new Map();
      function wrapReq(value) {
        return { result: value, set onsuccess(fn) { queueMicrotask(() => fn({ target: this })); } };
      }
      function open(dbName, version) {
        let entry = databases.get(dbName);
        if (!entry) {
          entry = { version: 0, stores: new Map() };
          databases.set(dbName, entry);
        }
        let onupgradeneededFn, onsuccessFn;
        const req = {
          result: null,
          error: null,
          set onupgradeneeded(fn) { onupgradeneededFn = fn; },
          set onsuccess(fn) {
            onsuccessFn = fn;
            queueMicrotask(() => {
              if (entry.version < version) {
                const db = {
                  objectStoreNames: {
                    contains: (n) => entry.stores.has(n),
                    get length() { return entry.stores.size; }
                  },
                  createObjectStore(name, opts) {
                    const store = { keyPath: opts && opts.keyPath, data: new Map(), indexes: new Map() };
                    entry.stores.set(name, store);
                    return {
                      keyPath: store.keyPath,
                      createIndex(idxName, field, _opts) {
                        store.indexes.set(idxName, { field });
                      }
                    };
                  }
                };
                onupgradeneededFn({ target: { result: db, oldVersion: entry.version } });
                entry.version = version;
              }
              req.result = {
                objectStoreNames: {
                  contains: (n) => entry.stores.has(n),
                  get length() { return entry.stores.size; }
                },
                transaction(storeName, _mode) {
                  const store = entry.stores.get(storeName);
                  if (!store) throw new Error('store missing: ' + storeName);
                  return {
                    objectStore() {
                      return {
                        put(rec) {
                          const k = store.keyPath ? rec[store.keyPath] : null;
                          store.data.set(k, rec);
                          return wrapReq(k);
                        },
                        get(k) { return wrapReq(store.data.get(k) || null); },
                        getAll() { return wrapReq(Array.from(store.data.values())); },
                        delete(k) { store.data.delete(k); return wrapReq(undefined); },
                        index(idxName) {
                          const idx = store.indexes.get(idxName);
                          return {
                            get(value) {
                              for (const row of store.data.values()) {
                                if (row[idx.field] === value) return wrapReq(row);
                              }
                              return wrapReq(null);
                            },
                            openCursor() {
                              const list = Array.from(store.data.values()).filter((r) => r[idx.field] != null);
                              let i = 0;
                              return {
                                set onsuccess(fn) {
                                  queueMicrotask(() => {
                                    if (i < list.length) {
                                      const c = { value: list[i++], delete() {}, continue() {} };
                                      fn({ target: c });
                                    } else {
                                      fn({ target: null });
                                    }
                                  });
                                }
                              };
                            }
                          };
                        }
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

    const factory = buildFakeIDB();
    const ds = io.createDraftStore(factory);
    const refsIn = [
      { key: 'smith2024', type: 'article', authors: 'Smith', tags: ['a'] },
      { key: 'doe2023', type: 'book', authors: 'Doe', meta: { v: 1 } }
    ];
    const row = await ds.putDraft({
      documentId: 'doc-1',
      name: 'paper.md',
      body: '# hello',
      annotations: [],
      references: refsIn
    });
    assert.ok(row.references, 'putDraft row should expose references');
    assert.notStrictEqual(row.references, refsIn, 'row references must be a different reference than input');
    assert.notStrictEqual(row.references[0], refsIn[0], 'row entry must not share identity with input');
    assert.notStrictEqual(row.references[0].tags, refsIn[0].tags, 'nested arrays must not share identity');
    // Persisted row references should not be affected by subsequent mutation
    refsIn[0].tags.push('z');
    assert.deepStrictEqual(row.references[0].tags, ['a'], 'persisted row caught caller mutation');
    // existing semantics unchanged
    assert.strictEqual(row.body, '# hello');
    assert.deepStrictEqual(row.annotations, []);
    assert.strictEqual(row.documentId, 'doc-1');
    assert.strictEqual(row.name, 'paper.md');
    assert.strictEqual(row.sidecar, null);

    // Re-read: getDraft should return references unchanged on the cloned row
    const got = await ds.getDraft('doc-1');
    assert.ok(got, 'getDraft returned row');
    assert.strictEqual(got.references[0].key, 'smith2024');
    assert.deepStrictEqual(got.references[0].tags, ['a']);
    assert.strictEqual(got.references[1].meta.v, 1);

    // Mutating the re-read row must not affect the original caller array
    got.references[0].key = 'MUTATED';
    assert.strictEqual(refsIn[0].key, 'smith2024', 're-read row leaked into caller');

    // Schema/version constants must remain pinned (no IDB upgrade)
    assert.strictEqual(ds.DB_NAME, 'Mentor-drafts');
    assert.strictEqual(ds.DB_VERSION, 1, 'DB_VERSION must NOT bump for references');

    ok('draft-store-put-references');
  } catch (e) {
    bad('draft-store-put-references', e);
  }

  // DraftStore: putDraft with absent/null references stores `references: null`
  try {
    const io = await import(pathToFileURL(path.join(ROOT, 'modules/io.js')).href);
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
                transaction(storeName) {
                  const store = entry.stores.get(storeName);
                  if (!store) throw new Error('store missing: ' + storeName);
                  return {
                    objectStore() {
                      return {
                        put(rec) { const k = store.keyPath ? rec[store.keyPath] : null; store.data.set(k, rec); return wrapReq(k); },
                        get(k) { return wrapReq(store.data.get(k) || null); },
                        getAll() { return wrapReq(Array.from(store.data.values())); },
                        delete(k) { store.data.delete(k); return wrapReq(undefined); },
                        index() { return { get() { return wrapReq(null); } }; }
                      };
                    },
                    set oncomplete(fn) { queueMicrotask(() => fn()); },
                    set onerror(fn) { this._onerror = fn; }
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
    const factory = buildFakeIDB();
    const ds = io.createDraftStore(factory);
    const rowAbs = await ds.putDraft({ documentId: 'doc-x', name: 'x.md', body: '', annotations: [] });
    assert.strictEqual(rowAbs.references, null, 'absent references must store null');
    const rowNull = await ds.putDraft({ documentId: 'doc-y', name: 'y.md', body: '', annotations: [], references: null });
    assert.strictEqual(rowNull.references, null, 'explicit null must store null');
    const got = await ds.getDraft('doc-x');
    assert.strictEqual(got.references, null, 'getDraft should return null references');
    ok('draft-store-references-absent-null');
  } catch (e) {
    bad('draft-store-references-absent-null', e);
  }

  // index.html ARIA / DOCX
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('data-export-mode="body-only"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-label="批注面板"') || html.includes('aria-label="批注') || html.includes('id="comment-pane"'));
    assert.ok(
      html.includes('pane-toggle-bar') ||
        html.includes('expand-pane-btn') ||
        html.includes('pane-collapse-btn'),
      'missing pane collapse/expand controls'
    );
    ok('index-aria-docx');
  } catch (e) {
    bad('index-aria-docx', e);
  }

  console.log('\n=== unit-modules ===');
  for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.n + (r.e ? ' — ' + r.e : ''));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
