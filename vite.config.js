/*
 * Copyright (C) 2025 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { defineConfig } from "vitest/config";
import { createLocalMediaPlugin } from "./scripts/local-media.js";

// The app uses plain HTML and TypeScript; no UI renderer plugins are needed.

export default defineConfig({
  // Base path for all assets in production. Change this to "/myApp/" if the
  // site is deployed under a subdirectory.
  base: "/",
  plugins: [createLocalMediaPlugin()],
  // Explicit syntax/CSS floor for modern TV browsers; runtime media APIs are
  // feature-detected. No UA sniffing or packaged television SDK is required.
  build: {
    target: ["chrome80", "firefox78", "safari14"],
    cssTarget: ["chrome80", "firefox78", "safari14"],
  },
  // Playwright owns e2e discovery; Vitest retains the fast isolated regressions.
  test: { include: ["test/**/*.test.ts"] },
});
