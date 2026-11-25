#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1

# The test runner mounts the shared helpers and sets TEST_UTILS to their path.
# shellcheck source=../test_utils.sh
. "${TEST_UTILS:?TEST_UTILS must give the path to test_utils.sh}"

check_os_release ID ubuntu
check_os_release VERSION_ID 26.04
check_os_release VERSION_CODENAME resolute

check "sh" sh -c "true"
check "bash" bash --version
check_os_packages "core-os-packages" coreutils dpkg
check_os_packages "systemd-packages" dbus procps systemd systemd-sysv

# Ubuntu's ubuntu user is removed, so UID and GID 1000 are free for a dev
# container's own user.
check "no ubuntu user" sh -c '! getent passwd ubuntu && ! getent group ubuntu'
check "UID and GID 1000 free" sh -c '! getent passwd 1000 && ! getent group 1000'
check "no ubuntu home" test ! -e /home/ubuntu

check "init is systemd" test "$(readlink -f /sbin/init)" = /usr/lib/systemd/systemd
check "systemd is PID 1" test "$(cat /proc/1/comm)" = systemd
# --wait blocks until boot finishes. Anything but running lists the failed units.
check "systemd is running" sh -c 'systemctl is-system-running --wait || { systemctl --failed --no-pager; exit 1; }'
check "devcontainer-init" test -x /usr/local/sbin/devcontainer-init
check "container is oci" test "${container:-}" = oci
check "default target is multi-user" test "$(systemctl get-default)" = multi-user.target
unit_states="$(systemctl is-enabled systemd-logind.service getty.target systemd-udevd.service 2> /dev/null | sort -u)"
check "container units masked" test "$unit_states" = masked

report_results
