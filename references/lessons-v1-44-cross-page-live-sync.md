/**
 * Mentorship / lessons: cross-page live sync (v1.44.9)
 *
 * Architecture: single-writer + real-time follower mirror + one-click takeover.
 * NOT full OT/CRDT multi-writer collaboration. Same browser profile only.
 *
 * Room key:
 * - handle + documentId → id:<documentId>
 * - else name → name:<basename>
 *
 * Lease: {term, ownerId}. Higher term wins; same term → higher ownerId string.
 * Owner heartbeat 2s; followers elect after ~5s silence.
 *
 * Follower apply must set _liveSync.applying so onUpdate/markDirty do not loop.
 * Only owner may writeCurrentToHandle / autosave.
 *
 * Tests:
 * - unit-cross-tab-sync.spec.js
 * - e2e-cross-tab-live-sync.spec.js
 * - e2e.spec.js TEST 108
 * - chaos-wave14 W14_03 / W14_04
 */
