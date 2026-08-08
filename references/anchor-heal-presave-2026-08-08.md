# Anchor auto-heal + quality hard-gate (2026-08-08 / v=286)

## Product rule: character-level is first-class
User may select **字之间 / mid-token** ranges. That is intentional DOCX-char-range style.
**Mid-word alone is never a hard error.**

## Hard fails only
1. Structural: duplicate-mark, range/text-mismatch, attached-missing-mark, soft orphan+mark
2. Quality:
   - `anchor-text-too-short` (< MIN_ANCHOR_TEXT_LEN=8)
   - `anchor-text-nonunique`
   - `anchor-text-empty`
   - `anchor-text-truncated-from-quote` — live text is a strict shorter substring of a **longer unique** `quote.exact` (shrink drift). Intentional char-level keeps `quote.exact === text` → no fire.

## Behavior
- `assessAnchorTextQuality(text, doc, { quoteExact })`
- Heal expands via mdRange / longer quote; never sync-from-mark a too-short mark
- Create: block short + nonunique only (not mid-token)
- mdRange slices still use **content.md**, not getMarkdown()

## Gates
- `node tests/unit-annotation-anchor.spec.js` (30)
- `node tmp/probe-anchor-heal-spill.mjs`
- `node tmp/probe-anchor-quality-gate.mjs`

## User
Ctrl+F5 → `?v=286+`
