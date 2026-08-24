#!/usr/bin/sh

# shellcheck disable=SC1091
. "./dev-container-features-test-lib"

check_required_commands() {
  commands="
  curl
  direnv
  git
  nc
  jq
  openssl
  ping
  shellcheck
  shfmt
  socat
  ssh
  systemctl
  unzip 
  vi
  xdg-open
  xz
  yq
  zip
  zsh
  "

  missing=""
  for cmd in ${commands}; do
    printf "Checking for command '%s'...   " "${cmd}"
    command -v "${cmd}" >/dev/null 2>&1 || {
      printf "Missing.\n"
      missing="true"
      continue
    }

    printf "Found.\n"
  done

  if [ -n "${missing}" ]; then
    return 1
  fi
}
check "Required commands" check_required_commands
