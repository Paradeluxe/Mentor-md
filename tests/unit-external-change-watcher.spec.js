// Pure external-change-watcher lifecycle tests.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', 'modules', 'external-change-watcher.js')
  ).href;
  const { createExternalChangeWatcher } = await import(modUrl);

  let pass = 0;
  async function run(name, fn) {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  }

  await run('poll-fallback-reports-newer-mtime-once', async () => {
    let mtime = 100;
    const events = [];
    const watcher = createExternalChangeWatcher({
      handle: { getFile: async () => ({ lastModified: mtime }) },
      FileSystemObserver: null,
      pollMs: 20,
      debounceMs: 1,
      onHint: (event) => events.push(event),
    });

    await watcher.start();
    assert.equal(watcher.mode(), 'handle-poll');
    mtime = 200;
    await wait(55);
    assert.deepEqual(events.map((event) => event.cause), ['mtime']);
    assert.equal(events[0].mtime, 200);
    // Steady mtime should not re-fire.
    await wait(55);
    assert.equal(events.length, 1);
    watcher.stop();
  });

  await run('pause-suppresses-self-write-hint', async () => {
    let mtime = 100;
    let observerCb = null;
    class FakeObserver {
      constructor(cb) { observerCb = cb; }
      async observe() { return undefined; }
      disconnect() {}
    }
    const events = [];
    const watcher = createExternalChangeWatcher({
      handle: { getFile: async () => ({ lastModified: mtime }) },
      FileSystemObserver: FakeObserver,
      pollMs: 1000,
      debounceMs: 1,
      onHint: (event) => events.push(event),
    });

    await watcher.start();
    assert.equal(watcher.mode(), 'observer');
    watcher.noteOwnWrite(150, 80);
    mtime = 150;
    observerCb();
    await wait(30);
    assert.equal(events.length, 0, 'quiet window must suppress own-write echo');

    mtime = 250;
    await wait(100);
    observerCb();
    await wait(30);
    assert.deepEqual(events.map((e) => e.cause), ['observer']);
    assert.equal(events[0].mtime, 250);
    watcher.stop();
  });

  await run('observer-failure-falls-back-to-polling', async () => {
    class BadObserver {
      constructor() {}
      async observe() { throw new Error('observe unavailable'); }
      disconnect() {}
    }
    let mtime = 10;
    const events = [];
    const watcher = createExternalChangeWatcher({
      handle: { getFile: async () => ({ lastModified: mtime }) },
      FileSystemObserver: BadObserver,
      pollMs: 20,
      debounceMs: 1,
      onHint: (event) => events.push(event),
    });
    const mode = await watcher.start();
    assert.equal(mode, 'handle-poll');
    assert.equal(watcher.mode(), 'handle-poll');
    mtime = 20;
    await wait(55);
    assert.equal(events.length, 1);
    assert.equal(events[0].cause, 'mtime');
    watcher.stop();
  });

  await run('stop-prevents-late-hint', async () => {
    let mtime = 1;
    const events = [];
    const watcher = createExternalChangeWatcher({
      handle: { getFile: async () => ({ lastModified: mtime }) },
      FileSystemObserver: null,
      pollMs: 20,
      debounceMs: 1,
      onHint: (event) => events.push(event),
    });
    await watcher.start();
    watcher.stop();
    mtime = 99;
    await wait(70);
    assert.equal(events.length, 0);
    assert.equal(watcher.mode(), 'off');
  });

  console.log(`=== RESULT: ${pass} pass / 0 fail ===`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
