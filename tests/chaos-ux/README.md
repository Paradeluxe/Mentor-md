# chaos-ux — Mentor 变态级交互 / 批注内容测试

设计文档见会话 plan（v1.1）：交互表面 + **批注内容空间** + 手搓序列 + 可复现 fuzzer。

## 跑法

需要本地静态服务（默认 `127.0.0.1:8787`）：

```bash
# 仓库根目录
python -m http.server 8787 --bind 127.0.0.1
```

另开终端：

```bash
npm run test:ux:smoke   # Phase A 默认
npm run test:ux:full
npm run test:ux:chaos
```

或：

```bash
node tests/chaos-ux/runner.js --level=smoke
```

## 目录

| 路径 | 含义 |
|------|------|
| `harness.js` | 启动页、runner 小框架、loadDoc/annotate |
| `invariants.js` | 全局不变量 |
| `actions.js` | 原子 UI 动作 |
| `surfaces.json` | 可点控件清单 |
| `content-catalog.js` | 批注内容 id（A/B/C/P）+ 语料 |
| `matrix/` | 确定性矩阵 |
| `interleave/` | 手搓变态序列 / 未来 fuzzer |
| `fixtures/ann-content/` | 坏包/老格式 sidecar 碎片 |

## 等级

| level | 内容 |
|-------|------|
| smoke | toolbar 穷举 + 锚点/正文样本 + H1/H21/H22 |
| full | smoke +（后续）完整 A/B/C/P |
| chaos | full +（后续）随机交织 |

## 覆盖原则

- **Surface**：每个 `surfaces.json` id 至少点过  
- **Content**：每个 catalog id（A1…、B1…）有自动化  
- 失败时打印 `State` 摘要；runner 写 `coverage-last.json`

## Phase 进度

- [x] A 骨架 + smoke 套件  
- [x] B2 内容矩阵扩展：04b/04c/04d/04e/04f + H21–H26  
- [ ] B 其余 surface（tabs/export/keyboard 全矩阵）  
- [ ] C fuzzer  
- [ ] D CI 硬化  

## 当前 content 覆盖（持续扩）

- 锚点：A1–A7, A9, A13–A18（样本齐全；A8/A10–A12 后续）  
- 正文：B1/B2/B5/B7/B10/B14  
- 上下文：C1–C8  
- 盘格式：P1–P4/P8–P10 + 多个 invalidReason  
- 手搓：H1, H21–H26  
