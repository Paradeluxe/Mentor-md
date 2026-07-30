#!/usr/bin/env python3
"""
mentor-server.py - Mentor static server + locked /open for local .mentor files

Default port: 8787 (see PORT file; avoids clash with tools on 8765)

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
    """Shared validation for /open and /revision.

    Returns (path, None) on success or (None, (code, message, as_json)) on failure.
    as_json True means caller should emit JSON error body (revision path).
    """
    if not request_is_local(handler):
        return None, (403, 'Local only', False)
    if not token_ok(handler, params):
        return None, (403, 'Missing or invalid token', False)
    raw_path = (params.get('path') or [''])[0]
    if not raw_path:
        return None, (400, 'Missing path', False)
    mentor_path = os.path.abspath(raw_path)
    if not mentor_path.lower().endswith('.mentor'):
        return None, (400, 'Not a mentor file', False)
    if require_exists and not os.path.isfile(mentor_path):
        return None, (404, 'not-found', True)
    return mentor_path, None


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
        if not self.path.startswith('/allow-open'):
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
            # Token already proved local session. Accept any existing local .mentor
            # (refresh with ?open= must not die just because in-memory allowlist reset).
            ALLOWED_OPEN_PATHS.add(mentor_path)
            with open(mentor_path, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Length', str(len(data)))
            # Same-origin only: do not emit Access-Control-Allow-Origin
            self.end_headers()
            self.wfile.write(data)
            return
        if self.path.startswith('/revision'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            mentor_path, err = resolve_local_mentor_path(self, params, require_exists=True)
            if err:
                code, message, as_json = err
                if as_json or code == 404:
                    self._send_json(code, {'ok': False, 'error': 'not-found' if message == 'not-found' else message})
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
    """When server already runs, register path with its session token."""
    token = ''
    try:
        with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
            token = f.read().strip()
    except Exception:
        pass
    if not token:
        return False
    try:
        import urllib.request
        payload = json.dumps({'token': token, 'path': os.path.abspath(path)}).encode('utf-8')
        req = urllib.request.Request(
            f'http://127.0.0.1:{port}/allow-open',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=2) as r:
            body = json.loads(r.read().decode('utf-8', errors='ignore') or '{}')
            return bool(body.get('ok'))
    except Exception as e:
        print('allow-open failed:', e)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=None)
    parser.add_argument('--open', type=str, help='Open a .mentor file')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    port = args.port if args.port is not None else default_port()

    open_path = allow_open_path(args.open) if args.open else None
    open_url = f'http://127.0.0.1:{port}/index.html'
    if open_path:
        open_url += f'?open={urllib.parse.quote(open_path)}&token={urllib.parse.quote(SESSION_TOKEN)}'

    if is_port_in_use(port):
        if is_mentor_on_port(port):
            print(f'Port {port} already running Mentor. Opening browser...')
            if open_path:
                register_open_on_running(port, open_path)
                # Prefer existing server token for client fetch
                try:
                    with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
                        existing = f.read().strip()
                    if existing:
                        open_url = (
                            f'http://127.0.0.1:{port}/index.html'
                            f'?open={urllib.parse.quote(open_path)}&token={urllib.parse.quote(existing)}'
                        )
                except Exception:
                    pass
            if not args.no_browser:
                webbrowser.open(open_url)
            return
        print(f'ERROR: Port {port} is in use by another application (not Mentor).')
        print(f'Change the number in {os.path.join(HTML_DIR, "PORT")} or free the port.')
        sys.exit(2)

    if args.no_browser:
        os.chdir(HTML_DIR)
        write_session_token()
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(('127.0.0.1', port), MentorHandler) as httpd:
            print(f'Mentor server (no-browser): http://127.0.0.1:{port}/index.html')
            httpd.serve_forever()
        return

    start_server(port, open_url=open_url)


if __name__ == '__main__':
    main()
