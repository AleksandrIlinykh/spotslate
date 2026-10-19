# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SpotSlate is a Chrome extension (Manifest V3) in plain JavaScript with no build step: Chrome loads `extension/` as it is. Alt over a paragraph translates it in a popup, Alt+T opens a window for writing in the page's language. The translation comes from Chrome's on-device Translator or from an AI provider the user sets up.

## Where to read

- `ARCHITECTURE.md`: the map. Where code runs, the main flows, every message and storage key, an index by task, a reading order. Start here before a change that spans files.
- `types/spotslate.d.ts`: the settings, the messages, the storage and every export of the content scripts, typed.
- `docs/superpowers/specs/2026-10-12-spotslate-design.md`: the design spec, about 100 KB, with every rule and every test scenario. Search it by section (`## Popup`, `## Compose window`, `## Testing`) instead of reading it whole.

## Commands

```bash
npm install && npx playwright install chromium
npm test                                     # unit tests, node --test, about a second
node --test tests/unit/settings.test.js      # one unit test file
npm run types                                # tsc over jsconfig.json, nothing emitted
npm run test:smoke                           # the e2e tests tagged @smoke, under a minute
npm run test:e2e                             # every e2e test, about 7 minutes locally
npx playwright test tests/e2e/hero.spec.js -g "pup"   # one e2e file, the tests matching "pup"
npx playwright test --list                   # every e2e test name: a list of what SpotSlate does
```

`--headed` shows the browser and `--ui` replays a test step by step. CI (`.github/workflows/test.yml`) runs the unit tests, the type check and every e2e test.

## Structure in brief

- **Content scripts** (`extension/content/`) are classic scripts, not modules. Each one adds its exports to `globalThis.spotslate` with `Object.assign`, and later scripts take them from there, so the order matters. It is kept in four places: `manifest.json`, `welcome.html` (every script, checked by `tests/unit/manifest.test.js`), `compose.html` and `options.html` (the scripts they need). A new content script goes into each place that uses it.
- **`content/main.js`** is the page's entry point: its state and every event handler.
- **`background.js`** is the service worker and the router: the messages, the ports `translate` and `compose`, the provider `fetch`, the cache, the site contexts. The ES modules in `extension/lib/` hold its logic; the settings and welcome pages import them too, and each has unit tests.
- **Two engines.** With `browser` (Chrome's Translator) the page translates by itself and nothing is sent. With `api` the page sends the text to background, which streams the provider's answer back over a port.

## Rules

- **Only what the user picked leaves the page**: the paragraph or selection under the mouse, or the draft in the compose window. Never the rest of a field or a form, which may hold passwords. Password fields get nothing.
- **The API keys never reach a page.** Storage is `TRUSTED_CONTEXTS` only; pages get `PageSettings`.
- **A page cannot drive SpotSlate.** Every handler checks `event.isTrusted`. The popup, the compose window and the companion live in closed shadow roots (`SHADOW_MODE` in `content/config.js`); the e2e tests run a copy with open ones. Background takes the site from the sender's tab, never from the page.
- **Nothing runs while idle.** No polling or timers without a cause; animations stop when hidden and keep still with reduced motion.
- **The spec follows the code.** A change in behavior updates the spec in the same commit, and a new e2e test adds a numbered scenario under `## Testing`.
- **Types are JSDoc only**, nothing changes at runtime. A new content script export gets a member in `interface SpotSlate` and a `/** @type {SpotSlate['name']} */` line above its function. VS Code may check with an older TypeScript, so keep `npx -y -p typescript@5.9 tsc -p jsconfig.json` clean too.
- **Repo text is English**, without em or en dashes and without guillemets. Other languages live only in `extension/content/strings.js` (13 languages; `tests/unit/strings.test.js` checks that each has every text). Vendored third-party code (`extension/vendor/`) and binary files are exempt. The e2e tests translate into Russian and take the expected texts from `say()` in `tests/e2e/fixtures.js`. To check: `git ls-files | grep -v -e strings.js -e '\.png$' -e '\.pdf$' -e 'extension/vendor/' | xargs grep -nP '[\x{0400}-\x{04FF}\x{2013}\x{2014}\x{00AB}\x{00BB}]'` prints nothing.
- **Files use LF.** On Windows, Python's `write_text` writes CRLF; write bytes instead.
- **The mock API** (`tests/mock-server.js`) picks its behavior by the API key: `bad` gives 401, `slow` one chunk a second, `split` an emoji cut between chunks, and more in the spec's `## Testing`.

## Git

One short line per commit, without attribution trailers. No plan documents: once a design is agreed, implement it with the tests first. Push only when asked.
