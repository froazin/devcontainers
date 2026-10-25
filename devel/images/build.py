"""Builds and tags the images with the Dev Containers CLI and podman."""

import os
from collections.abc import Callable

import jinja2
import podman

from devel.images.config import (
    DEVCONTAINERS_BASE_COMMAND,
    IMAGE_DEVCONTAINER_FILE,
    IMAGE_MANIFEST_FILE,
    IMAGE_REPOSITORY,
    IMAGE_TEMPLATE_FILE,
)
from devel.images.manifest import ImageManifest

type Runner = Callable[[str], object]
"""Runs a shell command, such as invoke's Context.run."""


def render_template(image_dir: str, manifest: ImageManifest) -> str:
    """Returns the image's template rendered with its manifest."""

    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(image_dir),
        undefined=jinja2.StrictUndefined,
        keep_trailing_newline=True,
    )

    return manifest.render_template(env.get_template(IMAGE_TEMPLATE_FILE))


def render_devcontainer(image_dir: str, manifest: ImageManifest) -> None:
    """Renders the image's template into its .devcontainer.json."""

    with open(os.path.join(image_dir, IMAGE_DEVCONTAINER_FILE), "w") as f:
        f.write(render_template(image_dir, manifest))


def devcontainer_build(run: Runner, image_dir: str, image_name: str, no_cache: bool = False) -> None:
    run(
        " ".join(
            [
                *DEVCONTAINERS_BASE_COMMAND.split(),
                "build",
                f"--workspace-folder={image_dir}",
                f"--image-name={image_name}",
                "--no-lockfile",
                *(["--no-cache"] if no_cache else []),
            ]
        )
    )


def tag_image(client: podman.PodmanClient, image_name: str, tags: list[str]) -> None:
    image = client.images.get(image_name)
    for tag in tags:
        print(f"Tagging image {image_name} as {tag}")
        image.tag(repository=IMAGE_REPOSITORY, tag=tag)


def build_image(run: Runner, client: podman.PodmanClient, image_dir: str, no_cache: bool = False) -> None:
    manifest = ImageManifest.from_json(os.path.join(image_dir, IMAGE_MANIFEST_FILE))
    image_name = f"{IMAGE_REPOSITORY}:{os.path.basename(image_dir)}"
    tags = manifest.image_tags()

    render_devcontainer(image_dir, manifest)
    devcontainer_build(run, image_dir, image_name, no_cache)
    tag_image(client, image_name, tags)


def build_images(run: Runner, image_dirs: list[str], no_cache: bool = False) -> None:
    client = podman.PodmanClient.from_env()
    for image_dir in image_dirs:
        build_image(run, client, image_dir, no_cache)
