# 1. No build step and no dependencies

Date: 2026-11-15
Status: Accepted

## Context

The app began as three files opened straight from disk. Adding rhythm, a tonal generator and a new interface made one 470-line script too small a container, and the generator needed unit tests. The options were to stay with classic scripts, to split into native ES modules, or to adopt a toolchain (Vite and TypeScript).

## Decision

Plain ES modules under `src/`, loaded by the browser as written. No bundler, no framework, no TypeScript, no npm dependencies. Tests use Node's built-in runner (`node --test`). A 40-line static server (`scripts/serve.mjs`) serves the app locally.

## Consequences

- Nothing to install, nothing to keep up to date, and what is in the repository is exactly what runs. Any static host can serve it.
- The app can no longer be opened from `file://`, because browsers refuse to load modules that way. `npm start` is required locally.
- No type checking and no linting. The pure modules are covered by tests instead; the DOM code is checked by looking at it in a browser.
- If the code grows to need types or third-party packages, this decision should be replaced by a new record rather than worked around.
