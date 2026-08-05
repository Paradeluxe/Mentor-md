"""Unit: write_mentor_package_to_path atomic write + allow-list."""
from __future__ import annotations

import importlib.util
import os
import shutil
import sys
import tempfile
import types


def _load_ms():
    # Import mentor-server helpers without starting HTTP server.
    # mentor-server only serves under __main__.
    path = os.path.join(os.path.dirname(__file__), "..", "mentor-server.py")
    path = os.path.abspath(path)
    # Prevent accidental serve: load as module
    name = "mentor_server_under_test"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    # Ensure __name__ != '__main__'
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def main():
    ms = _load_ms()
    tmp = tempfile.mkdtemp(prefix="wm-unit-")
    try:
        demo = os.path.join(tmp, "u.mentor")
        src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "examples", "supervision-pet-demo.mentor"))
        shutil.copy2(src, demo)
        raw = open(demo, "rb").read()
        # not allowed yet
        info, err = ms.write_mentor_package_to_path(demo, raw)
        assert err == "not-allowed", err
        assert info is None
        # allow
        assert ms.allow_open_path(demo)
        info, err = ms.write_mentor_package_to_path(demo, raw)
        assert err is None, err
        assert info and info.get("ok") is None  # shape path/name/mtimeNs
        assert info["path"]
        assert info["name"] == "u.mentor"
        assert int(info.get("size") or 0) == len(raw)
        # empty
        _, err2 = ms.write_mentor_package_to_path(demo, b"")
        assert err2 == "empty-package"
        # missing path
        _, err3 = ms.write_mentor_package_to_path("", raw)
        assert err3 == "missing-path"
        print("PASS test_write_mentor_package")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
