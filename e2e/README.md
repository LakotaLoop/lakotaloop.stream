# Browser runtime checks

The suite builds the production site, serves `dist` at
`http://127.0.0.1:4175`, and drives the rendered DOM with real Playwright clicks,
taps, focus, and keyboard actions. It never needs the publishing Desktop,
personal credentials, external streams, or the full movie files.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e
pnpm test:e2e:headed
```

Playwright owns the HTTP server and shuts it down after the run. The server
handles MIME types and single HTTP byte ranges for actual native media seeking.
It exposes only the production build and this directory's tiny fixtures.
Vitest discovers `test/**/*.test.ts`; Playwright discovers `e2e/**/*.spec.ts`.

An isolated browser cache is supported without modifying the user's normal
Chrome, Firefox, or Safari installation:

```sh
export PLAYWRIGHT_BROWSERS_PATH=/private/tmp/lakotaloop-playwright
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

The implementation session used that isolated cache on macOS. On Linux CI,
Playwright installs browser dependencies plus branded Chrome in the disposable
runner, and `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` selects its H.264/AAC codecs.
Local runs default to managed Chromium; this environment actually decoded the
committed MP4 fixtures in Chromium, Firefox, and WebKit. When Firefox reports
H.264/AAC unavailable, its tests use the separately generated VP8/Opus WebM
fixtures and still require actual decoding. An advertised codec that fails to
decode fails the test; it is never silently counted as successful playback.

## Coverage

- Chromium, Firefox, and WebKit desktop browsing/input.
- WebKit touch at 390×844 and 844×390, and Chromium keyboard input at 1920×1080.
- Both real titles, descriptions, artwork pairings, the `[CR]` line break,
  empty tagline, no autoplay, and no parallel preparation of both movies.
- Initial and other-card first-tap behavior, pointer-generated focus,
  rapid source changes, mixed keyboard/pointer input, arrow boundaries,
  native button Space/Enter, repeated Enter, and modifier shortcuts.
- Actual MP4/available WebM decoding, differing video dimensions,
  advancing `currentTime`, audible configuration, pause/resume, seeking,
  genuine natural completion, replay, return, and source switching.
- Mandatory actual video-element fullscreen and actual Shaka HLS/MSE playback
  for both source identities in both Chromium projects. Failed fullscreen
  entry fails these tests; native-controls fallback cannot pass them.
- The studio icon's browsing-fullscreen toggle through real clicks and taps,
  exclusion from keyboard navigation, and handoff to native video fullscreen.
- Separately labeled fullscreen-denial fault injection, corrupt media,
  missing artwork, and cancellation with late network completion.
- Busy click/tap and Enter actions never queue playback after preparation;
  retrying the same failed movie restores readiness and requires a fresh Play action.
- Stable shelf/card alignment, both selected artwork states, tablet title
  changes, reduced motion, and complete cards above the fold in short phone
  viewports (412 × 700 and 360 × 640) before any automatic input scrolling.
- Short phone landscape viewports (840 × 300, 915 × 412, and 760 × 300) show
  both complete cards at startup and after selection, without text overlap or
  horizontal overflow. These reserve space for browser chrome through a smaller
  CSS viewport; they do not simulate the physical browser toolbar itself.

Normal test input uses the browser's own event ordering. Success tests never
replace `play()`, `pause()`, media state, fullscreen methods, or media events.
Pause/resume/seek and fullscreen exit call the real platform APIs. Explicitly
labeled fault-injection tests deny fullscreen entry or delay its promise
settlement. Those checks are separate from unmodified fullscreen success tests.

macOS WebKit uses Option-Tab for the native button-navigation test, following
the default Safari keyboard setting. Other projects use Tab/Shift-Tab. This
respects the browser's preference rather than adding an application Tab trap.
See [Apple's Safari keyboard shortcuts](https://support.apple.com/en-gb/guide/safari/cpsh003/mac).

The TV viewport and touch configuration simulate browser input and layout;
they do not establish physical smart-TV or native iPhone fullscreen support.
Those devices still need manual checks.

## Deterministic media

`fixtures/intro.mp4` is five seconds, 320×180, blue with a quiet 440 Hz tone.
`fixtures/halloween.mp4` is seven seconds, 426×240, orange with a quiet 880 Hz
tone. The H.264 Baseline/AAC MP4s, VP8/Opus WebMs, and one-second fragmented-MP4
HLS segments together total about 292 KB. These are synthetic test patterns,
not Lakota Loop movies, and nothing under `e2e` ships in `dist`.

To regenerate with FFmpeg (the committed fixtures used FFmpeg 9.0.1):

```sh
bash e2e/generate-fixtures.sh
```

The recipe needs `libx264`, `aac`, `libvpx`, and `libopus` encoders. Frames,
dimensions, duration, keyframe intervals, and tones are fixed. Encoder versions
may change binary output, so CI uses the committed bytes and does not regenerate.
No input media is read, moved, copied, uploaded, or transcoded from Desktop.

For native-file checks, network interception substitutes only the two exact
published stream URL strings in the compiled application's HTTP response;
the metadata, IDs, production source mapping logic, and all player classes
remain intact. Shaka then loads those distinct local MP4/WebM URLs normally.
For the mandatory HLS tests the compiled bundle is unchanged: the two exact
Mux manifest requests receive local master manifests, whose playlists and
segments are served as real bytes. An unhandled Mux request is blocked so
accidental network dependency cannot pass unnoticed.

## Screenshots and failure artifacts

Each selected-layout test saves `sunday-intro.png` and `halloween-2025.png`
under its project directory in `test-results/`; Chromium also saves an 820 px
tablet image. The suite checks geometric invariants rather than accepting
unchecked pixel baselines. Inspect these images when changing composition.
Portrait tests also save both selections at each compact viewport size.
There are no arbitrary sleeps or test retries.

Failures retain screenshots and Playwright traces in `test-results/` and an
HTML report in `playwright-report/`. Both directories are ignored by Git.
CI keeps existing lint/build/audit/unit stages and uploads browser failure
artifacts for seven days. To inspect a trace:

```sh
pnpm exec playwright show-trace test-results/<failed-test>/trace.zip
```
