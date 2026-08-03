#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Warm Hermes worker for Mentor fix-mentor jobs.

Keeps one AIAgent (+ preloaded fix-mentor skill) alive so the first real /fm
does not pay full cold-start (Python import + skill load + agent construct).

Protocol (HTTP, loopback only):
  GET  /health          -> connection + agent state
  POST /warmup          -> force load agent if idle
  POST /run             -> JSON {id, path, prompt, threadId?}
  GET  /job?id=         -> job status + logTail + progress
  POST /shutdown        -> exit

Env:
  MENTOR_HERMES_WORKER_PORT (default 8788)
  MENTOR_HERMES_HOME / HERMES_HOME
"""
from __future__ import annotations

import json
import logging
import os
import sys
import threading
import time
import traceback
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# --- bootstrap hermes package path ---
def _find_hermes_agent_root():
    env = (os.environ.get("MENTOR_HERMES_AGENT_ROOT") or "").strip().strip('"')
    if env and os.path.isdir(env):
        return env
    home = os.path.expanduser("~")
    hermes_home = (os.environ.get("HERMES_HOME") or "").strip().strip('"')
    cands = [
        os.path.join(home, "AppData", "Local", "hermes", "hermes-agent"),
        os.path.join(home, ".hermes", "hermes-agent"),
    ]
    if hermes_home:
        cands.insert(0, os.path.join(hermes_home, "hermes-agent"))
        cands.insert(0, hermes_home)
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "run_agent.py")):
            return c
    return None


HERMES_ROOT = _find_hermes_agent_root()
if HERMES_ROOT and HERMES_ROOT not in sys.path:
    sys.path.insert(0, HERMES_ROOT)

# Non-interactive defaults before any hermes import side effects
os.environ.setdefault("HERMES_YOLO_MODE", "1")
os.environ.setdefault("HERMES_ACCEPT_HOOKS", "1")
os.environ.setdefault("PYTHONUTF8", "1")

PORT = int(os.environ.get("MENTOR_HERMES_WORKER_PORT") or "8788")
HOST = "127.0.0.1"
LOG_MAX = 200

logging.basicConfig(
    level=logging.INFO,
    format="[hermes-worker] %(asctime)s %(levelname)s %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("hermes-worker")

_lock = threading.RLock()
_agent = None
_agent_err = ""
_agent_ready_at = 0.0
_started_at = time.time()
_skills_loaded = []
_state = "starting"  # starting | loading | ready | busy | error | stopped
_jobs = {}
_current_job_id = None


def _set_state(s, err=""):
    global _state, _agent_err
    with _lock:
        _state = s
        if err:
            _agent_err = str(err)[:500]


def _append_job_log(job, line):
    line = (line or "").rstrip("\r\n")
    if not line:
        return
    with _lock:
        job["logTail"].append(line[-500:])
        job["lastLog"] = line[-240:]
        job["lastLogAt"] = time.time()
        # lightweight phase from line
        low = line.lower()
        if any(k in low for k in ("supervision", "working_on", "监管")):
            job["phase"] = "supervise"
            job["phaseLabel"] = "监管改写中"
            job["step"] = 4
            job["progress"] = max(int(job.get("progress") or 0), 62)
        elif any(k in low for k in ("write_mentor", "写回", "writing")):
            job["phase"] = "write"
            job["phaseLabel"] = "写回文稿"
            job["step"] = 5
            job["progress"] = max(int(job.get("progress") or 0), 82)
        elif any(k in low for k in ("read_mentor", "reading", "打开")):
            job["phase"] = "read"
            job["phaseLabel"] = "读取文稿"
            job["step"] = 3
            job["progress"] = max(int(job.get("progress") or 0), 40)
        elif any(k in low for k in ("tool", "search", "web_")):
            job["phase"] = "tools"
            job["phaseLabel"] = "调用工具"
            job["step"] = max(int(job.get("step") or 0), 3)
            job["progress"] = max(int(job.get("progress") or 0), 45)


def _build_agent():
    """Construct warm AIAgent with fix-mentor skill preloaded."""
    global _agent, _agent_ready_at, _skills_loaded

    from hermes_cli.config import load_config
    from hermes_cli.fallback_config import get_fallback_chain
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from hermes_cli.tools_config import _get_platform_tools
    from agent.skill_commands import build_preloaded_skills_prompt
    from run_agent import AIAgent

    # optional MCP wait (same as oneshot)
    try:
        from hermes_cli.mcp_startup import ensure_mcp_discovery_before_agent_build
        ensure_mcp_discovery_before_agent_build(
            logger=log,
            single_query=True,
        )
    except Exception as e:
        log.warning("mcp discovery skip: %s", e)

    cfg = load_config()
    model_cfg = cfg.get("model") or {}
    if isinstance(model_cfg, str):
        cfg_model = model_cfg
    else:
        cfg_model = model_cfg.get("default") or model_cfg.get("model") or ""
    env_model = os.getenv("HERMES_INFERENCE_MODEL", "").strip()
    effective_model = env_model or cfg_model

    runtime = resolve_runtime_provider(
        requested=None,
        target_model=effective_model or None,
    )
    toolsets_list = sorted(_get_platform_tools(cfg, "cli"))

    skills_prompt, loaded, missing = build_preloaded_skills_prompt(["fix-mentor"])
    if missing:
        log.warning("skill missing/disabled: %s", missing)
    _skills_loaded = list(loaded or [])

    # session db optional — reuse none to keep worker light; agent may create ephemeral
    session_db = None
    try:
        from hermes_cli.oneshot import _create_session_db_for_oneshot
        session_db = _create_session_db_for_oneshot()
    except Exception:
        session_db = None

    _fb = get_fallback_chain(cfg)

    def _status_cb(msg):
        # route agent status into current job if any
        jid = _current_job_id
        if jid and jid in _jobs:
            _append_job_log(_jobs[jid], str(msg))

    def _tool_progress(msg):
        jid = _current_job_id
        if jid and jid in _jobs:
            _append_job_log(_jobs[jid], str(msg))

    agent = AIAgent(
        api_key=runtime.get("api_key"),
        base_url=runtime.get("base_url"),
        provider=runtime.get("provider"),
        requested_provider=runtime.get("requested_provider"),
        api_mode=runtime.get("api_mode"),
        model=effective_model,
        enabled_toolsets=toolsets_list,
        quiet_mode=True,
        platform="cli",
        session_db=session_db,
        credential_pool=runtime.get("credential_pool"),
        fallback_model=_fb or None,
        ephemeral_system_prompt=skills_prompt or None,
        status_callback=_status_cb,
        tool_progress_callback=_tool_progress,
    )
    try:
        agent.suppress_status_output = True
    except Exception:
        pass
    agent.stream_delta_callback = None
    agent.tool_gen_callback = None

    _agent = agent
    _agent_ready_at = time.time()
    log.info(
        "agent ready model=%s skills=%s toolsets=%d",
        effective_model,
        _skills_loaded,
        len(toolsets_list or []),
    )
    return agent


def ensure_agent(force=False):
    global _agent
    with _lock:
        if _agent is not None and not force and _state in ("ready", "busy"):
            return _agent
        _set_state("loading")
    try:
        agent = _build_agent()
        with _lock:
            _agent = agent
            _set_state("ready")
            _agent_err = ""  # noqa: F841
        return agent
    except Exception as exc:
        log.exception("agent build failed")
        _set_state("error", str(exc))
        raise


def public_health():
    with _lock:
        return {
            "ok": True,
            "service": "hermes-fix-mentor-worker",
            "state": _state,
            "error": _agent_err,
            "agentReady": _agent is not None and _state in ("ready", "busy"),
            "skills": list(_skills_loaded),
            "uptimeSec": int(time.time() - _started_at),
            "readyAgeSec": int(time.time() - _agent_ready_at) if _agent_ready_at else 0,
            "busy": _state == "busy",
            "currentJobId": _current_job_id or "",
            "hermesRoot": HERMES_ROOT or "",
            "pid": os.getpid(),
            "port": PORT,
        }


def public_job(job):
    if not job:
        return None
    with _lock:
        started = float(job.get("startedAtEpoch") or 0)
        finished = float(job.get("finishedAtEpoch") or 0)
        now = finished if finished else time.time()
        elapsed = max(0, int(now - started)) if started else 0
        logs = list(job.get("logTail") or [])
        st = job.get("status") or "error"
        pct = int(job.get("progress") or 0)
        if st == "done":
            pct = 100
        elif st == "running" and pct < 20:
            pct = min(90, 20 + elapsed // 5)
        return {
            "ok": True,
            "id": job.get("id") or "",
            "status": st,
            "path": job.get("path") or "",
            "threadId": job.get("threadId") or "",
            "message": job.get("message") or "",
            "error": job.get("error") or "",
            "exitCode": job.get("exitCode"),
            "finalText": (job.get("finalText") or "")[:4000],
            "logTail": logs[-40:],
            "lastLog": job.get("lastLog") or "",
            "phase": job.get("phase") or "",
            "phaseLabel": job.get("phaseLabel") or "",
            "step": job.get("step") or 0,
            "progress": pct,
            "elapsedSec": elapsed,
            "elapsedLabel": f"{elapsed // 60}:{elapsed % 60:02d}",
            "startedAt": job.get("startedAt") or "",
            "finishedAt": job.get("finishedAt") or "",
            "via": "warm-worker",
            "stale": bool(job.get("stale")),
        }


def run_job_async(job_id, path, prompt, thread_id=""):
    global _current_job_id

    with _lock:
        if _state == "busy":
            return None, "busy"
        job = {
            "id": job_id,
            "status": "starting",
            "path": path or "",
            "threadId": thread_id or "",
            "prompt": prompt,
            "message": "排队进入 warm Hermes…",
            "error": "",
            "exitCode": None,
            "finalText": "",
            "logTail": deque(maxlen=LOG_MAX),
            "lastLog": "",
            "lastLogAt": 0,
            "phase": "starting",
            "phaseLabel": "连接 warm Hermes",
            "step": 1,
            "progress": 12,
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "startedAtEpoch": time.time(),
            "finishedAt": "",
            "finishedAtEpoch": 0,
            "stale": False,
        }
        _jobs[job_id] = job
        _current_job_id = job_id
        _set_state("busy")

    def runner():
        global _current_job_id
        job = _jobs[job_id]
        try:
            job["message"] = "确保 agent 就绪…"
            job["phaseLabel"] = "确保 agent 就绪"
            _append_job_log(job, "[worker] ensure_agent")
            agent = ensure_agent(force=False)
            job["status"] = "running"
            job["message"] = "Hermes /fix-mentor 运行中（warm）"
            job["phase"] = "running"
            job["phaseLabel"] = "AI 运行中"
            job["step"] = 2
            job["progress"] = 25
            _append_job_log(job, f"[worker] run_conversation path={os.path.basename(path or '')}")

            # Fresh history each job — keep agent process/skills warm only
            result = agent.run_conversation(
                prompt,
                conversation_history=[],
            )
            text = ""
            if isinstance(result, dict):
                text = result.get("final_response") or result.get("response") or ""
            elif isinstance(result, str):
                text = result
            job["finalText"] = str(text or "")
            job["exitCode"] = 0
            job["status"] = "done"
            job["message"] = "AI 处理完成（warm）"
            job["phase"] = "done"
            job["phaseLabel"] = "完成"
            job["step"] = 6
            job["progress"] = 100
            _append_job_log(job, "[worker] done")
            if text:
                for line in str(text).splitlines()[:8]:
                    _append_job_log(job, line[:240])
        except Exception as exc:
            log.exception("job failed")
            job["status"] = "error"
            job["error"] = "run-failed"
            job["message"] = str(exc)[:400]
            job["exitCode"] = 1
            job["phase"] = "error"
            job["phaseLabel"] = "失败"
            _append_job_log(job, "[worker-error] " + str(exc)[:300])
            _append_job_log(job, traceback.format_exc()[-800:])
            # rebuild agent next time if fatal
            with _lock:
                # keep agent; only mark ready after
                pass
        finally:
            job["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            job["finishedAtEpoch"] = time.time()
            with _lock:
                if _current_job_id == job_id:
                    _current_job_id = None
                if _agent is not None:
                    _set_state("ready")
                elif _state != "error":
                    _set_state("error", "agent-lost")

    threading.Thread(target=runner, name=f"job-{job_id}", daemon=True).start()
    return job, None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return {}

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/health", "/", "/status"):
            self._json(200, public_health())
            return
        if u.path == "/job":
            qs = parse_qs(u.query or "")
            jid = (qs.get("id") or [""])[0]
            with _lock:
                job = _jobs.get(jid)
            if not job:
                self._json(404, {"ok": False, "error": "not-found"})
                return
            self._json(200, public_job(job))
            return
        self._json(404, {"ok": False, "error": "not-found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/warmup":
            try:
                ensure_agent(force=False)
                self._json(200, public_health())
            except Exception as e:
                self._json(500, {**public_health(), "ok": False, "error": str(e)[:300]})
            return
        if u.path == "/run":
            body = self._read_json()
            path = str(body.get("path") or "")
            prompt = str(body.get("prompt") or "")
            thread_id = str(body.get("threadId") or "")
            job_id = str(body.get("id") or "") or ("%x" % int(time.time() * 1000))
            if not prompt:
                if path:
                    prompt = f"/fix-mentor {path}"
                    if thread_id:
                        prompt += f"\n优先处理 threadId={thread_id}，然后处理其余 unanswered @AI。"
                else:
                    self._json(400, {"ok": False, "error": "missing-prompt"})
                    return
            job, err = run_job_async(job_id, path, prompt, thread_id)
            if err == "busy":
                self._json(409, {"ok": False, "error": "busy", "currentJobId": _current_job_id})
                return
            self._json(202, public_job(job))
            return
        if u.path == "/shutdown":
            self._json(200, {"ok": True, "bye": True})
            threading.Thread(target=lambda: (time.sleep(0.2), os._exit(0)), daemon=True).start()
            return
        self._json(404, {"ok": False, "error": "not-found"})


def main():
    if not HERMES_ROOT:
        log.error("hermes-agent root not found")
        sys.exit(2)
    log.info("starting on %s:%s hermesRoot=%s", HOST, PORT, HERMES_ROOT)
    # Background warm so /health becomes ready without first job paying full cost
    def _bg_warm():
        try:
            ensure_agent(force=False)
        except Exception:
            log.exception("background warm failed")

    threading.Thread(target=_bg_warm, name="warmup", daemon=True).start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _set_state("stopped")
        httpd.server_close()


if __name__ == "__main__":
    main()
