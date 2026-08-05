import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("mentor_io.py")
spec = importlib.util.spec_from_file_location("mentor_io", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def assert_true(value, message):
    if not value:
        raise AssertionError(message)


def run(name, fn):
    try:
        fn()
        print(f"PASS {name}")
        return 1
    except Exception as exc:
        print(f"FAIL {name}: {exc}")
        return 0


def located_offset(md, thread):
    needle = thread["prefix"] + thread["text"] + thread["suffix"]
    assert_true(md.count(needle) == 1, f"needle is not unique: {needle!r}")
    return md.find(needle) + len(thread["prefix"])


def make_duplicate_thread(md):
    second = md.rfind("repeated anchor")
    return {
        "threadId": "t-duplicate",
        "text": "repeated anchor",
        "prefix": md[max(0, second - 20):second],
        "suffix": md[second + len("repeated anchor"):second + len("repeated anchor") + 20],
        "comments": [],
    }


def test_duplicate_anchor_keeps_occurrence_after_external_edit():
    old_md = "First block: repeated anchor.\n\nSecond block: repeated anchor."
    new_md = "Inserted preface.\n\n" + old_md
    thread = make_duplicate_thread(old_md)
    warns = m.realign_threads({"annotations": [thread]}, new_md, context_chars=20)
    assert_true(not warns, f"unexpected warnings: {warns}")
    assert_true(located_offset(new_md, thread) == new_md.rfind("repeated anchor"), "thread moved from second occurrence")


def test_duplicate_anchor_survives_small_context_edit():
    old_md = "Alpha context repeated anchor alpha-tail.\n\nBeta context repeated anchor target-tail."
    new_md = old_md.replace("Beta context", "Beta revised context")
    thread = make_duplicate_thread(old_md)
    warns = m.realign_threads({"annotations": [thread]}, new_md, context_chars=20)
    assert_true(not warns, f"unexpected warnings: {warns}")
    assert_true(located_offset(new_md, thread) == new_md.rfind("repeated anchor"), "thread moved after nearby edit")


def test_ambiguous_duplicate_stays_untouched():
    md = "same repeated anchor same\n\nsame repeated anchor same"
    thread = {"text": "repeated anchor", "prefix": "same ", "suffix": " same", "comments": []}
    before = dict(thread)
    warns = m.realign_threads({"annotations": [thread]}, md, context_chars=20)
    assert_true(len(warns) == 1, "ambiguous duplicate must warn")
    assert_true(thread["prefix"] == before["prefix"] and thread["suffix"] == before["suffix"], "ambiguous metadata was guessed")


def test_replace_duplicate_anchor_refreshes_selected_occurrence():
    md = "Alpha repeated anchor tail-a.\n\nBeta repeated anchor tail-b.\n\nElsewhere common text."
    thread = make_duplicate_thread(md)
    new_md, ok = m.replace_anchor_in_content(md, thread, "common text")
    assert_true(ok, "replace failed")
    assert_true(thread["text"] == "common text", "new anchor text not stored")
    assert_true(located_offset(new_md, thread) == new_md.find("common text", new_md.find("Beta")), "replacement context points to wrong duplicate")


def test_write_mentor_persists_duplicate_anchor_realign():
    old_md = "Alpha context repeated anchor old-tail.\n\nBeta context repeated anchor target-tail."
    new_md = "New heading.\n\n" + old_md
    thread = make_duplicate_thread(old_md)
    annotations = {"version": "1", "annotations": [thread]}
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "fixture.mentor"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("content.md", old_md)
            zf.writestr("annotations.json", json.dumps(annotations))
        m.write_mentor(str(path), new_md, annotations)
        with zipfile.ZipFile(path) as zf:
            saved = json.loads(zf.read("annotations.json"))
        saved_thread = saved["annotations"][0]
        assert_true(located_offset(new_md, saved_thread) == new_md.rfind("repeated anchor"), "persisted thread moved occurrence")


def test_audit_marks_ambiguous_on_write():
    content = "xx tok yy\n\nxx tok yy"
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "t1",
            "text": "tok",
            "prefix": "xx ",
            "suffix": " yy",
            "comments": [],
        }]
    }
    audit = m.audit_anchor_health(anns, content)
    assert_true(audit["ok"] is False, "audit not ok")
    assert_true(audit["ambiguous"] == [0], "ambiguous idx")
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "a.mentor"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("content.md", content)
            zf.writestr("annotations.json", json.dumps(anns))
        m.write_mentor(str(path), content, anns)
        with zipfile.ZipFile(path) as zf:
            anns2 = json.loads(zf.read("annotations.json"))
        th = anns2["annotations"][0]
        assert_true(th.get("invalidReason") == "ambiguous", "invalidReason")
        assert_true((th.get("anchor") or {}).get("status") == "ambiguous", "anchor.status")


def test_write_preserves_anchor_quote_on_orphan():
    md = "no anchor here"
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "t1",
            "text": "XYZ",
            "prefix": "",
            "suffix": "",
            "comments": [],
            "anchor": {
                "status": "attached",
                "confidence": 0.8,
                "quote": {"exact": "XYZ", "prefix": "pre ", "suffix": " post"},
                "position": {"from": 1, "to": 4},
                "updatedAt": "2026-01-01T00:00:00Z",
            },
        }],
    }
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "o.mentor"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("content.md", md)
            zf.writestr("annotations.json", json.dumps(anns))
        m.write_mentor(str(path), md, anns)
        with zipfile.ZipFile(path) as zf:
            saved = json.loads(zf.read("annotations.json"))["annotations"][0]
        anchor = saved.get("anchor") or {}
        assert_true(saved.get("invalidReason") == "orphaned", "reason")
        assert_true(anchor.get("status") == "orphaned", "status")
        assert_true(anchor.get("quote", {}).get("exact") == "XYZ", "quote lost")
        assert_true(anchor.get("position", {}).get("from") == 1, "position lost")
        assert_true(anchor.get("confidence") == 0, "confidence should zero")


def test_write_block_on_unhealthy_and_dry_run():
    content = "xx tok yy\n\nxx tok yy"
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "t1",
            "text": "tok",
            "prefix": "xx ",
            "suffix": " yy",
            "comments": [],
        }],
    }
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "b.mentor"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("content.md", "seed")
            zf.writestr("annotations.json", json.dumps({"annotations": []}))
        before = path.read_bytes()
        try:
            m.write_mentor(str(path), content, anns, block_on_unhealthy=True)
            raise AssertionError("expected RuntimeError")
        except RuntimeError as exc:
            assert_true("blocked" in str(exc), str(exc))
        assert_true(path.read_bytes() == before, "disk mutated on block")
        nbytes = m.write_mentor(str(path), content, anns, dry_run=True)
        assert_true(nbytes == 0, "dry_run must return 0")
        assert_true(path.read_bytes() == before, "disk mutated on dry_run")


def test_extra_files_rejects_path_traversal():
    md = "hello unique-anchor world"
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "t1",
            "text": "unique-anchor",
            "prefix": "hello ",
            "suffix": " world",
            "comments": [],
        }],
    }
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "safe.mentor"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("content.md", md)
            zf.writestr("annotations.json", json.dumps(anns))
        try:
            m.write_mentor(str(path), md, anns, extra_files={"../evil.png": b"x"})
            raise AssertionError("expected ValueError")
        except ValueError as exc:
            assert_true("unsafe" in str(exc) or "invalid" in str(exc), str(exc))
        m.write_mentor(str(path), md, anns, extra_files={"media/ok.png": b"png"})
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
        assert_true("media/ok.png" in names, names)
        assert_true("../evil.png" not in names, names)


def test_multi_blob_image_anchor_warns_on_collapse():
    md = "see ![](media/photo.png)"
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "img",
            "text": "[图片]",
            "comments": [],
            "imageAnchors": [
                {"src": "blob:a", "alt": "img1", "from": 0, "to": 1},
                {"src": "media/photo.png", "alt": "img2", "from": 2, "to": 3},
            ],
        }],
    }
    warns = m.ensure_image_anchors(anns, md, zip_media=["media/photo.png"])
    assert_true(any("collapse" in w for w in warns), warns)
    srcs = [a["src"] for a in anns["annotations"][0]["imageAnchors"]]
    assert_true(srcs == ["media/photo.png", "media/photo.png"], srcs)




def test_word_rebind_italics_rewrites_anchor_text():
    """Simulates APA italics: F(...)/p rewritten — range must follow (Word)."""
    old_md = (
        "up was significant for both error rate "
        "(F(1, 65) = 12.54, p = .0007) and reaction time "
        "(F(1, 65) = 7.27, p = .0089), and both interactions survive"
    )
    new_md = (
        "up was significant for both error rate "
        "(*F*(1, 65) = 12.54, *p* = .0007) and reaction time "
        "(*F*(1, 65) = 7.27, *p* = .0089), and both interactions survive"
    )
    t22 = {
        "threadId": "t22",
        "text": "F(1, 65) = 12.54, p = .0007",
        "prefix": "up was significant for both error rate (",
        "suffix": ") and reaction time (F(1, 65) = 7.27, p ",
        "comments": [],
    }
    # single-char p after second F(
    p_at = old_md.find("p = .0089")
    t21 = {
        "threadId": "t21",
        "text": "p",
        "prefix": old_md[max(0, p_at - 40):p_at],
        "suffix": old_md[p_at + 1:p_at + 1 + 40],
        "comments": [],
    }
    anns = {"version": "1", "annotations": [t22, t21]}
    warns = m.word_rebind_threads(old_md, new_md, anns)
    assert_true(not any("orphaned" in w for w in warns), f"unexpected orphan: {warns}")
    assert_true(t22["text"] == "*F*(1, 65) = 12.54, *p* = .0007", t22["text"])
    assert_true("*p*" in t21["text"] or t21["text"] == "*p*", t21["text"])
    # unique locate in new
    assert_true(new_md.count(t22["prefix"] + t22["text"] + t22["suffix"]) == 1, "t22 not unique")
    audit = m.audit_anchor_health(anns, new_md)
    assert_true(audit["ok"], audit)


def test_word_rebind_prefix_insert_keeps_occurrence():
    old_md = "First block: repeated anchor.\n\nSecond block: repeated anchor."
    new_md = "Inserted preface.\n\n" + old_md
    second = old_md.rfind("repeated anchor")
    thread = {
        "threadId": "t-dup",
        "text": "repeated anchor",
        "prefix": old_md[max(0, second - 20):second],
        "suffix": old_md[second + len("repeated anchor"):second + len("repeated anchor") + 20],
        "comments": [],
    }
    anns = {"annotations": [thread]}
    m.word_rebind_threads(old_md, new_md, anns)
    needle = thread["prefix"] + thread["text"] + thread["suffix"]
    assert_true(new_md.count(needle) == 1, "not unique after insert")
    assert_true(new_md.find(needle) + len(thread["prefix"]) == new_md.rfind("repeated anchor"), "wrong occ")


def test_write_mentor_drops_stale_structural_html_on_content_change():
    """Content change must drop TipTap HTML so Mentor renders from content.md."""
    old_md = "Hello unique-token world."
    new_md = "Preface. Hello unique-token world."
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "tid-1",
            "text": "unique-token",
            "prefix": "Hello ",
            "suffix": " world.",
            "comments": [],
        }],
    }
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "s.mentor"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("content.md", old_md)
            zf.writestr("annotations.json", json.dumps(anns))
            zf.writestr("document.html", "<p>stale broken body</p>")
            zf.writestr("manifest.json", "{}")
        m.write_mentor(str(path), new_md, anns)
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            assert_true("document.html" not in names, names)
            assert_true("manifest.json" not in names, names)
            md2 = zf.read("content.md").decode("utf-8")
            ann2 = json.loads(zf.read("annotations.json"))
        assert_true(md2 == new_md, md2)
        th = ann2["annotations"][0]
        assert_true(th["text"] == "unique-token", th)
        assert_true(isinstance(th.get("mdRange"), dict), th)
        assert_true(th["mdRange"]["from"] == new_md.find("unique-token"), th["mdRange"])




def test_repair_mentor_package_recovers_mess():
    """Stale HTML + rewritten italic anchors + wrong range — repair fixes."""
    old_plain = (
        "up was significant for both error rate "
        "(F(1, 65) = 12.54, p = .0007) and reaction time."
    )
    new_md = (
        "up was significant for both error rate "
        "(*F*(1, 65) = 12.54, *p* = .0007) and reaction time."
    )
    anns = {
        "version": "1",
        "annotations": [{
            "threadId": "t-mess",
            "text": "F(1, 65) = 12.54, p = .0007",
            "prefix": "error rate (",
            "suffix": ") and reaction",
            "comments": [],
            "range": {"from": 0, "to": 1},
            "anchor": {
                "status": "orphaned",
                "quote": {
                    "exact": "F(1, 65) = 12.54, p = .0007",
                    "prefix": "error rate (",
                    "suffix": ") and reaction",
                },
            },
        }],
    }
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "mess.mentor"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("content.md", new_md)
            zf.writestr("annotations.json", json.dumps(anns))
            zf.writestr(
                "document.html",
                '<div class="mentor-body" data-mentor-body="md-plain">STALE</div>',
            )
            zf.writestr("manifest.json", "{}")
        rep = m.repair_mentor_package(str(path), backup=True, backup_dir=td)
        assert_true(rep.get("audit", {}).get("ok") is True, rep)
        assert_true(len(rep.get("rebound") or []) == 1, rep)
        assert_true(rep.get("backup"), rep)
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            assert_true("document.html" not in names, names)
            assert_true("manifest.json" not in names, names)
            th = json.loads(zf.read("annotations.json"))["annotations"][0]
        assert_true("*F*" in th["text"] and "*p*" in th["text"], th["text"])
        assert_true(isinstance(th.get("mdRange"), dict), th)
        assert_true((th.get("anchor") or {}).get("status") == "attached", th.get("anchor"))


if __name__ == "__main__":
    tests = [
        ("duplicate-anchor-keeps-occurrence-after-external-edit", test_duplicate_anchor_keeps_occurrence_after_external_edit),
        ("duplicate-anchor-survives-small-context-edit", test_duplicate_anchor_survives_small_context_edit),
        ("ambiguous-duplicate-stays-untouched", test_ambiguous_duplicate_stays_untouched),
        ("replace-duplicate-anchor-refreshes-selected-occurrence", test_replace_duplicate_anchor_refreshes_selected_occurrence),
        ("write-mentor-persists-duplicate-anchor-realign", test_write_mentor_persists_duplicate_anchor_realign),
        ("audit-marks-ambiguous", test_audit_marks_ambiguous_on_write),
        ("write-preserves-anchor-quote-on-orphan", test_write_preserves_anchor_quote_on_orphan),
        ("write-block-on-unhealthy-and-dry-run", test_write_block_on_unhealthy_and_dry_run),
        ("extra-files-rejects-path-traversal", test_extra_files_rejects_path_traversal),
        ("multi-blob-image-anchor-warns-on-collapse", test_multi_blob_image_anchor_warns_on_collapse),
        ("word-rebind-italics-rewrites-anchor-text", test_word_rebind_italics_rewrites_anchor_text),
        ("word-rebind-prefix-insert-keeps-occurrence", test_word_rebind_prefix_insert_keeps_occurrence),
        ("write-mentor-drops-stale-structural-html-on-content-change", test_write_mentor_drops_stale_structural_html_on_content_change),
        ("repair-mentor-package-recovers-mess", test_repair_mentor_package_recovers_mess),
    ]
    passed = sum(run(name, fn) for name, fn in tests)
    print(f"TOTAL {len(tests)} PASS {passed} FAIL {len(tests)-passed}")
    raise SystemExit(0 if passed == len(tests) else 1)
