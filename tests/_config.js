// Shared test config — single source of truth for cache-bust version + port
// Port: 8787 (Mentor dedicated; 8765 often stolen by other tools)
const fs = require('fs');
const path = require('path');

function readPort() {
  try {
    const p = fs.readFileSync(path.resolve(__dirname, '../PORT'), 'utf-8').trim();
    const n = parseInt(p, 10);
    if (n > 0 && n < 65536) return n;
  } catch (e) {}
  return 8787;
}

module.exports = {
  CURRENT_VERSION: (() => {
    try {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      const m = html.match(/app\.js\?v=(\d+)/);
      if (m) return parseInt(m[1], 10);
    } catch (e) {}
    return 133;
  })(),
  MENTOR_PORT: readPort(),
  get URL_BASE() {
    return `http://localhost:${readPort()}/index.html`;
  },
};
