/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalMediaPlugin } from "../scripts/local-media.js";

/** The HTTP boundary serves real bytes; the fixture is not a playable movie. */
describe("development media HTTP serving", (): void => {
  let sourceRoot: string;
  let server: ViteDevServer;
  let origin: string;

  beforeAll(async (): Promise<void> => {
    sourceRoot = await mkdtemp(join(tmpdir(), "lakotaloop-media-"));
    const directory: string = join(sourceRoot, "Lakota Loop Intro Video");
    await mkdir(directory);
    await writeFile(join(directory, "LL Intro.mp4"), "0123456789");
    server = await createServer({
      configFile: false,
      plugins: [createLocalMediaPlugin(sourceRoot)],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address: AddressInfo = server.httpServer!.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async (): Promise<void> => {
    await server?.close();
    if (sourceRoot) {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it("serves the explicitly mapped file and HEAD without a body", async (): Promise<void> => {
    const response: Response = await globalThis.fetch(
      `${origin}/__local-media/sunday-intro.mp4`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(await response.text()).toBe("0123456789");

    const head: Response = await globalThis.fetch(
      `${origin}/__local-media/sunday-intro.mp4`,
      {
        method: "HEAD",
      },
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("10");
    expect(await head.text()).toBe("");
  });

  it.each([
    ["bytes=2-5", "2345", "bytes 2-5/10"],
    ["bytes=7-", "789", "bytes 7-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=-50", "0123456789", "bytes 0-9/10"],
    ["bytes=8-99", "89", "bytes 8-9/10"],
  ])(
    "supports a seek range %s",
    async (
      range: string,
      body: string,
      contentRange: string,
    ): Promise<void> => {
      const response: Response = await globalThis.fetch(
        `${origin}/__local-media/sunday-intro.mp4`,
        {
          headers: { Range: range },
        },
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe(contentRange);
      expect(response.headers.get("content-length")).toBe(String(body.length));
      expect(await response.text()).toBe(body);
    },
  );

  it.each([
    "bytes=10-",
    "bytes=8-2",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,4-5",
    "bytes=9007199254740992-",
    "items=0-1",
  ])(
    "rejects invalid or unsatisfiable ranges %s",
    async (range: string): Promise<void> => {
      const response: Response = await globalThis.fetch(
        `${origin}/__local-media/sunday-intro.mp4`,
        {
          headers: { Range: range },
        },
      );
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */10");
    },
  );

  it("does not expose paths, alternate basenames, or missing movies", async (): Promise<void> => {
    const paths: readonly string[] = [
      "unknown.mp4",
      "%2e%2e%2fpackage.json",
      "sunday-intro.mp4/extra",
      "halloween-2025.mp4",
    ];
    for (let index: number = 0; index < paths.length; index += 1) {
      const path: string = paths[index];
      const response: Response = await globalThis.fetch(
        `${origin}/__local-media/${path}`,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(sourceRoot);
    }
    const response: Response = await globalThis.fetch(
      `${origin}/__local-media/sunday-intro.mp4`,
      {
        method: "POST",
      },
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});
