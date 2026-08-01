import { writeFileSync } from "fs";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const owl = (label, phase) =>
  `<span class="supervision-pet is-${phase}"><span class="supervision-pet-body" aria-hidden="true">` +
  `<svg class="supervision-pet-face" viewBox="0 0 36 34" width="24" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<ellipse class="pet-body" cx="18" cy="19" rx="12" ry="10.5" fill="#7dd3fc" stroke="#0284c7" stroke-width="1.1"/>` +
  `<ellipse class="pet-belly" cx="18" cy="21.5" rx="7" ry="5.4" fill="#e0f2fe"/>` +
  `<path class="pet-ear" d="M8.5 12.2 C9.6 5.2 14 7.6 14.8 12 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="0.9" stroke-linejoin="round"/>` +
  `<path class="pet-ear" d="M27.5 12.2 C26.4 5.2 22 7.6 21.2 12 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="0.9" stroke-linejoin="round"/>` +
  `<circle class="pet-eye" cx="13.4" cy="17.2" r="3.7" fill="#0c4a6e"/>` +
  `<circle class="pet-eye" cx="22.6" cy="17.2" r="3.7" fill="#0c4a6e"/>` +
  `<circle cx="14.5" cy="16.2" r="1.25" fill="#f0f9ff"/>` +
  `<circle cx="23.7" cy="16.2" r="1.25" fill="#f0f9ff"/>` +
  `<path class="pet-beak" d="M16.4 20 L18 22.6 L19.6 20 Z" fill="#f59e0b" stroke="#d97706" stroke-width="0.6" stroke-linejoin="round"/>` +
  `</svg><span class="supervision-pet-label">${label}</span></span></span>`;

const html = `<!doctype html><html><head><meta charset=utf-8><style>
body{font:14px system-ui;background:#f2f1ed;padding:32px;color:#26251e}
h1{font-size:18px;margin:0 0 16px}
.row{display:flex;gap:18px;flex-wrap:wrap}
.card{background:#fff;border:1px solid rgba(38,37,30,.12);border-radius:12px;padding:16px;min-width:250px}
h2{font-size:11px;color:#777;margin:0 0 10px;letter-spacing:.04em;text-transform:uppercase}
.paper{background:#fafaf8;border:1px dashed rgba(38,37,30,.14);border-radius:8px;padding:14px;line-height:1.7}
.mark{background:rgba(14,116,144,.12);border-radius:3px;padding:1px 2px}
.supervision-pet{display:inline-flex;vertical-align:middle;margin:0 5px 0 0}
.supervision-pet-body{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:transparent;color:#155e75}
.supervision-pet.is-working .supervision-pet-face{filter:drop-shadow(0 1px 1.5px rgba(14,116,144,.22))}
.supervision-pet.is-waiting .supervision-pet-body{opacity:.78;filter:saturate(.8)}
.supervision-pet.is-degraded .supervision-pet-body{opacity:.72;filter:grayscale(.45)}
.supervision-pet-label{font-size:11px;font-weight:600;white-space:nowrap}
.dark{background:#0f172a;padding:16px;border-radius:12px;margin-top:18px}
.dark .card{background:#111827;border-color:#334155;color:#e2e8f0}
.dark .paper{background:#0b1220;border-color:#334155;color:#e2e8f0}
.dark .supervision-pet-body{color:#7dd3fc}
.note{font-size:12px;color:#777;margin-top:12px}
</style></head><body>
<h1>Mentor pet · frameless owl</h1>
<div class="row">
<div class="card"><h2>working</h2><div class="paper">${owl("改这里","working")}<span class="mark">2.4. fMRI data preprocessing</span></div></div>
<div class="card"><h2>waiting</h2><div class="paper">${owl("等待中","waiting")}<span class="mark">pending</span></div></div>
<div class="card"><h2>degraded</h2><div class="paper">${owl("未定位","degraded")}<span class="mark">missing</span></div></div>
</div>
<div class="dark"><div class="row">
<div class="card"><h2>working dark</h2><div class="paper">${owl("改这里","working")}<span class="mark">current</span></div></div>
</div></div>
<p class="note">No pill / no circle frame — owl + plain label only.</p>
</body></html>`;

const htmlPath = path.join(dir, "_pet_style_preview.html");
const pngPath = path.join(dir, "_pet_style_preview.png");
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 980, height: 520 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(htmlPath).href);
await page.screenshot({ path: pngPath, fullPage: true });
await browser.close();
console.log("wrote", pngPath);
