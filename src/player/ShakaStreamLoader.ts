/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type shaka from "shaka-player";

import type { PlaybackSource } from "./types";

/**
 * @brief Serialize selected-source preparation on one video and one Shaka player.
 *
 * Cancellation invalidates callbacks immediately and interrupts media loading.
 * A replacement waits for the previous operation to settle before attaching or
 * assigning its source. Only the selected HLS source imports Shaka.
 */
export class ShakaStreamLoader {
  private readonly videoElement: HTMLVideoElement;
  private readonly onPlaybackError: (errError: unknown) => void;
  private shakaPlayer: shaka.Player | null = null;
  private preparationQueue: Promise<void> = Promise.resolve();
  private generation: number = 0;
  private disposed: boolean = false;
  private cancelNativeLoad: (() => void) | null = null;
  private removeShakaListener: (() => void) | null = null;

  /**
   * @brief Store the media owner and fatal-error callback without loading media.
   * @param videoElement Shared native video surface.
   * @param onPlaybackError Receives current-source critical errors only.
   */
  public constructor(
    videoElement: HTMLVideoElement,
    onPlaybackError: (errError: unknown) => void,
  ) {
    this.videoElement = videoElement;
    this.onPlaybackError = onPlaybackError;
  }

  /**
   * @brief Queue preparation, invalidating work from the previously selected movie.
   * @param source Exact source mapping selected by the browsing controller.
   * @return Preparation promise; canceled work rejects with AbortError.
   */
  public load(source: PlaybackSource): Promise<void> {
    this.cancel();
    const generation: number = this.generation;
    const preparation: Promise<void> = this.preparationQueue.then(
      async (): Promise<void> => {
        this.assertCurrent(generation);
        if (source.kind === "hls") {
          await this.loadHls(source.url, generation);
        } else {
          if (this.shakaPlayer !== null) {
            await this.shakaPlayer.detach();
          }
          this.assertCurrent(generation);
          await this.loadMp4(source.url);
        }
        this.assertCurrent(generation);
      },
    );
    // The queue consumes rejection only to permit the next independent load;
    // the original promise still reports its failure to the owning controller.
    this.preparationQueue = preparation.catch((): void => {});
    return preparation;
  }

  /** @brief Invalidate callbacks and abort pending source work without playing. */
  public cancel(): void {
    this.generation += 1;
    this.removeShakaListener?.();
    this.removeShakaListener = null;
    this.cancelNativeLoad?.();
    this.cancelNativeLoad = null;
    if (this.shakaPlayer !== null) {
      // Shaka unload interrupts its pending network operations. Serializing the
      // next attach/load behind both operations avoids concurrent media owners.
      const unloading: Promise<void> = this.shakaPlayer
        // Cancellation must not create another MediaSource and wait for its
        // sourceopen event while a newer selection is queued behind this work.
        .unload(false)
        .catch((): void => {});
      this.preparationQueue = Promise.all([
        this.preparationQueue,
        unloading,
      ]).then((): void => {});
    }
  }

  /** @brief Release listeners, source bytes and the one owned Shaka instance. */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cancel();
    await this.preparationQueue;
    if (this.shakaPlayer !== null) {
      await this.shakaPlayer.destroy();
      this.shakaPlayer = null;
    }
    this.videoElement.removeAttribute("src");
    this.videoElement.load();
  }

  /**
   * @brief Throw before a superseded operation can mutate the shared video.
   * @param generation Ownership captured when load was requested.
   */
  private assertCurrent(generation: number): void {
    if (this.disposed || generation !== this.generation) {
      throw new DOMException("Media preparation canceled", "AbortError");
    }
  }

  /**
   * @brief Prepare HLS using Shaka while leaving transport controls native.
   * @param url Selected manifest URL.
   * @param generation Current preparation identity.
   */
  private async loadHls(url: string, generation: number): Promise<void> {
    const shakaModule: { default: typeof shaka } = await import("shaka-player");
    this.assertCurrent(generation);
    const shakaLibrary: typeof shaka = shakaModule.default;
    if (this.shakaPlayer === null) {
      shakaLibrary.polyfill.installAll();
      if (!shakaLibrary.Player.isBrowserSupported()) {
        throw new Error("This browser does not support the video stream.");
      }
      this.shakaPlayer = new shakaLibrary.Player();
    }
    const player: shaka.Player = this.shakaPlayer;
    const onError: (errEvent: Event) => void = (event: Event): void => {
      const error: shaka.util.Error = (event as CustomEvent<shaka.util.Error>)
        .detail;
      if (
        !this.disposed &&
        generation === this.generation &&
        error.severity === shakaLibrary.util.Error.Severity.CRITICAL
      ) {
        this.onPlaybackError(error);
      }
    };
    player.addEventListener("error", onError);
    this.removeShakaListener = (): void => {
      player.removeEventListener("error", onError);
    };
    await player.attach(this.videoElement);
    this.assertCurrent(generation);
    await player.load(url);
  }

  /**
   * @brief Wait for decoded-frame readiness before exposing a gesture-based start.
   * @param url Selected development MP4 URL, served with HTTP byte ranges.
   * @return Promise resolved by media readiness and rejected by error/cancel.
   */
  private loadMp4(url: string): Promise<void> {
    return new Promise<void>(
      (resolve: () => void, reject: (errReason: unknown) => void): void => {
        const cleanup: () => void = (): void => {
          this.videoElement.removeEventListener("loadeddata", onReady);
          this.videoElement.removeEventListener("canplay", onReady);
          this.videoElement.removeEventListener("error", onError);
          this.cancelNativeLoad = null;
        };
        const onReady: () => void = (): void => {
          if (this.videoElement.readyState >= 2) {
            cleanup();
            resolve();
          }
        };
        const onError: () => void = (): void => {
          // Starting a replacement source clears MediaError. An old queued
          // event must leave the current source's readiness listeners intact.
          const error: MediaError | null = this.videoElement.error;
          if (error === null) {
            return;
          }
          cleanup();
          reject(error);
        };
        this.cancelNativeLoad = (): void => {
          cleanup();
          this.videoElement.removeAttribute("src");
          this.videoElement.load();
          reject(new DOMException("Media preparation canceled", "AbortError"));
        };
        this.videoElement.addEventListener("loadeddata", onReady);
        this.videoElement.addEventListener("canplay", onReady);
        this.videoElement.addEventListener("error", onError);
        this.videoElement.preload = "auto";
        this.videoElement.src = url;
        this.videoElement.load();
        onReady();
      },
    );
  }
}
