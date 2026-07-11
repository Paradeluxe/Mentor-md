# Mentor Watchdog

每 30 分钟提醒你 pending todo + 未 commit 改动。

## 用法

```bash
# 单次跑 (适合 cron / Task Scheduler)
python3 scripts/watchdog.py

# 前台循环 (Ctrl-C 停)
python3 scripts/watchdog.py --loop

# 自定义间隔
python3 scripts/watchdog.py --loop --interval 15

# 自定义要 check 的 git repo
python3 scripts/watchdog.py --repos E:/hermes_playground/Mentor /c/code/myapp
```

## 它做什么

1. 读 `~/.hermes/todos.json` (The Machine todo 列表)
2. 列 `pending` + `in_progress` todo
3. 对每个 `--repos` 跑 `git status --short`, 列未 commit 改动
4. 调 `hermes notify --message ...` 推送
   - 若 `hermes` 不在 PATH, fallback 写 `~/.hermes/watchdog.log`

## 设置 Windows Task Scheduler (每 30 分钟)

最快: 在 cmd / PowerShell 里跑一次:

```cmd
schtasks /create /tn "MentorWatchdog" /tr "python3 E:\hermes_playground\Mentor\scripts\watchdog.py" /sc minute /mo 30
```

或写一个 `.bat` 然后用 Task Scheduler GUI:
```bat
@echo off
python3 E:\hermes_playground\Mentor\scripts\watchdog.py
```

## 替代: 前台 daemon

如果你有终端一直开着, 直接:

```bash
python3 E:/hermes_playground/Mentor/scripts/watchdog.py --loop
```

放后台: `start /b python3 ...\watchdog.py --loop` (Windows) 或 `nohup ... &` (bash)