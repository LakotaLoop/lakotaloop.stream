# Implementation verification — September 12, 2026

The completed library uses the two real NFO titles and exact basename-paired
JPEGs, preserves the original video/PWA infrastructure, and adds the requested
circular Lakota Loop studio icon at bottom right. Both verified production HLS
mappings are configured; see [exact content/source mapping](content.md).

## Commands actually executed

| Check                                                                        | Result                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Baseline `pnpm lint`, `pnpm build`, `pnpm test`                              | Passed; original 23 unit tests                                                   |
| Final `pnpm lint`                                                            | Passed                                                                           |
| Final `pnpm build`                                                           | Passed                                                                           |
| Final `pnpm test`                                                            | 58 passed: 36 player fault cases, 19 import/HTTP cases, 3 display/input cases    |
| `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/lakotaloop-playwright pnpm test:e2e`  | 80 passed across all six browser projects; no skips or retries                   |
| Additional focused startup/artwork/layout run after strengthening assertions | 18 passed across all six projects                                                |
| `pnpm audit-ci`                                                              | Passed; zero reported vulnerabilities                                            |
| Source-artwork SHA256 comparison                                             | All four copied JPEGs match exact source bytes                                   |
| Production-resource inspection                                               | No developer filesystem paths, full MP4s, or test fixtures in deployed resources |

Network-restricted package installation/audit and loopback/browser launches
initially needed the execution environment's sandbox escalation. The successful
runs above used the permitted network/browser environment. No tests disabled
browser autoplay protections. The existing large Shaka chunk still produces
Vite's informational bundle-size warning.

## Real local originals

A separate headed Chrome session opened the development website and used actual
card clicks to play each original, without changing media or fullscreen APIs:

| Movie               | Actual HTTP source                  | Decoded video | Observation                                                                      |
| ------------------- | ----------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| Sunday Intro        | `/__local-media/sunday-intro.mp4`   | 1920×1080     | Time advanced beyond 1 second, unmuted, native controls, video itself fullscreen |
| Halloween rough cut | `/__local-media/halloween-2025.mp4` | 3840×2160     | Time advanced beyond 1 second, unmuted, native controls, video itself fullscreen |

Actual fullscreen exit paused each video and restored its originating card's
DOM focus. No uncaught page errors were observed. Both original sources were
served read-only with byte ranges, without copying, transcoding or uploading.

The reproducible browser suite separately exercised actual decoding, native
pause/resume/seeking, real natural completion/replay, and Shaka HLS/MSE with
small committed fixtures. Fullscreen-success tests assert the actual video
fullscreen element in both Chromium projects. Deliberate fullscreen-denial
and unusual callback races are separately labeled fault-injection coverage.

## Inspected screenshots

These are final production-build screenshots with the wall clock fixed to noon
without replacing media timers:

- [Sunday Intro, 1920×1080](screenshots/sunday-intro-desktop.png)
- [Halloween rough cut, 1920×1080](screenshots/halloween-desktop.png)
- [Sunday Intro, portrait touch](screenshots/sunday-intro-portrait.png)
- [Halloween rough cut, portrait touch](screenshots/halloween-portrait.png)

The complete per-project images, including landscape touch and tablet layouts,
are generated under `test-results/`. Final geometry checks cover the full white
outline inside the shelf, aligned artwork tops, readable unclipped titles,
no horizontal page overflow, and stable shelf position when the movie changes.

## Outstanding actual-device checks

No physical smart-TV browser or native iPhone fullscreen session was available.
The TV viewport/keyboard and WebKit touch projects are simulations only.
Native iPhone Done/Back behavior, vendor television remote delivery, audio output,
codec performance on those devices, and their fullscreen implementation still
need hardware checks. CI integration is committed but has not run on GitHub,
since this work is not pushed. Nothing was deployed or uploaded.
