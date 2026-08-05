"""Pi NDJSON RPC client over a subprocess (or injectible transport)."""
from __future__ import annotations

import json
import queue
import subprocess
import threading
import time
import uuid
from typing import Any, Dict, Iterator, List, Optional, TextIO


class PiRpcError(RuntimeError):
    pass


class PiRpcClient:
    """Minimal NDJSON RPC: write requests on stdin, read events/responses on stdout."""

    def __init__(
        self,
        proc: Any = None,
        *,
        stdin: Optional[TextIO] = None,
        stdout: Optional[TextIO] = None,
    ) -> None:
        self._proc = proc
        self._stdin = stdin if stdin is not None else (getattr(proc, "stdin", None) if proc else None)
        self._stdout = stdout if stdout is not None else (getattr(proc, "stdout", None) if proc else None)
        self._lock = threading.Lock()
        self._events: "queue.Queue[Optional[Dict[str, Any]]]" = queue.Queue()
        self._responses: Dict[str, Dict[str, Any]] = {}
        self._resp_cond = threading.Condition()
        self._closed = False
        self._reader: Optional[threading.Thread] = None
        if self._stdout is not None:
            self._reader = threading.Thread(target=self._read_loop, name="pi-rpc-reader", daemon=True)
            self._reader.start()

    @classmethod
    def spawn(
        cls,
        argv: List[str],
        *,
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> "PiRpcClient":
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        return cls(proc)

    def _read_loop(self) -> None:
        assert self._stdout is not None
        try:
            for line in self._stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(obj, dict):
                    continue
                rid = obj.get("id")
                if rid is not None and (
                    obj.get("type") == "response" or "command" in obj or "success" in obj
                ):
                    with self._resp_cond:
                        self._responses[str(rid)] = obj
                        self._resp_cond.notify_all()
                else:
                    self._events.put(obj)
        finally:
            self._events.put(None)

    def request(self, payload: Dict[str, Any], timeout: float = 60.0) -> Dict[str, Any]:
        if self._closed:
            raise PiRpcError("client closed")
        if self._stdin is None:
            raise PiRpcError("no stdin")
        body = dict(payload)
        rid = str(body.get("id") or uuid.uuid4())
        body["id"] = rid
        data = json.dumps(body, ensure_ascii=False) + "\n"
        with self._lock:
            self._stdin.write(data)
            self._stdin.flush()
        deadline = time.monotonic() + timeout
        with self._resp_cond:
            while rid not in self._responses:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PiRpcError(f"timeout waiting for response id={rid}")
                self._resp_cond.wait(timeout=remaining)
            return self._responses.pop(rid)

    def iter_events(self, timeout: Optional[float] = None) -> Iterator[Dict[str, Any]]:
        while True:
            try:
                if timeout is None:
                    item = self._events.get()
                else:
                    item = self._events.get(timeout=timeout)
            except queue.Empty:
                return
            if item is None:
                return
            yield item

    def drain_event_nowait(self) -> Optional[Dict[str, Any]]:
        try:
            item = self._events.get_nowait()
        except queue.Empty:
            return None
        if item is None:
            self._events.put(None)
            return None
        return item

    def prompt(self, message: str, *, streaming_behavior: Optional[str] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"type": "prompt", "message": message}
        if streaming_behavior:
            body["streamingBehavior"] = streaming_behavior
        return self.request(body)

    def abort(self) -> Dict[str, Any]:
        return self.request({"type": "abort"})

    def get_messages(self) -> Dict[str, Any]:
        return self.request({"type": "get_messages"})

    def get_state(self) -> Dict[str, Any]:
        return self.request({"type": "get_state"})

    def close(self, grace_s: float = 2.0) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            if self._stdin is not None:
                try:
                    self._stdin.close()
                except Exception:
                    pass
            if self._proc is not None:
                try:
                    self._proc.wait(timeout=grace_s)
                except Exception:
                    try:
                        self._proc.terminate()
                        self._proc.wait(timeout=1.0)
                    except Exception:
                        try:
                            self._proc.kill()
                        except Exception:
                            pass
        finally:
            self._events.put(None)
