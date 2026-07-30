# lessons-v1-46.1 — Office-style save (AutoRecover vs confirmed save)

## Rule
Classic local Word, not OneDrive AutoSave:

| Layer | Writes | Clears dirty? |
|-------|--------|---------------|
| Autosave / markDirty IDB | DraftStore only | No |
| Ctrl+S / Save | Official handle or download | Yes |
| Close / unload | Prompt if dirty | N/A |

## Why
Disk autosave made "dirty" meaningless and fought external AI refresh (clean after steal-write). Exit no longer asked because autosave already markClean'd.

## Implementation
- `autosaveNow` → `putAtomicDraftForCurrent` only
- `shouldPromptUnload` + `onBeforeUnload`
- `writeCurrentToHandle({reason:'autosave'})` if called must not `markClean` (defensive)
- Gates: `v143-autosave-simple.spec.js`, `e2e-save-clears-dirty.spec.js`
