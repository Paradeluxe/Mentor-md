/**
 * Pure external-refresh decision table.
 * No DOM, State, archive IO, or toast side effects.
 */

export function decideExternalRefresh({
  dirty,
  sameFingerprint,
  unreadable,
  isOwner = true,
  hasSource = true,
  isCurrentGeneration = true,
}) {
  if (!isOwner || !hasSource || !isCurrentGeneration || sameFingerprint) {
    return { action: 'ignore', pauseAutosave: false };
  }
  if (unreadable) return { action: 'unreadable', pauseAutosave: true };
  if (dirty) return { action: 'prompt', pauseAutosave: true };
  return { action: 'reload', pauseAutosave: false };
}
