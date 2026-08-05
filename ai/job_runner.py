"""Pi-backed fix-mentor job helpers for Mentor host."""
from __future__ import annotations

import os
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .path_policy import AiPathError, resolve_skill_dir
from .pi_detect import detect_pi
from .session_manager import AiSessionManager, AiUnavailable, get_manager
from .sse_map import iter_sse_payloads


def build_fix_mentor_prompt(
    abspath: str,
    thread_id: str = "",
    scope: str = "all",
) -> str:
    """Self-contained instruction for one Pi turn (skill already loaded via --skill)."""
    path = os.path.abspath(abspath)
    skill = ""
    try:
        skill = str(resolve_skill_dir())
    except Exception:
        skill = os.environ.get("MENTOR_SKILL_DIR") or ""
    lines = [
        "Run fix-mentor on this Mentor package.",
        f"Absolute path: {path}",
        f"Skill scripts dir: {os.path.join(skill, 'scripts') if skill else '(MENTOR_SKILL_DIR/scripts)'}",
        "",
        "Follow the loaded fix-mentor skill strictly:",
        "1. Import mentor_io from MENTOR_SKILL_DIR/scripts (sys.path).",
        "2. read_mentor → pending unanswered @AI (and @REVIEW if no @AI).",
        "3. IMMEDIATELY supervision_session / start_supervision before long work.",
        "4. For each pending: working_on → classify → edit/reply → tick; ALWAYS add_reply.",
        "5. write_mentor(..., block_on_unhealthy=True). Never invent document.html.",
        "6. end_supervision in finally.",
        "7. Final message: short human summary (no tool dumps).",
        "",
        "Use bash/python tools. Prefer:",
        f'  python -c "import sys,os; sys.path.insert(0, os.environ[\'MENTOR_SKILL_DIR\']+\'/scripts\'); ..."',
    ]
    if thread_id and scope == "thread":
        lines.append(f"Only process threadId={thread_id}; skip other pending.")
    elif thread_id:
        lines.append(
            f"Prioritize threadId={thread_id}, then remaining unanswered @AI."
        )
    return "\n".join(lines)


def apply_pi_event_to_job(job: Dict[str, Any], event: Dict[str, Any]) -> None:
    """Mutate job progress/log fields from one Pi NDJSON event."""
    if not isinstance(event, dict):
        return
    logs = job.setdefault("logTail", deque(maxlen=120))
    et = event.get("type") or ""
    if et == "tool_execution_start":
        name = event.get("toolName") or "tool"
        line = f"[pi-tool] start {name}"
        logs.append(line)
        job["lastLog"] = line
        job["phase"] = "tools"
        job["phaseLabel"] = f"调用 {name}"
        job["step"] = max(int(job.get("step") or 0), 3)
        job["progress"] = max(int(job.get("progress") or 0), 40)
        low = str(name).lower()
        if "bash" in low or "python" in low:
            job["progress"] = max(int(job.get("progress") or 0), 45)
        return
    if et == "tool_execution_end":
        name = event.get("toolName") or "tool"
        err = event.get("isError")
        line = f"[pi-tool] end {name}" + (" ERROR" if err else "")
        logs.append(line)
        job["lastLog"] = line
        blob = line.lower()
        if "mentor_io" in blob or "write" in str(name).lower():
            job["phase"] = "write"
            job["phaseLabel"] = "写回文稿"
            job["step"] = 5
            job["progress"] = max(int(job.get("progress") or 0), 82)
        else:
            job["progress"] = max(int(job.get("progress") or 0), 55)
        return
    if et == "message_update":
        ame = event.get("assistantMessageEvent") or {}
        if isinstance(ame, dict) and ame.get("type") == "text_delta":
            delta = ame.get("delta") or ""
            if delta and len(delta.strip()) > 0:
                # keep short crumbs only
                job["lastLog"] = ("… " + delta.strip())[:240]
                job["progress"] = max(int(job.get("progress") or 0), 30)
        return
    if et == "agent_settled":
        job["progress"] = max(int(job.get("progress") or 0), 95)
        logs.append("[pi] agent_settled")
        return
    # generic
    for name, payload in iter_sse_payloads(event):
        if name == "tool":
            logs.append(f"[pi] tool {payload.get('phase')} {payload.get('toolName') or ''}".strip())
        elif name == "meta":
            logs.append(f"[pi] meta {payload.get('kind')}")
        elif name == "done":
            logs.append("[pi] done")


def ai_connection_health(*, warm: bool = False) -> Dict[str, Any]:
    """Connection layer status (no paper job)."""
    det = detect_pi()
    skill_dir = None
    skill_err = None
    try:
        skill_dir = str(resolve_skill_dir())
    except Exception as e:
        skill_err = str(e)
    mgr = get_manager()
    st = mgr.status()
    agent_ready = bool(det.available and skill_dir and not skill_err)
    state = "ready" if agent_ready else ("error" if not det.available else "degraded")
    if st.get("busy"):
        state = "busy"
    if warm and agent_ready:
        # warm only validates detect+skill; session is lazy until first job
        pass
    return {
        "ok": True,
        "service": "mentor-ai-pi",
        "reachable": True,
        "state": state if det.available else "down",
        "agentReady": agent_ready,
        "error": (det.error or skill_err or st.get("last_error") or "")[:300],
        "pi": {
            "available": det.available,
            "path": det.path,
            "version": det.version,
            "error": det.error,
        },
        "skillDir": skill_dir or "",
        "skills": ["fix-mentor"] if skill_dir else [],
        "busy": bool(st.get("busy")),
        "hasSession": bool(st.get("has_session")),
        "activeMentor": st.get("active_mentor"),
        "checkedAt": time.time(),
    }


def restart_pi_session() -> Dict[str, Any]:
    mgr = get_manager()
    mgr.shutdown()
    return ai_connection_health(warm=True)


def run_pi_fix_mentor_job(
    job: Dict[str, Any],
    *,
    manager: Optional[AiSessionManager] = None,
    idle_timeout_s: float = 600.0,
    event_timeout_s: float = 0.2,
) -> None:
    """
    Drive one fix-mentor turn on Pi RPC; mutate job in place until done/error.
    Caller owns FIX_MENTOR_JOBS locking for publish; job dict is assumed exclusive.
    """
    mgr = manager or get_manager()
    abspath = job.get("path") or ""
    thread_id = job.get("threadId") or ""
    scope = job.get("scope") or "all"
    prompt = job.get("prompt") or build_fix_mentor_prompt(abspath, thread_id, scope)

    def _log(line: str) -> None:
        logs = job.setdefault("logTail", deque(maxlen=120))
        logs.append(str(line)[:500])
        job["lastLog"] = str(line)[:240]

    try:
        job["status"] = "running"
        job["message"] = "确保 Pi 会话…"
        job["phase"] = "starting"
        job["phaseLabel"] = "启动 Pi"
        job["step"] = 1
        job["progress"] = 15
        _log("[pi] ensure_for_mentor")
        mgr.ensure_for_mentor(abspath)
        client = mgr.get_client()
        mgr.set_busy(True)
        job["message"] = "Pi / fix-mentor 运行中"
        job["phase"] = "running"
        job["phaseLabel"] = "AI 运行中"
        job["step"] = 2
        job["progress"] = 25
        _log(f"[pi] prompt {os.path.basename(abspath)}")

        while client.drain_event_nowait() is not None:
            pass
        client.prompt(prompt)

        settled = False
        idle_rounds = 0
        max_idle = int(idle_timeout_s / max(event_timeout_s, 0.05))
        text_bits: List[str] = []
        while idle_rounds < max_idle:
            got = False
            for ev in client.iter_events(timeout=event_timeout_s):
                got = True
                idle_rounds = 0
                apply_pi_event_to_job(job, ev)
                if isinstance(ev, dict) and ev.get("type") == "message_update":
                    ame = ev.get("assistantMessageEvent") or {}
                    if isinstance(ame, dict) and ame.get("type") == "text_delta":
                        d = ame.get("delta")
                        if isinstance(d, str):
                            text_bits.append(d)
                for name, payload in iter_sse_payloads(ev):
                    if name == "done" and payload.get("ok"):
                        settled = True
                if settled:
                    break
            if settled:
                break
            if not got:
                idle_rounds += 1

        if not settled:
            try:
                client.abort()
            except Exception:
                pass
            job["status"] = "error"
            job["error"] = "timeout"
            job["message"] = "Pi 等待 agent_settled 超时"
            job["exitCode"] = 1
            job["phase"] = "error"
            job["phaseLabel"] = "超时"
            _log("[pi-error] timeout_waiting_settled")
            return

        final = "".join(text_bits).strip()
        job["finalText"] = final[:4000]
        job["status"] = "done"
        job["exitCode"] = 0
        job["message"] = "AI 处理完成（Pi）"
        job["phase"] = "done"
        job["phaseLabel"] = "完成"
        job["step"] = 6
        job["progress"] = 100
        _log("[pi] done")
        if final:
            for line in final.splitlines()[:8]:
                _log(line[:240])
    except AiUnavailable as e:
        job["status"] = "error"
        job["error"] = e.code
        job["message"] = str(e)[:400]
        job["exitCode"] = 1
        job["phase"] = "error"
        job["phaseLabel"] = "失败"
        _log(f"[pi-error] {e.code}: {e}")
    except AiPathError as e:
        job["status"] = "error"
        job["error"] = "bad_path"
        job["message"] = str(e)[:400]
        job["exitCode"] = 1
        job["phase"] = "error"
        job["phaseLabel"] = "失败"
        _log(f"[pi-error] path: {e}")
    except Exception as e:
        job["status"] = "error"
        job["error"] = "run-failed"
        job["message"] = str(e)[:400]
        job["exitCode"] = 1
        job["phase"] = "error"
        job["phaseLabel"] = "失败"
        _log(f"[pi-error] {e}")
    finally:
        try:
            mgr.set_busy(False)
        except Exception:
            pass
        job["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        job["finishedAtEpoch"] = time.time()
