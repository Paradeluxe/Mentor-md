"""Unit tests for ai.job_runner (no live Pi)."""
from collections import deque

from ai.job_runner import apply_pi_event_to_job, build_fix_mentor_prompt


def test_prompt_contains_abs_path_and_contract():
    p = build_fix_mentor_prompt(r"E:\papers\a.mentor", thread_id="abc", scope="all")
    assert "a.mentor" in p or r"E:\papers\a.mentor" in p
    assert "mentor_io" in p or "fix-mentor" in p.lower() or "@AI" in p
    assert "abc" in p


def test_tool_start_bumps_progress():
    job = {
        "progress": 10,
        "logTail": deque(maxlen=40),
        "phase": "",
        "phaseLabel": "",
        "step": 0,
    }
    apply_pi_event_to_job(
        job,
        {"type": "tool_execution_start", "toolName": "bash", "toolCallId": "1"},
    )
    assert job["progress"] >= 20
    assert job["logTail"]


def test_agent_settled_marks_near_done():
    job = {"progress": 50, "logTail": deque(maxlen=40)}
    apply_pi_event_to_job(job, {"type": "agent_settled"})
    assert job["progress"] >= 95
