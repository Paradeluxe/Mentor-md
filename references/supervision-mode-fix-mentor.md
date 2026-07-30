# Supervision mode (fix-mentor ↔ Mentor) — v1.47.1

While `/fix-mentor` rewrites a `.mentor` package, open Mentor tabs enter **监管模式**:

1. Status bar cyan banner + **signal lamp** (`#supervision-signal`: off / waiting / working pulse)
2. Unprocessed `@AI` anchor paragraphs are **not editable** (and cannot take new body annotations)
3. **Current** thread: stronger outline + inline **owl pet** (“改这里”) at the mark; scrolls into view when `currentThreadId` changes
4. Mode ends when the sidecar is deleted / `active:false` (poll every 1s)

## Handshake

| Side | Artifact |
|------|----------|
| fix-mentor / mentor_io | Sidecar `<path.mentor>.supervision.json` |
| mentor-server | `GET /supervision?path=&token=` |
| Mentor app | Poll when `externalWatchPath` + `externalWatchToken` set (deep-link / `?open=`) |

### Sidecar schema (v1)

```json
{
  "v": 1,
  "active": true,
  "phase": "working",
  "health": "ok",
  "error": "",
  "tool": "fix-mentor",
  "lockMode": "pending-paragraphs",
  "pendingThreadIds": ["thread-uuid", "..."],
  "processedThreadIds": [],
  "currentThreadId": "thread-uuid-being-worked",
  "message": "fix-mentor 正在处理 · 已完成 0 · 剩余 2",
  "startedAt": "ISO",
  "updatedAt": "ISO"
}
```

#### Field contract

| Field | Type | Contract |
|-------|------|----------|
| `v` | int | Protocol version. Anything ≠ `1` → client returns inactive `health:"unsupported"`. |
| `active` | bool | Master switch. `false` ⇒ no locks, no phase, banner hidden. |
| `phase` | `"working"` \| `"waiting"` | When `active=true`. Explicit writer value wins; otherwise derived from `currentThreadId` (working if non-empty, else waiting). `idle` is reserved for `active=false`. |
| `health` | `"ok"` \| `"stale"` \| `"degraded"` \| `"missing"` \| `"unsupported"` \| `"unreadable"` | `ok/stale/degraded` are active-only health signals (transient I/O vs. known partial state). `missing/unsupported/unreadable` are inactive-only failure signals (no sidecar / wrong version / read error). |
| `error` | string | Human-readable cause for non-`ok` health. Empty when `health:"ok"`. |
| `currentThreadId` | string | **No longer auto-inferred from `pendingThreadIds[0]`.** Only honored when the writer sets it explicitly. Writers using `working_on(m)` (mentor_io) always set it; old-style sidecars that only wrote `pending` are interpreted as `phase:"waiting"`. |
| `lockMode` | `"pending-paragraphs"` (default) \| `"document"` | Only the explicit string `"document"` is honored. Empty pending alone does NOT force document lock — that is a downstream `materialize` (degraded) decision, not a normalize default. |

#### Notes

- `currentThreadId` is no longer inferred from the first pending thread. Old writers that set `currentThreadId` via `working_on` keep working; old sidecars that only set `pending` now report `phase:"waiting"` (signal lamp pulse → off) until the writer publishes a `currentThreadId`.
- The client distinguishes "no sidecar" (`health:"missing"`), "wrong version" (`health:"unsupported"`), and "read I/O error" (`health:"unreadable"`) so the UI can show a different message instead of silently folding them all into "no supervision".
- An `active:true` sidecar with `health:"stale"` (e.g. mentor-server read error or stale poll) is still rendered with locks/pet — `stale` means "active session, but the latest read failed", not "session gone". This is the only case where `active:true` and a non-`ok` health can coexist.

### mentor_io API

```python
from mentor_io import (
    start_supervision, update_supervision, end_supervision,
    supervision_session, read_supervision,
)

pending = find_unanswered_mentions(ann, marker="@AI")
with supervision_session(path, pending) as sup:
    for i, m in enumerate(pending):
        sup.working_on(m)  # pet + lamp → this anchor
        # ... edit / reply ...
        sup.tick(done=pending[: i + 1], rest=pending[i + 1 :])
# __exit__ always end_supervision
```

Or manual:

```python
start_supervision(path, pending)
# ...
update_supervision(path, pending=rest, processed=done, current=next_m, message="...")
end_supervision(path)  # always in finally
```

## Editor implementation

| Piece | Role |
|-------|------|
| `modules/supervision.js` | Normalize / range lock / pet widget / signal phase / plugin |
| `SupervisionExtension` in `app.js` | Registers plugin |
| `startSupervisionPolling` | 1s poll → `applySupervisionPayload` → plugin meta + scroll |
| Banner | `#supervision-banner` + `#supervision-signal` in statusbar |
| CSS | `.supervision-locked` / `.supervision-current` / `.supervision-pet` + lamp pulse |

`filterTransaction` blocks doc steps that overlap locked ranges. Comment pane is unaffected (replies are annotation data, not PM doc). Creating a new body annotation on a locked selection is also gated.

## Requirements for the banner/pet to appear

1. Doc opened via **Mentor server deep-link** (`python mentor-server.py --open file.mentor`) so `externalWatchPath` + token exist
2. fix-mentor wrote the sidecar before/while processing (`working_on` for pet focus)
3. Bundle rebuilt (`npm run build:bundle`) after app.js changes; hard-refresh (cache)

Handle-only open (file picker without path) **cannot** read the sibling sidecar in the browser; path+token is required. Windows double-click / assoc already uses server open.
