# v1.45.5 — Save toast「已保存」但脏点仍在

## Symptom
User clicks 保存 → download/toast「已保存」→ dirty indicator stays / tab still dirty → feels like「不能保存」.

## Root cause
1. TipTap `onUpdate` always called `markDirty()` even when `transaction.docChanged` was false.
2. Live-sync `setLiveRole` → `setEditable` emits such an update (often during zip build after open/election).
3. `dirtyGen` bumped after `createSaveSnapshot` captured gen → `markClean` condition failed.

## Fix
- `onUpdate`: only `markDirty` / validate / autosave debounce when `docChanged`.
- `setLiveRole` / `closeLiveSync`: skip no-op `setEditable`.
- Anchor-audit no-handle: detect via `e.code` + Chinese message; secondary download `skipHardAudit: true`.

## Verify
```bash
node tests/e2e-save-clears-dirty.spec.js
node tests/e2e-save-dialog.spec.js
```

## Cache
app.bundle.js?v=169 / package 1.45.5
