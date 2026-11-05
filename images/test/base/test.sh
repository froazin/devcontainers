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

report_results
