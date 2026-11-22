# Devcontainers base image

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:base`, or `ghcr.io/froazin/devcontainers:base-dev` for a dev build |
| Tags | `base`, `base-vMAJOR`, `base-vMAJOR.MINOR` and `base-vMAJOR.MINOR.PATCH`, from the `version` in [manifest.json](manifest.json). At `1.2.3`, that's `base`, `base-v1`, `base-v1.2` and `base-v1.2.3`. A dev build, any build without `--is-release`, adds `-dev` to each |
| Container OS | Ubuntu 26.04 LTS (Resolute Raccoon) |
| Languages and platforms | Undefined |
| Published | No. Build the image locally, as [Build and test](../../../README.md#build-and-test) describes |

## Using this image

Once it's built, reference the image or one of its tags in a `devcontainer.json`:

```json
{
  "image": "ghcr.io/froazin/devcontainers:base"
}
```

## What's in it

Nothing beyond Ubuntu 26.04 yet, except the Open Container Initiative (OCI) labels: the version, the manifest's `name` and `description` as the title and description, and the repository as the source.

## Tests

[test.sh](../../test/base/test.sh) checks that the image is the Ubuntu release it says it is, and that what it should contain is there.

## Licence

MIT. See [LICENSE](../../../LICENSE).
