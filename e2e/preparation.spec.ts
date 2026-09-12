/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import {
  expect,
  type Page,
  type Route,
  test,
  type TestInfo,
} from "@playwright/test";

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
    await library.select("sunday-intro", hasTouch);
    await expect(library.card("sunday-intro")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(
      library.card("sunday-intro").locator(".card-action"),
    ).toHaveText("Play");
    // A long preparation gains its own delayed indicator while the action label
    // remains stable. Observe the indicator rather than sleeping for its timer.
    await expect(
      library.card("sunday-intro").locator(".card-loading"),
    ).toBeVisible();

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
    await expect(
      library.card("sunday-intro").locator(".card-loading"),
    ).toBeHidden();
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

test("preparation notice waits before appearing and restarts its delay for a different source", async ({
  page,
  browserName,
  hasTouch,
}: {
  page: Page;
  browserName: string;
  hasTouch: boolean;
}, testInfo: TestInfo): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await page.setViewportSize({ width: 844, height: 390 });
  // Reduced motion must not bypass the separate JavaScript notice delay.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  // Control only JavaScript time while both real fixture responses are held.
  // Resume normal timers before letting Shaka complete actual media loading.
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  let releaseMedia: () => void = (): void => {};
  const mediaGate: Promise<void> = new Promise((resolve: () => void): void => {
    releaseMedia = resolve;
  });
  await page.route("**/__fixtures/*", async (route: Route): Promise<void> => {
    await mediaGate;
    await route.continue().catch((): void => {
      // Switching sources can legitimately cancel a held request.
    });
  });

  try {
    await library.open();
    await library.select("halloween-2025", hasTouch);
    await expect(library.card("halloween-2025")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(
      library.card("halloween-2025").locator(".card-action"),
    ).toHaveText("Play");
    await expect(
      library.card("halloween-2025").locator(".card-loading"),
    ).toBeHidden();
    await page.clock.runFor(399);
    await expect(
      library.card("halloween-2025").locator(".card-loading"),
    ).toBeHidden();
    await page.clock.runFor(1);
    await expect(
      library.card("halloween-2025").locator(".card-loading"),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("delayed-loading-notice.png"),
    });

    // An already visible notice belongs to its source. Hovering/tapping another
    // movie must start a new quiet interval, not carry the old source's flag.
    await library.select("sunday-intro", hasTouch);
    await expect(library.card("sunday-intro")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(
      library.card("halloween-2025").locator(".card-loading"),
    ).toBeHidden();
    await expect(
      library.card("sunday-intro").locator(".card-loading"),
    ).toBeHidden();
    await page.clock.runFor(399);
    await expect(
      library.card("sunday-intro").locator(".card-loading"),
    ).toBeHidden();
    await page.clock.runFor(1);
    await expect(
      library.card("sunday-intro").locator(".card-loading"),
    ).toBeVisible();

    releaseMedia();
    await page.clock.resume();
    await library.ready("sunday-intro");
    await expect(
      library.card("sunday-intro").locator(".card-loading"),
    ).toBeHidden();
    await expect(page.locator("#browse-screen")).toBeVisible();
    expect((await library.videoState()).paused).toBe(true);
    expect((await library.videoState()).width).toBe(320);
    expect(library.errors).toEqual([]);
  } finally {
    releaseMedia();
    await page.clock.resume();
  }
});
