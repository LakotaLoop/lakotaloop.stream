/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import movieData from "./movies.json";
import type { Movie } from "./types";

// Committed preparation output keeps normal builds and browsing independent of
// the publishing machine, ffprobe, and video network requests.
export const movies: readonly Movie[] = movieData;
