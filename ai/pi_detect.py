"""Locate required `pi` coding-agent binary for Mentor AI.

Missing Pi → structured error for routes/doctor; editor still boots.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PiDetectResult:
    available: bool
    path: Optional[str]
    version: Optional[str]
    error: Optional[str] = None


_VER_RE = re.compile(r"(\d+\.\d+\.\d+(?:[-+][\w.]+)?)")


def detect_pi(timeout: float = 5.0) -> PiDetectResult:
    """Return whether `pi` is on PATH and its version string if parseable."""
    path = shutil.which("pi")
    if not path:
        # Windows npm shims
        path = shutil.which("pi.cmd") or shutil.which("pi.exe")
    if not path:
        return PiDetectResult(available=False, path=None, version=None, error="pi_not_found")
    try:
        cp = subprocess.run(
            [path, "--version"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        return PiDetectResult(
            available=False,
            path=path,
            version=None,
            error=str(e) or type(e).__name__,
        )
    out = (cp.stdout or "") + "\n" + (cp.stderr or "")
    m = _VER_RE.search(out)
    version = m.group(1) if m else (out.strip().splitlines()[0].strip() if out.strip() else None)
    if cp.returncode != 0 and not version:
        return PiDetectResult(
            available=False,
            path=path,
            version=None,
            error=(cp.stderr or cp.stdout or f"exit {cp.returncode}").strip() or "version_failed",
        )
    return PiDetectResult(available=True, path=path, version=version, error=None)
