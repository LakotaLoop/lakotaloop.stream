/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

/** @brief Normalize delivered DOM keys; no packaged-TV key registration is used. */
export function normalizeKey(event: { key: string; keyCode: number }): string {
  // Older WebKit used unprefixed direction names and Spacebar. Numeric fallback
  // is restricted to standard keyboard arrows/Enter when no useful key exists.
  const aliases: Readonly<Record<string, string>> = {
    Left: "ArrowLeft",
    Right: "ArrowRight",
    Up: "ArrowUp",
    Down: "ArrowDown",
    Spacebar: " ",
  };
  const codes: Readonly<Record<number, string>> = {
    13: "Enter",
    32: " ",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
  };
  return (
    aliases[event.key] ??
    (event.key === "" || event.key === "Unidentified"
      ? (codes[event.keyCode] ?? event.key)
      : event.key)
  );
}

/** @brief Display measured runtime at a readable whole-second precision. */
export function formatRuntime(durationSeconds: number): string {
  const seconds: number = Math.round(durationSeconds);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
}
