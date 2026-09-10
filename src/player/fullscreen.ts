/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

/** iPhone Safari exposes video fullscreen through its own presentation API. */
type FullscreenVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

/** Request native video fullscreen without interrupting inline playback. */
export function enterVideoFullscreen(
  videoElement: FullscreenVideoElement,
): void {
  const pageDocument: Document = videoElement.ownerDocument;

  // Fullscreen the video itself so the browser provides its built-in video UI.
  // Call this directly from the click handler to preserve user activation.
  try {
    if (pageDocument.fullscreenElement) {
      return;
    }

    if (
      pageDocument.fullscreenEnabled &&
      typeof videoElement.requestFullscreen === "function"
    ) {
      void videoElement
        .requestFullscreen({ navigationUI: "hide" })
        .catch((error: unknown): void => {
          console.warn("Could not enter fullscreen", error);
        });
    } else if (typeof videoElement.webkitEnterFullscreen === "function") {
      // This changes presentation only; Shaka still owns the video stream.
      videoElement.webkitEnterFullscreen();
    }
  } catch (error: unknown) {
    console.warn("Could not enter fullscreen", error);
  }
}

/** Leave this video's fullscreen so the page's play/retry button is reachable. */
export function exitVideoFullscreen(
  videoElement: FullscreenVideoElement,
): void {
  const pageDocument: Document = videoElement.ownerDocument;

  if (pageDocument.fullscreenElement === videoElement) {
    void pageDocument.exitFullscreen().catch((error: unknown): void => {
      console.warn("Could not leave fullscreen", error);
    });
  } else if (
    videoElement.webkitDisplayingFullscreen &&
    typeof videoElement.webkitExitFullscreen === "function"
  ) {
    // iPhone video fullscreen is separate from the standard Fullscreen API.
    try {
      videoElement.webkitExitFullscreen();
    } catch (error: unknown) {
      console.warn("Could not leave fullscreen", error);
    }
  }
}
