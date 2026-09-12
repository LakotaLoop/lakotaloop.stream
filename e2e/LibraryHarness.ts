/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import {
  type APIResponse,
  expect,
  type Locator,
  type Page,
  type Request,
  type Response,
  type Route,
} from "@playwright/test";

export type FixtureKind = "mp4" | "webm" | "hls";

/** @brief Public media observations; no player or fullscreen APIs are replaced. */
export interface VideoState {
  paused: boolean;
  currentTime: number;
  width: number;
  height: number;
  controls: boolean;
  muted: boolean;
  fullscreen: boolean;
  source: string;
}

/**
 * @brief Exercise the deployed library using deterministic network media bytes.
 *
 * Only source URLs at the bundle/network boundary change. Selection, Shaka,
 * media decoding, fullscreen, and browser input use the production application.
 */
export class LibraryHarness {
  public readonly page: Page;
  public readonly errors: string[] = [];
  public readonly failedAssets: string[] = [];
  public readonly mediaRequests: string[] = [];

  /** @brief Observe browser errors and requests on the test's isolated page. */
  public constructor(page: Page) {
    this.page = page;
    page.on("pageerror", (error: Error): void => {
      this.errors.push(error.message);
    });
    page.on("response", (response: Response): void => {
      if (response.status() >= 400) {
        this.failedAssets.push(response.url());
      }
    });
    page.on("request", (request: Request): void => {
      if (
        /__fixtures\/.*\.(mp4|webm|m3u8)|stream\.mux\.com/.test(request.url())
      ) {
        this.mediaRequests.push(request.url());
      }
    });
  }

  /** @brief Replace exactly two verified stream URLs, keeping movie IDs separate. */
  public async routeMedia(kind: FixtureKind): Promise<void> {
    // Prefer H.264/AAC whenever the engine advertises support. VP8/Opus is a
    // genuine decoding fallback for platforms whose Firefox lacks those codecs.
    if (kind === "webm") {
      const supportsMp4: boolean = await this.page.evaluate(
        (): boolean =>
          document
            .createElement("video")
            .canPlayType('video/mp4; codecs="avc1.42c01e,mp4a.40.2"') !== "",
      );
      if (supportsMp4) {
        kind = "mp4";
      }
    }
    // These literals deliberately check the production mapping independently.
    const streams: ReadonlyArray<readonly [string, string]> = [
      [
        "https://stream.mux.com/I9ip5M7pvlHQ2wLFIJ6H3rLSg72QliatilZksyI2n5s.m3u8",
        "intro",
      ],
      [
        "https://stream.mux.com/dDkIbyl402OA1QkR3CgEMVUQltsjzF1ulB4579ff7sB8.m3u8",
        "halloween",
      ],
    ];
    if (kind === "hls") {
      for (
        let streamIndex: number = 0;
        streamIndex < streams.length;
        streamIndex += 1
      ) {
        const streamUrl: string = streams[streamIndex][0];
        const fixtureName: string = streams[streamIndex][1];
        await this.page.route(
          streamUrl,
          async (route: Route): Promise<void> => {
            const manifest: string = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=180000,CODECS="avc1.42c01e,mp4a.40.2"\nhttp://127.0.0.1:4175/__fixtures/${fixtureName}-hls/index.m3u8\n`;
            await route.fulfill({
              contentType: "application/vnd.apple.mpegurl",
              headers: { "Access-Control-Allow-Origin": "*" },
              body: manifest,
            });
          },
        );
      }
    } else {
      await this.page.route(
        "**/assets/*.js",
        async (route: Route): Promise<void> => {
          const response: APIResponse = await route.fetch();
          let body: string = await response.text();
          for (
            let streamIndex: number = 0;
            streamIndex < streams.length;
            streamIndex += 1
          ) {
            const streamUrl: string = streams[streamIndex][0];
            const fixtureName: string = streams[streamIndex][1];
            body = body.replaceAll(
              streamUrl,
              `http://127.0.0.1:4175/__fixtures/${fixtureName}.${kind}`,
            );
          }
          await route.fulfill({ response, body });
        },
      );
    }
    // Any accidentally unhandled production media request fails immediately;
    // tests cannot depend on Mux availability or download a real full movie.
    await this.page.route(
      "https://*.mux.com/**",
      async (route: Route): Promise<void> => {
        if (
          kind === "hls" &&
          streams.some(
            (entry: readonly [string, string]): boolean =>
              entry[0] === route.request().url(),
          )
        ) {
          await route.fallback();
        } else {
          await route.abort("blockedbyclient");
        }
      },
    );
  }

  /** @brief Load the real production HTML and wait for catalog rendering. */
  public async open(): Promise<void> {
    await this.page.goto("/");
    await expect(this.page.locator(".movie-card")).toHaveCount(2);
  }

  /** @brief Find a real catalog card by stable identity rather than title text. */
  public card(movieId: string): Locator {
    return this.page.locator(`.movie-card[data-movie-id="${movieId}"]`);
  }

  /** @brief Use an actual tap on touch projects, otherwise a locator click. */
  public async activate(movieId: string, touch: boolean): Promise<void> {
    if (touch) {
      await this.card(movieId).tap();
    } else {
      await this.card(movieId).click();
    }
  }

  /** @brief Await the observable ready affordance without arbitrary timing sleeps. */
  public async ready(movieId: string): Promise<void> {
    await expect(this.card(movieId).locator(".card-action")).toHaveText("Play");
    await expect(this.card(movieId)).toHaveAttribute("aria-label", /^Play /);
  }

  /** @brief Read actual media properties for observable decoding/playback proof. */
  public async videoState(): Promise<VideoState> {
    return this.page
      .locator("#video-player")
      .evaluate((element: HTMLVideoElement): VideoState => ({
        paused: element.paused,
        currentTime: element.currentTime,
        width: element.videoWidth,
        height: element.videoHeight,
        controls: element.controls,
        muted: element.muted,
        fullscreen: document.fullscreenElement === element,
        source: element.currentSrc,
      }));
  }

  /** @brief Require decoded frames of the selected fixture with advancing time. */
  public async playing(width: number): Promise<void> {
    await expect(this.page.locator("#player-screen")).toBeVisible();
    await expect
      .poll(async (): Promise<boolean> => {
        const state: VideoState = await this.videoState();
        return (
          !state.paused && state.currentTime > 0.15 && state.width === width
        );
      })
      .toBe(true);
    const state: VideoState = await this.videoState();
    expect(state.controls).toBe(true);
    expect(state.muted).toBe(false);
  }

  /** @brief Require stopped audio, restored browsing, and the originating focus. */
  public async returned(movieId: string): Promise<void> {
    await expect(this.page.locator("#browse-screen")).toBeVisible();
    await expect(this.page.locator("#player-screen")).toBeHidden();
    await expect(this.card(movieId)).toBeFocused();
    expect((await this.videoState()).paused).toBe(true);
  }
}
