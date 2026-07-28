# v1.45.6 — remove protected-document write guard

## Decision
User: 「取消这个功能吧，太怪了」— product no longer special-cases research .mentor paths.

## Removed
- isProtectedMentorTarget / confirmProtectedWrite / protectedWriteUnlocked
- autosave skip + manual save dialog kind `protected`
- tryWriteBackMentor confirm gate
- open/?open= toast 「受保护稿」

## Still true
- Agent/e2e discipline: do not write real user dFC path in tests (pre-commit).
- External-modified / permission / live-follower still gate writes.
- diskPathHint + mentorBaseName kept for path display.

## Verify
node tests/v143-protected-path.spec.js
node tests/chaos-wave-extreme-v14338.spec.js  (WAVE A)
node tests/e2e-save-clears-dirty.spec.js
