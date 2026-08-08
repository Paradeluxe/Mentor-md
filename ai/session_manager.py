"""One open .mentor file → one long-lived Pi RPC process (multi-document concurrent)."""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .path_policy import AiPathError, resolve_browser_skill_dir, resolve_skill_dir
from .pi_detect import detect_pi
from .pi_rpc import PiRpcClient

PathLike = Union[str, Path]

# Injected via --append-system-prompt so Pi default tool guidelines stay intact.
MENTOR_AI_REVIEWER_IDENTITY = (
    "You are AI Reviewer — the annotation agent for Mentor (.mentor packages).\n"
    "- Product: Mentor. Primary skill: fix-mentor. Author name in replies: AI Reviewer.\n"
    "- Never claim to be Claude, ChatGPT, Gemini, GPT, Hermes, The Machine, or any other brand.\n"
    "- When asked which model you are: report the actual provider and model id for this "
    "Pi session if known; if unknown, say it is configured in Pi settings "
    "(~/.pi/agent/settings.json) and do not invent a brand name.\n"
    "- Job: read .mentor via scripts/mentor_io.py → process unanswered @AI/@REVIEW per skill "
    "→ write_mentor(block_on_unhealthy=True) → short factual replies.\n"
    "- Prefer python scripts/mentor_io.py and bash; do not invent TipTap document.html.\n"
    "- Be concise. Match the user's language."
)

MENTOR_BROWSER_SKILL_IDENTITY = (
    "\n- Optional skill: browser-skill (bsk CLI). Use ONLY when @AI needs live web "
    "(Scholar, docs, publisher pages). Workflow: bsk session start → --session id on "
    "every command → bsk session stop when done (even on error). Prefer snapshot over "
    "screenshot/html. Do not use bsk for routine mentor_io annotation work."
)


def _env_int(name: str, default: int, *, minimum: int = 1, maximum: int = 16) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        n = int(raw)
    except Exception:
        return default
    if n < minimum:
        return minimum
    if n > maximum:
        return maximum
    return n


def max_sessions_cap() -> int:
    """Max simultaneous Pi RPC processes kept warm."""
    return _env_int("MENTOR_AI_MAX_SESSIONS", 4, minimum=1, maximum=16)


def max_concurrent_cap() -> int:
    """Max simultaneous busy (running prompt) sessions / jobs."""
    # Concurrent jobs should not exceed warm session slots.
    conc = _env_int("MENTOR_AI_MAX_CONCURRENT", 2, minimum=1, maximum=16)
    return min(conc, max_sessions_cap())


class AiUnavailable(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


def _norm_mentor_key(mentor_path: PathLike) -> str:
    return str(Path(mentor_path).expanduser().resolve())


def _dir_key(project: PathLike) -> str:
    return "dir:" + str(Path(project).expanduser().resolve())


@dataclass
class _SessionSlot:
    key: str
    project: Path
    mentor_path: Optional[Path]
    client: PiRpcClient
    busy: bool = False
    last_error: str = ""
    last_used: float = field(default_factory=time.time)

    def touch(self) -> None:
        self.last_used = time.time()


class AiSessionManager:
    """
    Multi-document Pi session pool.

    Contract:
      - Each distinct .mentor path owns at most one long-lived Pi RPC process.
      - Different paths may run concurrently (up to MENTOR_AI_MAX_CONCURRENT).
      - Same path reuses its session; ensure does NOT tear down other paths.
    """

    def __init__(
        self,
        *,
        skill_dir: Optional[Path] = None,
        extension_path: Optional[Path] = None,
        client_factory=None,
        max_sessions: Optional[int] = None,
    ) -> None:
        self._lock = threading.RLock()
        self._slots: Dict[str, _SessionSlot] = {}
        self._last_key: Optional[str] = None  # last ensure target (compat)
        self._last_error = ""
        self._skill_dir = Path(skill_dir).resolve() if skill_dir is not None else None
        self._extension_path = (
            Path(extension_path).resolve() if extension_path is not None else None
        )
        self._client_factory = client_factory  # (argv, cwd, env) -> PiRpcClient
        self._max_sessions = (
            int(max_sessions)
            if max_sessions is not None
            else max_sessions_cap()
        )
        if self._max_sessions < 1:
            self._max_sessions = 1

    # ---- compat properties (aggregate / last-focused) ----

    @property
    def mentor_path(self) -> Optional[Path]:
        with self._lock:
            slot = self._slot_for_key(self._last_key) if self._last_key else None
            if slot is None and self._slots:
                slot = next(iter(self._slots.values()))
            return slot.mentor_path if slot else None

    @property
    def project_path(self) -> Optional[Path]:
        with self._lock:
            slot = self._slot_for_key(self._last_key) if self._last_key else None
            if slot is None and self._slots:
                slot = next(iter(self._slots.values()))
            return slot.project if slot else None

    @property
    def busy(self) -> bool:
        with self._lock:
            return any(s.busy for s in self._slots.values())

    def busy_count(self) -> int:
        with self._lock:
            return sum(1 for s in self._slots.values() if s.busy)

    def session_count(self) -> int:
        with self._lock:
            return len(self._slots)

    def is_busy(self, mentor_path: Optional[PathLike] = None) -> bool:
        with self._lock:
            if mentor_path is None:
                return any(s.busy for s in self._slots.values())
            slot = self._slots.get(_norm_mentor_key(mentor_path))
            return bool(slot and slot.busy)

    def _slot_for_key(self, key: Optional[str]) -> Optional[_SessionSlot]:
        if not key:
            return None
        return self._slots.get(key)

    def _resolve_skill(self) -> Path:
        if self._skill_dir is not None:
            p = Path(self._skill_dir).resolve()
            if not (p / "SKILL.md").is_file():
                raise AiUnavailable("skill_missing", f"SKILL.md missing: {p}")
            return p
        try:
            return resolve_skill_dir()
        except AiPathError as e:
            raise AiUnavailable("skill_missing", str(e)) from e

    def _resolve_extension(self, skill: Path) -> Path:
        if self._extension_path is not None:
            return Path(self._extension_path).resolve()
        for name in (
            "mentor-sandbox.ts",
            "mentor-sandbox.js",
            "project-sandbox.ts",
            "project-sandbox.js",
        ):
            cand = skill / "extensions" / name
            if cand.is_file():
                return cand.resolve()
        raise AiUnavailable("extension_missing", "mentor-sandbox extension not found")

    def _resolve_extra_skills(self, primary: Path) -> List[Path]:
        """Additional --skill dirs (browser-skill). Never duplicates primary."""
        out: List[Path] = []
        browser = resolve_browser_skill_dir()
        if browser is None:
            return out
        try:
            bp = browser.resolve()
            if bp != primary.resolve() and (bp / "SKILL.md").is_file():
                out.append(bp)
        except Exception:
            pass
        return out

    def build_identity_prompt(self, extra_skills: Optional[List[Path]] = None) -> str:
        text = MENTOR_AI_REVIEWER_IDENTITY
        for sk in extra_skills or []:
            name = sk.name.lower()
            if "browser" in name:
                text = text + MENTOR_BROWSER_SKILL_IDENTITY
                break
        return text

    def build_argv(
        self,
        project: Path,
        skill: Path,
        ext: Path,
        pi_path: str,
        extra_skills: Optional[List[Path]] = None,
    ) -> List[str]:
        extras = list(extra_skills) if extra_skills is not None else self._resolve_extra_skills(skill)
        argv: List[str] = [
            pi_path,
            "--mode",
            "rpc",
            "--no-extensions",
            "--extension",
            str(ext),
            "--skill",
            str(skill),
        ]
        for extra in extras:
            argv.extend(["--skill", str(extra)])
        argv.extend(
            [
                "--session-dir",
                str(project.resolve()),
                "--append-system-prompt",
                self.build_identity_prompt(extras),
            ]
        )
        return argv

    def ensure_for_mentor(self, mentor_path: PathLike) -> Dict[str, Any]:
        mp = Path(mentor_path).expanduser().resolve()
        if not str(mp).lower().endswith(".mentor"):
            raise AiPathError(f"not a .mentor file: {mp}")
        if not mp.is_file():
            raise AiPathError(f"not found: {mp}")
        project = mp.parent.resolve()
        return self._ensure(key=_norm_mentor_key(mp), project=project, mentor_path=mp)

    def ensure(self, project_path: PathLike) -> Dict[str, Any]:
        """Ensure session for a directory (tests / generic)."""
        project = Path(project_path).resolve()
        if not project.is_dir():
            raise AiPathError(f"not a directory: {project}")
        return self._ensure(key=_dir_key(project), project=project, mentor_path=None)

    def _evict_idle_unlocked(self, *, need: int = 1) -> None:
        """Drop least-recently-used idle (not busy) slots until room for `need` new ones."""
        while len(self._slots) + need > self._max_sessions:
            candidates = [s for s in self._slots.values() if not s.busy]
            if not candidates:
                raise AiUnavailable(
                    "session_limit",
                    f"Pi session limit reached ({self._max_sessions}); all slots busy",
                )
            victim = min(candidates, key=lambda s: s.last_used)
            self._close_slot_unlocked(victim.key)

    def _close_slot_unlocked(self, key: str) -> None:
        slot = self._slots.pop(key, None)
        if slot is None:
            return
        try:
            slot.client.close()
        except Exception:
            pass
        if self._last_key == key:
            self._last_key = next(iter(self._slots.keys()), None)

    def _spawn_client(self, project: Path) -> tuple[PiRpcClient, Dict[str, Any]]:
        det = detect_pi()
        if not det.available or not det.path:
            self._last_error = det.error or "pi_not_found"
            raise AiUnavailable("pi_not_found", det.error or "pi_not_found")

        try:
            skill = self._resolve_skill()
        except AiUnavailable as e:
            self._last_error = str(e)
            raise
        ext = self._resolve_extension(skill)
        extras = self._resolve_extra_skills(skill)
        argv = self.build_argv(project, skill, ext, det.path, extra_skills=extras)
        env = os.environ.copy()
        env["MENTOR_SKILL_DIR"] = str(skill)
        env["PYTHONUTF8"] = "1"
        if extras:
            env["MENTOR_EXTRA_SKILLS"] = os.pathsep.join(str(p) for p in extras)

        try:
            if self._client_factory is not None:
                client = self._client_factory(argv, str(project), env)
            else:
                client = PiRpcClient.spawn(argv, cwd=str(project), env=env)
        except Exception as e:
            self._last_error = str(e)
            raise AiUnavailable("spawn_failed", str(e)) from e

        meta = {
            "skill_dir": str(skill),
            "extra_skills": [str(p) for p in extras],
            "extension": str(ext),
            "pi_path": det.path,
            "pi_version": det.version,
            "argv": argv,
        }
        return client, meta

    def _ensure(
        self,
        *,
        key: str,
        project: Path,
        mentor_path: Optional[Path],
    ) -> Dict[str, Any]:
        with self._lock:
            existing = self._slots.get(key)
            if existing is not None and existing.client is not None:
                existing.touch()
                self._last_key = key
                self._last_error = ""
                return {
                    "ok": True,
                    "reused": True,
                    "project_path": str(existing.project),
                    "mentor_path": str(existing.mentor_path) if existing.mentor_path else None,
                    "skill_dir": str(self._resolve_skill()),
                    "session_key": key,
                    "session_count": len(self._slots),
                }

            # Need a new slot — do not tear down other paths.
            self._evict_idle_unlocked(need=1)

            client, meta = self._spawn_client(project)
            slot = _SessionSlot(
                key=key,
                project=project,
                mentor_path=mentor_path,
                client=client,
                busy=False,
                last_error="",
            )
            slot.touch()
            self._slots[key] = slot
            self._last_key = key
            self._last_error = ""
            return {
                "ok": True,
                "reused": False,
                "project_path": str(project),
                "mentor_path": str(mentor_path) if mentor_path else None,
                "skill_dir": meta["skill_dir"],
                "extra_skills": meta["extra_skills"],
                "extension": meta["extension"],
                "pi_path": meta["pi_path"],
                "pi_version": meta["pi_version"],
                "argv": meta["argv"],
                "session_key": key,
                "session_count": len(self._slots),
            }

    def get_client(self, mentor_path: Optional[PathLike] = None) -> PiRpcClient:
        """
        Return Pi client for a mentor path, or the last-ensured session if path omitted.
        """
        with self._lock:
            slot: Optional[_SessionSlot] = None
            if mentor_path is not None:
                slot = self._slots.get(_norm_mentor_key(mentor_path))
            elif self._last_key:
                slot = self._slots.get(self._last_key)
            if slot is None:
                raise AiUnavailable("no_session", "call ensure first")
            slot.touch()
            return slot.client

    def status(self) -> Dict[str, Any]:
        det = detect_pi()
        skill_err = None
        skill_path = None
        extra_skills: List[str] = []
        try:
            primary = self._resolve_skill()
            skill_path = str(primary)
            extra_skills = [str(p) for p in self._resolve_extra_skills(primary)]
        except Exception as e:
            skill_err = str(e)
        skill_names = ["fix-mentor"] if skill_path else []
        for p in extra_skills:
            name = Path(p).name
            if name and name not in skill_names:
                skill_names.append(name)
        with self._lock:
            sessions = []
            for slot in self._slots.values():
                sessions.append(
                    {
                        "key": slot.key,
                        "mentor_path": str(slot.mentor_path) if slot.mentor_path else None,
                        "project_path": str(slot.project),
                        "busy": bool(slot.busy),
                        "last_used": slot.last_used,
                    }
                )
            busy_n = sum(1 for s in self._slots.values() if s.busy)
            last = self._slots.get(self._last_key) if self._last_key else None
            active_mentors = [
                str(s.mentor_path)
                for s in self._slots.values()
                if s.mentor_path is not None
            ]
            return {
                "pi": {
                    "available": det.available,
                    "path": det.path,
                    "version": det.version,
                    "error": det.error,
                },
                "skill_dir": skill_path,
                "skill_error": skill_err,
                "extra_skills": extra_skills,
                "skills": skill_names,
                # Compat: last-focused mentor/project
                "active_mentor": str(last.mentor_path) if last and last.mentor_path else (
                    active_mentors[0] if active_mentors else None
                ),
                "active_project": str(last.project) if last else (
                    str(next(iter(self._slots.values())).project) if self._slots else None
                ),
                "active_mentors": active_mentors,
                "sessions": sessions,
                "session_count": len(self._slots),
                "max_sessions": self._max_sessions,
                "max_concurrent": max_concurrent_cap(),
                "busy": busy_n > 0,
                "busy_count": busy_n,
                "has_session": len(self._slots) > 0,
                "last_error": self._last_error or "",
            }

    def set_busy(self, busy: bool, mentor_path: Optional[PathLike] = None) -> None:
        """Mark a session busy. If path omitted, use last-ensured slot (compat)."""
        with self._lock:
            slot: Optional[_SessionSlot] = None
            if mentor_path is not None:
                slot = self._slots.get(_norm_mentor_key(mentor_path))
            elif self._last_key:
                slot = self._slots.get(self._last_key)
            if slot is None:
                return
            slot.busy = bool(busy)
            slot.touch()

    def shutdown(self, mentor_path: Optional[PathLike] = None) -> None:
        """Shutdown one mentor session, or all if path omitted."""
        with self._lock:
            if mentor_path is None:
                keys = list(self._slots.keys())
                for k in keys:
                    self._close_slot_unlocked(k)
                self._last_key = None
                self._last_error = ""
                return
            self._close_slot_unlocked(_norm_mentor_key(mentor_path))


_MANAGER: Optional[AiSessionManager] = None
_MANAGER_LOCK = threading.Lock()


def get_manager() -> AiSessionManager:
    global _MANAGER
    with _MANAGER_LOCK:
        if _MANAGER is None:
            _MANAGER = AiSessionManager()
        return _MANAGER


def reset_manager_for_tests() -> None:
    """Test helper: drop singleton so next get_manager() is fresh."""
    global _MANAGER
    with _MANAGER_LOCK:
        if _MANAGER is not None:
            try:
                _MANAGER.shutdown()
            except Exception:
                pass
        _MANAGER = None
