# Anchor auto-heal + quality hard-gate (2026-08-08 / v=285)

## Classes blocked forever (product)
1. Structural: duplicate-mark, range/text-mismatch, attached-missing-mark, soft orphan+mark
2. **Quality (false-healthy drift):**
   - `anchor-text-too-short` (< MIN_ANCHOR_TEXT_LEN=8)
   - `anchor-text-midword` (starts/ends inside a word token)
   - `anchor-text-nonunique` (exact text appears >1 in plain doc)
   - `anchor-text-empty`

## Behavior
- `assessAnchorTextQuality` in `modules/annotation-anchor.js`
- Hard audit fails on quality codes (save blocked if still attached+bad after heal)
- `planAnnotationAnchorHeal` → `reattach-needed` (never sync-from-mark a low-quality mark)
- `healLiveAnnotationAnchors` expands via unique mdRange / longer quote; quality-reject → orphan (no short mark kept)
- Create path: `createAnnotationThread` rejects short/midword/nonunique selection
- Pre-save heal still uses **content.md** for mdRange slices (not getMarkdown)

## Not auto-healed (by design)
- duplicate-threadId, ambiguous-has-mark, mark-collision, hard deleted
- True multi-hit ambiguity without longer unique quote/mdRange → orphan banner, not silent wrong attach

## Gates
- `node tests/unit-annotation-anchor.spec.js` (30+)
- `node tmp/probe-anchor-heal-spill.mjs`
- `node tmp/probe-anchor-quality-gate.mjs` (poison `al st` → expand or hard-block; never save short)

## User action
Ctrl+F5 to `?v=285+`, reopen `.mentor`.

## Honest limit
Cannot math-prove zero bugs forever. Closed the known recurrence class: mid-word/short fragments that still matched their own marks and passed audit.
