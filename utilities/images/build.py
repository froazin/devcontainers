"""Builds and tags the images with the Dev Containers CLI and podman."""

import os
from collections.abc import Callable

import podman
from podman.domain.images import Image
from podman.errors import APIError

from utilities.images.config import (
    DEVCONTAINERS_BASE_COMMAND,
    IMAGE_DEVCONTAINER_FILE,
    IMAGE_MANIFEST_FILE,
    IMAGE_REPOSITORY,
    image_name,
)
from utilities.images.errors import ImageError, podman_api_error
from utilities.images.manifest import ImageManifest, render_template
from utilities.images.validation import check_manifests

type Runner = Callable[[str], object]
"""Runs a shell command, such as invoke's Context.run."""


def render_devcontainer(image_dir: str, manifest: ImageManifest, release: bool = True) -> None:
    """Writes the rendered template to the image's .devcontainer.json."""
    content = render_template(image_dir, manifest, release)
    with open(os.path.join(image_dir, IMAGE_DEVCONTAINER_FILE), "w") as f:
        f.write(content)


def install_npm_dependencies(run: Runner) -> None:
    """Installs the npm dependencies from package.json."""
    run("npm install")


def devcontainer_build(run: Runner, image_dir: str, ref: str, no_cache: bool = False) -> None:
    """Builds the image with the Dev Containers CLI."""
    run(
        " ".join(
            [
                *DEVCONTAINERS_BASE_COMMAND,
                "build",
                f"--workspace-folder={image_dir}",
                f"--image-name={ref}",
                "--no-lockfile",
                *(["--no-cache"] if no_cache else []),
            ]
        )
    )


def check_labels(image: Image, ref: str, expected: dict[str, str]) -> None:
    """Raises ImageError if any expected label is missing or different."""
    labels = image.labels or {}
    wrong = [
        f"{key} is {labels.get(key)!r}, not {value!r}" for key, value in expected.items() if labels.get(key) != value
    ]
    if wrong:
        raise ImageError(f"Image {ref} has the wrong labels: {'; '.join(wrong)}.")


def tag_image(image: Image, ref: str, tags: list[str]) -> None:
    """Adds each tag to the image in the image repository."""
    for tag in tags:
        print(f"Tagging image {ref} as {tag}")
        image.tag(repository=IMAGE_REPOSITORY, tag=tag)


def build_image(
    run: Runner,
    client: podman.PodmanClient,
    image_dir: str,
    *,
    no_cache: bool = False,
    release: bool = True,
) -> None:
    """Builds one image, checks its labels and tags it."""
    manifest = ImageManifest.from_json(os.path.join(image_dir, IMAGE_MANIFEST_FILE))
    ref = image_name(os.path.basename(image_dir), release)
    tags = manifest.image_tags(release)

    render_devcontainer(image_dir, manifest, release)
    devcontainer_build(run, image_dir, ref, no_cache)
    image = client.images.get(ref)
    check_labels(image, ref, manifest.labels(release))
    tag_image(image, ref, tags)


def build_images(run: Runner, image_dirs: list[str], *, no_cache: bool = False, release: bool = False) -> None:
    """Checks every manifest and installs the npm dependencies, then builds each image."""
    check_manifests()
    install_npm_dependencies(run)

    try:
        with podman.PodmanClient.from_env() as client:
            for image_dir in image_dirs:
                build_image(run, client, image_dir, no_cache=no_cache, release=release)
    except APIError as error:
        raise podman_api_error(error) from error
