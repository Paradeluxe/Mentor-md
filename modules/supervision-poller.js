/**
 * Independent, cancellable supervision poller.
 *
 * Decouples fetchSupervisionStatus / startSupervisionPolling / stopSupervisionPolling
 * from app.js so a slow response from a previous document cannot overwrite the
 * current document's state. On transient network/JSON errors the poller keeps
 * the last trusted lock but flips health to 'stale' so the UI can show the
 * signal-light without silently unlocking the document.
 *
 * Contract (v1):
 *   - start({path, token, documentId}) — cancel any in-flight fetch,
 *     bump generation, do an immediate probe, then schedule recurring probes.
 *   - stop() — cancel the timer and mark generation closed; in-flight fetches
 *     resolve but their snapshots are dropped.
 *   - onSnapshot(snapshot) is called only for snapshots from the current
 *     generation. snapshot always has {documentId, generation, health, error}.
 *   - When fetchStatus throws or returns a non-active payload while lastGood
 *     exists, snapshot is the merged { ...lastGood, health:'stale',
 *     error:'poll-failed' } (kept active, lastGood preserved).
 *   - The actual `active:false` clear happens only via an explicit inactive
 *     payload from fetchStatus — caller wires that into applySupervisionPayload.
 */

export class SupervisionPollError extends Error {
  constructor(message, { cause, status = 0 } = {}) {
    super(message);
    this.name = 'SupervisionPollError';
    this.cause = cause;
    this.status = status;
  }
}

export function createSupervisionPoller({
  fetchStatus,
  onSnapshot,
  pollMs = 1000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchStatus !== 'function') {
    throw new TypeError('createSupervisionPoller: fetchStatus must be a function');
  }
  if (typeof onSnapshot !== 'function') {
    throw new TypeError('createSupervisionPoller: onSnapshot must be a function');
  }

  let generation = 0; // increments on every start; closed generations drop late fetches
  let sessionId = '';
  let currentCtx = null; // { path, token, documentId }
  let timerId = null;
  let lastGood = null; // last successful normalized payload (active:true expected)
  let probingGen = 0; // generation of the probe currently in flight; 0 = idle
  let stopped = true;

  function clearTimer() {
    if (timerId != null) {
      try { clearIntervalFn(timerId); } catch (_) { /* ignore */ }
      timerId = null;
    }
  }

  function emit(snapshot) {
    if (stopped) return;
    try { onSnapshot(snapshot); } catch (e) { /* swallow consumer errors */ void e; }
  }

  function annotate(raw) {
    const payload = raw && typeof raw === 'object' ? raw : { active: false };
    return Object.assign({}, payload, {
      documentId: currentCtx ? currentCtx.documentId : '',
      generation,
      sessionId,
    });
  }

  async function probe() {
    if (stopped || !currentCtx || probingGen === generation) return;
    probingGen = generation;
    const ctx = currentCtx;
    const myGen = generation;
    try {
      const raw = await fetchStatus(ctx);
      if (stopped || myGen !== generation || ctx !== currentCtx) return; // late
      const snap = annotate(raw);
      if (snap.active) lastGood = snap;
      emit(snap);
    } catch (error) {
      if (stopped || myGen !== generation || ctx !== currentCtx) return; // late
      if (lastGood && lastGood.active) {
        const stale = Object.assign({}, lastGood, {
          health: 'stale',
          error: 'poll-failed',
          generation,
          sessionId,
        });
        emit(stale);
      } else {
        emit(annotate({ active: false, health: 'unreadable', error: 'poll-failed' }));
      }
    } finally {
      if (probingGen === myGen) probingGen = 0;
    }
  }

  async function start({ path, token, documentId } = {}) {
    const nextDoc = String(documentId || '');
    if (!path || !token || !nextDoc) {
      // Invalid input: just stop and do nothing.
      stop();
      return;
    }
    // Bump generation so any in-flight probe from the previous start is dropped.
    generation += 1;
    sessionId = `${nextDoc}#${generation}`;
    currentCtx = { path: String(path), token: String(token), documentId: nextDoc };
    stopped = false;
    lastGood = null;
    clearTimer();
    timerId = setIntervalFn(() => { probe(); }, pollMs);
    // Immediate probe so the banner shows quickly on doc switch.
    await probe();
  }

  function stop() {
    stopped = true;
    generation += 1; // any in-flight probe becomes stale
    currentCtx = null;
    clearTimer();
    probingGen = 0;
    lastGood = null;
  }

  function mode() {
    return stopped ? 'off' : 'server-poll';
  }

  function probeNow() {
    return probe();
  }

  return {
    start,
    stop,
    mode,
    probe: probeNow,
  };
}

export default { createSupervisionPoller, SupervisionPollError };