---
name: fix-mentor
description: >-
  AI Reviewer for Mentor .mentor packages. Process @AI/@REVIEW annotations;
  edit content.md via mentor_io; supervision sidecar. Product runtime: Pi embed
  in Mentor host (not Hermes warm worker).
version: 3.0.0-pi
license: MIT
metadata:
  author: Paradeluxe
  host: Mentor
  runtime: pi
  open_standard: https://agentskills.io/specification
---

# Fix Mentor — AI Reviewer (Pi / Mentor product)

Portable Agent Skill for **Mentor** in-app AI and any CLI that loads `SKILL.md`.

| Surface | Runtime |
|---------|---------|
| **Mentor product (AI 处理)** | Pi RPC embed — host loads this package |
| Interactive Hermes CLI `/fm` | Optional; same `mentor_io` scripts |

**Do not** spawn Hermes warm worker (removed from Mentor).

## Layout

```text
fix-mentor/
  SKILL.md
  extensions/mentor-sandbox.ts
  scripts/mentor_io.py
  scripts/test_*.py
```

Host sets `MENTOR_SKILL_DIR` to this folder. Scripts:

```bash
python "$MENTOR_SKILL_DIR/scripts/mentor_io.py" /abs/path/file.mentor
```

Or in Python:

```python
import os, sys
sys.path.insert(0, os.path.join(os.environ["MENTOR_SKILL_DIR"], "scripts"))
from mentor_io import (
    read_mentor, write_mentor, find_unanswered_mentions, sort_mentions,
    classify_instruction, add_reply, supervision_session, summarize_mentions,
    AI_AUTHOR,
)
```

## Identity

- Reply author: **AI Reviewer** (`AI_AUTHOR`)
- Not Claude / ChatGPT / Hermes / The Machine
- Single AI reply ≤200 Chinese chars (Query exception 200–400)

## Card rules

| Card | When pending |
|------|----------------|
| **AI card** | `threadType=='ai'` or root author AI Reviewer — any non-empty human message (synthetic `@AI` if no marker) |
| **Human card** | body contains `@AI` or `@REVIEW` only |

| Marker | Behavior |
|--------|----------|
| `@AI` | execute edit/query/review/resolve |
| `@REVIEW` | review reply only, no content edit |
| AI card bare | same as `@AI` |

**Do not** scan `content.md` for `%%` (that is fix-paper).

## Modes

```text
read_mentor(path) → md, ann
pending = unanswered @AI / @REVIEW
```

1. Unanswered `@AI` → **Mode B** (main)
2. Only `@REVIEW` → **Mode C** (review replies)
3. No pending + user wants full review → **Mode A** (add threads)
4. Nothing → report status; do not write

## Mode B (main) — Supervision first

**Order is mandatory:**

1. User triggers fix-mentor on a `.mentor` path
2. `read_mentor` → compute `pending`
3. **Immediately** `supervision_session(path, pending)` / `start_supervision`
4. Each item: `sup.working_on(m)` → classify → edit/reply → `sup.tick`
5. `write_mentor(..., block_on_unhealthy=True)` → `end_supervision`

```python
from mentor_io import (
    read_mentor, write_mentor, find_unanswered_mentions, sort_mentions,
    classify_instruction, add_reply, supervision_session,
)

md, ann = read_mentor(path)
pending = sort_mentions(find_unanswered_mentions(ann, marker="@AI"), md)

with supervision_session(path, pending) as sup:
    for i, m in enumerate(pending):
        sup.working_on(m)
        kind = classify_instruction(m["instruction"])
        # edit | query | review | resolve | other — see below
        # ALWAYS add_reply for each pending item
        sup.tick(done=pending[: i + 1], rest=pending[i + 1 :])

n = write_mentor(path, md, ann, block_on_unhealthy=True)
```

### classify → action

- **edit**: change `content.md` (prefer `replace_anchor_in_content`); then `add_reply` with fact + optional line
- **query**: answer only; no content change
- **review**: reply opinions; no content unless also edit
- **resolve**: `resolve_thread` + short reply「已标记 resolved」
- **other**: `[Query]` with 2–3 options; no edit

### Write rules

- `block_on_unhealthy=True` always in product path
- On `content.md` change: drop `document.html` + `manifest.json` (never invent TipTap HTML)
- mdRange / word_rebind handled inside `write_mentor`
- Never claim「已完成」without verifying content change
- One AI reply per mention; fix old answers with `set_reply_body`

## Mode A (initial review)

Only if no pending @AI and user asked for review: add 5–20 threads with unique anchors; `write_mentor`; no content edits.

## Mode C

`@REVIEW` only: reply-only per anchor.

## User-facing terminal summary (after write)

```text
已处理 N 条批注（改正文 E · 回答 Q · 审阅 R · 关闭 S）
• [改] …
文件：name.mentor
待办：无
```

No `bytes=` / path arrays / tool dumps in the final user message.

## Pitfalls (short)

1. Supervision before long research — pet visibility
2. Always `add_reply` — unanswered = black hole
3. AI card vs human card marker rules
4. Nested `@AI` under replies — `reply_to_path` long form
5. Image anchors `[图片]` — do not search that literal in md
6. Prefer skill `scripts/mentor_io.py` over hand-zip edits

## mentor_io API (core)

`read_mentor` `write_mentor` `find_unanswered_mentions` `classify_instruction`
`add_reply` `set_reply_body` `resolve_thread` `replace_anchor_in_content`
`supervision_session` `summarize_mentions` `extract_mention_context` `sort_mentions`

CLI: `python mentor_io.py file.mentor` prints unanswered summary.
Repair: `python mentor_io.py repair file.mentor`
