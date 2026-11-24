#!/bin/sh
# Starts systemd as PID 1 in a container that isn't privileged. Docker mounts
# /sys/fs/cgroup read-only unless the container is privileged, and systemd
# exits at once when it can't create its cgroups, so this remounts the
# container's own cgroup tree read-write first. It needs CAP_SYS_ADMIN, and on
# hosts with AppArmor, an unconfined profile, which the image's
# devcontainer.metadata label asks for.
set -eu

# A private cgroup namespace on cgroup v2 shows PID 1 at the root of its own
# tree. Anything else is the host's tree, or cgroup v1, which systemd no longer
# supports, and systemd must never take over the host's cgroups.
if [ "$(cat /proc/self/cgroup)" != "0::/" ]; then
    echo "devcontainer-init: systemd needs cgroup v2 and a private cgroup namespace, which Docker gives a container by default on cgroup v2. Remove any --cgroupns=host from the container's options." >&2
    exit 1
fi

if [ ! -w /sys/fs/cgroup ] && ! mount -o remount,rw /sys/fs/cgroup; then
    echo "devcontainer-init: couldn't make /sys/fs/cgroup writable. Run the container with --cap-add SYS_ADMIN and, on hosts with AppArmor, --security-opt apparmor=unconfined." >&2
    exit 1
fi

exec /sbin/init "$@"
