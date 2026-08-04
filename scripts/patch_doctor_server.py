#!/usr/bin/env python3
"""Patch mentor-server.py with /doctor + /doctor/repair."""
from pathlib import Path
import py_compile

p = Path(__file__).resolve().parent.parent / "mentor-server.py"
t = p.read_text(encoding="utf-8")
if "def build_doctor_report" in t:
    print("already patched")
else:
    fn = r'''

def restart_hermes_worker(timeout_ready=25):
    """Terminate warm worker process (if owned) then ensure fresh spawn."""
    global _HERMES_WORKER_PROC
    with _HERMES_WORKER_LOCK:
        proc = _HERMES_WORKER_PROC
        _HERMES_WORKER_PROC = None
    if proc is not None:
        try:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
        except Exception:
            pass
    return ensure_hermes_worker(timeout_ready=timeout_ready)


def build_doctor_report(warm=False, wait=0):
    """Structured health report for in-app Doctor UI."""
    hermes_bin = resolve_hermes_bin() or ''
    hermes_py = resolve_hermes_python() or ''
    worker_script = HERMES_WORKER_SCRIPT
    script_ok = bool(worker_script and os.path.isfile(worker_script))
    if warm:
        h = ensure_hermes_worker(timeout_ready=float(wait or 0))
    else:
        h = hermes_worker_health(timeout=0.8)
        if not h.get('reachable'):
            h = ensure_hermes_worker(timeout_ready=0)
            h = hermes_worker_health(timeout=0.8) or h
    h = dict(h or {})
    checks = []
    checks.append({
        'id': 'mentor-server',
        'ok': True,
        'severity': 'ok',
        'title': 'mentor-server 在线',
        'detail': 'GET /session 可用 · 本进程为真实 Mentor API，不是 python -m http.server',
        'fix': None,
    })
    checks.append({
        'id': 'hermes-bin',
        'ok': bool(hermes_bin),
        'severity': 'ok' if hermes_bin else 'error',
        'title': 'Hermes CLI' if hermes_bin else '找不到 hermes.exe',
        'detail': hermes_bin or '设置 MENTOR_HERMES_BIN 或安装 Hermes Agent',
        'fix': None,
    })
    checks.append({
        'id': 'worker-script',
        'ok': script_ok,
        'severity': 'ok' if script_ok else 'error',
        'title': 'warm worker 脚本',
        'detail': worker_script if script_ok else ('missing: ' + str(worker_script)),
        'fix': None,
    })
    checks.append({
        'id': 'hermes-python',
        'ok': bool(hermes_py),
        'severity': 'ok' if hermes_py else 'error',
        'title': 'Hermes venv Python' if hermes_py else '找不到 Hermes Python',
        'detail': hermes_py or 'hermes.exe 旁 venv 不完整',
        'fix': None,
    })
    ready = bool(h.get('agentReady'))
    reachable = bool(h.get('reachable'))
    if ready:
        sev, title, fix = 'ok', 'Hermes warm worker 已就绪', None
    elif reachable:
        sev, title, fix = 'warn', 'Worker 已连接但 agent 未就绪', 'warm-worker'
    else:
        sev, title, fix = 'error', 'Hermes warm worker 未运行', 'warm-worker'
    detail_parts = [
        'state=' + str(h.get('state') or '?'),
        'port=' + str(HERMES_WORKER_PORT),
        'agentReady=' + str(ready),
    ]
    if h.get('error'):
        detail_parts.append(str(h.get('error'))[:180])
    if h.get('skills'):
        detail_parts.append('skills=' + ','.join(h.get('skills') or []))
    checks.append({
        'id': 'warm-worker',
        'ok': ready,
        'severity': sev,
        'title': title,
        'detail': ' · '.join(detail_parts),
        'fix': fix,
    })
    overall = 'ok'
    if any(c['severity'] == 'error' for c in checks):
        overall = 'error'
    elif any(c['severity'] == 'warn' for c in checks):
        overall = 'warn'
    return {
        'ok': True,
        'overall': overall,
        'service': 'mentor-doctor',
        'workerPort': HERMES_WORKER_PORT,
        'hermesBin': hermes_bin,
        'hermesPython': hermes_py,
        'worker': {
            'state': h.get('state'),
            'reachable': reachable,
            'agentReady': ready,
            'error': h.get('error') or '',
            'skills': h.get('skills') or [],
            'pid': h.get('pid') or h.get('workerPid'),
            'uptimeSec': h.get('uptimeSec'),
        },
        'checks': checks,
        'actions': [
            {'id': 'warm-worker', 'label': '启动 / 预热 Hermes worker'},
            {'id': 'restart-worker', 'label': '重启 Hermes worker'},
            {'id': 'refresh', 'label': '重新检测'},
        ],
        'hints': [
            '点底栏 Hermes 芯片可随时打开 Doctor',
            '若 8787 被 python -m http.server 占用，本 API 会 404——关掉占用进程后运行 mentor.cmd',
        ],
    }


def run_doctor_repair(action, wait=25):
    action = str(action or '').strip().lower()
    if action in ('warm-worker', 'warm', 'ensure-worker'):
        h = ensure_hermes_worker(timeout_ready=float(wait or 25))
        return {'ok': True, 'action': 'warm-worker', 'worker': h, 'report': build_doctor_report(warm=False)}
    if action in ('restart-worker', 'restart'):
        h = restart_hermes_worker(timeout_ready=float(wait or 25))
        return {'ok': True, 'action': 'restart-worker', 'worker': h, 'report': build_doctor_report(warm=False)}
    return {'ok': False, 'error': 'unknown-action', 'message': '未知修复动作: ' + action}

'''
    anchor = "\nclass MentorHandler"
    if anchor not in t:
        raise SystemExit("class MentorHandler missing")
    t = t.replace(anchor, fn + anchor, 1)
    print("inserted functions")

old_post = """        if route not in (
            '/allow-open',
            '/supervision/register',
            '/pending-open',
            '/run-fix-mentor',
            '/resolve-mentor-path',
            '/write-mentor',
        ):"""
new_post = """        if route not in (
            '/allow-open',
            '/supervision/register',
            '/pending-open',
            '/run-fix-mentor',
            '/resolve-mentor-path',
            '/write-mentor',
            '/doctor/repair',
        ):"""
if old_post not in t:
    raise SystemExit("post whitelist missing")
if "/doctor/repair" not in t:
    t = t.replace(old_post, new_post, 1)
    print("whitelist ok")

marker = (
    "        length = int(self.headers.get('Content-Length') or '0')\n"
    "        raw = self.rfile.read(length) if length > 0 else b''\n\n"
    "        if route == '/write-mentor':"
)
if "route == '/doctor/repair'" not in t:
    if marker not in t:
        raise SystemExit("post marker missing")
    doctor_post = (
        "        length = int(self.headers.get('Content-Length') or '0')\n"
        "        raw = self.rfile.read(length) if length > 0 else b''\n\n"
        "        if route == '/doctor/repair':\n"
        "            try:\n"
        "                body = json.loads(raw.decode('utf-8') or '{}') if raw else {}\n"
        "            except Exception:\n"
        "                body = {}\n"
        "            token = str(body.get('token') or (qs.get('token') or [''])[0] or '')\n"
        "            if token and not secrets.compare_digest(token, SESSION_TOKEN):\n"
        "                self._send_json(403, {'ok': False, 'error': 'bad token'})\n"
        "                return\n"
        "            action = str(body.get('action') or (qs.get('action') or [''])[0] or '')\n"
        "            wait = float(body.get('wait') or (qs.get('wait') or ['25'])[0] or 25)\n"
        "            result = run_doctor_repair(action, wait=wait)\n"
        "            code = 200 if result.get('ok') else 400\n"
        "            self._send_json(code, result)\n"
        "            return\n\n"
        "        if route == '/write-mentor':"
    )
    t = t.replace(marker, doctor_post, 1)
    print("POST handler ok")

get_anchor = "        if self.path.startswith('/session'):"
get_block = (
    "        if self.path.startswith('/doctor'):\n"
    "            if not request_is_local(self):\n"
    "                self.send_error(403, 'Local only')\n"
    "                return\n"
    "            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)\n"
    "            token = (qs.get('token') or [''])[0]\n"
    "            if token and not secrets.compare_digest(token, SESSION_TOKEN):\n"
    "                self._send_json(403, {'ok': False, 'error': 'bad token'})\n"
    "                return\n"
    "            warm = (qs.get('warm') or ['0'])[0] in ('1', 'true', 'yes')\n"
    "            wait = float((qs.get('wait') or ['0'])[0] or 0)\n"
    "            self._send_json(200, build_doctor_report(warm=warm, wait=wait))\n"
    "            return\n\n"
    "        if self.path.startswith('/session'):"
)
if "startswith('/doctor')" not in t:
    if get_anchor not in t:
        raise SystemExit("session GET missing")
    t = t.replace(get_anchor, get_block, 1)
    print("GET handler ok")

p.write_text(t, encoding="utf-8")
py_compile.compile(str(p), doraise=True)
print("DONE", p)
