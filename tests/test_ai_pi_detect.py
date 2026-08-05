"""Pi detect unit tests."""
from ai.pi_detect import detect_pi


def test_detect_pi_structure():
    r = detect_pi()
    assert hasattr(r, "available")
    assert hasattr(r, "path")
    assert hasattr(r, "version")
    assert hasattr(r, "error")


def test_detect_pi_on_this_machine_likely_available():
    r = detect_pi()
    # Dev machine has pi; still assert shape when missing.
    if r.available:
        assert r.path
        assert r.version
        assert r.error is None
    else:
        assert r.error
