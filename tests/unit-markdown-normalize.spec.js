/**
 * unit-markdown-normalize.spec.js
 * Body single newlines → paragraph breaks at render time.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  singleNewlinesToParagraphBreaks,
  ensureBlockLevelImages,
  isStandaloneImageLine,
  unwrapSoleImageParagraphs,
} from '../modules/markdown-normalize.js';
import MarkdownIt from 'markdown-it';

describe('markdown-normalize paragraph breaks', () => {
  it('promotes single newline between prose lines', () => {
    const src = 'First line.\nSecond line.';
    assert.equal(singleNewlinesToParagraphBreaks(src), 'First line.\n\nSecond line.');
  });

  it('is idempotent when already double-spaced', () => {
    const src = 'First line.\n\nSecond line.';
    assert.equal(singleNewlinesToParagraphBreaks(src), src);
  });

  it('leaves fenced code single newlines alone', () => {
    const src = [
      'Intro.',
      '```js',
      'const a = 1;',
      'const b = 2;',
      '```',
      'Outro.',
    ].join('\n');
    const out = singleNewlinesToParagraphBreaks(src);
    assert.match(out, /```js\nconst a = 1;\nconst b = 2;\n```/);
    assert.match(out, /Intro\.\n\n```js/);
    assert.match(out, /```\n\nOutro\./);
  });

  it('leaves pipe table rows on single newlines', () => {
    const src = [
      'Before.',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      'After.',
    ].join('\n');
    const out = singleNewlinesToParagraphBreaks(src);
    assert.match(out, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
    assert.match(out, /Before\.\n\n\| A \|/);
    assert.match(out, /\| 2 \|\n\nAfter\./);
  });

  it('detects standalone image lines', () => {
    assert.equal(isStandaloneImageLine('![](media/a.png)'), true);
    assert.equal(isStandaloneImageLine('text ![](media/a.png)'), false);
  });

  it('image between text becomes its own block after promote', () => {
    const src = [
      'Some methods text.',
      '![](media/image5.png)',
      '**Figure 1.** Caption here.',
    ].join('\n');
    const out = singleNewlinesToParagraphBreaks(src);
    assert.equal(
      out,
      [
        'Some methods text.',
        '',
        '![](media/image5.png)',
        '',
        '**Figure 1.** Caption here.',
      ].join('\n')
    );
    assert.equal(ensureBlockLevelImages(src), out);
  });

  it('render yields separate blocks not one paragraph', () => {
    const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
    const src = singleNewlinesToParagraphBreaks(
      'Body text.\n![](media/x.png)\n**Figure 1.** Cap.'
    );
    let html = md.render(src);
    html = unwrapSoleImageParagraphs(html);
    assert.equal(html.includes('<p>Body text.\n<img'), false);
    assert.match(html, /<p>Body text\.<\/p>/);
    assert.match(html, /<img src="media\/x\.png"/);
    assert.match(html, /<p><strong>Figure 1\.<\/strong>/);
    assert.equal(/<p>\s*<img/.test(html), false);
  });

  it('unwrapSoleImageParagraphs leaves mixed paragraphs alone', () => {
    const html = '<p>hi <img src="a.png" alt=""> there</p>';
    assert.equal(unwrapSoleImageParagraphs(html), html);
  });
});
