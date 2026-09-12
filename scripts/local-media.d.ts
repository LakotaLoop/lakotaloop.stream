/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import type { Plugin } from "vite";

/** @brief Create the development-only plugin, optionally with a fixture root. */
// Declaration parameters describe the API rather than a function body.
// eslint-disable-next-line no-unused-vars
export function createLocalMediaPlugin(sourceRoot?: string): Plugin;
