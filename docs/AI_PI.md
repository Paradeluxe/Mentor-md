# Mentor in-app AI (Pi)

Mentor product AI is **not Hermes**.

| Layer | Role |
|-------|------|
| Host | `mentor-server.py` on :8787 |
| Runtime | Pi coding-agent (`pi --mode rpc`) |
| Skill | in-repo `ai-skill/fix-mentor/` |
| Identity | AI Reviewer via `--append-system-prompt` |
| Job API | `POST /run-fix-mentor` + `GET /fix-mentor-job` |
| Connection | `GET /ai-connection` (was `/hermes-connection`) |
| Doctor | `GET /doctor` |

## Prerequisites

1. `pi` on PATH (`pi --version`)
2. Skill package at `Mentor/ai-skill/fix-mentor` (or `MENTOR_SKILL_ROOT`)
3. Real disk path to a `.mentor` file (no staged upload fallback)

## Developer entry

```text
ai/
  pi_detect.py
  pi_rpc.py
  session_manager.py
  job_runner.py
  path_policy.py
  sse_map.py
ai-skill/fix-mentor/
  SKILL.md
  scripts/mentor_io.py
  extensions/mentor-sandbox.ts
```

Model/provider: `~/.pi/agent/settings.json` (Pi settings), not Hermes config.

## Removed

- `scripts/hermes_fix_mentor_worker.py` (warm Hermes :8788)
- Silent cold `hermes chat -q` fallback
