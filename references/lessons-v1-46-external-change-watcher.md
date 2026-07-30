# lessons-v1-46 — External .mentor live refresh

## Problem
External writers (e.g. fix-mentor) can rewrite the open `.mentor` on disk while a browser tab still shows the old archive. Mentor previously only checked mtime at save time.

## Design
- No Yjs/CRDT. Single-writer + full archive snapshot reload.
- Two source modes:
  1. **handle** sessions: `FileSystemObserver` when available, else `getFile().lastModified` poll (`handle-poll`).
  2. **deep-link / Windows association** sessions: token-protected `GET /revision` poll (`server-poll`), then re-fetch via existing `/open`.
- Owner tab watches disk; followers receive updates only through existing BroadcastChannel live-sync.
- Clean document → auto reload full archive. Dirty document → confirm keep-local / take-disk.
- Self-writes: `noteOwnWrite` quiet window after successful handle save.

## Implementation anchors
- `modules/external-change-watcher.js`
- `modules/external-revision-watcher.js`
- `modules/external-change-reconcile.js`
- `mentor-server.py` → `/revision`
- `app.js` → `startExternalWatchForCurrentDocument`, `refreshFromExternalDisk`, `State.externalWatch*`

## Pitfalls
1. Deep-link opens have **no** `FileSystemFileHandle` — handle-only watch is insufficient.
2. `activateOpenedDocument` during reload restarts the watcher and bumps `generation`; rebaseline fingerprint/mtime **after** activate, do not bail on the pre-activate generation.
3. Strip `?open=` / `?token=` from the URL, but keep path+token in runtime memory for server-poll.
4. Fingerprint must include media bytes (or digests), not name/size only.
5. Pause autosave while a dirty external-conflict prompt is open.

## Tests
- `tests/unit-external-change-watcher.spec.js`
- `tests/unit-external-revision-watcher.spec.js`
- `tests/unit-external-change-reconcile.spec.js`
- `tests/mentor-server-revision.spec.py`
- `tests/e2e-external-mentor-refresh.spec.js`
- ownership assertion in `tests/e2e-cross-tab-live-sync.spec.js`
- server-poll assertion in `tests/e2e-url-open-strip.spec.js`
