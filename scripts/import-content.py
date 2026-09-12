#!/usr/bin/env python3
################################################################################
#
#  Copyright (C) 2026 Garrett Brown
#  This file is part of lakotaloop.stream - https://github.com/LakotaLoop/lakotaloop.stream
#
#  SPDX-License-Identifier: AGPL-3.0-or-later
#  See the file LICENSE.txt for more information.
#
################################################################################

"""Import only the two explicitly paired movies; never modify publishing inputs."""

import argparse
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET


# IDs survive display-title edits. No directory scans or artwork heuristics are
# used to select content: every input is derived from these exact basenames.
MOVIES: tuple[tuple[str, str, str], ...] = (
    ("sunday-intro", "Lakota Loop Intro Video", "LL Intro"),
    (
        "halloween-2025",
        "Lakota Loop Halloween 2025 Rough Cut",
        "HALLOWEEN_2025_LakotaLoop_92_Rough-Cut-1",
    ),
)


def required_file(path: Path) -> Path:
    """Require the exact case-sensitive basename, even on case-insensitive Macs."""
    if not path.parent.is_dir() or path.name not in (
        entry.name for entry in path.parent.iterdir()
    ):
        raise ValueError(f"Missing required pairing: {path}")
    if not path.is_file():
        raise ValueError(f"Required pairing is not a regular file: {path}")
    return path


def parse_nfo(path: Path) -> dict[str, str]:
    """Read plain text only, rejecting DTDs, entities and ambiguous XML fields.

    These files are small UTF-8 NFO documents. Rejecting declarations before
    ElementTree parsing prevents entity expansion and external-resource input;
    the size limit also bounds parsing work. Built-in XML escapes remain valid.
    """
    if path.stat().st_size > 1024 * 1024:
        raise ValueError(f"NFO exceeds the 1 MiB metadata limit: {path}")
    xml_text: str = path.read_text(encoding="utf-8-sig")
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", xml_text, re.IGNORECASE):
        raise ValueError(f"DTD and entity declarations are forbidden: {path}")
    root: ET.Element = ET.fromstring(xml_text)
    if root.tag != "movie":
        raise ValueError(f"Expected one movie document: {path}")
    metadata: dict[str, str] = {}
    for field in ("title", "tagline", "plot", "studio"):
        elements: list[ET.Element] = root.findall(field)
        if len(elements) != 1 or len(elements[0]) != 0:
            raise ValueError(f"Expected one plain-text {field} field: {path}")
        # Kodi's layout markers become spaces so website text wraps naturally.
        value: str = (elements[0].text or "").strip().replace("[CR]", " ")
        if field != "tagline" and not value:
            raise ValueError(f"Required {field} field is empty: {path}")
        metadata[field] = value
    return metadata


def probe_video(path: Path, executable: str) -> dict[str, int | float]:
    """Read dimensions of the first video stream and actual container duration."""
    result: subprocess.CompletedProcess[str] = subprocess.run(
        [
            executable,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration",
            "-of", "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    data: dict = json.loads(result.stdout)
    streams: list[dict] = data.get("streams", [])
    if len(streams) != 1:
        raise ValueError(f"Expected one selected video stream: {path}")
    width: int = streams[0].get("width", 0)
    height: int = streams[0].get("height", 0)
    duration: float = float(data.get("format", {}).get("duration", 0))
    if (
        type(width) is not int
        or type(height) is not int
        or width <= 0
        or height <= 0
        or not math.isfinite(duration)
        or duration <= 0
    ):
        raise ValueError(f"Invalid video dimensions or duration: {path}")
    return {"durationSeconds": duration, "width": width, "height": height}


def import_content(source_root: Path, output_root: Path, executable: str) -> None:
    """Validate all sources before copying exact JPEG bytes and writing the catalog."""
    source_root = source_root.resolve()
    output_root = output_root.resolve()
    # Even explicit CLI overrides cannot write into the read-only source tree.
    if output_root == source_root or source_root in output_root.parents:
        raise ValueError("Output must be outside the publishing source directory")
    catalog: list[dict] = []
    artwork_copies: list[tuple[Path, Path]] = []
    for movie_id, directory, basename in MOVIES:
        movie_directory: Path = source_root / directory
        nfo: Path = required_file(movie_directory / f"{basename}.nfo")
        video: Path = required_file(movie_directory / f"{basename}.mp4")
        fanart: Path = required_file(movie_directory / f"{basename}-fanart.jpg")
        landscape: Path = required_file(movie_directory / f"{basename}-landscape.jpg")
        catalog.append({
            "id": movie_id,
            **parse_nfo(nfo),
            **probe_video(video, executable),
            "fanart": f"/movies/{movie_id}/{fanart.name}",
            "landscape": f"/movies/{movie_id}/{landscape.name}",
            "sourceBasename": basename,
        })
        asset_directory: Path = output_root / "public" / "movies" / movie_id
        artwork_copies.extend((image, asset_directory / image.name) for image in (fanart, landscape))

    for source, destination in artwork_copies:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    catalog_path: Path = output_root / "src" / "catalog" / "movies.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(catalog)} movies and {len(artwork_copies)} exact JPEGs into {output_root}")


def main() -> int:
    """Expose an optional preparation command; builds consume committed output."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=Path.home() / "Desktop/_PUBLISH/lakotaloop.stream")
    parser.add_argument("--output-root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--ffprobe", default="ffprobe", help="ffprobe executable (default: ffprobe on PATH)")
    arguments: argparse.Namespace = parser.parse_args()
    try:
        import_content(arguments.source_root, arguments.output_root, arguments.ffprobe)
    except (OSError, ValueError, ET.ParseError, subprocess.SubprocessError) as error:
        print(f"Content import failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
