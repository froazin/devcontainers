"""Task definitions for the devcontainers project.

Each task is a thin wrapper around devel.images, which does the work. See docs/dev-tooling.md.
"""

from collections.abc import Generator
from contextlib import contextmanager

from invoke.context import Context
from invoke.exceptions import Exit
from invoke.tasks import task

from devel import images

FILTER_HELP = "Only include images whose folder name matches this shell-style glob, such as `base`."
SUITE_HELP = "`images`. `features` isn't implemented yet."
NO_CACHE_HELP = "Build the images without using the build cache."
IS_RELEASE_HELP = "Build a release, tagged with the version in manifest.json, instead of a dev build tagged <tag>-dev."
TEST_IS_RELEASE_HELP = "Build and test the release build of each image instead of its dev build."
SKIP_BUILD_HELP = "Test the images that are already built instead of building them first."


@contextmanager
def _exit_on_image_error() -> Generator[None]:
    """Turns an ImageError into an Exit with status 1, so Invoke prints its message without a traceback."""

    try:
        yield
    except images.ImageError as error:
        raise Exit(str(error), code=1) from error


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
    """Checks the image manifests, then builds and tags the images under images/src.

    For the image names and tags, see docs/images/builds.md.

    Examples:
      invoke build images
      invoke build images --filter base
      invoke build images --no-cache
      invoke build images --is-release
    """

    match suite:
        case "images":
            with _exit_on_image_error():
                images.build_images(c.run, images.image_dirs(filter_), no_cache=no_cache, release=is_release)
        case "features":
            raise NotImplementedError("Building for features is not implemented.")
        case _:
            raise Exit(f"{suite} is not a valid build suite.", code=1)


@task(
    positional=["suite"],
    help={
        "suite": SUITE_HELP,
        "filter": FILTER_HELP,
        "skip_build": SKIP_BUILD_HELP,
        "no_cache": NO_CACHE_HELP,
        "is_release": TEST_IS_RELEASE_HELP,
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
    """Builds the images, then runs each image's images/test/<image>/test.sh inside it.

    Images without a test.sh are skipped. Exits with status 1 if any image fails. See docs/images/tests.md.

    Examples:
      invoke test images
      invoke test images --filter base
      invoke test images --skip-build
      invoke test images --no-cache
      invoke test images --is-release
    """

    if skip_build and no_cache:
        print("Warning: --no-cache has no effect with --skip-build, so it will be ignored.")

    match suite:
        case "images":
            with _exit_on_image_error():
                image_dirs = images.image_dirs(filter_)
                if not skip_build:
                    images.build_images(c.run, image_dirs, no_cache=no_cache, release=is_release)
                images.run_image_tests(image_dirs, release=is_release)
        case "features":
            raise NotImplementedError("Testing for features is not implemented.")
        case _:
            raise Exit(f"{suite} is not a valid test suite.", code=1)


@task(
    positional=["suite"],
    help={"suite": SUITE_HELP},
)
def validate(_: Context, suite: str) -> None:
    """Checks that the image manifests, their schema, ImageManifest and the templates agree.

    Exits with status 1 and lists the errors if anything disagrees. See docs/images/manifests.md.

    Examples:
      invoke validate images
    """

    match suite:
        case "images":
            with _exit_on_image_error():
                images.check_manifests()
            print("The image manifests, their schema, ImageManifest and the templates agree.")
        case "features":
            raise NotImplementedError("Validation for features is not implemented.")
        case _:
            raise Exit(f"{suite} is not a valid validate suite.", code=1)
