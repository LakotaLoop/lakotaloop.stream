/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type shaka from "shaka-player";

/**
 * @brief Prepare one video's stream through a lazily created Shaka player.
 *
 * Reuses the player for retries. Playback controls and presentation stay with
 * the caller; recoverable Shaka errors remain under Shaka's retry policy.
 */
export class ShakaStreamLoader {
  /** @brief Video to attach whenever the stream is prepared or retried. */
  private readonly videoElement: HTMLVideoElement;

  /** @brief Stream selected by the caller, independent of page configuration. */
  private readonly streamUrl: string;

  /** @brief Receives critical Shaka events without handling playback UI here. */
  private readonly onPlaybackError: (errError: unknown) => void;

  /** @brief Null until first load; retained even if attach or load rejects. */
  private shakaPlayer: shaka.Player | null = null;

  /**
   * @brief Store loading dependencies without importing or constructing Shaka.
   *
   * @param videoElement Video that will receive the prepared stream.
   * @param streamUrl Stream URL to load on initial preparation and retries.
   * @param onPlaybackError Callback receiving each critical Shaka error event.
   */
  public constructor(
    videoElement: HTMLVideoElement,
    streamUrl: string,
    onPlaybackError: (errError: unknown) => void,
  ) {
    this.videoElement = videoElement;
    this.streamUrl = streamUrl;
    this.onPlaybackError = onPlaybackError;
  }

  /**
   * @brief Attach and load the stream, creating Shaka only on the first attempt.
   *
   * The caller serializes preparation and retries. The error listener is wired
   * only when creating the player, so retries do not multiply error delivery.
   *
   * @return Promise fulfilled after attachment and stream loading complete.
   * Rejects on import, polyfill initialization, unsupported browser, player
   * setup, attachment, or loading failures. Critical events are also forwarded
   * independently through the constructor callback.
   */
  public async load(): Promise<void> {
    if (this.shakaPlayer === null) {
      // Keep Shaka in a separate bundle and install its browser compatibility
      // support before creating the player, regardless of native HLS support.
      const shakaModule: { default: typeof shaka } =
        await import("shaka-player");
      const shakaLibrary: typeof shaka = shakaModule.default;
      shakaLibrary.polyfill.installAll();

      if (!shakaLibrary.Player.isBrowserSupported()) {
        throw new Error("This browser does not support the video stream.");
      }

      this.shakaPlayer = new shakaLibrary.Player();
      this.shakaPlayer.addEventListener("error", (event: Event): void => {
        this.handleShakaError(event, shakaLibrary.util.Error.Severity.CRITICAL);
      });
    }

    await this.shakaPlayer.attach(this.videoElement);
    await this.shakaPlayer.load(this.streamUrl);
  }

  /**
   * @brief Forward fatal Shaka events while allowing recoverable errors to retry.
   *
   * @param event Shaka error event whose detail contains the playback error.
   * @param criticalSeverity Critical severity value from the loaded library.
   */
  private handleShakaError(event: Event, criticalSeverity: number): void {
    const playbackError: shaka.util.Error = (
      event as CustomEvent<shaka.util.Error>
    ).detail;

    // Let Shaka retry recoverable network errors without stopping playback.
    if (playbackError.severity === criticalSeverity) {
      this.onPlaybackError(playbackError);
    }
  }
}
