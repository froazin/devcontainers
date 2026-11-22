# Dev tooling

The high-level design of `tasks.py` and the Python packages in `utilities/`, and why the Python, Node and dependency tooling is set up the way it is. It's for engineers who change a task, a `utilities` package or the tooling settings.

## Contents

1. [Overview](#overview)
1. [Tool configuration](#tool-configuration)
1. [Limits](#limits)

## Overview

The tooling has two layers. [tasks.py](../tasks.py) defines the Invoke tasks `build`, `test` and `validate` as thin wrappers, and the packages in [utilities/](../utilities/) do the work without importing Invoke. A function that runs a shell command takes a `Runner`, so its tests can pass a fake instead of Invoke's `c.run`. `utilities.images` raises `ImageError` for a failure the user can fix, which `tasks.py` turns into a one-line exit, and any other exception is a bug that keeps its traceback.

```mermaid
flowchart LR
    accTitle: Layers of the dev tooling
    accDescr: The invoke CLI runs a task in tasks.py. The build and test tasks find the images with utilities.images.discovery, which lists images/src. The build task, and the test task without --skip-build, then call utilities.images.build. It runs check_manifests from utilities.images.validation, then runs npm install and the Dev Containers CLI through c.run. It reads manifest.json and template.json and writes .devcontainer.json in images/src. Then it gets, checks and tags each image through the podman API. The test task then calls utilities.images.testing, which checks for each image's test.sh in images/test, mounts the test project and runs containers with podman. The validate task calls check_manifests in utilities.images.validation, which reads the manifests and templates in images/src and the schema.
    cli[invoke CLI] -->|task and flags| tasks[tasks.py]
    tasks -->|filter| discovery[utilities.images.discovery]
    tasks -->|c.run and image dirs| build[utilities.images.build]
    tasks -->|image dirs| testing[utilities.images.testing]
    tasks -->|check_manifests for validate| validation[utilities.images.validation]
    build -->|check_manifests| validation
    build -->|npm install through c.run| npm[npm]
    build -->|devcontainer build through c.run| dccli[Dev Containers CLI]
    build -->|read manifest.json and template.json and write .devcontainer.json| src[(images/src)]
    build -->|get, check and tag the image| podman[podman API]
    testing -->|check for test.sh and mount the test project| tests[(images/test)]
    testing -->|run test containers| podman
    discovery -->|list folders| src
    validation -->|read manifests and templates| src
    validation -->|read the schema| schemas[(schemas/image-manifest.schema.json)]
```

uv doesn't install the project, so `utilities` isn't an installed package. Invoke, pytest and Pyright each find it from the repository root, which is why the tasks only work from there.

## Tool configuration

- **System Python only, with system site packages.** uv never downloads its own Python, and the `.venv` sees the system site packages, because feature scripts will run on the container's system Python. The editor then sees the same packages as the target image.
- **A 7-day release age everywhere.** uv's `exclude-newer`, npm's `min-release-age` and Dependabot's `cooldown` all wait 7 days for a new version, so a release that's pulled soon after publishing never reaches the project.
- **`engines` with `engine-strict`.** npm older than 11.10.0 ignores `min-release-age` without a warning, so `package.json` requires that npm and `engine-strict` makes an older one fail.
- **No lockfiles.** The project isn't a package, so the version ranges and the release age decide what's installed.

## Limits

- Without tests for `tasks.py`, a mistake in a wrapper only shows when the task runs.
- Without a tracked lockfile, two machines can install different versions within the ranges.
