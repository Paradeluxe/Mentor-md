# -*- coding: utf-8 -*-
"""One-shot patch: deep-link / no-handle → same write-back path as normal open."""
from pathlib import Path
import re

path = Path(__file__).resolve().parents[1] / "app.js"
text = path.read_text(encoding="utf-8")
nl = "\r\n" if "\r\n" in text else "\n"

def rn(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\n", nl)
    return s

# --- 1. preserveExternalWatch ---
old = rn(
    "async function openFromMentorHandle(fileHandle, options = {}) {\n"
    "  clearExternalWatchSource();\n"
    "  const quiet = !!(options && options.quiet);"
)
new = rn(
    "async function openFromMentorHandle(fileHandle, options = {}) {\n"
    "  if (!(options && options.preserveExternalWatch)) {\n"
    "    clearExternalWatchSource();\n"
    "  }\n"
    "  const quiet = !!(options && options.quiet);"
)
if old not in text:
    raise SystemExit("fail: openFromMentorHandle anchor")
if "preserveExternalWatch" not in text[text.find("async function openFromMentorHandle"): text.find("async function openFromMentorHandle") + 200]:
    text = text.replace(old, new, 1)
    print("OK preserveExternalWatch")
else:
    print("skip preserveExternalWatch (present)")

# --- 2. helpers ---
helpers = rn(
    r'''
/** Attach an FS handle to the current doc without reloading body (deep-link → writable). */
async function attachWriteHandle(handle, { source = "picker" } = {}) {
  if (!handle || !State.currentFile) return { ok: false, error: "no-doc" };
  const want = String(State.currentFile.name || "").toLowerCase();
  const got = String(handle.name || "").toLowerCase();
  if (want && got && want !== got) {
    return { ok: false, error: "name-mismatch", expected: State.currentFile.name, got: handle.name };
  }
  try {
    const perm = await ensureWritePermission(handle);
    if (perm !== "granted") {
      let q = "unknown";
      try { q = await handle.queryPermission({ mode: "readwrite" }); } catch (_) {}
      if (q !== "granted") return { ok: false, error: "permission-denied" };
    }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : "permission-denied" };
  }
  State.currentFile.handle = handle;
  const nm = handle.name || State.currentFile.name || "";
  State.saveMode = _isMentorName(nm) ? "mentor-handle" : "handle";
  try { await rememberOpenedFile(State.currentFile.name || nm, handle); } catch (_) {}
  try { snapshotActiveTab(); } catch (_) {}
  try { renderFilePaneCurrent(); } catch (_) {}
  try { syncToolbarActionState(); } catch (_) {}
  try {
    if (typeof bindExternalWatchForCurrent === "function") {
      await bindExternalWatchForCurrent();
    } else if (typeof startExternalWatch === "function") {
      await startExternalWatch();
    }
  } catch (_) {}
  try {
    setStatus("已启用写回", `${State.currentFile.name} · Ctrl+S 写回原位置`);
  } catch (_) {}
  return { ok: true, source };
}

/** Silent: reuse IDB handle only if permission already granted (no gesture). */
async function tryAttachStoredWriteHandle(fileName = null) {
  if (hasWriteHandle()) return { ok: true, already: true, source: "existing" };
  if (!State.currentFile && !fileName) return { ok: false, error: "no-doc" };
  const name = fileName || (State.currentFile && State.currentFile.name) || "";
  if (!name) return { ok: false, error: "no-name" };
  let handle = null;
  try {
    const docId = State.currentFile && State.currentFile.documentId;
    if (docId) handle = await HandleStore.getFile(docId);
    if (!handle) handle = await HandleStore.getFile(name);
    if (!handle && typeof HandleStore.listFiles === "function") {
      const files = await HandleStore.listFiles();
      const hit = (files || []).find((f) => {
        const n = f && (f.fileName || f.name || "");
        return String(n).toLowerCase() === String(name).toLowerCase();
      });
      if (hit) handle = await HandleStore.getFile(hit.documentId || hit.fileName || hit.name);
    }
  } catch (e) {
    console.warn("[tryAttachStoredWriteHandle]", e);
  }
  if (!handle) return { ok: false, error: "no-stored-handle" };
  let perm = "prompt";
  try { perm = await handle.queryPermission({ mode: "readwrite" }); } catch (_) { perm = "prompt"; }
  if (perm !== "granted") return { ok: false, error: "need-permission", handle };
  return attachWriteHandle(handle, { source: "idb" });
}

/**
 * User-gesture path: IDB re-prompt or showOpenFilePicker for same basename.
 * opts.thenSave → writeCurrentToHandle after attach.
 */
async function enableWriteBackForCurrent(opts = {}) {
  if (hasWriteHandle()) {
    if (opts.thenSave) {
      const result = await writeCurrentToHandle({ reason: "manual", showProgress: isMentorPackMode() });
      return { ok: true, already: true, saveResult: result };
    }
    return { ok: true, already: true };
  }
  if (!State.currentFile) return { ok: false, error: "no-doc" };

  let stored = null;
  try {
    const docId = State.currentFile.documentId;
    if (docId) stored = await HandleStore.getFile(docId);
    if (!stored) stored = await HandleStore.getFile(State.currentFile.name);
  } catch (_) {}
  if (stored) {
    const att = await attachWriteHandle(stored, { source: "idb-prompt" });
    if (att.ok) {
      if (opts.thenSave) {
        const result = await writeCurrentToHandle({ reason: "manual", showProgress: isMentorPackMode() });
        return { ...att, saveResult: result };
      }
      return att;
    }
  }

  if (!FS_API.supported || typeof window.showOpenFilePicker !== "function") {
    return { ok: false, error: "unsupported" };
  }
  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "Mentor 单文件包 (.mentor)",
        accept: { "application/zip": [".mentor"] }
      }],
      excludeAcceptAllOption: false
    });
    if (!handles || !handles[0]) return { ok: false, cancelled: true };
    const att = await attachWriteHandle(handles[0], { source: "picker" });
    if (!att.ok && att.error === "name-mismatch") {
      try {
        showToast(`请选择 ${State.currentFile.name}（刚选了 ${att.got}）`, 4200);
      } catch (_) {}
      return att;
    }
    if (!att.ok) return att;
    if (opts.thenSave) {
      const result = await writeCurrentToHandle({ reason: "manual", showProgress: isMentorPackMode() });
      return { ...att, saveResult: result };
    }
    return att;
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, cancelled: true };
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

'''
)

if "async function attachWriteHandle" not in text:
    marker = "async function openFromHandle(fileHandle, sidecarHandle = null, options = {})"
    pos = text.find(marker)
    if pos < 0:
        raise SystemExit("fail: openFromHandle marker")
    text = text[:pos] + helpers + text[pos:]
    print("OK helpers inserted")
else:
    print("skip helpers")

# --- 3. replace _handleUrlOpen body ---
start = text.find("async function _handleUrlOpen()")
end = text.find('document.addEventListener("DOMContentLoaded", () => setTimeout(_handleUrlOpen, 100));')
if start < 0 or end < 0:
    raise SystemExit(f"fail url bounds {start} {end}")

new_url = rn(
    r'''async function _handleUrlOpen() {
  const params = new URLSearchParams(location.search);
  const openPath = params.get("open");
  if (!openPath) return;
  const baseName = openPath.split("\\").pop().split("/").pop() || "open.mentor";
  if (State.currentFile && State.currentFile.name === baseName && hasWriteHandle()) {
    console.log("[?open] already loaded with write handle via reconnect; stripping url");
    _stripOpenQueryFromUrl();
    return;
  }
  let opened = false;
  try {
    // Prefer live /session token — URL token dies every server restart.
    let token = await _fetchSessionToken();
    if (!token) token = params.get("token") || "";

    for (let i = 0; i < 100 && !State.editor; i++) {
      await new Promise((r2) => setTimeout(r2, 50));
    }

    // Previously authorized basename → open via handle (writable) + keep deep-link watch.
    try {
      let stored = null;
      try { stored = await HandleStore.getFile(baseName); } catch (_) {}
      if (stored) {
        let perm = "prompt";
        try { perm = await stored.queryPermission({ mode: "readwrite" }); } catch (_) {}
        if (perm === "granted") {
          State.diskPathHint = openPath;
          State.externalWatchPath = openPath;
          State.externalWatchToken = token || "";
          await openFromMentorHandle(stored, { preserveExternalWatch: true });
          try { startSupervisionPolling(); } catch (_) {}
          try {
            if (typeof bindExternalWatchForCurrent === "function") await bindExternalWatchForCurrent();
            else if (typeof startExternalWatch === "function") await startExternalWatch();
          } catch (_) {}
          opened = true;
          showToast("已打开并可写回 " + baseName, 2500);
        }
      }
    } catch (e) {
      console.warn("[?open] stored-handle open failed:", e);
    }

    if (!opened) {
      const url = location.origin + "/open?path=" + encodeURIComponent(openPath) + (token ? "&token=" + encodeURIComponent(token) : "");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        console.warn("[?open] fetch failed:", r.status, r.statusText);
        showToast("无法从链接打开文件 (HTTP " + r.status + ")，尝试重连…", 2800);
      } else {
        const blob = await r.blob();
        const file = new File([blob], baseName, { type: "application/zip" });
        if (typeof openFromMentorFile === "function" && State.editor) {
          State.diskPathHint = openPath;
          State.externalWatchPath = openPath;
          State.externalWatchToken = token || "";
          // Load body FIRST, then start supervision poll.
          await openFromMentorFile(file);
          try { startSupervisionPolling(); } catch (_) {}
          opened = true;
          let upgraded = false;
          try {
            const up = await tryAttachStoredWriteHandle(baseName);
            upgraded = !!(up && up.ok);
          } catch (_) {}
          if (upgraded) {
            showToast("已打开并可写回 " + baseName, 2500);
          } else {
            showToast("已打开 " + baseName + " · 保存时授权一次即可写回", 3200);
            try { setStatus("已打开", baseName + " · 保存时点「授权写回」"); } catch (_) {}
          }
        } else {
          console.warn("[?open] openFromMentorFile 不可用或 editor 未就绪");
          showToast("应用未就绪, 请稍后手动打开文件", 4e3);
        }
      }
    }
  } catch (e) {
    console.warn("[?open] error:", e);
  } finally {
    // Critical: strip ?open= so F5 does not loop the same failing deep-link.
    _stripOpenQueryFromUrl();
  }
  if (!opened) {
    try {
      await tryReconnect();
    } catch (e) {
      console.warn("[?open] fallback tryReconnect failed:", e);
    }
  }
}
'''
)
text = text[:start] + new_url + text[end:]
print("OK _handleUrlOpen replaced")

# --- 4. permission-denied branch in runManualSave ---
# Match flexible
pat_perm = re.compile(
    r'if \(result\.error === "权限被拒" \|\| result\.error === "need-permission"\) \{.*?'
    r'return \{ ok: false, cancelled: true \};\r?\n      \}',
    re.S,
)
repl_perm = rn(
    '''if (result.error === "权限被拒" || result.error === "need-permission") {
        const choice = await openSaveDialog(buildSaveDialogModel({ kind: "permission-denied", fileName: State.currentFile.name }));
        if (choice === "primary") {
          const up = await enableWriteBackForCurrent({ thenSave: true });
          if (up.ok && up.saveResult) return up.saveResult;
          if (up.ok) {
            const retry = await writeCurrentToHandle({ reason: "manual", showProgress: isMentorPackMode() });
            return retry;
          }
          if (up.cancelled) return { ok: false, cancelled: true };
          showToast("授权未完成，可另存副本", 2800);
          return { ok: false, error: up.error || "permission-denied" };
        }
        if (choice === "secondary") {
          const snap = createSaveSnapshot();
          return await downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
        }
        return { ok: false, cancelled: true };
      }'''
)
m = pat_perm.search(text)
if not m:
    raise SystemExit("fail: permission-denied block")
text = text[: m.start()] + repl_perm + text[m.end() :]
print("OK permission-denied")

# --- 5. no-handle branch ---
# Find from comment through cancelled return
pat_nh = re.compile(
    r'// No write handle: explain \+ recommend \.mentor\r?\n'
    r'.*?return \{ ok: false, cancelled: true \};\r?\n'
    r'  \} finally \{',
    re.S,
)
repl_nh = rn(
    '''// No write handle: authorize once (Chrome/Edge) or download copy.
        let snapshot;
        try {
          snapshot = createSaveSnapshot();
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          const isAudit = (e && e.code === "ANNOTATION_ANCHOR_AUDIT_FAILED") || /ANNOTATION_ANCHOR_AUDIT_FAILED|批注锚点/.test(msg);
          if (isAudit) {
            const issueCount = (e && e.audit && e.audit.length) || (State._lastAnchorAudit && State._lastAnchorAudit.errors || []).length || 1;
            const choice = await openSaveDialog(buildSaveDialogModel({ kind: "anchor-audit", fileName: State.currentFile?.name, issueCount }));
            if (choice === "secondary") {
              try {
                const snap = createSaveSnapshot({ skipHardAudit: true });
                return await downloadMentorSnapshot(snap, { markCleanOnSuccess: false });
              } catch (e2) {
                showToast("无法另存诊断副本: " + (e2.message || e2), 4000);
              }
            }
            return { ok: false, error: msg, code: "ANNOTATION_ANCHOR_AUDIT_FAILED" };
          }
          showToast("保存失败: " + msg, 4000);
          return { ok: false, error: msg };
        }
    const canAuthorize = !!(FS_API && FS_API.supported && typeof window.showOpenFilePicker === "function");
    const model = buildSaveDialogModel({
      kind: "no-handle",
      fileName: snapshot.name,
      annotations: (snapshot.sidecar && snapshot.sidecar.annotations || []).length,
      references: (snapshot.references && snapshot.references.entries || []).length,
      media: Object.keys(snapshot.mediaFiles || {}).length,
      canAuthorize,
    });
    const choice = await openSaveDialog(model);
    if (choice === "primary") {
      if (canAuthorize) {
        const up = await enableWriteBackForCurrent({ thenSave: true });
        if (up.ok && up.saveResult) {
          if (up.saveResult.ok) {
            const copy = buildSaveResultCopy({ kind: "write-current", fileName: State.currentFile.name });
            setStatus(copy.status, copy.detail);
            showToast(isMentorPackMode() ? "已保存到原位置 ✓ (.mentor)" : "已保存到原位置 ✓");
            try { snapshotActiveTab(); } catch {}
          }
          return up.saveResult;
        }
        if (up.cancelled) return { ok: false, cancelled: true };
        // Fall through: authorize failed → still offer download via secondary path message
        showToast("未完成授权，已改为下载副本", 2800);
      }
      try {
        await AnnotationStore.put(snapshot.name, snapshot.sidecar);
      } catch {}
      return await downloadMentorSnapshot(snapshot, { markCleanOnSuccess: true });
    }
    if (choice === "secondary") {
      if (canAuthorize) {
        try {
          await AnnotationStore.put(snapshot.name, snapshot.sidecar);
        } catch {}
        return await downloadMentorSnapshot(snapshot, { markCleanOnSuccess: false });
      }
      return await exportMarkdownSnapshot(snapshot, { markCleanOnSuccess: false });
    }
    return { ok: false, cancelled: true };
  } finally {'''
)
m = pat_nh.search(text)
if not m:
    # debug
    i = text.find("No write handle")
    print(repr(text[i:i+200]))
    raise SystemExit("fail: no-handle block")
text = text[: m.start()] + repl_nh + text[m.end() :]
print("OK no-handle")

# --- 6. export on __mdAnnotator ---
exports = [
    ("hasWriteHandle,", "hasWriteHandle,\n  attachWriteHandle,\n  tryAttachStoredWriteHandle,\n  enableWriteBackForCurrent,"),
]
# find exact export section
if "enableWriteBackForCurrent," not in text:
    old_ex = "  hasWriteHandle,"
    # only first occurrence in __mdAnnotator might be wrong; find near end
    idx = text.rfind("  hasWriteHandle,")
    if idx < 0:
        raise SystemExit("fail export hasWriteHandle")
    text = text[:idx] + "  hasWriteHandle,\n  attachWriteHandle,\n  tryAttachStoredWriteHandle,\n  enableWriteBackForCurrent," + text[idx + len("  hasWriteHandle,"):]
    print("OK exports")
else:
    print("skip exports")

path.write_text(text, encoding="utf-8")
print("WROTE", path, "bytes", path.stat().st_size)

# sanity
for name in ("attachWriteHandle", "tryAttachStoredWriteHandle", "enableWriteBackForCurrent", "preserveExternalWatch", "授权写回并保存"):
    # last one is in save-dialog module not app
    print(name, name in text if name != "授权写回并保存" else "n/a-app")
