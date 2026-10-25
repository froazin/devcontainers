# Devcontainers base image

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:base` for a release build, or `ghcr.io/froazin/devcontainers:base-dev` for a dev build |
| Release tags | `base`, `base-1`, `base-1.0` and `base-1.0.0` |
| Dev tags | `base-dev` and `base-dev_<short commit SHA>`, from a dev build, which is any build without `--is-release`. The SHA ends in `-dirty` when the working tree has uncommitted changes |
| Container OS | Ubuntu 26.04 LTS (Resolute Raccoon) |
| Languages and platforms | Undefined |
| Published | No. Build the image locally, as [Build and test](../../../README.md#build-and-test) describes |

## Using this image

Once it's built, reference the image or one of its tags in the `image` property of a `devcontainer.json`:

```json
{
  "image": "ghcr.io/froazin/devcontainers:base"
}
```

`ghcr.io/froazin/devcontainers:base` is the release build, from `invoke build images --is-release`. A build without `--is-release` is a dev build, named `ghcr.io/froazin/devcontainers:base-dev` instead.

## What's in it

Nothing beyond the base image except labels and one empty layer. The [Containerfile](Containerfile) starts from `BASE_IMAGE`, and the layer comes from a `RUN true` that [Labels](../../../docs/container-images/builds.md#labels) explains. It sets these Open Container Initiative (OCI) labels, from build arguments that the build passes in:

- `org.opencontainers.image.version`: `1.0.0` for a release, or `1.0.0-dev+<short commit SHA>` for a dev build. The SHA ends in `-dirty` when the working tree has uncommitted changes.
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
