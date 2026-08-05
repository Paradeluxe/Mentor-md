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


def assert_under_project(project: PathLike, target: PathLike) -> Path:
    root = Path(project).resolve()
    t = Path(target).resolve()
    try:
        t.relative_to(root)
    except ValueError as e:
        raise AiPathError(f"path escapes project: {t}") from e
    return t
