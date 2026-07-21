/**
 * Run fuzzer with several seeds (short steps each) for broader chaos.
 * Usage: node tests/chaos-ux/interleave/fuzzer-multiseed.spec.js
 */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const FUZZ = path.join(__dirname, 'fuzzer.spec.js');
const SEEDS = [1, 7, 42, 99, 2026];
const STEPS = 40;

function runSeed(seed) {
  return new Promise((resolve) => {
    console.log(`\n--- fuzzer seed=${seed} steps=${STEPS} ---`);
    const child = spawn(process.execPath, [FUZZ, `--seed=${seed}`, `--steps=${STEPS}`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on('close', (code) => resolve({ seed, code: code || 0 }));
  });
}

(async () => {
  console.log('=== chaos-ux fuzzer multi-seed ===');
  const results = [];
  for (const s of SEEDS) {
    results.push(await runSeed(s));
  }
  const failed = results.filter((r) => r.code !== 0);
  console.log('\n=== multi-seed summary ===');
  console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
