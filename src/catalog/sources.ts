/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type { PlaybackSource } from "../player/types";

/**
 * @brief Resolve an explicitly verified movie mapping for the current build.
 * @param id Stable catalog ID, independent of any display title.
 * @return The correct local MP4 or published HLS source; null for unknown IDs.
 */
export function resolveSource(id: string): PlaybackSource | null {
  // The user supplied the intro URL and confirmed the pre-existing stream is
  // the Halloween rough cut. Keep each identity explicit; never use a fallback
  // that could silently play a different movie.
  let publishedUrl: string;
  switch (id) {
    case "sunday-intro":
      publishedUrl =
        "https://stream.mux.com/I9ip5M7pvlHQ2wLFIJ6H3rLSg72QliatilZksyI2n5s.m3u8";
      break;
    case "halloween-2025":
      publishedUrl =
        "https://stream.mux.com/dDkIbyl402OA1QkR3CgEMVUQltsjzF1ulB4579ff7sB8.m3u8";
      break;
    default:
      return null;
  }
  return import.meta.env.DEV
    ? { id, kind: "mp4", url: `/__local-media/${id}.mp4` }
    : { id, kind: "hls", url: publishedUrl };
}
