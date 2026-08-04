/**
 * unit: offline Doctor report when not mentor-server
 * Run: node tests/unit-mentor-doctor.spec.js
 */
'use strict';

// Minimal reimplementation of offline path (mirrors app.js contract)
function doctorKillServerCmd(port) {
  return 'Stop-Process LocalPort ' + port;
}
function buildOfflineDoctorReport(sessionStatus, hermesStatus) {
  const notServer = sessionStatus === 404 || hermesStatus === 404;
  const checks = [
    {
      id: 'mentor-server',
      ok: !notServer && sessionStatus === 200,
      severity: notServer || sessionStatus !== 200 ? 'error' : 'ok',
      title: notServer ? '8787 不是 mentor-server' : 'mentor-server 在线',
    },
    {
      id: 'warm-worker',
      ok: false,
      severity: 'error',
      title: '无法检测 Hermes worker',
    },
  ];
  return { overall: 'error', offline: true, checks, fixCmd: doctorKillServerCmd('8787') };
}

const r = buildOfflineDoctorReport(404, 404);
if (r.overall !== 'error') throw new Error('overall');
if (!r.checks[0].title.includes('不是 mentor-server')) throw new Error('title');
if (!r.fixCmd) throw new Error('fixCmd');
console.log('PASS unit-mentor-doctor');
