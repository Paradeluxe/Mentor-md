"""Locate required `pi` coding-agent binary for Mentor AI.

Missing Pi → structured error for routes/doctor; editor still boots.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PiDetectResult:
    available: bool
    path: Optional[str]
    version: Optional[str]
    error: Optional[str] = None


_VER_RE = re.compile(r"(\d+\.\d+\.\d+(?:[-+][\w.]+)?)")

# Cache — /session and /ai-connection hit this every few seconds; spawning pi --version
# each time costs ~2s and piles up under concurrent probes.
_CACHE_TTL_S = 45.0
_cache_at = 0.0
_cache_val: Optional[PiDetectResult] = None


def detect_pi(timeout: float = 5.0, *, force: bool = False) -> PiDetectResult:
    """Return whether `pi` is on PATH and its version string if parseable."""
    global _cache_at, _cache_val
    now = time.monotonic()
    if (
        not force
        and _cache_val is not None
        and (now - _cache_at) < _CACHE_TTL_S
    ):
        return _cache_val

    path = shutil.which("pi")
    if not path:
        # Windows npm shims
        path = shutil.which("pi.cmd") or shutil.which("pi.exe")
    if not path:
        res = PiDetectResult(available=False, path=None, version=None, error="pi_not_found")
        _cache_at, _cache_val = now, res
        return res
    try:
        cp = subprocess.run(
            [path, "--version"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        res = PiDetectResult(
            available=False,
            path=path,
            version=None,
            error=str(e) or type(e).__name__,
        )
        _cache_at, _cache_val = now, res
        return res
    out = (cp.stdout or "") + "\n" + (cp.stderr or "")
    m = _VER_RE.search(out)
    version = m.group(1) if m else (out.strip().splitlines()[0].strip() if out.strip() else None)
    if cp.returncode != 0 and not version:
        res = PiDetectResult(
            available=False,
            path=path,
            version=None,
            error=(cp.stderr or cp.stdout or f"exit {cp.returncode}").strip() or "version_failed",
        )
        _cache_at, _cache_val = now, res
        return res
    res = PiDetectResult(available=True, path=path, version=version, error=None)
    _cache_at, _cache_val = now, res
    return res


def clear_detect_cache() -> None:
    """Test helper / after install Pi."""
    global _cache_at, _cache_val
    _cache_at = 0.0
    _cache_val = None
