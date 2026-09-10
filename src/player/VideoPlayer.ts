/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { ShakaStreamLoader } from "./ShakaStreamLoader";
import { VideoFullscreen } from "./VideoFullscreen";

/**
 * @brief Coordinate playback and presentation for a single video.
 *
 * Owns the Play/Retry UI and delegates stream preparation and native
 * fullscreen handling to dedicated collaborators. The caller selects the
 * stream; native controls retain responsibility for pause and seeking.
 */
export class VideoPlayer {
  /** @brief Video whose visibility, sound, and native controls are coordinated. */
  private readonly videoElement: HTMLVideoElement;

  /** @brief Page action used for initial playback, replay, and retry. */
  private readonly playButton: HTMLButtonElement;

  /** @brief Prepares the stream and retains its Shaka instance across retries. */
  private readonly streamLoader: ShakaStreamLoader;

  /** @brief Browser presentation collaborator, independent of playback policy. */
  private readonly fullscreen: VideoFullscreen;

  /**
   * @brief Whether playback can start without awaiting stream preparation.
   *
   * Normal completion and permission failures preserve the prepared stream;
   * other playback failures invalidate it so the next attempt loads again.
   */
  private streamLoaded: boolean = false;

  /**
   * @brief Identity of the idle transition waiting for an actual fullscreen exit.
   *
   * Null means no return to Play/Retry is pending. Each request gets an identity
   * so a late exit failure cannot cancel a newer transition after the user has
   * resumed or replayed the video.
   */
  private pendingIdleTransition: object | null = null;

  /** @brief Guards event wiring and initial preparation against repeated setup. */
  private initialized: boolean = false;

  /**
   * @brief Establish dependencies without wiring listeners or preparing media.
   *
   * @param videoElement Video controlled by this instance.
   * @param playButton Button exposing the page's Play/Retry action.
   * @param streamUrl Stream selected by the caller for this video.
   */
  public constructor(
    videoElement: HTMLVideoElement,
    playButton: HTMLButtonElement,
    streamUrl: string,
  ) {
    this.videoElement = videoElement;
    this.playButton = playButton;
    this.streamLoader = new ShakaStreamLoader(
      videoElement,
      streamUrl,
      (error: unknown): void => {
        this.handlePlaybackError(error);
      },
    );
    this.fullscreen = new VideoFullscreen(videoElement);
  }

  /**
   * @brief Wire native events once and begin preparing the hidden video.
   *
   * Returns before preparation finishes. Play remains disabled until preparation
   * settles; failures expose Retry. Repeated calls do not add listeners or loads.
   * Arrow callbacks preserve this instance when invoked by DOM or collaborators.
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.fullscreen.observeExit((): void => {
      this.handleFullscreenExit();
    });
    this.videoElement.addEventListener("playing", (): void => {
      this.handlePlaying();
    });
    this.videoElement.addEventListener("ended", (): void => {
      this.handleEnded();
    });
    this.videoElement.addEventListener("error", (): void => {
      this.handlePlaybackError(this.videoElement.error);
    });
    this.playButton.addEventListener("click", (): void => {
      this.handlePlayClick();
    });

    this.prepareStream();
  }

  /**
   * @brief Prepare the hidden video before enabling the original play gesture.
   *
   * Handles loading failures through the shared Retry path. Preparation stays
   * outside the eventual click so a ready stream can play without a network wait.
   */
  private prepareStream(): void {
    // Prepare the hidden video before enabling play so the eventual click calls
    // play() directly, without first awaiting the stream's network load.
    this.playButton.disabled = true;
    void this.streamLoader
      .load()
      .then((): void => {
        this.streamLoaded = true;
      })
      .catch((error: unknown): void => {
        this.handlePlaybackError(error);
      })
      .finally((): void => {
        this.playButton.disabled = false;
      });
  }

  /**
   * @brief Return to the black screen once inline presentation is available.
   *
   * Clearing the pending identity before changing the UI makes duplicate exit
   * notifications harmless. Stream preparation survives this presentation change.
   */
  private showPlayButton(): void {
    this.pendingIdleTransition = null;
    // Recreate native controls on the next Play against the visible video.
    this.videoElement.controls = false;
    this.videoElement.style.visibility = "hidden";
    this.playButton.hidden = false;
  }

  /**
   * @brief Preserve the browser's video surface until it finishes leaving fullscreen.
   *
   * Inline playback returns to Play/Retry immediately. Fullscreen requests are
   * deduplicated until an actual exit, resumed playback, or request failure.
   */
  private requestIdleTransition(): void {
    if (this.pendingIdleTransition !== null) {
      return;
    }
    if (!this.fullscreen.isFullscreen()) {
      this.showPlayButton();
      return;
    }

    const idleTransition: object = {};
    this.pendingIdleTransition = idleTransition;
    this.fullscreen.exit((): void => {
      // Failed exits leave the native UI usable. A later manual exit must not
      // apply this abandoned transition to playback that the user has resumed.
      if (this.pendingIdleTransition === idleTransition) {
        this.pendingIdleTransition = null;
      }
    });
  }

  /**
   * @brief Pause failed playback and make Retry available when presentation allows.
   *
   * @param error Media, Shaka, preparation, or play failure. NotAllowedError
   * preserves the prepared stream so a new click can retry with user activation.
   */
  private handlePlaybackError(error: unknown): void {
    console.error("Video playback failed", error);
    // Permission failures leave the prepared stream usable. The next click can
    // call play() immediately, preserving the gesture Safari requires for audio.
    if (!(error instanceof Error && error.name === "NotAllowedError")) {
      this.streamLoaded = false;
    }
    this.videoElement.pause();
    this.requestIdleTransition();
    this.playButton.disabled = false;
    this.playButton.setAttribute(
      "aria-label",
      "Retry video playback with sound",
    );
    this.playButton.title = "Playback failed. Click to try again.";
  }

  /**
   * @brief Start playback with sound, reloading only after a fatal failure.
   *
   * A prepared stream reaches play() before the first await, preserving the
   * click's activation. Native Pause-related AbortError keeps controls usable.
   *
   * @return Promise fulfilled after play settles or a load/play failure has been
   * handled, with the button reenabled. Load and play failures are consumed;
   * an unexpected exception from failure handling or button cleanup rejects it.
   */
  private async startPlayback(): Promise<void> {
    // Prevent duplicate loads while preparing a failed stream for retry.
    this.playButton.disabled = true;

    try {
      if (!this.streamLoaded) {
        await this.streamLoader.load();
        this.streamLoaded = true;
      }

      // Every explicit start includes sound, regardless of old mute settings.
      this.videoElement.muted = false;
      this.videoElement.volume = 1;
      await this.videoElement.play();
    } catch (error: unknown) {
      // Native Pause can cancel play() while frames are still buffering. Keep
      // the video and controls visible so the user can resume normally.
      if (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        this.videoElement.paused &&
        this.videoElement.error === null
      ) {
        return;
      }
      this.handlePlaybackError(error);
    } finally {
      this.playButton.disabled = false;
    }
  }

  /**
   * @brief Complete only an idle transition still pending when exit is reported.
   *
   * Manual fullscreen exit does not mean playback ended and leaves native UI
   * visible. Clearing pending state before UI changes makes duplicates harmless.
   */
  private handleFullscreenExit(): void {
    // Manual exits during active playback do not request an idle screen. Clear
    // the pending state before changing the UI so duplicate signals are harmless.
    if (this.pendingIdleTransition !== null) {
      this.showPlayButton();
    }
  }

  /**
   * @brief Cancel pending idle work and clear Retry messaging on successful play.
   *
   * Native controls handle pause and seeking without hiding the video. This also
   * handles a native-controls resume while an earlier fullscreen exit is pending.
   */
  private handlePlaying(): void {
    this.pendingIdleTransition = null;
    this.playButton.removeAttribute("title");
    this.playButton.setAttribute("aria-label", "Play video with sound");
  }

  /**
   * @brief Request the idle presentation and rewind for immediate prepared replay.
   */
  private handleEnded(): void {
    this.requestIdleTransition();
    // Keep Shaka's prepared stream so the next click can replay immediately.
    this.videoElement.currentTime = 0;
  }

  /**
   * @brief Reveal native UI and request sound and fullscreen in the click handler.
   *
   * Calling startPlayback without awaiting it keeps fullscreen within the same
   * user activation, even when playback is still buffering or a retry must load.
   */
  private handlePlayClick(): void {
    this.pendingIdleTransition = null;
    // Firefox builds its native controls when controls is enabled. Reveal the
    // video first so the controls initialize against the visible layout.
    this.videoElement.style.visibility = "visible";
    this.videoElement.controls = true;
    this.playButton.hidden = true;

    // Start audio first, then request fullscreen in this same click handler.
    // Awaiting playback here would lose the gesture needed for fullscreen.
    void this.startPlayback();
    this.fullscreen.enter();
  }
}
