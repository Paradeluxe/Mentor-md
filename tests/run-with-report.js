// tests/run-with-report.js
// 跑 e2e.spec.js + 解析 console output + 生成 HTML 报告
// 0 依赖 (纯 Node 内置)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_FILE = path.join(__dirname, 'e2e.spec.js');
const REPORT_FILE = path.join(__dirname, 'report.html');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const TEMPLATE_FILE = path.join(__dirname, 'report-template.html');

// 解析一行 console output
// 返回 { type: 'test-start' | 'pass' | 'fail' | 'error' | 'log' | 'section', ... }
function parseLine(line) {
  // TEST 开始
  const testMatch = line.match(/^=== TEST (\d+): (.+?) ===$/);
  if (testMatch) return { type: 'test-start', num: parseInt(testMatch[1]), title: testMatch[2] };

  // SECTION 开始
  const sectionMatch = line.match(/^========== SECTION (\w+):? (.+?) ==========$/);
  if (sectionMatch) return { type: 'section', letter: sectionMatch[1], title: sectionMatch[2] };

  // 总体结果
  if (line.match(/^✓ 全部 \d+ 个测试通过！$/)) return { type: 'all-pass' };
  if (line.match(/^✗ 测试失败: (.+)$/)) return { type: 'fail', msg: line.replace(/^✗ /, '') };

  // 断言通过
  if (line.match(/^\s*✓\s/)) return { type: 'pass', text: line.trim() };

  // 断言失败
  if (line.match(/^\s*✗\s/)) return { type: 'fail-line', text: line.trim() };

  // 截图
  const shotMatch = line.match(/^\s*✓\s*截图:\s*(.+)$/);
  if (shotMatch) return { type: 'screenshot', path: shotMatch[1] };

  return { type: 'log', text: line };
}

async function main() {
  console.log('Running tests...');
  const startTime = Date.now();

  // 跑测试 - cwd 必须是 Mentor/ 根目录 (e2e.spec.js 用绝对路径)
  const MENTOR_ROOT = path.dirname(__dirname);
  const child = spawn('node', [TEST_FILE], {
    cwd: MENTOR_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; process.stderr.write(d); });

  const exitCode = await new Promise(resolve => {
    child.on('close', resolve);
  });

  const duration = Date.now() - startTime;
  console.log(`\n[Done] exit code: ${exitCode}, duration: ${(duration / 1000).toFixed(1)}s`);

  // 解析
  const lines = stdout.split('\n');
  const tests = [];        // { num, title, section, asserts: [...], error: null|{...} }
  const sections = [];     // { letter, title, testNums: [] }
  let currentTest = null;
  let currentSection = null;
  let lastError = null;    // { msg, stack, screenshots: [] }
  let parsedCount = { 'test-start': 0, 'section': 0, 'pass': 0, 'fail': 0, 'log': 0 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parsed = parseLine(line);
    parsedCount[parsed.type] = (parsedCount[parsed.type] || 0) + 1;
    if (parsed.type === 'section') {
      currentSection = { letter: parsed.letter, title: parsed.title, testNums: [] };
      sections.push(currentSection);
    } else if (parsed.type === 'test-start') {
      // 新 test 出现时, 把上一个 test (如果存在) 关闭 + push 到 tests
      if (currentTest) {
        if (lastError && currentTest.error === null) currentTest.error = lastError;
        tests.push(currentTest);
        lastError = null;  // 重置
      }
      // 创建新 test
      const screenshots = [];
      currentTest = { num: parsed.num, title: parsed.title, section: currentSection?.letter, asserts: [], screenshots, error: null };
      if (currentSection) currentSection.testNums.push(parsed.num);
    } else if (parsed.type === 'pass') {
      if (currentTest) currentTest.asserts.push({ type: 'pass', text: parsed.text });
    } else if (parsed.type === 'fail-line') {
      if (currentTest) currentTest.asserts.push({ type: 'fail', text: parsed.text });
    } else if (parsed.type === 'screenshot') {
      if (currentTest) currentTest.screenshots.push(parsed.path);
    } else if (parsed.type === 'fail') {
      lastError = { msg: parsed.msg, stack: '' };
      // 收集后续 stack 行 (缩进行)
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (next.match(/^\s*at /) || next.match(/^\s*Error:/)) {
          lastError.stack += next + '\n';
          j++;
        } else break;
      }
    } else if (parsed.type === 'all-pass') {
      // 标记最后一个 test 通过
      // (currentTest 在下一个 test-start 时会被替换, 所以这里用 last)
    } else if (parsed.type === 'log' && lastError && (parsed.text.match(/^\s+at /) || parsed.text.match(/^\s*Error:/))) {
      lastError.stack += parsed.text + '\n';
    }

    // (test 关闭逻辑已合并到 test-start 处)
  }

  // 处理最后一个 test
  if (currentTest) {
    if (lastError && currentTest.error === null) currentTest.error = lastError;
    tests.push(currentTest);
  }

  // 计算统计
  const stats = {
    total: tests.length,
    passed: tests.filter(t => !t.error).length,
    failed: tests.filter(t => t.error).length,
    asserts: tests.reduce((sum, t) => sum + t.asserts.length, 0),
    assertPass: tests.reduce((sum, t) => sum + t.asserts.filter(a => a.type === 'pass').length, 0),
    assertFail: tests.reduce((sum, t) => sum + t.asserts.filter(a => a.type === 'fail').length, 0),
    duration,
    exitCode,
  };

  console.log(`[Report] ${stats.passed}/${stats.total} tests passed, ${stats.assertPass}/${stats.asserts} asserts`);

  // 复制截图到 tests/screenshots/ (供 HTML 用相对路径)
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const screenshotMap = {};  // 原路径 -> 相对路径
  for (const t of tests) {
    for (const origPath of t.screenshots) {
      if (fs.existsSync(origPath)) {
        const basename = path.basename(origPath);
        const dest = path.join(SCREENSHOTS_DIR, basename);
        try {
          fs.copyFileSync(origPath, dest);
          screenshotMap[origPath] = 'screenshots/' + basename;
        } catch (e) { /* 忽略 */ }
      }
    }
  }

  // 生成 HTML
  const template = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
  const html = template
    .replaceAll('{{TITLE}}', `Mentor E2E 测试报告 - ${new Date().toLocaleString('zh-CN')}`)
    .replaceAll('{{STATS_CLASS}}', stats.failed > 0 ? 'has-fail' : '')
    .replaceAll('{{STATS}}', JSON.stringify(stats))
    .replaceAll('{{SECTIONS}}', JSON.stringify(sections))
    .replaceAll('{{TESTS}}', JSON.stringify(tests))
    .replaceAll('{{SCREENSHOT_MAP}}', JSON.stringify(screenshotMap))
    .replaceAll('{{DURATION}}', (duration / 1000).toFixed(1))
    .replaceAll('{{EXIT_CODE}}', exitCode);

  fs.writeFileSync(REPORT_FILE, html);
  console.log(`[Report] HTML saved: ${REPORT_FILE}`);
  console.log(`[Report] Open: file://${REPORT_FILE}`);

  // CI 退出码
  process.exit(exitCode);
}

main().catch(e => { console.error(e); process.exit(1); });
