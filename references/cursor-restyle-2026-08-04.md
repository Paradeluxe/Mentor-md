# Cursor restyle + range parity + multi-delete (2026-08-04)

## Done
- Token: danger `#cf2d56`, success `#1f8a65`, elevated `28px 70px`
- Hover chrome → danger text (toolbar/tree/menu/filter)
- DESIGN.md: range-only anchors; drop P0–P3 fuzzy; orange accent not blue
- `modules/docx-export-range.js` character-level commentRange inject
- `modules/comment-selection.js` + bulk bar multi-delete
- Gates: unit-cursor-tokens, unit-anchor-no-compat, unit-docx-char-range-inject, unit-comment-selection

## No backward-compat
- Export does not whole-paragraph wrap
- Missing quote → warning, no silent attach
- Open remains mdRange-only
