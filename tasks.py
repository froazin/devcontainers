"""Invoke tasks for building, testing and documenting this repository.

Images are built and tested with the devcontainer CLI, which is always
invoked as ``npm exec @devcontainers/cli`` so the version pinned in
package.json is used. Direct container operations go through the podman
API socket via podman-py; the docker shim exists only for the
devcontainer CLI.
"""

import json
import os
import time
from pathlib import Path
from typing import Any

from invoke.context import Context
from invoke.exceptions import Exit
from invoke.tasks import task
from podman import PodmanClient

REGISTRY = "ghcr.io"
NAMESPACE = "froazin/devcontainer-images"

REPO_ROOT = Path(__file__).parent
IMAGES_DIR = REPO_ROOT / "images"

DEVCONTAINER_CLI = "npm exec @devcontainers/cli --"

STOP_TIMEOUT_SECONDS = 30
CLEAN_STOP_THRESHOLD_SECONDS = 15


def _podman_client() -> PodmanClient:
    """Return a podman client connected to the user's API socket."""
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    return PodmanClient(base_url=f"unix://{runtime_dir}/podman/podman.sock")


def _discover_images(name: str | None = None) -> list[Path]:
    """Return image directories under images/ that contain a manifest."""
    image_dirs = sorted(path.parent for path in IMAGES_DIR.glob("*/manifest.json"))

    if name is not None:
        image_dirs = [path for path in image_dirs if path.name == name]

    if not image_dirs:
        raise Exit(f"No matching image manifests found under {IMAGES_DIR}.")

    return image_dirs


def _load_manifest(image_dir: Path) -> dict[str, Any]:
    """Load and minimally validate an image manifest."""
    manifest_path = image_dir / "manifest.json"

    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError as exc:
        raise Exit(f"Invalid JSON in {manifest_path}: {exc}") from exc

    for key in ("version", "variants", "build"):
        if key not in manifest:
            raise Exit(f"Manifest {manifest_path} is missing '{key}'.")

    if not manifest["build"].get("tags"):
        raise Exit(f"Manifest {manifest_path} defines no build tags.")

    return manifest


def _resolve_tags(manifest: dict[str, Any], variant: str) -> list[str]:
    """Expand manifest tag templates into fully qualified image tags."""
    version = str(manifest["version"])

    return [
        f"{REGISTRY}/{NAMESPACE}/"
        + tag.replace("${VERSION}", version).replace("${VARIANT}", variant)
        for tag in manifest["build"]["tags"]
    ]


@task
def build_images(ctx: Context, image: str | None = None) -> None:
    """Build all images under images/, or a single image by name."""
    for image_dir in _discover_images(image):
        manifest = _load_manifest(image_dir)
        variants = [str(variant) for variant in manifest["variants"]]

        if len(variants) != 1:
            raise Exit(
                f"Image '{image_dir.name}' declares {len(variants)} variants; "
                "only single-variant manifests are supported for now."
            )

        tags = _resolve_tags(manifest, variants[0])
        image_names = " ".join(f"--image-name {tag}" for tag in tags)

        print(f"Building image '{image_dir.name}' ({', '.join(tags)})...")
        ctx.run(
            f"{DEVCONTAINER_CLI} build "
            f"--workspace-folder {image_dir} {image_names}",
            echo=True,
        )


def _up(ctx: Context, image_dir: Path) -> str:
    """Bring up a dev container for an image directory, returning its id."""
    result = ctx.run(
        f"{DEVCONTAINER_CLI} up "
        f"--workspace-folder {image_dir} --remove-existing-container",
        echo=True,
        hide="out",
    )

    if result is None or not result.stdout.strip():
        raise Exit(f"devcontainer up produced no output for {image_dir}.")

    try:
        outcome = json.loads(result.stdout.strip().splitlines()[-1])
    except json.JSONDecodeError as exc:
        raise Exit(
            f"Could not parse devcontainer up output for {image_dir}: {exc}"
        ) from exc

    container_id = outcome.get("containerId")
    if outcome.get("outcome") != "success" or not container_id:
        raise Exit(f"devcontainer up failed for {image_dir}: {outcome}")

    return container_id


def _assert_clean_stop(container_id: str) -> None:
    """Stop a container, asserting the image's stop signal is honoured.

    systemd ignores SIGTERM as PID 1, so a prompt stop proves the image's
    STOPSIGNAL (SIGRTMIN+3) reached systemd and triggered a clean halt. A
    broken stop signal would ride the full timeout into a SIGKILL.
    """
    with _podman_client() as client:
        container = client.containers.get(container_id)

        started = time.monotonic()
        container.stop(timeout=STOP_TIMEOUT_SECONDS)
        elapsed = time.monotonic() - started

    if elapsed >= CLEAN_STOP_THRESHOLD_SECONDS:
        raise Exit(
            f"Container {container_id[:12]} took {elapsed:.1f}s to stop; "
            "expected a clean systemd shutdown in under "
            f"{CLEAN_STOP_THRESHOLD_SECONDS}s. The stop signal is likely "
            "not reaching systemd."
        )

    print(f"Container stopped cleanly in {elapsed:.1f}s.")


def _remove_container(container_id: str) -> None:
    """Force remove a container, ignoring absence."""
    with _podman_client() as client:
        if client.containers.exists(container_id):
            client.containers.get(container_id).remove(force=True)


@task
def test_images(ctx: Context, image: str | None = None) -> None:
    """Build and test all images under images/, or a single image by name."""
    build_images(ctx, image)

    for image_dir in _discover_images(image):
        print(f"Testing image '{image_dir.name}'...")
        container_id = _up(ctx, image_dir)

        try:
            ctx.run(
                f"{DEVCONTAINER_CLI} exec "
                f"--workspace-folder {image_dir} sh ./test/test.sh",
                echo=True,
            )
            _assert_clean_stop(container_id)
        finally:
            _remove_container(container_id)

        print(f"Image '{image_dir.name}' passed.")


@task
def test_features(ctx: Context, feature: str | None = None) -> None:
    """Test all devcontainer features, or a single feature by name.

    The base images are built first: feature test scenarios run on top of
    the locally built base image.
    """
    build_images(ctx)

    features_arg = f" --features={feature}" if feature is not None else ""
    ctx.run(
        f"{DEVCONTAINER_CLI} features test "
        f"--project-folder=features --skip-duplicated --skip-autogenerated"
        f"{features_arg}",
        echo=True,
    )


@task
def test(ctx: Context) -> None:
    """Run the full test suite: images first, then features."""
    test_images(ctx)
    test_features(ctx)


@task
def docs(ctx: Context) -> None:
    """Regenerate the auto-generated feature documentation."""
    ctx.run("npm run generate-docs", echo=True)
