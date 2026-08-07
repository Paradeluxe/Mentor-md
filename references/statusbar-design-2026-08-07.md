# Statusbar design (2026-08-07)

Zones: `#status-left-zone` | `#status-center-zone` | `#status-right-zone`

- Chips share `.status-chip` geometry (22px, pill, cream tokens).
- `#status-left` = ephemeral ops message (TTL ~3.2s via `STATUS_LEFT_TTL_MS`), **not** `display:none`.
- `#status-right` = quiet doc meta (`name · words · lines · anns · 图 N`). No default `media=`.
- IDs stable for `setStatus` / supervision / Pi / fix-mentor.
- ai-conn hover = accent ring, **not** danger red text.
- busy / loading dots use `--ai`, never cold-blue `#2563eb`.
- Idle supervision = fully hidden banner (not grey lamp always-on).
- Single `#supervision-signal` lamp; no `.supervision-banner-dot`.

Gates:
- `tests/unit-statusbar-ephemeral.spec.js`
- `tests/e2e-statusbar-layout.spec.js`
- `tests/e2e-supervision-statusbar.spec.js`
- `tests/e2e-app-layout-live-sync-banner.spec.js`
- `tests/unit-cursor-tokens.spec.js`
