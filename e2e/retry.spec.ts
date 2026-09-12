/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, type Route, test } from "@playwright/test";

import { LibraryHarness, type VideoState } from "./LibraryHarness";

test("retry prepares the same failed movie without playing until a fresh Play action", async ({
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

  // Fail only the selected movie's network bytes. Removing this handler later
  // restores the real committed fixture without changing any player methods.
  const corruptMedia: (errRoute: Route) => Promise<void> = async (
    route: Route,
  ): Promise<void> => {
    await route.fulfill({
      contentType: "video/mp4",
      body: "Intentional corrupt-media fixture for retry coverage.",
    });
  };
  await page.route("**/__fixtures/halloween.*", corruptMedia);
  await library.open();

  // Observe native play events so even a transient unsolicited start during
  // retry fails the test. The actual media APIs and events remain untouched.
  await page
    .locator("#video-player")
    .evaluate((video: HTMLVideoElement): void => {
      video.dataset.retryPlayEvents = "0";
      video.addEventListener("play", (): void => {
        video.dataset.retryPlayEvents = String(
          Number(video.dataset.retryPlayEvents) + 1,
        );
      });
    });

  await library.select("halloween-2025", hasTouch);
  await expect(
    library.card("halloween-2025").locator(".card-action"),
  ).toHaveText("Retry");
  await expect(page.locator("#browse-screen")).toBeVisible();
  await expect(page.locator("#player-screen")).toBeHidden();

  // Retry repairs preparation for this selection; it must not reuse the retry
  // gesture to start playback or request fullscreen after loading completes.
  await page.unroute("**/__fixtures/halloween.*", corruptMedia);
  await library.activate("halloween-2025", hasTouch);
  await library.ready("halloween-2025");
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await expect(library.card("halloween-2025")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#browse-screen")).toBeVisible();
  await expect(page.locator("#player-screen")).toBeHidden();
  await expect(page.locator("#video-player")).toHaveAttribute(
    "data-retry-play-events",
    "0",
  );
  const preparedState: VideoState = await library.videoState();
  expect(preparedState.paused).toBe(true);
  expect(preparedState.currentTime).toBe(0);
  expect(preparedState.fullscreen).toBe(false);

  // Only this new real click/tap may start the repaired source. Its distinct
  // decoded width proves that retry did not silently switch to the intro.
  await library.activate("halloween-2025", hasTouch);
  await library.playing(426);
  await expect(page.locator("#video-player")).toHaveAttribute(
    "data-retry-play-events",
    "1",
  );
  expect(library.errors).toEqual([]);
});
