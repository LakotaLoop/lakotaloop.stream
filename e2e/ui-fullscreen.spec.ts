/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Locator, type Page, test } from "@playwright/test";

import { LibraryHarness, type VideoState } from "./LibraryHarness";

/** @brief Scoped fault-injection hook that releases a delayed native promise. */
type ControlledFullscreenRoot = HTMLElement & {
  releaseFullscreenForTest?: () => void;
};

/** @brief Require actual document-root fullscreen, never an application CSS state. */
async function expectBrowseFullscreen(
  page: Page,
  entered: boolean,
): Promise<void> {
  await expect
    .poll(async (): Promise<boolean> =>
      page.evaluate(
        (): boolean => document.fullscreenElement === document.documentElement,
      ),
    )
    .toBe(entered);
}

test("studio icon toggles real browsing fullscreen without joining keyboard navigation", async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia("mp4");
  await library.open();
  const studioIcon: Locator = page.locator(".studio-icon");

  // The shortcut is deliberately pointer-only. Normal shelf Tab/arrow traversal
  // remains native and must never send the remote's focus to the studio icon.
  await expect(studioIcon).toHaveAttribute("tabindex", "-1");
  await expect(studioIcon).toHaveAccessibleName(/fullscreen/i);
  await library.card("sunday-intro").focus();
  await page.keyboard.press("Tab");
  await expect(library.card("halloween-2025")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(studioIcon).not.toBeFocused();
  await library.card("sunday-intro").focus();
  await page.keyboard.press("ArrowRight");
  await expect(library.card("halloween-2025")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(library.card("halloween-2025")).toBeFocused();
  await library.ready("halloween-2025");

  // In short landscape layouts the exposed icon shares the shelf's broad
  // bounding box. Empty shelf space must not intercept the actual icon click.
  await page.setViewportSize({ width: 844, height: 390 });
  await studioIcon.click();
  await expectBrowseFullscreen(page, true);
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await expect(page.locator("#browse-screen")).toBeVisible();
  await expect(page.locator("#player-screen")).toBeHidden();
  const fullscreenState: VideoState = await library.videoState();
  expect(fullscreenState.paused).toBe(true);
  expect(fullscreenState.currentTime).toBe(0);

  await studioIcon.click();
  await expect
    .poll(async (): Promise<boolean> =>
      page.evaluate((): boolean => document.fullscreenElement === null),
    )
    .toBe(true);
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  expect((await library.videoState()).paused).toBe(true);
  expect(library.errors).toEqual([]);
});

test.describe("touch browsing fullscreen", (): void => {
  // This is a real touchscreen event stream in the Chromium projects; no tap
  // is synthesized through page.evaluate and no fullscreen method is replaced.
  test.use({ hasTouch: true, viewport: { width: 412, height: 700 } });

  test("a touch tap toggles the document root while preserving the selected movie", async ({
    page,
  }: {
    page: Page;
  }): Promise<void> => {
    const library: LibraryHarness = new LibraryHarness(page);
    await library.routeMedia("mp4");
    await library.open();
    await library.select("halloween-2025", true);
    await library.ready("halloween-2025");
    const studioIcon: Locator = page.locator(".studio-icon");
    await studioIcon.tap();
    await expectBrowseFullscreen(page, true);
    await expect(studioIcon).toHaveAttribute("aria-pressed", "true");
    await expect(library.card("halloween-2025")).toBeFocused();
    expect((await library.videoState()).paused).toBe(true);
    await studioIcon.tap();
    await expect
      .poll(async (): Promise<boolean> =>
        page.evaluate((): boolean => document.fullscreenElement === null),
      )
      .toBe(true);
    await expect(studioIcon).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#movie-title")).toHaveText(
      "Lakota Loop Halloween 2025 Rough Cut",
    );
    await expect(library.card("halloween-2025")).toBeFocused();
    expect((await library.videoState()).paused).toBe(true);
    expect(library.errors).toEqual([]);
  });
});

test("browsing fullscreen hands off to real video fullscreen and the icon works after return", async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia("mp4");
  await library.open();
  await library.select("halloween-2025", false);
  await library.ready("halloween-2025");
  const studioIcon: Locator = page.locator(".studio-icon");
  await studioIcon.click();
  await expectBrowseFullscreen(page, true);

  await library.activate("halloween-2025", false);
  await expect
    .poll(async (): Promise<boolean> => (await library.videoState()).fullscreen)
    .toBe(true);
  await library.playing(426);
  await page.evaluate(async (): Promise<void> => {
    await document.exitFullscreen();
  });
  await library.returned("halloween-2025");
  await expect(studioIcon).toBeVisible();

  // Browsers may restore the document's fullscreen layer or exit the whole
  // stack. In either case the next click must toggle the current actual state.
  const browsingStillFullscreen: boolean = await page.evaluate(
    (): boolean => document.fullscreenElement === document.documentElement,
  );
  await studioIcon.click();
  await expectBrowseFullscreen(page, !browsingStillFullscreen);
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  expect((await library.videoState()).paused).toBe(true);
  expect(library.errors).toEqual([]);
});

test("fault injection: denied browsing fullscreen leaves the icon usable for a fresh retry", async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia("mp4");
  await library.open();
  await library.card("sunday-intro").focus();
  await library.ready("sunday-intro");
  const studioIcon: Locator = page.locator(".studio-icon");

  // Only this dedicated failure test replaces fullscreen entry. The success
  // tests above and the retry below always invoke the real browser API.
  await page.evaluate((): void => {
    document.documentElement.requestFullscreen = (): Promise<void> =>
      Promise.reject(
        new DOMException(
          "Intentional browsing fullscreen denial",
          "NotAllowedError",
        ),
      );
  });
  await studioIcon.click();
  await expectBrowseFullscreen(page, false);
  await expect(studioIcon).toHaveAttribute("aria-pressed", "false");
  await expect(studioIcon).toBeEnabled();
  await expect(library.card("sunday-intro")).toBeFocused();
  await expect(page.locator("#browse-screen")).toBeVisible();
  expect((await library.videoState()).paused).toBe(true);

  await page.evaluate((): void => {
    // Remove the own-property injection, exposing the unchanged native method.
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  });
  await studioIcon.click();
  await expectBrowseFullscreen(page, true);
  await expect(studioIcon).toHaveAttribute("aria-pressed", "true");
  await expect(library.card("sunday-intro")).toBeFocused();
  expect((await library.videoState()).paused).toBe(true);
  expect(library.errors).toEqual([]);
});

test("fault injection: pending browsing fullscreen requires a fresh Play after settlement", async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia("mp4");
  await library.open();
  await library.select("halloween-2025", false);
  await library.ready("halloween-2025");
  const studioIcon: Locator = page.locator(".studio-icon");

  await page.evaluate((): void => {
    const root: ControlledFullscreenRoot = document.documentElement;
    const nativeRequest: () => Promise<void> =
      root.requestFullscreen.bind(root);
    const settlementGate: Promise<void> = new Promise(
      (resolve: () => void): void => {
        root.releaseFullscreenForTest = resolve;
      },
    );
    // Enter real fullscreen using the original gesture; only promise settlement
    // is held. The video's requestFullscreen/play/pause methods are untouched.
    root.requestFullscreen = async (): Promise<void> => {
      await nativeRequest();
      await settlementGate;
    };
    const video: HTMLVideoElement = document.querySelector("#video-player")!;
    video.dataset.pendingFullscreenPlayEvents = "0";
    video.addEventListener("play", (): void => {
      video.dataset.pendingFullscreenPlayEvents = String(
        Number(video.dataset.pendingFullscreenPlayEvents) + 1,
      );
    });
  });

  try {
    await studioIcon.click();
    await expectBrowseFullscreen(page, true);
    await expect(studioIcon).toHaveAttribute("aria-busy", "true");
    await library.activate("halloween-2025", false);
    await expect(page.locator("#browse-screen")).toBeVisible();
    await expect(page.locator("#player-screen")).toBeHidden();
    await expect(page.locator("#video-player")).toHaveAttribute(
      "data-pending-fullscreen-play-events",
      "0",
    );
    expect((await library.videoState()).paused).toBe(true);

    await page.evaluate((): void => {
      const root: ControlledFullscreenRoot = document.documentElement;
      root.releaseFullscreenForTest!();
      Reflect.deleteProperty(root, "requestFullscreen");
    });
    await expect(studioIcon).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("#video-player")).toHaveAttribute(
      "data-pending-fullscreen-play-events",
      "0",
    );
    expect((await library.videoState()).paused).toBe(true);

    // The earlier Play is never queued. A new native click is the only action
    // allowed to hand over to video fullscreen and decoded movie playback.
    await library.activate("halloween-2025", false);
    await expect
      .poll(
        async (): Promise<boolean> => (await library.videoState()).fullscreen,
      )
      .toBe(true);
    await library.playing(426);
    await expect(page.locator("#video-player")).toHaveAttribute(
      "data-pending-fullscreen-play-events",
      "1",
    );
    expect(library.errors).toEqual([]);
  } finally {
    await page.evaluate((): void => {
      const root: ControlledFullscreenRoot = document.documentElement;
      root.releaseFullscreenForTest?.();
      Reflect.deleteProperty(root, "releaseFullscreenForTest");
      Reflect.deleteProperty(root, "requestFullscreen");
    });
  }
});
