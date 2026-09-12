/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { describe, expect, it } from "vitest";

import { finishTime, formatRuntime, normalizeKey } from "../src/browse/format";

describe("browse display and delivered keyboard input", (): void => {
  it("normalizes legacy arrow and Enter values without aliasing browser Back", (): void => {
    expect(normalizeKey({ key: "Left", keyCode: 0 })).toBe("ArrowLeft");
    expect(normalizeKey({ key: "Unidentified", keyCode: 13 })).toBe("Enter");
    expect(normalizeKey({ key: "", keyCode: 39 })).toBe("ArrowRight");
    expect(normalizeKey({ key: "BrowserBack", keyCode: 0 })).toBe(
      "BrowserBack",
    );
    expect(normalizeKey({ key: "Spacebar", keyCode: 32 })).toBe(" ");
  });
  it("calculates finish time from actual fractional duration across midnight", (): void => {
    const now: Date = new Date("2026-09-12T23:58:00Z");
    expect(finishTime(now, 254.287375).toISOString()).toBe(
      "2026-09-13T00:02:14.287Z",
    );
  });
  it("rounds measured runtime to the nearest second without inventing minutes", (): void => {
    expect(formatRuntime(254.287375)).toBe("4 min 14 sec");
    expect(formatRuntime(1087.530667)).toBe("18 min 8 sec");
  });
});
