// Pure external-revision-watcher lifecycle tests.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', 'modules', 'external-revision-watcher.js')
  ).href;
  const { createExternalRevisionWatcher } = await import(modUrl);

  let pass = 0;
  async function run(name, fn) {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  }

  await run('unchanged-revision-is-silent', async () => {
    const events = [];
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        status: 200,
        json: async () => ({
          ok: true,
          mtimeMs: 1000,
          size: 10,
          revision: '1000:10',
        }),
      };
    };
    const watcher = createExternalRevisionWatcher({
      path: 'C:/tmp/a.mentor',
      getToken: () => 'tok',
      fetchImpl,
      pollMs: 20,
      debounceMs: 1,
      onHint: (e) => events.push(e),
    });
    await watcher.start();
    assert.equal(watcher.mode(), 'server-poll');
    await wait(55);
    assert.equal(events.length, 0);
    assert.ok(calls >= 2);
    watcher.stop();
  });

  await run('changed-revision-emits-once', async () => {
    const events = [];
    let rev = '1:1';
    const fetchImpl = async () => ({
      status: 200,
      json: async () => ({
        ok: true,
        mtimeMs: rev.startsWith('2') ? 2000 : 1000,
        size: 1,
        revision: rev,
      }),
    });
    const watcher = createExternalRevisionWatcher({
      path: 'C:/tmp/a.mentor',
      getToken: () => 'tok',
      fetchImpl,
      pollMs: 20,
      debounceMs: 1,
      onHint: (e) => events.push(e),
    });
    await watcher.start();
    rev = '2:1';
    await wait(55);
    assert.equal(events.length, 1);
    assert.equal(events[0].cause, 'revision');
    assert.equal(events[0].revision, '2:1');
    await wait(55);
    assert.equal(events.length, 1);
    watcher.stop();
  });

  await run('stop-prevents-late-hint', async () => {
    const events = [];
    let rev = '1:1';
    const watcher = createExternalRevisionWatcher({
      path: 'C:/tmp/a.mentor',
      getToken: () => 'tok',
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({ ok: true, mtimeMs: 1, size: 1, revision: rev }),
      }),
      pollMs: 20,
      debounceMs: 1,
      onHint: (e) => events.push(e),
    });
    await watcher.start();
    watcher.stop();
    rev = '9:9';
    await wait(70);
    assert.equal(events.length, 0);
    assert.equal(watcher.mode(), 'off');
  });

  await run('unauthorized-is-unreadable', async () => {
    const events = [];
    const watcher = createExternalRevisionWatcher({
      path: 'C:/tmp/a.mentor',
      getToken: () => 'bad',
      fetchImpl: async () => ({ status: 403, json: async () => ({ ok: false }) }),
      pollMs: 1000,
      debounceMs: 1,
      onHint: (e) => events.push(e),
    });
    await watcher.start();
    await wait(20);
    assert.ok(events.some((e) => e.cause === 'unreadable'));
    watcher.stop();
  });

  console.log(`=== RESULT: ${pass} pass / 0 fail ===`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
