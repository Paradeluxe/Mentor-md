# Supervision v1.47+ server restart pitfall

## Symptom
After code changes to `mentor-server.py`, browser still gets old `/supervision` behavior (or 404).

## Cause
Mentor often runs as a long-lived `python mentor-server.py` process. Editing the file does **not** hot-reload handlers.

## Fix
1. Stop the old process on the bound port (default 8787).
2. Start a fresh `python mentor-server.py` (or the project start script).
3. Hard-reload the browser (cache-bust `?v=` on index assets).
4. Confirm with `GET /supervision?path=...&token=...` returning `health` fields.

## Related
- Live probe / e2e isolation should use a **separate port** so the user's daily Mentor instance is untouched.
- Bundle drift: after `app.js` changes run `npm run build:bundle` then `npm run check:bundle`.
