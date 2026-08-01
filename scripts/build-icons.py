# -*- coding: utf-8 -*-
"""v1.43.34 — Mentor icon upgrade: Lucide paths, stroke 2, single source → icons.js + CSS masks."""
from pathlib import Path
from urllib.parse import quote

ROOT = Path(r"E:\hermes_playground\Mentor")

# Lucide-accurate path fragments (inner only). stroke-width=2 at 24 viewBox.
# Source: Lucide icons (ISC). Black stroke for CSS mask.
ICONS = {
    # --- files / chrome ---
    "file": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M10 9H8'/><path d='M16 13H8'/><path d='M16 17H8'/>",
    "filePlus2": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M9 15h6'/><path d='M12 12v6'/>",
    "fileArchive": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M10 12v6'/><path d='M14 12v6'/><path d='M10 12a2 2 0 1 0 0 4h4a2 2 0 1 0 0-4'/>",
    "library": "<path d='m16 6 4 14'/><path d='M12 6v14'/><path d='M8 8v12'/><path d='M4 4v16'/>",
    "bookPlus": "<path d='M12 7v14'/><path d='M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'/><path d='M12 11h4'/><path d='M14 9v4'/>",
    "upload": "<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' x2='12' y1='3' y2='15'/>",
    "filePlain": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/>",
    "fileJson": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1'/><path d='M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1'/>",
    "folder": "<path d='M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'/>",
    "folderOpen": "<path d='m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'/>",
    "save": "<path d='M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'/><path d='M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7'/><path d='M7 3v4a1 1 0 0 0 1 1h7'/>",
    "download": "<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' x2='12' y1='15' y2='3'/>",
    "downloadFile": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M12 18v-6'/><path d='m9 15 3 3 3-3'/>",
    "fileDown": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M12 18v-6'/><path d='m9 15 3 3 3-3'/>",
    "fileType": "<path d='M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'/><path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M10 9H8'/><path d='M16 13H8'/><path d='M16 17H8'/>",
    "fileOutput": "<path d='M14 2v4a2 2 0 0 0 2 2h4'/><path d='M4 7.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H4'/><path d='M12 12v6'/><path d='m15 15-3 3-3-3'/>",  # approx
    "search": "<circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/>",
    "x": "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>",
    "check": "<path d='M20 6 9 17l-5-5'/>",
    "chevronLeft": "<path d='m15 18-6-6 6-6'/>",
    "chevronDown": "<path d='m6 9 6 6 6-6'/>",
    "chevronRight": "<path d='m9 18 6-6-6-6'/>",
    "copy": "<rect width='14' height='14' x='8' y='8' rx='2' ry='2'/><path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/>",
    "refresh": "<path d='M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/><path d='M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'/><path d='M8 16H3v5'/>",
    "undo": "<path d='M3 7v6h6'/><path d='M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13'/>",
    "redo": "<path d='M21 7v6h-6'/><path d='M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 13'/>",
    "settings": "<path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/><circle cx='12' cy='12' r='3'/>",
    "user": "<path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/>",
    "pencil": "<path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'/><path d='m15 5 4 4'/>",
    "listTree": "<path d='M21 12h-8'/><path d='M21 6H8'/><path d='M21 18h-8'/><path d='M3 6v4c0 1.1.9 2 2 2h3'/><path d='M3 10v6c0 1.1.9 2 2 2h3'/>",  # outline-ish; use list for pane
    "list": "<path d='M3 12h.01'/><path d='M3 18h.01'/><path d='M3 6h.01'/><path d='M8 12h13'/><path d='M8 18h13'/><path d='M8 6h13'/>",
    "messageSquare": "<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>",
    "messageCircle": "<path d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/>",
    "trash": "<path d='M3 6h18'/><path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'/><path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'/><line x1='10' x2='10' y1='11' y2='17'/><line x1='14' x2='14' y1='11' y2='17'/>",
    "locate": "<line x1='2' x2='5' y1='12' y2='12'/><line x1='19' x2='22' y1='12' y2='12'/><line x1='12' x2='12' y1='2' y2='5'/><line x1='12' x2='12' y1='19' y2='22'/><circle cx='12' cy='12' r='7'/>",
    "checkCircle": "<path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><path d='m9 11 3 3L22 4'/>",
    "eye": "<path d='M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'/><circle cx='12' cy='12' r='3'/>",
    "code2": "<path d='m18 16 4-4-4-4'/><path d='m6 8-4 4 4 4'/><path d='m14.5 4-5 16'/>",
    # --- format ---
    "bold": "<path d='M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'/>",
    "italic": "<line x1='19' x2='10' y1='4' y2='4'/><line x1='14' x2='5' y1='20' y2='20'/><line x1='15' x2='9' y1='4' y2='20'/>",
    "strikethrough": "<path d='M16 4H9a3 3 0 0 0-2.83 4'/><path d='M14 12a4 4 0 0 1 0 8H6'/><line x1='4' x2='20' y1='12' y2='12'/>",
    "code": "<polyline points='16 18 22 12 16 6'/><polyline points='8 6 2 12 8 18'/>",
    "superscript": "<path d='m4 19 8-8'/><path d='m12 19-8-8'/><path d='M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.24 20 7c0-1.11-.89-2-2-2-1 0-1.5.5-2 1'/>",
    "subscript": "<path d='m4 5 8 8'/><path d='m12 5-8 8'/><path d='M20 19h-4c0-1.5.442-2 1.5-2.5S20 15.24 20 14c0-1.11-.89-2-2-2-1 0-1.5.5-2 1'/>",
    "heading1": "<path d='M4 12h8'/><path d='M4 18V6'/><path d='M12 18V6'/><path d='m17 12 3-2v8'/>",
    "heading2": "<path d='M4 12h8'/><path d='M4 18V6'/><path d='M12 18V6'/><path d='M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1'/>",
    "heading3": "<path d='M4 12h8'/><path d='M4 18V6'/><path d='M12 18V6'/><path d='M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2'/><path d='M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2'/>",
    "listOrdered": "<path d='M10 12h11'/><path d='M10 18h11'/><path d='M10 6h11'/><path d='M4 10h2V4'/><path d='M4 6h.01'/><path d='M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'/>",
    "quote": "<path d='M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'/><path d='M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'/>",
    "squareCode": "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='m10 10-2 2 2 2'/><path d='m14 14 2-2-2-2'/>",
    "link": "<path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/><path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/>",
    "image": "<rect width='18' height='18' x='3' y='3' rx='2' ry='2'/><circle cx='9' cy='9' r='2'/><path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/>",
    "table": "<path d='M12 3v18'/><rect width='18' height='18' x='3' y='3' rx='2'/><path d='M3 9h18'/><path d='M3 15h18'/>",
        "history": "<path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/><path d='M3 3v5h5'/><path d='M12 7v5l4 2'/>",
    }

# Map CSS selectors → icon key
CSS_MASKS = {
    '#btn-new .tb-icon::before': 'filePlus2',
    '#btn-open-files .tb-icon::before': 'folderOpen',
    '#btn-open-folder .tb-icon::before': 'folder',
    '#btn-save .tb-icon::before': 'save',
    '#btn-save-as .tb-icon::before': 'fileArchive',
    '#btn-export-md .tb-icon::before': 'fileDown',
    '#btn-export-docx .tb-icon::before': 'fileType',
    '#btn-undo .tb-icon::before': 'undo',
    '#btn-redo .tb-icon::before': 'redo',
    '#btn-toggle-render .tb-icon::before': 'code2',
    '#btn-refs .tb-icon::before': 'library',
        '#btn-version-history .tb-icon::before': 'history',
        '#file-pane .pane-icon-refs::before': 'library',
    '#refs-pane .pane-icon-refs::before': 'library',
    '#refs-add-btn .refs-action-icon': 'bookPlus',
    '#refs-import-btn .refs-action-icon': 'upload',
    '#refs-export-btn .refs-action-icon': 'download',
    '.rc-insert-btn::before': 'quote',
    '.rc-edit-btn::before': 'pencil',
    '.rc-delete-btn::before': 'trash',
    '[data-cmd="bold"]::before': 'bold',
    '[data-cmd="italic"]::before': 'italic',
    '[data-cmd="strike"]::before': 'strikethrough',
    '[data-cmd="code"]::before': 'code',
    '[data-cmd="superscript"]::before': 'superscript',
    '[data-cmd="subscript"]::before': 'subscript',
    '[data-cmd="h1"]::before': 'heading1',
    '[data-cmd="h2"]::before': 'heading2',
    '[data-cmd="h3"]::before': 'heading3',
    '[data-cmd="bulletList"]::before': 'list',
    '[data-cmd="orderedList"]::before': 'listOrdered',
    '[data-cmd="blockquote"]::before': 'quote',
    '[data-cmd="codeBlock"]::before': 'squareCode',
    '[data-cmd="link"]::before': 'link',
    '[data-cmd="image"]::before': 'image',
    '[data-cmd="table"]::before': 'table',
    '.author-chip-icon': 'user',
    '.author-chip-edit': 'pencil',
    '.settings-btn::before': 'settings',
    '#file-pane .pane-icon::before': 'list',
    '.search-icon::before': 'search',
    '.tree-search-clear::before': 'x',
    '.float-btn button::before': 'messageSquare',
    '.mark-delete-btn::before': 'x',
    '.comment-menu .menu-icon-goto': 'locate',
    '.comment-menu .menu-icon-resolve': 'checkCircle',
    '.comment-menu .menu-icon-copy': 'copy',
    '.comment-menu .menu-icon-delete': 'trash',
}

# icons.js export aliases (MentorIcons keys used by app.js)
JS_ALIASES = {
    'folder': 'folder',
    'fileMd': 'file',
    'fileJson': 'fileJson',
    'fileOther': 'filePlain',
    'search': 'search',
    'copy': 'copy',
    'reload': 'refresh',
    'downloadMd': 'fileDown',
    'downloadDocx': 'fileType',
    'close': 'x',
    'chevronLeft': 'chevronLeft',
    'chevronDown': 'chevronDown',
    'file': 'file',
    'folderOpen': 'folderOpen',
    'download': 'download',
    'save': 'save',
    'check': 'check',
    'bold': 'bold',
    'italic': 'italic',
    'strike': 'strikethrough',
    'code': 'code',
    'h1': 'heading1',
    'h2': 'heading2',
    'h3': 'heading3',
    'listBullet': 'list',
    'listOrdered': 'listOrdered',
    'quote': 'quote',
    'codeBlock': 'squareCode',
    'link': 'link',
    'image': 'image',
    'comment': 'messageSquare',
    'renderMode': 'eye',
    'sourceMode': 'code2',
    'undo': 'undo',
    'redo': 'redo',
    'settings': 'settings',
    'user': 'user',
    'pencil': 'pencil',
    'table': 'table',
    'trash': 'trash',
    'library': 'library',
        'history': 'history',
        'filePlus2': 'filePlus2',
    'fileArchive': 'fileArchive',
    'bookPlus': 'bookPlus',
    'upload': 'upload',
}


def svg_full(inner: str, stroke: str = "2") -> str:
    return (
        f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' "
        f"stroke='currentColor' stroke-width='{stroke}' stroke-linecap='round' "
        f"stroke-linejoin='round'>{inner}</svg>"
    )


def svg_mask_black(inner: str, stroke: str = "2") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        f'stroke="black" stroke-width="{stroke}" stroke-linecap="round" '
        f'stroke-linejoin="round">{inner}</svg>'
    )


def mask_css_url(inner: str) -> str:
    # percent-encode for data URI (reliable in CSS)
    return f'url("data:image/svg+xml,{quote(svg_mask_black(inner), safe="")}")'


# ---- write icons.js ----
js_lines = [
    "// Mentor icon set v1.43.34 — Lucide geometry, stroke 2, 24×24",
    "// Single source: paths mirrored into styles.css masks by scripts/build-icons.py",
    "// Usage: <span class=\"icon\">${MentorIcons.file}</span>",
    "",
    "window.MentorIcons = {",
]
for name, key in JS_ALIASES.items():
    inner = ICONS[key]
    svg = svg_full(inner)
    js_lines.append(f"  {name}: `{svg}`,")
js_lines.append("};")
js_lines.append("")
(ROOT / "icons.js").write_text("\n".join(js_lines) + "\n", encoding="utf-8")
print("wrote icons.js", len(js_lines), "lines")

# ---- build CSS mask block ----
mask_block_lines = [
    "/* === v1.43.34 Lucide masks (generated; stroke=2) === */",
]
for sel, key in CSS_MASKS.items():
    url = mask_css_url(ICONS[key])
    mask_block_lines.append(f"{sel} {{")
    mask_block_lines.append(f"  -webkit-mask-image: {url};")
    mask_block_lines.append(f"  mask-image: {url};")
    mask_block_lines.append("}")
mask_block = "\n".join(mask_block_lines) + "\n"

css_path = ROOT / "styles.css"
css = css_path.read_text(encoding="utf-8")

# 1) Upgrade base icon sizing / stroke
old_icon_base = """/* ============ SVG 图标基础样式 ============ */
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  vertical-align: middle;
  color: var(--text-2);
  transition: color 0.15s ease;
}
/* 所有 inline SVG 默认 14px 1.5px stroke currentColor */
.icon svg, .tree-actions button svg, .pane-icon svg, .search-icon svg, .tree-search-clear svg, .float-btn button svg, .save-mode-badge svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pane-icon svg, .search-icon svg { width: 14px; height: 14px; }
.tree-search-clear svg { width: 10px; height: 10px; }
.tree-actions button svg { width: 12px; height: 12px; }
.float-btn button svg { width: 12px; height: 12px; }
.save-mode-badge svg { width: 10px; height: 10px; }"""

new_icon_base = """/* ============ SVG 图标基础样式 (v1.43.34 Lucide stroke-2) ============ */
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  vertical-align: middle;
  color: var(--text-2);
  transition: color 0.15s ease;
}
/* Lucide at 15px: stroke 2 更扎实，避免 1.5 发虚 */
.icon svg, .tree-actions button svg, .pane-icon svg, .search-icon svg, .tree-search-clear svg, .float-btn button svg, .save-mode-badge svg, .tb-icon-text .tb-icon svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.pane-icon svg, .search-icon svg { width: 14px; height: 14px; }
.tree-search-clear svg { width: 11px; height: 11px; }
.tree-actions button svg { width: 13px; height: 13px; }
.float-btn button svg { width: 13px; height: 13px; }
.save-mode-badge svg { width: 11px; height: 11px; }
/* mask 图标通用 */
.tb-icon::before,
.tb-format::before,
.menu-icon,
.author-chip-icon,
.author-chip-edit,
.settings-btn::before,
.pane-icon::before,
.search-icon::before,
.tree-search-clear::before,
.float-btn button::before,
.mark-delete-btn::before {
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}"""

if old_icon_base in css:
    css = css.replace(old_icon_base, new_icon_base, 1)
    print("upgraded icon base block")
elif "v1.43.34 Lucide stroke-2" in css or "/* mask 图标通用 */" in css:
    print("icon base already upgraded — skip")
else:
    raise SystemExit("icon base block not found")

# 2) Format button slightly larger
old_fmt = """.tb-format {
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 4px 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  position: relative;
  transition: background 0.12s ease, color 0.12s ease;
}
.tb-format::before {
  content: "";
  display: block;
  width: 14px;
  height: 14px;
  background-color: currentColor;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}"""
new_fmt = """.tb-format {
  background: transparent;
  border: none;
  border-radius: var(--radius-md, 6px);
  padding: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  position: relative;
  transition: background 0.12s ease, color 0.12s ease;
}
.tb-format::before {
  content: "";
  display: block;
  width: 15px;
  height: 15px;
  background-color: currentColor;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}"""
if old_fmt in css:
    css = css.replace(old_fmt, new_fmt, 1)
    print("upgraded tb-format block")
elif ".tb-format::before" in css and "width: 15px" in css:
    print("tb-format already upgraded — skip")
else:
    raise SystemExit("tb-format block not found")

# 3) tb-icon size bump
old_tb_icon = """.tb-icon-text .tb-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}
.tb-icon-text .tb-icon::before {
  content: "";
  display: block;
  width: 14px;
  height: 14px;
  background-color: currentColor;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}"""
new_tb_icon = """.tb-icon-text .tb-icon {
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  font-size: 0; /* 禁 ↶ 等字符泄漏 */
  line-height: 0;
}
.tb-icon-text .tb-icon::before {
  content: "";
  display: block;
  width: 15px;
  height: 15px;
  background-color: currentColor;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}"""
if old_tb_icon in css:
    css = css.replace(old_tb_icon, new_tb_icon, 1)
    print("upgraded tb-icon block")
elif "禁 ↶ 等字符泄漏" in css or (".tb-icon-text .tb-icon::before" in css and "width: 15px" in css):
    print("tb-icon already upgraded — skip")
else:
    raise SystemExit("tb-icon block not found")

# 4) Remove old individual mask definitions and append new block
# Strategy: strip lines that are ONLY the old #btn-new / [data-cmd] mask rules.
# Safer: find the block from "#btn-new .tb-icon::before" through table mask, replace with nothing,
# then insert generated block before "/* 纯图标按钮" or after tb-icon-text disabled rules.

import re

# Remove pairs of -webkit-mask-image / mask-image rules for known selectors by replacing
# entire multi-line selector blocks that only set mask-image.

# Pattern: selector { ... mask-image ... } possibly with webkit
# We'll delete from "# 给 5 个工具栏按钮" comment through end of [data-cmd=table] rules
# and similar later sections for settings/author already handled.

# Find and replace the big "注入 SVG" toolbar section
m = re.search(
    r"/\* 给 5 个工具栏按钮注入 SVG \(CSS mask-image\) \*/.*?/\* 纯图标按钮",
    css,
    re.S,
)
if not m:
    # try alternate
    m = re.search(
        r"/\* 给 5 个工具栏按钮注入 SVG.*?/\* 纯图标按钮 \(粗体/斜体等格式按钮\) \*/",
        css,
        re.S,
    )
if m:
    css = css[: m.start()] + "/* (legacy toolbar masks removed → v1.43.34 block at end) */\n\n/* 纯图标按钮" + css[m.end() :]
    # fix if we duplicated
    css = css.replace("/* 纯图标按钮/* 纯图标按钮", "/* 纯图标按钮", 1)
    print("stripped toolbar mask block")
else:
    print("WARN: toolbar mask comment block not found")

# Remove format mask block
m2 = re.search(
    r"/\* 给 12 个 format 按钮注入 SVG \(CSS mask-image\) \*/.*?(?=#title-group)",
    css,
    re.S,
)
if m2:
    css = css[: m2.start()] + "/* (legacy format masks removed → v1.43.34) */\n\n" + css[m2.end() :]
    print("stripped format mask block")
else:
    print("WARN: format mask block not found")

# Remove settings-btn::before mask if present (we'll regenerate)
# Remove author chip masks that set mask-image (keep size rules)
# Simpler: delete any remaining standalone mask-image rules for our selectors by regenerating full overrides at end

# Append / replace generated block at end of file
if "/* === v1.43.34 Lucide masks" in css:
    css = re.sub(
        r"/\* === v1\.43\.34 Lucide masks.*",
        mask_block,
        css,
        count=1,
        flags=re.S,
    )
else:
    css = css.rstrip() + "\n\n" + mask_block

# Fix author chip: they use background-color + mask — ensure no content font icons
# Author chip icon sizes
css = re.sub(
    r"(\.author-chip-icon \{\n(?:.*\n)*?  width: )12px(;\n  height: )12px",
    r"\g<1>13px\g<2>13px",
    css,
    count=1,
)
css = re.sub(
    r"(\.author-chip-edit \{\n(?:.*\n)*?  width: )10px(;\n  height: )10px",
    r"\g<1>11px\g<2>11px",
    css,
    count=1,
)

# settings btn icon size
if ".settings-btn::before" in css and "width: 12px" in css:
    # only the settings one - handled by generated mask; size in old block:
    css = css.replace(
        """.settings-btn::before {
  content: "";
  display: block;
  width: 12px;
  height: 12px;""",
        """.settings-btn::before {
  content: "";
  display: block;
  width: 13px;
  height: 13px;""",
        1,
    )

# float button icon size
css = css.replace(
    """.float-btn button::before {
  content: "";
  display: block;
  width: 12px;
  height: 12px;""",
    """.float-btn button::before {
  content: "";
  display: block;
  width: 13px;
  height: 13px;""",
    1,
)

# mark-delete
css = css.replace(
    """.mark-delete-btn::before {
  content: "";
  display: block;
  width: 12px;
  height: 12px;""",
    """.mark-delete-btn::before {
  content: "";
  display: block;
  width: 13px;
  height: 13px;""",
    1,
)

css_path.write_text(css, encoding="utf-8")
print("styles.css masks updated, len", len(css))

# ---- HTML: undo/redo empty span + cache bust ----
html_path = ROOT / "index.html"
html = html_path.read_text(encoding="utf-8")
html = html.replace(
    '<button id="btn-undo" title="撤销批注操作 (Ctrl+Alt+Z)" class="tb-icon-text" disabled aria-label="撤销"><span class="tb-icon">↶</span></button>',
    '<button id="btn-undo" title="撤销批注操作 (Ctrl+Alt+Z)" class="tb-icon-text" disabled aria-label="撤销"><span class="tb-icon"></span></button>',
)
html = html.replace(
    '<button id="btn-redo" title="重做批注操作 (Ctrl+Alt+Shift+Z)" class="tb-icon-text" disabled aria-label="重做"><span class="tb-icon">↷</span></button>',
    '<button id="btn-redo" title="重做批注操作 (Ctrl+Alt+Shift+Z)" class="tb-icon-text" disabled aria-label="重做"><span class="tb-icon"></span></button>',
)
html = html.replace("icons.js?v=2", "icons.js?v=3")
html = html.replace("styles.css?v=103", "styles.css?v=104")
html = html.replace("app.js?v=149", "app.js?v=150")
html = html.replace(
    'content="v1.43.33 20260715: aesthetic chrome polish"',
    'content="v1.43.34 20260715: Lucide icons stroke-2"',
)
html_path.write_text(html, encoding="utf-8")
print("index.html updated")

# ---- CHANGELOG ----
cl = ROOT / "CHANGELOG.md"
clt = cl.read_text(encoding="utf-8")
entry = """## v1.43.34 (2026-07-15) — 全套图标升级 (Lucide)

### 用户
\"优化所有的图标，现在看着太廉价了\"

### 根因
手绘 path + stroke 1.5 + 未编码 data-URI mask → 14px 下发虚、不一致。

### 改动
1. `icons.js` 重写：Lucide 几何、stroke **2**、24×24
2. CSS mask 全部重新生成（`quote()` 编码 data-URI）
3. 工具栏/format 图标 15px；undo/redo 去 ↶↷ 字符改 SVG mask
4. settings/user/pencil/menu/float 同步

### Cache
- icons.js?v=2→3 · styles.css?v=103→104 · app.js?v=149→150

---

"""
if "v1.43.34" not in clt:
    marker = "按时间倒序记录已发布的变化。最新条目在上方。\n\n"
    clt = clt.replace(marker, marker + entry, 1)
    cl.write_text(clt, encoding="utf-8")
    print("CHANGELOG ok")

print("DONE")
