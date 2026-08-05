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
# In-process fix-mentor jobs (Pi RPC). Local-only; not durable across restarts.
FIX_MENTOR_JOBS = {}
FIX_MENTOR_LOCK = threading.Lock()
PENDING_OPEN_LOCK = threading.Lock()
FIX_MENTOR_LOG_MAX = 120
FIX_MENTOR_JOB_TTL_SEC = 3600


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


def _path_in_allow_list(abspath):
    """Case-normalized membership for ALLOWED_OPEN_PATHS (Windows-safe)."""
    if not abspath:
        return None
    target = os.path.abspath(abspath)
    tkey = os.path.normcase(target)
    if target in ALLOWED_OPEN_PATHS:
        return target
    for p in list(ALLOWED_OPEN_PATHS):
        try:
            if os.path.normcase(os.path.abspath(p)) == tkey:
                return os.path.abspath(p)
        except Exception:
            continue
    return None


def write_mentor_package_to_path(path, raw_bytes):
    """Atomically write .mentor bytes to an allow-listed absolute path.

    open-first policy: path must already be in ALLOWED_OPEN_PATHS
    (pending-open / allow-open / /open / supervision register).
    """
    if not path:
        return None, 'missing-path'
    if not raw_bytes:
        return None, 'empty-package'
    abspath = os.path.abspath(str(path).strip().strip('"'))
    if not abspath.lower().endswith('.mentor'):
        return None, 'not-mentor'
    resolved = _path_in_allow_list(abspath)
    if not resolved:
        return None, 'not-allowed'
    abspath = resolved
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
        with PENDING_OPEN_LOCK:
            with open(PENDING_OPEN_FILE, 'w', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('warn: cannot write pending-open:', e)
        return None
    return abspath


def take_pending_open():
    """Consume one pending open (or None)."""
    with PENDING_OPEN_LOCK:
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


def _import_ai():
    """Lazy import Mentor ai package (same repo root as this file)."""
    if HTML_DIR not in sys.path:
        sys.path.insert(0, HTML_DIR)
    from ai.job_runner import (  # type: ignore
        ai_connection_health,
        build_fix_mentor_prompt,
        restart_pi_session,
        run_pi_fix_mentor_job,
    )
    from ai.session_manager import get_manager  # type: ignore
    return {
        'ai_connection_health': ai_connection_health,
        'build_fix_mentor_prompt': build_fix_mentor_prompt,
        'restart_pi_session': restart_pi_session,
        'run_pi_fix_mentor_job': run_pi_fix_mentor_job,
        'get_manager': get_manager,
    }


def resolve_pi_bin():
    """Locate pi binary (for doctor / diagnostics)."""
    ai = _import_ai()
    # detect via job_runner path
    from ai.pi_detect import detect_pi  # type: ignore
    r = detect_pi()
    return r.path if r.available else None


def _job_log_list(job):
    try:
        logs = job.get('logTail')
        if logs is None:
            return []
        return list(logs)
    except Exception:
        return []


def derive_fix_mentor_progress(job):
    """Human-facing progress from status + Pi event log heuristics."""
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
    phase = job.get('phase') or 'idle'
    phase_label = job.get('phaseLabel') or ''
    step = int(job.get('step') or 0)
    if status == 'saving' or status == 'queued':
        phase, phase_label, step = 'saving', '保存文档', 0
    elif status == 'starting':
        phase, phase_label, step = 'starting', '启动 Pi', 1
    elif status in ('running',):
        if not phase or phase in ('idle', 'starting'):
            phase, phase_label, step = 'running', 'AI 运行中', 2
        if any(k in blob for k in ('skill', 'fix-mentor', 'mentor_io')):
            if step <= 2:
                phase, phase_label, step = 'skill', '加载 skill', 2
        if any(k in blob for k in ('read_mentor', 'reading', '打开', 'unpack', 'zip')):
            phase, phase_label, step = 'read', '读取文稿', 3
        if any(k in blob for k in ('supervision', 'working_on', 'sidecar', '监管')):
            phase, phase_label, step = 'supervise', '监管改写中', 4
        if any(k in blob for k in ('write_mentor', 'writing', '写回', 'save', '已写')):
            phase, phase_label, step = 'write', '写回文稿', 5
        if any(k in blob for k in ('pi-tool', 'tool', 'bash', 'function_call')):
            if step < 4:
                phase, phase_label, step = 'tools', '调用工具', 3
    elif status == 'done':
        phase, phase_label, step = 'done', '完成', 6
    elif status in ('error', 'cancelled'):
        phase, phase_label, step = 'error', '失败', step or 2

    # Soft percent
    if status == 'done':
        pct = 100
    elif status in ('error', 'cancelled'):
        pct = min(99, max(int(job.get('progress') or 0), step * 12))
    else:
        base = {0: 5, 1: 12, 2: 25, 3: 45, 4: 62, 5: 82, 6: 100}.get(step, 20)
        creep = min(15, elapsed // 8)
        pct = min(95, max(int(job.get('progress') or 0), base + creep))

    return {
        'phase': phase,
        'phaseLabel': phase_label,
        'step': step,
        'progress': pct,
        'elapsedSec': elapsed,
        'elapsedLabel': f'{elapsed // 60}:{elapsed % 60:02d}',
        'lastLog': last_log or job.get('lastLog') or '',
    }


def public_fix_mentor_job(job):
    if not job:
        return None
    prog = derive_fix_mentor_progress(job)
    logs = _job_log_list(job)
    return {
        'ok': True,
        'id': job.get('id') or '',
        'status': job.get('status') or 'error',
        'path': job.get('path') or '',
        'threadId': job.get('threadId') or '',
        'scope': job.get('scope') or 'all',
        'message': job.get('message') or '',
        'error': job.get('error') or '',
        'exitCode': job.get('exitCode'),
        'finalText': (job.get('finalText') or '')[:4000],
        'logTail': logs[-40:],
        'lastLog': prog.get('lastLog') or '',
        'phase': prog.get('phase') or '',
        'phaseLabel': prog.get('phaseLabel') or '',
        'step': prog.get('step') or 0,
        'progress': prog.get('progress') or 0,
        'elapsedSec': prog.get('elapsedSec') or 0,
        'elapsedLabel': prog.get('elapsedLabel') or '',
        'startedAt': job.get('startedAt') or '',
        'finishedAt': job.get('finishedAt') or '',
        'via': job.get('via') or 'pi',
        'stale': bool(job.get('stale')),
        'commandPreview': job.get('commandPreview') or '',
        'sourceName': job.get('sourceName') or '',
    }


def prune_fix_mentor_jobs():
    now = time.time()
    with FIX_MENTOR_LOCK:
        dead = []
        for jid, job in list(FIX_MENTOR_JOBS.items()):
            fin = float(job.get('finishedAtEpoch') or 0)
            if fin and (now - fin) > FIX_MENTOR_JOB_TTL_SEC:
                dead.append(jid)
        for jid in dead:
            FIX_MENTOR_JOBS.pop(jid, None)


def find_active_fix_mentor_job(path=None):
    with FIX_MENTOR_LOCK:
        for job in FIX_MENTOR_JOBS.values():
            st = job.get('status')
            if st in ('starting', 'running', 'queued', 'saving'):
                if path is None:
                    return job
                if os.path.abspath(job.get('path') or '') == os.path.abspath(path):
                    return job
    return None


def get_fix_mentor_job(job_id):
    with FIX_MENTOR_LOCK:
        return FIX_MENTOR_JOBS.get(job_id)


def _everything_es_bin():
    """Locate Everything CLI (es.exe) for silent basename → path."""
    env = (os.environ.get('MENTOR_EVERYTHING_ES') or '').strip()
    if env and os.path.isfile(env):
        return env
    candidates = [
        r'C:\Program Files\Everything\es.exe',
        r'C:\Program Files (x86)\Everything\es.exe',
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    try:
        import shutil
        w = shutil.which('es') or shutil.which('es.exe')
        if w and os.path.isfile(w):
            return w
    except Exception:
        pass
    return None


def _score_mentor_hit(abspath, basename_low):
    """Prefer real .mentor under user/project roots; drop .lnk shortcuts."""
    p = os.path.normpath(abspath)
    if not p or not os.path.isfile(p):
        return -1
    base = os.path.basename(p).lower()
    if base != basename_low:
        return -1
    if base.endswith('.lnk') or p.lower().endswith('.lnk'):
        return -1
    if not base.endswith('.mentor'):
        return -1
    score = 10
    low = p.lower()
    # prefer workspace / paper / user docs
    prefer = (
        'hermes_playground', 'paper-writing', r'\documents\\', r'\desktop\\',
        r'\users\\user\\', 'mentor\\tests', 'mentor\\examples',
    )
    for frag in prefer:
        if frag in low:
            score += 5
    # de-prefer temp / recent shortcuts dirs
    bad = (r'\temp\\', r'\tmp\\', r'\appdata\\local\\temp', r'\recent\\')
    for frag in bad:
        if frag in low:
            score -= 8
    try:
        score += min(5, int(os.path.getmtime(p) % 10))  # mild recency tie-break
    except Exception:
        pass
    return score


def _search_everything_mentor(basename):
    """Return best unique-ish path via Everything, or None if ambiguous/none."""
    es = _everything_es_bin()
    if not es:
        return None
    base = os.path.basename(str(basename or '')).strip()
    if not base.lower().endswith('.mentor'):
        return None
    try:
        # -n limit; bare name search; filter ourselves
        proc = subprocess.run(
            [es, '-n', '20', base],
            capture_output=True, text=True, timeout=4,
            encoding='utf-8', errors='replace',
        )
        lines = [ln.strip() for ln in (proc.stdout or '').splitlines() if ln.strip()]
    except Exception:
        return None
    low = base.lower()
    scored = []
    for ln in lines:
        s = _score_mentor_hit(ln, low)
        if s >= 0:
            scored.append((s, os.path.normpath(ln)))
    if not scored:
        return None
    scored.sort(key=lambda x: (-x[0], -os.path.getmtime(x[1]) if os.path.isfile(x[1]) else 0))
    best_score, best = scored[0]
    # Ambiguous: second hit almost as good and different path
    if len(scored) > 1:
        s2, p2 = scored[1]
        if p2.lower() != best.lower() and s2 >= best_score - 2 and best_score < 15:
            # still allow if best clearly under prefer roots
            if best_score < 15:
                return None
    return best


def resolve_mentor_path_by_name(name, allow_everything=False):
    """Resolve basename → abs path.

    Default: index + allow-list only (safe for open/autosave).
    allow_everything=True: Everything search as last resort (AI path only).
    """
    name = (name or '').strip()
    if not name:
        return None
    low = os.path.basename(name).lower()
    # supervision index
    try:
        p = SUPERVISION_BY_NAME.get(low)
        if p and os.path.isfile(p):
            return p
    except Exception:
        pass
    # allowed open set
    hits = []
    for p in list(ALLOWED_OPEN_PATHS):
        if os.path.basename(p).lower() == low and os.path.isfile(p):
            hits.append(p)
    uniq = list(dict.fromkeys(hits))
    if len(uniq) == 1:
        return uniq[0]
    if len(uniq) > 1:
        best = None
        best_s = -1
        for p in uniq:
            s = _score_mentor_hit(p, low)
            if s > best_s:
                best_s, best = s, p
        if best:
            return best
    if not allow_everything:
        return None
    # Everything silent search (unique / high-confidence) — AI only
    found = _search_everything_mentor(low)
    if found:
        try:
            register_supervision_path(found)
        except Exception:
            pass
        try:
            ALLOWED_OPEN_PATHS.add(os.path.normpath(found))
        except Exception:
            pass
        return found
    return None


def _build_fix_mentor_command(abspath, thread_id='', scope='all'):
    """Custom override only (MENTOR_FIX_MENTOR_CMD). No Hermes default."""
    override = (os.environ.get('MENTOR_FIX_MENTOR_CMD') or '').strip()
    if not override:
        return None, False, ''
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


def ai_connection_public(warm=False, wait=0):
    ai = _import_ai()
    h = ai['ai_connection_health'](warm=bool(warm))
    if wait and not h.get('agentReady'):
        # re-check after brief settle (skill/path only)
        deadline = time.time() + float(wait)
        while time.time() < deadline and not h.get('agentReady'):
            time.sleep(0.2)
            h = ai['ai_connection_health'](warm=True)
    return h


def start_fix_mentor_job(path, thread_id='', scope='all', staged=False, source_name=''):
    """Run fix-mentor via embedded Pi RPC ONLY. No Hermes / cold CLI fallback."""
    prune_fix_mentor_jobs()
    if not path:
        return None, 'missing-path'
    abspath = os.path.abspath(path)
    if not abspath.lower().endswith('.mentor'):
        return None, 'not-mentor'
    if not os.path.isfile(abspath):
        return None, 'not-found'
    if staged:
        return None, 'staged-not-allowed'

    active = find_active_fix_mentor_job()
    if active:
        same = os.path.abspath(active.get('path') or '') == abspath
        return active, ('already-running' if same else 'busy')

    scope = scope if scope in ('all', 'thread') else 'all'
    thread_id = str(thread_id or '').strip()

    # Optional explicit custom command (tests)
    override = (os.environ.get('MENTOR_FIX_MENTOR_CMD') or '').strip()
    if override:
        cmd, shell, preview = _build_fix_mentor_command(abspath, thread_id, scope)
        if cmd is None:
            return None, 'custom-cmd-invalid'
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
                        line = (line or '').rstrip('\\r\\n')
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

    # Default: embedded Pi
    ai = _import_ai()
    health = ai['ai_connection_health'](warm=True)
    if not health.get('agentReady'):
        err = 'pi_not_found' if not (health.get('pi') or {}).get('available') else 'skill_missing'
        if health.get('error'):
            # more specific
            e = str(health.get('error'))
            if 'pi' in e.lower():
                err = 'pi_not_found'
            elif 'skill' in e.lower():
                err = 'skill_missing'
        return None, err

    job_id = secrets.token_hex(8)
    prompt = ai['build_fix_mentor_prompt'](abspath, thread_id, scope)
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
        'message': '排队进入 Pi…',
        'logTail': deque(maxlen=FIX_MENTOR_LOG_MAX),
        'commandPreview': f'pi-rpc fix-mentor {os.path.basename(abspath)}',
        'proc': None,
        'via': 'pi',
        'prompt': prompt,
        'phase': 'starting',
        'phaseLabel': '启动 Pi',
        'step': 1,
        'progress': 12,
    }
    with FIX_MENTOR_LOCK:
        FIX_MENTOR_JOBS[job_id] = job

    def runner_pi():
        try:
            ai['run_pi_fix_mentor_job'](job)
        except Exception as exc:
            job['status'] = 'error'
            job['error'] = 'run-failed'
            job['message'] = str(exc)[:300]
            job['exitCode'] = 1
            job['finishedAt'] = _utc_now()
            job['finishedAtEpoch'] = time.time()
            job['logTail'].append(f'[pi-error] {exc}')

    threading.Thread(target=runner_pi, name=f'fix-mentor-pi-{job_id}', daemon=True).start()
    return job, None


def restart_ai_session(timeout_ready=25):
    ai = _import_ai()
    return ai['restart_pi_session']()


def build_doctor_report(warm=False, wait=0):
    """Structured health report for in-app Doctor UI (Pi + skill)."""
    h = ai_connection_public(warm=warm or True, wait=wait if warm else 0)
    pi = h.get('pi') or {}
    pi_ok = bool(pi.get('available'))
    skill_ok = bool(h.get('skillDir'))
    ready = bool(h.get('agentReady'))
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
        'id': 'pi-bin',
        'ok': pi_ok,
        'severity': 'ok' if pi_ok else 'error',
        'title': 'Pi CLI' if pi_ok else '找不到 pi',
        'detail': (pi.get('path') or '') + (f' · v{pi.get("version")}' if pi.get('version') else '')
        if pi_ok else '安装 Pi coding-agent 并确保 pi 在 PATH',
        'fix': None,
    })
    checks.append({
        'id': 'fix-mentor-skill',
        'ok': skill_ok,
        'severity': 'ok' if skill_ok else 'error',
        'title': 'fix-mentor skill' if skill_ok else '找不到 fix-mentor skill',
        'detail': h.get('skillDir') or '期望 Mentor/ai-skill/fix-mentor 或 MENTOR_SKILL_ROOT',
        'fix': None,
    })
    if ready:
        sev, title, fix = 'ok', 'Pi AI 已就绪', None
    elif pi_ok and not skill_ok:
        sev, title, fix = 'error', 'Pi 可用但 skill 缺失', None
    elif not pi_ok:
        sev, title, fix = 'error', 'Pi 未就绪', 'warm-worker'
    else:
        sev, title, fix = 'warn', 'Pi 检测异常', 'warm-worker'
    detail_parts = [
        'state=' + str(h.get('state') or '?'),
        'agentReady=' + str(ready),
    ]
    if h.get('error'):
        detail_parts.append(str(h.get('error'))[:180])
    if h.get('skills'):
        detail_parts.append('skills=' + ','.join(h.get('skills') or []))
    checks.append({
        'id': 'ai-connection',
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
        'workerPort': None,
        'piPath': pi.get('path') or '',
        'piVersion': pi.get('version') or '',
        'skillDir': h.get('skillDir') or '',
        'ai': {
            'state': h.get('state'),
            'reachable': True,
            'agentReady': ready,
            'error': h.get('error') or '',
            'skills': h.get('skills') or [],
            'pi': pi,
        },
        # backward field names some UI may still read once during migrate
        'worker': {
            'state': h.get('state'),
            'reachable': True,
            'agentReady': ready,
            'error': h.get('error') or '',
            'skills': h.get('skills') or [],
        },
        'checks': checks,
        'actions': [
            {'id': 'warm-worker', 'label': '检测 / 预热 Pi'},
            {'id': 'restart-worker', 'label': '重启 Pi 会话'},
            {'id': 'refresh', 'label': '重新检测'},
        ],
        'hints': [
            '点底栏 Pi 芯片可随时打开 Doctor',
            '若 8787 被 python -m http.server 占用，/session 与 /ai-connection 会 404——关掉占用进程后运行 mentor.cmd',
            '模型在 ~/.pi/agent/settings.json 配置',
        ],
    }


def run_doctor_repair(action, wait=25):
    action = str(action or '').strip().lower()
    if action in ('warm-worker', 'warm', 'ensure-worker', 'warm-pi', 'ensure-pi'):
        h = ai_connection_public(warm=True, wait=float(wait or 0))
        return {'ok': True, 'action': 'warm-pi', 'ai': h, 'worker': h, 'report': build_doctor_report(warm=False)}
    if action in ('restart-worker', 'restart', 'restart-pi'):
        h = restart_ai_session(timeout_ready=float(wait or 25))
        return {'ok': True, 'action': 'restart-pi', 'ai': h, 'worker': h, 'report': build_doctor_report(warm=False)}
    return {'ok': False, 'error': 'unknown-action', 'message': '未知修复动作: ' + action}


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
            '/doctor/repair',
            '/pick-mentor',
        ):
            self.send_error(404, 'Not found')
            return
        if not request_is_local(self):
            self.send_error(403, 'Local only')
            return

        length = int(self.headers.get('Content-Length') or '0')
        raw = self.rfile.read(length) if length > 0 else b''

        if route == '/doctor/repair':
            try:
                body = json.loads(raw.decode('utf-8') or '{}') if raw else {}
            except Exception:
                body = {}
            token = str(body.get('token') or (qs.get('token') or [''])[0] or '')
            if token and not secrets.compare_digest(token, SESSION_TOKEN):
                self._send_json(403, {'ok': False, 'error': 'bad token'})
                return
            action = str(body.get('action') or (qs.get('action') or [''])[0] or '')
            wait = float(body.get('wait') or (qs.get('wait') or ['25'])[0] or 25)
            result = run_doctor_repair(action, wait=wait)
            code = 200 if result.get('ok') else 400
            self._send_json(code, result)
            return

        if route == '/pick-mentor':
            try:
                body = json.loads(raw.decode('utf-8') or '{}') if raw else {}
            except Exception:
                body = {}
            token = str(body.get('token') or (qs.get('token') or [''])[0] or '')
            if not token or not secrets.compare_digest(token, SESSION_TOKEN):
                self._send_json(403, {'ok': False, 'error': 'bad token'})
                return
            hint = str(body.get('name') or body.get('hint') or '')
            direct = str(body.get('path') or '').strip()
            if direct:
                # Automation / known-path bind — no OS dialog
                path = os.path.abspath(direct) if os.path.isfile(direct) else None
            else:
                # filedialog on Mentor host (single-machine)
                path = pick_mentor_path_dialog(initial_name=hint)
            if not path:
                self._send_json(200, {'ok': False, 'error': 'cancelled', 'message': '未选择文件'})
                return
            allowed = allow_open_path(path)
            if not allowed:
                self._send_json(400, {'ok': False, 'error': 'invalid', 'message': '无效 .mentor 路径'})
                return
            register_supervision_path(allowed)
            self._send_json(200, {
                'ok': True,
                'path': allowed,
                'name': os.path.basename(allowed),
            })
            return

        if route == '/write-mentor':
            try:
                token = (qs.get('token') or [''])[0] or (self.headers.get('X-Mentor-Token') or '')
                path_w = (qs.get('path') or [''])[0] or (self.headers.get('X-Mentor-Path') or '')
                # Header may arrive percent-encoded (client-safe Windows paths)
                try:
                    path_w = urllib.parse.unquote(path_w) if path_w else path_w
                except Exception:
                    pass
                if not token or not secrets.compare_digest(token, SESSION_TOKEN):
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
            except Exception as exc:
                try:
                    self._send_json(500, {
                        'ok': False,
                        'error': 'write-exception',
                        'message': str(exc)[:200],
                    })
                except Exception:
                    pass
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
            allow_everything = bool(body.get('everything') or body.get('allowEverything') or body.get('allow_everything'))
            resolved = resolve_mentor_path_by_name(name, allow_everything=allow_everything)
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
                resolved = resolve_mentor_path_by_name(name, allow_everything=True)
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
            if err in ('pi_not_found', 'pi-not-found'):
                self._send_json(503, {
                    'ok': False,
                    'error': 'pi_not_found',
                    'message': '找不到 pi（Pi coding-agent）。安装后确保 pi 在 PATH，或看底栏 Doctor。',
                })
                return
            if err in ('skill_missing', 'skill-missing', 'extension_missing'):
                self._send_json(503, {
                    'ok': False,
                    'error': err,
                    'message': 'fix-mentor skill 不可用（%s）。期望 Mentor/ai-skill/fix-mentor。' % err,
                })
                return
            if err in ('worker-down', 'worker-run-failed', 'spawn_failed') or (err and str(err).startswith('worker-')):
                self._send_json(503, {
                    'ok': False,
                    'error': err,
                    'message': 'Pi AI 不可用（%s）。看底栏 Pi 芯片，或重启 mentor-server。' % err,
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

        if self.path.startswith('/resolve-mentor-path'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if not token_ok(self, params):
                self._send_json(403, {'ok': False, 'error': 'bad-token'})
                return
            name = (params.get('name') or params.get('fileName') or [''])[0]
            allow_everything = str((params.get('everything') or ['0'])[0]).lower() in ('1', 'true', 'yes')
            resolved = resolve_mentor_path_by_name(name, allow_everything=allow_everything)
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

        if self.path.startswith('/ai-connection') or self.path.startswith('/ai-status'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query or '')
            token = (qs.get('token') or [''])[0]
            # token optional for connection probe (local only); if provided must match
            if token and not secrets.compare_digest(token, SESSION_TOKEN):
                self._send_json(403, {'ok': False, 'error': 'bad token'})
                return
            warm = (qs.get('warm') or ['0'])[0] in ('1', 'true', 'yes')
            wait = float((qs.get('wait') or ['0'])[0] or 0)
            try:
                h = ai_connection_public(warm=warm, wait=wait)
            except Exception as exc:
                h = {
                    'ok': False,
                    'reachable': False,
                    'state': 'error',
                    'agentReady': False,
                    'error': str(exc)[:200],
                }
            self._send_json(200, h)
            return

        if self.path.startswith('/doctor'):
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
            self._send_json(200, build_doctor_report(warm=warm, wait=wait))
            return

        if self.path.startswith('/session'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            try:
                ai_h = ai_connection_public(warm=False)
            except Exception as _ai_exc:
                ai_h = {
                    'agentReady': False,
                    'state': 'error',
                    'reachable': False,
                    'error': str(_ai_exc)[:200],
                    'pi': {},
                    'skillDir': '',
                }
            pi_info = ai_h.get('pi') or {}
            self._send_json(200, {
                'ok': True,
                'token': SESSION_TOKEN,
                'aiReady': bool(ai_h.get('agentReady')),
                'piPath': pi_info.get('path') or '',
                'piVersion': pi_info.get('version') or '',
                'skillDir': ai_h.get('skillDir') or '',
                'ai': {
                    'state': ai_h.get('state'),
                    'agentReady': bool(ai_h.get('agentReady')),
                    'reachable': bool(ai_h.get('reachable', True)),
                    'error': ai_h.get('error') or '',
                    'skills': ai_h.get('skills') or [],
                    'pi': pi_info,
                },
            })
            return

        super().do_GET()



class ThreadingMentorServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Concurrent requests — Pi warm / doctor must not block pending-open or save."""
    daemon_threads = True
    allow_reuse_address = True


def start_server(port, open_url=None):
    os.chdir(HTML_DIR)
    write_session_token()
    with ThreadingMentorServer(('127.0.0.1', port), MentorHandler) as httpd:
        print(f'Mentor server: http://127.0.0.1:{port}/index.html')
        time.sleep(0.3)
        try:
            webbrowser.open(open_url or f'http://127.0.0.1:{port}/index.html')
        except Exception as e:
            print('webbrowser.open failed:', e)
        try:
            threading.Thread(
                target=lambda: ai_connection_public(warm=True),
                name='ai-pi-boot',
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
        with ThreadingMentorServer(('127.0.0.1', port), MentorHandler) as httpd:
            print(f'Mentor server (no-browser): http://127.0.0.1:{port}/index.html')
            try:
                threading.Thread(target=lambda: ai_connection_public(warm=True), name='ai-pi-boot', daemon=True).start()
            except Exception:
                pass
            httpd.serve_forever()
        return

    start_server(port, open_url=open_url)


if __name__ == '__main__':
    main()
