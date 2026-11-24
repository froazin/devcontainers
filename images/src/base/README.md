# Base

## Summary

*A minimal Ubuntu container that runs systemd as process ID (PID) 1, like an init image.*

| Metadata | Value |
| --- | --- |
| *Categories* | Core |
| *Image type* | Dockerfile |
| *Published images* | None yet. Build it locally, as [Build and test](../../../README.md#build-and-test) describes |
| *Available image variants* | `base` (Ubuntu 26.04 / resolute) |
| *Published image architecture(s)* | None yet. A local build is for the host's architecture |
| *Container host OS support* | Linux and Windows Subsystem for Linux (WSL) 2, with Docker on cgroup v2. macOS is untested |
| *Container OS* | Ubuntu 26.04 LTS (Resolute Raccoon) |
| *Languages, platforms* | Any |

## Using this image

Reference the image with the `image` property in `.devcontainer/devcontainer.json`, or use it in the `FROM` statement of your own `Dockerfile`:

- `ghcr.io/froazin/devcontainers:base` (latest release)
- `ghcr.io/froazin/devcontainers:base-dev` (latest local dev build)

Refer to [this guide](https://containers.dev/guide/dockerfile) for more details.

Releases follow [semantic versioning](https://semver.org/), from the `version` in [manifest.json](manifest.json). Each release is also tagged with its major, minor and full version, so `0.0.1` is tagged:

- `ghcr.io/froazin/devcontainers:base-v0`
- `ghcr.io/froazin/devcontainers:base-v0.0`
- `ghcr.io/froazin/devcontainers:base-v0.0.1`

A dev build, any build without `--is-release`, adds `-dev` to each tag, such as `base-v0.0.1-dev`. The image is in alpha while its version is `0.0.x`, so any release can break it. Pin a full version for reproducibility.

Beyond Ubuntu, this image includes systemd, D-Bus and `procps`, so you can run services with `systemctl`, and it stops cleanly when you close the window. The image's own settings start systemd, so your `devcontainer.json` doesn't need any. The container runs as root, with `SYS_ADMIN` rather than `--privileged`, and Ubuntu's `ubuntu` user is removed, so user ID (UID) 1000 is free for a user of your own.

## Licence

MIT. See [LICENSE](../../../LICENSE).
