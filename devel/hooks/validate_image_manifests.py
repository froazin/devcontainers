#!/usr/bin/env python3
"""Claude Code hook: check the image manifests after an edit that can break them.

PostToolUse on Edit and Write. When the edited file is one of WATCHED, it runs devel.images.validation, which checks
that the manifest schema, the ImageManifest dataclass, each image's manifest.json and its template.json agree. Exit 2
sends the errors back to Claude, and exit 0 means there's nothing to report.

.claude/hooks/validate_image_manifests.sh runs this script with the project's virtual environment. It lives outside
.claude because Pyright doesn't check files in dot-directories. Run the wrapper with --all to check without a hook
event, for example after changing a manifest by hand.
"""

import json
import os
import sys
from pathlib import Path, PurePosixPath
from typing import cast

ROOT = Path(__file__).resolve().parents[2]
WATCHED = [
    "schemas/image-manifest.schema.json",
    "images/src/*/manifest.json",
    "images/src/*/template.json",
    "devel/images/manifest.py",
]


def as_object(value: object) -> dict[str, object]:
    return cast(dict[str, object], value) if isinstance(value, dict) else {}


def as_str(value: object) -> str:
    return value if isinstance(value, str) else ""


def edited_file(event: object) -> str:
    """Returns the path of the file the tool call edited, or an empty string."""

    return as_str(as_object(as_object(event).get("tool_input")).get("file_path"))


def is_watched(path: str, root: Path = ROOT) -> bool:
    """Returns whether path is a file the image manifest checks cover."""

    try:
        relative = Path(path).resolve().relative_to(root)
    except ValueError:
        return False

    return any(PurePosixPath(relative.as_posix()).full_match(pattern) for pattern in WATCHED)


def main(argv: list[str]) -> int:
    if "--all" not in argv:
        try:
            event: object = json.load(sys.stdin)
        except ValueError:
            return 0

        if not is_watched(edited_file(event)):
            return 0

    # The checks use paths relative to the repository root, and import devel from it.
    os.chdir(ROOT)
    sys.path.append(str(ROOT))
    try:
        from devel.images import validation
    except ImportError as error:
        print(f"Can't run the image manifest checks: {error}. Run `uv sync`.", file=sys.stderr)
        return 1

    errors = validation.validate()
    if not errors:
        if "--all" in argv:
            print("The image manifests, their schema, ImageManifest and the templates agree.")
        return 0

    print("The image manifest checks failed:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    print("Fix them by following the image-manifest-schema skill.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
