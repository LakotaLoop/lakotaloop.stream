/*
 * Copyright (C) 2026 Garrett Brown
 * This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * See the file LICENSE.txt for more information.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Exercise the import command with controlled files, never the user's Desktop. */
describe("deterministic content import", (): void => {
  let temporaryRoot: string;
  let sourceRoot: string;
  let outputRoot: string;
  let probeExecutable: string;
  let introNfo: string;

  beforeEach((): void => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "lakotaloop-content-"));
    sourceRoot = join(temporaryRoot, "source");
    outputRoot = join(temporaryRoot, "output");
    probeExecutable = join(temporaryRoot, "ffprobe");
    // ffprobe is the external process boundary; command/file handling and XML
    // parsing remain real. No codec binaries are required by this unit test.
    writeFileSync(
      probeExecutable,
      '#!/bin/sh\nprintf \'%s\\n\' \'{"streams":[{"width":256,"height":144}],"format":{"duration":"2.5"}}\'\n',
      { mode: 0o755 },
    );
    const entries: readonly (readonly [string, string])[] = [
      ["Lakota Loop Intro Video", "LL Intro"],
      [
        "Lakota Loop Halloween 2025 Rough Cut",
        "HALLOWEEN_2025_LakotaLoop_92_Rough-Cut-1",
      ],
    ];
    for (let index: number = 0; index < entries.length; index += 1) {
      const entry: readonly [string, string] = entries[index];
      const directory: string = join(sourceRoot, entry[0]);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, `${entry[1]}.nfo`),
        "<movie><title>Exact &amp; complete title</title><tagline></tagline><plot>First[CR]Second</plot><studio>Lakota Loop</studio></movie>",
      );
      writeFileSync(join(directory, `${entry[1]}.mp4`), "probe fixture");
      writeFileSync(
        join(directory, `${entry[1]}-fanart.jpg`),
        "exact fanart bytes",
      );
      writeFileSync(
        join(directory, `${entry[1]}-landscape.jpg`),
        "exact landscape bytes",
      );
      writeFileSync(join(directory, "alternative-HERO.png"), "never import me");
    }
    introNfo = join(sourceRoot, "Lakota Loop Intro Video", "LL Intro.nfo");
  });

  afterEach((): void => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  /** @brief Run the public importer CLI and retain diagnostics for assertions. */
  function importContent(): SpawnSyncReturns<string> {
    return spawnSync(
      "python3",
      [
        resolve("scripts/import-content.py"),
        "--source-root",
        sourceRoot,
        "--output-root",
        outputRoot,
        "--ffprobe",
        probeExecutable,
      ],
      { encoding: "utf8" },
    );
  }

  it("imports exact artwork, XML text and probe results repeatably", (): void => {
    const first: SpawnSyncReturns<string> = importContent();
    expect(first.status, first.stderr).toBe(0);
    const catalogPath: string = join(outputRoot, "src/catalog/movies.json");
    const firstJson: string = readFileSync(catalogPath, "utf8");
    const catalog: Record<string, unknown>[] = JSON.parse(firstJson) as Record<
      string,
      unknown
    >[];
    expect(catalog[0]).toMatchObject({
      id: "sunday-intro",
      title: "Exact & complete title",
      tagline: "",
      plot: "First Second",
      durationSeconds: 2.5,
      width: 256,
      height: 144,
      sourceBasename: "LL Intro",
      fanart: "/movies/sunday-intro/LL Intro-fanart.jpg",
      landscape: "/movies/sunday-intro/LL Intro-landscape.jpg",
    });
    expect(catalog[1].id).toBe("halloween-2025");
    expect(
      readFileSync(
        join(outputRoot, "public/movies/sunday-intro/LL Intro-fanart.jpg"),
        "utf8",
      ),
    ).toBe("exact fanart bytes");
    const second: SpawnSyncReturns<string> = importContent();
    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(catalogPath, "utf8")).toBe(firstJson);
    expect(readFileSync(introNfo, "utf8")).toContain("First[CR]Second");
  });

  it.each([
    '<!DOCTYPE movie [<!ENTITY injected "unsafe">]><movie><title>&injected;</title></movie>',
    "<movie><title>One</title><title>Two</title><tagline/><plot>Plot</plot><studio>Studio</studio></movie>",
    "<movie><title><b>Markup</b></title><tagline/><plot>Plot</plot><studio>Studio</studio></movie>",
  ])("rejects unsafe or ambiguous metadata", (xml: string): void => {
    writeFileSync(introNfo, xml);
    const result: SpawnSyncReturns<string> = importContent();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Content import failed:");
  });

  it("fails clearly when an exact pairing is missing", (): void => {
    rmSync(
      join(sourceRoot, "Lakota Loop Intro Video", "LL Intro-landscape.jpg"),
    );
    const result: SpawnSyncReturns<string> = importContent();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("LL Intro-landscape.jpg");
  });
});
