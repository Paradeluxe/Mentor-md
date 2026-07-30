// Pure supervision-poller lifecycle tests.
// Mirrors unit-external-revision-watcher.spec.js style: controllable fetch + fake timers.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', 'modules', 'supervision-poller.js')
  ).href;
  const { createSupervisionPoller } = await import(modUrl);

  let pass = 0;
  async function run(name, fn) {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  }

  // Build a fetch harness where every pending fetch exposes a Promise + control
  // fns so the test can resolve or reject it after the poller has already awaited.
  function makeFetchHarness() {
    const pending = [];
    function fetchStatus(ctx) {
      let resolveFn;
      let rejectFn;
      const promise = new Promise((res, rej) => {
        resolveFn = res;
        rejectFn = rej;
      });
      const entry = { ctx: { ...ctx }, resolve: resolveFn, reject: rejectFn, promise };
      pending.push(entry);
      return promise;
    }
    async function resolveOne(predicate, payload) {
      const idx = pending.findIndex((p) => predicate(p.ctx));
      if (idx < 0) throw new Error('no matching pending fetch');
      const entry = pending.splice(idx, 1)[0];
      entry.resolve(payload);
      // Let microtasks drain
      await wait(0);
    }
    async function rejectOne(predicate, error) {
      const idx = pending.findIndex((p) => predicate(p.ctx));
      if (idx < 0) throw new Error('no matching pending fetch');
      const entry = pending.splice(idx, 1)[0];
      entry.reject(error);
      // Drain microtasks (probe catches the rejection and runs emit)
      await wait(0);
      await wait(0);
    }
    return { fetchStatus, pending, resolveOne, rejectOne };
  }

  await run('late-response-from-previous-document-is-ignored', async () => {
    const harness = makeFetchHarness();
    const snapshots = [];
    const poller = createSupervisionPoller({
      fetchStatus: harness.fetchStatus,
      onSnapshot: (s) => snapshots.push(s),
      pollMs: 100,
      setIntervalFn: () => 0, // disable recurring interval in this test
      clearIntervalFn: () => {},
      setTimeoutFn: () => 0,
      clearTimeoutFn: () => {},
      now: () => Date.now(),
    });

    // Start doc-A (immediate probe fires, doc-A fetch is now pending)
    const pA = poller.start({ path: 'C:/a.mentor', token: 'tok-A', documentId: 'doc-A' });
    // Without awaiting pA, switch to doc-B. This bumps the generation.
    const pB = poller.start({ path: 'C:/b.mentor', token: 'tok-B', documentId: 'doc-B' });

    // Both fetches are pending now. Resolve doc-A (slow server) first, then doc-B.
    await harness.resolveOne(
      (c) => c.documentId === 'doc-A',
      { active: true, lockMode: 'document', pendingThreadIds: ['t1'], currentThreadId: 't1' }
    );
    await harness.resolveOne(
      (c) => c.documentId === 'doc-B',
      { active: false }
    );
    await Promise.all([pA, pB]);

    // Only doc-B's snapshot may be emitted. doc-A's late reply MUST be dropped.
    for (const s of snapshots) {
      assert.equal(s.documentId, 'doc-B', `late doc-A payload leaked: ${JSON.stringify(s)}`);
    }
    poller.stop();
  });

  await run('transient-failure-emits-stale-without-clearing-snapshot', async () => {
    const harness = makeFetchHarness();
    const snapshots = [];
    const intervalCbs = [];
    const poller = createSupervisionPoller({
      fetchStatus: harness.fetchStatus,
      onSnapshot: (s) => snapshots.push(s),
      pollMs: 20,
      setIntervalFn: (fn, ms) => { intervalCbs.push(fn); return intervalCbs.length; },
      clearIntervalFn: () => {},
      setTimeoutFn: () => 0,
      clearTimeoutFn: () => {},
      now: () => Date.now(),
    });

    const pStart = poller.start({ path: 'C:/a.mentor', token: 'tok', documentId: 'doc-1' });
    await harness.resolveOne(() => true, {
      active: true,
      lockMode: 'pending-paragraphs',
      pendingThreadIds: ['p1'],
      currentThreadId: 'p1',
      phase: 'working',
    });
    await pStart;

    const firstActive = snapshots.find((s) => s.active && s.health !== 'stale');
    assert.ok(firstActive, 'expected first active snapshot');
    assert.deepEqual(firstActive.pendingThreadIds, ['p1']);

    // Trigger a recurring probe (manual fire) and reject it to simulate transient failure.
    assert.equal(intervalCbs.length, 1, 'expected exactly 1 interval');
    const fireProbe = intervalCbs[0];
    const probeTask = fireProbe();
    // Reject the pending fetch (whichever is oldest)
    await harness.rejectOne(() => true, new Error('boom'));
    try { await probeTask; } catch (_) { /* probe catches internally */ }

    const last = snapshots[snapshots.length - 1];
    assert.equal(last.active, true, 'stale snapshot must remain active');
    assert.equal(last.health, 'stale', `expected health=stale, got ${last.health}`);
    assert.equal(last.error, 'poll-failed');
    assert.deepEqual(last.pendingThreadIds, ['p1'], 'lastGood must be preserved');
    assert.equal(last.currentThreadId, 'p1');
    poller.stop();
  });

  await run('stop-cancels-timer-and-prevents-late-hints', async () => {
    const harness = makeFetchHarness();
    const snapshots = [];
    const poller = createSupervisionPoller({
      fetchStatus: harness.fetchStatus,
      onSnapshot: (s) => snapshots.push(s),
      pollMs: 100,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
      setTimeoutFn: () => 0,
      clearTimeoutFn: () => {},
      now: () => Date.now(),
    });

    const pStart = poller.start({ path: 'C:/a.mentor', token: 'tok', documentId: 'doc-X' });
    await harness.resolveOne(() => true, { active: true });
    await pStart;
    const initialCount = snapshots.length;
    assert.ok(initialCount >= 1, 'expected at least 1 snapshot before stop');

    poller.stop();
    // Manual probe call after stop — must not deliver a payload.
    await poller.probe();
    await wait(5);
    assert.equal(snapshots.length, initialCount, `post-stop payload leaked: ${JSON.stringify(snapshots.slice(initialCount))}`);
    assert.equal(poller.mode(), 'off');
  });

  await run('same-source-restart-does-not-stack-multiple-intervals', async () => {
    // Track live intervals (clear removes from set).
    const live = new Set();
    let nextId = 1;
    const harness = makeFetchHarness();
    const poller = createSupervisionPoller({
      fetchStatus: harness.fetchStatus,
      onSnapshot: () => {},
      pollMs: 20,
      setIntervalFn: (fn, ms) => { const id = nextId++; live.add(id); return id; },
      clearIntervalFn: (id) => { live.delete(id); },
      setTimeoutFn: () => 0,
      clearTimeoutFn: () => {},
      now: () => Date.now(),
    });

    poller.start({ path: 'C:/a.mentor', token: 'tok', documentId: 'doc-Y' });
    poller.start({ path: 'C:/a.mentor', token: 'tok', documentId: 'doc-Y' });
    poller.start({ path: 'C:/a.mentor', token: 'tok', documentId: 'doc-Y' });
    assert.equal(live.size, 1, `expected exactly 1 live interval, got ${live.size}`);
    poller.stop();
    assert.equal(live.size, 0, 'expected stop() to clear the interval');
  });

  console.log(`=== RESULT: ${pass} pass / 0 fail ===`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});