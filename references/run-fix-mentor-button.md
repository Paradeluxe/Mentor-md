# AI 处理 / run-fix-mentor

Shipped: Mentor **v1.49.8** / `?v=243`.

## 无向后兼容回落（刻意）

| 旧行为 | 现在 |
|--------|------|
| warm 挂了 → 静默 cold `hermes chat -q` | **直接 503**，底栏 Hermes 芯片红 |
| 无路径 → zip 暂存再跑 | **直接失败**，提示用 mentor.cmd 打开 |
| packageBase64 / application/zip stage | **400 staged-not-allowed** |

唯一主路径：

1. 底栏 **Hermes 已就绪**（warm worker :8788）
2. 真实磁盘 path（pending-open / 双击 / mentor.cmd）
3. 脏则 `writeCurrentToDisk` 写回
4. `POST /run-fix-mentor` JSON `{path}` → worker `/run`

高级：仅当设置了 `MENTOR_FIX_MENTOR_CMD` 才走自定义命令（仍不冷启动 hermes -q）。
