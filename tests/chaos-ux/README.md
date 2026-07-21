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
| smoke | toolbar + tabs + anchors + bodies + float + handcrafted |
| full | 全部 matrix（settings/outline/export/keyboard/content…） |
| chaos | full + fuzzer + multi-seed fuzzer |

> CI 已关闭，**只在本地跑**。

## 覆盖原则

- **Surface**：每个 `surfaces.json` id 至少点过  
- **Content**：每个 catalog id（A1…、B1…）有自动化  
- 失败时打印 `State` 摘要；runner 写 `coverage-last.json`

## Phase 进度

- [x] A 骨架 + smoke  
- [x] B2 内容矩阵 + H21–H26  
- [x] B surface：tabs / export / keyboard / float / settings / outline  
- [x] A8/A10–A12 + B6/B9/B11/B13/B15/B17  
- [x] C fuzzer + multi-seed  
- [x] CI 关闭（本地测）  

## 当前 content 覆盖

- 锚点：A1–A18  
- 正文：B1–B17 主干  
- 上下文：C1–C8  
- 盘格式：P1–P4/P8–P10 + invalidReason  
- 手搓：H1, H21–H26  
- fuzzer：`--seed=42 --steps=80`；multi-seed 1/7/42/99/2026  
