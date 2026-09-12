/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import process from "node:process";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// All projects exercise the production build over HTTP. Touch and TV projects
// simulate input/layout only; neither claims testing on physical mobile/TV OSes.
const configuration: PlaywrightTestConfig = {
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4175",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm build && node e2e/serve-build.mjs",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "firefox",
      testIgnore: "**/fullscreen-hls.spec.ts",
      use: { browserName: "firefox", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit",
      testIgnore: "**/fullscreen-hls.spec.ts",
      use: { browserName: "webkit", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "touch-portrait",
      testIgnore: "**/fullscreen-hls.spec.ts",
      use: {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "touch-landscape",
      testIgnore: "**/fullscreen-hls.spec.ts",
      use: {
        browserName: "webkit",
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "tv-keyboard",
      use: {
        browserName: "chromium",
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
};

export default defineConfig(configuration);
