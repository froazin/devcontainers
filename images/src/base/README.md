# Base

## Summary

*A minimal Ubuntu devcontainer that runs systemd as process ID (PID) 1.*

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

Refer to [this guide](https://containers.dev/guide/dockerfile) for more details.

Releases follow [semantic versioning](https://semver.org/), from the `version` in [manifest.json](manifest.json). Each release is also tagged with its major, minor and full version, so `0.0.1` is tagged:

- `ghcr.io/froazin/devcontainers:base-v0`
- `ghcr.io/froazin/devcontainers:base-v0.0`
- `ghcr.io/froazin/devcontainers:base-v0.0.1`

## Licence

MIT. See [LICENSE](../../../LICENSE).
