# Lakota Loop browsing library implementation plan

**Goal:** Deliver the user's complete browsing, native playback, and browser-test brief.

**Architecture:** Keep plain TypeScript/Vite and one video element. A typed catalog
owns imported metadata; HeroView and MediaShelf compose BrowseScreen. VideoPlayer
owns a cancellable session, ShakaStreamLoader owns HLS, and VideoFullscreen owns
presentation events. Production stays static and uses distinct verified Mux URLs.

**Tech stack:** TypeScript, Vite, Shaka, Vitest, Playwright, Python/ffprobe import.

**Specification:** User-provided “Build the new Lakota Loop browsing website” brief
and two Arctic Fuse 3 screenshots, with full implementation authorized.

## Constraints

- Use exact basename NFO, fanart, landscape, MP4 pairings; publishing and Kodi are read-only.
- Keep current PWA identity, icons, toolchain and useful player regression coverage.
- No deploy, upload, push, unrelated formatting, branch switching or third-party work changes.
- All TypeScript declarations explicitly typed; document public APIs and lifecycle rules.
- Preserve sound and native controls; never fullscreen after an asynchronous gesture gap.

## Work stages

- [x] Run baseline lint/build/unit tests (23 tests passed).
- [x] Inspect Home.xml, Hub_Window, landscape layout, color and typography definitions.
- [x] Import exact assets/metadata, measure actual MP4s, add allowlisted byte-range dev serving.
- [x] Build stable hero and responsive one-shelf DOM layout matching the screenshots.
- [x] Implement explicit pointer first-tap intent and native keyboard activation; test transitions.
- [x] Adapt player classes to prepare/start/stop and isolate stale loads/play/fullscreen callbacks.
- [x] Add deterministic real-media/browser tests for input, errors, fullscreen and responsive layout.
- [x] Integrate browser CI while preserving lint/build/audit/unit jobs.
- [x] Inspect screenshots and actually play both local originals in browser.
- [x] Run pnpm lint, pnpm build, pnpm test, pnpm test:e2e and pnpm audit-ci.
      Final action: commit only the reviewed work with every message line <=76 characters; do not push.

## Ownership and interfaces

Catalog task owns `src/catalog`, `public/movies`, import and local-media scripts,
and focused content/HTTP tests. `Movie` has stable id, NFO fields, durationSeconds,
width/height and exact fanart/landscape URLs. `resolveSource(id)` returns
`PlaybackSource | null`.

Browse task owns `src/browse`, page markup/style, app launch, compatibility targets
and docs. Pointer-down records the card's readiness before focus; only one native
click activates it. Arrow/Tab focus explicitly selects and arms the card. Hover
never arms. No shelf key handler runs during playback.

Player task owns `src/player` and player fault-injection regression tests.
`VideoPlayer(video, onStateChange)` offers synchronous `prepare`, `start`, `stop`,
`getSnapshot` and async `dispose`. Snapshots distinguish preparing/ready/playing/
stopping/error/idle and associate sourceId/message. Only real exit releases the
video surface; entry denial keeps native fallback usable.

Browser task owns `e2e`, Playwright config and CI. Tests serve real fixture bytes
at the network/catalog-data boundary of the built app. Ordinary UI flows use
locator clicks/taps/keys; no mocked media or fullscreen in real coverage.
