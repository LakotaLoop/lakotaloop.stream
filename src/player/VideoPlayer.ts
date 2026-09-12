/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { ShakaStreamLoader } from "./ShakaStreamLoader";
import type { PlaybackSource, PlaybackState, PlayerSnapshot } from "./types";
import { VideoFullscreen } from "./VideoFullscreen";

/**
 * @brief Coordinate selected-source preparation and one native viewing session.
 *
 * Preparing never plays. Start invokes play and fullscreen before returning to
 * preserve user activation. Stop silences immediately but retains the surface
 * until confirmed fullscreen exit; native Pause never ends a viewing session.
 */
export class VideoPlayer {
  private readonly videoElement: HTMLVideoElement;
  private readonly onStateChange: (errSnapshot: PlayerSnapshot) => void;
  private readonly streamLoader: ShakaStreamLoader;
  private readonly fullscreen: VideoFullscreen;
  private source: PlaybackSource | null = null;
  private pendingSource: PlaybackSource | null | undefined = undefined;
  private state: PlaybackState = "idle";
  private message: string = "";
  private loaded: boolean = false;
  private generation: number = 0;
  private disposed: boolean = false;
  private disposal: Promise<void> | null = null;
  private onStopForDisposal: (() => void) | null = null;
  private returnError: boolean = false;
  private returnMessage: string = "";

  private readonly onPlaying: () => void = (): void => {
    // A play promise or media event may arrive after Stop. It must not restore
    // audio or UI; an active new session remains in charge of the shared video.
    if (this.state !== "playing") {
      this.videoElement.pause();
    }
  };
  private readonly onEnded: () => void = (): void => {
    // A queued old-source event must not stop a newer viewing session. Native
    // ended describes the current source, and resets when replay seeks to zero.
    if (this.state === "playing" && this.videoElement.ended) {
      this.stop();
    }
  };
  private readonly onVideoError: () => void = (): void => {
    // load() clears the native error field. Do not interpret a queued event
    // whose error has already disappeared as a fault in the next source.
    if (
      this.videoElement.error !== null &&
      (this.state === "playing" || this.state === "ready")
    ) {
      this.handlePlaybackError(this.videoElement.error);
    }
  };

  /**
   * @brief Bind one video's lifecycle without preparing or playing any movie.
   * @param videoElement Shared video element with browser-native controls.
   * @param onStateChange Receives immutable snapshots for the browsing UI.
   */
  public constructor(
    videoElement: HTMLVideoElement,
    onStateChange: (errSnapshot: PlayerSnapshot) => void,
  ) {
    this.videoElement = videoElement;
    this.onStateChange = onStateChange;
    this.streamLoader = new ShakaStreamLoader(
      videoElement,
      (error: unknown): void => {
        this.handlePlaybackError(error);
      },
    );
    this.fullscreen = new VideoFullscreen(videoElement, {
      onEnter: (): void => {
        if (this.state === "stopping") {
          this.fullscreen.exit();
        } else if (this.state !== "playing") {
          this.stop();
        }
      },
      onExit: (): void => {
        if (this.state === "playing") {
          this.stop();
        } else if (this.state === "stopping") {
          this.finishStop();
        }
      },
      onEntrySettled: (): void => {
        if (this.state === "stopping" && !this.fullscreen.isFullscreen()) {
          this.finishStop();
        }
      },
      onFailure: (operation: "enter" | "exit"): void => {
        if (operation === "enter" && this.state === "playing") {
          this.update(
            "playing",
            "Fullscreen is unavailable. Watch here, or try Fullscreen again.",
          );
        } else if (operation === "exit" && this.state === "stopping") {
          this.update(
            "playing",
            "Could not exit fullscreen. Use native Done or exit, or try Return again.",
          );
        }
      },
    });
    videoElement.addEventListener("playing", this.onPlaying);
    videoElement.addEventListener("ended", this.onEnded);
    videoElement.addEventListener("error", this.onVideoError);
  }

  /**
   * @brief Prepare only the selected source without waiting to update browsing UI.
   * @param source Selected movie URL, or null for an unavailable configuration.
   */
  public prepare(source: PlaybackSource | null): void {
    if (this.disposed || this.disposal !== null) {
      return;
    }
    // Selection remains mutable while fullscreen is leaving. Even a return to
    // the loaded movie must replace an earlier queued selection before dedup.
    if (this.state === "stopping" || this.pendingSource !== undefined) {
      this.pendingSource = source;
      this.stop();
      return;
    }
    const sameSource: boolean =
      source !== null &&
      this.source !== null &&
      source.id === this.source.id &&
      source.url === this.source.url &&
      source.kind === this.source.kind;
    if (sameSource && (this.loaded || this.state === "preparing")) {
      return;
    }
    if (this.state === "playing") {
      this.pendingSource = source;
      this.stop();
      return;
    }
    const generation: number = ++this.generation;
    this.source = source;
    this.loaded = false;
    this.returnError = false;
    this.returnMessage = "";
    if (source === null) {
      this.streamLoader.cancel();
      this.update("error", "Playback is not configured for this movie.");
      return;
    }
    this.update("preparing", "Preparing video…");
    void this.streamLoader.load(source).then(
      (): void => {
        if (generation !== this.generation || this.disposed) {
          return;
        }
        this.loaded = true;
        this.update("ready");
      },
      (error: unknown): void => {
        if (generation === this.generation && !this.disposed) {
          this.handlePlaybackError(error);
        }
      },
    );
  }

  /**
   * @brief Start ready playback, or retry preparation for a later fresh gesture.
   *
   * Also exposes a fullscreen retry from inline playback. There is no await,
   * import, or source switch before either gesture-dependent browser operation.
   */
  public start(): void {
    if (
      this.disposed ||
      this.disposal !== null ||
      this.state === "preparing" ||
      this.state === "stopping"
    ) {
      return;
    }
    if (this.state === "playing") {
      this.fullscreen.enter();
      return;
    }
    if (!this.loaded) {
      if (this.source !== null) {
        this.prepare(this.source);
      }
      return;
    }
    const generation: number = ++this.generation;
    this.returnError = false;
    this.returnMessage = "";
    // Notify the browsing owner first so its containing surface is laid out.
    // Firefox creates native controls when enabled: reveal before that setter.
    this.update("playing");
    this.videoElement.style.visibility = "visible";
    this.videoElement.controls = true;
    this.videoElement.muted = false;
    this.videoElement.volume = 1;
    try {
      const playback: Promise<void> = this.videoElement.play();
      this.fullscreen.enter();
      void playback.then(
        (): void => {
          if (generation !== this.generation && this.state !== "playing") {
            this.videoElement.pause();
          }
        },
        (error: unknown): void => {
          if (generation !== this.generation || this.disposed) {
            return;
          }
          if (
            error instanceof DOMException &&
            error.name === "AbortError" &&
            this.videoElement.paused &&
            this.videoElement.error === null
          ) {
            return;
          }
          this.handlePlaybackError(error);
        },
      );
    } catch (error: unknown) {
      this.handlePlaybackError(error);
    }
  }

  /** @brief Silence now and return only after actual native fullscreen exit. */
  public stop(): void {
    if (this.disposed || this.state === "stopping") {
      return;
    }
    this.generation += 1;
    this.videoElement.pause();
    if (this.state === "preparing") {
      this.streamLoader.cancel();
      this.loaded = false;
    }
    this.update("stopping", this.returnMessage);
    if (this.fullscreen.isFullscreen()) {
      this.fullscreen.exit();
    } else if (!this.fullscreen.isEntering()) {
      this.finishStop();
    }
  }

  /** @brief Return a detached snapshot safe for the browsing controller to retain. */
  public getSnapshot(): PlayerSnapshot {
    return {
      state: this.state,
      sourceId: this.source?.id ?? null,
      message: this.message,
    };
  }

  /**
   * @brief Release media and listeners when this controller's owner is removed.
   *
   * Stop preserves fullscreen until the browser exits; no hidden video is
   * created by disposal. The caller keeps its native surface until that exit.
   */
  public dispose(): Promise<void> {
    if (this.disposal !== null) {
      return this.disposal;
    }
    this.pendingSource = undefined;
    const stopped: Promise<void> = new Promise<void>(
      (resolve: () => void): void => {
        this.onStopForDisposal = resolve;
      },
    );
    // Keep lifecycle listeners and the loaded source until the native surface
    // really exits. A failed exit remains recoverable through native Done.
    this.disposal = stopped.then(async (): Promise<void> => {
      this.disposed = true;
      this.generation += 1;
      this.videoElement.removeEventListener("playing", this.onPlaying);
      this.videoElement.removeEventListener("ended", this.onEnded);
      this.videoElement.removeEventListener("error", this.onVideoError);
      this.fullscreen.dispose();
      await this.streamLoader.dispose();
    });
    this.stop();
    return this.disposal;
  }

  /** @brief Commit return state after the native surface no longer owns fullscreen. */
  private finishStop(): void {
    this.videoElement.controls = false;
    this.videoElement.style.visibility = "hidden";
    if (this.loaded) {
      this.videoElement.currentTime = 0;
    }
    const returnState: PlaybackState = this.returnError
      ? "error"
      : this.loaded
        ? "ready"
        : "idle";
    this.update(returnState, this.returnMessage);
    this.onStopForDisposal?.();
    this.onStopForDisposal = null;
    if (this.pendingSource !== undefined) {
      const source: PlaybackSource | null = this.pendingSource;
      this.pendingSource = undefined;
      this.prepare(source);
    }
  }

  /**
   * @brief Keep permission failures prepared; invalidate fatal playback failures.
   * @param error Current session's play, media, Shaka, or preparation failure.
   */
  private handlePlaybackError(error: unknown): void {
    if (this.disposed) {
      return;
    }
    const denied: boolean =
      error instanceof Error && error.name === "NotAllowedError";
    if (!denied) {
      this.loaded = false;
      this.streamLoader.cancel();
    }
    this.returnError = !denied;
    this.returnMessage = denied
      ? "Select Play again to allow playback with sound."
      : "Video could not be loaded. Select Retry to prepare it again.";
    this.stop();
  }

  /** @brief Publish state after all invariants needed by the view are established. */
  private update(state: PlaybackState, message: string = ""): void {
    this.state = state;
    this.message = message;
    this.onStateChange(this.getSnapshot());
  }
}
