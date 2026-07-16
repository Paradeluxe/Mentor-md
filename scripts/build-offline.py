#!/usr/bin/env python3
"""Build offline Mentor assets: esbuild app.bundle.js + local KaTeX + fonts CSS.

Usage (repo root):
  python scripts/build-offline.py
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def build_bundle() -> None:
    esbuild = ROOT / "node_modules" / ".bin" / "esbuild.cmd"
    if not esbuild.is_file():
        esbuild = ROOT / "node_modules" / ".bin" / "esbuild"
    if not esbuild.is_file():
        # npx fallback
        run(
            [
                "npx",
                "esbuild",
                "app.js",
                "--bundle",
                "--format=esm",
                "--platform=browser",
                "--outfile=app.bundle.js",
                "--alias:punycode=punycode",
                "--log-level=warning",
            ]
        )
        return
    run(
        [
            str(esbuild),
            "app.js",
            "--bundle",
            "--format=esm",
            "--platform=browser",
            "--outfile=app.bundle.js",
            "--alias:punycode=punycode",
            "--log-level=warning",
        ]
    )
    size = (ROOT / "app.bundle.js").stat().st_size
    print(f"app.bundle.js {size / 1e6:.2f} MB")


def copy_katex() -> None:
    src = ROOT / "node_modules" / "katex" / "dist"
    if not src.is_dir():
        print("warn: katex not in node_modules — skip")
        return
    dst = ROOT / "vendor" / "katex"
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src / "katex.min.css", dst / "katex.min.css")
    fonts_src = src / "fonts"
    fonts_dst = dst / "fonts"
    if fonts_dst.exists():
        shutil.rmtree(fonts_dst)
    shutil.copytree(fonts_src, fonts_dst)
    # katex.min.css uses url(fonts/...) — already relative, OK under vendor/katex/
    print(f"vendor/katex ready ({len(list(fonts_dst.glob('*')))} font files)")


def write_fonts_css() -> None:
    """Local font CSS: system stack first (true offline), Inter optional if present."""
    dst = ROOT / "vendor" / "fonts"
    dst.mkdir(parents=True, exist_ok=True)
    css = """/* Mentor offline fonts — system stack; no network required */
:root {
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
}
body, button, input, textarea, select {
  font-family: var(--font-sans);
}
code, pre, kbd, .mono, #status, .comment-time, .file-list-name {
  font-family: var(--font-mono);
}
"""
    (dst / "local-fonts.css").write_text(css, encoding="utf-8")
    print("vendor/fonts/local-fonts.css")


def main() -> int:
    build_bundle()
    copy_katex()
    write_fonts_css()
    print("OK offline assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
