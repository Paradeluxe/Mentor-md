"""
Mentor .mentor file I/O — read, write, and scan explicit @AI/@REVIEW work items.
Used by /fix-mentor skill. No external deps beyond stdlib.

Word-style anchors (v2.6+ / drift-prevention):
  External edits rebind threads by mapping content.md ranges through
  difflib opcodes (like Word commentRangeStart/End). On content.md change,
  document.html is dropped (never invent TipTap HTML). Prevention stack:
    1) word_rebind / realign + sanitize_anchors_for_write (md-literal align,
       clear stale fuzzy)
    2) Mentor mdEmphasisToPlain on open ( _p_ quote vs plain p )
    3) optional user Ctrl+S rebuilds real structural HTML
"""
import zipfile, json, os, uuid, io, re, hashlib
from datetime import datetime, timezone
from difflib import SequenceMatcher
from html import escape as html_escape
from typing import Optional, Union, Any, List, Tuple


AI_AUTHOR = 'AI Reviewer'
AI_AUTHOR_IDS = frozenset({'ai-reviewer', 'aireviewer', 'ai_reviewer'})
AI_AUTHOR_OBJ = {'id': 'ai-reviewer', 'name': AI_AUTHOR}

KNOWN_MARKERS = {
    '@AI':     {'type': 'ai',     'description': 'AI execution instruction (edit/query/review/resolve)'},
    '@REVIEW': {'type': 'review', 'description': 'Human review request — AI generates review comments only'},
}
MARKER_TYPE_AI = 'ai'
MARKER_TYPE_REVIEW = 'review'


def canonical_marker(marker: Optional[str]) -> Optional[str]:
    """Normalize a marker supplied by callers to the schema spelling."""
    if not marker:
        return None
    for known in KNOWN_MARKERS:
        if known.lower() == str(marker).strip().lower():
            return known
    return str(marker).strip()


def _marker_re(marker: str) -> str:
    return rf'{re.escape(marker)}\b'


def extract_marker(body: str) -> Optional[str]:
    if not body:
        return None
    for marker in KNOWN_MARKERS:
        if re.search(_marker_re(marker), body, flags=re.IGNORECASE):
            return marker
    return None


def has_marker(body: str, marker: Optional[str] = None) -> bool:
    if marker:
        return re.search(_marker_re(marker), body or '', flags=re.IGNORECASE) is not None
    return extract_marker(body or '') is not None


def strip_marker(body: str, marker: Optional[str] = None) -> str:
    if marker:
        return re.sub(_marker_re(marker), '', body or '', flags=re.IGNORECASE).strip()
    result = body or ''
    for m in KNOWN_MARKERS:
        result = re.sub(_marker_re(m), '', result, flags=re.IGNORECASE)
    return result.strip()


def get_marker_type(marker: str) -> str:
    return KNOWN_MARKERS.get(marker, {}).get('type', 'unknown')


def has_ai_marker(body: str) -> bool:
    return has_marker(body, '@AI')


def strip_ai_marker(body: str) -> str:
    return strip_marker(body, '@AI')


def _is_user_mention(comment: dict, marker: Optional[str] = None) -> bool:
    if not comment or is_ai_author(comment.get('author')):
        return False
    return has_marker(comment.get('body') or '', marker)


def is_ai_card(thread: dict) -> bool:
    """True for persistent AI cards (threadType='ai') or legacy AI Reviewer roots."""
    if not thread:
        return False
    if str(thread.get('threadType') or '').lower() == 'ai':
        return True
    comments = thread.get('comments') or []
    root = comments[0] if comments else None
    return bool(root and isinstance(root, dict) and is_ai_author(root.get('author')))


def migrate_legacy_ai_cards(annotations: dict) -> int:
    """Non-destructive: preserves threadType without rewriting comment bodies.

    Legacy sidecars with threadType='ai' keep their type; a bare-body rewrite
    is intentionally avoided because threadType is now persistent in the
    sidecar schema and isAiCard() short-circuits on it.
    """
    changed = 0
    for thread in annotations.get('annotations') or []:
        if not isinstance(thread, dict):
            continue
        tt = str(thread.get('threadType') or '').lower()
        if tt == 'ai':
            changed += 1  # counted but not rewritten
        elif tt and tt not in ('ai', 'review'):
            thread.pop('threadType', None)
    return changed


def _human_comment_is_work(thread: dict, comment: dict, marker: Optional[str] = None):
    """Return (include, marker, synthetic_marker) for explicit markers and AI-card bare text."""
    if not comment or is_ai_author(comment.get('author')):
        return False, None, False
    body = (comment.get('body') or '').strip()
    if not body:
        return False, None, False
    found = extract_marker(comment.get('body') or '')
    marker = canonical_marker(marker)
    if not found:
        # AI card: bare human text counts as work (synthetic @AI).
        if is_ai_card(thread):
            return True, '@AI', True
        return False, None, False
    if marker is not None and found != marker:
        return False, found, False
    return True, found, False


def read_mentor(path: str) -> tuple[str, dict]:
    """Read a .mentor ZIP, return (content_md, annotations_dict)."""
    with zipfile.ZipFile(path, 'r') as zf:
        content_md = zf.read('content.md').decode('utf-8')
        annotations = json.loads(zf.read('annotations.json'))
    migrate_legacy_ai_cards(annotations)
    return content_md, annotations


def _media_refs_in_md(content_md: str) -> list[str]:
    """Ordered unique media/... paths referenced by markdown images."""
    found = re.findall(r'!\[[^\]]*\]\((media/[^)\s]+)\)', content_md or '')
    out, seen = [], set()
    for m in found:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


# Package contract: media/* is image-only. Everything else stays outside .mentor.
MEDIA_IMAGE_EXTS = frozenset({
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.bmp', '.tif', '.tiff', '.avif', '.ico',
})
CORE_MEMBERS = frozenset({'content.md', 'annotations.json'})
# Optional first-class package members (Mentor citation library + structural archive).
# media_images_only stray-stripping must NOT drop these.
OPTIONAL_PACKAGE_MEMBERS = frozenset({
    'references.json',
    'references.bib',
    'document.html',
    'manifest.json',
})


def is_media_image_path(name: str) -> bool:
    """True iff arcname is media/<file> with an allowed image extension."""
    if not name or not isinstance(name, str):
        return False
    n = name.replace('\\', '/').lstrip('./')
    if not n.startswith('media/') or n.endswith('/'):
        return False
    base = n.rsplit('/', 1)[-1]
    if not base or base in ('.', '..') or '/' in base:
        return False
    ext = os.path.splitext(base)[1].lower()
    return ext in MEDIA_IMAGE_EXTS


def _media_refs_in_annotations(annotations: Optional[dict]) -> list[str]:
    """Ordered unique media/... paths from thread imageAnchors (pure-image cards)."""
    out, seen = [], set()
    if not annotations or not isinstance(annotations, dict):
        return out
    for th in annotations.get('annotations') or []:
        if not isinstance(th, dict):
            continue
        for ia in th.get('imageAnchors') or []:
            if not isinstance(ia, dict):
                continue
            src = str(ia.get('src') or '').strip()
            if not src:
                continue
            # normalize blob/absolute away — only keep package-relative media/
            if src.startswith('blob:') or '://' in src:
                continue
            if not src.startswith('media/'):
                if src.startswith('/'):
                    continue
                src = 'media/' + src.lstrip('./')
            if src not in seen:
                seen.add(src)
                out.append(src)
    return out


def referenced_media(content_md: str, annotations: Optional[dict] = None) -> list[str]:
    """Union of media paths referenced by content.md images and annotation imageAnchors."""
    out, seen = [], set()
    for src in _media_refs_in_md(content_md) + _media_refs_in_annotations(annotations):
        if src not in seen:
            seen.add(src)
            out.append(src)
    return out


def _is_image_thread(thread: dict) -> bool:
    if not thread or not isinstance(thread, dict):
        return False
    if thread.get('skipMark'):
        return True
    if thread.get('imageAnchors'):
        return True
    lab = str(thread.get('text') or '').strip()
    return lab == '[图片]' or lab.startswith('[图片]')


def _all_occurrences(content: str, text: str) -> list[int]:
    """Return overlapping occurrence offsets for ``text`` in ``content``."""
    if not text:
        return []
    out, start = [], 0
    while True:
        idx = content.find(text, start)
        if idx < 0:
            return out
        out.append(idx)
        start = idx + 1


def _context_at(content: str, start: int, text_len: int,
                context_chars: int = 40) -> tuple[str, str]:
    """Extract context around a KNOWN occurrence, never ``str.find`` again."""
    left = max(0, start - context_chars)
    right = min(len(content), start + text_len + context_chars)
    return content[left:start], content[start + text_len:right]


def _common_suffix_len(a: str, b: str) -> int:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[-1 - i] == b[-1 - i]:
        i += 1
    return i


def _common_prefix_len(a: str, b: str) -> int:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


def _locate_anchor_occurrence(content_md: str, text: str,
                              old_prefix: str = '', old_suffix: str = '',
                              context_chars: int = 40) -> Optional[int]:
    """Locate one anchor occurrence using the stored context.

    Exact ``prefix + text + suffix`` wins. For duplicate anchor text after a
    nearby external edit, score each occurrence by matching suffix/prefix
    characters of its local context. A unique positive best score is accepted;
    ties remain unresolved so /fix-mentor never silently moves a comment.
    """
    occurrences = _all_occurrences(content_md, text)
    if not occurrences:
        return None
    if len(occurrences) == 1:
        return occurrences[0]
    if old_prefix or old_suffix:
        needle = old_prefix + text + old_suffix
        exact = _all_occurrences(content_md, needle)
        if len(exact) == 1:
            return exact[0] + len(old_prefix)
        scored = []
        window = max(context_chars, len(old_prefix), len(old_suffix))
        for idx in occurrences:
            local_prefix, local_suffix = _context_at(
                content_md, idx, len(text), window)
            pre_score = _common_suffix_len(old_prefix, local_prefix) if old_prefix else 0
            suffix_score = _common_prefix_len(old_suffix, local_suffix) if old_suffix else 0
            scored.append((pre_score + suffix_score, pre_score, suffix_score, idx))
        scored.sort(reverse=True)
        if scored and scored[0][0] > 0:
            best = scored[0]
            if len(scored) == 1 or best[:3] != scored[1][:3]:
                return best[3]
    return None


def realign_threads(annotations: dict, content_md: str,
                    context_chars: int = 40) -> list[str]:
    """Refresh thread contexts without moving duplicate anchors.

    The stored anchor text may occur several times. The previous implementation
    found the correct old triple, then called ``extract_context``; that helper
    uses ``str.find`` and silently jumped back to the FIRST duplicate. It also
    rejected every duplicate after finding it because ``count(text) != 1``.

    This implementation resolves an occurrence first, then extracts context at
    that exact offset. Ambiguous ties are left untouched and reported.
    Image threads are skipped because their anchors do not live in content.md.
    """
    warns = []
    threads = annotations.get('annotations') or []
    for i, th in enumerate(threads):
        if _is_image_thread(th):
            continue
        text = (th.get('text') or '').strip()
        if not text:
            continue
        old_prefix = th.get('prefix') or ''
        old_suffix = th.get('suffix') or ''
        start = _locate_anchor_occurrence(
            content_md, text, old_prefix, old_suffix, context_chars)
        if start is None:
            warns.append(
                f'thread[{i}] anchor not uniquely located after edit; '
                f'prefix/suffix left unchanged (please re-attach in Mentor)'
            )
            continue
        th['prefix'], th['suffix'] = _context_at(
            content_md, start, len(text), context_chars)
    return warns



# ---------------------------------------------------------------------------
# Word-style range mapping + structural archive rebuild
# ---------------------------------------------------------------------------

def _map_pos_through_opcodes(pos: int, opcodes: list, *, assoc: int = 1) -> int:
    """Map a cursor in old text through SequenceMatcher opcodes.

    assoc=+1: prefer the right side at boundaries (range start).
    assoc=-1: prefer the left side (range end).
    """
    if not opcodes:
        return pos
    last_j2 = 0
    for tag, i1, i2, j1, j2 in opcodes:
        last_j2 = j2
        if pos < i1:
            return j1
        if pos > i2:
            continue
        # pos in [i1, i2]
        if pos == i2:
            # Boundary between this op and the next. Defer unless final.
            continue
        if tag == 'equal':
            return j1 + (pos - i1)
        if tag == 'delete':
            return j1
        if tag == 'insert':
            return j2 if assoc > 0 else j1
        if tag == 'replace':
            old_len = i2 - i1
            new_len = j2 - j1
            if old_len <= 0:
                return j1
            rel = (pos - i1) / old_len
            return j1 + int(round(rel * new_len))
    return last_j2


def map_span_through_edit(old_start: int, old_end: int, opcodes: list
                          ) -> Optional[Tuple[int, int]]:
    """Map [old_start, old_end) through edit opcodes. None if collapsed away.

    Overlapping equal/replace pieces are unioned in new-text coordinates so a
    multi-opcode rewrite of the quoted span (e.g. F → *F*, p → *p*) keeps one
    continuous range. Inserts strictly before old_start or at/after old_end are
    excluded (Word does not grow a comment when you type outside it).
    """
    if old_end < old_start:
        return None
    pieces = []
    for tag, i1, i2, j1, j2 in opcodes:
        # overlap in old coordinates
        o1 = max(i1, old_start)
        o2 = min(i2, old_end)
        if tag == 'insert':
            # Inserts strictly inside the old span (not leading boundary).
            if old_start < i1 < old_end:
                pieces.append((j1, j2))
            continue
        if o1 >= o2:
            continue
        if tag == 'equal':
            pieces.append((j1 + (o1 - i1), j1 + (o2 - i1)))
        elif tag == 'delete':
            continue
        elif tag == 'replace':
            if o1 == i1 and o2 == i2:
                pieces.append((j1, j2))
            else:
                old_len = i2 - i1
                new_len = j2 - j1
                if old_len <= 0:
                    pieces.append((j1, j2))
                else:
                    ns = j1 + int(round((o1 - i1) / old_len * new_len))
                    ne = j1 + int(round((o2 - i1) / old_len * new_len))
                    if ne < ns:
                        ns, ne = ne, ns
                    if ne == ns and new_len > 0:
                        ne = min(j2, ns + 1)
                    pieces.append((ns, ne))
    if not pieces:
        return None
    new_start = min(p[0] for p in pieces)
    new_end = max(p[1] for p in pieces)
    if new_end <= new_start:
        return None
    return new_start, new_end


def _expand_md_emphasis_wrappers(md: str, start: int, end: int) -> Tuple[int, int]:
    """Absorb markdown emphasis wrappers the range mapping clipped off.

    Handles both symmetric wraps (*whole*) and token-local wraps produced by
    APA-style italics (*F*, *p*) where only the opening or closing marker sits
    just outside the mapped span while its partner is inside.
    """
    if not md or start is None or end is None:
        return start, end
    start = max(0, min(start, len(md)))
    end = max(start, min(end, len(md)))

    def _absorb_openers():
        nonlocal start
        moved = False
        # Opening ** / * / _ immediately before start, closer inside (start, end)
        while start >= 2 and md[start-2:start] == '**' and '**' in md[start:end]:
            start -= 2
            moved = True
        while start > 0 and md[start-1] == '*' and '*' in md[start:end]:
            start -= 1
            moved = True
        while start > 0 and md[start-1] == '_' and '_' in md[start:end]:
            start -= 1
            moved = True
        return moved

    def _absorb_closers():
        nonlocal end
        moved = False
        while end + 2 <= len(md) and md[end:end+2] == '**' and '**' in md[start:end]:
            end += 2
            moved = True
        while end < len(md) and md[end] == '*' and '*' in md[start:end]:
            end += 1
            moved = True
        while end < len(md) and md[end] == '_' and '_' in md[start:end]:
            end += 1
            moved = True
        return moved

    # Symmetric first, then one-sided openers/closers; repeat until stable.
    for _ in range(8):
        changed = False
        if (start >= 2 and end + 2 <= len(md)
                and md[start-2:start] == '**' and md[end:end+2] == '**'):
            start -= 2
            end += 2
            changed = True
        elif start > 0 and end < len(md) and md[start-1] == '*' and md[end] == '*':
            start -= 1
            end += 1
            changed = True
        elif start > 0 and end < len(md) and md[start-1] == '_' and md[end] == '_':
            start -= 1
            end += 1
            changed = True
        if _absorb_openers():
            changed = True
        if _absorb_closers():
            changed = True
        if not changed:
            break
    return start, end


def _apply_md_range_to_thread(th: dict, content_md: str, start: int, end: int,
                              context_chars: int = 40) -> None:
    """Write Word-style mdRange + quote projection from an exact MD span."""
    start = max(0, min(start, len(content_md)))
    end = max(start, min(end, len(content_md)))
    new_text = content_md[start:end]
    th['text'] = new_text
    th['prefix'], th['suffix'] = _context_at(
        content_md, start, end - start, context_chars)
    th['mdRange'] = {'from': start, 'to': end}
    th['range'] = {'from': start, 'to': end}
    th['deleted'] = False
    th['invalid'] = False
    th['fuzzy'] = False
    th.pop('invalidReason', None)
    _mark_thread_anchor_status(th, 'attached', None, deleted=False)
    anchor = th.get('anchor') if isinstance(th.get('anchor'), dict) else {}
    quote = dict(anchor.get('quote') or {})
    quote['exact'] = new_text
    quote['prefix'] = th['prefix']
    quote['suffix'] = th['suffix']
    anchor['quote'] = quote
    anchor['status'] = 'attached'
    anchor['confidence'] = 1
    anchor['position'] = {'from': start, 'to': end}
    anchor['updatedAt'] = now_iso()
    th['anchor'] = anchor



def ensure_md_ranges(annotations: dict, content_md: str, context_chars: int = 40) -> list[str]:
    """Stamp mdRange for threads that lack one — unique exact text only.

    Non-unique / missing text => orphan. No multi-candidate quote scoring.
    """
    warns: list[str] = []
    md = content_md or ''
    for i, th in enumerate(annotations.get('annotations') or []):
        if not isinstance(th, dict) or _is_image_thread(th):
            continue
        text = th.get('text') or ''
        if not str(text).strip():
            continue
        mr = th.get('mdRange') if isinstance(th.get('mdRange'), dict) else None
        if mr and isinstance(mr.get('from'), int) and isinstance(mr.get('to'), int):
            a, b = int(mr['from']), int(mr['to'])
            if 0 <= a < b <= len(md) and md[a:b] == text:
                continue
        # unique exact only
        start = 0
        hits = []
        while True:
            j = md.find(text, start)
            if j < 0:
                break
            hits.append(j)
            start = j + 1
            if len(hits) > 1:
                break
        if len(hits) != 1:
            warns.append(f'thread[{i}] ensure_md_ranges: non-unique or missing; orphaned')
            _mark_thread_anchor_status(th, 'orphaned', 'missing-mdRange', deleted=False)
            th.pop('mdRange', None)
            continue
        _apply_md_range_to_thread(th, md, hits[0], hits[0] + len(text), context_chars)
    return warns


def word_rebind_threads(old_md: str, new_md: str, annotations: dict,
                        context_chars: int = 40) -> list[str]:
    """Rebind text threads like Word comment ranges after an external MD edit.

    1. Locate each thread in *old_md* via **mdRange only** (no quote search).
    2. Map the span through difflib opcodes onto *new_md*.
    3. Refresh text/prefix/suffix/mdRange from the mapped span (Word behaviour).
    4. If map collapses or mdRange missing → orphan (no quote fallback).
    """
    if old_md is None:
        return realign_threads(annotations, new_md, context_chars)
    if old_md == new_md:
        return realign_threads(annotations, new_md, context_chars)

    opcodes = SequenceMatcher(None, old_md, new_md, autojunk=False).get_opcodes()
    warns: list[str] = []
    threads = annotations.get('annotations') or []
    for i, th in enumerate(threads):
        if not isinstance(th, dict) or _is_image_thread(th):
            continue
        text = th.get('text') or ''
        if not str(text).strip():
            continue

        # RANGE MODE: mdRange is the only locator (no quote search fallback).
        old_start = old_end = None
        mr = th.get('mdRange') if isinstance(th.get('mdRange'), dict) else None
        if mr and isinstance(mr.get('from'), int) and isinstance(mr.get('to'), int):
            old_start, old_end = int(mr['from']), int(mr['to'])
            if not (0 <= old_start < old_end <= len(old_md)):
                old_start, old_end = None, None
            elif old_md[old_start:old_end] != text and text:
                # Stale text vs range — trust range coordinates
                pass

        mapped = None
        if old_start is not None and old_end is not None:
            mapped = map_span_through_edit(old_start, old_end, opcodes)

        if mapped is not None:
            ns, ne = mapped
            ns, ne = _expand_md_emphasis_wrappers(new_md, ns, ne)
            if 0 <= ns < ne <= len(new_md):
                _apply_md_range_to_thread(th, new_md, ns, ne, context_chars)
                continue

        warns.append(
            f'thread[{i}] orphaned after word-rebind: missing/invalid mdRange or span deleted'
        )
        _mark_thread_anchor_status(th, 'orphaned', 'orphaned', deleted=True)
    return warns


def build_document_html(content_md: str, annotations: dict) -> str:
    """Build structural document.html with span[data-thread-id] marks.

    Plain-text offsets of the HTML body match content.md 1:1 (pre-wrap div),
    so Mentor can restore marks without quote search. TipTap may normalise
    structure on the next interactive save — that is intentional.
    """
    n = len(content_md or '')
    opens: dict = {}
    closes: dict = {}
    for th in annotations.get('annotations') or []:
        if not isinstance(th, dict) or _is_image_thread(th):
            continue
        status = None
        if isinstance(th.get('anchor'), dict):
            status = th['anchor'].get('status')
        if th.get('deleted') or th.get('invalidReason') in (
                'orphaned', 'ambiguous', 'collision'):
            continue
        if status in ('orphaned', 'ambiguous', 'collision'):
            continue
        text = th.get('text') or ''
        mr = th.get('mdRange') if isinstance(th.get('mdRange'), dict) else None
        if mr and isinstance(mr.get('from'), int) and isinstance(mr.get('to'), int):
            a, b = int(mr['from']), int(mr['to'])
        else:
            start = _locate_anchor_occurrence(
                content_md, text, th.get('prefix') or '', th.get('suffix') or '')
            if start is None:
                continue
            a, b = start, start + len(text)
        if not (0 <= a < b <= n):
            continue
        tid = str(th.get('threadId') or '').strip()
        if not tid:
            continue
        opens.setdefault(a, []).append(
            (tid, th.get('threadType'), th.get('resolved')))
        closes.setdefault(b, []).append(tid)

    parts = [
        '<div class="mentor-body" data-mentor-body="md-plain" '
        'style="white-space:pre-wrap">'
    ]
    i = 0
    while i <= n:
        if i in closes:
            for _tid in reversed(closes[i]):
                parts.append('</span>')
        if i == n:
            break
        if i in opens:
            for tid, tt, resolved in opens[i]:
                attrs = [f'data-thread-id="{html_escape(tid, quote=True)}"']
                if tt in ('ai', 'review'):
                    attrs.append(f'data-thread-type="{tt}"')
                if resolved:
                    attrs.append('data-resolved="true"')
                parts.append('<span ' + ' '.join(attrs) + '>')
        ch = content_md[i]
        if ch == '&':
            parts.append('&amp;')
        elif ch == '<':
            parts.append('&lt;')
        elif ch == '>':
            parts.append('&gt;')
        else:
            parts.append(ch)
        i += 1
    parts.append('</div>')
    return ''.join(parts)


def build_archive_manifest(md_text: str, annotations_text: str,
                           document_html: str,
                           created_at: Optional[str] = None) -> dict:
    """Mirror Mentor modules/mentor-archive.js createArchiveManifest."""
    def sha(s: str) -> str:
        return hashlib.sha256(s.encode('utf-8')).hexdigest()
    return {
        'schemaVersion': 1,
        'body': 'document.html',
        'createdAt': created_at or now_iso(),
        'hashes': {
            'content.md': sha(md_text),
            'annotations.json': sha(annotations_text),
            'document.html': sha(document_html),
        },
    }


def _read_zip_member_text(path: str, name: str) -> Optional[str]:
    if not os.path.isfile(path):
        return None
    try:
        with zipfile.ZipFile(path, 'r') as zf:
            if name not in zf.namelist():
                return None
            return zf.read(name).decode('utf-8')
    except (zipfile.BadZipFile, UnicodeDecodeError, KeyError):
        return None


def ensure_image_anchors(annotations: dict, content_md: str = '',
                         zip_media: Optional[list[str]] = None) -> list[str]:
    """Fill missing imageAnchors on pure-image threads. Returns warning strings.

    Rules:
      - Never drop existing imageAnchors
      - Never silently rewrite multiple distinct IAs onto one media without warning
      - If missing: prefer single media ref in md; else single media/* in zip;
        else warn (do not guess among many)
    """
    warns = []
    media_md = _media_refs_in_md(content_md)
    zip_media = list(zip_media or [])
    threads = annotations.get('annotations') or []
    for i, th in enumerate(threads):
        if not _is_image_thread(th):
            continue
        ia = th.get('imageAnchors')
        if isinstance(ia, list) and len(ia) > 0:
            blob_idxs = [
                j for j, a in enumerate(ia)
                if isinstance(a, dict) and isinstance(a.get('src'), str) and a['src'].startswith('blob:')
            ]
            if blob_idxs and len(media_md) == 1:
                if len(ia) > 1:
                    warns.append(
                        f'thread[{i}] {len(blob_idxs)} blob imageAnchors collapse to sole media {media_md[0]} '
                        f'({len(ia)} total IAs) — verify manually'
                    )
                for j in blob_idxs:
                    ia[j]['src'] = media_md[0]
                    warns.append(f'thread[{i}] imageAnchors[{j}].src blob→{media_md[0]}')
            elif blob_idxs and len(media_md) != 1:
                warns.append(
                    f'thread[{i}] {len(blob_idxs)} blob imageAnchors left unresolved '
                    f'(media refs in md={len(media_md)}) — set manually'
                )
            continue
        candidate = None
        if len(media_md) == 1:
            candidate = media_md[0]
        elif len(zip_media) == 1:
            z = zip_media[0]
            candidate = z if z.startswith('media/') else 'media/' + z
        elif len(media_md) > 1:
            warns.append(
                f'thread[{i}] pure-image missing imageAnchors; '
                f'{len(media_md)} media refs in md — set manually'
            )
            continue
        elif len(zip_media) > 1:
            warns.append(
                f'thread[{i}] pure-image missing imageAnchors; '
                f'{len(zip_media)} media/* in zip — set manually'
            )
            continue
        else:
            warns.append(f'thread[{i}] pure-image missing imageAnchors; no media found')
            continue
        th['imageAnchors'] = [{
            'from': 0, 'to': 1,
            'src': candidate,
            'alt': '', 'title': '',
        }]
        warns.append(f'thread[{i}] imageAnchors filled → {candidate}')
    return warns


def audit_anchor_health(annotations: dict, content_md: str,
                        context_chars: int = 40) -> dict:
    """Dry-run anchor audit shared with Mentor UI semantics.

    Returns {ok, warnings, ambiguous, orphaned, attached}.
    Never mutates annotations.
    """
    warns = []
    ambiguous = []
    orphaned = []
    attached = []
    threads = annotations.get('annotations') or []
    for i, th in enumerate(threads):
        if _is_image_thread(th):
            continue
        text = (th.get('text') or '').strip()
        if not text:
            continue
        start = _locate_anchor_occurrence(
            content_md, text, th.get('prefix') or '', th.get('suffix') or '',
            context_chars)
        if start is None:
            # escape / emphasis variants (n_init vs n\_init, _p_ vs p in md)
            lit, start = resolve_text_in_md(
                content_md, text, th.get('prefix') or '', th.get('suffix') or '',
                context_chars)
        if start is None:
            occ = []
            for cand in md_literal_variants(text):
                occ = _all_occurrences(content_md, cand)
                if occ:
                    break
            if not occ:
                orphaned.append(i)
                warns.append(f'thread[{i}] orphaned: anchor text not found')
            else:
                ambiguous.append(i)
                warns.append(
                    f'thread[{i}] ambiguous: {len(occ)} candidates, no unique context'
                )
        else:
            attached.append(i)
    return {
        'ok': not ambiguous and not orphaned,
        'warnings': warns,
        'ambiguous': ambiguous,
        'orphaned': orphaned,
        'attached': attached,
    }


def _safe_zip_arcname(name: str) -> str:
    """Reject path traversal and absolute paths in ZIP member names."""
    raw = str(name).replace('\\', '/')
    if not raw or raw.endswith('/'):
        raise ValueError(f'invalid zip arcname: {name!r}')
    if raw.startswith('/') or raw.startswith('../') or raw == '..':
        raise ValueError(f'unsafe zip arcname: {name!r}')
    parts = raw.split('/')
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError(f'unsafe zip arcname: {name!r}')
    return raw


def _mark_thread_anchor_status(th: dict, status: str, reason: Optional[str] = None,
                               *, deleted: bool = False) -> None:
    """Project audit status onto legacy flags without dropping multi-evidence fields.

    Healthy statuses (attached/moved) clear invalid/fuzzy/deleted.
    Unhealthy statuses set invalid and reason (never leave stale fuzzy=True
    on a successful rebind — that is what painted false 位置可能偏移).
    """
    if status in ('attached', 'moved'):
        th['invalid'] = False
        th['fuzzy'] = False
        th['deleted'] = False
        th.pop('invalidReason', None)
        conf = 1
    else:
        th['invalid'] = True
        th['fuzzy'] = status == 'ambiguous'
        if deleted or status == 'orphaned':
            th['deleted'] = True
        if reason:
            th['invalidReason'] = reason
        conf = 0
    anchor = th.get('anchor') if isinstance(th.get('anchor'), dict) else {}
    merged = {
        **anchor,
        'status': status,
        'version': anchor.get('version') or '1',
        'updatedAt': now_iso(),
        'confidence': conf if status in (
            'attached', 'moved', 'ambiguous', 'orphaned', 'collision'
        ) else anchor.get('confidence', conf),
    }
    th['anchor'] = merged


def md_literal_variants(text: str) -> list:
    """Candidate forms of an anchor string as it may appear in content.md.

    Covers plain vs escaped underscores (n_init vs n\\_init) and light
    emphasis wrappers so external /fm never orphans on escape drift.
    """
    if not text:
        return []
    out = []
    seen = set()

    def add(s):
        if s and s not in seen:
            seen.add(s)
            out.append(s)

    add(text)
    # protect already-escaped, then escape bare _ used as md italic/escape
    add(text.replace('_', r'\_'))
    # unescape \_ -> _
    plain = text.replace(r'\_', '_')
    add(plain)
    # strip simple _token_ italics (non-greedy, no spaces)
    stripped = re.sub(
        r'(^|[^A-Za-z0-9])_([^_\s\n]{1,40})_(?![A-Za-z0-9])',
        r'\1\2',
        plain,
    )
    add(stripped)
    add(stripped.replace('_', r'\_'))
    return out


def resolve_text_in_md(content_md: str, text: str, prefix: str = '',
                      suffix: str = '', context_chars: int = 40):
    """Return (literal_text, start) if uniquely locatable, else (None, None)."""
    if not content_md or not text:
        return None, None
    for cand in md_literal_variants(text):
        start = _locate_anchor_occurrence(
            content_md, cand, prefix, suffix, context_chars)
        if start is not None:
            return cand, start
        occ = _all_occurrences(content_md, cand)
        if len(occ) == 1:
            return cand, occ[0]
    return None, None


def sanitize_anchors_for_write(annotations: dict, content_md: str,
                               context_chars: int = 40) -> list:
    """Pre-write hygiene — prevent post-/fm false drift / lost anchors.

    1. Map thread.text onto the exact content.md byte-literal when needed
       (escape / emphasis drift).
    2. Refresh mdRange + prefix/suffix at the resolved offset.
    3. Clear stale fuzzy/invalid on healthy attached threads.
    4. Do not invent positions for true ambiguous/orphaned.

    Returns warning strings (also printed by write_mentor).
    """
    warns = []
    threads = annotations.get('annotations') or []
    for i, th in enumerate(threads):
        if not isinstance(th, dict) or _is_image_thread(th):
            if isinstance(th, dict) and _is_image_thread(th):
                # image cards: clear false fuzzy only
                if th.get('fuzzy') and not th.get('invalid'):
                    th['fuzzy'] = False
            continue
        text = (th.get('text') or '').strip()
        if not text:
            continue
        prefix = th.get('prefix') or ''
        suffix = th.get('suffix') or ''
        lit, start = resolve_text_in_md(
            content_md, text, prefix, suffix, context_chars)
        if start is None or lit is None:
            # leave for audit_anchor_health
            continue
        end = start + len(lit)
        if lit != text:
            warns.append(
                f'thread[{i}] text aligned to md literal '
                f'{text[:40]!r} → {lit[:40]!r}'
            )
        _apply_md_range_to_thread(th, content_md, start, end, context_chars)
        # _apply already clears fuzzy; ensure attached mark status healthy
        _mark_thread_anchor_status(th, 'attached', None, deleted=False)
    return warns


def write_mentor(path: str, content_md: str, annotations: dict,
                 extra_files: Optional[dict] = None, *,
                 dry_run: bool = False,
                 block_on_unhealthy: bool = False,
                 prune_unreferenced_media: bool = True,
                 media_images_only: bool = True,
                 drop_structural: Optional[bool] = None) -> int:
    """Write a .mentor ZIP. Returns byte count (0 when dry_run).

    Package contract (v2.5.5+ / v2.5.6):
          content.md + annotations.json + media/<images only, referenced by default>
          + optional references.json / references.bib (citation library)
          + optional document.html / manifest.json (structural anchors)

        Preserves prior media/* and OPTIONAL_PACKAGE_MEMBERS from the existing
        path when present. Pass extra_files={arcname: bytes|path} to
        add/overwrite members (e.g. updated media/image6.png, references.json).
        Non-image paths under media/ in extra_files raise ValueError when
        media_images_only=True.

        By default (prune_unreferenced_media=True) drops media/* that are not
        referenced by content.md image links or annotation imageAnchors.
        media_images_only=True also drops non-image media/* and stray non-package
        members (csv/pdf/scripts). references.json/bib and structural archive
        members are kept.

    Before write: ensure_image_anchors on pure-image threads (Mentor v1.43.40+).

    Keywords:
      dry_run: run realign+audit and mutate the in-memory annotations flags,
               but do not touch disk.
      block_on_unhealthy: raise RuntimeError if any text thread is ambiguous
               or orphaned after audit (orchestrators that must not ship bad
               anchors). Default False preserves historical flag-and-write.
      prune_unreferenced_media: drop media/* not referenced by md or
               imageAnchors (default True).
      media_images_only: only allow image extensions under media/*; drop
               other media and non-core members (default True).
    """
    annotations = dict(annotations)
    zip_media_names: list[str] = []
    if os.path.isfile(path):
        try:
            with zipfile.ZipFile(path, 'r') as zf:
                zip_media_names = [
                    n for n in zf.namelist()
                    if n.startswith('media/') and not n.endswith('/')
                ]
        except zipfile.BadZipFile:
            zip_media_names = []
    if extra_files:
        for name in extra_files:
            safe = _safe_zip_arcname(name)
            if media_images_only and safe.startswith('media/') and not is_media_image_path(safe):
                raise ValueError(
                    f'extra_files[{name!r}]: media/* must be an image '
                    f'({", ".join(sorted(MEDIA_IMAGE_EXTS))}); got non-image path'
                )
            if safe.startswith('media/') and safe not in zip_media_names:
                zip_media_names.append(safe)

    # Prefer referenced + image media when resolving pure-image anchors.
    ref_seed = set(referenced_media(content_md, annotations))
    if extra_files:
        for name in extra_files:
            safe = _safe_zip_arcname(name)
            if safe.startswith('media/'):
                ref_seed.add(safe)
    if media_images_only:
        zip_media_names = [n for n in zip_media_names if is_media_image_path(n)]
        ref_seed = {n for n in ref_seed if is_media_image_path(n)}
    zip_media_for_ia = (
        [n for n in zip_media_names if n in ref_seed] or list(zip_media_names)
    )

    # Word-style rebind: map ranges through old→new content.md when prior zip exists.
    old_md = _read_zip_member_text(path, 'content.md') if os.path.isfile(path) else None

    ia_warns = ensure_image_anchors(annotations, content_md, zip_media_for_ia)
    for w in ia_warns:
        print(f'[write_mentor] {w}')
    if old_md is not None and old_md != content_md:
        # Range mode: hydrate mdRange (unique exact only) before opcode map
        ensure_md_ranges(annotations, old_md if old_md is not None else content_md)
        rebind_warns = word_rebind_threads(old_md, content_md, annotations)
        for w in rebind_warns:
            print(f'[write_mentor][word-rebind] {w}')
    else:
        realign_warns = realign_threads(annotations, content_md)
        for w in realign_warns:
            print(f'[write_mentor] {w}')
    # Drift prevention: md-literal align + clear stale fuzzy before audit
    for w in sanitize_anchors_for_write(annotations, content_md):
        print(f'[write_mentor][sanitize] {w}')
    audit = audit_anchor_health(annotations, content_md)
    for w in audit.get('warnings') or []:
        print(f'[write_mentor][audit] {w}')
    threads = annotations.get('annotations') or []
    blockers: list[str] = []
    for i in audit.get('ambiguous') or []:
        if 0 <= i < len(threads) and isinstance(threads[i], dict):
            _mark_thread_anchor_status(threads[i], 'ambiguous', 'ambiguous', deleted=False)
            blockers.append(f'thread[{i}] ambiguous')
    for i in audit.get('orphaned') or []:
        if 0 <= i < len(threads) and isinstance(threads[i], dict):
            _mark_thread_anchor_status(threads[i], 'orphaned', 'orphaned', deleted=True)
            blockers.append(f'thread[{i}] orphaned')
    annotations['updatedAt'] = now_iso()

    if block_on_unhealthy and blockers:
        raise RuntimeError(
            'write_mentor blocked: ' + '; '.join(blockers)
            + ' — re-attach in Mentor or pass block_on_unhealthy=False'
        )

    preserved: dict[str, bytes] = {}
    if os.path.isfile(path):
        try:
            with zipfile.ZipFile(path, 'r') as zf:
                for name in zf.namelist():
                    if name in CORE_MEMBERS:
                        continue
                    if name.endswith('/'):
                        continue
                    try:
                        safe = _safe_zip_arcname(name)
                    except ValueError:
                        print(f'[write_mentor] dropping unsafe preserved member {name!r}')
                        continue
                    preserved[safe] = zf.read(name)
        except zipfile.BadZipFile:
            preserved = {}

    if extra_files:
        for name, payload in extra_files.items():
            safe = _safe_zip_arcname(name)
            if isinstance(payload, (bytes, bytearray)):
                preserved[safe] = bytes(payload)
            elif isinstance(payload, str) and os.path.isfile(payload):
                with open(payload, 'rb') as f:
                    preserved[safe] = f.read()
            else:
                raise TypeError(f'extra_files[{name!r}] must be bytes or file path')

    if prune_unreferenced_media:
        keep = set(referenced_media(content_md, annotations))
        # extra_files media always kept for this write even if not yet linked
        # (caller may be mid-edit); still drops plain orphans from old zip.
        if extra_files:
            for name in extra_files:
                safe = _safe_zip_arcname(name)
                if safe.startswith('media/'):
                    keep.add(safe)
        dropped = sorted(
            n for n in list(preserved)
            if n.startswith('media/') and n not in keep
        )
        for n in dropped:
            del preserved[n]
        if dropped:
            print(
                f'[write_mentor] pruned {len(dropped)} unreferenced media: '
                + ', '.join(dropped)
            )

    if media_images_only:
        bad_media = sorted(
            n for n in list(preserved)
            if n.startswith('media/') and not is_media_image_path(n)
        )
        for n in bad_media:
            del preserved[n]
        if bad_media:
            print(
                f'[write_mentor] dropped {len(bad_media)} non-image media: '
                + ', '.join(bad_media)
            )
        # .mentor is not a project archive — strip stray non-package members.
        # Keep media/* and OPTIONAL_PACKAGE_MEMBERS (refs + structural HTML).
        stray = sorted(
            n for n in list(preserved)
            if not n.startswith('media/') and n not in OPTIONAL_PACKAGE_MEMBERS
        )
        for n in stray:
            del preserved[n]
        if stray:
            print(
                f'[write_mentor] dropped {len(stray)} non-package members: '
                + ', '.join(stray)
            )
        # referenced non-image under media/ is already dropped; surface if md still points at it
        bad_refs = [
            r for r in referenced_media(content_md, annotations)
            if r.startswith('media/') and not is_media_image_path(r)
        ]
        if bad_refs:
            print(
                '[write_mentor] WARNING: content/annotations reference non-image media '
                '(not packaged): ' + ', '.join(bad_refs)
            )

    # Structural document.html is TipTap-authored HTML. External mentor_io must
    # NOT invent a body. drop_structural:
    #   True  -> always drop (repair / user-mess recovery)
    #   False -> keep if present; refresh manifest when possible
    #   None  -> drop on content.md change; annotations-only may keep+refresh
    ann_text = json.dumps(annotations, ensure_ascii=False, indent=2)
    content_changed = (old_md is None) or (old_md != content_md)
    force_drop = drop_structural is True or (
        drop_structural is None and content_changed)
    if force_drop:
        if 'document.html' in preserved or 'manifest.json' in preserved:
            preserved.pop('document.html', None)
            preserved.pop('manifest.json', None)
            why = 'drop_structural=True' if drop_structural is True else 'content changed'
            print('[write_mentor] dropped document.html/manifest (' + why + '; '
                  'Mentor loads content.md + quote rebind; md-emphasis plain match '
                  'avoids false 位置可能偏移; optional Ctrl+S rebuilds TipTap HTML)')
    elif 'document.html' in preserved:
        try:
            html = preserved['document.html'].decode('utf-8')
            if 'data-mentor-body="md-plain"' in html:
                preserved.pop('document.html', None)
                preserved.pop('manifest.json', None)
                print('[write_mentor] dropped fake md-plain document.html')
            else:
                manifest = build_archive_manifest(content_md, ann_text, html)
                preserved['manifest.json'] = json.dumps(
                    manifest, ensure_ascii=False, indent=2).encode('utf-8')
                print('[write_mentor] manifest hashes refreshed')
        except Exception as exc:
            preserved.pop('document.html', None)
            preserved.pop('manifest.json', None)
            print(f'[write_mentor] manifest refresh failed ({exc!r}); dropped structural')

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('content.md', content_md)
        zf.writestr('annotations.json', ann_text)
        for name, data_b in sorted(preserved.items()):
            zf.writestr(name, data_b)
    data = buf.getvalue()
    if dry_run:
        return 0
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Supervision mode sidecar (Mentor editor lock handshake with /fix-mentor)
# File: <path.mentor>.supervision.json  — polled by mentor-server GET /supervision
# ---------------------------------------------------------------------------

SUPERVISION_VERSION = 1



def _discover_mentor_server():
    """Return (base_url, token) for local mentor-server, or (None, None)."""
    roots = []
    env_root = os.environ.get('MENTOR_ROOT') or os.environ.get('MENTOR_HOME')
    if env_root:
        roots.append(env_root)
    roots.extend([
        r'E:\hermes_playground\Mentor',
        r'E:/hermes_playground/Mentor',
    ])
    # walk up from cwd
    try:
        cur = os.getcwd()
        for _ in range(4):
            roots.append(cur)
            cur = os.path.dirname(cur)
    except Exception:
        pass
    seen = set()
    for root in roots:
        if not root:
            continue
        root = os.path.abspath(root)
        if root in seen:
            continue
        seen.add(root)
        port_file = os.path.join(root, 'PORT')
        token_file = os.path.join(root, '.mentor-session')
        if not (os.path.isfile(port_file) and os.path.isfile(token_file)):
            continue
        try:
            port = int(open(port_file, encoding='utf-8').read().strip() or '8787')
            token = open(token_file, encoding='utf-8').read().strip()
        except Exception:
            continue
        if not token:
            continue
        # also drop a durable name index next to server (survives if POST fails)
        return f'http://127.0.0.1:{port}', token, root
    return None, None, None


def register_supervision_with_server(mentor_path: str) -> bool:
    """Tell mentor-server this basename→path so normal Open can poll by name."""
    abspath = os.path.abspath(mentor_path)
    base_url, token, root = _discover_mentor_server()
    # Always try durable index beside Mentor root when known
    if root:
        try:
            idx_path = os.path.join(root, '.supervision-index.json')
            data = {'byName': {}, 'updatedAt': now_iso()}
            if os.path.isfile(idx_path):
                try:
                    with open(idx_path, 'r', encoding='utf-8') as f:
                        old = json.load(f)
                    if isinstance(old, dict) and isinstance(old.get('byName'), dict):
                        data['byName'] = {str(k).lower(): v for k, v in old['byName'].items()}
                except Exception:
                    pass
            data['byName'][os.path.basename(abspath).lower()] = abspath
            data['updatedAt'] = now_iso()
            with open(idx_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write(chr(10))
        except Exception:
            pass
    if not base_url or not token:
        return False
    try:
        import urllib.request
        body = json.dumps({'token': token, 'path': abspath}).encode('utf-8')
        req = urllib.request.Request(
            base_url.rstrip('/') + '/supervision/register',
            data=body,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return 200 <= getattr(resp, 'status', 200) < 300
    except Exception:
        return False


def supervision_sidecar_path(mentor_path: str) -> str:
    """Absolute path of the supervision sidecar next to the .mentor package."""
    return os.path.abspath(mentor_path) + '.supervision.json'


def _supervision_thread_ids(pending) -> list:
    """Extract unique threadId strings from mention dicts or raw id lists."""
    out: list[str] = []
    seen: set[str] = set()
    if not pending:
        return out
    for item in pending:
        tid = ''
        if isinstance(item, dict):
            thr = item.get('thread') or {}
            tid = str(
                item.get('threadId')
                or thr.get('threadId')
                or item.get('thread_id')
                or ''
            ).strip()
        else:
            tid = str(item or '').strip()
        if tid and tid not in seen:
            seen.add(tid)
            out.append(tid)
    return out


def write_supervision(
    mentor_path: str,
    *,
    active: bool = True,
    pending=None,
    processed=None,
    current=None,
    message: str = '',
    tool: str = 'fix-mentor',
    lock_mode: str = 'pending-paragraphs',
) -> str:
    """Write/update the supervision sidecar. Returns sidecar path.

    pending/processed: list of threadId strings or mention dicts (with thread.threadId).
    current: mention/thread currently being processed (pet + signal focus).
    lock_mode: 'pending-paragraphs' (default) or 'document'.
    """
    path = supervision_sidecar_path(mentor_path)
    pending_ids = _supervision_thread_ids(pending)
    processed_ids = _supervision_thread_ids(processed)
    if current is None:
        current_list = []
    elif isinstance(current, (list, tuple)):
        current_list = current
    else:
        current_list = [current]
    current_ids = _supervision_thread_ids(current_list)
    current_id = current_ids[0] if current_ids else (pending_ids[0] if (active and pending_ids) else '')
    payload = {
        'v': SUPERVISION_VERSION,
        'active': bool(active),
        'tool': tool or 'fix-mentor',
        'lockMode': 'document' if lock_mode == 'document' else 'pending-paragraphs',
        'pendingThreadIds': pending_ids,
        'processedThreadIds': processed_ids,
        'currentThreadId': current_id,
        'message': message or '',
        'updatedAt': now_iso(),
    }
    if active and not payload.get('startedAt'):
        # Preserve startedAt across updates when file already exists.
        try:
            if os.path.isfile(path):
                with open(path, 'r', encoding='utf-8') as f:
                    old = json.load(f)
                if isinstance(old, dict) and old.get('startedAt'):
                    payload['startedAt'] = old['startedAt']
        except Exception:
            pass
        payload.setdefault('startedAt', payload['updatedAt'])
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    last_err = None
    for attempt in range(6):
        try:
            # Prefer in-place overwrite on Windows to avoid replace() lock races
            # with concurrent readers (Mentor poll).
            with open(path, 'w', encoding='utf-8') as f:
                f.write(body)
            if active:
                try:
                    register_supervision_with_server(mentor_path)
                except Exception:
                    pass
            return path
        except PermissionError as e:
            last_err = e
            time.sleep(0.15 * (attempt + 1))
        except OSError as e:
            last_err = e
            time.sleep(0.15 * (attempt + 1))
    if last_err:
        raise last_err
    return path


def start_supervision(mentor_path: str, pending, *, tool: str = 'fix-mentor',
                      message: str = '') -> str:
    """Begin supervision: lock pending-paragraph anchors in open Mentor tabs."""
    ids = _supervision_thread_ids(pending)
    msg = message or (f'fix-mentor 监管中 · 待处理 {len(ids)}' if ids else 'fix-mentor 监管中')
    return write_supervision(
        mentor_path,
        active=True,
        pending=ids,
        processed=[],
        current=ids[0] if ids else None,
        message=msg,
        tool=tool,
        lock_mode='pending-paragraphs' if ids else 'document',
    )


def update_supervision(mentor_path: str, *, pending=None, processed=None,
                       current=None, message: str = '', tool: str = 'fix-mentor') -> str:
    """Refresh pending/processed/current mid-run (after each mention)."""
    return write_supervision(
        mentor_path,
        active=True,
        pending=pending if pending is not None else [],
        processed=processed if processed is not None else [],
        current=current,
        message=message,
        tool=tool,
    )


def end_supervision(mentor_path: str) -> bool:
    """Clear supervision: delete sidecar (or write active:false fallback).

    Returns True if sidecar is gone / inactive.
    """
    path = supervision_sidecar_path(mentor_path)
    try:
        if os.path.isfile(path):
            os.remove(path)
        return True
    except OSError:
        try:
            write_supervision(mentor_path, active=False, pending=[], processed=[],
                              message='', tool='fix-mentor')
            return True
        except Exception:
            return False


def read_supervision(mentor_path: str) -> dict:
    """Read sidecar; returns {active:False} when missing/invalid."""
    path = supervision_sidecar_path(mentor_path)
    if not os.path.isfile(path):
        return {'active': False, 'pendingThreadIds': [], 'processedThreadIds': []}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {'active': False, 'pendingThreadIds': [], 'processedThreadIds': []}
        return data
    except Exception:
        return {'active': False, 'pendingThreadIds': [], 'processedThreadIds': []}


class supervision_session:
    """Context manager: start on enter, end on exit (even on error).

    Usage:
        pending = find_unanswered_mentions(ann, marker='@AI')
        with supervision_session(path, pending) as sup:
            for i, m in enumerate(pending):
                ...
                sup.tick(done=pending[:i+1], rest=pending[i+1:])
    """

    def __init__(self, mentor_path: str, pending=None, *, tool: str = 'fix-mentor'):
        self.mentor_path = mentor_path
        self.pending = list(pending or [])
        self.processed: list = []
        self.current = self.pending[0] if self.pending else None
        self.tool = tool
        self.sidecar = ''

    def __enter__(self):
        self.sidecar = start_supervision(self.mentor_path, self.pending, tool=self.tool)
        return self

    def working_on(self, mention, *, message: str = ''):
        """Point the Mentor pet/signal at this mention before processing it."""
        self.current = mention
        cur_ids = set(_supervision_thread_ids(self.pending))
        for tid in _supervision_thread_ids([mention]):
            if tid not in cur_ids:
                self.pending = [mention] + list(self.pending)
                break
        n_done = len(_supervision_thread_ids(self.processed))
        n_rest = len(_supervision_thread_ids(self.pending))
        msg = message or f'{self.tool} 正在处理 · 已完成 {n_done} · 剩余 {n_rest}'
        self.sidecar = update_supervision(
            self.mentor_path,
            pending=self.pending,
            processed=self.processed,
            current=self.current,
            message=msg,
            tool=self.tool,
        )
        return self.sidecar

    def tick(self, *, done=None, rest=None, current=None, message: str = ''):
        if done is not None:
            self.processed = list(done)
        if rest is not None:
            self.pending = list(rest)
        if current is not None:
            self.current = current
        elif self.pending:
            self.current = self.pending[0]
        else:
            self.current = None
        n_done = len(_supervision_thread_ids(self.processed))
        n_rest = len(_supervision_thread_ids(self.pending))
        msg = message or f'{self.tool} 监管中 · 已完成 {n_done} · 剩余 {n_rest}'
        self.sidecar = update_supervision(
            self.mentor_path,
            pending=self.pending,
            processed=self.processed,
            current=self.current,
            message=msg,
            tool=self.tool,
        )
        return self.sidecar

    def __exit__(self, exc_type, exc, tb):
        end_supervision(self.mentor_path)
        return False


def new_thread_id() -> str:
    return uuid.uuid4().hex[:12]


def author_name(author: Any) -> str:
    if isinstance(author, dict):
        return str(author.get('name') or author.get('id') or '')
    return str(author or '')


def is_ai_author(author: Any) -> bool:
    name = author_name(author).strip()
    if name == AI_AUTHOR:
        return True
    low = name.lower().replace(' ', '')
    if low in AI_AUTHOR_IDS:
        return True
    if isinstance(author, dict):
        aid = str(author.get('id') or '').lower().replace(' ', '')
        if aid in AI_AUTHOR_IDS:
            return True
    return False


def get_comment_at_path(annotations: dict, path: list[int]) -> dict:
    """
    path: [ti, ci] or [ti, ci, ri, ...]
    Returns the comment dict at that path.
    """
    if not path:
        raise IndexError('empty path')
    threads = annotations.get('annotations', [])
    ti = path[0]
    if ti < 0 or ti >= len(threads):
        raise IndexError(f'thread_idx {ti} out of range')
    comments = threads[ti].get('comments', [])
    if len(path) == 1:
        raise IndexError('path must include at least one comment index')
    node = None
    for idx in path[1:]:
        if idx < 0 or idx >= len(comments):
            raise IndexError(f'Invalid path {path}: index {idx} out of range')
        node = comments[idx]
        comments = node.get('replies') or node.get('comments') or node.get('children') or []
    return node


def get_replies(comment: dict) -> list:
    for key in ('replies', 'comments', 'children'):
        sub = comment.get(key)
        if isinstance(sub, list):
            return sub
    return []


def _is_user_mention(comment: dict, marker: Optional[str] = None) -> bool:
    """Non-AI author body containing a known marker (default: any)."""
    if not comment or is_ai_author(comment.get('author')):
        return False
    return has_marker(comment.get('body') or '', marker)


def _is_user_ai_mention(comment: dict) -> bool:
    return _is_user_mention(comment, '@AI')


def flat_ai_reply_index(comments: list, mention_ci: int) -> Optional[int]:
    """Index of AI reply owned by a mention at mention_ci on a FLAT comments list.

    Window = (mention_ci, next user mention of ANY known marker). Only an AI comment
    inside that window answers this mention. A single late AI reply must NOT mark
    earlier mentions done.

    Works on ANY sibling list — top-level thread.comments OR a nested replies[]
    list — so it also answers nested @AI mentions introduced by the user
    replying under an earlier AI reply.
    """
    if mention_ci < 0 or mention_ci >= len(comments):
        return None
    for j in range(mention_ci + 1, len(comments)):
        c = comments[j]
        if _is_user_mention(c):
            # next user @AI closes the window — no AI reply for this mention
            return None
        if is_ai_author(c.get('author')):
            return j
    return None


def _walk_to_parent_comments(annotations: dict, path: list[int]) -> tuple[list, int]:
    """Return (parent_comments_list, ci) for the comment at ``path``.

    ``ci`` is the index of the target comment WITHIN its parent sibling list.
    For path == [ti, ci] the parent is thread.comments; for path == [ti, ci, ri, …]
    the parent is the nested sibling list that directly contains the leaf.
    """
    if not path or len(path) < 2:
        raise IndexError(f'path too short: {path}')
    threads = annotations.get('annotations', [])
    ti = path[0]
    if ti < 0 or ti >= len(threads):
        raise IndexError(f'thread_idx {ti} out of range')
    comments = threads[ti].get('comments', [])
    # Walk path[1:-1] nodes down; the final index lives in the leaf parent.
    if len(path) == 2:
        return comments, path[1]
    # Walk down to the parent of the leaf
    node = None
    for idx in path[1:-1]:
        if idx < 0 or idx >= len(comments):
            raise IndexError(f'path index {idx} out of range at {path}')
        node = comments[idx]
        comments = get_replies(node)
    return comments, path[-1]


def is_answered(annotations: dict, path: list[int]) -> bool:
    """True if the @AI comment already has an AI Reviewer reply.

    Mentions may live at thread top-level OR nested under an earlier comment's
    ``replies`` chain (the user replies to an AI reply and writes another @AI).
    Answering rule is unchanged in spirit: an AI Reviewer reply must fall
    after this mention and before the next user mention AT THE SAME DEPTH in
    the sibling list containing this mention. A direct nested AI reply under
    this mention (any depth) also counts as answered for legacy compatibility.
    """
    try:
        comment = get_comment_at_path(annotations, path)
    except IndexError:
        return False
    # Direct nested AI reply under this mention (legacy / explicit fan-out)
    for r in get_replies(comment):
        if is_ai_author(r.get('author')):
            return True
    # Sibling-window rule at the depth of this mention
    try:
        parent_comments, ci_local = _walk_to_parent_comments(annotations, path)
        if flat_ai_reply_index(parent_comments, ci_local) is not None:
            return True
    except (IndexError, KeyError, TypeError):
        pass
    return False


def find_mentions(annotations: dict, unanswered_only: bool = False,
                  marker: Optional[str] = None) -> list[dict]:
    """
    Recursively scan threads for human work items that need AI handling.

    Card rules (v2.5):
      - AI card (is_ai_card): every non-empty human comment is a work item,
        even without @AI. Missing marker -> synthetic marker '@AI'.
      - Human card: only comments whose body already contains @AI/@REVIEW
        (temporary marker detect). No marker -> ignored.

    If marker is given (e.g. '@AI'), only matches for that marker are returned.
    Otherwise matches for ALL known markers (incl. synthetic @AI) are returned.

    Returns list of dicts with:
      - thread_idx, path, body, author
      - marker, marker_type, instruction, answered
      - card_type: 'ai' | 'human'
      - synthetic_marker: bool — True when @AI was implied by AI-card rule
      - thread, anchor_text, prefix, suffix
    """
    mentions = []
    marker = canonical_marker(marker)

    def _scan_comments(comments: list, path_prefix: list, thread_idx: int, thread: dict) -> None:
        for ci, comment in enumerate(comments):
            path = path_prefix + [ci]
            author = comment.get('author', '')
            name = author_name(author)
            body = comment.get('body', '') or ''
            include, found, synthetic = _human_comment_is_work(thread, comment, marker=marker)
            if include and found:
                answered = False
                for r in get_replies(comment):
                    if is_ai_author(r.get('author')):
                        answered = True
                        break
                if not answered:
                    if flat_ai_reply_index(comments, ci) is not None:
                        answered = True
                if unanswered_only and answered:
                    pass
                else:
                    instruction = body.strip() if synthetic else strip_marker(body, found)
                    mentions.append({
                        'thread_idx': thread_idx,
                        'path': path,
                        'body': body,
                        'author': name or 'unknown',
                        'marker': found,
                        'marker_type': get_marker_type(found),
                        'instruction': instruction,
                        'answered': answered,
                        'card_type': 'ai' if is_ai_card(thread) else 'human',
                        'synthetic_marker': bool(synthetic),
                        'thread': thread,
                        'anchor_text': thread.get('text') or '',
                        'prefix': thread.get('prefix') or '',
                        'suffix': thread.get('suffix') or '',
                    })
            for sub_key in ('replies', 'comments', 'children'):
                sub = comment.get(sub_key)
                if isinstance(sub, list) and len(sub) > 0:
                    _scan_comments(sub, path, thread_idx, thread)

    for ti, thread in enumerate(annotations.get('annotations', [])):
        comments = thread.get('comments', [])
        _scan_comments(comments, [ti], ti, thread)

    return mentions


def sort_mentions(mentions: list[dict], content_md: str = '') -> list[dict]:
    """Return mentions in stable document order, preserving thread order ties.

    Callers may pass ``content_md`` to derive offsets from each anchor. This
    avoids relying on annotation array order, which changes after edits.
    """
    def key(m: dict):
        offset = m.get('offset')
        if not isinstance(offset, int) and content_md:
            anchor = str(m.get('anchor_text') or '')
            if anchor and content_md.count(anchor) == 1:
                offset = content_md.find(anchor)
        if not isinstance(offset, int):
            offset = 10**18
        return offset, tuple(m.get('path') or ())

    return sorted(mentions, key=key)


def find_ai_mentions(annotations: dict, unanswered_only: bool = False) -> list[dict]:
    return find_mentions(annotations, unanswered_only=unanswered_only, marker='@AI')


def find_unanswered_mentions(annotations: dict, marker: Optional[str] = None) -> list[dict]:
    """Like find_mentions but only those without an AI Reviewer reply yet."""
    return find_mentions(annotations, unanswered_only=True, marker=marker)


def find_unanswered_ai_mentions(annotations: dict) -> list[dict]:
    return find_unanswered_mentions(annotations, marker='@AI')


def classify_instruction(instruction: str) -> str:
    """
    Classify @AI instruction intent.
    Returns one of: 'edit' | 'query' | 'review' | 'resolve' | 'other'
    """
    t = (instruction or '').strip()
    if not t:
        return 'other'

    # resolve / accept
    if re.search(r'^(ok|好|行|可以|没问题|同意|accept|lgtm|resolved?|解决了?|就这样)\b', t, re.I):
        return 'resolve'
    if re.search(r'(标?为?已?解决|mark\s+resolved|resolve\s+this)', t, re.I):
        return 'resolve'

    # review request
    if re.search(r'(再审|再看|重审|review\s+(this|again)|audit|通读|检查一下这段|帮我看看|看一下对不对)', t, re.I):
        return 'review'

    # query signals
    query_pats = [
        r'[?？]',
        r'^(why|what|how|which|when|where|who)\b',
        r'^(为什么|是什么|怎么|如何|哪个|哪些|是否|有没有|对不对|是不是|啥|何)',
        r'(解释|clarify|说明一下|什么意思|单位是什么|哪里来的)',
    ]
    edit_overlap = (
        r'(改成|改为|删掉|删除|删了|换成|替换为|加上|插入|合并到|去掉|移除|'
        r'拉大|加大|调高|调低|重画|重生成|重新生成|只调|间距|字号|fontsize|ylim)'
    )
    for p in query_pats:
        if re.search(p, t, re.I):
            if re.search(edit_overlap, t, re.I):
                return 'edit'
            return 'query'

    # edit signals (fix-paper %% style + figure / layout Chinese)
    edit_pats = [
        r'(改成|改为|改写|改掉|删掉|删除|删了|去掉|移除|换成|替换|插入|加上|补上|补一句|合并|拆成|缩短|精简|扩写|润色|polish)',
        r'(修复|修改|调整|修正|更新)',
        r'(挡住|遮住|压住|挡住了|移开|挪开|挪到|移到)',
        r'(拉大|拉高|加大|减小|缩小|调高|调低|调大|调小|增高|加宽|加高)',
        r'(间距|空隙|留白|wspace|hspace|padding|ylim|xlim|字号|fontsize|font\s*size|linewidth|markersize)',
        r'(重画|重绘|重做|重生|重新生成|再生成|regenerate|redraw|rerender)',
        r'(只改|只调|仅改|仅调|不要改色|别改色|不改颜色|不要改颜色)',
        r'(typo|拼写|错别字|笔误)',
        r'(cite|citation|引用|加文献|加引用)',
        r'(改\s*[为成]|→|->|=>)',
        r'(fix|change|replace|remove|delete|insert|add\b|merge|rewrite|shorten|update)',
        r'(把.+改|将.+改|把.+删|将.+删|此处应|应该是|正确是)',
        r'(标题删|去标题|去\s*suptitle|suptitle|图例|legend)',
    ]
    for p in edit_pats:
        if re.search(p, t, re.I):
            return 'edit'

    return 'other'


def _normalize_author(author) -> dict:
    """Mentor SCHEMA: author is always {id, name} object when writing."""
    if isinstance(author, dict):
        name = str(author.get('name') or author.get('id') or AI_AUTHOR)
        aid = str(author.get('id') or 'ai-reviewer')
        return {'id': aid, 'name': name}
    name = str(author or AI_AUTHOR)
    if is_ai_author(name) or name == AI_AUTHOR:
        return dict(AI_AUTHOR_OBJ)
    return {'id': 'user', 'name': name}


def make_comment(body: str, author=None) -> dict:
    """Build a Mentor-schema comment (id + author object + body + createdAt)."""
    return {
        'id': str(uuid.uuid4()),
        'author': _normalize_author(author if author is not None else AI_AUTHOR_OBJ),
        'body': body,
        'createdAt': now_iso(),
    }


def add_reply(annotations: dict, thread_idx: int, body: str,
              author: str = AI_AUTHOR,
              reply_to_path: Optional[list[int]] = None) -> None:
    """Append an AI Reviewer reply into the right sibling list.

    Behavior depends on ``reply_to_path``:

    - ``None`` or ``[thread_idx]`` or ``[thread_idx, ci]`` (top-level mention):
      append to ``thread.comments`` (the Mentor flat top-level list). This
      preserves the historical default for top-level @AI mentions.
    - Longer path (a NESTED @AI mention, e.g. ``[ti, ci, ri, …]``): walk to
      the parent sibling list that contains the mention and append THE AI
      reply there as a sibling of the mention — i.e. the user's reply-chain
      continues in the same nested replies list. This is what Mentor UI
      renders when the user replies under an earlier AI reply.

    In both cases the reply is inserted as a sibling (NOT under the mention
    itself), so ``is_answered``'s "sibling-window at the mention's depth"
    rule reliably finds it before the next same-depth user mention.
    """
    thread = annotations['annotations'][thread_idx]
    new_comment = make_comment(body, author)
    if reply_to_path is None or len(reply_to_path) <= 2:
        if 'comments' not in thread or not isinstance(thread.get('comments'), list):
            thread['comments'] = []
        thread['comments'].append(new_comment)
        return
    # Nested @AI mention: walk to the parent sibling list and INSERT the AI
    # reply directly AFTER the mention so it lands BEFORE the next same-depth
    # user mention — this is what the sibling-window rule requires.
    parent_comments, ci_local = _walk_to_parent_comments(annotations, reply_to_path)
    leaf_parent = get_comment_at_path(annotations, reply_to_path[:-1])
    if parent_comments is get_replies(leaf_parent) and parent_comments is not None:
        parent_comments.insert(ci_local + 1, new_comment)
        return
    # Fallback: attach as explicit "replies" of the leaf parent
    if not isinstance(leaf_parent.get('replies'), list):
        leaf_parent['replies'] = []
    leaf_parent['replies'].append(new_comment)


def set_reply_body(annotations: dict, path: list[int], body: str) -> None:
    """In-place overwrite of a comment body at path (for correcting AI's own reply)."""
    comment = get_comment_at_path(annotations, path)
    comment['body'] = body
    comment['updatedAt'] = now_iso()


def find_ai_reply_path(annotations: dict, mention_path: list[int]) -> Optional[list[int]]:
    """Path to the first AI Reviewer reply for the mention, or None.

    Prefers the sibling-window rule at the mention's OWN depth: an AI reply
    that follows this mention and precedes the next same-depth user mention.
    Falls back to any direct nested AI reply under the mention.
    """
    if mention_path and len(mention_path) >= 2:
        try:
            parent_comments, ci_local = _walk_to_parent_comments(annotations, mention_path)
            j = flat_ai_reply_index(parent_comments, ci_local)
            if j is not None:
                return mention_path[:-1] + [j]
        except (IndexError, KeyError, TypeError):
            pass
    try:
        comment = get_comment_at_path(annotations, mention_path)
    except IndexError:
        return None
    replies = get_replies(comment)
    for ri, r in enumerate(replies):
        if is_ai_author(r.get('author')):
            return mention_path + [ri]
    return None


def resolve_thread(annotations: dict, thread_idx: int, resolved: bool = True) -> None:
    annotations['annotations'][thread_idx]['resolved'] = resolved


def add_thread(annotations: dict, text: str, body: str,
               prefix: str = '', suffix: str = '',
               author: str = AI_AUTHOR,
               thread_type: Optional[str] = None) -> str:
    """Create a marker-only annotation thread.

    ``thread_type`` is accepted for call compatibility but intentionally ignored:
    actionable mode is encoded only in an explicit @AI/@REVIEW comment body.
    """
    tid = str(uuid.uuid4())  # full UUID to match Mentor SCHEMA
    thread = {
        'threadId': tid,
        'text': text,
        'prefix': prefix,
        'suffix': suffix,
        'resolved': False,
        'createdAt': now_iso(),
        'comments': [make_comment(body, author)],
    }
    annotations.setdefault('annotations', []).append(thread)
    return tid


def extract_context(content_md: str, text: str, context_chars: int = 40) -> tuple[str, str]:
    """
    Given a markdown string and a target text snippet, extract prefix and suffix
    context for Mentor's fuzzy matching.
    Returns (prefix, suffix).
    """
    idx = content_md.find(text)
    if idx == -1:
        return '', ''
    start = max(0, idx - context_chars)
    end = min(len(content_md), idx + len(text) + context_chars)
    prefix = content_md[start:idx]
    suffix = content_md[idx + len(text):end]
    return prefix, suffix


def extract_mention_context(content_md: str, mention: dict,
                            context_chars: int = 500) -> dict:
    """Return bounded evidence for an AI reply or edit decision.

    Unlike ``extract_context`` (which returns only anchor metadata), this
    helper returns the unique anchor occurrence, line number, and surrounding
    markdown.  It intentionally refuses ambiguous anchors so the caller does
    not invent context or edit the wrong occurrence.
    """
    anchor = str((mention or {}).get('anchor_text') or '').strip()
    if not anchor:
        return {'ok': False, 'reason': 'empty-anchor', 'matches': 0}
    matches = [m.start() for m in re.finditer(re.escape(anchor), content_md or '')]
    if len(matches) != 1:
        return {
            'ok': False,
            'reason': 'ambiguous-anchor' if matches else 'anchor-not-found',
            'matches': len(matches),
            'anchor': anchor,
        }
    start = matches[0]
    left = max(0, start - max(80, context_chars))
    right = min(len(content_md), start + len(anchor) + max(80, context_chars))
    return {
        'ok': True,
        'anchor': anchor,
        'offset': start,
        'line': line_no(content_md, start),
        'before': content_md[left:start],
        'after': content_md[start + len(anchor):right],
        'text': content_md[left:right],
    }


def line_no(content_md: str, offset: int) -> int:
    """Convert character offset to 1-based line number."""
    return content_md.count('\n', 0, offset) + 1


def replace_anchor_in_content(content_md: str, thread: dict, new_text: str) -> tuple[str, bool]:
    """
    Replace thread anchor text in content_md using prefix/suffix disambiguation.
    Returns (new_content_md, ok).
    On success, updates thread['text']/prefix/suffix in place for new anchor.
    """
    old = thread.get('text') or ''
    if not old:
        return content_md, False
    prefix = thread.get('prefix') or ''
    suffix = thread.get('suffix') or ''

    start = _locate_anchor_occurrence(content_md, old, prefix, suffix, 40)
    if start is None:
        return content_md, False

    new_md = content_md[:start] + new_text + content_md[start + len(old):]
    thread['text'] = new_text
    # Refresh at the exact replacement offset. ``extract_context`` uses find()
    # and would jump to the first occurrence when new_text is duplicated.
    thread['prefix'], thread['suffix'] = _context_at(
        new_md, start, len(new_text), 40)
    return new_md, True


def summarize_mentions(annotations: dict) -> dict:
    """Counts for verify-clean style report, grouped by marker type."""
    all_m = find_mentions(annotations, unanswered_only=False)
    unanswered = [m for m in all_m if not m['answered']]
    by_class: dict[str, int] = {}
    by_marker: dict[str, dict] = {}
    for m in unanswered:
        c = classify_instruction(m['instruction'])
        by_class[c] = by_class.get(c, 0) + 1
        mk = m.get('marker_type', 'unknown')
        if mk not in by_marker:
            by_marker[mk] = {'total': 0, 'unanswered': 0, 'by_class': {}}
        by_marker[mk]['unanswered'] += 1
        by_marker[mk]['by_class'][c] = by_marker[mk]['by_class'].get(c, 0) + 1
    for m in all_m:
        mk = m.get('marker_type', 'unknown')
        if mk not in by_marker:
            by_marker[mk] = {'total': 0, 'unanswered': 0, 'by_class': {}}
        by_marker[mk]['total'] += 1
    return {
        'threads': len(annotations.get('annotations', [])),
        'ai_mentions_total': len(all_m),
        'ai_mentions_unanswered': len(unanswered),
        'unanswered_by_class': by_class,
        'unanswered': unanswered,
        'by_marker': by_marker,
    }


def _plain_starless_index_map(md: str):
    """Map starless plain offsets -> content.md indices (skips markdown * only)."""
    plain_chars = []
    md_index_for_plain = []
    for i, ch in enumerate(md or ''):
        if ch == '*':
            continue
        plain_chars.append(ch)
        md_index_for_plain.append(i)
    return ''.join(plain_chars), md_index_for_plain


def _locate_starless_in_md(content_md: str, text: str, prefix: str = '',
                           suffix: str = '', context_chars: int = 40):
    """Locate text ignoring markdown emphasis asterisks (APA italics recovery)."""
    if not content_md or not text:
        return None
    plain, idx_map = _plain_starless_index_map(content_md)
    t = (text or '').replace('*', '')
    p = (prefix or '').replace('*', '')
    s = (suffix or '').replace('*', '')
    if not t:
        return None
    start_p = _locate_anchor_occurrence(plain, t, p, s, context_chars)
    if start_p is None:
        start_p = _locate_anchor_occurrence(plain, t, '', '', context_chars)
    if start_p is None:
        return None
    end_p = start_p + len(t)
    if start_p < 0 or end_p > len(idx_map):
        return None
    md_start = idx_map[start_p]
    md_end = idx_map[end_p - 1] + 1
    md_start, md_end = _expand_md_emphasis_wrappers(content_md, md_start, md_end)
    return md_start, md_end


def _try_locate_thread_in_md(content_md: str, th: dict, context_chars: int = 40):
    """Best-effort locate for repair: live text -> quote.exact -> starless italics."""
    candidates = []
    text = th.get('text') or ''
    if str(text).strip():
        candidates.append(str(text))
    anchor = th.get('anchor') if isinstance(th.get('anchor'), dict) else {}
    quote = anchor.get('quote') if isinstance(anchor.get('quote'), dict) else {}
    exact = quote.get('exact')
    if exact and str(exact).strip() and str(exact) not in candidates:
        candidates.append(str(exact))

    prefix = th.get('prefix') or quote.get('prefix') or ''
    suffix = th.get('suffix') or quote.get('suffix') or ''
    for cand in candidates:
        start = _locate_anchor_occurrence(
            content_md, cand, prefix, suffix, context_chars)
        if start is not None:
            return start, start + len(cand)
        start = _locate_anchor_occurrence(
            content_md, cand, '', '', context_chars)
        if start is not None:
            return start, start + len(cand)
        # italics-tolerant: ignore * in body and needle
        span = _locate_starless_in_md(
            content_md, cand, prefix, suffix, context_chars)
        if span is not None:
            return span[0], span[1]
    return None, None


def repair_mentor_package(
    path: str,
    *,
    backup: bool = True,
    backup_dir: Optional[str] = None,
    block_on_unhealthy: bool = False,
) -> dict:
    """Recover a .mentor after user mess / stale HTML / rewritten anchors.

    1. Optional cold backup
    2. Rebind every text thread into current content.md (quote/mdRange/status)
    3. ensure_image_anchors
    4. DROP document.html + manifest (safe open via content.md)
    5. write_mentor

    Returns a report dict. Does not invent TipTap HTML.
    """
    import shutil
    from pathlib import Path as _Path

    report: dict = {
        'path': path,
        'backup': None,
        'rebound': [],
        'failed': [],
        'actions': [],
        'bytes': 0,
        'audit': None,
        'ok': False,
    }
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    if backup:
        bdir = _Path(backup_dir) if backup_dir else _Path(r'E:/backup/mentor')
        try:
            bdir.mkdir(parents=True, exist_ok=True)
        except OSError:
            bdir = _Path(os.path.dirname(os.path.abspath(path))) / '_mentor_repair_bak'
            bdir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        bak = bdir / f'{_Path(path).name}.repair_{stamp}'
        shutil.copy2(path, bak)
        report['backup'] = str(bak)
        report['actions'].append(f'backup:{bak}')

    md, ann = read_mentor(path)
    html = _read_zip_member_text(path, 'document.html')
    if html:
        if 'data-mentor-body="md-plain"' in html:
            report['actions'].append('detected-fake-md-plain-html')
        else:
            report['actions'].append('had-document-html')
    man = _read_zip_member_text(path, 'manifest.json')
    if man:
        try:
            mobj = json.loads(man)
            hashes = (mobj or {}).get('hashes') or {}

            def _sha(s: str) -> str:
                return hashlib.sha256(s.encode('utf-8')).hexdigest()
            ann_preview = json.dumps(ann, ensure_ascii=False, indent=2)
            if hashes.get('content.md') and hashes.get('content.md') != _sha(md):
                report['actions'].append('manifest-content-md-mismatch')
            if hashes.get('annotations.json') and hashes.get('annotations.json') != _sha(ann_preview):
                report['actions'].append('manifest-annotations-mismatch')
        except Exception:
            report['actions'].append('manifest-unreadable')

    threads = ann.get('annotations') or []
    for i, th in enumerate(threads):
        if not isinstance(th, dict) or _is_image_thread(th):
            continue
        text0 = th.get('text') or ''
        if not str(text0).strip():
            continue
        start, end = _try_locate_thread_in_md(md, th)
        if start is None or end is None or end <= start:
            report['failed'].append({
                'idx': i,
                'threadId': th.get('threadId'),
                'text': str(text0)[:80],
            })
            _mark_thread_anchor_status(th, 'orphaned', 'orphaned', deleted=True)
            continue
        start, end = _expand_md_emphasis_wrappers(md, start, end)
        _apply_md_range_to_thread(th, md, start, end)
        if (th.get('text') or '') != text0:
            report['actions'].append(f'thread[{i}] recovered text')
        report['rebound'].append(i)

    ia_warns = ensure_image_anchors(ann, md)
    for w in ia_warns:
        report['actions'].append(f'image-anchor:{w}')

    pre_audit = audit_anchor_health(ann, md)
    report['audit_before_write'] = {
        'ok': pre_audit.get('ok'),
        'ambiguous': pre_audit.get('ambiguous'),
        'orphaned': pre_audit.get('orphaned'),
    }

    nbytes = write_mentor(
        path, md, ann,
        drop_structural=True,
        block_on_unhealthy=block_on_unhealthy,
    )
    report['bytes'] = nbytes
    md2, ann2 = read_mentor(path)
    post = audit_anchor_health(ann2, md2)
    report['audit'] = post
    report['actions'].append('dropped-structural')
    report['ok'] = bool(post.get('ok')) and not report['failed']
    if post.get('ok') and report['failed']:
        report['ok'] = False
        report['actions'].append('partial: some threads still orphaned')
    return report


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print('Usage:')
        print('  python mentor_io.py <path.mentor> [--marker @AI] [--all-markers]')
        print('  python mentor_io.py repair <path.mentor> [--no-backup] [--block]')
        sys.exit(1)
    if sys.argv[1] == 'repair':
        if len(sys.argv) < 3:
            print('Usage: python mentor_io.py repair <path.mentor> [--no-backup] [--block]')
            sys.exit(1)
        rpath = sys.argv[2]
        do_backup = '--no-backup' not in sys.argv
        do_block = '--block' in sys.argv
        rep = repair_mentor_package(rpath, backup=do_backup, block_on_unhealthy=do_block)
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        sys.exit(0 if (rep.get('audit') or {}).get('ok') else 2)
    markers_arg = []
    path = sys.argv[1]
    for a in sys.argv[2:]:
        if a == '--all-markers':
            markers_arg = None
            break
        if a.startswith('--marker='):
            markers_arg.append(a.split('=', 1)[1])
        elif a == '--marker':
            continue
    if markers_arg == []:
        markers_arg = ['@AI']

    md, ann = read_mentor(path)
    print(f'content.md: {len(md)} bytes')
    print(f'annotations: {len(ann.get("annotations", []))} threads')
    if markers_arg is None:
        s = summarize_mentions(ann)
        print(f'All markers: total={s["ai_mentions_total"]} unanswered={s["ai_mentions_unanswered"]} by_class={s["unanswered_by_class"]}')
        for mk, info in s.get('by_marker', {}).items():
            print(f'  [{mk}] total={info["total"]} unanswered={info["unanswered"]} by_class={info["by_class"]}')
    else:
        for marker in markers_arg:
            s = summarize_mentions(ann)
            filtered = [m for m in s.get('unanswered', []) if m.get('marker') == marker]
            print(f'{marker}: total filtered={len(filtered)} by_class={dict((c, sum(1 for m in filtered if classify_instruction(m["instruction"])==c)) for c in set(classify_instruction(m["instruction"]) for m in filtered))}')
    if s.get('unanswered'):
        for m in s['unanswered']:
            path_s = '→'.join(str(i) for i in m['path'])
            marker_label = m.get('marker', '@AI')
            print(f'  [{classify_instruction(m["instruction"])}] [{marker_label}] {path_s} {m["author"]}: {m["instruction"][:80]}')
