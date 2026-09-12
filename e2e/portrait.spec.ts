/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, test, type TestInfo } from "@playwright/test";

import { LibraryHarness } from "./LibraryHarness";

// Include a short viewport to leave room for phone browser and system chrome.
// These are browser layout checks, not claims of testing physical Android phones.
const portraitViewports: ReadonlyArray<{ width: number; height: number }> = [
  { width: 412, height: 700 },
  { width: 360, height: 640 },
];
portraitViewports.forEach(
  (viewport: { width: number; height: number }): void => {
    test(`portrait movie cards fit before scrolling at ${viewport.width}x${viewport.height}`, async ({
      page,
      browserName,
      hasTouch,
    }: {
      page: Page;
      browserName: string;
      hasTouch: boolean;
    }, testInfo: TestInfo): Promise<void> => {
      await page.setViewportSize(viewport);
      const library: LibraryHarness = new LibraryHarness(page);
      await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
      await library.open();

      // Check before clicking: Playwright's automatic scroll could otherwise hide
      // a regression that pushes the artwork or its movie title below the fold.
      await expect(library.card("sunday-intro")).toBeInViewport({ ratio: 1 });
      await expect(library.card("halloween-2025")).toBeInViewport({ ratio: 1 });
      const initialTop: number = await library
        .card("sunday-intro")
        .evaluate(
          (card: HTMLElement): number => card.getBoundingClientRect().top,
        );
      let movieId: string;
      for (movieId of ["halloween-2025", "sunday-intro"]) {
        await library.select(movieId, hasTouch);
        await library.ready(movieId);
        await expect(library.card("sunday-intro")).toBeInViewport({ ratio: 1 });
        await expect(library.card("halloween-2025")).toBeInViewport({
          ratio: 1,
        });
        expect(await page.evaluate((): number => window.scrollY)).toBe(0);
        const selectedTop: number = await library
          .card("sunday-intro")
          .evaluate(
            (card: HTMLElement): number => card.getBoundingClientRect().top,
          );
        expect(Math.abs(selectedTop - initialTop)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath(`${movieId}.png`) });
      }
      expect(library.errors).toEqual([]);
    });
  },
);
