/**
 * Markdown render-time normalizers (pure, no DOM).
 *
 * Mentor default: a single newline in body prose is treated as a **full
 * paragraph break** at render time (not a soft same-paragraph join).
 *
 * Protected (single newlines kept):
 *   - fenced code blocks (``` … ```)
 *   - pipe tables (lines starting with |)
 *
 * Standalone image lines are also forced to block level (covered by the
 * same paragraph-break promotion when they sit on their own line).
 */

const IMAGE_ONLY_LINE =
  /^\s*!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)\s*$/;

/** True if the whole line is a single markdown image token. */
export function isStandaloneImageLine(line) {
  return IMAGE_ONLY_LINE.test(String(line || ""));
}

function isFenceLine(line) {
  return /^\s*```/.test(line);
}

function isTableRowLine(line) {
  // GFM pipe table row or separator
  return /^\s*\|/.test(line);
}

function isBlockquoteLine(line) {
  return /^\s*>/.test(line);
}

/**
 * Promote single newlines between body lines to paragraph breaks (`\n\n`).
 * Idempotent. Skips fenced code and pipe-table runs.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function singleNewlinesToParagraphBreaks(markdown) {
  const src = String(markdown ?? "");
  if (!src) return src;
  // Already using CRLF? normalize to LF for processing; caller may not care
  const normalized = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const out = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let justClosedFence = false;

    if (isFenceLine(line)) {
      const wasIn = inFence;
      inFence = !inFence;
      out.push(line);
      justClosedFence = wasIn && !inFence;
      if (!justClosedFence) {
        // Opening fence line, or still inside: do not insert breaks here
        continue;
      }
      // Closing fence: fall through so we can break before following prose
    } else {
      out.push(line);
    }

    if (i >= lines.length - 1) break;

    const next = lines[i + 1];

    // Inside fence: keep exact newlines (opening fence already continued)
    if (inFence) continue;

    // Already a blank line separation — nothing to add
    if (line === "" || next === "") continue;

    // Pipe table block: keep single newlines between table rows
    if (isTableRowLine(line) && isTableRowLine(next)) continue;

    // Blockquote run: keep single newlines between > lines
    if (isBlockquoteLine(line) && isBlockquoteLine(next)) continue;

    // Body: force paragraph break between two consecutive non-empty lines
    out.push("");
  }

  // Collapse 3+ newlines to 2 (one visual blank line max)
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * @deprecated Use singleNewlinesToParagraphBreaks — kept as alias for image-focused call sites.
 * Ensure standalone `![](...)` lines are block-separated (subset of full-body rule).
 */
export function ensureBlockLevelImages(markdown) {
  return singleNewlinesToParagraphBreaks(markdown);
}

/**
 * After markdown-it render, unwrap `<p><img…></p>` so TipTap's block Image
 * is a direct document child (no wrapper paragraph around the figure).
 *
 * @param {string} html
 * @returns {string}
 */
export function unwrapSoleImageParagraphs(html) {
  const src = String(html ?? "");
  if (!src.includes("<img")) return src;
  return src.replace(/<p>\s*(<img\b[^>]*>)\s*<\/p>/gi, "$1");
}
