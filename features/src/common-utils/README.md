
# Common Utilities (common-utils)

Installs a set of common command line utilities and sets up a non-root user.

## Example Usage

```json
"features": {
    "ghcr.io/froazin/devcontainer-features/common-utils:0": {}
}
```

## Options

| Options Id | Description | Type | Default Value |
|-----|-----|-----|-----|
| upgradePackages | Upgrade OS packages? | boolean | true |
| username | Enter name of a non-root user to configure or none to skip | string | automatic |
| userUid | Enter UID for non-root user | string | automatic |
| userGid | Enter GID for non-root user | string | automatic |

## OS Support

Fedora only. Fedora 44 is the version exercised by the test suite; other
Fedora releases may work but are unsupported.

## Designed for froazin base images

This feature is a pure utilities feature: it installs a baseline set of
command line tools (the systemd *package* among them) and does not manage
how — or whether — systemd runs. To get systemd as PID 1, pair it with a
[froazin base image](https://github.com/froazin/devcontainers/tree/main/images/base),
which owns the entire init contract (`/sbin/init` as the container
command, stop signalling, container-appropriate unit masking and baked
dev container metadata):

```json
{
  "image": "ghcr.io/froazin/devcontainer-images/base:44",
  "features": {
    "ghcr.io/froazin/devcontainer-features/common-utils:0": {}
  }
}
```

On that pairing, no further configuration is needed. On any other image
the feature still installs its utilities, but systemd will not be running
unless the image replicates the base image's init contract itself.


---

_Note: This file was auto-generated from the [devcontainer-feature.json](https://github.com/froazin/devcontainers/blob/main/features/src/common-utils/devcontainer-feature.json).  Add additional notes to a `NOTES.md`._
