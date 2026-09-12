/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, test } from "@playwright/test";

import { LibraryHarness } from "./LibraryHarness";

// The configuration includes this mandatory real-fullscreen/HLS suite in both
// Chromium projects. A failed fullscreen attempt fails; there is no skip/fallback
// escape hatch and no autoplay-permission browser flag.
test("Play enters actual video fullscreen and Shaka decodes the selected HLS stream", async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia("hls");
  await library.open();
  await library.select("sunday-intro", false);
  await library.ready("sunday-intro");
  await library.activate("sunday-intro", false);
  await expect
    .poll(async (): Promise<boolean> => (await library.videoState()).fullscreen)
    .toBe(true);
  await library.playing(320);
  expect((await library.videoState()).source).toMatch(/^blob:/);
  expect(library.mediaRequests).toContain(
    "https://stream.mux.com/I9ip5M7pvlHQ2wLFIJ6H3rLSg72QliatilZksyI2n5s.m3u8",
  );
  expect(
    library.mediaRequests.some((url: string): boolean =>
      url.includes("intro-hls/index.m3u8"),
    ),
  ).toBe(true);
  await page.evaluate(async (): Promise<void> => {
    await document.exitFullscreen();
  });
  await library.returned("sunday-intro");
  expect((await library.videoState()).fullscreen).toBe(false);

  await library.select("halloween-2025", false);
  await library.ready("halloween-2025");
  await library.activate("halloween-2025", false);
  await expect
    .poll(async (): Promise<boolean> => (await library.videoState()).fullscreen)
    .toBe(true);
  await library.playing(426);
  expect(library.mediaRequests).toContain(
    "https://stream.mux.com/dDkIbyl402OA1QkR3CgEMVUQltsjzF1ulB4579ff7sB8.m3u8",
  );
  await page.evaluate(async (): Promise<void> => {
    await document.exitFullscreen();
  });
  await library.returned("halloween-2025");
  expect(library.errors).toEqual([]);
  expect(library.failedAssets).toEqual([]);
});
