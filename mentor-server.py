#!/usr/bin/env python3
"""
mentor-server.py - Mentor static server + locked /open for local .mentor files

Default port: 8787 (see PORT file; avoids clash with tools on 8765)

Word-style launch only:
  - Browser opens clean http://127.0.0.1:PORT/index.html (shell first)
  - Double-click / --open queues path via pending-open
  - Deep-link ?open= REMOVED. No --deep-link. Failures must surface.

Usage:
  python mentor-server.py
  python mentor-server.py --port 9000
  python mentor-server.py --open C:/path/to/file.mentor
"""
import http.server
import socketserver
import sys
import os
import urllib.parse
import argparse
import webbrowser
import time
import socket
import secrets
import json
import shutil
import subprocess
import threading
from collections import deque


HTML_DIR = os.path.dirname(os.path.abspath(__file__))
SESSION_TOKEN = secrets.token_urlsafe(24)
ALLOWED_OPEN_PATHS = set()
TOKEN_FILE = os.path.join(HTML_DIR, '.mentor-session')
PENDING_OPEN_FILE = os.path.join(HTML_DIR, '.mentor-pending-open.json')
# basename(lower) -> absolute .mentor path for name-based supervision poll
SUPERVISION_BY_NAME = {}
SUPERVISION_INDEX_FILE = os.path.join(HTML_DIR, '.supervision-index.json')
# In-process fix-mentor jobs (Hermes spawn). Local-only; not durable across restarts.
FIX_MENTOR_JOBS = {}
FIX_MENTOR_LOCK = threading.Lock()
FIX_MENTOR_LOG_MAX = 120
FIX_MENTOR_JOB_TTL_SEC = 3600
FIX_MENTOR_STAGE_DIR = os.path.join(HTML_DIR, 'tmp', 'fix-mentor-stage')
HERMES_WORKER_PORT = int(os.environ.get('MENTOR_HERMES_WORKER_PORT') or '8788')
HERMES_WORKER_HOST = '127.0.0.1'
HERMES_WORKER_URL = f'http://{HERMES_WORKER_HOST}:{HERMES_WORKER_PORT}'
HERMES_WORKER_SCRIPT = os.path.join(HTML_DIR, 'scripts', 'hermes_fix_mentor_worker.py')
_HERMES_WORKER_PROC = None
_HERMES_WORKER_LOCK = threading.Lock()
_HERMES_WORKER_LAST_HEALTH = {'state': 'unknown', 'checkedAt': 0}


def default_port():
    port_file = os.path.join(HTML_DIR, 'PORT')
    if os.path.isfile(port_file):
        try:
            with open(port_file, 'r', encoding='utf-8') as f:
                return int(f.read().strip() or '8787')
        except Exception:
            pass
    return 8787


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0


def is_mentor_on_port(port):
    """Return True if something on port looks like Mentor index.html."""
    try:
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html', timeout=2) as r:
            body = r.read(4000).decode('utf-8', errors='ignore')
            return 'Mentor' in body and 'psyclaw' not in body.lower()
    except Exception:
        return False


def write_session_token():
    try:
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            f.write(SESSION_TOKEN)
    except Exception as e:
        print('warn: cannot write session token:', e)


def allow_open_path(path):
    if not path:
        return None
    abspath = os.path.abspath(path)
    if not abspath.lower().endswith('.mentor'):
        return None
    if not os.path.isfile(abspath):
        return None
    ALLOWED_OPEN_PATHS.add(abspath)
    return abspath


def load_supervision_index():
    try:
        if not os.path.isfile(SUPERVISION_INDEX_FILE):
            return
        with open(SUPERVISION_INDEX_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        by = data.get('byName') or {}
        if isinstance(by, dict):
            for k, v in by.items():
                if isinstance(k, str) and isinstance(v, str):
                    SUPERVISION_BY_NAME[k.lower()] = v
    except Exception:
        pass


load_supervision_index()


def register_supervision_path(path):
    """Index a .mentor path so GET /supervision?name= can resolve it."""
    abspath = allow_open_path(path) if path else None
    if not abspath:
        abspath = os.path.abspath(path) if path else None
        if not abspath or not abspath.lower().endswith('.mentor'):
            return None
    base = os.path.basename(abspath).lower()
    SUPERVISION_BY_NAME[base] = abspath
    try:
        data = {
            'byName': dict(SUPERVISION_BY_NAME),
            'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
        with open(SUPERVISION_INDEX_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return abspath


def resolve_supervision_by_name(name):
    if not name:
        return None
    base = os.path.basename(str(name)).lower()
    path = SUPERVISION_BY_NAME.get(base)
    if path and os.path.isfile(path):
        return path
    load_supervision_index()
    path = SUPERVISION_BY_NAME.get(base)
    if path and os.path.isfile(path):
        return path
    return None


def set_pending_open(path):
    """Queue a Word-style open: client shell loads bare index, then consumes this."""
    abspath = allow_open_path(path)
    if not abspath:
        return None
    register_supervision_path(abspath)
    payload = {
        'path': abspath,
        'name': os.path.basename(abspath),
        'setAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    try:
        with open(PENDING_OPEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('warn: cannot write pending-open:', e)
        return None
    return abspath


def take_pending_open():
    """Consume one pending open (or None)."""
    if not os.path.isfile(PENDING_OPEN_FILE):
        return None
    try:
        with open(PENDING_OPEN_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        data = None
    try:
        os.remove(PENDING_OPEN_FILE)
    except Exception:
        pass
    if not isinstance(data, dict):
        return None
    path = data.get('path') or ''
    abspath = allow_open_path(path)
    if not abspath:
        return None
    register_supervision_path(abspath)
    return {
        'path': abspath,
        'name': os.path.basename(abspath),
        'setAt': data.get('setAt') or '',
    }


def request_is_local(handler):
    host = handler.client_address[0] if handler.client_address else ''
    return host in ('127.0.0.1', '::1', 'localhost')


def token_ok(handler, params=None):
    params = params or {}
    token = ''
    if 'token' in params and params['token']:
        token = params['token'][0]
    if not token:
        token = handler.headers.get('X-Mentor-Token', '')
    return token and secrets.compare_digest(token, SESSION_TOKEN)


def resolve_local_mentor_path(handler, params, require_exists=True):
    """Shared validation for /open, /revision, /supervision.

    Returns (path, None) on success or (None, (code, message, as_json)) on failure.
    """
    if not request_is_local(handler):
        return None, (403, 'Local only', False)
    if not token_ok(handler, params):
        return None, (403, 'Missing or invalid token', True)
    raw_path = (params.get('path') or [''])[0]
    raw_name = (params.get('name') or [''])[0]
    if raw_path:
        mentor_path = os.path.abspath(raw_path)
    elif raw_name:
        mentor_path = resolve_supervision_by_name(raw_name)
        if not mentor_path:
            return None, (404, 'not-found', True)
    else:
        return None, (400, 'Missing path', True)
    if not mentor_path.lower().endswith('.mentor'):
        return None, (400, 'Not a mentor file', True)
    if require_exists and not os.path.isfile(mentor_path):
        return None, (404, 'not-found', True)
    if mentor_path:
        ALLOWED_OPEN_PATHS.add(mentor_path)
    return mentor_path, None


def _unique_string_list(value):
    out = []
    seen = set()
    if not isinstance(value, list):
        return out
    for item in value:
        s = '' if item is None else str(item).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def inactive_supervision_payload(health='missing', error=''):
    """Stable inactive /supervision snapshot (no path leaks)."""
    payload = {
        'ok': True,
        'v': 1,
        'active': False,
        'health': health,
        'pendingThreadIds': [],
        'processedThreadIds': [],
        'currentThreadId': '',
    }
    if error:
        payload['error'] = error
    return payload


def read_supervision_snapshot(sidecar_path):
    """Read sidecar into a whitelist-only snapshot for GET /supervision."""
    if not os.path.isfile(sidecar_path):
        return inactive_supervision_payload('missing')
    try:
        with open(sidecar_path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
    except Exception:
        return inactive_supervision_payload('unreadable', 'invalid-json')
    if not isinstance(raw, dict):
        return inactive_supervision_payload('unreadable', 'invalid-shape')

    try:
        version = int(raw.get('v', 1))
    except (TypeError, ValueError):
        version = 1
    if version != 1:
        return inactive_supervision_payload('unsupported', 'unsupported-version')

    active = raw.get('active') is True or raw.get('active') == 1 or raw.get('active') == 'true'
    pending = _unique_string_list(raw.get('pendingThreadIds') or raw.get('pending') or [])
    processed = _unique_string_list(raw.get('processedThreadIds') or raw.get('processed') or [])
    current = ''
    if active:
        current = str(
            raw.get('currentThreadId') or raw.get('current') or raw.get('workingThreadId') or ''
        ).strip()
    requested_phase = str(raw.get('phase') or '').strip()
    if not active:
        phase = 'idle'
    elif requested_phase in ('waiting', 'working'):
        phase = requested_phase
    else:
        phase = 'working' if current else 'waiting'
    health = raw.get('health') if raw.get('health') in ('ok', 'stale', 'degraded') else 'ok'
    lock_mode = 'document' if raw.get('lockMode') == 'document' else 'pending-paragraphs'

    payload = {
        'ok': True,
        'v': 1,
        'active': bool(active),
        'health': health if active else ('ok' if health == 'ok' else health),
        'lockMode': lock_mode,
        'pendingThreadIds': pending,
        'processedThreadIds': processed,
        'currentThreadId': current if active else '',
        'phase': phase,
        'message': str(raw.get('message') or ''),
        'tool': str(raw.get('tool') or raw.get('source') or ''),
        'startedAt': str(raw.get('startedAt') or ''),
        'updatedAt': str(raw.get('updatedAt') or raw.get('startedAt') or ''),
    }
    if not active:
        compact = inactive_supervision_payload('ok' if raw.get('active') is False else 'ok')
        compact['message'] = payload['message']
        compact['tool'] = payload['tool']
        return compact
    err = str(raw.get('error') or '')
    if err:
        if err in ('invalid-json', 'invalid-shape', 'unreadable', 'poll-failed', 'unsupported-version'):
            payload['error'] = err
    try:
        st = os.stat(sidecar_path)
        payload['sidecarMtimeMs'] = st.st_mtime_ns // 1_000_000
    except OSError:
        pass
    return payload



def _utc_now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def resolve_hermes_bin():
    """Locate hermes executable for local fix-mentor spawn."""
    for key in ('MENTOR_HERMES_BIN', 'HERMES_BIN'):
        env = (os.environ.get(key) or '').strip().strip('"')
        if env and os.path.isfile(env):
            return env
    which = shutil.which('hermes')
    if which and os.path.isfile(which):
        return which
    home = os.path.expanduser('~')
    hermes_home = (os.environ.get('HERMES_HOME') or '').strip().strip('"')
    candidates = [
        os.path.join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
        os.path.join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes'),
        os.path.join(home, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
        os.path.join(home, '.local', 'bin', 'hermes'),
        os.path.join(home, '.hermes', 'bin', 'hermes'),
    ]
    if hermes_home:
        candidates.extend([
            os.path.join(hermes_home, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
            os.path.join(hermes_home, 'hermes-agent', 'venv', 'Scripts', 'hermes'),
            os.path.join(hermes_home, 'hermes-agent', 'venv', 'bin', 'hermes'),
            os.path.join(hermes_home, 'bin', 'hermes.exe'),
            os.path.join(hermes_home, 'bin', 'hermes'),
        ])
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None



def _job_log_list(job):
    try:
        logs = job.get('logTail')
        if logs is None:
            return []
        return list(logs)
    except Exception:
        return []


def derive_fix_mentor_progress(job):
    """Human-facing progress from status + Hermes stdout heuristics."""
    status = job.get('status') or 'idle'
    logs = _job_log_list(job)
    last_log = ''
    for line in reversed(logs):
        s = (line or '').strip()
        if s:
            last_log = s[:240]
            break
    started = float(job.get('startedAtEpoch') or 0) or time.time()
    finished = float(job.get('finishedAtEpoch') or 0)
    now = finished if status in ('done', 'error', 'cancelled') and finished else time.time()
    elapsed = max(0, int(now - started))

    blob = '\n'.join(logs[-30:]).lower()
    phase = 'idle'
    phase_label = ''
    # ordered soft steps 0..5
    step = 0
    if status == 'saving' or status == 'queued':
        phase, phase_label, step = 'saving', '保存文档', 0
    elif status == 'starting':
        phase, phase_label, step = 'starting', '启动 Hermes', 1
    elif status in ('running',):
        phase, phase_label, step = 'running', 'AI 运行中', 2
        if any(k in blob for k in ('loading skill', 'skill:', 'fix-mentor', 'adopt')):
            phase, phase_label, step = 'skill', '加载 skill', 2
        if any(k in blob for k in ('read_mentor', 'reading', '打开', 'unpack', 'zip')):
            phase, phase_label, step = 'read', '读取文稿', 3
        if any(k in blob for k in ('supervision', 'working_on', 'sidecar', '监管')):
            phase, phase_label, step = 'supervise', '监管改写中', 4
        if any(k in blob for k in ('write_mentor', 'writing', '写回', 'save', '已写')):
            phase, phase_label, step = 'write', '写回文稿', 5
        if any(k in blob for k in ('tool:', 'calling', 'function_call', 'web_search', 'search')):
            if step < 4:
                phase, phase_label, step = 'tools', '调用工具', 3
        if any(k in blob for k in ('thinking', 'reasoning', 'plan')):
            if step < 3:
                phase, phase_label, step = 'think', '推理中', 2
    elif status == 'done':
        phase, phase_label, step = 'done', '完成', 6
    elif status in ('error', 'cancelled'):
        phase, phase_label, step = 'error', '失败', step or 2

    # Soft percent: step base + elapsed creep (cap 95 until done)
    base = {0: 5, 1: 12, 2: 25, 3: 40, 4: 62, 5: 82, 6: 100}.get(step, 15)
    creep = min(18, elapsed // 8)  # +1% per 8s up to +18
    if status == 'done':
        pct = 100
    elif status in ('error', 'cancelled'):
        pct = min(99, base + creep)
    else:
        pct = min(95, base + creep)

    stale = False
    if status == 'running' and elapsed >= 25:
        # no new log for a while?
        # logTail has no timestamps; use message heartbeat via empty last
        if not last_log and elapsed >= 40:
            stale = True
        elif last_log and elapsed >= 90:
            # long run without phase advance past read
            if step <= 2:
                stale = True

    heartbeat = ''
    if status in ('starting', 'running', 'saving', 'queued'):
        m, s = divmod(elapsed, 60)
        heartbeat = f'{m}:{s:02d}'
        if stale:
            heartbeat += ' · 仍在跑（输出较少属正常）'

    msg = job.get('message') or ''
    if phase_label and status in ('starting', 'running'):
        msg = f'{phase_label}' + (f' · {last_log[:80]}' if last_log else '')
    elif status == 'done':
        msg = job.get('message') or 'AI 处理完成'
    elif status in ('error', 'cancelled'):
        msg = job.get('message') or job.get('error') or '失败'

    return {
        'phase': phase,
        'phaseLabel': phase_label or phase,
        'step': step,
        'progress': pct,
        'elapsedSec': elapsed,
        'elapsedLabel': heartbeat or (f'{elapsed // 60}:{elapsed % 60:02d}' if elapsed else '0:00'),
        'lastLog': last_log,
        'stale': stale,
        'message': msg,
        'logTail': logs[-12:],
    }


def public_fix_mentor_job(job):
    if not job:
        return None
    prog = derive_fix_mentor_progress(job)
    # Warm poller may already fill richer fields
    if job.get('progress') not in (None, ''):
        try: prog['progress'] = int(job.get('progress'))
        except Exception: pass
    if job.get('phaseLabel'): prog['phaseLabel'] = job.get('phaseLabel')
    if job.get('phase'): prog['phase'] = job.get('phase')
    if job.get('lastLog'): prog['lastLog'] = job.get('lastLog')
    if job.get('elapsedLabel'): prog['elapsedLabel'] = job.get('elapsedLabel')
    if job.get('elapsedSec') is not None:
        try: prog['elapsedSec'] = int(job.get('elapsedSec'))
        except Exception: pass
    if job.get('message'): prog['message'] = job.get('message')
    return {
        'ok': True,
        'id': job.get('id') or '',
        'status': job.get('status') or 'error',
        'path': job.get('path') or '',
        'name': os.path.basename(job.get('path') or '') if job.get('path') else '',
        'threadId': job.get('threadId') or '',
        'scope': job.get('scope') or 'all',
        'pid': job.get('pid'),
        'startedAt': job.get('startedAt') or '',
        'finishedAt': job.get('finishedAt') or '',
        'exitCode': job.get('exitCode'),
        'error': job.get('error') or '',
        'message': prog.get('message') or job.get('message') or '',
        'logTail': prog.get('logTail') or _job_log_list(job)[-12:],
        'commandPreview': job.get('commandPreview') or '',
        'staged': bool(job.get('staged')),
        'sourceName': job.get('sourceName') or '',
        'phase': prog.get('phase') or '',
        'phaseLabel': prog.get('phaseLabel') or '',
        'step': prog.get('step') or 0,
        'progress': prog.get('progress') or 0,
        'elapsedSec': prog.get('elapsedSec') or 0,
        'elapsedLabel': prog.get('elapsedLabel') or '',
        'lastLog': prog.get('lastLog') or '',
        'stale': bool(prog.get('stale')),
        'via': job.get('via') or ('warm-worker' if job.get('workerJobId') else 'cold-spawn'),
    }


def prune_fix_mentor_jobs():
    now = time.time()
    with FIX_MENTOR_LOCK:
        dead = []
        for jid, job in FIX_MENTOR_JOBS.items():
            st = job.get('status')
            if st in ('done', 'error', 'cancelled'):
                fin = float(job.get('finishedAtEpoch') or 0)
                if fin and (now - fin) > FIX_MENTOR_JOB_TTL_SEC:
                    dead.append(jid)
        for jid in dead:
            FIX_MENTOR_JOBS.pop(jid, None)
        # Cap finished history
        finished = [
            (jid, j) for jid, j in FIX_MENTOR_JOBS.items()
            if j.get('status') in ('done', 'error', 'cancelled')
        ]
        if len(finished) > 30:
            finished.sort(key=lambda x: float(x[1].get('finishedAtEpoch') or 0))
            for jid, _ in finished[:-30]:
                FIX_MENTOR_JOBS.pop(jid, None)


def find_active_fix_mentor_job(path=None):
    abspath = os.path.abspath(path) if path else None
    with FIX_MENTOR_LOCK:
        for job in FIX_MENTOR_JOBS.values():
            if job.get('status') not in ('queued', 'starting', 'running'):
                continue
            if abspath and os.path.abspath(job.get('path') or '') != abspath:
                continue
            return job
    return None


def get_fix_mentor_job(job_id):
    if not job_id:
        return None
    with FIX_MENTOR_LOCK:
        return FIX_MENTOR_JOBS.get(job_id)




def write_mentor_package_to_path(path, raw_bytes):
    """Atomically write .mentor bytes to an allowed absolute path."""
    if not path:
        return None, 'missing-path'
    if not raw_bytes:
        return None, 'empty-package'
    abspath = os.path.abspath(path)
    if not abspath.lower().endswith('.mentor'):
        return None, 'not-mentor'
    # Must already be allow-listed (opened / pending / registered) OR exist under ALLOWED
    allowed = abspath in ALLOWED_OPEN_PATHS
    if not allowed:
        # unique basename in allow list → reject ambiguous
        base = os.path.basename(abspath).lower()
        for p in list(ALLOWED_OPEN_PATHS):
            if os.path.abspath(p).lower() == abspath.lower():
                allowed = True
                abspath = os.path.abspath(p)
                break
    if not allowed and os.path.isfile(abspath):
        # Existing file that was never registered: still refuse (open-first policy)
        return None, 'not-allowed'
    if not allowed:
        return None, 'not-allowed'
    parent = os.path.dirname(abspath)
    if parent and not os.path.isdir(parent):
        return None, 'parent-missing'
    tmp = abspath + '.mentor-write-tmp'
    try:
        with open(tmp, 'wb') as f:
            f.write(raw_bytes)
            f.flush()
            try:
                os.fsync(f.fileno())
            except Exception:
                pass
        # Windows-friendly replace with short retry
        last_err = None
        for _ in range(8):
            try:
                os.replace(tmp, abspath)
                last_err = None
                break
            except Exception as exc:
                last_err = exc
                time.sleep(0.05)
        if last_err is not None:
            try:
                if os.path.isfile(tmp):
                    os.remove(tmp)
            except Exception:
                pass
            return None, 'write-failed:%s' % (str(last_err)[:180],)
        ALLOWED_OPEN_PATHS.add(abspath)
        try:
            register_supervision_path(abspath)
        except Exception:
            pass
        mtime_ns = 0
        size = 0
        try:
            stt = os.stat(abspath)
            mtime_ns = int(getattr(stt, 'st_mtime_ns', int(stt.st_mtime * 1e9)))
            size = int(stt.st_size)
        except Exception:
            pass
        return {
            'path': abspath,
            'name': os.path.basename(abspath),
            'mtimeNs': mtime_ns,
            'size': size,
        }, None
    except Exception as exc:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except Exception:
            pass
        return None, 'write-failed:%s' % (str(exc)[:180],)


def ensure_fix_mentor_stage_dir():
    os.makedirs(FIX_MENTOR_STAGE_DIR, exist_ok=True)
    return FIX_MENTOR_STAGE_DIR


def resolve_mentor_path_by_name(name):
    """Resolve basename -> absolute path via supervision index / allow list."""
    if not name:
        return None
    base = os.path.basename(str(name)).strip()
    if not base.lower().endswith('.mentor'):
        return None
    hit = resolve_supervision_by_name(base)
    if hit and os.path.isfile(hit):
        return os.path.abspath(hit)
    key = base.lower()
    matches = []
    for p in list(ALLOWED_OPEN_PATHS):
        try:
            if os.path.basename(p).lower() == key and os.path.isfile(p):
                matches.append(os.path.abspath(p))
        except Exception:
            continue
    uniq = []
    seen = set()
    for m in matches:
        if m not in seen:
            seen.add(m)
            uniq.append(m)
    if len(uniq) == 1:
        return uniq[0]
    try:
        ensure_fix_mentor_stage_dir()
        cands = []
        for root, _dirs, files in os.walk(FIX_MENTOR_STAGE_DIR):
            for fn in files:
                if fn.lower() == key:
                    fp = os.path.join(root, fn)
                    if os.path.isfile(fp):
                        cands.append(fp)
        if cands:
            cands.sort(key=lambda p: os.path.getmtime(p), reverse=True)
            return os.path.abspath(cands[0])
    except Exception:
        pass
    return None


def write_staged_mentor_package(name, raw_bytes):
    """Write uploaded .mentor bytes to a unique stage path. Returns abs path."""
    if not raw_bytes:
        raise ValueError('empty-package')
    base = os.path.basename(str(name or 'document.mentor')).strip() or 'document.mentor'
    if not base.lower().endswith('.mentor'):
        base = base + '.mentor'
    base = ''.join(ch if ch.isalnum() or ch in '._- ()[]' else '_' for ch in base)
    ensure_fix_mentor_stage_dir()
    job_dir = os.path.join(FIX_MENTOR_STAGE_DIR, secrets.token_hex(8))
    os.makedirs(job_dir, exist_ok=True)
    out = os.path.abspath(os.path.join(job_dir, base))
    with open(out, 'wb') as f:
        f.write(raw_bytes)
    ALLOWED_OPEN_PATHS.add(out)
    try:
        register_supervision_path(out)
    except Exception:
        pass
    return out


def _build_fix_mentor_command(abspath, thread_id='', scope='all'):
    """Return (cmd, shell:bool, preview:str). cmd is list or str."""
    override = (os.environ.get('MENTOR_FIX_MENTOR_CMD') or '').strip()
    if override:
        # JSON array preferred; else format string with {path}/{threadId}
        if override.startswith('['):
            try:
                arr = json.loads(override)
                if isinstance(arr, list) and arr:
                    cmd = [str(x).replace('{path}', abspath).replace('{threadId}', thread_id or '') for x in arr]
                    return cmd, False, ' '.join(cmd)
            except Exception:
                pass
        cmd = override.replace('{path}', abspath).replace('{threadId}', thread_id or '')
        return cmd, True, cmd

    hermes = resolve_hermes_bin()
    if not hermes:
        return None, False, ''

    prompt = f'/fix-mentor {abspath}'
    if thread_id and scope == 'thread':
        prompt += f'\n只处理 threadId={thread_id}，其它 pending 跳过。'
    elif thread_id:
        prompt += f'\n优先处理 threadId={thread_id}，然后处理其余 unanswered @AI。'

    cmd = [hermes, '-s', 'fix-mentor', 'chat', '-q', prompt, '-Q']
    preview = f'{hermes} -s fix-mentor chat -q "/fix-mentor {os.path.basename(abspath)}" -Q'
    return cmd, False, preview




def resolve_hermes_python():
    """Python that can import hermes run_agent (prefer hermes venv)."""
    hermes = resolve_hermes_bin()
    if hermes:
        # .../venv/Scripts/hermes.exe -> .../venv/Scripts/python.exe
        d = os.path.dirname(os.path.abspath(hermes))
        for name in ('python.exe', 'python'):
            p = os.path.join(d, name)
            if os.path.isfile(p):
                return p
        # Scripts -> venv root
        root = os.path.dirname(d)
        for name in ('python.exe', 'python', os.path.join('bin', 'python')):
            p = os.path.join(root, name)
            if os.path.isfile(p):
                return p
    which = shutil.which('python') or shutil.which('python3')
    return which


def hermes_worker_health(timeout=1.2):
    """Poll warm worker /health. Updates cache."""
    import urllib.request
    url = HERMES_WORKER_URL.rstrip('/') + '/health'
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
            data = json.loads(raw)
            data['checkedAt'] = time.time()
            data['reachable'] = True
            _HERMES_WORKER_LAST_HEALTH.clear()
            _HERMES_WORKER_LAST_HEALTH.update(data)
            return data
    except Exception as exc:
        data = {
            'ok': False,
            'reachable': False,
            'state': 'down',
            'error': str(exc)[:200],
            'checkedAt': time.time(),
            'agentReady': False,
        }
        _HERMES_WORKER_LAST_HEALTH.clear()
        _HERMES_WORKER_LAST_HEALTH.update(data)
        return data


def ensure_hermes_worker(timeout_ready=0):
    """Start warm worker if down. timeout_ready>0 waits until agentReady."""
    global _HERMES_WORKER_PROC
    with _HERMES_WORKER_LOCK:
        h = hermes_worker_health(timeout=0.6)
        if h.get('reachable'):
            if timeout_ready and not h.get('agentReady'):
                pass  # fall through to wait
            else:
                return h
        # dead process handle cleanup
        if _HERMES_WORKER_PROC is not None:
            try:
                if _HERMES_WORKER_PROC.poll() is not None:
                    _HERMES_WORKER_PROC = None
            except Exception:
                _HERMES_WORKER_PROC = None
        if _HERMES_WORKER_PROC is None:
            py = resolve_hermes_python()
            script = HERMES_WORKER_SCRIPT
            if not py or not os.path.isfile(script):
                return {
                    'ok': False,
                    'reachable': False,
                    'state': 'unavailable',
                    'error': 'no-python-or-script',
                    'agentReady': False,
                }
            env = os.environ.copy()
            env['MENTOR_HERMES_WORKER_PORT'] = str(HERMES_WORKER_PORT)
            env.setdefault('HERMES_YOLO_MODE', '1')
            env.setdefault('HERMES_ACCEPT_HOOKS', '1')
            env.setdefault('PYTHONUTF8', '1')
            kwargs = {
                'cwd': HTML_DIR,
                'env': env,
                'stdout': subprocess.DEVNULL,
                'stderr': subprocess.DEVNULL,
                'stdin': subprocess.DEVNULL,
            }
            if sys.platform == 'win32':
                kwargs['creationflags'] = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
            try:
                _HERMES_WORKER_PROC = subprocess.Popen([py, script], **kwargs)
            except Exception as exc:
                return {
                    'ok': False,
                    'reachable': False,
                    'state': 'spawn-failed',
                    'error': str(exc)[:200],
                    'agentReady': False,
                }
    # wait loop outside lock
    deadline = time.time() + max(0, float(timeout_ready or 0))
    h = hermes_worker_health(timeout=0.8)
    while time.time() < deadline:
        if h.get('reachable') and (not timeout_ready or h.get('agentReady') or h.get('state') == 'error'):
            break
        time.sleep(0.35)
        h = hermes_worker_health(timeout=0.8)
    if h.get('reachable') and _HERMES_WORKER_PROC is not None:
        h = dict(h)
        h['workerPid'] = _HERMES_WORKER_PROC.pid
    return h


def warm_worker_start_job(path, thread_id='', scope='all', staged=False, source_name=''):
    """Dispatch /fm to warm worker. Returns (job_dict_like, err|None)."""
    import urllib.request
    abspath = os.path.abspath(path)
    h = ensure_hermes_worker(timeout_ready=0)
    if not h.get('reachable'):
        # try start + short wait
        h = ensure_hermes_worker(timeout_ready=8)
    if not h.get('reachable'):
        return None, 'worker-down'

    prompt = f'/fix-mentor {abspath}'
    if thread_id and scope == 'thread':
        prompt += f'\n只处理 threadId={thread_id}，其它 pending 跳过。'
    elif thread_id:
        prompt += f'\n优先处理 threadId={thread_id}，然后处理其余 unanswered @AI。'

    job_id = secrets.token_hex(8)
    payload = json.dumps({
        'id': job_id,
        'path': abspath,
        'prompt': prompt,
        'threadId': thread_id or '',
    }).encode('utf-8')
    req = urllib.request.Request(
        HERMES_WORKER_URL.rstrip('/') + '/run',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='replace'))
    except Exception as exc:
        # 409 busy
        try:
            import urllib.error
            if isinstance(exc, urllib.error.HTTPError):
                body = exc.read().decode('utf-8', errors='replace')
                try:
                    j = json.loads(body)
                except Exception:
                    j = {'error': body[:200]}
                if exc.code == 409:
                    return j, 'busy'
                return None, j.get('error') or f'http-{exc.code}'
        except Exception:
            pass
        return None, f'worker-run-failed:{str(exc)[:120]}'

    # Mirror into FIX_MENTOR_JOBS for existing GET /fix-mentor-job clients
    now = _utc_now()
    job = {
        'id': data.get('id') or job_id,
        'status': data.get('status') or 'starting',
        'path': abspath,
        'threadId': thread_id or '',
        'scope': scope if scope in ('all', 'thread') else 'all',
        'staged': bool(staged),
        'sourceName': str(source_name or os.path.basename(abspath) or ''),
        'pid': None,
        'startedAt': data.get('startedAt') or now,
        'startedAtEpoch': time.time(),
        'finishedAt': '',
        'finishedAtEpoch': 0,
        'exitCode': None,
        'error': data.get('error') or '',
        'message': data.get('message') or 'warm Hermes 运行中',
        'logTail': deque(maxlen=FIX_MENTOR_LOG_MAX),
        'commandPreview': f'warm-worker /run {os.path.basename(abspath)}',
        'proc': None,
        'via': 'warm-worker',
        'workerJobId': data.get('id') or job_id,
    }
    for line in (data.get('logTail') or []):
        job['logTail'].append(str(line)[-500:])
    with FIX_MENTOR_LOCK:
        FIX_MENTOR_JOBS[job['id']] = job

    def poller():
        import urllib.request as ur
        jid = job['id']
        wjid = job.get('workerJobId') or jid
        try:
            while True:
                time.sleep(0.7)
                try:
                    q = ur.Request(HERMES_WORKER_URL.rstrip('/') + '/job?id=' + wjid, method='GET')
                    with ur.urlopen(q, timeout=3) as resp:
                        d = json.loads(resp.read().decode('utf-8', errors='replace'))
                except Exception as e:
                    job['logTail'].append(f'[worker-poll] {e}')
                    continue
                stt = d.get('status') or ''
                job['status'] = 'running' if stt in ('starting', 'running', 'queued') else stt
                if stt == 'starting':
                    job['status'] = 'starting'
                job['message'] = d.get('message') or job.get('message') or ''
                job['error'] = d.get('error') or ''
                job['exitCode'] = d.get('exitCode')
                job['phase'] = d.get('phase') or ''
                job['phaseLabel'] = d.get('phaseLabel') or ''
                job['step'] = d.get('step') or 0
                job['progress'] = d.get('progress') or 0
                job['elapsedSec'] = d.get('elapsedSec') or 0
                job['elapsedLabel'] = d.get('elapsedLabel') or ''
                job['lastLog'] = d.get('lastLog') or ''
                job['stale'] = bool(d.get('stale'))
                job['finalText'] = d.get('finalText') or job.get('finalText') or ''
                logs = d.get('logTail') or []
                if logs:
                    job['logTail'].clear()
                    for line in logs[-FIX_MENTOR_LOG_MAX:]:
                        job['logTail'].append(str(line)[-500:])
                if stt in ('done', 'error', 'cancelled'):
                    job['finishedAt'] = d.get('finishedAt') or _utc_now()
                    job['finishedAtEpoch'] = time.time()
                    if stt == 'done':
                        job['status'] = 'done'
                        job['message'] = d.get('message') or 'AI 处理完成（warm）'
                    else:
                        job['status'] = 'error'
                        job['message'] = d.get('message') or d.get('error') or '失败'
                    break
        except Exception as exc:
            job['status'] = 'error'
            job['error'] = 'worker-poll-failed'
            job['message'] = str(exc)[:300]
            job['finishedAt'] = _utc_now()
            job['finishedAtEpoch'] = time.time()

    threading.Thread(target=poller, name=f'warm-poll-{job["id"]}', daemon=True).start()
    return job, None


def start_fix_mentor_job(path, thread_id='', scope='all', staged=False, source_name=''):
    """Run fix-mentor via warm Hermes worker ONLY. No cold CLI spawn fallback."""
    prune_fix_mentor_jobs()
    if not path:
        return None, 'missing-path'
    abspath = os.path.abspath(path)
    if not abspath.lower().endswith('.mentor'):
        return None, 'not-mentor'
    if not os.path.isfile(abspath):
        return None, 'not-found'
    if staged:
        # Explicitly rejected: AI must run on the user's real disk path.
        return None, 'staged-not-allowed'

    active = find_active_fix_mentor_job()
    if active:
        same = os.path.abspath(active.get('path') or '') == abspath
        return active, ('already-running' if same else 'busy')

    scope = scope if scope in ('all', 'thread') else 'all'
    thread_id = str(thread_id or '').strip()

    # Optional explicit custom command (env) — only if set; still no hermes chat -q cold path.
    override = (os.environ.get('MENTOR_FIX_MENTOR_CMD') or '').strip()
    if override:
        cmd, shell, preview = _build_fix_mentor_command(abspath, thread_id, scope)
        if cmd is None:
            return None, 'hermes-not-found'
        job_id = secrets.token_hex(8)
        now = _utc_now()
        job = {
            'id': job_id,
            'status': 'starting',
            'path': abspath,
            'threadId': thread_id,
            'scope': scope,
            'staged': False,
            'sourceName': str(source_name or os.path.basename(abspath) or ''),
            'pid': None,
            'startedAt': now,
            'startedAtEpoch': time.time(),
            'finishedAt': '',
            'finishedAtEpoch': 0,
            'exitCode': None,
            'error': '',
            'message': '正在启动自定义 fix-mentor 命令…',
            'logTail': deque(maxlen=FIX_MENTOR_LOG_MAX),
            'commandPreview': preview,
            'proc': None,
            'via': 'custom-cmd',
        }
        with FIX_MENTOR_LOCK:
            FIX_MENTOR_JOBS[job_id] = job

        def runner_custom():
            try:
                env = os.environ.copy()
                env.setdefault('PYTHONUTF8', '1')
                kwargs = {
                    'stdout': subprocess.PIPE,
                    'stderr': subprocess.STDOUT,
                    'stdin': subprocess.DEVNULL,
                    'env': env,
                    'cwd': os.path.dirname(abspath) or HTML_DIR,
                    'text': True,
                    'encoding': 'utf-8',
                    'errors': 'replace',
                }
                if sys.platform == 'win32':
                    kwargs['creationflags'] = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
                proc = subprocess.Popen(cmd, shell=shell, **kwargs)
                job['proc'] = proc
                job['pid'] = proc.pid
                job['status'] = 'running'
                job['message'] = '自定义命令运行中'
                try:
                    assert proc.stdout is not None
                    for line in proc.stdout:
                        line = (line or '').rstrip('\r\n')
                        if line:
                            job['logTail'].append(line[-500:])
                except Exception as read_err:
                    job['logTail'].append(f'[log-read-error] {read_err}')
                code = proc.wait()
                job['exitCode'] = int(code) if code is not None else None
                job['finishedAt'] = _utc_now()
                job['finishedAtEpoch'] = time.time()
                if code == 0:
                    job['status'] = 'done'
                    job['message'] = 'AI 处理完成'
                else:
                    job['status'] = 'error'
                    job['error'] = 'exit-%s' % code
                    job['message'] = '命令退出码 %s' % code
            except Exception as exc:
                job['status'] = 'error'
                job['error'] = 'spawn-failed'
                job['message'] = str(exc)[:300]
                job['finishedAt'] = _utc_now()
                job['finishedAtEpoch'] = time.time()

        threading.Thread(target=runner_custom, name=f'fix-mentor-custom-{job_id}', daemon=True).start()
        return job, None

    # Default: warm worker only. Fail loud — never silent cold hermes chat -q.
    wjob, werr = warm_worker_start_job(
        abspath, thread_id=thread_id, scope=scope, staged=False, source_name=source_name,
    )
    if wjob is not None:
        return wjob, None
    if werr == 'busy':
        active2 = find_active_fix_mentor_job()
        if active2:
            return active2, 'busy'
        return None, 'busy'
    if werr in ('worker-down', 'worker-run-failed') or (werr and str(werr).startswith('worker-')):
        return None, werr if werr else 'worker-down'
    return None, werr or 'worker-down'



class MentorHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path or ''
        qs = urllib.parse.parse_qs(parsed.query or '')
        ctype = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()

        if route not in (
            '/allow-open',
            '/supervision/register',
            '/pending-open',
            '/run-fix-mentor',
            '/resolve-mentor-path',
            '/write-mentor',
        ):
            self.send_error(404, 'Not found')
            return
        if not request_is_local(self):
            self.send_error(403, 'Local only')
            return

        length = int(self.headers.get('Content-Length') or '0')
        raw = self.rfile.read(length) if length > 0 else b''

        if route == '/write-mentor':
            token = (qs.get('token') or [''])[0] or (self.headers.get('X-Mentor-Token') or '')
            path_w = (qs.get('path') or [''])[0] or (self.headers.get('X-Mentor-Path') or '')
            if not token or not secrets.compare_digest(token, SESSION_TOKEN):
                # try JSON body token
                try:
                    body0 = json.loads(raw.decode('utf-8') or '{}') if raw and ctype == 'application/json' else {}
                except Exception:
                    body0 = {}
                token = str(body0.get('token') or token or '')
                path_w = path_w or str(body0.get('path') or '')
            if not token or not secrets.compare_digest(token, SESSION_TOKEN):
                self._send_json(403, {'ok': False, 'error': 'bad token'})
                return
            if ctype == 'application/json':
                self._send_json(400, {
                    'ok': False,
                    'error': 'use-binary',
                    'message': 'write-mentor 请用 application/zip 二进制 body + ?path=',
                })
                return
            # open-first: path must already be allow-listed (allow-open / pending / /open)
            info, err = write_mentor_package_to_path(path_w, raw)
            if err:
                code = 403 if err == 'not-allowed' else 400 if err in (
                    'missing-path', 'empty-package', 'not-mentor', 'parent-missing',
                ) else 500
                self._send_json(code, {
                    'ok': False,
                    'error': err,
                    'message': {
                        'not-allowed': '路径未授权（先打开/注册该 .mentor）',
                        'missing-path': '缺少 path',
                        'empty-package': '内容为空',
                        'not-mentor': '仅支持 .mentor',
                        'parent-missing': '目录不存在',
                    }.get(err, err),
                })
                return
            self._send_json(200, {'ok': True, **info})
            return

        if route == '/run-fix-mentor' and ctype in ('application/zip', 'application/octet-stream'):
            self._send_json(400, {
                'ok': False,
                'error': 'staged-not-allowed',
                'message': 'AI 处理不再接受暂存上传。请用 mentor.cmd / 桌面打开真实 .mentor 路径。',
            })
            return

        try:
            body = json.loads(raw.decode('utf-8') or '{}')
        except Exception:
            self._send_json(400, {'ok': False, 'error': 'invalid json'})
            return

        token = str(body.get('token') or '')
        path = str(body.get('path') or '')
        if not token or not secrets.compare_digest(token, SESSION_TOKEN):
            self._send_json(403, {'ok': False, 'error': 'bad token'})
            return

        if route == '/resolve-mentor-path':
            name = str(body.get('name') or path or '')
            resolved = resolve_mentor_path_by_name(name)
            if not resolved:
                self._send_json(404, {
                    'ok': False,
                    'error': 'not-found',
                    'message': '无法按文件名解析: %s' % os.path.basename(name or ''),
                })
                return
            self._send_json(200, {
                'ok': True,
                'path': resolved,
                'name': os.path.basename(resolved),
            })
            return

        if route == '/supervision/register':
            registered = register_supervision_path(path)
            if not registered:
                self._send_json(400, {'ok': False, 'error': 'invalid mentor path'})
                return
            self._send_json(200, {
                'ok': True,
                'path': registered,
                'name': os.path.basename(registered),
            })
            return

        if route == '/pending-open':
            queued = set_pending_open(path)
            if not queued:
                self._send_json(400, {'ok': False, 'error': 'invalid mentor path'})
                return
            self._send_json(200, {
                'ok': True,
                'path': queued,
                'name': os.path.basename(queued),
            })
            return

        if route == '/allow-open':
            allowed = allow_open_path(path)
            if not allowed:
                self._send_json(400, {'ok': False, 'error': 'invalid mentor path'})
                return
            self._send_json(200, {'ok': True, 'path': allowed})
            return

        if route == '/run-fix-mentor':
            thread_id = str(body.get('threadId') or body.get('thread_id') or '')
            scope = str(body.get('scope') or 'all').strip().lower() or 'all'
            name = str(body.get('name') or '')
            if body.get('packageBase64') or body.get('package') or body.get('staged'):
                self._send_json(400, {
                    'ok': False,
                    'error': 'staged-not-allowed',
                    'message': '不再接受 packageBase64/staged。请提供真实磁盘 path。',
                })
                return
            if not path and name:
                resolved = resolve_mentor_path_by_name(name)
                if resolved:
                    path = resolved
            if not path:
                self._send_json(400, {
                    'ok': False,
                    'error': 'missing-path',
                    'message': '必须提供真实 .mentor 绝对路径',
                })
                return
            job, err = start_fix_mentor_job(
                path, thread_id=thread_id, scope=scope, staged=False, source_name=name or '',
            )
            if err == 'hermes-not-found':
                self._send_json(503, {
                    'ok': False,
                    'error': 'hermes-not-found',
                    'message': '找不到 hermes（自定义 MENTOR_FIX_MENTOR_CMD 时）。',
                })
                return
            if err in ('worker-down', 'worker-run-failed') or (err and str(err).startswith('worker-')):
                self._send_json(503, {
                    'ok': False,
                    'error': err,
                    'message': 'Hermes warm worker 不可用（%s）。看底栏 Hermes 芯片，或重启 mentor-server。' % err,
                })
                return
            if err == 'staged-not-allowed':
                self._send_json(400, {
                    'ok': False,
                    'error': 'staged-not-allowed',
                    'message': 'AI 处理必须用真实磁盘路径。',
                })
                return
            if err in ('missing-path', 'not-mentor', 'not-found', 'invalid mentor path'):
                self._send_json(400, {
                    'ok': False,
                    'error': err or 'invalid-path',
                    'message': '无效的 .mentor 路径',
                })
                return
            if err in ('already-running', 'busy'):
                payload = public_fix_mentor_job(job) or {}
                payload['ok'] = False
                payload['error'] = err
                payload['message'] = (
                    '该文件已有 AI 任务在跑' if err == 'already-running'
                    else '已有其它 AI 任务在跑，请稍候'
                )
                self._send_json(409, payload)
                return
            if err:
                self._send_json(500, {'ok': False, 'error': err, 'message': str(err)})
                return
            payload = public_fix_mentor_job(job) or {}
            payload['ok'] = True
            self._send_json(202, payload)
            return

        self.send_error(404, 'Not found')

    def do_GET(self):
        if self.path.startswith('/open'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            mentor_path, err = resolve_local_mentor_path(self, params, require_exists=True)
            if err:
                code, message, _as_json = err
                if message == 'not-found':
                    self.send_error(404, 'File not found')
                else:
                    self.send_error(code, message)
                return
            ALLOWED_OPEN_PATHS.add(mentor_path)
            with open(mentor_path, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if self.path.startswith('/pending-open'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if not token_ok(self, params):
                self._send_json(403, {'ok': False, 'error': 'bad-token'})
                return
            item = take_pending_open()
            if not item:
                self._send_json(200, {'ok': False, 'empty': True})
                return
            self._send_json(200, {
                'ok': True,
                'path': item['path'],
                'name': item['name'],
                'setAt': item.get('setAt') or '',
            })
            return

        if self.path.startswith('/revision'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            mentor_path, err = resolve_local_mentor_path(self, params, require_exists=True)
            if err:
                code, message, as_json = err
                if as_json or code == 404:
                    self._send_json(code, {
                        'ok': False,
                        'error': 'not-found' if message == 'not-found' else message,
                    })
                else:
                    self.send_error(code, message)
                return
            try:
                stt = os.stat(mentor_path)
            except FileNotFoundError:
                self._send_json(404, {'ok': False, 'error': 'not-found'})
                return
            self._send_json(200, {
                'ok': True,
                'mtimeMs': stt.st_mtime_ns // 1_000_000,
                'size': stt.st_size,
                'revision': f'{stt.st_mtime_ns}:{stt.st_size}',
            })
            return

        if self.path.startswith('/supervision'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            mentor_path, err = resolve_local_mentor_path(self, params, require_exists=False)
            if err:
                code, message, as_json = err
                if as_json or code in (400, 403, 404):
                    err_code = 'not-found' if message == 'not-found' else (
                        'bad-token' if code == 403 else 'bad-request'
                    )
                    self._send_json(code, {'ok': False, 'active': False, 'error': err_code})
                else:
                    self.send_error(code, message)
                return
            side = mentor_path + '.supervision.json'
            self._send_json(200, read_supervision_snapshot(side))
            return

        if self.path.startswith('/fix-mentor-job'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if not token_ok(self, params):
                self._send_json(403, {'ok': False, 'error': 'bad-token'})
                return
            job_id = (params.get('id') or [''])[0]
            job = get_fix_mentor_job(job_id) if job_id else None
            if not job and not job_id:
                job = find_active_fix_mentor_job()
            if not job:
                self._send_json(404, {'ok': False, 'error': 'not-found'})
                return
            payload = public_fix_mentor_job(job) or {}
            payload['ok'] = True
            self._send_json(200, payload)
            return

        if self.path.startswith('/hermes-connection') or self.path.startswith('/hermes-status'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            token = (qs.get('token') or [''])[0]
            if token and not secrets.compare_digest(token, SESSION_TOKEN):
                self._send_json(403, {'ok': False, 'error': 'bad token'})
                return
            warm = (qs.get('warm') or ['0'])[0] in ('1', 'true', 'yes')
            wait = float((qs.get('wait') or ['0'])[0] or 0)
            if warm:
                h = ensure_hermes_worker(timeout_ready=wait)
            else:
                h = hermes_worker_health(timeout=0.8)
                if not h.get('reachable'):
                    h = ensure_hermes_worker(timeout_ready=0)
            h = dict(h or {})
            h['ok'] = True
            h['mode'] = 'warm'
            h['hermesBin'] = resolve_hermes_bin() or ''
            self._send_json(200, h)
            return

        if self.path.startswith('/session'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            self._send_json(200, {
                'ok': True,
                'token': SESSION_TOKEN,
                'hermes': bool(resolve_hermes_bin()),
                'hermesPath': resolve_hermes_bin() or '',
                'hermesWorker': {
                    'port': HERMES_WORKER_PORT,
                    'state': _HERMES_WORKER_LAST_HEALTH.get('state'),
                    'agentReady': bool(_HERMES_WORKER_LAST_HEALTH.get('agentReady')),
                    'reachable': bool(_HERMES_WORKER_LAST_HEALTH.get('reachable')),
                },
            })
            return

        super().do_GET()



def start_server(port, open_url=None):
    os.chdir(HTML_DIR)
    write_session_token()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', port), MentorHandler) as httpd:
        print(f'Mentor server: http://127.0.0.1:{port}/index.html')
        time.sleep(0.3)
        try:
            webbrowser.open(open_url or f'http://127.0.0.1:{port}/index.html')
        except Exception as e:
            print('webbrowser.open failed:', e)
        try:
            threading.Thread(
                target=lambda: ensure_hermes_worker(timeout_ready=0),
                name='hermes-worker-boot',
                daemon=True,
            ).start()
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('Stopping...')


def register_open_on_running(port, path):
    """When server already runs, queue pending-open only (no deep-link / allow-open mask)."""
    token = ''
    try:
        with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
            token = f.read().strip()
    except Exception:
        pass
    if not token:
        print('ERROR: no session token file for pending-open')
        return False
    try:
        import urllib.request
        payload = json.dumps({'token': token, 'path': os.path.abspath(path)}).encode('utf-8')
        req = urllib.request.Request(
            f'http://127.0.0.1:{port}/pending-open',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=2) as r:
            body = json.loads(r.read().decode('utf-8', errors='ignore') or '{}')
            return bool(body.get('ok'))
    except Exception as e:
        print('ERROR: pending-open failed:', e)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=None)
    parser.add_argument('--open', type=str, help='Open a .mentor file (Word-style pending queue)')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    port = args.port if args.port is not None else default_port()

    open_path = allow_open_path(args.open) if args.open else None
    # Word-style only: clean shell URL. File arrives via pending-open.
    open_url = f'http://127.0.0.1:{port}/index.html'
    if open_path:
        queued = set_pending_open(open_path)
        if not queued:
            print('ERROR: --open failed to queue pending-open:', args.open)
            sys.exit(3)

    if is_port_in_use(port):
        if is_mentor_on_port(port):
            print(f'Port {port} already running Mentor. Opening browser...')
            if open_path:
                ok = register_open_on_running(port, open_path)
                if not ok:
                    print('ERROR: pending-open failed on running server:', open_path)
                    print('No deep-link fallback. Fix server /pending-open.')
                    sys.exit(3)
                print('queued pending-open', open_path)
                open_url = f'http://127.0.0.1:{port}/index.html'
            if not args.no_browser:
                webbrowser.open(open_url)
            return
        print(f'ERROR: Port {port} is in use by another application (not Mentor).')
        print(f'Change the number in {os.path.join(HTML_DIR, "PORT")} or free the port.')
        sys.exit(2)

    if args.no_browser:
        os.chdir(HTML_DIR)
        write_session_token()
        if open_path:
            set_pending_open(open_path)
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(('127.0.0.1', port), MentorHandler) as httpd:
            print(f'Mentor server (no-browser): http://127.0.0.1:{port}/index.html')
            try:
                threading.Thread(target=lambda: ensure_hermes_worker(timeout_ready=0), name='hermes-worker-boot', daemon=True).start()
            except Exception:
                pass
            httpd.serve_forever()
        return

    start_server(port, open_url=open_url)


if __name__ == '__main__':
    main()
