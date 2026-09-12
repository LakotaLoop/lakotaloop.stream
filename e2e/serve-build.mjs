/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const fixtureDirectory = fileURLToPath(new URL("./fixtures/", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".m4s": "video/iso.segment",
  ".webm": "video/webm",
  ".m3u8": "application/vnd.apple.mpegurl",
};

// This test-only server exposes dist and tiny committed fixtures, never Desktop
// or the user's full movies. Single ranges preserve real browser media seeking.
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname,
    );
    const isFixture = pathname.startsWith("/__fixtures/");
    const directory = isFixture ? fixtureDirectory : rootDirectory;
    const relativePath = isFixture
      ? pathname.slice("/__fixtures/".length)
      : pathname.slice(1);
    const filename = resolve(directory, relativePath || "index.html");
    if (
      !filename.startsWith(resolve(directory) + sep) ||
      !["GET", "HEAD"].includes(request.method)
    ) {
      response.writeHead(403).end();
      return;
    }
    const fileStats = await stat(filename);
    if (!fileStats.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const headers = {
      "Content-Type":
        contentTypes[extname(filename)] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    };
    let start = 0;
    let end = fileStats.size - 1;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response
          .writeHead(416, { "Content-Range": `bytes */${fileStats.size}` })
          .end();
        return;
      }
      if (!match[1]) {
        start = Math.max(0, fileStats.size - Number(match[2]));
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (start > end || start >= fileStats.size) {
        response
          .writeHead(416, { "Content-Range": `bytes */${fileStats.size}` })
          .end();
        return;
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${fileStats.size}`;
    }
    headers["Content-Length"] = end - start + 1;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD") {
      response.end();
    } else {
      createReadStream(filename, { start, end }).pipe(response);
    }
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(4175, "127.0.0.1");
