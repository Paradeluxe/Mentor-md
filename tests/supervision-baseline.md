# Supervision optimization baseline

Recorded before supervision/pet optimization execution.

- Branch: `main...origin/main`
- Existing dirty files: CHANGELOG.md, app.bundle.js, app.js, index.html, mentor-server.py, package.json, styles.css
- Existing untracked files: modules/supervision.js, references/supervision-mode-fix-mentor.md, tests/unit-supervision.spec.js
- HEAD at baseline capture: `dbe77a1 feat: Office-style save — draft autosave, confirm on exit`
- package version at baseline: `1.47.1`

## Required baseline gates

- `node tests/unit-supervision.spec.js`
- `python tests/mentor-server-revision.spec.py`
- `node tests/unit-external-revision-watcher.spec.js`
- `npm run check:bundle`

## Baseline results (2026-07-30)

- unit-supervision: `17 pass / 0 fail`
- mentor-server-revision: PASS
- unit-external-revision-watcher: `4 pass / 0 fail`
- check:bundle: OK (`588effc982e5…`)
- Node MODULE_TYPELESS_PACKAGE_JSON warning on ESM modules: recorded only; do not flip package.json to `"type": "module"` just to silence it
