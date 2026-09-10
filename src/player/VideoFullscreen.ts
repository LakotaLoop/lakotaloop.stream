/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

/** @brief iPhone Safari's separate native video presentation API. */
type FullscreenVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

/**
 * @brief Manage fullscreen presentation and exit notifications for one video.
 *
 * Requests and actual browser exit events are distinct. This class reports
 * presentation changes; the player decides whether an exit should reveal Play.
 */
export class VideoFullscreen {
  /** @brief Video whose standard or WebKit fullscreen presentation is managed. */
  private readonly videoElement: FullscreenVideoElement;

  /** @brief Owning document, used instead of assuming the global document. */
  private readonly pageDocument: Document;

  /**
   * @brief Associate fullscreen operations with a video without wiring events.
   *
   * @param videoElement Video and source of the owning document.
   */
  public constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    this.pageDocument = videoElement.ownerDocument;
  }

  /**
   * @brief Check this video's presentation, including iPhone's native API.
   *
   * @return True when this video owns standard fullscreen or WebKit reports it
   * as displaying fullscreen; another element's fullscreen does not count.
   */
  public isFullscreen(): boolean {
    return (
      this.pageDocument.fullscreenElement === this.videoElement ||
      this.videoElement.webkitDisplayingFullscreen === true
    );
  }

  /**
   * @brief Observe browser exit signals independently of exit request settlement.
   *
   * Call once during player initialization. Notifications can be duplicated or
   * caused by manual exits; neither signal means that playback has ended.
   *
   * @param onExit Callback invoked when a browser event indicates video exit.
   */
  public observeExit(onExit: () => void): void {
    this.pageDocument.addEventListener("fullscreenchange", (): void => {
      // Ignore entry while this video still owns fullscreen.
      if (this.pageDocument.fullscreenElement !== this.videoElement) {
        onExit();
      }
    });
    // Native iPhone fullscreen does not use document.fullscreenElement. Its end
    // event is authoritative even if the WebKit presentation flag has not updated.
    this.videoElement.addEventListener("webkitendfullscreen", onExit);
  }

  /**
   * @brief Request fullscreen directly within the original click's activation.
   *
   * Must be called without an intervening await in the click handler. Failures
   * are logged and leave inline playback usable; this does not await entry.
   */
  public enter(): void {
    // Fullscreen the video itself so the browser provides its built-in video UI.
    // Call this directly from the click handler to preserve user activation.
    try {
      if (this.pageDocument.fullscreenElement) {
        return;
      }

      if (
        this.pageDocument.fullscreenEnabled &&
        typeof this.videoElement.requestFullscreen === "function"
      ) {
        void this.videoElement
          .requestFullscreen({ navigationUI: "hide" })
          .catch((error: unknown): void => {
            console.warn("Could not enter fullscreen", error);
          });
      } else if (
        typeof this.videoElement.webkitEnterFullscreen === "function"
      ) {
        // This changes presentation only; Shaka still owns the video stream.
        this.videoElement.webkitEnterFullscreen();
      }
    } catch (error: unknown) {
      console.warn("Could not enter fullscreen", error);
    }
  }

  /**
   * @brief Request this video's fullscreen exit and report request failures.
   *
   * Successful request settlement does not confirm exit: observeExit supplies
   * the browser's actual presentation signal. Does nothing if this video does
   * not own fullscreen.
   *
   * @param onExitFailure Called on a synchronous failure or rejected request,
   * allowing the caller to abandon only the transition associated with it.
   */
  public exit(onExitFailure: () => void): void {
    try {
      if (this.pageDocument.fullscreenElement === this.videoElement) {
        // A resolved request is not the lifecycle signal; wait for the exit event.
        void this.pageDocument
          .exitFullscreen()
          .catch((error: unknown): void => {
            this.handleExitFailure(error, onExitFailure);
          });
      } else if (this.videoElement.webkitDisplayingFullscreen) {
        if (typeof this.videoElement.webkitExitFullscreen !== "function") {
          throw new Error("Native video fullscreen exit is unavailable.");
        }
        this.videoElement.webkitExitFullscreen();
      }
    } catch (error: unknown) {
      this.handleExitFailure(error, onExitFailure);
    }
  }

  /**
   * @brief Log an exit failure and notify the owner of that specific request.
   *
   * @param error Synchronous browser failure or asynchronous rejection reason.
   * @param onExitFailure Callback belonging to the failed exit request.
   */
  private handleExitFailure(error: unknown, onExitFailure: () => void): void {
    console.warn("Could not leave fullscreen", error);
    onExitFailure();
  }
}
