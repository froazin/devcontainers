# Dev Containers

Features and templates in this repository are written and tested against Fedora images. No guarantees are made about their functionality on other operating systems.

## Host requirements

Everything here targets a Fedora workstation running in WSL2 with rootless
podman. The devcontainer CLI expects docker, which is satisfied by the
podman docker shim and a user podman socket.

- Fedora on WSL2 with systemd enabled: `/etc/wsl.conf` must contain
  `[boot] systemd=true` (rootless podman needs the systemd user
  session/bus this provides).
- cgroups v2 (unified hierarchy) is mandatory for running systemd inside
  containers. WSL 2.5.x and later mount pure cgroups v2 by default; older
  WSL needs `[wsl2] kernelCommandLine = cgroup_no_v1=all` in
  `.wslconfig`. Verify with `stat -fc %T /sys/fs/cgroup` (expect
  `cgroup2fs`) and `podman info --format '{{.Host.CgroupsVersion}}'`
  (expect `v2`).
- Rootless podman 5.x with crun, with the user API socket enabled:
  `systemctl --user enable --now podman.socket`. Install the
  `podman-docker` shim (or export
  `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock`) so the
  devcontainer CLI finds a `docker`.
- cgroup delegation: the default cpu/memory/pids delegation is enough to
  boot systemd in containers. Using io/cpuset resource limits inside
  containers additionally needs a
  `/etc/systemd/system/user@.service.d/delegate.conf` drop-in with
  `Delegate=cpu cpuset io memory pids` (optional).
- Toolchain: Node >= 22.16 with npm >= 12 (`npm install`), and uv with
  Python 3.14 (`uv sync`). Tasks are run with `uv run invoke --list`.
- Known WSL wrinkle: WSL 2.5.x briefly broke the systemd user instance
  ([microsoft/WSL#13053](https://github.com/microsoft/WSL/issues/13053)).
  If `podman.socket` fails with "no systemd user session available",
  check the WSL version.
