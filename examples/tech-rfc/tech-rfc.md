# RFC-001: 引入增量构建缓存

| | |
|---|---|
| **Status** | Proposed |
| **Author** | 张三 |
| **Date** | 2026-06-15 |
| **Reviewers** | @李四 @王五 @赵六 |

## Summary

引入基于文件哈希的增量构建缓存系统，目标将 CI 构建时间从平均 12 分钟降至 3 分钟。

## Motivation

当前每次 PR 触发完整构建，平均耗时 12 分钟，最长可达 25 分钟。这导致：

1. 开发者等待反馈时间长，PR 合并周期拉长
2. CI runner 资源浪费，每月成本 ~$8K
3. 阻碍了"小步快跑"的工作流

调研：80% 的构建产物可以从前次构建复用（依赖未变），但当前系统每次都重新生成。

## Detailed Design

### 缓存键

```
cache_key = sha256(
  toolchain_version ||
  file_content_hash ||
  build_flags ||
  environment_fingerprint
)
```

任何输入变化 → 新 cache_key → 缓存失效。

### 缓存存储

使用 S3 兼容对象存储：

- **Bucket**: `s3://build-cache-prod/`
- **Key 格式**: `{repo}/{branch}/{cache_key}.tar.zst`
- **TTL**: 30 天（自动清理）

### 命中流程

```
[1] 计算 cache_key
[2] S3 HEAD request
    ├─ 200 → 下载缓存、解压到 build/、跳过构建步骤 → 输出"cache hit"
    └─ 404 → 正常构建、上传产物到 S3
```

## Trade-offs

### 优点

- ✅ 预期节省 75% 构建时间（12min → 3min）
- ✅ 实施成本低（~2 人周）
- ✅ 与现有 CI runner 无侵入集成

### 缺点

- ⚠️ 首次构建（cold cache）无收益，但 warm 后稳定
- ⚠️ cache_key 碰撞概率（虽然 sha256 极低）
- ⚠️ S3 存储成本（预估 $500/月，但被 CI runner 节省抵消）

## Alternatives Considered

### A. 本地缓存（runner 磁盘）

- ❌ Runner 不可复用（每次销毁）
- ❌ 命中率受 runner 调度影响

### B. 远程 build farm（分布式构建）

- ❌ 实施成本高（~3 个月）
- ❌ 需要重构现有构建系统

### C. Bazel Remote Cache

- ✅ 工业级方案
- ❌ 需要迁移到 Bazel，迁移成本远超本 RFC 范围

## Rollout Plan

1. **Phase 1 (Week 1-2)**: 实施缓存键 + S3 上传/下载
2. **Phase 2 (Week 3)**: A/B 测试，10% 流量启用
3. **Phase 3 (Week 4)**: 全量启用 + 监控告警

## Open Questions

1. 缓存大小上限？单 cache > 1GB 是否拆 key？
2. 是否需要缓存预热（cron 提前构建常用分支）？
3. 私有 fork 的缓存是否隔离？