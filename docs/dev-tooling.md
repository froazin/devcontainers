# Dev tooling

How `tasks.py` and the Python packages in `utilities/` fit together, and why the Python, Node and dependency tooling is set up the way it is. It's for engineers who change a task, a `utilities` package or the tooling settings. The set-up steps and commands are in [README.md](../README.md#set-up).

## Contents

1. [Overview](#overview)
1. [Between tasks.py and utilities](#between-taskspy-and-utilities)
1. [How imports resolve](#how-imports-resolve)
1. [Tool configuration](#tool-configuration)
1. [Unit tests](#unit-tests)
1. [Limits](#limits)

## Overview

The tooling has two layers. [tasks.py](../tasks.py) defines the Invoke tasks `build`, `test` and `validate` as thin wrappers, and the packages in [utilities/](../utilities/) do the work without importing Invoke. Nothing in `utilities/` ships in an image. This flowchart shows how a task reaches the `utilities.images` modules, and what each one uses outside Python:

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

Only the `images` suite is implemented. `features` raises `NotImplementedError` until features exist, so it fails with a traceback.

## Between tasks.py and utilities

- A `utilities` function that runs a shell command takes a `Runner`, `Callable[[str], object]`, defined in [build.py](../utilities/images/build.py). `tasks.py` passes `c.run`, and the tests pass a list's `append`, so they check the commands without Invoke or a shell.
- `utilities.images` raises [`ImageError`](../utilities/images/errors.py) for a failure the user can fix, with a message ready to show. `tasks.py` turns it into `Exit` with status 1, so Invoke prints it without a traceback.
- Any other exception is a bug and keeps its traceback, so don't catch a broad type such as `RuntimeError`. A failed shell command is the exception: Invoke reports `UnexpectedExit` without a traceback.
- Nothing in `utilities` exits the process, except a hook script's `__main__` block.
- `tasks.py` has no unit tests by design, so any logic worth testing goes in `utilities`.

## How imports resolve

uv doesn't install the project (`package = false` in [pyproject.toml](../pyproject.toml)), so `utilities` isn't an installed package. Each tool finds it from the repository root instead:

- Invoke puts the directory that holds `tasks.py` on `sys.path`.
- pytest uses `pythonpath = [".", "utilities/hooks"]`. The second entry lets the hook tests import a hook script as a top-level module.
- Pyright uses its project folder, and `extraPaths` in [pyrightconfig.json](../pyrightconfig.json) for `utilities/hooks`. It skips every dot-directory, which is why hook code lives in `utilities/hooks` (see [Claude Code hooks](claude-code-hooks.md)).

## Tool configuration

- **System Python only.** uv uses the system Python 3.14 and never downloads its own. The `.venv` is created with `--system-site-packages`, because feature scripts will run on the container's system Python, so the editor should see the same packages as the target image.
- **A 7-day release age everywhere.** uv's `exclude-newer`, npm's `min-release-age` in [.npmrc](../.npmrc) and Dependabot's `cooldown` all wait 7 days for a new version, so a release that's pulled soon after publishing never reaches the project.
- **`engines` with `engine-strict`.** npm older than 11.10.0 ignores `min-release-age` without a warning. So [package.json](../package.json)'s `engines` requires that npm, and a Node that bundles it, and `engine-strict=true` makes `npm install` fail rather than warn on an older one.
- **No lockfiles.** Git ignores `uv.lock` and `package-lock.json`, so the ranges and the release age decide what's installed. The caret range on the `0.x` Dev Containers CLI only allows patch releases.

### Dependency updates

[.github/dependabot.yml](../.github/dependabot.yml) updates the `uv`, `npm` and `github-actions` ecosystems weekly, with one grouped pull request per ecosystem. For `github-actions`, it updates the commit SHA each workflow pins and the version comment after it.

## Unit tests

- Put a package's tests in `utilities/<package>/test/`, without an `__init__.py`. pytest runs with `--import-mode=importlib`, so test files in different packages can share a name.
- Don't start a library function's name with `test`, or pytest collects it as a test in every test file that imports it.

## Limits

- Without tests for `tasks.py`, a mistake in a wrapper, such as a flag passed to the wrong argument, only shows when the task runs.
- Without a tracked lockfile, two machines can install different versions within the ranges. A local lockfile keeps what it first resolved until it's deleted.
- The tasks only work from the repository root, because the paths in config.py are relative to it.
