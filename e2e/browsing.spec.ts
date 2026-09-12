/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import process from "node:process";

import { expect, type Page, test, type TestInfo } from "@playwright/test";

import { LibraryHarness, type VideoState } from "./LibraryHarness";

test("startup has real metadata, paired artwork, and no automatic playback", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  await expect(page.locator("#movie-title")).toHaveText("Sunday Intro");
  await expect(page.locator("#movie-tagline")).toHaveText("Thank you!");
  await expect(page.locator("#movie-plot")).toHaveJSProperty(
    "textContent",
    "99 hard-working actors. We appreciate your hard, amazing work.",
  );
  await expect(library.card("sunday-intro")).toHaveAccessibleName(
    "Select Sunday Intro",
  );
  await expect(library.card("halloween-2025")).toHaveAccessibleName(
    "Select Lakota Loop Halloween 2025 Rough Cut",
  );
  await expect(page.locator("#player-screen")).toBeHidden();
  const state: VideoState = await library.videoState();
  expect(state.paused).toBe(true);
  expect(state.currentTime).toBe(0);
  expect(state.fullscreen).toBe(false);
  expect(
    library.mediaRequests.some((url: string): boolean =>
      url.includes("halloween"),
    ),
  ).toBe(false);
  await expect
    .poll(async (): Promise<boolean> =>
      page
        .locator("img")
        .evaluateAll((images: HTMLImageElement[]): boolean =>
          images.every(
            (image: HTMLImageElement): boolean =>
              image.complete && image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await expect(library.card("sunday-intro").locator("img")).toHaveAttribute(
    "src",
    /sunday-intro.*LL%20Intro-landscape\.jpg|sunday-intro.*LL Intro-landscape\.jpg/,
  );
  await expect(library.card("halloween-2025").locator("img")).toHaveAttribute(
    "src",
    /halloween-2025.*HALLOWEEN_2025_LakotaLoop_92_Rough-Cut-1-landscape\.jpg/,
  );
  await expect(
    page.locator('#hero-artwork img[data-movie-id="sunday-intro"]'),
  ).toHaveAttribute("src", "/movies/sunday-intro/LL Intro-fanart.jpg");
  await expect(
    page.locator('#hero-artwork img[data-movie-id="halloween-2025"]'),
  ).toHaveAttribute(
    "src",
    "/movies/halloween-2025/HALLOWEEN_2025_LakotaLoop_92_Rough-Cut-1-fanart.jpg",
  );
  await expect(
    page.locator('#hero-artwork img[data-movie-id="sunday-intro"]'),
  ).toHaveClass(/\bis-selected\b/);
  await expect(
    page.locator('#hero-artwork img[data-movie-id="halloween-2025"]'),
  ).not.toHaveClass(/\bis-selected\b/);
  expect(library.errors).toEqual([]);
  expect(library.failedAssets).toEqual([]);
});

test("first pointer/touch activation selects; second deliberate activation plays the correct source", async ({
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
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await expect(page.locator("#movie-tagline")).toBeHidden();
  await expect(page.locator("#movie-plot")).toHaveText(
    "Preliminary cut for review purposes.",
  );
  expect((await library.videoState()).paused).toBe(true);
  await expect(page.locator("#browse-screen")).toBeVisible();
  await library.ready("halloween-2025");
  await library.activate("halloween-2025", hasTouch);
  await library.playing(426);
});

test("initial preview also needs selection before play, and fast selection keeps hero paired", async ({
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
  await library.activate("sunday-intro", hasTouch);
  await expect(page.locator("#browse-screen")).toBeVisible();
  expect((await library.videoState()).paused).toBe(true);
  await library.activate("halloween-2025", hasTouch);
  await library.activate("sunday-intro", hasTouch);
  await library.activate("halloween-2025", hasTouch);
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await expect(
    page.locator('#hero-artwork img[data-movie-id="halloween-2025"]'),
  ).toBeVisible();
  await expect(
    page.locator('#hero-artwork img[data-movie-id="halloween-2025"]'),
  ).toHaveClass(/\bis-selected\b/);
  await expect(
    page.locator('#hero-artwork img[data-movie-id="sunday-intro"]'),
  ).not.toHaveClass(/\bis-selected\b/);
  await library.ready("halloween-2025");
  expect((await library.videoState()).paused).toBe(true);
  await library.activate("halloween-2025", hasTouch);
  await library.playing(426);
  expect(library.errors).toEqual([]);
});

test("arrows synchronize real focus with selection and clamp the two-card shelf", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  await page.keyboard.press("ArrowRight");
  // The first directional input adopts the first card when no card has focus.
  await expect(page.locator(".movie-card:focus")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  await page.keyboard.press("ArrowRight");
  await expect(library.card("halloween-2025")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(library.card("sunday-intro")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(library.card("sunday-intro")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(library.card("sunday-intro")).toBeFocused();
  // macOS WebKit follows Safari's native Option-Tab preference for buttons.
  // Do not make the app hijack Tab to compensate for an OS/browser setting.
  const tabModifier: string =
    browserName === "webkit" && process.platform === "darwin" ? "Alt+" : "";
  await page.keyboard.press(`${tabModifier}Tab`);
  await expect(library.card("halloween-2025")).toBeFocused();
  await page.keyboard.press(`${tabModifier}Shift+Tab`);
  await expect(library.card("sunday-intro")).toBeFocused();
  await library.ready("sunday-intro");
  await page.keyboard.press("Enter");
  await library.playing(320);
});

test("both selected layouts are readable, stable, and respect reduced motion", async ({
  page,
  browserName,
  hasTouch,
}: {
  page: Page;
  browserName: string;
  hasTouch: boolean;
}, testInfo: TestInfo): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  const shelfPositions: number[] = [];
  let movieId: string;
  for (movieId of ["sunday-intro", "halloween-2025"]) {
    await library.activate(movieId, hasTouch);
    await library.ready(movieId);
    const geometry: {
      shelfTop: number;
      overflowing: boolean;
      clippedTitle: boolean;
      cardWidth: number;
      artworkTopGap: number;
      clippedFocusOutline: boolean;
    } = await page.evaluate(
      (): {
        shelfTop: number;
        overflowing: boolean;
        clippedTitle: boolean;
        cardWidth: number;
        artworkTopGap: number;
        clippedFocusOutline: boolean;
      } => {
        const title: HTMLElement = document.querySelector("#movie-title")!;
        const card: HTMLElement = document.querySelector(".movie-card")!;
        const artwork: HTMLElement[] = Array.from(
          document.querySelectorAll(".card-artwork"),
        );
        const selectedArtwork: HTMLElement = document.querySelector(
          ".movie-card.is-selected .card-artwork",
        )!;
        const selectedRectangle: DOMRect =
          selectedArtwork.getBoundingClientRect();
        const shelfRectangle: DOMRect = document
          .querySelector("#movie-shelf")!
          .getBoundingClientRect();
        const focusWidth: number = Number.parseFloat(
          window
            .getComputedStyle(selectedArtwork)
            .getPropertyValue("--focus-width"),
        );
        return {
          shelfTop: card.getBoundingClientRect().top + window.scrollY,
          overflowing: document.documentElement.scrollWidth > window.innerWidth,
          clippedTitle: title.scrollHeight > title.clientHeight + 1,
          cardWidth: card.getBoundingClientRect().width,
          artworkTopGap: Math.abs(
            artwork[0].getBoundingClientRect().top -
              artwork[1].getBoundingClientRect().top,
          ),
          // The visible shadow extends beyond the image rectangle. Every side
          // must stay inside the overflow container, including the last card.
          clippedFocusOutline:
            selectedRectangle.left - focusWidth < shelfRectangle.left - 0.5 ||
            selectedRectangle.right + focusWidth > shelfRectangle.right + 0.5 ||
            selectedRectangle.top - focusWidth < shelfRectangle.top - 0.5 ||
            selectedRectangle.bottom + focusWidth > shelfRectangle.bottom + 0.5,
        };
      },
    );
    expect(geometry.overflowing).toBe(false);
    expect(geometry.clippedTitle).toBe(false);
    expect(geometry.cardWidth).toBeGreaterThanOrEqual(140);
    expect(geometry.artworkTopGap).toBeLessThanOrEqual(1);
    expect(geometry.clippedFocusOutline).toBe(false);
    shelfPositions.push(geometry.shelfTop);
    await page.screenshot({
      path: testInfo.outputPath(`${movieId}.png`),
      fullPage: true,
    });
  }
  expect(Math.abs(shelfPositions[0] - shelfPositions[1])).toBeLessThanOrEqual(
    1,
  );
  if (browserName === "chromium") {
    await page.setViewportSize({ width: 820, height: 1180 });
    await library.activate("sunday-intro", false);
    const firstTop: number = await library
      .card("sunday-intro")
      .evaluate(
        (card: HTMLElement): number =>
          card.getBoundingClientRect().top + window.scrollY,
      );
    await library.activate("halloween-2025", false);
    const secondTop: number = await library
      .card("sunday-intro")
      .evaluate(
        (card: HTMLElement): number =>
          card.getBoundingClientRect().top + window.scrollY,
      );
    expect(Math.abs(firstTop - secondTop)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("tablet-halloween.png"),
      fullPage: true,
    });
  }
});

test("modified browser shortcut arrows remain unconsumed by shelf navigation", async ({
  page,
  browserName,
}: {
  page: Page;
  browserName: string;
}): Promise<void> => {
  const library: LibraryHarness = new LibraryHarness(page);
  await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
  await library.open();
  await page.keyboard.press("ArrowLeft");
  await library.ready("sunday-intro");
  // Observe the real key after the application listener runs; do not dispatch
  // synthetic events or replace the browser's default shortcut implementation.
  await page.evaluate((): void => {
    document.addEventListener("keydown", (event: KeyboardEvent): void => {
      if (event.altKey && event.key === "ArrowRight") {
        document.body.dataset.shortcutPrevented = String(
          event.defaultPrevented,
        );
      }
    });
  });
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator("body")).toHaveAttribute(
    "data-shortcut-prevented",
    "false",
  );
  await expect(page.locator("#movie-title")).toHaveText("Sunday Intro");
});

test("switching pointer and keyboard keeps the selected movie and native focus aligned", async ({
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
  await page.keyboard.press("ArrowLeft");
  await expect(library.card("sunday-intro")).toBeFocused();
  await library.activate("halloween-2025", hasTouch);
  await expect(library.card("halloween-2025")).toBeFocused();
  await expect(page.locator("#movie-title")).toHaveText(
    "Lakota Loop Halloween 2025 Rough Cut",
  );
  expect((await library.videoState()).paused).toBe(true);
  await library.ready("halloween-2025");
  if (!hasTouch) {
    await library.card("sunday-intro").hover();
    await expect(page.locator("#movie-title")).toHaveText(
      "Lakota Loop Halloween 2025 Rough Cut",
    );
  }
  await page.keyboard.press("Enter");
  await library.playing(426);
});
