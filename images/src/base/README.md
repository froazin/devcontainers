# Ubuntu 26.04 LTS

Base image for Ubuntu 26.04 LTS.

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:base`, or `ghcr.io/froazin/devcontainers:base-dev` from a build without `--is-release` |
| Release tags | `base`, `base-0`, `base-0.1` and `base-0.1.0` |
| Development tags | `base-dev` and `base-dev_<short commit SHA>`, from a build without `--is-release`. The SHA ends in `-dirty` when the working tree has uncommitted changes |
| Version | `0.1.0` |
| Base image | `public.ecr.aws/ubuntu/ubuntu:26.04_stable` |
| Image type | `Containerfile` |
| Container OS | Ubuntu 26.04 LTS (Resolute Raccoon) |
| Languages and platforms | Any |
| Published | No. Build the image locally, as [CONTRIBUTING.md](../../../CONTRIBUTING.md) describes |

## Using this image

Once it's built, reference the image or one of its tags in the `image` property of a `devcontainer.json`:

```json
{
  "image": "ghcr.io/froazin/devcontainers:base"
}
```

`ghcr.io/froazin/devcontainers:base` is the release build, from `invoke build images --is-release`. A build without `--is-release` makes `ghcr.io/froazin/devcontainers:base-dev` instead.

## What's in it

Nothing beyond the base image except labels. The [Containerfile](Containerfile) starts from `BASE_IMAGE` and adds no layers of its own. It sets these labels, from build arguments the template fills in from `manifest.json`:

- `org.opencontainers.image.version`: `0.1.0` for a release, or `0.1.0-dev+<short commit SHA>` for a development build. The SHA ends in `-dirty` when the working tree has uncommitted changes.
- `org.opencontainers.image.title`: `Devcontainers base image`.
- `org.opencontainers.image.description`: `Based on Ubuntu 26.04 LTS`.
- `org.opencontainers.image.source`: `https://github.com/froazin/devcontainers`.

## Tests

[test.sh](../../test/base/test.sh) checks that:

- `/etc/os-release` reports `ID` `ubuntu`, `VERSION_ID` `26.04` and `VERSION_CODENAME` `resolute`.
- `sh` and `bash` run.
- The `coreutils` and `dpkg` packages are installed.

## Licence

MIT. See [LICENSE](../../../LICENSE).
