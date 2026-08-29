#!/usr/bin/sh

utils_common_get_pkgmgr() {
  possible_pkgmgrs="dnf tdnf microdnf yum"

  for pkgmgr in ${possible_pkgmgrs}; do
    if command -v "${pkgmgr}" >/dev/null 2>&1; then
      echo "${pkgmgr}"
      return 0
    fi
  done

  echo "No supported package manager found." >&2
  return 1
}

utils_common_ensure_command() {
  command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Error: ${command_name} is not installed or not in PATH." >&2
    exit 1
  fi
}
