#!/usr/bin/env bash
# Bump ?v=N cache-bust + meta build in index.html
# Install: ln -sf scripts/bump-cache-version.sh .git/hooks/post-commit
# Also: python scripts/sync-build-meta.py  (called here)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

INDEX="index.html"

# Prefer app.bundle.js (offline), fallback app.js; also styles.css
CURRENT=$(grep -oE '(app\.bundle\.js|app\.js|styles\.css)\?v=[0-9]+' "$INDEX" | grep -oE '[0-9]+' | sort -n | tail -1 || true)
if [ -z "${CURRENT:-}" ]; then
  CURRENT=0
fi
NEXT=$((CURRENT + 1))

# bump all known cache-busted assets to NEXT (keep in lockstep)
python - <<PY
from pathlib import Path
import re
idx = Path("index.html")
t = idx.read_text(encoding="utf-8")
n = $NEXT
t2 = re.sub(r"(app\.bundle\.js)\?v=\d+", rf"\1?v={n}", t)
t2 = re.sub(r"(?<!bundle\.)(app\.js)\?v=\d+", rf"\1?v={n}", t2)
t2 = re.sub(r"(styles\.css)\?v=\d+", rf"\1?v={n}", t2)
# meta build: if CHANGELOG has ## vX.Y.Z take it
cl = Path("CHANGELOG.md")
ver = None
if cl.exists():
    m = re.search(r"^## (v[0-9]+\.[0-9]+\.[0-9]+)", cl.read_text(encoding="utf-8"), re.M)
    if m:
        ver = m.group(1)
if ver:
    t2 = re.sub(
        r'(<meta name="build" content=")[^"]*(")',
        rf'\g<1>{ver} cache-bust v={n}\2',
        t2,
        count=1,
    )
idx.write_text(t2, encoding="utf-8")
print(f"cache-bust -> {n}" + (f" meta {ver}" if ver else ""))
PY

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git add "$INDEX" || true
  if ! git diff --cached --quiet -- "$INDEX" 2>/dev/null; then
    git commit -m "chore: bump cache-bust to ?v=$NEXT" || true
    echo "[bump-cache-version] index.html cache-bust bumped to v=$NEXT"
  fi
else
  echo "[bump-cache-version] index.html updated to v=$NEXT (no git commit)"
fi
