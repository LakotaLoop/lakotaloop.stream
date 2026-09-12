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

/** @brief Browser presentation events are distinct from request settlement. */
interface FullscreenCallbacks {
  onEnter: () => void;
  onExit: () => void;
  onEntrySettled: () => void;
  onFailure: (errOperation: "enter" | "exit") => void;
}

/**
 * @brief Own the standard and WebKit fullscreen lifecycle for one video element.
 *
 * Exit is reported only after this video actually entered fullscreen. Request
 * identities prevent failures from a previous presentation affecting a replay.
 */
export class VideoFullscreen {
  private readonly videoElement: FullscreenVideoElement;
  private readonly pageDocument: Document;
  private readonly callbacks: FullscreenCallbacks;
  private entered: boolean = false;
  private entering: boolean = false;
  private webkitExitConfirmed: boolean = false;
  private requestGeneration: number = 0;
  private exitPending: boolean = false;
  private disposed: boolean = false;

  private readonly onStandardChange: () => void = (): void => {
    if (this.pageDocument.fullscreenElement === this.videoElement) {
      this.reportEntry();
    } else if (this.entered) {
      this.reportExit();
    }
  };
  private readonly onWebkitBegin: () => void = (): void => {
    this.reportEntry();
  };
  private readonly onWebkitEnd: () => void = (): void => {
    this.webkitExitConfirmed = true;
    if (this.entered) {
      this.reportExit();
    } else if (this.entering) {
      this.settleEntry();
    }
  };

  /**
   * @brief Bind presentation events exactly once to their actual document owner.
   * @param videoElement Video itself, never a wrapper, receives fullscreen.
   * @param callbacks Player policy for actual transitions and request failures.
   */
  public constructor(
    videoElement: HTMLVideoElement,
    callbacks: FullscreenCallbacks,
  ) {
    this.videoElement = videoElement;
    this.pageDocument = videoElement.ownerDocument;
    this.callbacks = callbacks;
    this.pageDocument.addEventListener(
      "fullscreenchange",
      this.onStandardChange,
    );
    this.videoElement.addEventListener(
      "webkitbeginfullscreen",
      this.onWebkitBegin,
    );
    this.videoElement.addEventListener("webkitendfullscreen", this.onWebkitEnd);
  }

  /** @brief Return whether this video currently owns either fullscreen surface. */
  public isFullscreen(): boolean {
    return (
      this.pageDocument.fullscreenElement === this.videoElement ||
      (!this.webkitExitConfirmed &&
        this.videoElement.webkitDisplayingFullscreen === true)
    );
  }

  /** @brief Return whether an entry request could still reveal the native surface. */
  public isEntering(): boolean {
    return this.entering;
  }

  /** @brief Request presentation synchronously in the user's Play activation. */
  public enter(): void {
    if (this.disposed || this.entering || this.isFullscreen()) {
      return;
    }
    const generation: number = ++this.requestGeneration;
    this.entering = true;
    this.webkitExitConfirmed = false;
    try {
      if (
        this.pageDocument.fullscreenEnabled &&
        typeof this.videoElement.requestFullscreen === "function"
      ) {
        void this.videoElement.requestFullscreen({ navigationUI: "hide" }).then(
          (): void => {
            if (generation !== this.requestGeneration || this.disposed) {
              return;
            }
            if (this.isFullscreen()) {
              this.reportEntry();
            }
            this.settleEntry();
          },
          (): void => {
            this.failEntry(generation);
          },
        );
      } else if (
        typeof this.videoElement.webkitEnterFullscreen === "function"
      ) {
        this.videoElement.webkitEnterFullscreen();
        // WebKit returns no promise. Its begin/end events own asynchronous
        // transitions, while its presentation flag covers synchronous entry.
        if (this.isFullscreen()) {
          this.reportEntry();
          this.settleEntry();
        }
      } else {
        this.failEntry(generation);
      }
    } catch {
      this.failEntry(generation);
    }
  }

  /** @brief Request exit once, retaining the surface until actual browser exit. */
  public exit(): void {
    if (this.disposed || this.exitPending || !this.isFullscreen()) {
      return;
    }
    // Observing ownership here also covers a browser event still in its queue.
    this.entered = true;
    const generation: number = this.requestGeneration;
    this.exitPending = true;
    try {
      if (this.pageDocument.fullscreenElement === this.videoElement) {
        void this.pageDocument.exitFullscreen().catch((): void => {
          this.failExit(generation);
        });
      } else if (typeof this.videoElement.webkitExitFullscreen === "function") {
        this.videoElement.webkitExitFullscreen();
      } else {
        this.failExit(generation);
      }
    } catch {
      this.failExit(generation);
    }
  }

  /** @brief Remove presentation listeners when the owning player is replaced. */
  public dispose(): void {
    this.disposed = true;
    this.requestGeneration += 1;
    this.pageDocument.removeEventListener(
      "fullscreenchange",
      this.onStandardChange,
    );
    this.videoElement.removeEventListener(
      "webkitbeginfullscreen",
      this.onWebkitBegin,
    );
    this.videoElement.removeEventListener(
      "webkitendfullscreen",
      this.onWebkitEnd,
    );
  }

  /** @brief Record actual entry before notifying player stop/return policy. */
  private reportEntry(): void {
    if (this.disposed || this.entered) {
      return;
    }
    this.entered = true;
    this.entering = false;
    this.callbacks.onEnter();
  }

  /** @brief Make duplicate browser exit events and old promises harmless. */
  private reportExit(): void {
    this.entered = false;
    this.entering = false;
    this.exitPending = false;
    this.requestGeneration += 1;
    this.callbacks.onExit();
  }

  /** @brief Release a stop waiting on an entry request that has now settled. */
  private settleEntry(): void {
    this.entering = false;
    this.callbacks.onEntrySettled();
  }

  /** @brief Surface only a failure belonging to the latest entry attempt. */
  private failEntry(generation: number): void {
    if (this.disposed || generation !== this.requestGeneration) {
      return;
    }
    this.entering = false;
    this.callbacks.onFailure("enter");
    this.callbacks.onEntrySettled();
  }

  /** @brief Keep failed automatic exits visible and retryable with native UI. */
  private failExit(generation: number): void {
    if (
      this.disposed ||
      generation !== this.requestGeneration ||
      !this.exitPending
    ) {
      return;
    }
    this.exitPending = false;
    this.callbacks.onFailure("exit");
  }
}
