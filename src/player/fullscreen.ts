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

/** Check this video's presentation, including iPhone's separate native API. */
export function isVideoFullscreen(
  videoElement: FullscreenVideoElement,
): boolean {
  return (
    videoElement.ownerDocument.fullscreenElement === videoElement ||
    videoElement.webkitDisplayingFullscreen === true
  );
}

/** Notify the player when the browser has actually left video fullscreen. */
export function onVideoFullscreenExit(
  videoElement: FullscreenVideoElement,
  onExit: () => void,
): void {
  const pageDocument: Document = videoElement.ownerDocument;

  pageDocument.addEventListener("fullscreenchange", (): void => {
    // Ignore entry while this video still owns fullscreen.
    if (pageDocument.fullscreenElement !== videoElement) {
      onExit();
    }
  });
  // Native iPhone fullscreen does not use document.fullscreenElement. Its end
  // event is authoritative even if the WebKit presentation flag has not updated.
  videoElement.addEventListener("webkitendfullscreen", onExit);
}

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
  onExitFailure: () => void,
): void {
  const pageDocument: Document = videoElement.ownerDocument;

  /** Keep the caller's pending state in sync with synchronous or async failure. */
  function handleExitFailure(error: unknown): void {
    console.warn("Could not leave fullscreen", error);
    onExitFailure();
  }

  try {
    if (pageDocument.fullscreenElement === videoElement) {
      // A resolved request is not the lifecycle signal; wait for the exit event.
      void pageDocument.exitFullscreen().catch(handleExitFailure);
    } else if (videoElement.webkitDisplayingFullscreen) {
      if (typeof videoElement.webkitExitFullscreen !== "function") {
        throw new Error("Native video fullscreen exit is unavailable.");
      }
      videoElement.webkitExitFullscreen();
    }
  } catch (error: unknown) {
    handleExitFailure(error);
  }
}
