#!/usr/bin/sh

system_check() {
  command -v dnf >/dev/null 2>&1 || {
    echo "dnf is not installed. Please install dnf and try again." 1>&2
    return 1
  }
}

system_install_required_packages() {
  package_list="
  ca-certificates
  curl
  direnv
  gawk
  git
  gnupg2
  grep
  iproute
  iputils
  jq
  krb5-libs
  less
  libicu
  lsof
  man-db
  nano
  net-tools
  nmap
  nmap-ncat
  openssl
  openssh-clients
  openssl-libs
  psmisc
  rsync
  sed
  ShellCheck
  shfmt
  socat
  strace
  sudo
  systemd
  unzip
  vim-minimal
  which
  xz
  yq
  zip
  zsh
  zsh-autosuggestions
  zsh-syntax-highlighting
  "
  package_list="$(echo "${package_list}" | tr '\n' ' ')"

  if dnf -q list bubblewrap >/dev/null 2>&1; then
    package_list="${package_list} bubblewrap"
  fi

  if dnf -q list wget2-wget >/dev/null 2>&1; then
    package_list="${package_list} wget2-wget"
  elif dnf -q list wget1-wget >/dev/null 2>&1; then
    package_list="${package_list} wget1-wget"
  elif dnf -q list wget >/dev/null 2>&1; then
    package_list="${package_list} wget"
  fi

  if dnf -q list procps-ng >/dev/null 2>&1; then
    package_list="${package_list} procps-ng"
  elif dnf -q list procps >/dev/null 2>&1; then
    package_list="${package_list} procps"
  fi

  if dnf -q list zlib >/dev/null 2>&1; then
    package_list="${package_list} zlib"
  elif dnf -q list zlib-ng-compat >/dev/null 2>&1; then
    package_list="${package_list} zlib-ng-compat"
  fi

  # shellcheck disable=SC2086  # We want word splitting here to pass multiple packages to dnf.
  dnf install -y ${package_list} || {
    echo "Failed to install required packages: ${package_list}" 1>&2
    return 1
  }

  missing_packages=""
  for package in ${package_list}; do
    rpm -q "${package}" >/dev/null 2>&1 || {
      missing_packages="${missing_packages} ${package}"
    }
  done

  if [ -n "${missing_packages}" ]; then
    echo "The following required packages are still missing after installation: ${missing_packages}" 1>&2
    return 1
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
    target_path="/opt/froazin/bin/${bin_name}"

    if [ -f "${target_path}" ]; then
      echo "Warning: ${target_path} already exists. Skipping."
      continue
    fi

    install -m 755 "${bin}" "${target_path}" || {
      echo "Failed to install ${bin_name} to ${target_path}" 1>&2
      return 1
    }

    # TODO: This is a temporary solution/ /opt/froazin/bin should be in PATH for zsh sessions, but not for bash sessions.
    ln -s "${target_path}" "/usr/local/bin/${bin_name}" || {
      echo "Failed to create symlink for ${bin_name} in /usr/local/bin" 1>&2
      return 1
    }
  done
}

system_install() {
  system_check || return 1
  system_install_required_packages || return 1
  system_inject_custom_bins || return 1
}
