"""AiSessionManager unit tests (multi-document concurrent sessions)."""
from pathlib import Path

from ai.session_manager import (
    AiSessionManager,
    AiUnavailable,
    MENTOR_AI_REVIEWER_IDENTITY,
    MENTOR_BROWSER_SKILL_IDENTITY,
    max_concurrent_cap,
    reset_manager_for_tests,
)


class FakeClient:
    def __init__(self, *a, **k):
        self.closed = False
        self.tag = k.get("tag")

    def close(self):
        self.closed = True

    def prompt(self, message, **k):
        return {"ok": True}

    def abort(self):
        return {"ok": True}


def _skill_tree(tmp_path):
    skill = tmp_path / "skill"
    ext = skill / "extensions" / "mentor-sandbox.ts"
    ext.parent.mkdir(parents=True)
    ext.write_text("//x", encoding="utf-8")
    (skill / "SKILL.md").write_text("---\nname: fix-mentor\n---\n", encoding="utf-8")
    return skill


def test_build_argv_includes_rpc_skill_extension_identity(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
    ext = skill / "extensions" / "mentor-sandbox.ts"
    mgr = AiSessionManager(
        skill_dir=skill,
        client_factory=lambda argv, cwd, env: FakeClient(),
    )
    argv = mgr.build_argv(
        project=tmp_path,
        skill=skill,
        ext=ext,
        pi_path="pi",
        extra_skills=[],
    )
    assert "--mode" in argv and "rpc" in argv
    assert "--skill" in argv and str(skill) in argv
    assert argv.count("--skill") == 1
    assert "--extension" in argv and str(ext) in argv
    assert "--append-system-prompt" in argv
    assert any("AI Reviewer" in a or "Mentor" in a for a in argv)
    assert MENTOR_AI_REVIEWER_IDENTITY in argv


def test_build_argv_includes_browser_skill(tmp_path):
    skill = _skill_tree(tmp_path)
    ext = skill / "extensions" / "mentor-sandbox.ts"
    browser = tmp_path / "browser-skill"
    browser.mkdir()
    (browser / "SKILL.md").write_text("---\nname: browser-skill\n---\n", encoding="utf-8")
    mgr = AiSessionManager(skill_dir=skill)
    argv = mgr.build_argv(
        project=tmp_path,
        skill=skill,
        ext=ext,
        pi_path="pi",
        extra_skills=[browser],
    )
    assert argv.count("--skill") == 2
    assert str(skill) in argv
    assert str(browser) in argv
    prompt = argv[argv.index("--append-system-prompt") + 1]
    assert "browser-skill" in prompt
    assert "bsk" in prompt
    assert MENTOR_BROWSER_SKILL_IDENTITY.strip() in prompt


def test_ensure_for_mentor_reuses_session(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
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
    assert st["session_count"] == 1


def test_two_mentors_two_sessions_no_teardown(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
    a = tmp_path / "a.mentor"
    b = tmp_path / "b.mentor"
    a.write_bytes(b"PK\x03\x04a")
    b.write_bytes(b"PK\x03\x04b")
    clients = []

    def factory(argv, cwd, env):
        c = FakeClient()
        clients.append(c)
        return c

    mgr = AiSessionManager(skill_dir=skill, client_factory=factory, max_sessions=4)
    r1 = mgr.ensure_for_mentor(a)
    r2 = mgr.ensure_for_mentor(b)
    assert r1["reused"] is False and r2["reused"] is False
    assert len(clients) == 2
    assert clients[0].closed is False
    assert clients[1].closed is False
    # Reuse each independently
    assert mgr.ensure_for_mentor(a)["reused"] is True
    assert mgr.ensure_for_mentor(b)["reused"] is True
    assert len(clients) == 2
    ca = mgr.get_client(a)
    cb = mgr.get_client(b)
    assert ca is clients[0]
    assert cb is clients[1]
    st = mgr.status()
    assert st["session_count"] == 2
    assert set(st["active_mentors"]) == {str(a.resolve()), str(b.resolve())}


def test_busy_is_per_document(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
    a = tmp_path / "a.mentor"
    b = tmp_path / "b.mentor"
    a.write_bytes(b"PK\x03\x04a")
    b.write_bytes(b"PK\x03\x04b")
    mgr = AiSessionManager(
        skill_dir=skill,
        client_factory=lambda *a, **k: FakeClient(),
        max_sessions=4,
    )
    mgr.ensure_for_mentor(a)
    mgr.ensure_for_mentor(b)
    mgr.set_busy(True, a)
    assert mgr.is_busy(a) is True
    assert mgr.is_busy(b) is False
    assert mgr.busy is True
    assert mgr.busy_count() == 1
    mgr.set_busy(True, b)
    assert mgr.busy_count() == 2
    mgr.set_busy(False, a)
    assert mgr.is_busy(a) is False
    assert mgr.is_busy(b) is True
    assert mgr.busy_count() == 1


def test_shutdown_one_keeps_other(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
    a = tmp_path / "a.mentor"
    b = tmp_path / "b.mentor"
    a.write_bytes(b"PK\x03\x04a")
    b.write_bytes(b"PK\x03\x04b")
    clients = []

    def factory(argv, cwd, env):
        c = FakeClient()
        clients.append(c)
        return c

    mgr = AiSessionManager(skill_dir=skill, client_factory=factory, max_sessions=4)
    mgr.ensure_for_mentor(a)
    mgr.ensure_for_mentor(b)
    mgr.shutdown(a)
    assert clients[0].closed is True
    assert clients[1].closed is False
    assert mgr.session_count() == 1
    assert mgr.get_client(b) is clients[1]


def test_lru_evicts_idle_not_busy(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
    paths = []
    for name in ("a", "b", "c"):
        m = tmp_path / f"{name}.mentor"
        m.write_bytes(b"PK\x03\x04" + name.encode())
        paths.append(m)
    clients = []

    def factory(argv, cwd, env):
        c = FakeClient()
        clients.append(c)
        return c

    mgr = AiSessionManager(skill_dir=skill, client_factory=factory, max_sessions=2)
    mgr.ensure_for_mentor(paths[0])
    mgr.ensure_for_mentor(paths[1])
    # Mark B busy — A is idle LRU
    mgr.set_busy(True, paths[1])
    mgr.ensure_for_mentor(paths[2])  # should evict A (idle), keep B
    assert clients[0].closed is True
    assert clients[1].closed is False
    assert mgr.session_count() == 2
    # B still addressable
    assert mgr.get_client(paths[1]) is clients[1]


def test_session_limit_when_all_busy(tmp_path, monkeypatch):
    monkeypatch.setenv("MENTOR_ENABLE_BROWSER_SKILL", "0")
    skill = _skill_tree(tmp_path)
    a = tmp_path / "a.mentor"
    b = tmp_path / "b.mentor"
    c = tmp_path / "c.mentor"
    for m in (a, b, c):
        m.write_bytes(b"PK\x03\x04x")
    mgr = AiSessionManager(
        skill_dir=skill,
        client_factory=lambda *a, **k: FakeClient(),
        max_sessions=2,
    )
    mgr.ensure_for_mentor(a)
    mgr.ensure_for_mentor(b)
    mgr.set_busy(True, a)
    mgr.set_busy(True, b)
    try:
        mgr.ensure_for_mentor(c)
        raise AssertionError("expected session_limit")
    except AiUnavailable as e:
        assert e.code == "session_limit"


def test_max_concurrent_cap_env(monkeypatch):
    monkeypatch.setenv("MENTOR_AI_MAX_CONCURRENT", "3")
    monkeypatch.setenv("MENTOR_AI_MAX_SESSIONS", "4")
    assert max_concurrent_cap() == 3
    monkeypatch.setenv("MENTOR_AI_MAX_CONCURRENT", "99")
    # capped by sessions
    assert max_concurrent_cap() == 4


def test_reset_manager_for_tests():
    reset_manager_for_tests()
