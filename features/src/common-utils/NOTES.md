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
