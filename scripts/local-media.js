/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * @brief Parse one HTTP byte range; malformed/multipart ranges are rejected.
 * @param {string} header Raw Range header.
 * @param {number} size Actual file length.
 * @return {{start: number, end: number} | null} Inclusive bounds or no valid range.
 */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) {
    return null;
  }
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) {
    return null;
  }
  if (!match[1]) {
    return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
  }
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && end >= first ? { start: first, end } : null;
}

/**
 * @brief Expose only two explicitly mapped files during Vite development.
 *
 * No production or preview hook exists. Requests never supply filesystem paths,
 * and this module is build tooling, never part of deployed browser resources.
 * @param {string} sourceRoot Publishing root; override only for fixture tests.
 * @return {import("vite").Plugin} Development-only media middleware plugin.
 */
export function createLocalMediaPlugin(
  sourceRoot = join(homedir(), "Desktop/_PUBLISH/lakotaloop.stream"),
) {
  const sources = new Map([
    [
      "/__local-media/sunday-intro.mp4",
      join(sourceRoot, "Lakota Loop Intro Video", "LL Intro.mp4"),
    ],
    [
      "/__local-media/halloween-2025.mp4",
      join(
        sourceRoot,
        "Lakota Loop Halloween 2025 Rough Cut",
        "HALLOWEEN_2025_LakotaLoop_92_Rough-Cut-1.mp4",
      ),
    ],
  ]);

  return {
    name: "lakotaloop-local-media",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = (request.url || "").split("?")[0];
        if (!pathname.startsWith("/__local-media/")) {
          next();
          return;
        }
        const source = sources.get(pathname);
        if (!source) {
          response.writeHead(404).end("Movie not found");
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" }).end();
          return;
        }

        // Opening the exact allowlisted file first ensures stat/stream share
        // one descriptor and every early return can close that descriptor.
        let file;
        try {
          file = await open(source, "r");
          const stats = await file.stat();
          if (!stats.isFile()) {
            await file.close();
            response.writeHead(404).end("Local movie unavailable");
            return;
          }
          const range = request.headers.range
            ? parseRange(request.headers.range, stats.size)
            : undefined;
          if (range === null) {
            await file.close();
            response
              .writeHead(416, { "Content-Range": `bytes */${stats.size}` })
              .end();
            return;
          }
          const headers = {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
            "Content-Length": range ? range.end - range.start + 1 : stats.size,
          };
          if (range) {
            headers["Content-Range"] =
              `bytes ${range.start}-${range.end}/${stats.size}`;
          }
          response.writeHead(range ? 206 : 200, headers);
          if (request.method === "HEAD" || stats.size === 0) {
            await file.close();
            response.end();
            return;
          }
          const stream = file.createReadStream(range || {});
          // Browser seeks frequently cancel requests; destroy closes the file
          // without reporting a canceled transfer as a new application error.
          response.on("close", () => stream.destroy());
          stream.on("error", () => response.destroy());
          stream.pipe(response);
        } catch {
          await file?.close().catch(() => {});
          if (!response.headersSent) {
            response.writeHead(404).end("Local movie unavailable");
          } else {
            response.destroy();
          }
        }
      });
    },
  };
}
