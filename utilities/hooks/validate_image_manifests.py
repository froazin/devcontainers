#!/usr/bin/env python3
"""Claude Code PostToolUse hook: check the image manifests after an edit to a file in WATCHED.

Claude Code only passes stderr to Claude on exit 2, so that's how the errors reach it.
"""

import json
import os
import sys
from pathlib import Path, PurePosixPath
from typing import cast

ROOT = Path(__file__).resolve().parents[2]
# Mirrors the paths of .claude/rules/image-manifest.md.
WATCHED = [
    "schemas/image-manifest.schema.json",
    "images/src/*/manifest.json",
    "images/src/*/template.json",
    "utilities/images/manifest.py",
]


def as_object(value: object) -> dict[str, object]:
    """Returns the value if it's a dict, or an empty dict."""
    return cast(dict[str, object], value) if isinstance(value, dict) else {}


def as_str(value: object) -> str:
    """Returns the value if it's a string, or an empty string."""
    return value if isinstance(value, str) else ""


def edited_file(event: object) -> str:
    """Returns the edited file's path from the hook event, or an empty string."""
    return as_str(as_object(as_object(event).get("tool_input")).get("file_path"))


def is_watched(path: str, root: Path = ROOT) -> bool:
    """Returns whether the manifest checks cover the path."""
    try:
        relative = Path(path).resolve().relative_to(root)
    except ValueError:
        return False

    return any(PurePosixPath(relative.as_posix()).full_match(pattern) for pattern in WATCHED)


def main() -> int:
    """Runs the checks after an edit to a watched file, and returns the hook's exit code."""
    try:
        event: object = json.load(sys.stdin)
    except ValueError:
        return 0

    if not is_watched(edited_file(event)):
        return 0

    # The checks use paths relative to the repository root, and import utilities from it.
    os.chdir(ROOT)
    sys.path.append(str(ROOT))
    try:
        from utilities.images import validation
        from utilities.images.errors import ImageError
    except ImportError as error:
        print(f"Can't run the image manifest checks: {error}. Run `uv sync`.", file=sys.stderr)
        return 1

    try:
        validation.check_manifests()
    except ImageError as error:
        print(error, file=sys.stderr)
        print("Fix them by following the image-manifest-schema skill.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
