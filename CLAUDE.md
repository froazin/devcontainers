# Dev Containers

Dev Container images and features for `ghcr.io/froazin/devcontainers`, with the dev-time Python tooling that builds and tests them. This file is the index for Claude agents: it says what each part holds, which design doc to read before you change it and the rules to follow.

## Contents

1. [Layout](#layout)
1. [Conventions](#conventions)

## Layout

| Path | Holds | Before you change it, read |
| --- | --- | --- |
| `tasks.py` | The Invoke tasks: `build`, `test` and `validate` | [docs/dev-tooling.md](docs/dev-tooling.md) |
| `devel/images/` | The `devel.images` package: discovery, builds, tests and validation | [docs/container-images/overview.md](docs/container-images/overview.md), then the doc for the module |
| `devel/images/manifest.py`, `devel/images/validation.py` | `ImageManifest` and the manifest checks | [docs/container-images/manifests.md](docs/container-images/manifests.md) |
| `devel/images/build.py` | Rendering, the Dev Containers CLI build and tagging | [docs/container-images/builds.md](docs/container-images/builds.md) |
| `devel/images/testing.py` | The image test runner | [docs/container-images/tests.md](docs/container-images/tests.md) |
| `devel/hooks/` | The Python for the Claude Code hooks, with tests | [docs/claude-code-hooks.md](docs/claude-code-hooks.md) |
| `images/src/<image>/` | An image: `manifest.json`, `template.json`, `Containerfile` and `README.md` | [docs/container-images/manifests.md](docs/container-images/manifests.md), and [docs/container-images/readmes.md](docs/container-images/readmes.md) for the README |
| `images/test/<image>/` | An image's test project: `test.sh` and `test_utils.sh` | [docs/container-images/tests.md](docs/container-images/tests.md) |
| `schemas/image-manifest.schema.json` | The JSON schema for `manifest.json` | [docs/container-images/manifests.md](docs/container-images/manifests.md) |
| `features/` | Dev Container features. None exist yet | Nothing yet |
| `.claude/` | Project settings, hook wrappers, rules and skills | [docs/claude-code-hooks.md](docs/claude-code-hooks.md) |
| `pyproject.toml`, `pyrightconfig.json`, `package.json`, `.npmrc` | Python and npm tooling settings | [docs/dev-tooling.md](docs/dev-tooling.md) |

## Conventions

### Working in the repository

- For prerequisites, set-up and every build, test and lint command, see [CONTRIBUTING.md](CONTRIBUTING.md). Run them from the repository root.
- Don't run `invoke build` or `invoke test` without asking the user. They build and tag real images.
- The project runs on an Ubuntu 26.04 WSL instance set up with [froazin/dotfiles](https://github.com/froazin/dotfiles), with podman rather than Docker. Keep the tooling working with podman, and don't add anything that needs Docker. See [Where it runs](README.md#where-it-runs).
- Update the design docs in the same change as the code that makes them out of date.

### Images

- Name an image folder in lowercase letters, digits and hyphens, such as `base` or `python-3`. The folder name is the image's main tag: `ghcr.io/froazin/devcontainers:<folder>` for a release, and `ghcr.io/froazin/devcontainers:<folder>-dev` for a dev build.
- Give every image all of these, in the same change:
  - `images/src/<image>/manifest.json`, `template.json`, `Containerfile` and `README.md`.
  - A test project in `images/test/<image>/`: a `test.sh` and a copy of `images/test/base/test_utils.sh`. Only that folder is mounted in the test container.
- Take the base image from a build argument. The `Containerfile` starts with `ARG BASE_IMAGE` and `FROM ${BASE_IMAGE}`, and the manifest sets `BASE_IMAGE` in `build_args`, so the base image is visible in the manifest.
- Name build arguments in upper snake case, such as `BASE_IMAGE`.
- Give every image the OCI labels, as [Labels](docs/container-images/builds.md#labels) describes. The `template.json` passes `IMAGE_VERSION`, `IMAGE_TITLE`, `IMAGE_DESCRIPTION` and `IMAGE_SOURCE` in `build.args`, and the `Containerfile` sets them with `ARG`, `RUN true` and `LABEL` after `FROM`. The `RUN true` stops podman's layer cache keeping old label values. Don't use those names in the manifest's `build_args`.
- Give each tag in `tags` a name that says what the image is, such as `ubuntu-26.04`. Don't add `latest`, a version or a commit: the build adds those suffixes.
- Treat `version` as the image's semantic version. Bump it in the same change as anything that changes what the image contains: the patch for a fix, the minor for something added and the major for anything removed or changed incompatibly.
- Edit `template.json`, never `.devcontainer.json`. The build generates it, and Git ignores it.
- Write every string value in `template.json` through `tojson`, such as `"name": {{ name | tojson }}`. Quotes alone break the JSON for a value that holds `"` or `\`.
- Check everything the `Containerfile` adds in `test.sh`, except the labels, which a container can't see. End `test.sh` with `report_results`.
- **Before you write or change an image's `README.md`, read [docs/container-images/readmes.md](docs/container-images/readmes.md).** Update the README in the same change as the manifest, `Containerfile` or `test.sh` it describes.
- **Before you change a manifest's fields, the schema or `ImageManifest`, follow the `image-manifest` rule in `.claude/rules/`.** It loads the `image-manifest-schema` skill.

### Code

- Keep `devel` packages free of Invoke. They take a `run` callable and return results, and `tasks.py` turns failures into `Exit` errors. See [Dev tooling](docs/dev-tooling.md).
- Put a package's unit tests in `devel/<package>/test/`, without an `__init__.py`. In tests, import modules rather than functions whose names start with `test_`, or pytest collects them as tests.
- Put hook logic in Python in `devel/hooks/`, with a POSIX `sh` wrapper in `.claude/hooks/`. Pyright doesn't check files in dot-directories. See [Claude Code hooks](docs/claude-code-hooks.md).
- Write shell scripts in POSIX `sh`, not Bash. `/bin/sh` in the Ubuntu images is dash.
- Feature scripts run on the container's system Python. Import only the standard library and packages the system package manager installs, never packages from PyPI.
