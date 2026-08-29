# Base Image (base)

A Fedora base image that boots systemd as PID 1 inside a dev container,
modelled on Red Hat's [ubi-init](https://catalog.redhat.com/en/software/containers/ubi9/ubi-init/615bdc22075b022acc111bf6)
images. Fedora 44 is currently the only variant.

```text
ghcr.io/froazin/devcontainer-images/base:44
```

## What the image provides

- `CMD ["/sbin/init"]` and `ENV container=oci`, ubi-init style.
- `STOPSIGNAL SIGRTMIN+3` — systemd ignores SIGTERM as PID 1 (it triggers a
  daemon re-exec instead), so without this every stop would hang out the
  grace period and end in SIGKILL. With it, containers halt cleanly in
  under a second.
- The ubi9-init unit mask list (systemd-remount-fs, dev-hugepages.mount,
  sys-fs-fuse-connections.mount, systemd-logind, getty.target,
  console-getty, systemd-udev-trigger, systemd-udevd, systemd-random-seed,
  systemd-machine-id-commit), extended with systemd-networkd
  (service/socket/wait-online) and systemd-resolved, which Fedora pulls in
  as weak dependencies of systemd and which misbehave in containers
  (udevd would genuinely start under a privileged container, and resolved
  would fight podman for /etc/resolv.conf).
- A truncated `/etc/machine-id`. The systemd RPM bakes a concrete machine
  id into the image layer at install time; truncating it means every
  container generates a fresh transient id at boot (the masked
  systemd-machine-id-commit keeps it transient).
- Dev container metadata baked into the `devcontainer.metadata` image
  label, applied automatically to every dev container using this image:
  - `overrideCommand: false` — the devcontainer CLI hands PID 1 to the
    image's `/sbin/init` instead of its own keep-alive shell. This is the
    load-bearing property: without it systemd never starts.
  - `privileged: true` — under rootless podman with cgroups v2 this grants
    a writable `/sys/fs/cgroup` and CAP_SYS_ADMIN inside the user
    namespace, which systemd needs to boot. Note that rootless "privileged"
    only ever grants the invoking user's own privileges.
  - tmpfs mounts on `/run` and `/tmp` — what podman's own systemd mode
    would provide; the devcontainer CLI defeats podman's autodetection, so
    the image declares them itself. Contents do not survive restarts.
  - `shutdownAction: "stopContainer"` — VS Code stops the container when
    the window disconnects, so containers are not left running.
- journald logs persistently to `/var/log/journal` on the container
  filesystem (the Fedora default), so `journalctl` output survives
  container restarts but not container removal.

## Usage

```json
{
  "image": "ghcr.io/froazin/devcontainer-images/base:44"
}
```

No further configuration is required: the metadata label carries
everything. Pair it with the
[common-utils](../../features/src/common-utils) feature for a usable
development environment.

## Warnings

- Never set `"init": true` in devcontainer.json — it injects tini as
  PID 1, which pre-empts systemd and breaks the image.
- Lifecycle hooks (postCreateCommand, postStartCommand, ...) may run while
  systemd is still booting. If a hook depends on a systemd service, gate
  it on `systemctl is-system-running --wait`.
- Feature entrypoints run normally (before PID 1 is handed to systemd's
  exec), but long-running services should be systemd units, not
  entrypoint daemons.
- Because the metadata is baked into the image label, a devcontainer.json
  can override `overrideCommand` (breaking systemd) but can never revoke
  `privileged` — do not use this image where a privileged container is
  unacceptable.

## Host requirements

See the repository [README](../../README.md#host-requirements) — rootless
podman on Fedora WSL2 with cgroups v2 and a user API socket.

## Building and testing

```sh
uv run invoke build-images
uv run invoke test-images
```

The test suite boots a container from the image definition and asserts:
PID 1 is systemd, the system reaches running/degraded, journald answers
queries, a unit can be started, the mask list is applied, and a stop
completes promptly (proving the stop signal reaches systemd). Note that
the npm test scripts in package.json do not build images first; the
invoke tasks are the canonical entry points.
