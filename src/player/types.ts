/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

/** @brief Explicit per-movie source; presentation metadata lives in the catalog. */
export interface PlaybackSource {
  id: string;
  kind: "mp4" | "hls";
  url: string;
}

/** @brief The browser keeps the native video surface for playing and stopping. */
export type PlaybackState =
  "idle" | "preparing" | "ready" | "playing" | "stopping" | "error";

/** @brief Observable playback state without exposing mutable player internals. */
export interface PlayerSnapshot {
  state: PlaybackState;
  sourceId: string | null;
  message: string;
}
