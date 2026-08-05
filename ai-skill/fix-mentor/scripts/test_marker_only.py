import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).with_name("mentor_io.py")
spec = importlib.util.spec_from_file_location("mentor_io", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture(body, thread_type=None, author=None):
    thread = {
        "threadId": "t1",
        "text": "anchor",
        "prefix": "",
        "suffix": "",
        "comments": [{
            "id": "c1",
            "author": author or {"id": "u", "name": "User"},
            "body": body,
            "createdAt": "2026-07-28T00:00:00Z",
        }],
    }
    if thread_type:
        thread["threadType"] = thread_type
    return {"version": "1", "annotations": [thread]}


def test_plain_human_comment_is_not_work():
    ann = fixture("plain note")
    assert m.find_unanswered_mentions(ann, marker="@AI") == []


def test_explicit_ai_marker_is_work():
    ann = fixture("@AI fix this")
    pending = m.find_unanswered_mentions(ann, marker="@AI")
    assert len(pending) == 1
    assert pending[0]["instruction"] == "fix this"
    assert pending[0]["synthetic_marker"] is False


def test_legacy_ai_card_migrates_to_marker():
    ann = fixture("fix this", thread_type="ai")
    changed = m.migrate_legacy_ai_cards(ann)
    thread = ann["annotations"][0]
    assert changed == 1
    assert thread.get("threadType") is None
    assert thread["comments"][0]["body"] == "@AI fix this"
    pending = m.find_unanswered_mentions(ann, marker="@AI")
    assert len(pending) == 1 and pending[0]["instruction"] == "fix this"


def test_ai_reviewer_root_migrates_human_reply_once():
    ann = fixture("[Minor] check wording", author=m.AI_AUTHOR_OBJ)
    ann["annotations"][0]["comments"].append({
        "id": "c2", "author": {"id": "u", "name": "User"},
        "body": "please revise", "createdAt": "2026-07-28T00:01:00Z",
    })
    m.migrate_legacy_ai_cards(ann)
    comments = ann["annotations"][0]["comments"]
    assert comments[0]["body"] == "[Minor] check wording"
    assert comments[1]["body"] == "@AI please revise"


def test_add_thread_never_persists_thread_type():
    ann = {"version": "1", "annotations": []}
    m.add_thread(ann, "anchor", "[Minor] note", author=m.AI_AUTHOR)
    assert "threadType" not in ann["annotations"][0]


if __name__ == "__main__":
    tests = [
        test_plain_human_comment_is_not_work,
        test_explicit_ai_marker_is_work,
        test_legacy_ai_card_migrates_to_marker,
        test_ai_reviewer_root_migrates_human_reply_once,
        test_add_thread_never_persists_thread_type,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"TOTAL {len(tests)} PASS")
