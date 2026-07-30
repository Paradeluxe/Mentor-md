// Unit: annotation mark coalescing + scanner helpers
const assert = require('assert');

async function t(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
    return true;
  } catch (e) {
    console.log('  ✗', name);
    console.log('   ', e && e.message ? e.message : e);
    return false;
  }
}

(async () => {
  const mod = await import('../modules/annotations.js');
  let pass = 0;
  let fail = 0;
  const run = async (name, fn) => {
    if (await t(name, fn)) pass++;
    else fail++;
  };

  console.log('=== unit-annotations ===');

  await run('exports coalesceAnnotationMarkPieces', async () => {
    assert.equal(typeof mod.coalesceAnnotationMarkPieces, 'function');
  });

  await run('contained-middle overlap coalesces outer to one logical range', async () => {
    const pieces = [
      { threadId: 'outer', from: 1, to: 7, text: 'alpha ' },
      { threadId: 'inner', from: 7, to: 12, text: 'bravo' },
      { threadId: 'outer', from: 7, to: 12, text: 'bravo' },
      { threadId: 'outer', from: 12, to: 20, text: ' charlie' },
    ];
    const logical = mod.coalesceAnnotationMarkPieces(pieces);
    const outer = logical.filter((x) => x.threadId === 'outer');
    const inner = logical.filter((x) => x.threadId === 'inner');
    assert.equal(outer.length, 1);
    assert.equal(inner.length, 1);
    assert.deepStrictEqual(
      { from: outer[0].from, to: outer[0].to, text: outer[0].text, pieces: outer[0].pieces },
      { from: 1, to: 20, text: 'alpha bravo charlie', pieces: 3 }
    );
    assert.deepStrictEqual(
      { from: inner[0].from, to: inner[0].to, text: inner[0].text, pieces: inner[0].pieces },
      { from: 7, to: 12, text: 'bravo', pieces: 1 }
    );
  });

  await run('partial overlap coalesces both threads', async () => {
    const pieces = [
      { threadId: 'a', from: 1, to: 7, text: 'alpha ' },
      { threadId: 'a', from: 7, to: 12, text: 'bravo' },
      { threadId: 'b', from: 7, to: 12, text: 'bravo' },
      { threadId: 'b', from: 12, to: 16, text: ' cha' },
    ];
    const logical = mod.coalesceAnnotationMarkPieces(pieces);
    const a = logical.find((x) => x.threadId === 'a');
    const b = logical.find((x) => x.threadId === 'b');
    assert.equal(a.from, 1);
    assert.equal(a.to, 12);
    assert.equal(a.text, 'alpha bravo');
    assert.equal(b.from, 7);
    assert.equal(b.to, 16);
    assert.equal(b.text, 'bravo cha');
  });

  await run('true gap keeps two logical ranges', async () => {
    const logical = mod.coalesceAnnotationMarkPieces([
      { threadId: 't', from: 1, to: 4, text: 'abc' },
      { threadId: 't', from: 6, to: 9, text: 'def' },
    ]);
    assert.equal(logical.length, 2);
    assert.equal(logical[0].text, 'abc');
    assert.equal(logical[1].text, 'def');
  });

  await run('adjacent ranges merge', async () => {
    const logical = mod.coalesceAnnotationMarkPieces([
      { threadId: 't', from: 1, to: 7, text: 'alpha ' },
      { threadId: 't', from: 7, to: 12, text: 'bravo' },
    ]);
    assert.equal(logical.length, 1);
    assert.deepStrictEqual(
      { from: logical[0].from, to: logical[0].to, text: logical[0].text },
      { from: 1, to: 12, text: 'alpha bravo' }
    );
  });

  await run('duplicate identical pieces are collapsed', async () => {
    const logical = mod.coalesceAnnotationMarkPieces([
      { threadId: 't', from: 1, to: 5, text: 'abcd' },
      { threadId: 't', from: 1, to: 5, text: 'abcd' },
    ]);
    assert.equal(logical.length, 1);
    assert.equal(logical[0].pieces, 1);
    assert.equal(logical[0].text, 'abcd');
  });

  await run('empty / invalid input yields empty', async () => {
    assert.deepStrictEqual(mod.coalesceAnnotationMarkPieces(null), []);
    assert.deepStrictEqual(mod.coalesceAnnotationMarkPieces([]), []);
    assert.deepStrictEqual(
      mod.coalesceAnnotationMarkPieces([{ threadId: 't', from: 5, to: 5, text: '' }]),
      []
    );
  });

  console.log('\n=== RESULT:', pass, 'pass /', fail, 'fail ===');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
