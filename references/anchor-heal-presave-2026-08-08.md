# Anchor auto-heal before save/open (2026-08-08)

## Symptom
Hard audit `duplicate-mark` + `range-mismatch` after heading mark spill blocked save (`ANNOTATION_ANCHOR_AUDIT_FAILED`).

## Product fix (cache-bust v=284)
1. `modules/annotation-anchor.js` → `planAnnotationAnchorHeal`
2. `app.js` → `healLiveAnnotationAnchors` (mdRange-unique first, text verify, no fuzzy multi-hit)
3. `createSaveSnapshot` heals before hard audit
4. `loadMarkdownIntoEditor` heals after load (pass `mdText: content`)
5. Structural HTML path distrusts non-contiguous embedded marks when mdRange available

## Recoverable
- range/text-mismatch (single logical mark) → sync metadata
- duplicate-mark / attached-missing-mark → strip + reattach via unique mdRange slice
- soft orphan+mark (not deleted) → clear-soft-orphan
- mark-unknown-thread → strip

## Not auto-healed
- duplicate-threadId, ambiguous-has-mark, mark-collision, hard deleted

## Gates
- `node tests/unit-annotation-anchor.spec.js` (plan heal cases)
- `node tmp/probe-anchor-heal-spill.mjs` (poison spill → save)
- `node tmp/fix-dfc-canon-and-verify-heal.mjs` (local long-form pack regression)

## Pitfalls
- Heal must slice `mdRange` against **content.md** (`State.currentFile.content`), NOT `getMarkdown()` — serializer whitespace differs and yields short/wrong slices
- Order: options.mdText → currentFile.content → getMarkdown last
- Do not restamp/shrink existing good mdRange after heal
- `pmRangeFromMdRange` alone can map wrong — require live text == md slice
- One reattach per threadId per heal pass
