#! /usr/bin/env bash

set -e

function pre_install_checks {
    local version
    local required_packages

    version="$1"
    required_packages=("curl")

    for pkg in "${required_packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Failed to find required package: $pkg."
            return 1
        }
    done

    return 0
}

function get_direnv_release {
    local version

    if [[ "${DIRENVVERSION:-"latest"}" =~ latest ]]; then
        version=''
    else
        version="${DIRENVVERSION}"
    fi

    if [[ -n "${version:-}" ]]; then
        echo "tags/${version}"
    else
        echo "latest"
    fi

    return 0
}

function get_kernal {
    kernel=$(uname -s | tr "[:upper:]" "[:lower:]")

    if [[ "${kernel}" =~ mingw* ]]; then
        kernel="windows"
    fi

    echo "${kernel}"
    return 0
}

function get_arch {
    case "$(uname -m)" in
    x86_64)
        echo "amd64"
        ;;
    i686 | i386)
        echo "386"
        ;;
    armv7l)
        echo "arm"
        ;;
    aarch64 | arm64)
        echo "arm64"
        ;;
    *)
        return 1
        ;;
    esac

    return 0
}

function get_download_url {
    local kernel
    local machine
    local release
    local download_url

    kernel="$1"
    machine="$2"
    release="$3"

    download_url="$(
        curl -fL "https://api.github.com/repos/direnv/direnv/releases/$release" 2>/dev/null |
            grep browser_download_url |
            cut -d '"' -f 4 |
            grep "direnv.$kernel.$machine\$"
    )" || return 1

    if [ -z "${download_url}" ]; then
        return 1
    fi

    echo "${download_url}"
    return 0
}

function install_direnv {
    local bin_path
    local download_url

    bin_path="$1"
    download_url="$2"

    echo "Downloading..."
    if ! curl -o "$bin_path/direnv" -fL "$download_url" >/dev/null 2>&1; then
        echo "Failed to download direnv."
        return 1
    fi

    echo "Download completed."

    echo "Setting permissions."
    if ! chmod a+x "$bin_path/direnv" >/dev/null 2>&1; then
        echo "Failed to set permissions."
        return 1
    fi

    echo "Copying profile."
    if [ ! -d "/usr/local/etc/profile.d" ]; then
        mkdir -p "/usr/local/etc/profile.d" >/dev/null 2>&1 || {
            echo "Failed to create directory /usr/local/etc/profile.d"
            return 1
        }
    fi

    if ! cp --force "$(dirname "$0")/profiles/direnv.profile.sh" "/usr/local/etc/profile.d/direnv.profile.sh" >/dev/null 2>&1; then
        echo "Failed to copy profile."
        return 1
    fi

    chmod 644 "/usr/local/etc/profile.d/direnv.profile.sh" >/dev/null 2>&1 || {
        echo "Failed to set permissions for profile."
        return 1
    }

    ln --symbolic --force "/usr/local/etc/profile.d/direnv.profile.sh" "/etc/profile.d/direnv.profile.sh" >/dev/null 2>&1 || {
        echo "Failed to create symlink for profile."
        return 1
    }

    return 0
}

function main {
    local arch
    local bin_path
    local download_url
    local kernel
    local release

    bin_path="/usr/local/bin"
    pre_install_checks "$version" || return 1

    echo "Starting installation for direnv..."

    if ! release=$(get_direnv_release); then
        echo "Failed to determine release."
        return 1
    fi

    if ! arch=$(get_arch); then
        echo "Failed to determine architecture."
        return 1
    fi

    echo "Found architecture ${arch}."

    if ! kernel=$(get_kernal); then
        echo "Failed to determine kernel."
        return 1
    fi

    echo "Found kernel ${kernel}."

    if ! download_url=$(get_download_url "${kernel}" "${arch}" "${release}"); then
        echo "Failed to determine download URL."
        return 1
    fi

    echo "Found release: ${download_url}"

    install_direnv "${bin_path}" "${download_url}" || return 1
    echo "Done."

    return 0
}

main "$*" || exit 1
