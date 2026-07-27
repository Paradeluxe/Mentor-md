/**
 * Cross-page live sync protocol (pure helpers).
 * Same browser, multi-page: one owner + real-time followers.
 */

export const LIVE_SYNC_SCHEMA = 1;

function hash32(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Stable BroadcastChannel name for a document room. */
export function channelNameForDocument(documentKey) {
  return `mentor-live-v1-${hash32(documentKey)}`;
}

/**
 * Compare two leases. Higher term wins; same term → ownerId lexicographic.
 * @returns {number} positive if a > b, negative if a < b, 0 if equal
 */
export function compareLease(a, b) {
  const at = Number(a?.term || 0);
  const bt = Number(b?.term || 0);
  if (at !== bt) return at - bt;
  return String(a?.ownerId || "").localeCompare(String(b?.ownerId || ""));
}

/** Claim ownership: term + 1, new ownerId. */
export function nextLease(current, ownerId) {
  return { term: Number(current?.term || 0) + 1, ownerId: String(ownerId) };
}

/**
 * Envelope gate: reject wrong doc/schema, stale lease, or non-increasing seq.
 * Higher lease resets seq watermark to 0 so new owner can start at seq=1.
 */
export function createEnvelopeGate(documentKey) {
  let lease = { term: 0, ownerId: "" };
  let seq = 0;
  return {
    accept(message) {
      if (!message || message.schema !== LIVE_SYNC_SCHEMA) return false;
      if (message.documentKey !== documentKey) return false;
      const leaseCmp = compareLease(message.lease, lease);
      if (leaseCmp < 0) return false;
      if (leaseCmp > 0) {
        lease = {
          term: Number(message.lease?.term || 0),
          ownerId: String(message.lease?.ownerId || "")
        };
        seq = 0;
      }
      const nextSeq = Number(message.seq || 0);
      if (nextSeq <= seq) return false;
      seq = nextSeq;
      return true;
    },
    state() {
      return { lease: { ...lease }, seq };
    }
  };
}

/**
 * Deep-clone tree and rewrite image attrs.src via mapper.
 * Does not mutate input.
 */
export function mapImageSources(value, mapper) {
  if (Array.isArray(value)) {
    return value.map((item) => mapImageSources(item, mapper));
  }
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = mapImageSources(child, mapper);
  }
  if (out.type === "image" && out.attrs && typeof out.attrs.src === "string") {
    out.attrs = { ...out.attrs, src: mapper(out.attrs.src) };
  }
  return out;
}

/**
 * Deterministic media revision fingerprint from name → {size,type} (or Blob).
 * Used so ordinary typing does not re-send image blobs.
 */
export function mediaRevision(mediaFiles) {
  return Object.entries(mediaFiles || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, blob]) => {
      const size = blob && typeof blob.size === "number" ? blob.size : 0;
      const type = (blob && blob.type) || "";
      return `${name}:${size}:${type}`;
    })
    .join("|");
}
