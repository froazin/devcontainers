# Contributing

How to report a problem or propose a change, and how to set up, build and test this project. It's for contributors. For how the code works, see the [design docs](README.md#design-docs).

## Report a problem

Open an issue in `froazin/devcontainers`. Say which image or task it affects, what you ran, what you expected and what happened, with the full output.

## Propose a change

- Branch from the latest `main`, and keep each pull request (PR) to one change. Name the branch `feature/<slug>`, `bugfix/<slug>` or `other/<slug>`, with a lowercase hyphenated slug.
- Keep the branch current by rebasing on `main`. Don't merge `main` into it.
- Write every commit header as a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) header with a scope, such as `feat(images): Add a Python image`. Write the description as an instruction, starting with a capital letter.
- Give the PR a title in the same format. PRs are squash-merged, so the title and description become the commit on `main`.
- If an AI agent wrote any of the code, end the commit message with a `Co-Authored-By:` footer naming it, such as `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Update the [design docs](README.md#design-docs) in the same PR as the code change that makes them out of date.

## Prerequisites

| Tool | Used for |
| --- | --- |
| Python 3.14, as the system `python3.14` | The Python tooling. uv uses the system interpreter and never downloads one |
| [uv](https://docs.astral.sh/uv/) | The virtual environment and the Python dev dependencies |
| Node.js, as `.nvmrc` and `package.json` set, with npm | The Dev Containers CLI, from `package.json` |
| podman, with its API socket running | Building, tagging and testing images |
| A `docker` command that runs podman, such as the podman-docker shim | The Dev Containers CLI builds with `docker` |
| [ShellCheck](https://www.shellcheck.net/) and [shfmt](https://github.com/mvdan/sh) | Checking shell scripts. They aren't project dependencies |

On a machine with systemd, the user unit `podman.socket` provides the API socket.

The project is for use on an Ubuntu 26.04 WSL instance built with the [froazin/dotfiles WSL provisioning](https://github.com/froazin/dotfiles#wsl-provisioning). That instance has every tool above except Node.js: it installs nvm, so run `nvm install` in the repository to install the version `.nvmrc` sets.

## Set up

1. Create the virtual environment with access to the system site packages, so feature scripts and the editor see the same packages as the target image:

   ```bash
   uv venv --system-site-packages
   ```

1. Install the dev dependencies:

   ```bash
   uv sync
   ```

`uv sync` keeps an existing `.venv` as it is. If `uv sync` runs first, it creates a `.venv` **without** system site packages. Recreate it with `uv venv --system-site-packages --clear`, then run `uv sync` again.

uv and npm only install versions published at least 7 days ago. See [Tool configuration](docs/dev-tooling.md#tool-configuration).

## Build and test

Run every command from the repository root.

| Task | Command |
| --- | --- |
| List the tasks | `uv run invoke --list` |
| Check the image manifests | `uv run invoke validate images` |
| Build every image | `uv run invoke build images` |
| Build the images that match a glob | `uv run invoke build images --filter 'ubuntu-*'` |
| Build without the build cache | `uv run invoke build images --no-cache` |
| Build, then test, the images | `uv run invoke test images` |
| Test the images already built | `uv run invoke test images --skip-build` |
| Lint Python | `uv run ruff check .` |
| Format Python | `uv run ruff format .` |
| Type check | `uv run pyright` |
| Run the unit tests | `uv run pytest` |
| Check shell scripts | `shellcheck images/test/*/*.sh .claude/hooks/*.sh` |
| Check shell formatting | `shfmt -d images/test .claude/hooks` |

- Run `uv run invoke --help <task>` for a task's options.
- ShellCheck and shfmt read their settings from `.shellcheckrc` and `.editorconfig`, so run them without formatting flags.

### Tests that need podman

The unit tests mock podman and the Dev Containers CLI, so they run anywhere. `invoke build` and `invoke test` don't: they need every tool in [Prerequisites](#prerequisites). They run `npm install` before a build. A build creates and tags real images in podman's image store.

## CI

There's no CI yet. Dependabot opens one grouped PR a week for the uv dependencies and one for the npm dependencies.
