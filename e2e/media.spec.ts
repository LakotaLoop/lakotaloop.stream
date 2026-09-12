/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, test } from "@playwright/test";

import { LibraryHarness, type VideoState } from "./LibraryHarness";

test("real decoded media pauses, resumes, seeks, ends, and replays the selected movie", async ({
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
  await library.open();
  await library.activate("halloween-2025", hasTouch);
  await library.ready("halloween-2025");
  await library.activate("halloween-2025", hasTouch);
  await library.playing(426);

  // These invoke the real native media APIs, without replacing their methods,
  // state, timers, or events. The app must not treat an ordinary pause as stop.
  await page
    .locator("#video-player")
    .evaluate((video: HTMLVideoElement): void => {
      video.pause();
    });
  expect((await library.videoState()).paused).toBe(true);
  await expect(page.locator("#player-screen")).toBeVisible();
  const pausedTime: number = (await library.videoState()).currentTime;
  await page
    .locator("#video-player")
    .evaluate(async (video: HTMLVideoElement): Promise<void> => {
      await video.play();
    });
  await expect
    .poll(async (): Promise<number> => (await library.videoState()).currentTime)
    .toBeGreaterThan(pausedTime + 0.15);
  await page
    .locator("#video-player")
    .evaluate((video: HTMLVideoElement): void => {
      video.currentTime = 4;
    });
  await expect
    .poll(async (): Promise<number> => (await library.videoState()).currentTime)
    .toBeGreaterThanOrEqual(4);
  await expect(page.locator("#player-screen")).toBeVisible();

  // No synthetic ended event: the seven-second fixture reaches its real end.
  await library.returned("halloween-2025");
  await library.ready("halloween-2025");
  await library.activate("halloween-2025", hasTouch);
  await library.playing(426);
  expect((await library.videoState()).currentTime).toBeLessThan(3);

  // The visible Return control is reachable in native-controls fallback. In an
  // established fullscreen session the real platform API supplies the exit.
  if ((await library.videoState()).fullscreen) {
    await page.evaluate(async (): Promise<void> => {
      await document.exitFullscreen();
    });
  } else {
    await page.locator("#return-button").click();
  }
  await library.returned("halloween-2025");
  await library.activate("sunday-intro", hasTouch);
  await library.ready("sunday-intro");
  await library.activate("sunday-intro", hasTouch);
  await library.playing(320);
  expect(library.errors).toEqual([]);
});

test("keyboard activation is singular and playback keys cannot move the hidden shelf", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  await library.card("sunday-intro").focus();
  await library.ready("sunday-intro");
  // Observe native events without wrapping or replacing the media methods.
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
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await library.playing(320);
  // A repeated activation must not stop/start another session or add a video.
  await expect(page.locator("#video-player")).toHaveAttribute(
    "data-observed-play-events",
    "1",
  );
  await expect(page.locator("video")).toHaveCount(1);
  const state: VideoState = await library.videoState();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#movie-title")).toHaveText("Sunday Intro");
  await expect
    .poll(async (): Promise<number> => (await library.videoState()).currentTime)
    .toBeGreaterThan(state.currentTime);
  if ((await library.videoState()).fullscreen) {
    await page.evaluate(async (): Promise<void> => {
      await document.exitFullscreen();
    });
  } else {
    await page.locator("#return-button").click();
  }
  await library.returned("sunday-intro");
  await library.ready("sunday-intro");
  await page.keyboard.press("Space");
  await library.playing(320);
});
