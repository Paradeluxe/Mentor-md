#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "app.js"
t = p.read_text(encoding="utf-8")

block = r'''
/* ===== Mentor Doctor (in-app diagnostics) ===== */
function doctorKillServerCmd() {
  const port = location.port || "8787";
  const root = "E:\\hermes_playground\\Mentor";
  return [
    "# PowerShell — free port " + port + " and start real mentor-server",
    "$p = Get-NetTCPConnection -LocalPort " + port + " -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique",
    "if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }",
    "Start-Sleep -Milliseconds 400",
    "cd '" + root + "'",
    "Start-Process -WindowStyle Minimized -FilePath python -ArgumentList 'mentor-server.py','--port','" + port + "'",
    "Start-Process \"http://127.0.0.1:" + port + "/index.html\"",
  ].join("\n");
}

function buildOfflineDoctorReport(sessionStatus, hermesStatus) {
  const checks = [];
  const notServer = sessionStatus === 404 || hermesStatus === 404;
  checks.push({
    id: "mentor-server",
    ok: !notServer && sessionStatus === 200,
    severity: notServer || sessionStatus !== 200 ? "error" : "ok",
    title: notServer
      ? "8787 不是 mentor-server"
      : sessionStatus === 200
        ? "mentor-server 在线"
        : ("session HTTP " + sessionStatus),
    detail: notServer
      ? "常见原因：python -m http.server 占端口。静态页能开，但 /session /hermes-connection /doctor 全 404，AI 必挂。"
      : "GET /session",
    fix: notServer ? "restart-mentor-server" : null,
  });
  checks.push({
    id: "warm-worker",
    ok: false,
    severity: "error",
    title: "无法检测 Hermes worker",
    detail: notServer
      ? "先恢复真实 mentor-server，再点「启动 / 预热 Hermes」"
      : ("/hermes-connection HTTP " + hermesStatus),
    fix: notServer ? "restart-mentor-server" : "warm-worker",
  });
  return {
    ok: true,
    overall: "error",
    offline: true,
    checks,
    fixCmd: doctorKillServerCmd(),
    hints: ["复制下方命令到 PowerShell 运行，或关闭假 server 后双击 mentor.cmd"],
  };
}

function renderDoctorReport(report) {
  const overallEl = document.getElementById("doctor-overall");
  const list = document.getElementById("doctor-checks");
  const cmdEl = document.getElementById("doctor-fix-cmd");
  const copyBtn = document.getElementById("doctor-copy-cmd-btn");
  if (!overallEl || !list) return;
  const overall = (report && report.overall) || "unknown";
  overallEl.dataset.overall = overall;
  const nErr = ((report && report.checks) || []).filter((c) => c.severity === "error").length;
  const nWarn = ((report && report.checks) || []).filter((c) => c.severity === "warn").length;
  if (overall === "ok") overallEl.textContent = "全部通过 · 可以点 AI 处理";
  else if (overall === "warn") overallEl.textContent = "有警告（" + nWarn + "）· 建议预热 Hermes";
  else if (overall === "error") overallEl.textContent = "发现问题（" + nErr + "）· 见下方条目与一键修复";
  else overallEl.textContent = "检测中…";

  const badge = { ok: "OK", warn: "WARN", error: "ERR" };
  list.innerHTML = ((report && report.checks) || []).map((c) => {
    const sev = c.severity || (c.ok ? "ok" : "error");
    const title = String(c.title || c.id || "").replace(/</g, "&lt;");
    const detail = String(c.detail || "").replace(/</g, "&lt;");
    return (
      '<li class="doctor-check" data-severity="' + sev + '">' +
        '<div class="doctor-check-title"><span class="doctor-check-badge">' + (badge[sev] || sev) + "</span>" + title + "</div>" +
        (detail ? '<div class="doctor-check-detail">' + detail + "</div>" : "") +
      "</li>"
    );
  }).join("");

  const cmd = (report && report.fixCmd) || "";
  State._doctorFixCmd = cmd;
  if (cmdEl) {
    if (cmd) {
      cmdEl.textContent = cmd;
      cmdEl.hidden = false;
      cmdEl.classList.remove("hidden");
    } else {
      cmdEl.textContent = "";
      cmdEl.hidden = true;
      cmdEl.classList.add("hidden");
    }
  }
  if (copyBtn) copyBtn.hidden = !cmd;
}

async function fetchDoctorReport(opts) {
  opts = opts || {};
  let token = State.externalWatchToken || "";
  if (!token && typeof ensureLocalSessionToken === "function") {
    try { token = await ensureLocalSessionToken(); } catch (_) {}
  }
  const q = new URLSearchParams();
  if (token) q.set("token", token);
  if (opts.warm) q.set("warm", "1");
  if (opts.wait) q.set("wait", String(opts.wait));
  try {
    const res = await fetch(location.origin + "/doctor?" + q.toString(), { cache: "no-store" });
    if (!res.ok) {
      let sessionStatus = res.status;
      try {
        const s = await fetch(location.origin + "/session", { cache: "no-store" });
        sessionStatus = s.status;
      } catch (_) {}
      return buildOfflineDoctorReport(sessionStatus, res.status);
    }
    const data = await res.json();
    try {
      const pathOk = !!(State.externalWatchPath || (State.currentFile && State.currentFile.path) || (typeof hasDiskWriteTarget === "function" && hasDiskWriteTarget()));
      const checks = Array.isArray(data.checks) ? data.checks.slice() : [];
      checks.push({
        id: "disk-path",
        ok: pathOk,
        severity: pathOk ? "ok" : "warn",
        title: pathOk ? "当前文稿有磁盘路径" : "当前文稿无磁盘路径",
        detail: pathOk
          ? String(State.externalWatchPath || (State.currentFile && State.currentFile.path) || "handle/server path")
          : "AI 需要经 mentor.cmd / 桌面打开真实 .mentor，不能只拖进静态页",
        fix: null,
      });
      data.checks = checks;
      if (!pathOk && data.overall === "ok") data.overall = "warn";
    } catch (_) {}
    return data;
  } catch (e) {
    return buildOfflineDoctorReport(0, 0);
  }
}

async function runDoctorRepair(action) {
  let token = State.externalWatchToken || "";
  if (!token && typeof ensureLocalSessionToken === "function") {
    try { token = await ensureLocalSessionToken(); } catch (_) {}
  }
  const res = await fetch(location.origin + "/doctor/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action, wait: 30 }),
  });
  if (!res.ok) {
    if (res.status === 404) {
      const rep = buildOfflineDoctorReport(404, 404);
      renderDoctorReport(rep);
      showToast("当前不是 mentor-server，无法在应用内修复 worker", 4200);
      return rep;
    }
    const errText = await res.text().catch(() => "");
    throw new Error("repair failed HTTP " + res.status + " " + String(errText).slice(0, 120));
  }
  const data = await res.json();
  const report = data.report || (await fetchDoctorReport({ warm: true, wait: 5 }));
  renderDoctorReport(report);
  try { await fetchHermesConnection({ warm: false }); } catch (_) {}
  return report;
}

async function openDoctorPanel() {
  const modal = document.getElementById("doctor-modal");
  if (!modal) {
    showToast("Doctor UI 缺失（硬刷 ?v=）", 3000);
    return;
  }
  modal.classList.remove("hidden");
  const overallEl = document.getElementById("doctor-overall");
  if (overallEl) {
    overallEl.dataset.overall = "unknown";
    overallEl.textContent = "检测中…";
  }
  try {
    const report = await fetchDoctorReport({ warm: true, wait: 8 });
    renderDoctorReport(report);
  } catch (e) {
    renderDoctorReport(buildOfflineDoctorReport(0, 0));
  }
}

function closeDoctorPanel() {
  const modal = document.getElementById("doctor-modal");
  if (modal) modal.classList.add("hidden");
}

async function doctorCopyFixCmd() {
  const cmd = State._doctorFixCmd || doctorKillServerCmd();
  try {
    await navigator.clipboard.writeText(cmd);
    showToast("已复制修复命令", 2000);
  } catch (_) {
    showToast("复制失败，请手动选中命令", 2500);
  }
}

'''

if "function openDoctorPanel" not in t:
    anchor = "function isFixMentorJobActive(status) {"
    if anchor not in t:
        raise SystemExit("anchor missing")
    t = t.replace(anchor, block + "\n" + anchor, 1)
    print("doctor block inserted")
else:
    print("doctor block exists")

ins = r'''    if (e.target.closest('[data-act="open-doctor"]')) {
      e.preventDefault();
      try { if (typeof closeSettingsPopover === "function") closeSettingsPopover(); } catch (_) {}
      void openDoctorPanel();
      return;
    }
    if (e.target.closest('[data-act="close-doctor"]')) {
      e.preventDefault();
      closeDoctorPanel();
      return;
    }
    if (e.target.closest('[data-act="doctor-refresh"]')) {
      e.preventDefault();
      void openDoctorPanel();
      return;
    }
    if (e.target.closest('[data-act="doctor-warm"]')) {
      e.preventDefault();
      showToast("正在预热 Hermes…", 1800);
      void runDoctorRepair("warm-worker").then((r) => {
        const ok = r && r.overall === "ok";
        showToast(ok ? "Hermes 已就绪" : "预热结束 · 见 Doctor 结果", 2800);
      }).catch((err) => showToast(String(err && err.message || err), 3500));
      return;
    }
    if (e.target.closest('[data-act="doctor-restart-worker"]')) {
      e.preventDefault();
      showToast("正在重启 worker…", 1800);
      void runDoctorRepair("restart-worker").then((r) => {
        const ok = r && r.overall === "ok";
        showToast(ok ? "Worker 已重启并就绪" : "重启结束 · 见 Doctor 结果", 2800);
      }).catch((err) => showToast(String(err && err.message || err), 3500));
      return;
    }
    if (e.target.closest('[data-act="doctor-copy-cmd"]')) {
      e.preventDefault();
      void doctorCopyFixCmd();
      return;
    }
'''

if 'data-act="open-doctor"' not in t or "void openDoctorPanel()" not in t:
    marker = 'if (e.target.closest(\'[data-act="toggle-comment-pane"]\'))'
    idx = t.find(marker)
    if idx < 0:
        raise SystemExit("toggle-comment-pane handler missing")
    t = t[:idx] + ins + t[idx:]
    print("handlers wired")
else:
    print("handlers exist")

exp = "  fetchHermesConnection,\n  startHermesConnectionPolling,"
exp2 = "  fetchHermesConnection,\n  startHermesConnectionPolling,\n  openDoctorPanel,\n  closeDoctorPanel,\n  fetchDoctorReport,\n  runDoctorRepair,"
if "openDoctorPanel," not in t:
    if exp not in t:
        raise SystemExit("export anchor missing")
    t = t.replace(exp, exp2, 1)
    print("exports ok")

old_sync = '''  chip.title = [
    hermesConnLabel(state, h),
    h.skills && h.skills.length ? ("skills: " + h.skills.join(",")) : "",
    h.error || "",
    h.mode ? ("mode=" + h.mode) : "",
  ].filter(Boolean).join(" · ");'''
new_sync = '''  chip.title = [
    hermesConnLabel(state, h),
    "点击打开 Doctor",
    h.skills && h.skills.length ? ("skills: " + h.skills.join(",")) : "",
    h.error || "",
    h.mode ? ("mode=" + h.mode) : "",
  ].filter(Boolean).join(" · ");'''
if old_sync in t and "点击打开 Doctor" not in t:
    t = t.replace(old_sync, new_sync, 1)
    print("chip title tip")

p.write_text(t, encoding="utf-8")
print("wrote", p)
