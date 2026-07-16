#!/usr/bin/env python3
"""
Pack Mentor Windows portable zip for GitHub Releases.

Usage (from repo root):
  python scripts/pack-release.py
  python scripts/pack-release.py --version v1.43.35
  python scripts/pack-release.py --out dist

Creates: dist/Mentor-<version>-win.zip
"""
from __future__ import annotations

import argparse
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Files / globs relative to ROOT (portable runtime only)
INCLUDE = [
    "index.html",
    "app.js",
    "app.bundle.js",
    "styles.css",
    "icons.js",
    "mentor.cmd",
    "mentor-server.py",
    "PORT",
    "安装.cmd",
    "install.cmd",
    "install-file-association.cmd",
    "README-用户.md",
    "LICENSE",
    "assets/mentor.ico",
    "assets/mentor-32.png",
    "workers/jszip.min.js",
    "workers/zip-worker.js",
    "scripts/register-mentor-assoc.ps1",
    "vendor/fonts/local-fonts.css",
    "vendor/katex/katex.min.css",
]

INCLUDE_TREES = [
    "vendor/katex/fonts",
]


# Optional if present
OPTIONAL = [
    "screenshot.jpg",
    "README.md",
]


def detect_version(root: Path) -> str:
    cl = root / "CHANGELOG.md"
    if cl.is_file():
        m = re.search(r"^##\s+(v?[\d.]+)\b", cl.read_text(encoding="utf-8", errors="replace"), re.M)
        if m:
            v = m.group(1)
            return v if v.startswith("v") else f"v{v}"
    meta = (root / "index.html").read_text(encoding="utf-8", errors="replace")
    m = re.search(r'content="(v[\d.]+)', meta)
    if m:
        return m.group(1)
    return datetime.now(timezone.utc).strftime("v%Y%m%d")


def collect(root: Path) -> list[tuple[Path, str]]:
    """Return list of (abs_path, arcname under Mentor/)."""
    out: list[tuple[Path, str]] = []
    for rel in INCLUDE + OPTIONAL:
        p = root / rel
        if not p.is_file():
            if rel in INCLUDE:
                raise FileNotFoundError(f"required missing: {rel}")
            continue
        out.append((p, f"Mentor/{rel.replace(chr(92), '/')}"))
    for tree in INCLUDE_TREES:
        base = root / tree
        if not base.is_dir():
            raise FileNotFoundError(f"required tree missing: {tree}")
        for f in base.rglob("*"):
            if f.is_file():
                rel = f.relative_to(root).as_posix()
                out.append((f, f"Mentor/{rel}"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=None, help="e.g. v1.43.35")
    ap.add_argument("--out", default="dist", help="output directory")
    args = ap.parse_args()

    version = args.version or detect_version(ROOT)
    out_dir = (ROOT / args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / f"Mentor-{version}-win.zip"

    files = collect(ROOT)
    # stamp
    stamp = (
        f"Mentor {version}\n"
        f"built: {datetime.now(timezone.utc).isoformat()}\n"
        f"files: {len(files)}\n"
    )
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for abs_p, arc in files:
            zf.write(abs_p, arcname=arc)
        zf.writestr("Mentor/VERSION.txt", stamp)

    size = zip_path.stat().st_size
    print(f"OK {zip_path}")
    print(f"   version={version}  files={len(files)}  size={size:,} bytes")
    for _, arc in files:
        print(f"   + {arc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
