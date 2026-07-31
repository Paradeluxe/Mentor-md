# Version history (Mentor v1.48) — 自动版本快照

Word-like automatic versioning layered on the Office AutoSave stack. Every
successful disk commit (manual or disk-autosave) and every「保存此版本」named
pin leaves a recoverable snapshot in IndexedDB. Draft-only AutoRecover never
versions.

## Event matrix

| Event | DraftStore | Disk file | VersionStore |
|-------|-----------|-----------|--------------|
| AutoSave ON + handle success | yes | yes + clean | yes (dedup) |
| AutoSave OFF / no handle | yes | no | no |
| Ctrl+S success (handle) | yes | yes + clean | yes (dedup) |
| Ctrl+S no handle (download save) | yes | download + clean | yes (dedup) |
| 另存副本 / 诊断下载 | no change | download | no (copy, not history) |
| 保存此版本 (named pin) | no change | no | yes, always (even identical) |
| Restore version | no | no | read only; editor dirty |

## Code map

- `modules/version-history.js` — pure policy: `contentFingerprint` (FNV-1a,
  dedup), `shouldCaptureVersion` (manual/autosave dedup; draft never; named
  always), `pruneVersionList` (keep named up to maxNamed + newest rolling up
  to maxAutosave + maxTotal), `packMediaForVersion` (8MB gate),
  `estimateVersionByteSize`, `createVersionRow`
- `modules/io.js` — `createVersionStore`: IDB `Mentor-versions` (DB v1, store
  `versions`, keyPath `id`, indexes documentId/createdAt/hash);
  `putVersion` / `getVersion` / `listByDocumentId` (newest first) /
  `deleteVersion` / `deleteAllForDocument` / `pruneDocument` / `getLatestHash`;
  serial write queue per documentId; mediaFiles cloned Blob-safe
- `app.js`
  - `recordVersionFromSnapshot(snapshot, {kind, label})` — capture gate +
    fingerprint + put + prune; never throws to caller
  - Called at end of `writeCurrentToHandle` (wr.ok, kind = autosave|manual)
    and in `downloadMentorSnapshot` when `markCleanOnSuccess` (manual)
  - `getVersionHistoryEnabled` (`Mentor:versionHistory`, default ON),
    `getVersionPolicyFromSettings` (`Mentor:versionMaxAutosave` /
    `Mentor:versionMaxNamed`), `setVersionHistoryEnabled`,
    `setVersionMaxAutosave`
  - Drawer: `openVersionHistory` / `closeVersionHistory` /
    `renderVersionHistory` / `restoreVersion` / `deleteVersion` /
    `exportVersionAsMentor` / `runNamedVersionPin`
  - `#btn-version-history` (toolbar save group) + `#version-history-drawer`
    (pin / close / list); tab switch re-renders for active documentId
- `modules/toolbar-actions.js` — `versionHistory` action after `saveAs`
- `index.html` — drawer markup + settings section 版本历史 (enable toggle +
  maxAutosave retention)
- `SCHEMA.md` — Mentor-versions IDB row shape

## Hard rules

1. **Restore never writes disk.** Editor buffer + annotations replaced,
   `markDirty()`, history stacks reset; only a later Ctrl+S / disk-AutoSave
   commits. `beforeunload` prompt still applies.
2. **Capture never fails the save.** `recordVersionFromSnapshot` swallows all
   errors (console.warn). QuotaExceededError just stops recording until
   prune/delete frees space — no toast spam.
3. **Dedup by content hash.** Same body+annotations+references+media
   path:size list → no new row. Named pins bypass dedup.
4. **Versions are local to the browser profile** keyed by `documentId`; they
   do not travel with the `.mentor` file. Export a version via「另存」to carry
   it.
5. **Media gate:** total media > 8MB → `mediaOmitted: true`, row stores
   body/ann/refs only; restore keeps current-session media for omitted paths.
6. **Follower / read-only tabs:** `canWriteLiveDocument()===false` → no disk
   write → no autosave versions. Named pin of buffer still allowed.
7. **External live refresh:** capture runs after `noteExternalOwnWrite`
   (self-write never looks external); restore leaves dirty → external dirty
   conflict path (keep-local / take-disk) applies as designed.
8. **Draft-only AutoRecover** (AutoSave OFF or no handle) must never create
   version rows — `shouldCaptureVersion` rejects reason `draft`.

## Tests

- `tests/unit-version-history.spec.js` — fingerprint, capture rules, prune
- `tests/unit-version-store.spec.js` — IDB shim: put/get/list/delete/prune
- `tests/unit-version-capture.spec.js` — pack gate, byte size, row shape
- `tests/unit-toolbar-actions.spec.js` — versionHistory action
- `tests/e2e-version-history.spec.js` — drawer open/empty, named pin, dedup,
  restore→dirty, render, disable, delete
- Gates that must stay green: `v143-autosave-simple`, `e2e-autosave-toggle`,
  `e2e-save-clears-dirty`, `e2e-external-mentor-refresh`,
  `e2e-multi-tab-draft-identity`, `e2e-cross-tab-live-sync`

## Out of scope (v1)

- Versions embedded in `.mentor` ZIP; server-side `/versions` API; diff
  compare UI; full content-addressed media blob store
