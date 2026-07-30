// Pure external-change reconciliation decision tests.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const modUrl = pathToFileURL(
    path.join(__dirname, '..', 'modules', 'external-change-reconcile.js')
  ).href;
  const { decideExternalRefresh } = await import(modUrl);

  let pass = 0;
  function check(name, actual, expected) {
    assert.deepEqual(actual, expected, name);
    pass += 1;
    console.log(`PASS ${name}`);
  }

  check(
    'clean-reload',
    decideExternalRefresh({ dirty: false, sameFingerprint: false, unreadable: false }),
    { action: 'reload', pauseAutosave: false }
  );
  check(
    'dirty-prompt',
    decideExternalRefresh({ dirty: true, sameFingerprint: false, unreadable: false }),
    { action: 'prompt', pauseAutosave: true }
  );
  check(
    'same-fingerprint-ignore',
    decideExternalRefresh({ dirty: true, sameFingerprint: true, unreadable: false }),
    { action: 'ignore', pauseAutosave: false }
  );
  check(
    'unreadable',
    decideExternalRefresh({ dirty: false, sameFingerprint: false, unreadable: true }),
    { action: 'unreadable', pauseAutosave: true }
  );
  check(
    'follower-ignore',
    decideExternalRefresh({
      dirty: false,
      sameFingerprint: false,
      unreadable: false,
      isOwner: false,
    }),
    { action: 'ignore', pauseAutosave: false }
  );
  check(
    'no-source-ignore',
    decideExternalRefresh({
      dirty: false,
      sameFingerprint: false,
      unreadable: false,
      hasSource: false,
    }),
    { action: 'ignore', pauseAutosave: false }
  );
  check(
    'stale-generation-ignore',
    decideExternalRefresh({
      dirty: false,
      sameFingerprint: false,
      unreadable: false,
      isCurrentGeneration: false,
    }),
    { action: 'ignore', pauseAutosave: false }
  );

  console.log(`=== RESULT: ${pass} pass / 0 fail ===`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
