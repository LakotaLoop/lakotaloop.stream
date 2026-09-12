# Content preparation and source mapping

The committed catalog and four JPEGs are sufficient for ordinary builds and CI.
The publishing directory is a read-only preparation/development input; no MP4 is
copied into `public`, Git, or the production build.

Run `pnpm import:content` when the publishing metadata or exact artwork changes.
The optional preparation command requires Python 3.10+ and `ffprobe` on `PATH`.
It validates both movies before writing output, reads the NFO fields as plain
text, converts `[CR]` to a newline, rejects XML declarations that can introduce
entities, and records the actual MP4 duration and first video stream dimensions.
Empty taglines remain empty. It copies the specified JPEG bytes without edits.

For another machine, pass an explicit publishing root:

```sh
pnpm import:content --source-root /path/to/lakotaloop.stream
```

The source root defaults to `~/Desktop/_PUBLISH/lakotaloop.stream/`. The importer
accepts only these exact directory/basename pairs:

| Stable ID        | Source directory                       | Exact media basename                       |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| `sunday-intro`   | `Lakota Loop Intro Video`              | `LL Intro`                                 |
| `halloween-2025` | `Lakota Loop Halloween 2025 Rough Cut` | `HALLOWEEN_2025_LakotaLoop_92_Rough-Cut-1` |

For each basename, `<basename>.nfo` supplies the descriptive text,
`<basename>.mp4` supplies technical metadata and local playback,
`<basename>-fanart.jpg` supplies the hero, and `<basename>-landscape.jpg` supplies
the card. Each JPEG keeps its original filename under `public/movies/<id>/`.
Alternate PNGs, RTF text, and unrelated files are ignored.

The current imported metadata is:

| Movie                                | Duration in seconds | Video dimensions |
| ------------------------------------ | ------------------: | ---------------- |
| Sunday Intro                         |          254.287375 | 1920 × 1080      |
| Lakota Loop Halloween 2025 Rough Cut |         1087.530667 | 3840 × 2160      |

`src/catalog/sources.ts` holds the separate, explicit playback mapping:

| ID               | Development URL                     | Production HLS URL                                                         |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `sunday-intro`   | `/__local-media/sunday-intro.mp4`   | `https://stream.mux.com/I9ip5M7pvlHQ2wLFIJ6H3rLSg72QliatilZksyI2n5s.m3u8`  |
| `halloween-2025` | `/__local-media/halloween-2025.mp4` | `https://stream.mux.com/dDkIbyl402OA1QkR3CgEMVUQltsjzF1ulB4579ff7sB8.m3u8` |

The intro URL was supplied with this request; the user confirmed that the
pre-existing URL represents the Halloween rough cut. Both production mappings
are configured. Unknown IDs resolve to an unavailable source.

`scripts/local-media.js` has only a Vite `configureServer` hook. It serves those
two exact local MP4s for `GET` and `HEAD`, supports bounded/open-ended/suffix
single byte ranges for seeking, and rejects unknown IDs, arbitrary paths,
unsupported methods, and invalid ranges. It neither enables CORS nor exposes a
directory listing. Production builds and `vite preview` do not serve Desktop
files. Stop the development server when local preview is finished.

The unit tests create temporary controlled source directories; they do not read
the real publishing inputs. HTTP tests use real served bytes to check seek
responses. The importer tests exercise the real XML parser and file-copy command
with a deterministic substitute for the external `ffprobe` executable. Browser
decoding and fullscreen are covered separately by the Playwright media fixtures.
