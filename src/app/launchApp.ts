/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { BrowseScreen } from "../browse/BrowseScreen";

/** @brief Launch the data-driven library and return its explicit lifecycle owner. */
export function launchApp(): BrowseScreen {
  return new BrowseScreen(document);
}
