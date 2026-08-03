# Dead Code Catalog (Round 5 — 2026-08-03)

> Mentor dead / redundant cleanup. Prior rounds live in skill
> `mentor-project/references/dead-code-catalog.md` (v1.32 era).

## Round 5 commits

| Commit | Summary |
|--------|---------|
| `7b9bbf8` | Checkpoint WIP before cleanup |
| `d131a0b` | `scripts/scan-dead-code.mjs` |
| `3dfae12` | app dead helpers + live-sync shims + staged client path |
| `fa0197d` | server staged writer + fuzzy UI CSS/card chrome |
| `f8921bd` | `app.bundle.js` + `?v=250` + catalog + unit align |

## Deleted / simplified (Round 5)

### JS (app.js)
- `escapeAttr` — alias of `escapeHtml`, 0 callers
- `typeLabel` — 0 callers
- `seedAiDraft` / `AI_MENTION_PREFIX` — dead aliases
- `buildCurrentMentorZipBlobForFixMentor` — unused after path-only AI
- `_closeDocChannel`, `_reevaluateReadOnly`, `_closeDocChannelFull` — lease live-sync supersedes
- Client `staged` job branches / `applyFixMentorResultFromPath({staged})` — product forbids stage
- Card chrome: `is-fuzzy` toggle, `.fuzzy-banner` selector
- Recover range no longer stamps `fuzzy:`
- Diagnosis export drops `fuzzy` field

### Server (mentor-server.py)
- `FIX_MENTOR_STAGE_DIR` / `ensure_fix_mentor_stage_dir`
- `write_staged_mentor_package` (uncalled)
- Stage-dir walk inside `resolve_mentor_path_by_name`
- Job `via` default: always `warm-worker` (no cold-spawn label)
- **Kept:** POST reject `staged-not-allowed` / packageBase64 400

### CSS (styles.css)
- `.pane-toggle-bar` / `.pane-toggle-chip` (+ media enable)
- `.comment-thread.is-fuzzy` / `.fuzzy-banner`
- `.reply-toggle` block
- `.comment-resolved-badge { display:none }`
- `.badge-download` icon rule
- `supervision-banner-dot` reduced-motion selector

### Tests
- `projectLegacyFlags` expectations: fuzzy always false (product)

## Scanner

```bash
node scripts/scan-dead-code.mjs
# exit 0 when DEAD_FUNCTIONS == 0
```

Remaining DEAD_CSS_CANDIDATES are mostly false positives
(ProseMirror / table `selectedCell` / supervision pet state classes /
outline class names set via template strings). Do not delete without
DOM proof.

## Out of scope (not done)
- Full `findAnnotationRange` internal `fuzzy:` flags rewrite
- God-file extract of fix-mentor UI module
- Aggressive `__mdAnnotator` export prune (many are e2e/diag hooks)
