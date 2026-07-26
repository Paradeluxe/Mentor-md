/**
 * IO layer: HandleStore (UUID primary key + basename fallback),
 * DraftStore (atomic body + annotations), serial write queue by documentId.
 */

/**
 * Deep-clone an arbitrary references payload so persisted drafts cannot share
 * object identity with the caller's live array. Mirrors the helper exported
 * by modules/tabs.js so DraftStore can stay self-contained.
 * @param {any} value
 */
function cloneReferences(value) {
  if (value == null) return value;
  if (!Array.isArray(value)) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }
  return value.map((entry) => {
    if (entry == null || typeof entry !== "object") return entry;
    try {
      return JSON.parse(JSON.stringify(entry));
    } catch (_) {
      return Object.assign({}, entry);
    }
  });
}

/** @returns {{ enqueue: (documentId: string, fn: () => Promise<any>) => Promise<any> }} */
export function createSerialWriteQueue() {
  const chains = new Map();
  return {
    enqueue(documentId, fn) {
      const key = documentId || "__default__";
      const prev = chains.get(key) || Promise.resolve();
      const next = prev.then(
        () => fn(),
        () => fn()
      );
      // Keep chain alive even if fn rejects
      chains.set(
        key,
        next.then(
          () => undefined,
          () => undefined
        )
      );
      return next;
    },
    /** test helper: pending chain count */
    _size() {
      return chains.size;
    }
  };
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTxDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("tx aborted"));
  });
}

/**
 * HandleStore v3
 * Primary key: documentId (UUID). Basename kept as secondary index for legacy reopen.
 */
export function createHandleStore(idbFactory = globalThis.indexedDB) {
  const store = {
    DB_NAME: "Mentor-handles",
    DB_VERSION: 3,
    _db: null,

    async open() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = idbFactory.open(this.DB_NAME, this.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          const oldVersion = e.oldVersion;
          if (oldVersion < 1) {
            if (!db.objectStoreNames.contains("folders")) {
              db.createObjectStore("folders", { keyPath: "path" });
            }
            if (!db.objectStoreNames.contains("lastFile")) {
              db.createObjectStore("lastFile", { keyPath: "id" });
            }
          }
          if (oldVersion < 2) {
            if (!db.objectStoreNames.contains("files")) {
              db.createObjectStore("files", { keyPath: "name" });
            }
          }
          if (oldVersion < 3) {
            if (!db.objectStoreNames.contains("filesById")) {
              const byId = db.createObjectStore("filesById", { keyPath: "documentId" });
              byId.createIndex("name", "name", { unique: false });
            }
            // Migrate existing basename-keyed rows into filesById when possible
            if (db.objectStoreNames.contains("files") && e.target.transaction) {
              try {
                const legacy = e.target.transaction.objectStore("files");
                const byId = e.target.transaction.objectStore("filesById");
                legacy.openCursor().onsuccess = (ev) => {
                  const cursor = ev.target.result;
                  if (!cursor) return;
                  const r = cursor.value;
                  if (r && r.handle) {
                    const documentId = r.documentId || r.name;
                    byId.put({
                      documentId,
                      name: r.name,
                      handle: r.handle,
                      updatedAt: r.updatedAt || Date.now()
                    });
                  }
                  cursor.continue();
                };
              } catch (_) {
                /* migration best-effort */
              }
            }
          }
        };
        req.onsuccess = () => {
          this._db = req.result;
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async putFolder(path2, handle) {
      return this._putInStore("folders", { path: path2, handle, updatedAt: Date.now() });
    },
    async getFolder(path2) {
      const db = await this.open();
      const row = await idbReq(db.transaction("folders", "readonly").objectStore("folders").get(path2));
      return row ? row.handle : null;
    },
    async listFolders() {
      const rows = await this._getAllFromStore("folders");
      return rows.map((r) => r.path);
    },
    async deleteFolder(path2) {
      return this._deleteFromStore("folders", path2);
    },

    /**
     * Prefer documentId; name is basename for fallback.
     * putFile(name, handle) remains for back-compat; putFileById is preferred.
     */
    async putFile(nameOrId, handle, documentId = null) {
      const name = nameOrId;
      const id = documentId || name;
      const record = { documentId: id, name, handle, updatedAt: Date.now() };
      await this._putInStore("filesById", record);
      // Basename compatibility layer for older reopen paths
      await this._putInStore("files", { name, handle, documentId: id, updatedAt: Date.now() });
      return id;
    },

    async putFileById(documentId, name, handle) {
      if (!documentId) throw new Error("putFileById: documentId required");
      return this.putFile(name || documentId, handle, documentId);
    },

    async getFile(nameOrId) {
      const db = await this.open();
      // UUID / documentId first
      if (db.objectStoreNames.contains("filesById")) {
        const byId = await idbReq(
          db.transaction("filesById", "readonly").objectStore("filesById").get(nameOrId)
        );
        if (byId && byId.handle) return byId.handle;
        // index by name
        try {
          const idx = db.transaction("filesById", "readonly").objectStore("filesById").index("name");
          const byName = await idbReq(idx.get(nameOrId));
          if (byName && byName.handle) return byName.handle;
        } catch (_) {
          /* no index */
        }
      }
      // Legacy basename store
      const legacy = await idbReq(db.transaction("files", "readonly").objectStore("files").get(nameOrId));
      return legacy ? legacy.handle : null;
    },

    async getFileRecord(nameOrId) {
      const db = await this.open();
      if (db.objectStoreNames.contains("filesById")) {
        const byId = await idbReq(
          db.transaction("filesById", "readonly").objectStore("filesById").get(nameOrId)
        );
        if (byId) return byId;
        try {
          const idx = db.transaction("filesById", "readonly").objectStore("filesById").index("name");
          const byName = await idbReq(idx.get(nameOrId));
          if (byName) return byName;
        } catch (_) {}
      }
      const legacy = await idbReq(db.transaction("files", "readonly").objectStore("files").get(nameOrId));
      if (!legacy) return null;
      return {
        documentId: legacy.documentId || legacy.name,
        name: legacy.name,
        handle: legacy.handle,
        updatedAt: legacy.updatedAt || 0
      };
    },

    async deleteFile(nameOrId) {
      const db = await this.open();
      const rec = await this.getFileRecord(nameOrId);
      const tx = db.transaction(
        db.objectStoreNames.contains("filesById") ? ["filesById", "files"] : ["files"],
        "readwrite"
      );
      if (db.objectStoreNames.contains("filesById")) {
        if (rec && rec.documentId) tx.objectStore("filesById").delete(rec.documentId);
        else tx.objectStore("filesById").delete(nameOrId);
        // also delete by name index scan if needed
        try {
          const idx = tx.objectStore("filesById").index("name");
          const req = idx.openCursor(IDBKeyRange.only(nameOrId));
          req.onsuccess = (ev) => {
            const c = ev.target.result;
            if (c) {
              c.delete();
              c.continue();
            }
          };
        } catch (_) {}
      }
      if (rec && rec.name) tx.objectStore("files").delete(rec.name);
      else tx.objectStore("files").delete(nameOrId);
      await idbTxDone(tx);
    },

    async listFiles() {
      const db = await this.open();
      let rows = [];
      if (db.objectStoreNames.contains("filesById")) {
        rows = await this._getAllFromStore("filesById");
      }
      if (!rows.length) {
        rows = (await this._getAllFromStore("files")).map((r) => ({
          documentId: r.documentId || r.name,
          name: r.name,
          updatedAt: r.updatedAt || 0
        }));
      }
      return (rows || [])
        .map((r) => ({
          documentId: r.documentId || r.name,
          name: r.name,
          updatedAt: r.updatedAt || 0
        }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    async putLastFile(fileName, documentId = null) {
      return this._putInStore(
        "lastFile",
        {
          id: "last",
          fileName,
          documentId: documentId || fileName,
          updatedAt: Date.now()
        },
        "lastFile",
        "id",
        "last"
      );
    },
    async getLastFile() {
      const db = await this.open();
      return idbReq(db.transaction("lastFile", "readonly").objectStore("lastFile").get("last"));
    },
    async removeLastFile() {
      const db = await this.open();
      const tx = db.transaction("lastFile", "readwrite");
      tx.objectStore("lastFile").delete("last");
      await idbTxDone(tx);
    },

    async _putInStore(storeName, record) {
      const db = await this.open();
      if (!db.objectStoreNames.contains(storeName)) return;
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(record);
      await idbTxDone(tx);
    },
    async _getAllFromStore(storeName) {
      const db = await this.open();
      if (!db.objectStoreNames.contains(storeName)) return [];
      return idbReq(db.transaction(storeName, "readonly").objectStore(storeName).getAll()) || [];
    },
    async _deleteFromStore(storeName, key) {
      const db = await this.open();
      if (!db.objectStoreNames.contains(storeName)) return;
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      await idbTxDone(tx);
    }
  };
  return store;
}

/**
 * Atomic draft cache: body markdown + annotations sidecar under documentId.
 * keyPath: documentId; also indexes basename for preheat.
 */
export function createDraftStore(idbFactory = globalThis.indexedDB) {
  const draft = {
    DB_NAME: "Mentor-drafts",
    DB_VERSION: 1,
    _db: null,
    writeQueue: createSerialWriteQueue(),

    async open() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = idbFactory.open(this.DB_NAME, this.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("drafts")) {
            const os = db.createObjectStore("drafts", { keyPath: "documentId" });
            os.createIndex("name", "name", { unique: false });
          }
        };
        req.onsuccess = () => {
          this._db = req.result;
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      });
    },

    /**
     * Atomic put of body + annotations (+ optional sidecar meta, + optional
     * references array). The references field is stored as a deep clone so
     * callers can mutate their own copy after the write without corrupting
     * persisted data. Schema/version are unchanged — references rides on the
     * existing `drafts` object store as an extra column.
     * @param {{ documentId: string, name: string, body: string, annotations: any[], sidecar?: object, references?: any[]|null }} record
     */
    async putDraft(record) {
      if (!record || !record.documentId) throw new Error("putDraft: documentId required");
      const documentId = record.documentId;
      return this.writeQueue.enqueue(documentId, async () => {
        const db = await this.open();
        const row = {
          documentId,
          name: record.name || documentId,
          body: typeof record.body === "string" ? record.body : "",
          annotations: Array.isArray(record.annotations) ? record.annotations : [],
          sidecar: record.sidecar || null,
          // null/absent both map to null on disk; cloneReferences returns the
          // input unchanged for null/undefined, otherwise deep-clones the
          // payload so persistent storage cannot share references with caller.
          references:
            record.references === undefined || record.references === null
              ? null
              : cloneReferences(record.references),
          updatedAt: Date.now()
        };
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put(row);
        await idbTxDone(tx);
        return row;
      });
    },

    async getDraft(documentIdOrName) {
      const db = await this.open();
      let row = await idbReq(
        db.transaction("drafts", "readonly").objectStore("drafts").get(documentIdOrName)
      );
      if (row) return row;
      try {
        const idx = db.transaction("drafts", "readonly").objectStore("drafts").index("name");
        row = await idbReq(idx.get(documentIdOrName));
      } catch (_) {}
      return row || null;
    },

    async deleteDraft(documentId) {
      return this.writeQueue.enqueue(documentId, async () => {
        const db = await this.open();
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").delete(documentId);
        await idbTxDone(tx);
      });
    },

    async list() {
      const db = await this.open();
      return (await idbReq(db.transaction("drafts", "readonly").objectStore("drafts").getAll())) || [];
    }
  };
  return draft;
}

/**
 * Legacy AnnotationStore shape used for sidecar-only preheat, upgraded to
 * also accept documentId keys. Kept for migration; prefer DraftStore for body+ann.
 */
export function createAnnotationStore(idbFactory = globalThis.indexedDB) {
  const store = {
    DB_NAME: "Mentor-annotations",
    DB_VERSION: 3,
    _db: null,
    writeQueue: createSerialWriteQueue(),

    async open() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = idbFactory.open(this.DB_NAME, this.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("annotations")) {
            const os = db.createObjectStore("annotations", { keyPath: "name" });
            try {
              os.createIndex("documentId", "documentId", { unique: false });
            } catch (_) {}
          } else if (e.oldVersion < 3) {
            try {
              const os = e.target.transaction.objectStore("annotations");
              if (!os.indexNames.contains("documentId")) {
                os.createIndex("documentId", "documentId", { unique: false });
              }
            } catch (_) {}
          }
        };
        req.onsuccess = () => {
          this._db = req.result;
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async put(name, sidecar, documentId = null) {
      const key = name;
      const id = documentId || name;
      return this.writeQueue.enqueue(id, async () => {
        const db = await this.open();
        const tx = db.transaction("annotations", "readwrite");
        tx.objectStore("annotations").put({
          name: key,
          documentId: id,
          sidecar,
          updatedAt: Date.now()
        });
        await idbTxDone(tx);
      });
    },

    async get(name) {
      const db = await this.open();
      return idbReq(db.transaction("annotations", "readonly").objectStore("annotations").get(name));
    },

    async getByDocumentId(documentId) {
      const db = await this.open();
      try {
        const idx = db.transaction("annotations", "readonly").objectStore("annotations").index("documentId");
        return idbReq(idx.get(documentId));
      } catch (_) {
        return null;
      }
    },

    async list() {
      const db = await this.open();
      return (await idbReq(db.transaction("annotations", "readonly").objectStore("annotations").getAll())) || [];
    }
  };
  return store;
}
