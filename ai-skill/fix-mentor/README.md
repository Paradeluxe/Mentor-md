# fix-mentor (Mentor product skill)

Official AI skill package for **Mentor** in-app AI 处理.

| | |
|--|--|
| Runtime | **Pi** (`pi --mode rpc --skill <this> --extension extensions/mentor-sandbox.ts`) |
| Host | Mentor `mentor-server.py` embeds Pi via `ai/session_manager.py` |
| Scripts | `scripts/mentor_io.py` (stdlib only) |
| Identity | AI Reviewer (`--append-system-prompt` from host) |

## Env

- `MENTOR_SKILL_DIR` — absolute path to this folder (host sets on spawn)
- Override discovery: `MENTOR_SKILL_ROOT`

## Doctor

```bash
python scripts/mentor_io.py --help 2>/dev/null || python -c "import pathlib; print(pathlib.Path('scripts/mentor_io.py').resolve())"
```

Host Doctor checks Pi on PATH + this package layout.

## Not Hermes

Mentor no longer uses Hermes warm worker (:8788). Interactive Hermes CLI may still load a copy of this skill; product SoT is **this tree**.
