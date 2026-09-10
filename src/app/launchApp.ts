/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { VideoPlayer } from "../player/VideoPlayer";

// The page owns its stream choice; the player modules accept any stream URL.
const STREAM_URL: string =
  "https://stream.mux.com/dDkIbyl402OA1QkR3CgEMVUQltsjzF1ulB4579ff7sB8.m3u8";

/** Read the page's elements and configure its video player. */
export function launchApp(): void {
  const videoElement: HTMLVideoElement | null =
    document.querySelector<HTMLVideoElement>("#background-video");
  const playButton: HTMLButtonElement | null =
    document.querySelector<HTMLButtonElement>("#play-button");

  if (videoElement === null || playButton === null) {
    throw new Error("The video or play button is missing from the page.");
  }

  const player: VideoPlayer = new VideoPlayer(
    videoElement,
    playButton,
    STREAM_URL,
  );
  player.initialize();
}
