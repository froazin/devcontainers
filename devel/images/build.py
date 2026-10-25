"""Builds and tags the images with the Dev Containers CLI and podman."""

import os
from collections.abc import Callable

import jinja2
import podman
import pygit2

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
    """Renders the image's template into its .devcontainer.json. A failed render leaves the file as it was."""

    content = render_template(image_dir, manifest)
    with open(os.path.join(image_dir, IMAGE_DEVCONTAINER_FILE), "w") as f:
        f.write(content)


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


def devel_commit(path: str = ".") -> str:
    """Returns the short SHA of the commit checked out in the repository at or above path.

    Adds a -dirty suffix when the working tree has staged, unstaged or untracked changes. Ignored files don't count.
    """

    try:
        repo = pygit2.Repository(path)
        if repo.head_is_unborn:
            raise RuntimeError(f"Can't read the checked out commit: the repository at {repo.path} has no commits yet")

        sha = repo.revparse_single("HEAD").short_id
        dirty = bool(repo.status(untracked_files="normal"))
    except (pygit2.GitError, OSError) as error:
        raise RuntimeError(f"Can't read the checked out commit: {error}") from error

    return f"{sha}-dirty" if dirty else sha


def build_image(
    run: Runner,
    client: podman.PodmanClient,
    image_dir: str,
    no_cache: bool = False,
    commit: str | None = None,
) -> None:
    """Builds and tags one image: with its release tags, or with its devel tags for commit when commit is given."""

    manifest = ImageManifest.from_json(os.path.join(image_dir, IMAGE_MANIFEST_FILE))
    image_name = f"{IMAGE_REPOSITORY}:{os.path.basename(image_dir)}"
    tags = manifest.devel_tags(commit) if commit is not None else manifest.image_tags()

    render_devcontainer(image_dir, manifest)
    devcontainer_build(run, image_dir, image_name, no_cache)
    tag_image(client, image_name, tags)


def build_images(run: Runner, image_dirs: list[str], no_cache: bool = False, commit: str | None = None) -> None:
    client = podman.PodmanClient.from_env()
    for image_dir in image_dirs:
        build_image(run, client, image_dir, no_cache, commit)
