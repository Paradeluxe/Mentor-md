#!/usr/bin/env python3
from pathlib import Path
import re

p = Path(__file__).resolve().parent.parent / "app.js"
t = p.read_text(encoding="utf-8")

fn = r'''
/**
 * Browser open has File/Handle but no absolute path (Chromium security).
 * Hermes AI needs a real disk path — ask host OS picker via mentor-server.
 */
async function pickAndBindMentorPath(opts) {
  opts = opts || {};
  const token = (State.externalWatchToken || "") || (await ensureLocalSessionToken());
  if (!token) {
    return { ok: false, error: "no-token", message: "无 mentor-server token（请用 mentor.cmd 打开页面）" };
  }
  const hint =
    opts.name ||
    mentorBasenameHint() ||
    (State.currentFile && State.currentFile.name) ||
    "";
  let res;
  try {
    res = await fetch(location.origin + "/pick-mentor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name: hint }),
    });
  } catch (e) {
    return { ok: false, error: "network", message: "无法连接 mentor-server: " + (e && e.message || e) };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "not-mentor-server",
      message: "当前 8787 不是 mentor-server。关掉 http.server，用 mentor.cmd 启动后再试。",
    };
  }
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok || !data.ok || !isAbsMentorPath(data.path)) {
    if (data.error === "cancelled") {
      return { ok: false, error: "cancelled", message: "已取消选择" };
    }
    return {
      ok: false,
      error: (data && data.error) || "pick-failed",
      message: (data && data.message) || ("选路径失败 HTTP " + res.status),
    };
  }
  const path = data.path;
  const openBase = mentorBasenameHint();
  const pickBase = String(data.name || "").toLowerCase();
  if (openBase && pickBase && openBase.toLowerCase() !== pickBase) {
    const go = confirm(
      "选中的文件名是「" + data.name + "」，当前打开的是「" + openBase + "」。\n" +
      "一般应选同一个文件。仍要绑定这个路径吗？"
    );
    if (!go) return { ok: false, error: "name-mismatch", message: "已取消（文件名不一致）" };
  }
  State.externalWatchPath = path;
  State.diskPathHint = path;
  if (State.currentFile) State.currentFile.path = path;
  try {
    await fetch(location.origin + "/supervision/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, path }),
    });
  } catch (_) {}
  try { startSupervisionPolling(); } catch (_) {}
  try {
    if (typeof startExternalWatchForCurrentDocument === "function") startExternalWatchForCurrentDocument();
  } catch (_) {}
  showToast("已绑定磁盘路径 · 可 AI / 自动保存", 2800);
  try { setStatus("已关联磁盘路径", path); } catch (_) {}
  return { ok: true, path };
}

'''

if "function pickAndBindMentorPath" not in t:
    anchor = "async function resolveMentorPathByName(name) {"
    if anchor not in t:
        raise SystemExit("resolveMentorPathByName missing")
    t = t.replace(anchor, fn + anchor, 1)
    print("pickAndBind inserted")
else:
    print("pickAndBind exists")

old = """  // Absolute path only — no stage / no silent temp copy.
  let path = \"\";
  try { path = resolveActiveMentorAbsPath(); } catch (_) { path = \"\"; }
  if (!path) {
    setFixMentorJobState({ status: \"saving\", message: \"正在解析文件路径…\", error: \"\" });
    try { path = await resolveMentorPathByName(mentorBasenameHint()); } catch (_) { path = \"\"; }
  }
  if (!path || !isAbsMentorPath(path)) {
    return {
      ok: false,
      error: \"no-disk-path\",
      message: \"没有磁盘路径。请用 mentor.cmd / 桌面图标打开 .mentor（经 mentor-server），不要只拖进浏览器。\",
    };
  }
"""

new = """  // Absolute path only — no stage / no silent temp copy.
  // Browser open = Handle without abs path; Hermes still needs a real disk path.
  let path = \"\";
  try { path = resolveActiveMentorAbsPath(); } catch (_) { path = \"\"; }
  if (!path) {
    setFixMentorJobState({ status: \"saving\", message: \"正在解析文件路径…\", error: \"\" });
    try { path = await resolveMentorPathByName(mentorBasenameHint()); } catch (_) { path = \"\"; }
  }
  // Flush handle write so on-disk bytes match editor before AI / path bind.
  if ((!path || !isAbsMentorPath(path)) && typeof hasWriteHandle === \"function\" && hasWriteHandle()) {
    setFixMentorJobState({ status: \"saving\", message: \"正在写回浏览器已授权文件…\", error: \"\" });
    try {
      const wr = await writeCurrentToHandle({ reason: \"manual\", showProgress: true });
      if (wr && !wr.ok && !wr.skipped) {
        return {
          ok: false,
          error: (wr && wr.error) || \"save-failed\",
          message: \"写回失败: \" + ((wr && (wr.message || wr.error)) || \"unknown\"),
        };
      }
    } catch (e) {
      return { ok: false, error: \"save-failed\", message: \"写回失败: \" + (e && e.message || e) };
    }
    try { path = await resolveMentorPathByName(mentorBasenameHint()); } catch (_) {}
  }
  if (!path || !isAbsMentorPath(path)) {
    setFixMentorJobState({
      status: \"saving\",
      message: \"浏览器打开看不到绝对路径，请在弹出的系统对话框中选择同一个 .mentor…\",
      error: \"\",
    });
    showToast(\"请在系统对话框中选择当前这个 .mentor（绑定磁盘路径）\", 4500);
    const picked = await pickAndBindMentorPath({ name: mentorBasenameHint() });
    if (picked && picked.ok && isAbsMentorPath(picked.path)) {
      path = picked.path;
    } else {
      return {
        ok: false,
        error: \"no-disk-path\",
        message:
          (picked && picked.message) ||
          \"没有磁盘路径。浏览器「打开文件」只有句柄、没有绝对路径；AI 需要真实路径。请在弹窗中选同一文件，或用 mentor.cmd / 双击 .mentor 打开。\",
      };
    }
  }
"""

if "浏览器打开看不到绝对路径" in t:
    print("ensureDisk already patched")
elif old in t:
    t = t.replace(old, new, 1)
    print("ensureDisk patched")
else:
    i = t.find("Absolute path only")
    print(repr(t[i : i + 350]))
    raise SystemExit("ensureDisk block missing")

if "pickAndBindMentorPath," not in t:
    for exp in (
        "  openDoctorPanel,\n  closeDoctorPanel,",
        "  fetchDoctorReport,\n  runDoctorRepair,",
        "  fetchHermesConnection,\n  startHermesConnectionPolling,",
    ):
        if exp in t:
            t = t.replace(exp, exp + "\n  pickAndBindMentorPath,", 1)
            print("export ok")
            break
    else:
        print("WARN no export")

if "doctor-bind-path" not in t or 'data-act="doctor-bind-path"' not in t:
    ins = """    if (e.target.closest('[data-act="doctor-bind-path"]')) {
      e.preventDefault();
      showToast(\"请在系统对话框中选择 .mentor…\", 2500);
      void pickAndBindMentorPath().then((r) => {
        if (r && r.ok) void openDoctorPanel();
        else if (r && r.error !== \"cancelled\") showToast(r.message || \"绑定失败\", 3500);
      });
      return;
    }
"""
    marker = 'if (e.target.closest(\'[data-act="doctor-copy-cmd"]\'))'
    idx = t.find(marker)
    if idx < 0:
        print("WARN doctor-copy missing")
    else:
        t = t[:idx] + ins + t[idx:]
        print("doctor-bind handler")

old_path = """      checks.push({
        id: \"disk-path\",
        ok: pathOk,
        severity: pathOk ? \"ok\" : \"warn\",
        title: pathOk ? \"当前文稿有磁盘路径\" : \"当前文稿无磁盘路径\",
        detail: pathOk
          ? String(State.externalWatchPath || (State.currentFile && State.currentFile.path) || \"handle/server path\")
          : \"AI 需要经 mentor.cmd / 桌面打开真实 .mentor，不能只拖进静态页\",
        fix: null,
      });"""
new_path = """      checks.push({
        id: \"disk-path\",
        ok: pathOk,
        severity: pathOk ? \"ok\" : \"warn\",
        title: pathOk ? \"当前文稿有磁盘路径\" : \"当前文稿无磁盘路径（浏览器打开常见）\",
        detail: pathOk
          ? String(State.externalWatchPath || (State.currentFile && State.currentFile.path) || \"handle/server path\")
          : \"浏览器「打开」只有文件句柄、没有绝对路径。点下方「绑定磁盘路径」选同一个 .mentor；或双击文件/用 mentor.cmd 打开。\",
        fix: pathOk ? null : \"bind-path\",
      });"""
if old_path in t:
    t = t.replace(old_path, new_path, 1)
    print("doctor path copy")
elif "浏览器打开常见" in t:
    print("path copy already")
else:
    print("path check block skip")

p.write_text(t, encoding="utf-8")
print("app.js written")

html = Path(__file__).resolve().parent.parent / "index.html"
ht = html.read_text(encoding="utf-8")
if "doctor-bind-path" not in ht:
    ht = ht.replace(
        '<button type="button" class="modal-btn-secondary" data-act="doctor-restart-worker">重启 worker</button>',
        '<button type="button" class="modal-btn-secondary" data-act="doctor-restart-worker">重启 worker</button>\n'
        '      <button type="button" class="modal-btn-secondary" data-act="doctor-bind-path">绑定磁盘路径</button>',
        1,
    )
    print("html btn")
ht = re.sub(r"(styles\.css\?v=)\d+", r"\g<1>254", ht)
ht = re.sub(r"(app\.bundle\.js\?v=)\d+", r"\g<1>254", ht)
html.write_text(ht, encoding="utf-8")
print("v=254")
