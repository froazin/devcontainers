"""Runs each image's test project inside the built image."""

import os
from collections.abc import Iterator
from typing import cast

import podman
from podman.domain.containers import Container
from podman.errors import APIError

from utilities.images.config import IMAGE_TEST_MOUNT, IMAGE_TEST_SCRIPT, IMAGES_TEST_FOLDER, image_name
from utilities.images.errors import ImageError, podman_api_error


def project_mount(name: str, test_folder: str = IMAGES_TEST_FOLDER) -> dict[str, str | bool]:
    """Returns a read-only bind mount of the image's test folder."""
    return {
        "type": "bind",
        "source": os.path.abspath(os.path.join(test_folder, name)),
        "target": IMAGE_TEST_MOUNT,
        "read_only": True,
        "relabel": "z",
    }


def run_container(container: Container) -> int:
    """Runs the container to the end, streaming its output, and always removes it."""
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
    """Runs the image's test.sh in a container of its build."""
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
        # sh runs as PID 1 and ignores SIGTERM, so don't wait for it to stop.
        stop_timeout=0,
        mounts=[project_mount(name, test_folder)],
    )
    return run_container(container) == 0


def run_image_tests(image_dirs: list[str], test_folder: str = IMAGES_TEST_FOLDER, *, release: bool = False) -> None:
    """Tests each image, then raises ImageError naming any that failed."""
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
