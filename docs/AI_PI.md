# Mentor in-app AI (Pi)

Mentor product AI is **not Hermes**.

| Layer | Role |
|-------|------|
| Host | `mentor-server.py` on :8787 |
| Runtime | Pi coding-agent (`pi --mode rpc`) |
| Primary skill | in-repo `ai-skill/fix-mentor/` |
| Optional skill | `browser-skill` (bsk) when installed on disk |
| Identity | AI Reviewer via `--append-system-prompt` |
| Job API | `POST /run-fix-mentor` + `GET /fix-mentor-job` |
| Connection | `GET /ai-connection` (was `/hermes-connection`) |
| Doctor | `GET /doctor` |

## Prerequisites

1. `pi` on PATH (`pi --version`)
2. Skill package at `Mentor/ai-skill/fix-mentor` (or `MENTOR_SKILL_ROOT`)
3. Real disk path to a `.mentor` file (no staged upload fallback)
4. (Optional) browser-skill + `bsk` CLI for live web during `@AI` jobs

## Optional browser-skill (bsk)

Mentor Pi spawn may pass a **second** `--skill` when browser-skill is found:

- Default lookup: `%LOCALAPPDATA%/hermes/skills/browser-skill`, `HERMES_HOME/skills/browser-skill`, `~/.pi/agent/skills/browser-skill`, or in-repo `ai-skill/browser-skill`
- Override: `MENTOR_BROWSER_SKILL_DIR` / `MENTOR_BROWSER_SKILL`
- Disable: `MENTOR_ENABLE_BROWSER_SKILL=0`
- `/ai-connection` reports `skills: ["fix-mentor","browser-skill"]` and `browserSkillDir` when active

Install bsk: https://github.com/Tencent/BrowserSkill — then `bsk install-skill` (Hermes/Pi hub) or leave the hermes skills copy in place.

**Primary job stays fix-mentor / mentor_io.** bsk is only for pending `@AI` that need live web evidence.

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
