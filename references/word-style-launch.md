# Word-style launch only — deep-link torn down

## Policy
- Human + agent launch: **pending-open only**
- `?open=&token=` deep-link: **removed** (client strips + toast/error; does not open)
- No `--deep-link`, no allow-open fallback on launch failure
- Keep internal `GET /open` + `POST /allow-open` as **ACL fetch** after pending queues a path (not a user URL scheme)

## Why
Backward-compat deep-link masked broken pending-open / association / token paths. Tear-down exposes failures.

## Flow
1. Desktop Mentor / `mentor.cmd` → clean `index.html`
2. Double-click `.mentor` → `POST /pending-open` → clean shell → `GET /pending-open` → `GET /open`
3. Pet: name-poll + register (no deep-link)

## Verify
```bash
node tmp/test-launch-compat-matrix.mjs
# A bare pending pass
# B deeplink rejected (must NOT open)
# C empty shell
# D oneshot
# E no --deep-link flag
```

## Pitfalls
- Old bookmarks with `?open=` will fail loud — expected
- Pending one-shot; two shells race
- Restart 8787 after pull
- Bundle: `npm run build:bundle` + `check:bundle`
