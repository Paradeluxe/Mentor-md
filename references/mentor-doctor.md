# Mentor Doctor (in-app)

Shipped 2026-08-04 — stop opening CLI for common Hermes/AI readiness failures.

## Entry
- Click bottom-bar **Hermes chip**
- Settings → 诊断 → **打开 Doctor**
- API: `GET /doctor`, `POST /doctor/repair` `{action: warm-worker|restart-worker}`

## What it checks
1. Real mentor-server (`/session`), not `python -m http.server`
2. hermes.exe + worker script + Hermes venv Python
3. warm worker `:8788` `agentReady`
4. Client: current doc disk path (warn only)

## Repair
- **启动/预热 Hermes** → `ensure_hermes_worker`
- **重启 worker** → terminate owned worker + respawn
- If page is fake http.server (API 404): shows PowerShell kill+start cmd + **复制修复命令**

## Gates
- curl `/doctor?warm=1` → overall ok when healthy
- `node tests/unit-mentor-doctor.spec.js`
- `npm run build:bundle` + `?v=`
- Restart mentor-server after `mentor-server.py` doctor patch

## Pitfall
mentor-server does not hot-reload. Doctor endpoints missing = stale PID or fake static server.
