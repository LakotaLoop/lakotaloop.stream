/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, test } from "@playwright/test";

import { LibraryHarness } from "./LibraryHarness";

test("mouse hover selects and focuses a movie without playback, then one click plays it", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();

  // Genuine pointer movement must expose the same ready action as keyboard
  // focus; hovering itself never invokes the actual media or fullscreen APIs.
  await library.card("halloween-2025").hover();
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await library.ready("halloween-2025");
  await expect(page.locator("#browse-screen")).toBeVisible();
  expect((await library.videoState()).paused).toBe(true);
  expect((await library.videoState()).currentTime).toBe(0);
  expect((await library.videoState()).fullscreen).toBe(false);

  await library.activate("halloween-2025", false);
  await library.playing(426);
  expect(library.errors).toEqual([]);
});

test("a stationary mouse cannot undo keyboard selection or playback return, but reentering can select", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  await library.card("sunday-intro").hover();
  await expect(library.card("sunday-intro")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await library.ready("halloween-2025");
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  expect((await library.videoState()).paused).toBe(true);

  // Enter activates the keyboard-selected movie while the pointer remains over
  // the intro. Removing the video surface must restore that same selection.
  await page.keyboard.press("Enter");
  await library.playing(426);
  if ((await library.videoState()).fullscreen) {
    await page.evaluate(async (): Promise<void> => {
      await document.exitFullscreen();
    });
  } else {
    // Keyboard navigation keeps this case free from incidental mouse movement.
    await page.locator("#return-button").focus();
    await page.keyboard.press("Enter");
  }
  await library.returned("halloween-2025");
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );

  // A new physical movement away and back is a fresh hover selection; no timed
  // polling, synthetic pointer events, or application-private methods are used.
  await page.mouse.move(0, 0);
  await library.card("sunday-intro").hover();
  await expect(library.card("sunday-intro")).toBeFocused();
  await library.ready("sunday-intro");
  expect((await library.videoState()).paused).toBe(true);
  await page.keyboard.press("Enter");
  await library.playing(320);
  expect(library.errors).toEqual([]);
});
