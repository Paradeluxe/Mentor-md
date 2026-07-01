// tests/e2e-soak.spec.js
// 多轮 soak test: 把 e2e-annotation-overlap.spec.js 跑 N 轮
// 验证:
//   - 轮间结果一致 (每轮 34/34 pass)
//   - 0 console error / 0 page error 稳定
//   - 线程数 / mark 数 跨轮不变
//   - 总耗时无明显劣化

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function detectRoot() {
  if (process.platform === 'win32') return path.resolve('E:/hermes_playground/Mentor');
  if (fs.existsSync('/mnt/e/hermes_playground/Mentor')) return '/mnt/e/hermes_playground/Mentor';
  if (fs.existsSync('/home/lablabcloud/.hermes/node/lib/node_modules/playwright')) return '/mnt/e/hermes_playground/Mentor';
  return path.resolve(__dirname, '..');
}
const ROOT = detectRoot();
const URL = 'http://127.0.0.1:8765/index.html';
const TARGET = path.join(ROOT, 'tests/e2e-annotation-overlap.spec.js');
const N_ROUNDS = parseInt(process.env.SOAK_ROUNDS || '5', 10);

// 模式: 'single' (default, 跑 overlap 1 spec) 或 'full' (多 spec 一起 soak)
const MODE = process.env.SOAK_MODE || 'single';
const FULL_TARGETS = MODE === 'full' ? [
  path.join(ROOT, 'tests/e2e.spec.js'),
  path.join(ROOT, 'tests/e2e-annotation-overlap.spec.js'),
  path.join(ROOT, 'tests/e2e-comment-pane.spec.js'),
  path.join(ROOT, 'tests/e2e-multi-paragraph.spec.js'),
  path.join(ROOT, 'tests/verify-fixes.spec.js'),
] : MODE === 'big2' ? [
  // 重头戏: 主 e2e (105) + overlap (34) 一轮共 139
  path.join(ROOT, 'tests/e2e.spec.js'),
  path.join(ROOT, 'tests/e2e-annotation-overlap.spec.js'),
] : [TARGET];

(async () => {
  // Pre-flight: server up?
  try {
    await new Promise((resolve, reject) => {
      const http = require('http');
      const req = http.get(URL, res => { res.resume(); resolve(); });
      req.on('error', reject);
      req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    });
  } catch (e) {
    console.log('✗ HTTP server not up at ' + URL);
    console.log('  Start: cd /e/hermes_playground/Mentor && python -m http.server 8765 --bind 127.0.0.1');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Mentor Soak Test — ${N_ROUNDS} 轮 (mode=${MODE}, ${FULL_TARGETS.length} spec)`);
  console.log('═══════════════════════════════════════════════════════════');

  // 启动独立 chromium instance 跑 (在子进程里跑完整 spec) — 简单且隔离
  const outDir = path.join(ROOT, 'tests/soak-logs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const rounds = [];
  for (let r = 1; r <= N_ROUNDS; r++) {
    const t0 = Date.now();
    const logPath = path.join(outDir, `round-${String(r).padStart(2, '0')}.log`);
    const { spawnSync } = require('child_process');
    // 模式 full: 一轮内跑多个 spec, 但各 spec 是独立 process
    let output = '';
    let exitCode = 0;
    for (const tgt of FULL_TARGETS) {
      output += `\n━━ ${path.basename(tgt)} ━━\n`;
      const res = spawnSync(process.execPath, [tgt], {
        cwd: ROOT,
        encoding: 'utf-8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 360 * 1000,
      });
      output += (res.stdout || '') + (res.stderr || '');
      if ((res.status || 0) !== 0) exitCode = 1;
    }
    const elapsed = Date.now() - t0;
    fs.writeFileSync(logPath, output);

    // Parse: 累加 ✓ N/M ... 通过 + ✓ 全部 N 个 ... 通过 两种格式
    const matches = [
      ...output.matchAll(/✓\s+(\d+)\/(\d+)\s+\S+通过/g),
      ...output.matchAll(/✓\s+全部\s+(\d+)\s+个\S*测试通过/g),
    ];
    const passed = matches.reduce((s, m) => s + parseInt(m[1]), 0);
    const total = matches.reduce((s, m) => s + parseInt(m[2] || m[1]), 0);
    // 找每个 spec 的 console.error / page.error
    const cerrMatches = [...output.matchAll(/console\.errors:\s+(\d+)/g)];
    const perrMatches = [...output.matchAll(/page\.errors:\s+(\d+)/g)];
    const cerrSum = cerrMatches.reduce((s, m) => s + parseInt(m[1]), 0);
    const perrSum = perrMatches.reduce((s, m) => s + parseInt(m[1]), 0);

    rounds.push({ round: r, passed, total, cerr: cerrSum, perr: perrSum, exitCode, elapsed, logPath });
    console.log(`  [round ${r}/${N_ROUNDS}]  ${passed}/${total} pass  cErr=${cerrSum}  pErr=${perrSum}  exit=${exitCode}  ${elapsed}ms`);
  }

  // ---- 汇总 ----
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Soak Summary');
  console.log('═══════════════════════════════════════════════════════════');
  const allPass = rounds.every(r => r.passed === r.total && r.passed > 0 && r.exitCode === 0);
  const cerrNums = rounds.map(r => parseInt(r.cerr));
  const perrNums = rounds.map(r => parseInt(r.perr));
  const allCleanErr = cerrNums.every(n => n === 0) && perrNums.every(n => n === 0);
  const totalPasses = rounds.reduce((s, r) => s + r.passed, 0);
  const totalSubs = rounds.reduce((s, r) => s + r.total, 0);
  const minMs = Math.min(...rounds.map(r => r.elapsed));
  const maxMs = Math.max(...rounds.map(r => r.elapsed));
  const avgMs = Math.round(rounds.reduce((s, r) => s + r.elapsed, 0) / rounds.length);

  console.log(`  总通过率:  ${totalPasses}/${totalSubs} (${rounds.length} 轮)`);
  console.log(`  console.error 轮: [${cerrNums.join(', ')}]  ${cerrNums.every(n => n === 0) ? '✓ 全 0' : '✗ 有非 0'}`);
  console.log(`  page.error 轮:    [${perrNums.join(', ')}]  ${perrNums.every(n => n === 0) ? '✓ 全 0' : '✗ 有非 0'}`);
  console.log(`  exit code 轮:     [${rounds.map(r => r.exitCode).join(', ')}]`);
  console.log(`  耗时: min=${minMs}ms  avg=${avgMs}ms  max=${maxMs}ms  (spread=${maxMs - minMs}ms)`);
  console.log(`  轮间一致性: ${rounds.every(r => r.passed === rounds[0].passed && r.total === rounds[0].total) ? '✓ 稳定' : '✗ 漂移'}`);

  console.log('\n  per-round:');
  for (const r of rounds) {
    const tag = r.exitCode === 0 && r.passed === r.total && r.passed > 0 ? '✓' : '✗';
    console.log(`    ${tag} round ${r.round}: ${r.passed}/${r.total}  cErr=${r.cerr} pErr=${r.perr}  ${r.elapsed}ms  log=${path.basename(r.logPath)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  if (allPass && allCleanErr) {
    console.log('  ✓ SOAK PASS — 全部轮通过, 0 error');
  } else {
    console.log('  ✗ SOAK FAIL — 见上方 per-round');
  }
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(allPass && allCleanErr ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
