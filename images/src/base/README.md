# Ubuntu 26.04 LTS

Base image for Ubuntu 26.04 LTS.

## Summary

| Metadata | Value |
| --- | --- |
| Image | `ghcr.io/froazin/devcontainers:base` |
| Release tags | `ubuntu-26.04`, `ubuntu-26.04-0`, `ubuntu-26.04-0.0`, `ubuntu-26.04-0.0.1`, `base`, `base-0`, `base-0.0` and `base-0.0.1` |
| Development tags | `ubuntu-26.04`, `ubuntu-26.04-<short commit SHA>`, `base` and `base-<short commit SHA>`, from a build without `--is-release` |
| Version | `0.0.1` |
| Base image | `public.ecr.aws/ubuntu/ubuntu:26.04_stable` |
| Image type | `Containerfile` |
| Container OS | Ubuntu 26.04 LTS (Resolute Raccoon) |
| Languages and platforms | Any |
| Published | No. Build the image locally, as [CONTRIBUTING.md](../../../CONTRIBUTING.md) describes |

## Using this image

Once it's built, reference the image or one of its tags in the `image` property of a `devcontainer.json`:

```json
{
  "image": "ghcr.io/froazin/devcontainers:ubuntu-26.04"
}
```

## What's in it

Nothing beyond the base image yet. The [Containerfile](Containerfile) starts from `BASE_IMAGE` and adds no layers of its own.

## Tests

[test.sh](../../test/base/test.sh) checks that:

- `/etc/os-release` reports `ID` `ubuntu`, `VERSION_ID` `26.04` and `VERSION_CODENAME` `resolute`.
- `sh` and `bash` run.
- The `coreutils` and `dpkg` packages are installed.

## Licence

MIT. See [LICENSE](../../../LICENSE).
