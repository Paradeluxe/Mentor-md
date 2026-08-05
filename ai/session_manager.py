"""One open .mentor file → one long-lived Pi RPC process."""
from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .path_policy import AiPathError, resolve_skill_dir
from .pi_detect import detect_pi
from .pi_rpc import PiRpcClient

PathLike = Union[str, Path]

# Injected via --append-system-prompt so Pi default tool guidelines stay intact.
MENTOR_AI_REVIEWER_IDENTITY = (
    "You are AI Reviewer — the annotation agent for Mentor (.mentor packages).\n"
    "- Product: Mentor. Skill: fix-mentor. Author name in replies: AI Reviewer.\n"
    "- Never claim to be Claude, ChatGPT, Gemini, GPT, Hermes, The Machine, or any other brand.\n"
    "- When asked which model you are: report the actual provider and model id for this "
    "Pi session if known; if unknown, say it is configured in Pi settings "
    "(~/.pi/agent/settings.json) and do not invent a brand name.\n"
    "- Job: read .mentor via scripts/mentor_io.py → process unanswered @AI/@REVIEW per skill "
    "→ write_mentor(block_on_unhealthy=True) → short factual replies.\n"
    "- Prefer python scripts/mentor_io.py and bash; do not invent TipTap document.html.\n"
    "- Be concise. Match the user's language."
)


class AiUnavailable(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


class AiSessionManager:
    def __init__(
        self,
        *,
        skill_dir: Optional[Path] = None,
        extension_path: Optional[Path] = None,
        client_factory=None,
    ) -> None:
        self._lock = threading.RLock()
        self._mentor_path: Optional[Path] = None
        self._project: Optional[Path] = None  # parent dir (cwd)
        self._client: Optional[PiRpcClient] = None
        self._skill_dir = Path(skill_dir).resolve() if skill_dir is not None else None
        self._extension_path = (
            Path(extension_path).resolve() if extension_path is not None else None
        )
        self._client_factory = client_factory  # (argv, cwd, env) -> PiRpcClient
        self._busy = False
        self._last_error = ""

    @property
    def mentor_path(self) -> Optional[Path]:
        return self._mentor_path

    @property
    def project_path(self) -> Optional[Path]:
        return self._project

    @property
    def busy(self) -> bool:
        return self._busy

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
        for name in ("mentor-sandbox.ts", "mentor-sandbox.js", "project-sandbox.ts", "project-sandbox.js"):
            cand = skill / "extensions" / name
            if cand.is_file():
                return cand.resolve()
        raise AiUnavailable("extension_missing", "mentor-sandbox extension not found")

    def build_argv(self, project: Path, skill: Path, ext: Path, pi_path: str) -> List[str]:
        return [
            pi_path,
            "--mode",
            "rpc",
            "--no-extensions",
            "--extension",
            str(ext),
            "--skill",
            str(skill),
            "--session-dir",
            str(project.resolve()),
            "--append-system-prompt",
            MENTOR_AI_REVIEWER_IDENTITY,
        ]

    def ensure_for_mentor(self, mentor_path: PathLike) -> Dict[str, Any]:
        mp = Path(mentor_path).expanduser().resolve()
        if not str(mp).lower().endswith(".mentor"):
            raise AiPathError(f"not a .mentor file: {mp}")
        if not mp.is_file():
            raise AiPathError(f"not found: {mp}")
        project = mp.parent.resolve()
        return self._ensure(project=project, mentor_path=mp)

    def ensure(self, project_path: PathLike) -> Dict[str, Any]:
        """Ensure session for a directory (tests / generic)."""
        project = Path(project_path).resolve()
        if not project.is_dir():
            raise AiPathError(f"not a directory: {project}")
        return self._ensure(project=project, mentor_path=None)

    def _ensure(self, *, project: Path, mentor_path: Optional[Path]) -> Dict[str, Any]:
        with self._lock:
            same_file = (
                mentor_path is not None
                and self._mentor_path is not None
                and self._mentor_path == mentor_path
                and self._client is not None
            )
            same_dir_only = (
                mentor_path is None
                and self._client is not None
                and self._project == project
            )
            if same_file or same_dir_only:
                return {
                    "ok": True,
                    "reused": True,
                    "project_path": str(project),
                    "mentor_path": str(self._mentor_path) if self._mentor_path else None,
                    "skill_dir": str(self._resolve_skill()),
                }

            self._shutdown_unlocked()

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
            argv = self.build_argv(project, skill, ext, det.path)
            env = os.environ.copy()
            env["MENTOR_SKILL_DIR"] = str(skill)
            env["PYTHONUTF8"] = "1"

            try:
                if self._client_factory is not None:
                    client = self._client_factory(argv, str(project), env)
                else:
                    client = PiRpcClient.spawn(argv, cwd=str(project), env=env)
            except Exception as e:
                self._last_error = str(e)
                raise AiUnavailable("spawn_failed", str(e)) from e

            self._client = client
            self._project = project
            self._mentor_path = mentor_path
            self._last_error = ""
            return {
                "ok": True,
                "reused": False,
                "project_path": str(project),
                "mentor_path": str(mentor_path) if mentor_path else None,
                "skill_dir": str(skill),
                "extension": str(ext),
                "pi_path": det.path,
                "pi_version": det.version,
                "argv": argv,
            }

    def get_client(self) -> PiRpcClient:
        with self._lock:
            if self._client is None:
                raise AiUnavailable("no_session", "call ensure first")
            return self._client

    def status(self) -> Dict[str, Any]:
        det = detect_pi()
        skill_err = None
        skill_path = None
        try:
            skill_path = str(self._resolve_skill())
        except Exception as e:
            skill_err = str(e)
        with self._lock:
            return {
                "pi": {
                    "available": det.available,
                    "path": det.path,
                    "version": det.version,
                    "error": det.error,
                },
                "skill_dir": skill_path,
                "skill_error": skill_err,
                "active_mentor": str(self._mentor_path) if self._mentor_path else None,
                "active_project": str(self._project) if self._project else None,
                "busy": self._busy,
                "has_session": self._client is not None,
                "last_error": self._last_error or "",
            }

    def set_busy(self, busy: bool) -> None:
        with self._lock:
            self._busy = busy

    def shutdown(self) -> None:
        with self._lock:
            self._shutdown_unlocked()

    def _shutdown_unlocked(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
        self._client = None
        self._project = None
        self._mentor_path = None
        self._busy = False


_MANAGER: Optional[AiSessionManager] = None
_MANAGER_LOCK = threading.Lock()


def get_manager() -> AiSessionManager:
    global _MANAGER
    with _MANAGER_LOCK:
        if _MANAGER is None:
            _MANAGER = AiSessionManager()
        return _MANAGER
