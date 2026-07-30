/**
 * Browser FileSystemFileHandle external-change watcher.
 * Side-effect free of State/DOM/JSZip — only emits onHint probes.
 */

export function createExternalChangeWatcher({
  handle,
  onHint,
  FileSystemObserver = globalThis.FileSystemObserver,
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
  let baselineMtime = 0;
  let writeQuietUntil = 0;
  let pollTimer = null;
  let debounceTimer = null;
  let observer = null;
  let queuedCause = null;

  async function probe(cause) {
    if (stopped || now() < writeQuietUntil) return;
    let file;
    try {
      file = await handle.getFile();
    } catch (error) {
      onHint({ cause: 'unreadable', error });
      return;
    }
    const mtime = Number(file.lastModified || 0);
    if (mtime > baselineMtime) {
      baselineMtime = mtime;
      onHint({ cause, mtime });
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
    try {
      baselineMtime = Number((await handle.getFile()).lastModified || 0);
    } catch (_) {
      /* still start observer/poll; first unreadable probe surfaces later */
    }
    if (typeof FileSystemObserver === 'function') {
      try {
        observer = new FileSystemObserver(() => queueHint('observer'));
        await observer.observe(handle);
        mode = 'observer';
        return mode;
      } catch (_) {
        try {
          observer?.disconnect();
        } catch (_) {
          /* ignore */
        }
        observer = null;
      }
    }
    pollTimer = setIntervalFn(() => queueHint('mtime'), pollMs);
    mode = 'handle-poll';
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
    if (observer) {
      try {
        observer.disconnect();
      } catch (_) {
        /* ignore */
      }
      observer = null;
    }
  }

  function noteOwnWrite(mtime, quietMs = 1500) {
    const next = Number(mtime || 0);
    if (next > baselineMtime) baselineMtime = next;
    writeQuietUntil = now() + Math.max(0, Number(quietMs) || 0);
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
