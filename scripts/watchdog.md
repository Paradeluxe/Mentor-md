# Mentor Watchdog

每 30 分钟跟你 (The Machine) 说 "continue" — 但**只在有未完成 todo 或未 commit 改动时才说**, 否则安静 (per `hermes cron --no-agent` 的 silent 设计).

## 设置 (已自动完成)

```bash
# 安装脚本到 hermes scripts dir
mkdir -p "$APPDATA/hermes/scripts"
cp scripts/watchdog.py "$APPDATA/hermes/scripts/watchdog.py"

# 创建 cron job (no-agent, 每 30 分钟)
hermes cron create --name "Mentor watchdog" --deliver origin --no-agent --script watchdog.py "*/30 * * * *"
```

当前 cron job ID: `565e97f1dfba` (Next run: 2026-07-11 09:30 +08:00).

## 它做什么

1. 读 `~/.hermes/todos.json` 或 `$APPDATA/hermes/todos.json` (Hermes todo tool 持久化文件)
2. 跑 `git status --short` 在 `E:/hermes_playground/Mentor`
3. **有** pending/in_progress todo **或** 未 commit 文件 → stdout 输出 "continue\nPending todo: ...\nUncommitted: ..." → 投递到你 (origin)
4. **无** 任何东西 → stdout "" → silent, 不打扰

## 手动跑

```bash
# 单次跑 (看输出)
python scripts/watchdog.py

# 触发 cron job 立即跑
hermes cron run 565e97f1dfba

# 检查状态
hermes cron status
```

## 暂停 / 恢复 / 删除

```bash
hermes cron pause 565e97f1dfba   # 暂停 (不删)
hermes cron resume 565e97f1dfba  # 恢复
hermes cron remove 565e97f1dfba  # 永久删
```

## 改 repo / 时间表

```bash
hermes cron edit 565e97f1dfba schedule "*/15 * * * *"   # 改 15 分钟
hermes cron edit 565e97f1dfba --repos E:/path/other ... # 改 repo
```