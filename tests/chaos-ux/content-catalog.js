/**
 * Annotation content catalog — finite, complete classification for chaos-ux.
 * Each id is a coverage unit; matrix specs should hit them and mark via Coverage.
 */
const ANCHOR_CASES = [
  { id: 'A1', name: 'single-char text' },
  { id: 'A2', name: 'long text selection' },
  { id: 'A3', name: 'cross-paragraph' },
  { id: 'A4', name: 'list item' },
  { id: 'A5', name: 'blockquote/codeBlock' },
  { id: 'A6', name: 'formatted inline' },
  { id: 'A7', name: 'table single cell' },
  { id: 'A8', name: 'table multi cell' },
  { id: 'A9', name: 'pure image' },
  { id: 'A10', name: 'image gap / mixed' },
  { id: 'A11', name: 'Nth image in multi-image doc' },
  { id: 'A12', name: 'near katex' },
  { id: 'A13', name: 'duplicate same range' },
  { id: 'A14', name: 'nested selection' },
  { id: 'A15', name: 'partial overlap' },
  { id: 'A16', name: 'select all' },
  { id: 'A17', name: 'empty caret' },
  { id: 'A18', name: 'whitespace only' },
];

const BODY_CASES = [
  { id: 'B1', name: 'empty body' },
  { id: 'B2', name: 'single char body' },
  { id: 'B3', name: 'multiline body' },
  { id: 'B4', name: 'very long body' },
  { id: 'B5', name: '@AI marker variants' },
  { id: 'B6', name: '@AI mid/end/multi' },
  { id: 'B7', name: '@AI + long instruction' },
  { id: 'B8', name: 'type switcher AI' },
  { id: 'B9', name: 'markdown-ish body' },
  { id: 'B10', name: 'html-looking body' },
  { id: 'B11', name: 'zwj/rtl/bidi' },
  { id: 'B12', name: 'flood replies' },
  { id: 'B13', name: 'draft after submit' },
  { id: 'B14', name: 'replyDrafts per thread' },
  { id: 'B15', name: 'Ctrl+Enter submit' },
  { id: 'B16', name: 'reply when resolved' },
  { id: 'B17', name: 'author rename' },
];

const CONTEXT_CASES = [
  { id: 'C1', name: 'chinese quote' },
  { id: 'C2', name: 'ascii quote' },
  { id: 'C3', name: 'emoji quote' },
  { id: 'C4', name: 'special md/html chars' },
  { id: 'C5', name: 'newline in quote' },
  { id: 'C6', name: 'ambiguous duplicate quote' },
  { id: 'C7', name: 'empty prefix/suffix ends' },
  { id: 'C8', name: 'edit neighborhood fuzzy' },
  { id: 'C9', name: 'delete quote orphan' },
  { id: 'C10', name: 'tweak quote text-edited' },
];

const PACK_CASES = [
  { id: 'P1', name: 'minimal legal sidecar' },
  { id: 'P2', name: 'legacy author string' },
  { id: 'P3', name: 'missing optional runtime' },
  { id: 'P4', name: 'broken required fields' },
  { id: 'P5', name: 'huge annotation list' },
  { id: 'P6', name: 'blob src in imageAnchors' },
  { id: 'P7', name: 'pure image roundtrip' },
  { id: 'P8', name: '@AI roundtrip' },
  { id: 'P9', name: 'resolved multi-reply' },
  { id: 'P10', name: 'unknown extra fields' },
  { id: 'P11', name: 'idb vs file conflict' },
];

const INVALID_REASONS = [
  'text-not-found',
  'cross-block',
  'duplicate-threadId',
  'incomplete-data',
  'image-deleted',
  'image-anchor-missing',
  'text-edited',
  'text-deleted',
  'mark-missing',
  'mark-collision',
  'mark-reattached-fuzzy',
];

const BODY_CORPUS = {
  empty: '',
  single: 'x',
  multi: 'line1\nline2\nline3',
  long: 'L'.repeat(2000),
  aiOnly: '@AI ',
  aiLower: '@ai please review',
  aiInstr: '@AI 请检查这段论证是否循环，并给出修改建议。',
  mdish: '**bold** and `code` and [link](http://x.test)',
  htmlish: '<img src=x onerror=alert(1)> <script>evil()</script>',
  bidi: 'Hello \u202Eevil\u202C world',
  emoji: '看起来不错 👍🎉',
};

/** Sample markdown docs for anchor construction */
const DOCS = {
  simple: '# Title\n\nHello UNIQUE_ALPHA world.\n\nSecond paragraph UNIQUE_BETA here.\n',
  ambiguous:
    '# Ambiguous\n\nPrefixA SAME_QUOTE endA.\n\nPrefixB SAME_QUOTE endB.\n',
  lists: '# Lists\n\n- item one ALPHA\n- item two BETA\n\n1. num one\n2. num two\n',
  table:
    '# Table\n\n| H1 | H2 |\n| --- | --- |\n| cellA | cellB |\n| cellC | cellD |\n',
  longPara: '# Long\n\n' + ('word '.repeat(300)) + 'ENDMARK\n',
};

function allContentIds() {
  return [
    ...ANCHOR_CASES.map((x) => x.id),
    ...BODY_CASES.map((x) => x.id),
    ...CONTEXT_CASES.map((x) => x.id),
    ...PACK_CASES.map((x) => x.id),
    ...INVALID_REASONS.map((r) => 'R:' + r),
  ];
}

module.exports = {
  ANCHOR_CASES,
  BODY_CASES,
  CONTEXT_CASES,
  PACK_CASES,
  INVALID_REASONS,
  BODY_CORPUS,
  DOCS,
  allContentIds,
};
