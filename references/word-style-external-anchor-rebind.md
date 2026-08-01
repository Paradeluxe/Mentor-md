# Word-style external anchor rebind (2026-08-01 → v2.6.1)

## Problem this session exposed

After bulk body edits that **rewrite the anchor text itself** (e.g. APA italics `p`→`*p*`, `F(`→`*F*(`), two threads went orphaned/ambiguous on write:

| Thread | Old exact | Failure |
|--------|-----------|---------|
| long F/p quote | `F(1, 65) = 12.54, p = .0007` | exact string gone → orphaned |
| single-char `p` | `p` + context with plain `F(` | prefix/suffix also rewritten → ambiguous |

Root cause is **not** random drift. Mentor disk anchors were quote triples; `realign_threads` only refreshed prefix/suffix and **never rewrote `text`**. Structural `document.html` was **preserved stale** on `/fix-mentor` write → manifest hash miss → markdown-fallback quote search → fail.

A later attempt to **fabricate** `document.html` (md-plain pre-wrap) made Mentor verify hashes and load that HTML as the body → **rendering destroyed**. That path is **forbidden**.

## What already existed

- Live editor: PM annotation marks + `mapAnchorRange` (Word-like while open).
- Save/reopen: v1.45 `document.html` + `span[data-thread-id]` + triple-hash manifest when **Mentor TipTap** saves.
- Reliability rule: multi-evidence restore; ambiguity must not soft-hang.

## Shipped contract (fix-mentor mentor_io **v2.6.1** + Mentor save)

### fix-mentor / mentor_io

1. **`word_rebind_threads(old_md, new_md, ann)`**  
   Locate span in old MD → map through `difflib.SequenceMatcher` opcodes → set new `text/prefix/suffix/**mdRange**` (quoted text updates when interior edits — Word commentRange behaviour).

2. **`_expand_md_emphasis_wrappers`**  
   After map, absorb clipped `*`/`**`/`_` so `F`→`*F*` does not leave `F*(...)`.

3. **On `content.md` change: DROP `document.html` + `manifest.json`.**  
   External writers must **never invent TipTap HTML**. Mentor opens `content.md` + rebound quotes. One interactive Save in Mentor regenerates real structural HTML.

4. **Annotations-only write** (md bytes unchanged): may keep prior HTML and refresh manifest hashes only.

5. **SCHEMA** optional `mdRange: {from,to}` on threads.

6. **Tests**: `fix-mentor/scripts/test_realign.py` — word-rebind-*, drops-stale-structural. Gate: 13/13.

### Mentor app (save path)

1. **`serializeAnnotationThread`** persists `mdRange` when present.
2. **`stampMdRangesOnSidecar(sidecar, mdText)`** on every `createSaveSnapshot` — locates each thread in `content.md` and writes `mdRange` for external rebind.
3. Structural HTML remains **TipTap-only** (`getHTML` → archive).

## Agent rules (do not regress)

- After external body rewrite that changes characters inside anchors, rely on `write_mentor` word-rebind (or call it explicitly before audit).
- **Never** rebuild fake `document.html` from Python/markdown for shipping packages.
- On content change, **dropping** structural members is correct; do not “fix render” by writing pre-wrap HTML again.
- User discipline: no hand-edit zip; no stale draft Ctrl+S over disk after `/fix-mentor`.
- `block_on_unhealthy=True` on production writes.
- Ambiguity → no guess; user re-attach. Deleted span → orphaned, keep thread.

## Under “user will not mess around”

| Path | Anchor loss | Bad render |
|------|-------------|------------|
| Mentor UI edit + save | No | No |
| `/fix-mentor` → `write_mentor` | No (rebind; else hard-block) | No (drop stale HTML) |
| Hand-edit zip / draft overwrite | Yes | Possible |

## Related

- `references/annotation-anchor-reliability.md`
- `references/lessons-v1-45-0-structural-html-anchors.md`
- `references/mentor-package-range-repair.md` — never pack empty getMarkdown()


## Repair when user messed up (v2.6.2)

```bash
python fix-mentor/scripts/mentor_io.py repair <file.mentor>
```

`repair_mentor_package`: backup → starless-italics rebind → drop structural HTML → write. Gate: `test_repair_mentor_package_recovers_mess`.
