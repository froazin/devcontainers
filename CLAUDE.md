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
| `images/src/<image>/` | An image: `manifest.json`, `template.json`, `Containerfile` and `README.md` | [docs/container-images/manifests.md](docs/container-images/manifests.md), and [Image READMEs](#image-readmes) for the README |
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

- Name an image folder in lowercase letters, digits and hyphens, such as `base` or `python-3`. The folder name is the image's main tag: `ghcr.io/froazin/devcontainers:<folder>`.
- Give every image all of these, in the same change:
  - `images/src/<image>/manifest.json`, `template.json`, `Containerfile` and `README.md`.
  - A test project in `images/test/<image>/`: a `test.sh` and a copy of `images/test/base/test_utils.sh`. Only that folder is mounted in the test container.
- Take the base image from a build argument. The `Containerfile` starts with `ARG BASE_IMAGE` and `FROM ${BASE_IMAGE}`, and the manifest sets `BASE_IMAGE` in `build_args`, so the base image is visible in the manifest.
- Name build arguments in upper snake case, such as `BASE_IMAGE`.
- Give each tag in `tags` a name that says what the image is, such as `ubuntu-26.04`. Don't add `latest` or a version: the build adds the version suffixes.
- Treat `version` as the image's semantic version. Bump it in the same change as anything that changes what the image contains: the patch for a fix, the minor for something added and the major for anything removed or changed incompatibly.
- Edit `template.json`, never `.devcontainer.json`. The build generates it, and Git ignores it.
- Write every string value in `template.json` through `tojson`, such as `"name": {{ name | tojson }}`. Quotes alone break the JSON for a value that holds `"` or `\`.
- Check everything the `Containerfile` adds in `test.sh`, and end `test.sh` with `report_results`.
- **Before you change a manifest's fields, the schema or `ImageManifest`, follow the `image-manifest` rule in `.claude/rules/`.** It loads the `image-manifest-schema` skill.

### Image READMEs

Every image has a `README.md` in `images/src/<image>/`, for people who use the image. Follow this shape, adapted from the [devcontainers/images README for Ubuntu](https://github.com/devcontainers/images/blob/main/src/base-ubuntu/README.md):

````markdown
# <name from manifest.json>

<description from manifest.json, as a sentence.>

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:<folder>` |
| Tags | <every tag the build creates, in code spans> |
| Version | `<version from manifest.json>` |
| Base image | `<BASE_IMAGE from manifest.json>` |
| Image type | `Containerfile` |
| Container OS | <the OS and release> |
| Languages and platforms | <what it's for, or "Any"> |
| Published | No. Build the image locally, as [CONTRIBUTING.md](../../../CONTRIBUTING.md) describes |

## Using this image

<How to use it once it's built, such as the `image` property in a `devcontainer.json`.>

## What's in it

<What the Containerfile adds to the base image, as a list. Say so if it adds nothing.>

## Tests

<What images/test/<image>/test.sh checks, with a link to it.>

## Licence

MIT. See [LICENSE](../../../LICENSE).
````

- Take every value in the Summary table from `manifest.json` or the `Containerfile`. When you change the manifest's `name`, `description`, `version`, `tags` or `build_args`, or what the `Containerfile` adds, update the README in the same change.
- List every tag the build creates, as [The ImageManifest dataclass](docs/container-images/manifests.md#the-imagemanifest-dataclass) describes for `image_tags`.
- Describe only what exists. Change the Published row and "Using this image" only once the image is published.
- Write it in the house style, as for any other doc.

### Code

- Keep `devel` packages free of Invoke. They take a `run` callable and return results, and `tasks.py` turns failures into `Exit` errors. See [Dev tooling](docs/dev-tooling.md).
- Put a package's unit tests in `devel/<package>/test/`, without an `__init__.py`. In tests, import modules rather than functions whose names start with `test_`, or pytest collects them as tests.
- Put hook logic in Python in `devel/hooks/`, with a POSIX `sh` wrapper in `.claude/hooks/`. Pyright doesn't check files in dot-directories. See [Claude Code hooks](docs/claude-code-hooks.md).
- Write shell scripts in POSIX `sh`, not Bash. `/bin/sh` in the Ubuntu images is dash.
- Feature scripts run on the container's system Python. Import only the standard library and packages the system package manager installs, never packages from PyPI.
