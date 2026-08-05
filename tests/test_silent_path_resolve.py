#!/usr/bin/env python3
"""Silent basename → path via Everything / index (no picker)."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load():
    p = ROOT / "mentor-server.py"
    spec = importlib.util.spec_from_file_location("ms", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    m = load()
    es = m._everything_es_bin()
    assert es and Path(es).is_file(), "Everything es.exe required on this machine"
    sample = m.resolve_mentor_path_by_name("sample.mentor")
    assert sample and Path(sample).is_file(), sample
    assert Path(sample).name.lower() == "sample.mentor"
    assert m.resolve_mentor_path_by_name("zz_no_such_xyz.mentor") is None
    print("PASS silent path resolve", sample)


if __name__ == "__main__":
    main()
