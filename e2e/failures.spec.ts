/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, type Route, test } from "@playwright/test";

import { LibraryHarness } from "./LibraryHarness";

test("missing artwork leaves metadata, selection, and Play usable", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await page.route("**/*fanart.jpg", async (route: Route): Promise<void> => {
    await route.fulfill({
      status: 404,
      body: "Fixture: intentionally missing artwork",
    });
  });
  await library.open();
  await library.activate("halloween-2025", false);
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await library.ready("halloween-2025");
  await library.activate("halloween-2025", false);
  await library.playing(426);
  expect(library.errors).toEqual([]);
});

test("corrupt media exposes a retryable card and another movie remains playable", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await page.route(
    "**/__fixtures/halloween.*",
    async (route: Route): Promise<void> => {
      await route.fulfill({
        contentType: "video/mp4",
        body: "This is deliberately invalid media.",
      });
    },
  );
  await library.open();
  await library.activate("halloween-2025", false);
  await expect(
    library.card("halloween-2025").locator(".card-action"),
  ).toContainText("Retry");
  await expect(page.locator("#browse-screen")).toBeVisible();
  expect((await library.videoState()).paused).toBe(true);
  await library.activate("sunday-intro", false);
  await library.ready("sunday-intro");
  await library.activate("sunday-intro", false);
  await library.playing(320);
});

test("fault injection: fullscreen denial retains real native playback and a reachable Return", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  // This is explicitly a failure-injection test, not fullscreen success coverage.
  // Media bytes, decoder, play(), pause(), controls, and clocks remain real.
  await page.addInitScript((): void => {
    HTMLVideoElement.prototype.requestFullscreen = (): Promise<void> =>
      Promise.reject(new DOMException("Test denial", "NotAllowedError"));
    Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: undefined,
    });
  });
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  await library.activate("sunday-intro", false);
  await library.ready("sunday-intro");
  await library.activate("sunday-intro", false);
  await library.playing(320);
  expect((await library.videoState()).fullscreen).toBe(false);
  await expect(page.locator("#return-button")).toBeVisible();
  await expect(page.locator("#fullscreen-button")).toBeVisible();
  await page.locator("#return-button").click();
  await library.returned("sunday-intro");
});

test("late media preparation cannot replace a newer selection or start its audio", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  let releaseRequest: () => void = (): void => {};
  const requestGate: Promise<void> = new Promise(
    (resolve: () => void): void => {
      releaseRequest = resolve;
    },
  );
  await page.route(
    "**/__fixtures/intro.*",
    async (route: Route): Promise<void> => {
      await requestGate;
      await route.continue().catch((): void => {
        /* A canceled request is expected. */
      });
    },
  );
  try {
    await library.open();
    await library.activate("sunday-intro", false);
    await expect(
      library.card("sunday-intro").locator(".card-action"),
    ).toContainText("Preparing");
    await library.activate("halloween-2025", false);
    releaseRequest();
    await library.ready("halloween-2025");
    await expect(page.locator("#movie-title")).toHaveText(
      "Lakota Loop Halloween 2025 Rough Cut",
    );
    expect((await library.videoState()).paused).toBe(true);
    await library.activate("halloween-2025", false);
    await library.playing(426);
  } finally {
    releaseRequest();
  }
});
