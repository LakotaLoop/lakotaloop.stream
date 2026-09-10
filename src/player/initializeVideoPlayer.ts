/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { createShakaStreamLoader } from "./createShakaStreamLoader";
import { enterVideoFullscreen, exitVideoFullscreen } from "./fullscreen";

/** Connect native video playback to a play/retry button and prepare the stream. */
export function initializeVideoPlayer(
  videoElement: HTMLVideoElement,
  playButton: HTMLButtonElement,
  streamUrl: string,
): void {
  let streamLoaded: boolean = false;
  const loadStream: () => Promise<void> = createShakaStreamLoader(
    videoElement,
    streamUrl,
    handlePlaybackError,
  );

  /** Return to the black screen after the video ends or playback fails. */
  function showPlayButton(): void {
    // Recreate native controls on the next Play against the visible video.
    videoElement.controls = false;
    videoElement.style.visibility = "hidden";
    playButton.hidden = false;
    exitVideoFullscreen(videoElement);
  }

  /** Leave a usable retry button instead of getting stuck on a blank screen. */
  function handlePlaybackError(error: unknown): void {
    console.error("Video playback failed", error);
    // Permission failures leave the prepared stream usable. The next click can
    // call play() immediately, preserving the gesture Safari requires for audio.
    if (!(error instanceof Error && error.name === "NotAllowedError")) {
      streamLoaded = false;
    }
    videoElement.pause();
    showPlayButton();
    playButton.disabled = false;
    playButton.setAttribute("aria-label", "Retry video playback with sound");
    playButton.title = "Playback failed. Click to try again.";
  }

  /** Reuse the prepared stream, loading again only after a playback failure. */
  async function startPlayback(): Promise<void> {
    // Prevent duplicate loads while preparing a failed stream for retry.
    playButton.disabled = true;

    try {
      if (!streamLoaded) {
        await loadStream();
        streamLoaded = true;
      }

      // Every explicit start includes sound, regardless of old mute settings.
      videoElement.muted = false;
      videoElement.volume = 1;
      await videoElement.play();
    } catch (error: unknown) {
      // Native Pause can cancel play() while frames are still buffering. Keep
      // the video and controls visible so the user can resume normally.
      if (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        videoElement.paused &&
        videoElement.error === null
      ) {
        return;
      }
      handlePlaybackError(error);
    } finally {
      playButton.disabled = false;
    }
  }

  // Native controls handle pause and seeking without hiding the video. Clear
  // retry messaging once playback succeeds, including a native-controls resume.
  videoElement.addEventListener("playing", (): void => {
    playButton.removeAttribute("title");
    playButton.setAttribute("aria-label", "Play video with sound");
  });
  videoElement.addEventListener("ended", (): void => {
    showPlayButton();
    // Keep Shaka's prepared stream so the next click can replay immediately.
    videoElement.currentTime = 0;
  });
  videoElement.addEventListener("error", (): void => {
    handlePlaybackError(videoElement.error);
  });

  playButton.addEventListener("click", (): void => {
    // Firefox builds its native controls when controls is enabled. Reveal the
    // video first so the controls initialize against the visible layout.
    videoElement.style.visibility = "visible";
    videoElement.controls = true;
    playButton.hidden = true;

    // Start audio first, then request fullscreen in this same click handler.
    // Awaiting playback here would lose the gesture needed for fullscreen.
    void startPlayback();
    enterVideoFullscreen(videoElement);
  });

  // Prepare the hidden video before enabling play so the eventual click calls
  // play() directly, without first awaiting the stream's network load.
  playButton.disabled = true;
  void loadStream()
    .then((): void => {
      streamLoaded = true;
    })
    .catch(handlePlaybackError)
    .finally((): void => {
      playButton.disabled = false;
    });
}
