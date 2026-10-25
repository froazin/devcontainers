"""Task definitions for the devcontainers project."""

import shutil

from invoke.context import Context
from invoke.exceptions import Exit
from invoke.tasks import task

from devel import images

FILTER_HELP = "Only include images whose name matches this shell-style glob, such as `base` or `ubuntu-*`."
SUITE_HELP = "`images` or `features`"
NO_CACHE_HELP = "Build the images without using the build cache."
IS_RELEASE_HELP = (
    "Tag the images with the version in manifest.json. Without it, they get -devel and the current commit's short SHA,"
    " with -dirty when the working tree has uncommitted changes."
)
SKIP_BUILD_HELP = "Test the images that are already built instead of building them first."


def _npm_install(c: Context) -> None:
    """Sets up Node.js dependencies for the devcontainers project."""

    if shutil.which("npm") is None:
        raise RuntimeError("npm is not on PATH.")

    c.run(" ".join(["npm", "install"]))


def _image_dirs(name_filter: str | None) -> list[str]:
    """Returns the image directories to work on, and exits if a filter matches none of them."""

    image_dirs = images.image_dirs(name_filter)
    if name_filter is not None and not image_dirs:
        raise Exit(f"No images match the filter {name_filter!r}.", code=1)

    return image_dirs


def _build_commit(is_release: bool) -> str | None:
    """Returns the commit to tag the build with, or None for a release, which uses the manifest versions."""

    return None if is_release else images.devel_commit()


@task(
    positional=["suite"],
    help={"suite": SUITE_HELP, "filter": FILTER_HELP, "no_cache": NO_CACHE_HELP, "is_release": IS_RELEASE_HELP},
)
def build(
    c: Context,
    suite: str,
    filter_: str | None = None,
    no_cache: bool = False,
    is_release: bool = False,
) -> None:
    """Builds and tags the images under images/src.

    Each image's template.json is rendered into its .devcontainer.json, built with the Dev Containers CLI, then
    tagged from the tags in its manifest.json. Each tag is applied on its own and with a -devel<short SHA> suffix for
    the current commit, ending in -dirty when the working tree has uncommitted changes. With --is-release, it gets
    version suffixes from the manifest instead.

    Examples:
      invoke build images
      invoke build images --filter base
      invoke build images --no-cache
      invoke build images --is-release
    """

    match suite:
        case "images":
            image_dirs = _image_dirs(filter_)
            commit = _build_commit(is_release)
            _npm_install(c)
            images.build_images(c.run, image_dirs, no_cache, commit)
        case _:
            print(f"{suite} is not a valid build suite.")


@task(
    positional=["suite"],
    optional=["skip_build"],
    help={
        "suite": SUITE_HELP,
        "filter": FILTER_HELP,
        "skip_build": SKIP_BUILD_HELP,
        "no_cache": NO_CACHE_HELP,
        "is_release": IS_RELEASE_HELP,
    },
)
def test(
    c: Context,
    suite: str,
    filter_: str | None = None,
    skip_build: bool = False,
    no_cache: bool = False,
    is_release: bool = False,
) -> None:
    """Builds the images, then runs each image's test project inside it.

    The tests for an image live in images/test/<image>/test.sh. Images without one are skipped. Exits with status 1
    if any image fails its tests. Pass --skip-build to test the images that are already built, or --no-cache to
    build them without the build cache. The build tags the images as `invoke build` does, including --is-release.

    Examples:
      invoke test images
      invoke test images --filter 'ubuntu-*'
      invoke test images --skip-build
      invoke test images --no-cache
      invoke test images --is-release
    """

    if skip_build and no_cache:
        print("Warning: --no-cache has no effect with --skip-build, so it will be ignored.")
    if skip_build and is_release:
        print("Warning: --is-release has no effect with --skip-build, so it will be ignored.")

    match suite:
        case "images":
            image_dirs = _image_dirs(filter_)
            if not skip_build:
                commit = _build_commit(is_release)
                _npm_install(c)
                images.build_images(c.run, image_dirs, no_cache, commit)

            failed = images.test_images(image_dirs)
            if failed:
                raise Exit(f"Image tests failed: {', '.join(failed)}", code=1)
        case _:
            print(f"{suite} is not a valid test suite.")


@task(
    positional=["suite"],
    help={"suite": SUITE_HELP},
)
def validate(c: Context, suite: str) -> None:
    """Checks that the image manifests, their schema, ImageManifest and the templates agree.

    Validates the schema, then each image's manifest.json against it. Compares the schema with the ImageManifest
    dataclass, and renders each image's template.json without building it. Exits with status 1 and lists the errors
    if anything disagrees.

    Examples:
      invoke validate images
    """

    match suite:
        case "images":
            errors = images.validate()
            if errors:
                raise Exit("\n".join(["Image manifest checks failed:", *(f"- {error}" for error in errors)]), code=1)

            print("The image manifests, their schema, ImageManifest and the templates agree.")
        case _:
            print(f"{suite} is not a valid validate suite.")
