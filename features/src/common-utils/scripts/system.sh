#!/usr/bin/sh

system_check() {
  command -v dnf >/dev/null 2>&1 || {
    echo "dnf is not installed. Please install dnf and try again." 1>&2
    return 1
  }
}

system_install_required_packages() {
  packages="
  curl
  direnv
  git
  iputils
  jq
  nmap-ncat
  openssl
  openssh-clients
  shellcheck
  shfmt
  socat
  systemd
  unzip
  xz
  yq
  zip
  zsh
  "

  required_packages=""
  for package in ${packages}; do
    command -v "${package}" >/dev/null 2>&1 || {
      required_packages="${required_packages} ${package}"
    }
  done

  if [ -n "${required_packages}" ]; then
    # shellcheck disable=SC2086
    dnf install -y ${required_packages} || {
      echo "Failed to install required packages: ${required_packages}" 1>&2
      return 1
    }
  fi
}

system_inject_custom_bins() {
  bin_path="$(dirname "$(realpath "$0")")/assets/bin"

  [ -d "${bin_path}" ] || {
    echo "No custom binaries found in ${bin_path}. Skipping injection." 1>&2
    return 0
  }

  for bin in "${bin_path}"/*; do
    [ -f "${bin}" ] || continue
    bin_name="$(basename "${bin}")"
    target_path="/usr/local/bin/${bin_name}"

    if [ -f "${target_path}" ]; then
      echo "Warning: ${target_path} already exists. Skipping."
      continue
    fi

    install -m 755 "${bin}" "${target_path}" || {
      echo "Failed to install ${bin_name} to ${target_path}" 1>&2
      return 1
    }
  done
}

system_install() {
  system_check || return 1
  system_install_required_packages || return 1
  system_inject_custom_bins || return 1
}
