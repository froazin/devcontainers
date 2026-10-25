"""Finds the images under images/src."""

import fnmatch
import os

from devel.images.config import IMAGE_MANIFEST_FILE, IMAGE_TEMPLATE_FILE, IMAGES_SRC_FOLDER
from devel.images.errors import ImageError


def image_dirs(name_filter: str | None = None, src_folder: str = IMAGES_SRC_FOLDER) -> list[str]:
    """Returns the image source directories that have both a manifest and a template, in name order.

    If name_filter is given, only images whose folder name matches it as a shell-style glob are returned. Raises
    ImageError when no image is left.
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

    if not dirs:
        found = "was found" if name_filter is None else f"matches the filter {name_filter!r}"
        raise ImageError(f"No image in {src_folder} with a {IMAGE_MANIFEST_FILE} and a {IMAGE_TEMPLATE_FILE} {found}.")

    return dirs
