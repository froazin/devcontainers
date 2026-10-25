"""Runs each image's test project inside the built image."""

import os
from collections.abc import Iterator
from typing import cast

import podman
from podman.domain.containers import Container
from podman.errors import APIError

from devel.images.config import IMAGE_TEST_MOUNT, IMAGE_TEST_SCRIPT, IMAGES_TEST_FOLDER, image_name
from devel.images.errors import ImageError, podman_api_error


def project_mount(name: str, test_folder: str = IMAGES_TEST_FOLDER) -> dict[str, str | bool]:
    """Returns a read-only bind mount of images/test/<name> at the test mount point."""

    return {
        "type": "bind",
        "source": os.path.abspath(os.path.join(test_folder, name)),
        "target": IMAGE_TEST_MOUNT,
        "read_only": True,
        "relabel": "z",
    }


def run_container(container: Container) -> int:
    """Starts the container, streams its output, then removes it and returns its exit code."""

    try:
        container.start()
        logs = cast(
            Iterator[bytes],
            container.logs(stdout=True, stderr=True, stream=True, follow=True),
        )

        for chunk in logs:
            print(chunk.decode(errors="replace"), end="", flush=True)
        return container.wait()

    finally:
        container.remove(force=True)


def run_image_test(
    client: podman.PodmanClient,
    name: str,
    test_folder: str = IMAGES_TEST_FOLDER,
    *,
    release: bool = False,
) -> bool:
    """Runs images/test/<name>/test.sh in the dev build, or the release build, and returns whether it passed."""

    image = image_name(name, release)
    if not client.images.exists(image):
        command = "invoke build images --is-release" if release else "invoke build images"
        print(f"Image {image} not found. Build it first with `{command}`.")
        return False

    print(f"Testing image {image}...")
    container = client.containers.create(
        image,
        ["/bin/sh", f"{IMAGE_TEST_MOUNT}/{IMAGE_TEST_SCRIPT}"],
        working_dir=IMAGE_TEST_MOUNT,
        stop_timeout=0,
        mounts=[project_mount(name, test_folder)],
    )
    return run_container(container) == 0


def run_image_tests(image_dirs: list[str], test_folder: str = IMAGES_TEST_FOLDER, *, release: bool = False) -> None:
    """Runs each image's test project, in its dev build or, with release, its release build.

    Skips an image without a test.sh. Runs every image, then raises ImageError naming the images that failed. A podman
    API call that fails stops the run with an ImageError that also names the images that had already failed.
    """

    failed = []
    try:
        with podman.PodmanClient.from_env() as client:
            for image_dir in image_dirs:
                name = os.path.basename(image_dir)
                script = os.path.join(test_folder, name, IMAGE_TEST_SCRIPT)

                if not os.path.isfile(script):
                    print(f"Skipping {name}: {script} not found.")
                    continue

                if not run_image_test(client, name, test_folder, release=release):
                    failed.append(name)
    except APIError as error:
        api_error = podman_api_error(error)
        if failed:
            api_error = ImageError(f"{api_error} Image tests had already failed: {', '.join(failed)}")
        raise api_error from error

    if failed:
        raise ImageError(f"Image tests failed: {', '.join(failed)}")
