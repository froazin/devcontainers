# Dev Containers

Dev Container images for `ghcr.io/froazin/devcontainers`, built locally, with the dev-time Python tooling that builds and tests them. Dev Container features are planned. This file is the index for Claude agents: it says what each part holds, which design doc to read before you change it and the rules to follow.

## Contents

1. [Layout](#layout)
1. [Conventions](#conventions)
1. [Ways of working](#ways-of-working)

## Layout

| Path | Holds | Before you change it, read |
| --- | --- | --- |
| `tasks.py` | The Invoke tasks `build`, `test` and `validate`, as thin wrappers around `devel.images` | [docs/dev-tooling.md](docs/dev-tooling.md) |
| `devel/images/` | The `devel.images` package: discovery, builds, tests and validation | [docs/container-images/overview.md](docs/container-images/overview.md), then the doc for the module |
| `devel/images/errors.py` | `ImageError`, for a failure the user can fix | [Between tasks.py and devel](docs/dev-tooling.md#between-taskspy-and-devel) |
| `devel/images/manifest.py`, `devel/images/validation.py` | `ImageManifest`, rendering `template.json` and the manifest checks | [docs/container-images/manifests.md](docs/container-images/manifests.md) |
| `devel/images/build.py` | Writing `.devcontainer.json`, the Dev Containers CLI build, the label check and tagging | [docs/container-images/builds.md](docs/container-images/builds.md) |
| `devel/images/testing.py` | The image test runner | [docs/container-images/tests.md](docs/container-images/tests.md) |
| `devel/hooks/` | The Python for the Claude Code hooks, with tests | [docs/claude-code-hooks.md](docs/claude-code-hooks.md) |
| `images/src/<image>/` | An image: `manifest.json`, `template.json`, `Containerfile` and `README.md` | [Add an image](docs/container-images/overview.md#add-an-image), then [docs/container-images/manifests.md](docs/container-images/manifests.md), with [docs/container-images/readmes.md](docs/container-images/readmes.md) for the README |
| `images/test/<image>/` | An image's test project: `test.sh` and `test_utils.sh` | [docs/container-images/tests.md](docs/container-images/tests.md) |
| `schemas/image-manifest.schema.json` | The JSON schema for `manifest.json` | [docs/container-images/manifests.md](docs/container-images/manifests.md) |
| `features/` | Dev Container features, which are planned. None exist yet | Nothing yet |
| `docs/` | The design docs, listed in [Design docs](README.md#design-docs). The rows above name the one to read for each part | `docs/repository-docs.md` and `docs/writing-style.md` in `ways-of-working` |
| `.claude/` | Project settings, the hook wrapper, rules and skills | [docs/claude-code-hooks.md](docs/claude-code-hooks.md) |
| `.github/` | `dependabot.yml`, the weekly dependency updates | [Dependency updates](docs/dev-tooling.md#dependency-updates) |
| `.vscode/` | Editor settings and recommended extensions, including the `json.schemas` mapping that checks each `manifest.json` | [Manifest fields](docs/container-images/manifests.md#manifest-fields) |
| `pyproject.toml`, `pyrightconfig.json`, `.python-version`, `package.json`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.shellcheckrc` | Python, npm and shell tooling settings | [docs/dev-tooling.md](docs/dev-tooling.md), and [docs/container-images/tests.md](docs/container-images/tests.md) for `.editorconfig` and `.shellcheckrc` |

## Conventions

### Working in the repository

- For every build, test and lint command, see [Build and test](README.md#build-and-test). [Prerequisites](README.md#prerequisites) and [Set up](README.md#set-up) come before it. Run the commands from the repository root.
- Don't run `invoke build` or `invoke test` without asking the user. They build, tag and run real images and containers.
- The project runs on an Ubuntu 26.04 Windows Subsystem for Linux (WSL) instance set up with [froazin/dotfiles](https://github.com/froazin/dotfiles), with podman rather than Docker. Keep the tooling working with podman, and don't add anything that needs Docker. See [Prerequisites](README.md#prerequisites).
- Update the design docs in the same change as the code that makes them out of date.

### Images

- **Before you add or change an image, read [Add an image](docs/container-images/overview.md#add-an-image).** It holds the rules for each image's files, build arguments, labels, tags, `version`, template and tests.
- Edit `template.json`, never `.devcontainer.json`. The build generates it, and Git ignores it. See [Add an image](docs/container-images/overview.md#add-an-image).
- **Before you write or change an image's `README.md`, read [docs/container-images/readmes.md](docs/container-images/readmes.md).** Its [Rules](docs/container-images/readmes.md#rules) say when to update the README.
- **Before you change a manifest's fields, the schema or `ImageManifest`, follow the `image-manifest` rule in `.claude/rules/`.** It loads the `image-manifest-schema` skill.

### Code

- Keep `devel` packages free of Invoke. A function that runs a shell command takes a `run` callable. `devel.images` raises `ImageError` for a failure the user can fix, and `tasks.py` turns it into `Exit`. See [Between tasks.py and devel](docs/dev-tooling.md#between-taskspy-and-devel).
- Keep `tasks.py` to thin wrappers around `devel`. It has no tests by design, so put any logic in a `devel` package, with its tests.
- Put a package's unit tests in `devel/<package>/test/`, without an `__init__.py`. Don't start a library function's name with `test`, or pytest collects it as a test wherever a test imports it. See [Unit tests](docs/dev-tooling.md#unit-tests).
- Put hook logic in Python in `devel/hooks/`, with a POSIX `sh` wrapper in `.claude/hooks/`. Pyright doesn't check files in dot-directories. See [Claude Code hooks](docs/claude-code-hooks.md).
- Write shell scripts in POSIX `sh`, not Bash. `/bin/sh` in the Ubuntu images is dash.
- Feature scripts, which are planned, will run on the container's system Python. Import only the standard library and packages the system package manager installs, never packages from PyPI.

## Ways of working

This project follows the user's shared ways of working in the `ways-of-working` repository. These are its specifics and overrides. Anything not listed here uses the shared defaults.

| Repository | Path | GitHub | Visibility | Default branch | Kind |
| --- | --- | --- | --- | --- | --- |
| Source | `.` | `froazin/devcontainers` | Public | `main` | Code: pull requests, squash-merged |
| Wiki | `../devcontainers.wiki/` | `froazin/devcontainers.wiki` | Public | `master` | Wiki: direct commits, a push publishes. Planned, to be added after `feature/base` merges |

- **Commit scopes:** `images`, `tasks`, `tooling`, `docs` and `claude`.
- **Releases:** none yet. Nothing is published, images are built locally and there are no Git tags.
- **Versions:** each image has its own `version` in its `manifest.json`, which follows the shared versioning rules in `docs/contributing/versioning.md` of `ways-of-working`. `base` is at `0.1.0`, so it's in beta. When to bump it is in [Add an image](docs/container-images/overview.md#add-an-image).
- **CI:** none yet.
- **Build and test:** see [Build and test](README.md#build-and-test).

### Overrides

- **No `CONTRIBUTING.md`:** external pull requests aren't accepted yet, so there's no `CONTRIBUTING.md`. Add it back only when they're allowed. Until then, `README.md` holds the prerequisites, set-up, build, test and CI facts that the shared defaults put in `CONTRIBUTING.md`, so link to [Build and test](README.md#build-and-test) wherever a doc would link to `CONTRIBUTING.md`.
- **User docs:** there's no wiki yet, so each image's `README.md` in `images/src/<image>/` stays its user doc until the wiki exists.
