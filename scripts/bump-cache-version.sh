#!/usr/bin/env bash
# Bump ?v=N cache-bust numbers in index.html after each commit
# Install: ln -sf scripts/bump-cache-version.sh .git/hooks/post-commit

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

INDEX="index.html"

# Read current highest ?v=N for app.js?v=N or styles.css?v=N in index.html
CURRENT=$(grep -oE '(app\.js|styles\.css)\?v=[0-9]+' "$INDEX" | grep -oE '[0-9]+' | sort -n | tail -1)
if [ -z "$CURRENT" ]; then
  CURRENT=0
fi
NEXT=$((CURRENT + 1))

# Single sed pass: replace each ?v=N with ?v=(NEXT) for app.js and styles.css
sed -i.bak -E "s/(app\\.js|styles\\.css)\\?v=$CURRENT/\\1?v=$NEXT/g" "$INDEX"
rm -f "$INDEX.bak"

git -C "$REPO_ROOT" add "$INDEX"
# Only commit if index.html actually changed
if ! git -C "$REPO_ROOT" diff --cached --quiet -- "$INDEX"; then
  git -C "$REPO_ROOT" commit -m "chore: bump cache-bust to ?v=$NEXT"
  echo "[bump-cache-version] index.html cache-bust bumped to v=$NEXT"
fi
