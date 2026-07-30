/**
 * Token-protected localhost /revision poller for deep-link .mentor sessions.
 * Never fetches archive bytes — only revision metadata hints.
 */

export function createExternalRevisionWatcher({
  path,
  getToken,
  fetchImpl = globalThis.fetch,
  onHint,
  pollMs = 2000,
  debounceMs = 180,
  now = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let stopped = true;
  let mode = 'off';
  let baselineRevision = '';
  let writeQuietUntil = 0;
  let pollTimer = null;
  let debounceTimer = null;
  let queuedCause = null;
  let probing = false;

  function revisionUrl() {
    const token = typeof getToken === 'function' ? getToken() : '';
    const qs = new URLSearchParams({
      path: String(path || ''),
      token: String(token || ''),
    });
    return `/revision?${qs.toString()}`;
  }

  async function probe(cause) {
    if (stopped || now() < writeQuietUntil || probing) return;
    probing = true;
    try {
      let res;
      try {
        res = await fetchImpl(revisionUrl(), { cache: 'no-store' });
      } catch (error) {
        onHint({ cause: 'unreadable', error });
        return;
      }
      if (!res || res.status === 403 || res.status === 404 || res.status >= 400) {
        onHint({
          cause: 'unreadable',
          error: new Error(`revision HTTP ${res ? res.status : 'no-response'}`),
          status: res ? res.status : 0,
        });
        return;
      }
      let body;
      try {
        body = await res.json();
      } catch (error) {
        onHint({ cause: 'unreadable', error });
        return;
      }
      if (!body || body.ok !== true || !body.revision) {
        onHint({ cause: 'unreadable', error: new Error('invalid revision payload') });
        return;
      }
      const revision = String(body.revision);
      const mtime = Number(body.mtimeMs || 0);
      if (!baselineRevision) {
        baselineRevision = revision;
        return;
      }
      if (revision !== baselineRevision) {
        baselineRevision = revision;
        onHint({
          cause,
          mtime,
          size: Number(body.size || 0),
          revision,
        });
      }
    } finally {
      probing = false;
    }
  }

  function queueHint(cause) {
    if (stopped || now() < writeQuietUntil) return;
    queuedCause = queuedCause || cause;
    if (debounceTimer) return;
    debounceTimer = setTimeoutFn(async () => {
      debounceTimer = null;
      const nextCause = queuedCause;
      queuedCause = null;
      await probe(nextCause);
    }, debounceMs);
  }

  async function start() {
    stopped = false;
    mode = 'server-poll';
    await probe('baseline');
    pollTimer = setIntervalFn(() => queueHint('revision'), pollMs);
    return mode;
  }

  function stop() {
    stopped = true;
    mode = 'off';
    queuedCause = null;
    if (debounceTimer) {
      try {
        clearTimeoutFn(debounceTimer);
      } catch (_) {
        /* ignore */
      }
      debounceTimer = null;
    }
    if (pollTimer) {
      try {
        clearIntervalFn(pollTimer);
      } catch (_) {
        /* ignore */
      }
      pollTimer = null;
    }
  }

  function noteOwnWrite(mtimeOrOpts, quietMs = 1500, revision = '') {
    let quiet = quietMs;
    let rev = revision;
    if (mtimeOrOpts && typeof mtimeOrOpts === 'object') {
      quiet = mtimeOrOpts.quietMs != null ? mtimeOrOpts.quietMs : 1500;
      rev = mtimeOrOpts.revision || '';
    } else if (arguments.length >= 3) {
      rev = revision;
    }
    if (rev) baselineRevision = String(rev);
    writeQuietUntil = now() + Math.max(0, Number(quiet) || 0);
  }

  function modeName() {
    return mode;
  }

  return {
    start,
    stop,
    noteOwnWrite,
    mode: modeName,
    probe: () => probe('manual'),
  };
}
