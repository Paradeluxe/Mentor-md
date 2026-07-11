#!/usr/bin/env python3
"""
Mentor watchdog — 每 30 分钟提醒用户 continue, 列出 pending todo.
用法:
  python3 watchdog.py                  # 跑一次 (供 cron / systemd 调)
  python3 watchdog.py --loop           # 前台循环, 每 30 分钟跑一次
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone

HERMES_HOME = Path.home() / '.hermes'
TODO_PATH = HERMES_HOME / 'todos.json'
MENTOR_TODO_MARKER = Path('E:/hermes_playground/Mentor/CHANGELOG.md')  # 用 mentor 仓的 changelog 探测 scope
DEFAULT_INTERVAL_MIN = 30


def load_todos():
    if not TODO_PATH.exists():
        return []
    try:
        data = json.loads(TODO_PATH.read_text(encoding='utf-8'))
        return data.get('todos', [])
    except Exception as e:
        return [{'_error': f'read failed: {e}'}]


def pending(todos):
    out = []
    for t in todos:
        if t.get('status') in ('pending', 'in_progress'):
            out.append(t)
    return out


def git_status(repo):
    """返回 (clean?, pending_files list). None = 不是 git repo."""
    try:
        r = subprocess.run(['git', 'status', '--short'], cwd=repo, capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return None
        files = [l.strip() for l in r.stdout.splitlines() if l.strip()]
        return (len(files) == 0, files)
    except Exception:
        return None


def notify_hermes(message):
    """优先 hermes CLI, fallback 写到 ~/.hermes/watchdog.log."""
    try:
        subprocess.run(['hermes', 'notify', '--message', message], capture_output=True, timeout=10)
        return True
    except Exception:
        log = HERMES_HOME / 'watchdog.log'
        with log.open('a', encoding='utf-8') as f:
            f.write(f'[{datetime.now(timezone.utc).isoformat()}] {message}\n')
        return False


def build_report(todos, repos=('E:/hermes_playground/Mentor',)):
    pend = pending(todos)
    lines = []
    lines.append(f'Watchdog tick @ {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    if not pend:
        lines.append('  ✓ 所有 todo 已 completed/cancelled')
    else:
        lines.append(f'  {len(pend)} pending / in_progress:')
        for t in pend:
            mark = '⏳' if t['status'] == 'in_progress' else '•'
            lines.append(f'    {mark} [{t["status"]:11}] {t["content"]}')
    for repo in repos:
        st = git_status(repo)
        if st is None:
            continue
        clean, files = st
        if not clean:
            lines.append(f'  ⚠ {repo}: 未 commit改动 ({len(files)} 个文件):')
            for f in files[:5]:
                lines.append(f'      {f}')
            if len(files) > 5:
                lines.append(f'      ... +{len(files) - 5} more')
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--loop', action='store_true', help='前台循环 (每 30 分钟跑一次)')
    ap.add_argument('--interval', type=int, default=DEFAULT_INTERVAL_MIN, help='loop 间隔分钟')
    ap.add_argument('--repos', nargs='*', default=['E:/hermes_playground/Mentor'], help='要 check 的 git repo')
    args = ap.parse_args()

    if args.loop:
        import time
        print(f'Watchdog loop mode, interval={args.interval}min, Ctrl-C to stop')
        while True:
            try:
                todos = load_todos()
                report = build_report(todos, args.repos)
                print(report)
                notify_hermes(report)
            except Exception as e:
                print(f'tick error: {e}')
            time.sleep(args.interval * 60)
    else:
        todos = load_todos()
        report = build_report(todos, args.repos)
        print(report)
        notify_hermes(report)


if __name__ == '__main__':
    main()