# lakotaloop.stream

An artwork-led library for Sunday Intro and Lakota Loop Halloween 2025 Rough Cut.
Select a movie to see its artwork and information; activate its Play card to watch
with sound and the browser's native controls. Natural completion, Stop/Return, or
leaving an established video fullscreen session returns to the same selected card.
Ordinary Pause and buffering keep the player open.

Mouse movement over a card selects and focuses it; one click plays the ready
movie. Touch uses two deliberate taps: select, then Play. The initially previewed
movie starts unarmed. Arrow keys or Tab focus select and expose Play; Enter/Space
activate once. The Play label stays steady during background preparation, with a
small notice for slower loading. Activating a busy card never queues playback or
fullscreen. If fullscreen is denied, the in-page native video controls, Return to
movies, and Enter fullscreen actions remain reachable.

## Development

Use the Node version in `.nvmrc` (Node 26) and pnpm 12 or newer:

```sh
nvm install
nvm use
pnpm install
pnpm dev
```

Development serves only the two explicitly mapped original MP4 files over HTTP,
with seeking support. It does not copy movies into the repository or public assets.
See [content preparation and exact mappings](docs/content.md). Normal builds and
CI use committed metadata/JPEGs and never need Desktop or ffprobe.

```sh
pnpm import:content  # Optional: refresh exact NFO/JPEG/ffprobe data locally
pnpm build
pnpm preview
```

The static production build uses separate verified Mux HLS URLs. Both movies have
production mappings. Shaka is loaded lazily and retained across HLS source changes;
only the selected source is prepared. No full-movie uploads or deployment are part
of content import or tests.

The build retains TypeScript 7 through `@typescript/native`, with the TypeScript 6
compiler API alias required by typescript-eslint. PWA metadata, manifest and icons
remain intact; the existing 512-pixel icon is also the circular studio mark.

## Verification

```sh
pnpm lint
pnpm build
pnpm test
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e
pnpm test:e2e:headed
pnpm audit-ci
```

Browser tests build and serve the actual production output with tiny local media
fixtures substituted at the network/source-data boundary. They require no Mux
availability, personal credentials, original movies, or ffmpeg installation. Fixture
generation, codec choices, screenshots and coverage are documented in
[e2e/README.md](e2e/README.md). Vitest and Playwright discovery are separate. CI
retains lint/build/audit/unit jobs and adds browser installation/testing with failure
traces and screenshots. Generated reports are ignored by Git.

Use scoped Prettier/ESLint fixes for changed files when other work is in progress.
`pnpm format` is available for an intentional repository-wide formatting pass.

## Browser compatibility and architecture

The production JavaScript/CSS syntax target is Chromium 80, Firefox 78, Safari 14
or newer. This is a compatibility floor for browser syntax, not a claim that every
television, codec or fullscreen implementation has been hardware-tested. Modern
Chromium-based TV browsers are intended candidates; actual device testing remains
necessary. Samsung's [engine table](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
shows why TV engines need explicit targets rather than assuming desktop recency.

Shaka installs its compatibility polyfills and checks actual browser capability;
see its [support matrix](https://github.com/shaka-project/shaka-player#platform-and-browser-support-matrix).
The native Fullscreen API is feature-detected, with WebKit's separate video-fullscreen
path preserved. [Fullscreen requires transient user activation](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen),
so no import, load or promise is awaited before the Play action requests it.

Layout uses flowing DOM/CSS, safe-area padding, a percentage-ratio card fallback,
and `100vh` before newer viewport units. No CSS aspect-ratio, flex-gap, framework,
canvas renderer or vendor TV API is required. Reduced motion is respected.

`BrowseScreen` composes `HeroView`, `MediaShelf` and one `VideoPlayer`.
`ShakaStreamLoader` serializes/cancels source preparation and `VideoFullscreen`
tracks actual entry/exit separately from request promises. Imported XML becomes
plain typed data and is rendered with text nodes, never arbitrary HTML.

Legacy DOM arrow/Space names and unidentified numeric arrow/Enter values are
normalized in `src/browse/format.ts`. MediaStop/Back are handled only when delivered
during playback. Root browser history and modified keyboard shortcuts are left to
the browser. Shelf keys stand down while native media controls own interaction.

The shelf is a flex row with existing overflow capability; adding more real titles
later can extend focus visibility there. No carousel, invented library, general
spatial-navigation framework or TV SDK is included.

A 1920×1080 keyboard test is a TV interaction simulation. WebKit touch projects
simulate input and layout; they do not establish native iPhone fullscreen or
physical smart-TV support.
