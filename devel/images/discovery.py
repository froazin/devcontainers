"""Finds the images under images/src."""

import fnmatch
import os

from devel.images.config import IMAGE_MANIFEST_FILE, IMAGE_TEMPLATE_FILE, IMAGES_SRC_FOLDER


def image_dirs(name_filter: str | None = None, src_folder: str = IMAGES_SRC_FOLDER) -> list[str]:
    """Returns the image source directories that have both a manifest and a template.

    If name_filter is given, only images whose name matches it as a shell-style glob are returned.
    """

    dirs = []
    for name in sorted(os.listdir(src_folder)):
        image_dir = os.path.join(src_folder, name)
        if not os.path.isdir(image_dir):
            continue

        if name_filter is not None and not fnmatch.fnmatchcase(name, name_filter):
            continue

        required = [IMAGE_MANIFEST_FILE, IMAGE_TEMPLATE_FILE]
        missing = [f for f in required if not os.path.isfile(os.path.join(image_dir, f))]
        if missing:
            print(f"Skipping {name}: {', '.join(missing)} not found.")
            continue

        dirs.append(image_dir)

    return dirs
