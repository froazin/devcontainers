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

The container runs systemd as process ID (PID) 1, so you can run services in it with `systemctl`. It needs nothing more in your `devcontainer.json`: the image asks for the settings below itself. If you set any of them yourself, keep the values the image needs.

| Setting | Value | Why |
| --- | --- | --- |
| `overrideCommand` | `false` | Runs the image's command, which starts systemd, rather than a sleep loop |
| `init` | `false` | Keeps systemd as PID 1, with no other init in front of it |
| `capAdd` | `["SYS_ADMIN"]` | Lets the container make its own control groups writable, and lets systemd mount `/run` and `/tmp` |
| `securityOpt` | `["apparmor=unconfined"]` | Lets those mounts through on hosts with AppArmor |
| `shutdownAction` | `"stopContainer"` | Stops the container when you close the window, rather than leave systemd running |

The container doesn't need `--privileged`, but it does need cgroup v2 and its own cgroup namespace, which Docker gives every container on cgroup v2 by default. With `--cgroupns=host`, it exits with an error rather than start.

## What's in it

- Ubuntu 26.04 with systemd, D-Bus and `procps`. The default target is `multi-user.target`, and the units for hardware, consoles and logins are masked, as in an init image.
- `/usr/local/sbin/devcontainer-init`, the image's command, which makes the container's control groups writable and starts systemd. Docker stops the container with `SIGRTMIN+3`, so systemd shuts down cleanly.
- The Open Container Initiative (OCI) labels: the version, the manifest's `name` and `description` as the title and description, and the repository as the source.

## Tests

[test.sh](../../test/base/test.sh) checks that the image is the Ubuntu release it says it is, that what it should contain is there and how systemd is set up. The tests don't boot systemd.

## Licence

MIT. See [LICENSE](../../../LICENSE).
