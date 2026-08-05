#!/usr/bin/env python3
"""Tests for mentor-server /run-fix-mentor + /fix-mentor-job."""
from __future__ import annotations

import importlib.util
import json
import os
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "mentor-server.py"


def load_server():
    spec = importlib.util.spec_from_file_location("mentor_server_fix_mentor_job", SERVER_PATH)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def http_json(url: str, data=None, method=None, timeout: float = 3.0):
    headers = {}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = method or "POST"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(raw) if raw else None
        except Exception:
            payload = raw
        return exc.code, payload


def main():
    mod = load_server()
    assert hasattr(mod, "start_fix_mentor_job")
    assert hasattr(mod, "resolve_pi_bin")
    assert hasattr(mod, "public_fix_mentor_job")
    assert hasattr(mod, "ai_connection_public")

    # Pure helper: override command
    os.environ["MENTOR_FIX_MENTOR_CMD"] = json.dumps([sys.executable, "-c", "print('hello-fix'); import sys; sys.exit(0)"])

    with tempfile.TemporaryDirectory() as tmp:
        mentor = Path(tmp) / "sample.mentor"
        mentor.write_bytes(b"PK\x03\x04mentor-test-v1")

        socketserver.TCPServer.allow_reuse_address = True
        httpd = socketserver.TCPServer(("127.0.0.1", 0), mod.MentorHandler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{port}"
            token = mod.SESSION_TOKEN

            # session exposes hermes flag
            code, body = http_json(f"{base}/session")
            assert code == 200 and body["ok"] is True and body["token"] == token

            # missing token
            code, body = http_json(
                f"{base}/run-fix-mentor",
                {"path": str(mentor), "token": "bad"},
            )
            assert code == 403, (code, body)

            # bad path
            code, body = http_json(
                f"{base}/run-fix-mentor",
                {"path": str(Path(tmp) / "nope.txt"), "token": token},
            )
            assert code == 400, (code, body)

            # start job
            code, body = http_json(
                f"{base}/run-fix-mentor",
                {"path": str(mentor), "token": token, "threadId": "abc123", "scope": "all"},
            )
            assert code == 202, (code, body)
            assert body["ok"] is True
            assert body["id"]
            assert body["status"] in ("starting", "running", "done")
            job_id = body["id"]

            # busy / already-running
            code2, body2 = http_json(
                f"{base}/run-fix-mentor",
                {"path": str(mentor), "token": token},
            )
            # may be 409 if still running, or 202 if finished extremely fast
            assert code2 in (202, 409), (code2, body2)

            # poll until done
            deadline = time.time() + 8
            final = None
            while time.time() < deadline:
                q = urllib.parse.urlencode({"id": job_id, "token": token})
                c, b = http_json(f"{base}/fix-mentor-job?{q}")
                assert c == 200, (c, b)
                final = b
                if b.get("status") in ("done", "error", "cancelled"):
                    break
                time.sleep(0.15)
            assert final is not None
            assert final["status"] == "done", final
            assert final["exitCode"] == 0
            assert any("hello-fix" in line for line in (final.get("logTail") or [])), final

            # idle query without id: ok if 404 when no active job
            q = urllib.parse.urlencode({"token": token})
            c, b = http_json(f"{base}/fix-mentor-job?{q}")
            assert c in (200, 404), (c, b)

            # second run after done should succeed
            code3, body3 = http_json(
                f"{base}/run-fix-mentor",
                {"path": str(mentor), "token": token},
            )
            assert code3 == 202, (code3, body3)

            # wait second job
            jid2 = body3["id"]
            deadline = time.time() + 8
            while time.time() < deadline:
                q = urllib.parse.urlencode({"id": jid2, "token": token})
                c, b = http_json(f"{base}/fix-mentor-job?{q}")
                if b and b.get("status") in ("done", "error"):
                    break
                time.sleep(0.1)

            # stage upload must be rejected (no backward compat)
            req = urllib.request.Request(
                f"{base}/run-fix-mentor?token={token}&name=demo.mentor",
                data=b"PKfake",
                headers={"Content-Type": "application/zip"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req, timeout=3)
                raise AssertionError("stage upload should fail")
            except urllib.error.HTTPError as exc:
                assert exc.code == 400, exc.code
                raw = exc.read().decode("utf-8", errors="ignore")
                assert "staged-not-allowed" in raw, raw

            print("PASS mentor-server-fix-mentor-job")
        finally:
            httpd.shutdown()
            # cleanup env
            os.environ.pop("MENTOR_FIX_MENTOR_CMD", None)



def test_stage_upload_rejected():
    """Stage upload is intentionally removed — must 400."""
    print('stage test skipped in main(); covered below if helpers exist')


def test_write_mentor_path():
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        target = td / "paper.mentor"
        target.write_bytes(b"PKOLD")
        srv, thread, port, token, module = start_server(td)
        try:
            # allow path
            code, body = http_json("POST", port, "/allow-open", {"token": token, "path": str(target)})
            assert code == 200, body
            new_bytes = b"PKNEWCONTENT"
            code, body = http_json(
                "POST",
                port,
                f"/write-mentor?token={token}&path={str(target)}",
                raw=new_bytes,
                content_type="application/zip",
            )
            assert code == 200, body
            assert body.get("ok") is True
            assert target.read_bytes() == new_bytes
            # not allowed path
            other = td / "other.mentor"
            code2, body2 = http_json(
                "POST",
                port,
                f"/write-mentor?token={token}&path={str(other)}",
                raw=new_bytes,
                content_type="application/zip",
            )
            assert code2 == 403, body2
        finally:
            srv.shutdown()
            thread.join(timeout=5)

if __name__ == "__main__":
    main()
