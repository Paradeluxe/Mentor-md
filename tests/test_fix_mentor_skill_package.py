"""fix-mentor skill package layout contract."""
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "ai-skill" / "fix-mentor"


def test_skill_layout():
    assert (SKILL / "SKILL.md").is_file()
    text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    assert "name: fix-mentor" in text
    assert (SKILL / "scripts" / "mentor_io.py").is_file()
    assert (SKILL / "extensions" / "mentor-sandbox.ts").is_file()
    assert "MENTOR_SKILL_DIR" in (SKILL / "extensions" / "mentor-sandbox.ts").read_text(
        encoding="utf-8"
    )


def test_mentor_io_importable():
    p = SKILL / "scripts" / "mentor_io.py"
    spec = importlib.util.spec_from_file_location("mentor_io_pkg", p)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    assert hasattr(mod, "read_mentor")
    assert hasattr(mod, "write_mentor")
    assert hasattr(mod, "supervision_session")
    assert getattr(mod, "AI_AUTHOR", "") == "AI Reviewer"


def test_path_policy_finds_in_repo_skill():
    from ai.path_policy import resolve_skill_dir

    p = resolve_skill_dir()
    assert p == SKILL.resolve()
    assert (p / "SKILL.md").is_file()
