# Range mode (v1.49.9+)

**No backward-compatible quote fallback.**

## Contract

1. Canonical disk anchor = `thread.mdRange = {from,to}` into `content.md`
2. `text` / `prefix` / `suffix` are **projections** of that range (display + Word rebind evidence), not the locator
3. Package flag: `annotations.anchorMode = "range"`
4. Missing / OOB / slice≠text `mdRange` → **orphan** (never multi-candidate quote search)

## Paths

| Event | Behavior |
|-------|----------|
| Ctrl+S / write-mentor | `stampSidecarMdRanges` writes mdRange for every text thread |
| Open with valid `document.html` | Embedded PM marks (live range); then stamp mdRange onto live threads from md |
| Open md-only / HTML dropped | Attach **only** via mdRange → PM map; else orphan toast |
| External `/fm` body edit | `ensure_md_ranges` then `word_rebind_threads` opcode map of mdRange; map fail → orphan |

## Not Word OOXML

Still markdown + sidecar. Durability comes from **character ranges on content.md** + opcode remap, not `<>` tags in the body.

## Migrate old packages

Open once in Mentor and Ctrl+S, or run `ensure_md_ranges` / repair. Threads whose text is non-unique in md stay orphan until the quote is expanded.
