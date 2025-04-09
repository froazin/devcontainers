#! /usr/bin/env bash

set -e

_TMP_DIR=''

function pre_install_checks {
    local required_packages

    required_packages=("curl" "mktemp")

    for pkg in "${required_packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Command $pkg is not available."
            return 1
        }
    done

    return 0
}

function get_shfmt_release {
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
        curl -fL "https://api.github.com/repos/mvdan/sh/releases/$release" 2>/dev/null |
            grep browser_download_url |
            cut -d '"' -f 4 |
            grep -E "shfmt_v.*_${kernel}_${machine}*"
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
        echo "Cleaning up..."
        rm -rf "${tmp_dir}" >/dev/null 2>&1 || {
            echo "Failed to cleanup temporary directory."
            return 1
        }
    fi

    echo "Done!"
    return 0
}

function install_shfmt {
    local bin_path
    local download_url
    local tmp_dir

    bin_path="$1"
    download_url="$2"

    echo "Preparing."

    {
        if ! [ -d "${bin_path}" ]; then
            mkdir -p "${bin_path}" >/dev/null 2>&1
        fi

        if ! tmp_dir="$(mktemp -d 2>/dev/null)"; then
            echo "Failed to create temporary directory."
            return 1
        fi

        _TMP_DIR="${tmp_dir:-}"
        trap 'cleanup_install' EXIT
    } || {
        echo "Pre-installation steps failed."
        return 1
    }

    {
        echo "Downloading."
        curl -o "$tmp_dir/shfmt" -fL "$download_url" >/dev/null 2>&1

        echo "Copying files."
        cp "$tmp_dir/shfmt" "$bin_path/shfmt" >/dev/null 2>&1

        echo "Setting permissions."
        chmod a+x "$bin_path/shfmt" >/dev/null 2>&1
    } || {
        echo "Failed to install shfmt."
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
    echo "Starting installation for shfmt..."

    release=$(get_shfmt_release) || {
        echo "Failed to determine release."
        return 1
    }

    echo "Using release: $(sed 's/tags\///' <<<"${release}")"

    arch=$(get_arch) || {
        echo "Failed to determine architecture."
        return 1
    }

    echo "Found architecture ${arch}."

    kernel=$(get_kernal) || {
        echo "Failed to determine kernel."
        return 1
    }

    echo "Found kernel ${kernel}."

    download_url=$(get_download_url "${kernel}" "${arch}" "${release}") || {
        echo "Failed to determine download URL."
        return 1
    }

    echo "Found download url: ${download_url}"

    install_shfmt "${bin_path}" "${download_url}" || return 1
    echo "Done."

    return 0
}

main "$@" || echo 1
