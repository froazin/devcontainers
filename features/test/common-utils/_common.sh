#!/usr/bin/sh

# shellcheck disable=SC1091
. "./dev-container-features-test-lib"

check_required_commands() {
  commands="
  curl
  direnv
  git
  init
  jq
  ncat
  nmap
  openssl
  ping
  shellcheck
  shfmt
  socat
  ssh
  sudo
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
    printf "Checking for command '%s'... " "${cmd}"
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

check_pid1_is_systemd() {
  attempts=0
  comm=""

  while [ "${attempts}" -lt 10 ]; do
    comm="$(cat /proc/1/comm 2>/dev/null)" || comm=""
    if [ "${comm}" = "systemd" ]; then
      return 0
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  echo "Expected PID 1 to be 'systemd' but found '${comm:-unknown}'." 1>&2
  return 1
}
check "PID 1 is systemd (base image pairing)" check_pid1_is_systemd
