// Shared test config — single source of truth for cache-bust version
// To bump: update CURRENT_VERSION here + index.html's app.js?v=N
// 然后所有测试自动跟新 (它们 require 这文件)
module.exports = {
  // 从 index.html 自动检测 (本地读文件), fallback 手动
  // 自动检测: 匹配 <script src="app.js?v=N"> 取 N
  CURRENT_VERSION: (() => {
    try {
      const fs = require('fs');
      const path = require('path');
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      const m = html.match(/app\.js\?v=(\d+)/);
      if (m) return parseInt(m[1], 10);
    } catch (e) {}
    return 107;  // fallback
  })(),
  URL_BASE: 'http://localhost:8765/index.html',
};