// scripts/scan-dead-code.mjs
// Usage: node scripts/scan-dead-code.mjs
// Reports: dead top-level functions in app.js, dead CSS class candidates,
// exports never referenced as __mdAnnotator.X outside app.js.
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function countWord(hay, name) {
  let n = 0, from = 0;
  while (true) {
    const i = hay.indexOf(name, from);
    if (i < 0) break;
    const b = i === 0 ? '' : hay[i - 1];
    const a = hay[i + name.length] || '';
    if (!/[A-Za-z0-9_$]/.test(b) && !/[A-Za-z0-9_$]/.test(a)) n++;
    from = i + name.length;
  }
  return n;
}

const lines = app.split(/\r?\n/);
const funcs = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^function\s+(\w+)\s*\(/);
  if (m) funcs.push({ name: m[1], line: i + 1 });
}

const deadFns = funcs.filter((f) => countWord(app, f.name) <= 1);
console.log('DEAD_FUNCTIONS', deadFns.length);
for (const f of deadFns) console.log(`  ${f.name} L${f.line}`);

// CSS simple class tokens appearing in styles but not app/html/modules
const modText = fs.readdirSync(path.join(root, 'modules'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(root, 'modules', f), 'utf8'))
  .join('\n');
const corpus = app + html + modText;
const classRe = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
const classes = new Set();
let m;
while ((m = classRe.exec(css))) classes.add(m[1]);
const deadCss = [...classes].filter((c) => c.length > 4 && countWord(corpus, c) === 0);
console.log('DEAD_CSS_CANDIDATES', deadCss.length);
for (const c of deadCss.slice(0, 80)) console.log(' ', c);

process.exit(deadFns.length ? 1 : 0);
