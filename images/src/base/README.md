# Devcontainers base image

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:base` for a release build, or `ghcr.io/froazin/devcontainers:base-dev` for a dev build |
| Release tags | `base`, `base-vMAJOR`, `base-vMAJOR.MINOR` and `base-vMAJOR.MINOR.PATCH`, from the `version` in [manifest.json](manifest.json). At version `1.2.3`, that's `base`, `base-v1`, `base-v1.2` and `base-v1.2.3` |
| Dev tags | The release tags, each with `-dev` on the end, from a dev build, which is any build without `--is-release`. At version `1.2.3`, that's `base-dev`, `base-v1-dev`, `base-v1.2-dev` and `base-v1.2.3-dev` |
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

Nothing beyond the base image except labels and one empty layer. The [Containerfile](Containerfile) starts from `BASE_IMAGE`, and the layer comes from a `RUN true` that [Labels](../../../docs/images/builds.md#labels) explains. It sets these Open Container Initiative (OCI) labels, from build arguments that the build passes in:

- `org.opencontainers.image.version`: `vMAJOR.MINOR.PATCH` for a release, or `vMAJOR.MINOR.PATCH-dev` for a dev build, from the manifest's `version`. At version `1.2.3`, a release is labelled `v1.2.3` and a dev build `v1.2.3-dev`.
- `org.opencontainers.image.title`: the manifest's `name`.
- `org.opencontainers.image.description`: the manifest's `description`.
- `org.opencontainers.image.source`: the GitHub repository the image is built from.

## Tests

[test.sh](../../test/base/test.sh) checks that the image is the Ubuntu release it says it is, and that what it should contain is there. See it for each check.

## Licence

MIT. See [LICENSE](../../../LICENSE).
