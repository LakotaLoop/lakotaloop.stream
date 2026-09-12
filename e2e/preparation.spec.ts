/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, type Route, test } from "@playwright/test";

import { LibraryHarness, type VideoState } from "./LibraryHarness";

test("activating a preparing card never queues playback after its bytes arrive", async ({
  page,
  browserName,
  hasTouch,
}: {
  page: Page;
  browserName: string;
  hasTouch: boolean;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");

  // Delay actual fixture delivery at the network boundary. Playback, decoding,
  // fullscreen, and browser input remain real throughout this regression.
  let releaseMedia: () => void = (): void => {};
  const mediaGate: Promise<void> = new Promise((resolve: () => void): void => {
    releaseMedia = resolve;
  });
  await page.route(
    "**/__fixtures/intro.*",
    async (route: Route): Promise<void> => {
      await mediaGate;
      await route.continue().catch((): void => {
        // A failing assertion may close the browser while its request is pending.
      });
    },
  );

  try {
    await library.open();
    await page
      .locator("#video-player")
      .evaluate((video: HTMLVideoElement): void => {
        video.dataset.observedPlayEvents = "0";
        video.addEventListener("play", (): void => {
          video.dataset.observedPlayEvents = String(
            Number(video.dataset.observedPlayEvents) + 1,
          );
        });
      });
    await library.activate("sunday-intro", hasTouch);
    await expect(library.card("sunday-intro")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(
      library.card("sunday-intro").locator(".card-action"),
    ).toHaveText("Preparing…");

    // Neither a deliberate second tap/click nor Enter during preparation may
    // be stored and executed later, after the original user gesture has expired.
    await library.activate("sunday-intro", hasTouch);
    await page.keyboard.press("Enter");
    await expect(page.locator("#browse-screen")).toBeVisible();
    releaseMedia();
    await library.ready("sunday-intro");
    await expect(library.card("sunday-intro")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.locator("#browse-screen")).toBeVisible();
    await expect(page.locator("#player-screen")).toBeHidden();
    await expect(page.locator("#video-player")).toHaveAttribute(
      "data-observed-play-events",
      "0",
    );
    const preparedState: VideoState = await library.videoState();
    expect(preparedState.paused).toBe(true);
    expect(preparedState.currentTime).toBe(0);
    expect(preparedState.fullscreen).toBe(false);

    // The same movie is still usable: a new gesture starts decoded media once.
    await library.activate("sunday-intro", hasTouch);
    await library.playing(320);
    await expect(page.locator("#video-player")).toHaveAttribute(
      "data-observed-play-events",
      "1",
    );
    expect(library.errors).toEqual([]);
    expect(library.failedAssets).toEqual([]);
  } finally {
    releaseMedia();
  }
});
