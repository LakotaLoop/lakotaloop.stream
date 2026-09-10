/*
 * Copyright (C) 2025 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { defineConfig } from "vite";

// The app uses plain HTML and TypeScript; no UI renderer plugins are needed.

export default defineConfig({
  // Base path for all assets in production. Change this to "/myApp/" if the
  // site is deployed under a subdirectory.
  base: "/",
});
