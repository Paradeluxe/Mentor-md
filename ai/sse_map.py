"""Map Pi RPC events to SSE (event name, payload) pairs.

Turn completion = agent_settled only (not bare agent_end).
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

SseItem = Tuple[str, Dict[str, Any]]


def iter_sse_payloads(event: Dict[str, Any]) -> List[SseItem]:
    """Return zero or more SSE frames for one Pi NDJSON event object."""
    if not isinstance(event, dict):
        return []
    et = event.get("type")
    out: List[SseItem] = []

    if et == "message_update":
        ame = event.get("assistantMessageEvent") or {}
        if isinstance(ame, dict) and ame.get("type") == "text_delta":
            delta = ame.get("delta")
            if isinstance(delta, str) and delta:
                out.append(("delta", {"text": delta}))
        return out

    if et == "tool_execution_start":
        out.append(
            (
                "tool",
                {
                    "phase": "start",
                    "toolCallId": event.get("toolCallId"),
                    "toolName": event.get("toolName"),
                },
            )
        )
        return out

    if et == "tool_execution_update":
        payload: Dict[str, Any] = {
            "phase": "update",
            "toolCallId": event.get("toolCallId"),
        }
        if "partialResult" in event:
            payload["partialResult"] = event.get("partialResult")
        out.append(("tool", payload))
        return out

    if et == "tool_execution_end":
        payload = {
            "phase": "end",
            "toolCallId": event.get("toolCallId"),
        }
        if "isError" in event:
            payload["isError"] = event.get("isError")
        if "toolName" in event:
            payload["toolName"] = event.get("toolName")
        out.append(("tool", payload))
        return out

    if et == "agent_settled":
        out.append(("done", {"ok": True}))
        return out

    if et == "agent_end":
        # may still retry / queue — do not close SSE
        return out

    if et in ("auto_retry_start", "auto_retry_end"):
        out.append(("meta", {"kind": et, "raw": {k: event.get(k) for k in event if k != "type"}}))
        return out

    if et == "extension_error":
        out.append(
            (
                "meta",
                {
                    "kind": "extension_error",
                    "error": event.get("error") or event.get("message") or str(event),
                },
            )
        )
        return out

    return out
