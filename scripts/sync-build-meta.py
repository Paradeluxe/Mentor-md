#!/usr/bin/env python3
"""Align index.html meta build + optional cache-bust with CHANGELOG top version."""
from __future__ import annotations
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bump", action="store_true", help="also +1 all ?v=N")
    args = ap.parse_args()
    idx = ROOT / "index.html"
    cl = ROOT / "CHANGELOG.md"
    t = idx.read_text(encoding="utf-8")
    ver = None
    if cl.exists():
        m = re.search(r"^## (v\d+\.\d+\.\d+)", cl.read_text(encoding="utf-8"), re.M)
        if m:
            ver = m.group(1)
    n = None
    if args.bump:
        nums = [int(x) for x in re.findall(r"(?:app\.bundle\.js|app\.js|styles\.css)\?v=(\d+)", t)]
        n = (max(nums) if nums else 0) + 1
        t = re.sub(r"(app\.bundle\.js)\?v=\d+", rf"\1?v={n}", t)
        t = re.sub(r"(?<!bundle\.)(app\.js)\?v=\d+", rf"\1?v={n}", t)
        t = re.sub(r"(styles\.css)\?v=\d+", rf"\1?v={n}", t)
    else:
        m = re.search(r"app\.bundle\.js\?v=(\d+)", t)
        n = int(m.group(1)) if m else None
    if ver:
        note = f"{ver}" + (f" cache-bust v={n}" if n is not None else "")
        t = re.sub(
            r'(<meta name="build" content=")[^"]*(")',
            rf"\g<1>{note}\2",
            t,
            count=1,
        )
    idx.write_text(t, encoding="utf-8")
    print({"ver": ver, "v": n})

if __name__ == "__main__":
    main()
