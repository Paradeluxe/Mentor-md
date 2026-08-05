"""Resolve fix-mentor skill package for Mentor Pi embed."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Tuple, Union

PathLike = Union[str, Path]

# Mentor repo root = parent of ai/
_MENTOR_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_SKILL = _MENTOR_ROOT / "ai-skill" / "fix-mentor"


class AiPathError(ValueError):
    """Invalid skill path or path escape."""


def _has_skill_md(p: Path) -> bool:
    return p.is_dir() and (p / "SKILL.md").is_file()


def env_skill_root() -> Tuple[Optional[Path], Optional[str]]:
    for key in ("MENTOR_SKILL_ROOT", "MENTOR_SKILL_DIR"):
        env = (os.environ.get(key) or "").strip().strip('"')
        if env:
            return Path(env).expanduser().resolve(), key
    return None, None


def resolve_skill_dir(hint: Optional[str] = None) -> Path:
    """Resolution: hint → MENTOR_SKILL_ROOT/DIR → in-repo ai-skill/fix-mentor."""
    if hint:
        p = Path(hint).expanduser().resolve()
        if _has_skill_md(p):
            return p
        raise AiPathError(f"skill dir missing SKILL.md: {p}")

    env_path, env_key = env_skill_root()
    if env_path is not None:
        if _has_skill_md(env_path):
            return env_path
        raise AiPathError(f"{env_key} missing SKILL.md: {env_path}")

    if _has_skill_md(_DEFAULT_SKILL):
        return _DEFAULT_SKILL.resolve()

    raise AiPathError(
        "could not locate fix-mentor skill "
        f"(expected {_DEFAULT_SKILL} or set MENTOR_SKILL_ROOT)"
    )


def _env_flag_disabled(name: str) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    return v in ("0", "false", "no", "off", "disable", "disabled")


def resolve_browser_skill_dir(hint: Optional[str] = None) -> Optional[Path]:
    """Optional browser-skill (bsk) package for Mentor Pi embed.

    Default ON when package is found. Disable with MENTOR_ENABLE_BROWSER_SKILL=0.
    Override path: MENTOR_BROWSER_SKILL_DIR or MENTOR_BROWSER_SKILL.
    """
    if _env_flag_disabled("MENTOR_ENABLE_BROWSER_SKILL"):
        return None

    candidates: list[Path] = []
    if hint:
        candidates.append(Path(hint).expanduser())
    for key in ("MENTOR_BROWSER_SKILL_DIR", "MENTOR_BROWSER_SKILL"):
        env = (os.environ.get(key) or "").strip().strip('"')
        if env:
            candidates.append(Path(env).expanduser())

    local_app = os.environ.get("LOCALAPPDATA") or ""
    hermes_home = (os.environ.get("HERMES_HOME") or "").strip()
    home = Path.home()
    if local_app:
        candidates.append(Path(local_app) / "hermes" / "skills" / "browser-skill")
    if hermes_home:
        candidates.append(Path(hermes_home).expanduser() / "skills" / "browser-skill")
    candidates.append(home / ".pi" / "agent" / "skills" / "browser-skill")
    candidates.append(home / "AppData" / "Local" / "hermes" / "skills" / "browser-skill")
    # In-repo optional vendored copy (if present)
    candidates.append(_MENTOR_ROOT / "ai-skill" / "browser-skill")

    seen = set()
    for raw in candidates:
        try:
            p = Path(raw).resolve()
        except Exception:
            continue
        key = str(p).lower()
        if key in seen:
            continue
        seen.add(key)
        if _has_skill_md(p):
            return p
    return None


def assert_under_project(project: PathLike, target: PathLike) -> Path:
    root = Path(project).resolve()
    t = Path(target).resolve()
    try:
        t.relative_to(root)
    except ValueError as e:
        raise AiPathError(f"path escapes project: {t}") from e
    return t
