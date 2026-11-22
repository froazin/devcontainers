"""Invoke tasks for the devcontainers project, as thin wrappers around utilities.images."""

from collections.abc import Generator
from contextlib import contextmanager

from invoke.context import Context
from invoke.exceptions import Exit
from invoke.tasks import task

from utilities import images

FILTER_HELP = "Only include images whose folder name matches this shell-style glob, such as `base`."
SUITE_HELP = "`images`. `features` isn't implemented yet."
NO_CACHE_HELP = "Build the images without using the build cache."
IS_RELEASE_HELP = "Build a release instead of a dev build, whose name and tags end in -dev."
TEST_IS_RELEASE_HELP = "Build and test the release build of each image instead of its dev build."
SKIP_BUILD_HELP = "Test the images that are already built instead of building them first."


@contextmanager
def _exit_on_image_error() -> Generator[None]:
    """Turns an ImageError into a one-line exit, without a traceback."""
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
    """Checks the image manifests, then builds and tags the images under images/src."""

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
    """Builds the images, then runs each image's images/test/<image>/test.sh inside it."""

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
    """Checks that the image manifests, their schema, ImageManifest and the templates agree."""

    match suite:
        case "images":
            with _exit_on_image_error():
                images.check_manifests()
            print("The image manifests, their schema, ImageManifest and the templates agree.")
        case "features":
            raise NotImplementedError("Validation for features is not implemented.")
        case _:
            raise Exit(f"{suite} is not a valid validate suite.", code=1)
