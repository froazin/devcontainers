#!/usr/bin/sh

set -e

. "/etc/os-release" || exit 1
. "$(dirname "$0")/scripts/system.sh" || exit 1

main() {
  upgrade_packages="${UPGRADE_PACKAGES:-"true"}"
  username="${USERNAME:-"automatic"}"
  user_id="${USER_ID:-"automatic"}"
  group_id="${GROUP_ID:-"automatic"}"
  github_token="${GITHUBTOKEN:-""}"

  if [ -n "${github_token}" ]; then
    export GITHUB_TOKEN="${github_token}"
    echo "GitHub token is set." 1>&2
  fi

  system_install || exit 1
}

if [ "$(basename "$0")" = "install.sh" ]; then
  main "$@" || {
    echo "Installation failed."
    exit 1
  }
else
  echo "This script is intended to be run directly."
  exit 1
fi
