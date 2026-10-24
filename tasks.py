"""Task definitions for the devcontainers project."""

import shutil

from invoke.context import Context
from invoke.tasks import task

FEATURES_PROJECT_FOLDER = "features"
FEATURES_SRC_FOLDER = "/".join([FEATURES_PROJECT_FOLDER, "src"])
FEATURES_BASE_COMMAND = " ".join(["npm", "exec", "@devcontainers/cli", "--", "features"])


@task
def _check_npm_on_path(c: Context) -> None:
    """Checks that npm is available on the system PATH."""
    print("Checking npm on PATH...")
    if shutil.which("npm") is None:
        raise RuntimeError("npm is not on PATH.")


@task(pre=[_check_npm_on_path])
def npm_install(c: Context) -> None:
    """Sets up Node.js dependencies for the devcontainers project."""

    print("Setting up Node.js dependencies...")
    c.run("npm install")


@task(
    pre=[npm_install],
    help={"filter": "Only test features whose name matches this filter."},
)
def test_features(c: Context, filter: str | None = None) -> None:
    print("Testing features...")
    c.run(
        " ".join(
            [
                *FEATURES_BASE_COMMAND.split(),
                "test",
                f"--project-folder={FEATURES_PROJECT_FOLDER}",
                f"--filter='{filter}'" if filter is not None else "",
            ]
        )
    )


@task(pre=[npm_install])
def generate_feature_docs(c: Context) -> None:
    """Generates documentation for devcontainer features."""

    print("Generating documentation...")
    c.run(
        " ".join(
            [
                *FEATURES_BASE_COMMAND.split(),
                "generate-docs",
                "--registry=ghcr.io",
                "--namespace=froazin/devcontainers",
                "--github-owner=froazin",
                "--github-repo=devcontainers",
                f"--project-folder={FEATURES_SRC_FOLDER}",
            ]
        )
    )
