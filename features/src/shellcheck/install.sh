#! /usr/bin/env bash

set -e

_TMP_DIR=''

function pre_install_checks {
    local required_packages

    required_packages=("curl" "tar" "mktemp")

    for pkg in "${required_packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Failed to find require package: $pkg."
            return 1
        }
    done

    return 0
}

function get_shellcheck_release {
    local version

    if [[ "${VERSION:-"latest"}" =~ latest ]]; then
        version=''
    else
        version="${VERSION}"
    fi

    if [[ -n "${version:-}" ]]; then
        echo "tags/${version}"
    else
        echo "latest"
    fi

    return 0
}

function get_kernal {
    uname -s | tr "[:upper:]" "[:lower:]"

    return 0
}

function get_arch {
    uname -m | tr "[:upper:]" "[:lower:]"

    return 0
}

function get_download_url {
    local kernel
    local arch
    local release
    local download_url

    kernel="$1"
    arch="$2"
    release="$3"

    download_url="$(
        curl -fL "https://api.github.com/repos/koalaman/shellcheck/releases/$release" 2>/dev/null |
            grep browser_download_url |
            cut -d '"' -f 4 |
            grep ".$kernel.$arch.tar.xz\$"
    )" || return 1

    if [ -z "${download_url}" ]; then
        return 1
    fi

    echo "${download_url}"
    return 0
}

function cleanup_install {
    local tmp_dir

    tmp_dir="${_TMP_DIR:-}"

    if [ -d "${tmp_dir}" ]; then
        echo "Cleaning up."
        rm -rf "${tmp_dir}" >/dev/null 2>&1 || {
            echo "Failed to cleanup temporary directory."
            return 1
        }
    fi

    echo "Done."
    return 0
}

function install_shellcheck {
    local bin_path
    local download_url
    local tmp_dir

    bin_path="$1"
    download_url="$2"

    echo "Preparing."

    {
        if ! [ -d "${bin_path}" ]; then
            mkdir -p "${bin_path}" >/dev/null 2>&1 || {
                echo "Failed to create directory ${bin_path}"
                return 1
            }
        fi

        tmp_dir="$(mktemp -d 2>/dev/null)" || {
            echo "Failed to create temporary directory."
            return 1
        }

        _TMP_DIR="${tmp_dir:-}"
        trap 'cleanup_install' EXIT
    } || {
        echo "Pre-installation steps failed."
        return 1
    }

    {
        echo "Downloading."
        curl -o "${tmp_dir}/shellcheck.tar.xz" -fL "${download_url}" >/dev/null 2>&1

        echo "Extracting."
        tar -xJf "${tmp_dir}/shellcheck.tar.xz" -C "${tmp_dir}" >/dev/null 2>&1

        echo "Copying files."
        cp --force "${tmp_dir}/shellcheck-v"*"/shellcheck" "${bin_path}" >/dev/null 2>&1

        echo "Setting permissions."
        chmod a+x "${bin_path}/shellcheck" >/dev/null 2>&1
    } || {
        echo "Failed to install shellcheck."
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
    pre_install_checks || return 1

    echo "Starting installation for shellcheck..."

    release="$(get_shellcheck_release)" || {
        echo "Failed to determine release."
        return 1
    }

    echo "Using release: ${release}"


    arch="$(get_arch)" || {
        echo "Failed to determine architecture."
        return 1
    }

    echo "Found architecture: ${arch}."

    kernel="$(get_kernal)" || {
        echo "Failed to determine kernel."
        return 1
    }

    echo "Found kernel: ${kernel}."

    download_url="$(get_download_url "${kernel}" "${arch}" "${release}")" || {
        echo "Failed to determine download URL."
        return 1
    }

    echo "Found release: ${download_url}"

    install_shellcheck "${bin_path}" "${download_url}" || return 1

    return 0
}

main "$*" || exit 1
