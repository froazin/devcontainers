"""Runs each image's test project inside the built image."""

import os
from collections.abc import Iterator
from typing import cast

import podman
from podman.domain.containers import Container

from devel.images.config import IMAGE_REPOSITORY, IMAGE_TEST_MOUNT, IMAGE_TEST_SCRIPT, IMAGES_TEST_FOLDER


def test_mount(name: str, test_folder: str = IMAGES_TEST_FOLDER) -> dict[str, str | bool]:
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


def test_image(client: podman.PodmanClient, name: str, test_folder: str = IMAGES_TEST_FOLDER) -> bool:
    """Runs images/test/<name>/test.sh in the built image and returns whether it passed."""

    image_name = f"{IMAGE_REPOSITORY}:{name}"
    if not client.images.exists(image_name):
        print(f"Image {image_name} not found. Build it first with `invoke build images`.")
        return False

    print(f"Testing image {image_name}...")
    container = client.containers.create(
        image_name,
        ["/bin/sh", f"{IMAGE_TEST_MOUNT}/{IMAGE_TEST_SCRIPT}"],
        working_dir=IMAGE_TEST_MOUNT,
        stop_timeout=0,
        mounts=[test_mount(name, test_folder)],
    )
    return run_container(container) == 0


def test_images(image_dirs: list[str], test_folder: str = IMAGES_TEST_FOLDER) -> list[str]:
    """Runs each image's test project against the built image and returns the names of the images that failed."""

    client = podman.PodmanClient.from_env()
    failed = []

    for image_dir in image_dirs:
        name = os.path.basename(image_dir)

        if not os.path.isfile(os.path.join(test_folder, name, IMAGE_TEST_SCRIPT)):
            print(f"Skipping {name}: {test_folder}/{name}/{IMAGE_TEST_SCRIPT} not found.")
            continue

        if not test_image(client, name, test_folder):
            failed.append(name)

    return failed
