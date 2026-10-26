"""Builds and tags the images with the Dev Containers CLI and podman."""

import os
from collections.abc import Callable

import podman
from podman.domain.images import Image
from podman.errors import APIError

from devel.images.config import (
    DEVCONTAINERS_BASE_COMMAND,
    IMAGE_DEVCONTAINER_FILE,
    IMAGE_MANIFEST_FILE,
    IMAGE_REPOSITORY,
    image_name,
)
from devel.images.errors import ImageError, podman_api_error
from devel.images.manifest import ImageManifest, render_template
from devel.images.validation import check_manifests

type Runner = Callable[[str], object]
"""Runs a shell command, such as invoke's Context.run."""


def render_devcontainer(image_dir: str, manifest: ImageManifest, release: bool = True) -> None:
    """Renders the image's template into its .devcontainer.json. A failed render leaves the file as it was."""

    content = render_template(image_dir, manifest, release)
    with open(os.path.join(image_dir, IMAGE_DEVCONTAINER_FILE), "w") as f:
        f.write(content)


def install_cli(run: Runner) -> None:
    """Installs the Dev Containers CLI from package.json."""

    run("npm install")


def devcontainer_build(run: Runner, image_dir: str, ref: str, no_cache: bool = False) -> None:
    """Builds the image from the .devcontainer.json in image_dir with the Dev Containers CLI, and names it ref."""

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
    """Raises ImageError when the built image's labels differ from expected. ref names the image in the message."""

    labels = image.labels or {}
    wrong = [
        f"{key} is {labels.get(key)!r}, not {value!r}" for key, value in expected.items() if labels.get(key) != value
    ]
    if wrong:
        raise ImageError(f"Image {ref} has the wrong labels: {'; '.join(wrong)}.")


def tag_image(image: Image, ref: str, tags: list[str]) -> None:
    """Tags the built image with each tag in IMAGE_REPOSITORY. ref names the image in the output."""

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
    """Builds and tags one image, as a release or a dev build."""

    manifest = ImageManifest.from_json(os.path.join(image_dir, IMAGE_MANIFEST_FILE))
    ref = image_name(os.path.basename(image_dir), release)
    tags = manifest.image_tags(release)

    render_devcontainer(image_dir, manifest, release)
    devcontainer_build(run, image_dir, ref, no_cache)
    image = client.images.get(ref)
    check_labels(image, ref, manifest.labels(release))
    tag_image(image, ref, tags)


def build_images(run: Runner, image_dirs: list[str], *, no_cache: bool = False, release: bool = False) -> None:
    """Builds and tags each image, as a dev build or, with release, as a release.

    Checks every manifest before it installs or builds anything, so a mistake stops the run early. Raises ImageError
    for a failure the user can fix, including a podman API call that fails.
    """

    check_manifests()
    install_cli(run)

    try:
        with podman.PodmanClient.from_env() as client:
            for image_dir in image_dirs:
                build_image(run, client, image_dir, no_cache=no_cache, release=release)
    except APIError as error:
        raise podman_api_error(error) from error
