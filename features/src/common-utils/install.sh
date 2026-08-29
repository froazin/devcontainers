#!/usr/bin/sh

set -e

. "/etc/os-release" || exit 1
. "$(dirname "$0")/lib/utils/common.sh" || exit 1
. "$(dirname "$0")/lib/system.sh" || exit 1

main() {
  upgrade_packages="${UPGRADE_PACKAGES:-"true"}"
  username="${USERNAME:-"automatic"}"
  user_id="${USER_ID:-"automatic"}"
  group_id="${GROUP_ID:-"automatic"}"

  system_install || exit 1
}

if [ "$(basename "$0")" = "install.sh" ]; then
  main "$@" || {
    echo "Installation failed." 1>&2
    exit 1
  }
else
  echo "This script is intended to be run directly." 1>&2
  exit 1
fi
