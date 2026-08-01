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


HTML_DIR = os.path.dirname(os.path.abspath(__file__))
SESSION_TOKEN = secrets.token_urlsafe(24)
ALLOWED_OPEN_PATHS = set()
TOKEN_FILE = os.path.join(HTML_DIR, '.mentor-session')
PENDING_OPEN_FILE = os.path.join(HTML_DIR, '.mentor-pending-open.json')
# basename(lower) -> absolute .mentor path for name-based supervision poll
SUPERVISION_BY_NAME = {}
SUPERVISION_INDEX_FILE = os.path.join(HTML_DIR, '.supervision-index.json')


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


class MentorHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, code, payload):
        data = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path or ''
        if route not in ('/allow-open', '/supervision/register', '/pending-open'):
            self.send_error(404, 'Not found')
            return
        if not request_is_local(self):
            self.send_error(403, 'Local only')
            return
        length = int(self.headers.get('Content-Length') or '0')
        raw = self.rfile.read(length) if length > 0 else b''
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
        allowed = allow_open_path(path)
        if not allowed:
            self._send_json(400, {'ok': False, 'error': 'invalid mentor path'})
            return
        self._send_json(200, {'ok': True, 'path': allowed})

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
                st = os.stat(mentor_path)
            except FileNotFoundError:
                self._send_json(404, {'ok': False, 'error': 'not-found'})
                return
            self._send_json(200, {
                'ok': True,
                'mtimeMs': st.st_mtime_ns // 1_000_000,
                'size': st.st_size,
                'revision': f'{st.st_mtime_ns}:{st.st_size}',
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
        if self.path.startswith('/session'):
            if not request_is_local(self):
                self.send_error(403, 'Local only')
                return
            self._send_json(200, {'ok': True, 'token': SESSION_TOKEN})
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
            httpd.serve_forever()
        return

    start_server(port, open_url=open_url)


if __name__ == '__main__':
    main()
