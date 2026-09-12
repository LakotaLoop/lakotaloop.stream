/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { expect, type Page, test, type TestInfo } from "@playwright/test";

import { LibraryHarness } from "./LibraryHarness";

/** @brief Visible card geometry, including the complete title below its artwork. */
interface CardBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

/** @brief Viewport-relative observations that cannot be repaired by auto-scrolling. */
interface LandscapeLayout {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  horizontalOverflow: boolean;
  textOverlapsCards: boolean;
  cards: CardBounds[];
}

/** @brief Measure before pointer/focus actions can scroll an offscreen card into view. */
async function readLandscapeLayout(page: Page): Promise<LandscapeLayout> {
  return page.evaluate((): LandscapeLayout => {
    const cardElements: HTMLElement[] = Array.from(
      document.querySelectorAll<HTMLElement>(".movie-card"),
    );
    const cards: CardBounds[] = cardElements.map(
      (card: HTMLElement): CardBounds => {
        const bounds: DOMRect = card.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
        };
      },
    );
    const textElements: HTMLElement[] = Array.from(
      document.querySelectorAll<HTMLElement>(
        "#movie-title, #movie-plot, #movie-tagline, .movie-facts",
      ),
    );
    const textOverlapsCards: boolean = textElements.some(
      (element: HTMLElement): boolean => {
        if (
          element.getClientRects().length === 0 ||
          window.getComputedStyle(element).visibility === "hidden"
        ) {
          return false;
        }
        const textBounds: DOMRect = element.getBoundingClientRect();
        return cards.some(
          (card: CardBounds): boolean =>
            textBounds.left < card.right - 0.5 &&
            textBounds.right > card.left + 0.5 &&
            textBounds.top < card.bottom - 0.5 &&
            textBounds.bottom > card.top + 0.5,
        );
      },
    );
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
      textOverlapsCards,
      cards,
    };
  });
}

/** @brief Require both complete usable buttons on screen, not just an intersection. */
function expectVisibleLandscape(layout: LandscapeLayout): void {
  expect(layout.cards).toHaveLength(2);
  expect(layout.scrollX).toBe(0);
  expect(layout.scrollY).toBe(0);
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.textOverlapsCards).toBe(false);
  layout.cards.forEach((card: CardBounds): void => {
    expect(card.width).toBeGreaterThanOrEqual(140);
    expect(card.left).toBeGreaterThanOrEqual(-0.5);
    expect(card.top).toBeGreaterThanOrEqual(-0.5);
    expect(card.right).toBeLessThanOrEqual(layout.width + 0.5);
    expect(card.bottom).toBeLessThanOrEqual(layout.height + 0.5);
  });
}

// These CSS viewport heights model the space remaining under mobile browser
// chrome; they do not claim running on a physical Pixel or its Android browser.
const landscapeSizes: ReadonlyArray<{ width: number; height: number }> = [
  { width: 840, height: 300 },
  { width: 915, height: 412 },
  { width: 760, height: 300 },
];

landscapeSizes.forEach((size: { width: number; height: number }): void => {
  test(`short landscape ${size.width}x${size.height} shows both full movies before input and after selection`, async ({
    page,
    browserName,
    hasTouch,
  }: {
    page: Page;
    browserName: string;
    hasTouch: boolean;
  }, testInfo: TestInfo): Promise<void> => {
    const library: LibraryHarness = new LibraryHarness(page);
    await page.setViewportSize(size);
    await library.routeMedia(browserName === "firefox" ? "webm" : "mp4");
    await library.open();

    // This assertion precedes all click/tap/focus calls. Playwright must not
    // conceal the initial offscreen-library bug by scrolling to a target.
    const initialLayout: LandscapeLayout = await readLandscapeLayout(page);
    expectVisibleLandscape(initialLayout);
    await expect(library.card("sunday-intro")).toBeInViewport({ ratio: 1 });
    await expect(library.card("halloween-2025")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("initial-library.png") });

    // Switch to the other movie, then back. Each action selects a different
    // source, so this remains a browsing regression rather than a Play request.
    let movieId: string;
    for (movieId of ["halloween-2025", "sunday-intro"]) {
      await library.activate(movieId, hasTouch);
      await library.ready(movieId);
      const selectedLayout: LandscapeLayout = await readLandscapeLayout(page);
      expectVisibleLandscape(selectedLayout);
      selectedLayout.cards.forEach((card: CardBounds, index: number): void => {
        expect(
          Math.abs(card.left - initialLayout.cards[index].left),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(card.top - initialLayout.cards[index].top),
        ).toBeLessThanOrEqual(1);
      });
      await expect(library.card("sunday-intro")).toBeInViewport({ ratio: 1 });
      await expect(library.card("halloween-2025")).toBeInViewport({ ratio: 1 });
      await expect(page.locator("#browse-screen")).toBeVisible();
      expect((await library.videoState()).paused).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${movieId}.png`) });
    }
    expect(library.errors).toEqual([]);
    expect(library.failedAssets).toEqual([]);
  });
});
