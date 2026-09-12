/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

/** @brief Imported descriptive, technical and artwork data for one stable movie. */
export interface Movie {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly plot: string;
  readonly studio: string;
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly fanart: string;
  readonly landscape: string;
  /** Original media basename links copied artwork back to its publishing inputs. */
  readonly sourceBasename: string;
}
