#!/usr/bin/env python3
"""
Mentor watchdog — 投递 "continue" 提醒到当前 Hermes session.

用法 (Hermes cron, 推荐):
  hermes cron create --name "Mentor watchdog" --deliver origin --no-agent --script watchdog.py '*/30 * * * *'

有 pending todo 或未 commit 改动 → 输出 "continue ..." (送达)
一切正常 → 输出 "" (silent, 不打扰)
"""
import json
import os
import subprocess
import sys
from pathlib import Path


TODO_CANDIDATES = [
    Path.home() / '.hermes' / 'todos.json',
    Path(os.environ.get('APPDATA', '')) / 'hermes' / 'todos.json',
]
DEFAULT_REPOS = [Path('E:/hermes_playground/Mentor')]


def find_todo_file():
    for p in TODO_CANDIDATES:
        if p.exists():
            return p
    return None


def load_todos():
    p = find_todo_file()
    if not p:
        return None
    try:
        return json.loads(p.read_text(encoding='utf-8')).get('todos', [])
    except Exception:
        return None


def pending(todos):
    if todos is None:
        return None
    return [t for t in todos if t.get('status') in ('pending', 'in_progress')]


def git_status(repo):
    try:
        r = subprocess.run(['git', 'status', '--short'], cwd=str(repo), capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return None
        return [l.strip() for l in r.stdout.splitlines() if l.strip()]
    except Exception:
        return None


def build_wake_message(repos):
    todos = load_todos()
    pend = pending(todos)
    dirty = []
    for repo in repos:
        d = git_status(repo)
        if d:
            dirty.extend([f'{repo.name}:{f}' for f in d[:5]])
    if not pend and not dirty:
        return ''
    lines = ['continue']
    if pend:
        lines.append('Pending todo:')
        for t in pend[:5]:
            mark = '⏳' if t['status'] == 'in_progress' else '•'
            lines.append(f'  {mark} {t["content"]}')
    if dirty:
        lines.append('Uncommitted:')
        for f in dirty[:5]:
            lines.append(f'  ⚠ {f}')
    return '\n'.join(lines)


def main():
    msg = build_wake_message(DEFAULT_REPOS)
    sys.stdout.write(msg)
    sys.stdout.flush()


if __name__ == '__main__':
    main()