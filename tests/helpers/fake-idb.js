/**
 * Minimal in-memory IDBFactory shim for Mentor store tests.
 * Extracted from tests/unit-modules.spec.js; supports keypath-based stores,
 * getAll/delete, secondary index get/openCursor, and transaction oncomplete.
 * Event shape matches real IDB: e.oldVersion lives on the event, not only target.
 */

function buildFakeIDB() {
  const databases = new Map();

  function wrapReq(value) {
    return {
      result: value,
      error: null,
      set onsuccess(fn) { queueMicrotask(() => fn({ target: this })); },
      set onerror(fn) { this._onerror = fn; }
    };
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
            const oldVersion = entry.version || 0;
            const db = {
              objectStoreNames: {
                contains: (n) => entry.stores.has(n),
                get length() { return entry.stores.size; }
              },
              createObjectStore(name, opts) {
                const store = {
                  keyPath: opts && opts.keyPath,
                  data: new Map(),
                  indexes: new Map()
                };
                entry.stores.set(name, store);
                return {
                  keyPath: store.keyPath,
                  createIndex(idxName, field, _opts) {
                    store.indexes.set(idxName, { field });
                  }
                };
              }
            };
            const upgradeTx = {
              objectStore(name) {
                const store = entry.stores.get(name);
                if (!store) throw new Error('upgrade store missing: ' + name);
                return {
                  put(rec) {
                    const k = store.keyPath ? rec[store.keyPath] : null;
                    store.data.set(k, rec);
                    return wrapReq(k);
                  },
                  get(k) { return wrapReq(store.data.get(k) || null); },
                  openCursor() {
                    const list = Array.from(store.data.values());
                    let i = 0;
                    return {
                      set onsuccess(fn) {
                        queueMicrotask(() => {
                          if (i < list.length) {
                            const value = list[i++];
                            fn({
                              target: {
                                result: {
                                  value,
                                  continue() {}
                                }
                              }
                            });
                          } else {
                            fn({ target: { result: null } });
                          }
                        });
                      }
                    };
                  },
                  createIndex(idxName, field, _opts) {
                    store.indexes.set(idxName, { field });
                  },
                  get indexNames() {
                    return {
                      contains: (n) => store.indexes.has(n)
                    };
                  }
                };
              }
            };
            if (typeof onupgradeneededFn === 'function') {
              // Real IDBOpenDBRequest events expose oldVersion on the event object.
              onupgradeneededFn({
                oldVersion,
                newVersion: version,
                target: { result: db, transaction: upgradeTx }
              });
            }
            entry.version = version;
          }
          req.result = {
            objectStoreNames: {
              contains: (n) => entry.stores.has(n),
              get length() { return entry.stores.size; }
            },
            transaction(storeNames, _mode) {
              const names = Array.isArray(storeNames) ? storeNames : [storeNames];
              for (const n of names) {
                if (!entry.stores.has(n)) throw new Error('store missing: ' + n);
              }
              const primary = entry.stores.get(names[0]);
              return {
                objectStore(name) {
                  const store = entry.stores.get(name || names[0]);
                  if (!store) throw new Error('store missing: ' + name);
                  return {
                    put(rec) {
                      const k = store.keyPath ? rec[store.keyPath] : null;
                      store.data.set(k, rec);
                      return wrapReq(k);
                    },
                    get(k) { return wrapReq(store.data.get(k) || undefined); },
                    getAll() { return wrapReq(Array.from(store.data.values())); },
                    delete(k) { store.data.delete(k); return wrapReq(undefined); },
                    index(idxName) {
                      const idx = store.indexes.get(idxName);
                      return {
                        get(value) {
                          for (const row of store.data.values()) {
                            if (row[idx.field] === value) return wrapReq(row);
                          }
                          return wrapReq(undefined);
                        },
                        openCursor(range) {
                          const only = range && range.lower !== undefined ? range.lower : null;
                          const list = Array.from(store.data.values()).filter((r) => {
                            if (only == null) return r[idx.field] != null;
                            return r[idx.field] === only;
                          });
                          let i = 0;
                          return {
                            set onsuccess(fn) {
                              queueMicrotask(() => {
                                if (i < list.length) {
                                  const c = {
                                    value: list[i++],
                                    delete() {
                                      const key = store.keyPath ? c.value[store.keyPath] : null;
                                      if (key != null) store.data.delete(key);
                                    },
                                    continue() {}
                                  };
                                  fn({ target: { result: c } });
                                } else {
                                  fn({ target: { result: null } });
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
          if (typeof onsuccessFn === 'function') onsuccessFn({ target: req });
        });
      },
      set onerror(fn) { this._onerror = fn; }
    };
    return req;
  }

  return { open };
}

module.exports = { buildFakeIDB };
