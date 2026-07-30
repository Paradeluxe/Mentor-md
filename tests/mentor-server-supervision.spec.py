#!/usr/bin/env python3
"""Integration tests for mentor-server GET /supervision snapshot contract."""
from __future__ import annotations

import importlib.util
import json
import os
import socketserver
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / 'mentor-server.py'


def load_server():
    spec = importlib.util.spec_from_file_location('mentor_server_supervision_under_test', SERVER_PATH)
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

    # Pure helpers first (if present)
    if hasattr(mod, 'inactive_supervision_payload'):
        p = mod.inactive_supervision_payload('missing')
        assert p['ok'] is True and p['active'] is False and p['health'] == 'missing'
        assert p['v'] == 1
        assert p['pendingThreadIds'] == [] and p['currentThreadId'] == ''

    with tempfile.TemporaryDirectory() as tmp:
        mentor = Path(tmp) / 'sample.mentor'
        mentor.write_bytes(b'PK\x03\x04mentor-test-v1')
        other = Path(tmp) / 'sample.txt'
        other.write_text('nope', encoding='utf-8')
        sidecar = Path(str(mentor) + '.supervision.json')

        socketserver.TCPServer.allow_reuse_address = True
        httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{port}'

            def supervision_url(path_value: str, tok: str = token) -> str:
                q = urllib.parse.urlencode({'path': str(path_value), 'token': tok})
                return f'{base}/supervision?{q}'

            # missing sidecar
            code, body = http_json(supervision_url(mentor))
            assert code == 200, (code, body)
            assert body == {
                'ok': True,
                'v': 1,
                'active': False,
                'health': 'missing',
                'pendingThreadIds': [],
                'processedThreadIds': [],
                'currentThreadId': '',
            }, body

            # valid active sidecar
            sidecar.write_text(
                json.dumps({
                    'v': 1,
                    'active': True,
                    'phase': 'working',
                    'pendingThreadIds': ['t1', 't2'],
                    'processedThreadIds': ['t0'],
                    'currentThreadId': 't1',
                    'tool': 'fix-mentor',
                    'message': 'working',
                    'extraLeak': 'C:/Users/secret/path.mentor',
                    'startedAt': '2026-01-01T00:00:00Z',
                    'updatedAt': '2026-01-01T00:01:00Z',
                }),
                encoding='utf-8',
            )
            code, body = http_json(supervision_url(mentor))
            assert code == 200, (code, body)
            assert body['ok'] is True
            assert body['active'] is True
            assert body['health'] == 'ok'
            assert body['v'] == 1
            assert body['currentThreadId'] == 't1'
            assert body['pendingThreadIds'] == ['t1', 't2']
            assert body['processedThreadIds'] == ['t0']
            assert body['phase'] == 'working'
            assert body['tool'] == 'fix-mentor'
            assert 'extraLeak' not in body
            blob = json.dumps(body)
            assert 'Users' not in blob
            assert 'secret' not in blob

            # truncated JSON must be unreadable, not a clean inactive missing shape
            sidecar.write_text('{"v":1,"active":true,', encoding='utf-8')
            code, body = http_json(supervision_url(mentor))
            assert code == 200, (code, body)
            assert body['ok'] is True
            assert body['active'] is False
            assert body['health'] == 'unreadable'
            assert body.get('error') in ('invalid-json', 'unreadable', 'invalid-shape')
            blob = json.dumps(body)
            assert 'Users' not in blob
            assert str(mentor) not in blob
            assert 'Traceback' not in blob

            # non-dict JSON
            sidecar.write_text('[1,2,3]', encoding='utf-8')
            code, body = http_json(supervision_url(mentor))
            assert code == 200
            assert body['active'] is False
            assert body['health'] == 'unreadable'

            # bad token
            code, body = http_json(supervision_url(mentor, tok='bad'))
            assert code == 403, (code, body)

            # non-.mentor path
            code, body = http_json(supervision_url(other))
            assert code == 400, (code, body)

            print('PASS mentor-server supervision')
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    main()
