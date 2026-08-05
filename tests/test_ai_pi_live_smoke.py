#!/usr/bin/env python3
"""Live smoke: Pi detect + skill + spawn + short prompt (no full fix-mentor)."""
from __future__ import annotations

import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ai.job_runner import ai_connection_health
from ai.session_manager import AiSessionManager, get_manager


def make_minimal_mentor(path: Path) -> None:
    md = "# Smoke\n\nHello world paragraph for Pi smoke.\n"
    ann = (
        '{"version":1,"annotations":[{'
        '"threadId":"t-smoke-1","anchorText":"Hello world",'
        '"mdRange":{"start":10,"end":21},'
        '"comments":[{"id":"c1","author":"User","body":"@AI reply with exactly PONG and do nothing else","createdAt":"2026-01-01T00:00:00Z"}],'
        '"resolved":false'
        "}]}"
    )
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("content.md", md)
        z.writestr("annotations.json", ann)


def main() -> int:
    h = ai_connection_health(warm=True)
    print("connection", h.get("state"), "agentReady=", h.get("agentReady"), "pi=", (h.get("pi") or {}).get("version"))
    if not h.get("agentReady"):
        print("FAIL not agentReady", h)
        return 1

    with tempfile.TemporaryDirectory() as td:
        mentor = Path(td) / "smoke.mentor"
        make_minimal_mentor(mentor)
        mgr = AiSessionManager()  # fresh
        info = mgr.ensure_for_mentor(mentor)
        print("ensure", {k: info.get(k) for k in ("ok", "reused", "pi_version", "skill_dir")})
        client = mgr.get_client()
        # Short identity check — no tools required
        prompt = (
            "Do not use any tools. Reply with exactly one line: PONG\n"
            f"(context file is {mentor.name}; ignore annotations for this smoke)"
        )
        while client.drain_event_nowait() is not None:
            pass
        client.prompt(prompt)
        settled = False
        texts = []
        deadline = time.time() + 120
        while time.time() < deadline:
            for ev in client.iter_events(timeout=0.5):
                et = ev.get("type") if isinstance(ev, dict) else None
                if et == "message_update":
                    ame = ev.get("assistantMessageEvent") or {}
                    if ame.get("type") == "text_delta" and isinstance(ame.get("delta"), str):
                        texts.append(ame["delta"])
                if et == "agent_settled":
                    settled = True
                    break
                if et == "tool_execution_start":
                    print("tool", ev.get("toolName"))
            if settled:
                break
        final = "".join(texts).strip()
        print("settled", settled, "final_snip", final[:200].replace("\n", " "))
        mgr.shutdown()
        if not settled:
            print("FAIL no agent_settled")
            return 2
        if "PONG" not in final.upper():
            print("WARN no PONG in reply (model may still be ok for spawn path)")
        print("PASS pi live smoke")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
