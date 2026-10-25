# Devcontainers base image

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:base` for a release build, or `ghcr.io/froazin/devcontainers:base-dev` for a dev build |
| Release tags | `base`, `base-MAJOR`, `base-MAJOR.MINOR` and `base-MAJOR.MINOR.PATCH`, from the `version` in [manifest.json](manifest.json). At version `1.2.3`, that's `base`, `base-1`, `base-1.2` and `base-1.2.3` |
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

- `org.opencontainers.image.version`: `MAJOR.MINOR.PATCH` for a release, or `MAJOR.MINOR.PATCH-dev+<short commit SHA>` for a dev build, from the manifest's `version`. The SHA ends in `-dirty` when the working tree has uncommitted changes. At version `1.2.3`, a dev build of commit `9027c9d` is labelled `1.2.3-dev+9027c9d`.
- `org.opencontainers.image.title`: the manifest's `name`.
- `org.opencontainers.image.description`: the manifest's `description`.
- `org.opencontainers.image.source`: the GitHub repository the image is built from.

## Tests

[test.sh](../../test/base/test.sh) checks that the image is the Ubuntu release it says it is, and that what it should contain is there. See it for each check.

## Licence

MIT. See [LICENSE](../../../LICENSE).
