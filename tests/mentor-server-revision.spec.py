#!/usr/bin/env python3
"""Unit/integration tests for mentor-server GET /revision."""
from __future__ import annotations

import importlib.util
import json
import os
import socketserver
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / 'mentor-server.py'


def load_server():
    spec = importlib.util.spec_from_file_location('mentor_server_under_test', SERVER_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def http_json(url: str, timeout: float = 2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='ignore')
        try:
            payload = json.loads(raw) if raw else None
        except Exception:
            payload = raw
        return exc.code, payload


def main():
    mod = load_server()
    Handler = mod.MentorHandler
    token = mod.SESSION_TOKEN

    with tempfile.TemporaryDirectory() as tmp:
        mentor = Path(tmp) / 'sample.mentor'
        mentor.write_bytes(b'PK\x03\x04mentor-test-v1')
        other = Path(tmp) / 'sample.txt'
        other.write_text('nope', encoding='utf-8')
        missing = Path(tmp) / 'missing.mentor'

        socketserver.TCPServer.allow_reuse_address = True
        httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{port}'

            def rev_url(path_value: str, tok: str = token) -> str:
                q = urllib.parse.urlencode({'path': str(path_value), 'token': tok})
                return f'{base}/revision?{q}'

            # 1) valid token + mentor
            code, body = http_json(rev_url(mentor))
            assert code == 200, (code, body)
            assert body and body.get('ok') is True
            assert isinstance(body.get('mtimeMs'), int)
            assert body.get('size') == mentor.stat().st_size
            assert isinstance(body.get('revision'), str) and ':' in body['revision']
            first_rev = body['revision']

            # stable on re-read
            code2, body2 = http_json(rev_url(mentor))
            assert code2 == 200
            assert body2['revision'] == first_rev

            # 2) missing/bad token
            code, body = http_json(rev_url(mentor, tok='bad-token'))
            assert code == 403, (code, body)
            code, body = http_json(f'{base}/revision?path={urllib.parse.quote(str(mentor))}')
            assert code == 403, (code, body)

            # 3) non-.mentor path
            code, body = http_json(rev_url(other))
            assert code == 400, (code, body)

            # 4) nonexistent mentor -> 404, no host path leak
            code, body = http_json(rev_url(missing))
            assert code == 404, (code, body)
            blob = json.dumps(body) if not isinstance(body, str) else body
            assert str(missing) not in blob
            assert 'Users' not in blob and '\\\\' not in blob

            # 5) rewrite changes revision
            time.sleep(0.02)
            mentor.write_bytes(b'PK\x03\x04mentor-test-v2-longer')
            code, body = http_json(rev_url(mentor))
            assert code == 200
            assert body['revision'] != first_rev
            assert body['size'] == mentor.stat().st_size

            print('PASS mentor-server revision')
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    main()
