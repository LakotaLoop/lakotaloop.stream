#!/usr/bin/env bash
################################################################################
#
#  Copyright (C) 2026 Garrett Brown
#  This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
#
#  SPDX-License-Identifier: AGPL-3.0-or-later
#  See the file LICENSE.txt for more information.
#
################################################################################

set -euo pipefail
fixture_directory="$(cd "$(dirname "$0")" && pwd)/fixtures"
mkdir -p "$fixture_directory"

# Synthetic colors, different dimensions, and distinct quiet tones make source
# mixups observable without using any copyrighted movie or personal media.
for movie in intro halloween; do
  if [[ "$movie" == intro ]]; then
    dimensions=320x180
    color=0x245db5
    frequency=440
    duration=5
  else
    dimensions=426x240
    color=0xce671e
    frequency=880
    duration=7
  fi

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=$color:s=$dimensions:r=24" \
    -f lavfi -i "sine=frequency=$frequency:sample_rate=48000" \
    -t "$duration" -af volume=0.05 \
    -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p \
    -g 24 -keyint_min 24 -sc_threshold 0 -threads 1 -crf 28 \
    -c:a aac -b:a 48k -movflags +faststart \
    -map_metadata -1 "$fixture_directory/$movie.mp4"

  # Bundled Firefox on macOS may not decode H.264/AAC. Exercise genuine native
  # decoding there with VP8/Opus rather than faking a successful MP4 playback.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$fixture_directory/$movie.mp4" \
    -c:v libvpx -b:v 40k -threads 1 -c:a libopus -b:a 32k \
    -map_metadata -1 "$fixture_directory/$movie.webm"

  mkdir -p "$fixture_directory/$movie-hls"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$fixture_directory/$movie.mp4" -c copy \
    -hls_time 1 -hls_playlist_type vod -hls_segment_type fmp4 \
    -hls_segment_filename "$fixture_directory/$movie-hls/segment-%02d.m4s" \
    "$fixture_directory/$movie-hls/index.m3u8"
done
