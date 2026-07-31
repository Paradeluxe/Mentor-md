# Office-style save (Mentor v1.47.3+)

Two layers, controlled by the toolbar **自动保存** toggle (default **ON**, `localStorage Mentor:autoSave`).

## Model

| Mode | Target | Clears dirty? |
|------|--------|----------------|
| AutoSave **ON** + write handle | Official `.mentor`/`.md` handle (debounced) + DraftStore | **Yes** (`markClean`) |
| AutoSave **ON** without handle | DraftStore only (AutoRecover) | **No** |
| AutoSave **OFF** | DraftStore only (AutoRecover) | **No** |
| Ctrl+S / Save (`runManualSave` / `reason:'manual'`) | Official handle or download | **Yes** |
| Tab close / `beforeunload` | Prompt if `shouldPromptUnload()` | N/A |

## Code map

- `#btn-autosave` — Office-like switch; `getAutoSaveEnabled` / `setAutoSaveEnabled` / `isAutoSaveDiskActive` / `syncAutosaveToggleUi`
- `autosaveNow` — if preference ON + `hasWriteHandle` → `writeCurrentToHandle({reason:'autosave'})` then markClean; else draft only
- `writeCurrentToHandle` — success + matching dirtyGen → `markClean` for both manual and disk-autosave
- `scheduleAutosaveDebounce` / `startAutosaveTimer` — respect `autosavePausedForExternal`
- Settings debounce still controls stop-typing delay

## Coupling to external live refresh

- Clean (last confirmed/disk-autosave baseline matches buffer) → auto-reload external disk AI writes
- Dirty → conflict prompt; disk AutoSave skips when external-modified (`skipped`)

## Tests

- `tests/e2e-autosave-toggle.spec.js` — button default ON, click flips LS + aria-pressed
- `tests/v143-autosave-simple.spec.js` — OFF draft-only; ON disk+clean; download no write
- `tests/e2e-save-clears-dirty.spec.js` — manual save still clears dirty
- `tests/unit-toolbar-actions.spec.js` — `autoSave` action model

## Anti-patterns

- Calling `requestPermission` from background autosave (no user gesture) — use `queryPermission` only
- Treating draft status「已自动保存草稿」as disk commit
- Forcing disk AutoSave when toggle is OFF
