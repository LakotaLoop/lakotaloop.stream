/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type shaka from "shaka-player";

/**
 * Create a loader that owns one Shaka player and reuses it for stream retries.
 * Playback controls and presentation stay with the caller.
 */
export function createShakaStreamLoader(
  videoElement: HTMLVideoElement,
  streamUrl: string,
  onPlaybackError: (errError: unknown) => void,
): () => Promise<void> {
  let shakaPlayer: shaka.Player | null = null;

  return async (): Promise<void> => {
    if (shakaPlayer === null) {
      // Keep Shaka in a separate bundle and install its browser compatibility
      // support before creating the player, regardless of native HLS support.
      const shakaModule: { default: typeof shaka } =
        await import("shaka-player");
      const shakaLibrary: typeof shaka = shakaModule.default;
      shakaLibrary.polyfill.installAll();

      if (!shakaLibrary.Player.isBrowserSupported()) {
        throw new Error("This browser does not support the video stream.");
      }

      shakaPlayer = new shakaLibrary.Player();
      shakaPlayer.addEventListener("error", (event: Event): void => {
        const playbackError: shaka.util.Error = (
          event as CustomEvent<shaka.util.Error>
        ).detail;

        // Let Shaka retry recoverable network errors without stopping playback.
        if (
          playbackError.severity === shakaLibrary.util.Error.Severity.CRITICAL
        ) {
          onPlaybackError(playbackError);
        }
      });
    }

    await shakaPlayer.attach(videoElement);
    await shakaPlayer.load(streamUrl);
  };
}
