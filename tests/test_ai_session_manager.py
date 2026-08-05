"""AiSessionManager unit tests."""
from pathlib import Path

from ai.session_manager import AiSessionManager, MENTOR_AI_REVIEWER_IDENTITY


class FakeClient:
    def __init__(self, *a, **k):
        pass

    def close(self):
        pass

    def prompt(self, message, **k):
        return {"ok": True}

    def abort(self):
        return {"ok": True}


def test_build_argv_includes_rpc_skill_extension_identity(tmp_path):
    skill = tmp_path / "skill"
    ext = skill / "extensions" / "mentor-sandbox.ts"
    ext.parent.mkdir(parents=True)
    ext.write_text("//x", encoding="utf-8")
    (skill / "SKILL.md").write_text("---\nname: fix-mentor\n---\n", encoding="utf-8")
    mgr = AiSessionManager(
        skill_dir=skill,
        client_factory=lambda argv, cwd, env: FakeClient(),
    )
    argv = mgr.build_argv(
        project=tmp_path,
        skill=skill,
        ext=ext,
        pi_path="pi",
    )
    assert "--mode" in argv and "rpc" in argv
    assert "--skill" in argv and str(skill) in argv
    assert "--extension" in argv and str(ext) in argv
    assert "--append-system-prompt" in argv
    assert any("AI Reviewer" in a or "Mentor" in a for a in argv)
    assert MENTOR_AI_REVIEWER_IDENTITY in argv


def test_ensure_for_mentor_reuses_session(tmp_path):
    skill = tmp_path / "skill"
    ext = skill / "extensions" / "mentor-sandbox.ts"
    ext.parent.mkdir(parents=True)
    ext.write_text("//x", encoding="utf-8")
    (skill / "SKILL.md").write_text("---\nname: fix-mentor\n---\n", encoding="utf-8")
    mentor = tmp_path / "paper.mentor"
    mentor.write_bytes(b"PK\x03\x04fake")

    created = []

    def factory(argv, cwd, env):
        created.append((argv, cwd, env))
        return FakeClient()

    mgr = AiSessionManager(skill_dir=skill, client_factory=factory)
    r1 = mgr.ensure_for_mentor(mentor)
    r2 = mgr.ensure_for_mentor(mentor)
    assert r1["ok"] and r2["ok"]
    assert r1["reused"] is False
    assert r2["reused"] is True
    assert len(created) == 1
    assert created[0][2].get("MENTOR_SKILL_DIR") == str(skill.resolve())
    st = mgr.status()
    assert st["has_session"] is True
    assert st["active_mentor"] == str(mentor.resolve())
