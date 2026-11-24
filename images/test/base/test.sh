#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1

# shellcheck source=test_utils.sh
. ./test_utils.sh

check_os_release ID ubuntu
check_os_release VERSION_ID 26.04
check_os_release VERSION_CODENAME resolute

check "sh" sh -c "true"
check "bash" bash --version
check_os_packages "core-os-packages" coreutils dpkg
check_os_packages "systemd-packages" dbus procps systemd systemd-sysv

# The tests run in a plain container without systemd, so these check how
# systemd is set up, not that it boots.
check "init is systemd" test "$(readlink -f /sbin/init)" = /usr/lib/systemd/systemd
check "devcontainer-init" test -x /usr/local/sbin/devcontainer-init
check "container is oci" test "${container:-}" = oci
check "default target is multi-user" test "$(systemctl get-default)" = multi-user.target
unit_states="$(systemctl is-enabled systemd-logind.service getty.target systemd-udevd.service 2> /dev/null | sort -u)"
check "container units masked" test "$unit_states" = masked

report_results
