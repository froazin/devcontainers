#! /usr/bin/env bash

set -e

source "$(sdkmod logging)" || exit 1
source "$(sdkmod common)" || exit 1

_FEATURE_NAME="shfmt"
_TMP_DIR=''

function pre_install_checks {
    local required_packages

    required_packages=("curl" "mktemp")

    check_commands "${required_packages[@]}" || {
        log error "Missing required packages: ${required_packages[*]}"
        return 1
    }

    return 0
}

function get_bin_path {
    local bin_path

    if [[ "${SHFMTBINPATH:-"automatic"}" =~ auto ]]; then
        bin_path="/usr/local/bin"
    else
        bin_path="${SHFMTBINPATH}"
    fi

    if [ -z "${bin_path}" ]; then
        log error "Invalid bin path."
        return 1
    fi

    echo "${bin_path}"
    return 0
}

function get_shfmt_release {
    local version

    if [[ "${SHFMTVERSION:-"latest"}" =~ latest ]]; then
        version=''
    else
        version="${SHFMTVERSION}"
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

    {
        download_url="$(
            curl -fL "https://api.github.com/repos/mvdan/sh/releases/$release" 2>/dev/null |
                grep browser_download_url |
                cut -d '"' -f 4 |
                grep -E "shfmt_v.*_${kernel}_${machine}*"
        )"
    } || {
        log error "Failed to fetch download URL."
        return 1
    }

    if [ -z "${download_url}" ]; then
        log error "Failed to determine download URL. Check the release version."
        return 1
    fi

    echo "${download_url}"
    return 0
}

function cleanup_install {
    local tmp_dir

    tmp_dir="${_TMP_DIR:-}"

    if [ -d "${tmp_dir}" ]; then
        log info "Cleaning up."
        rm -rf "${tmp_dir}" >/dev/null 2>&1 || {
            log error "Failed to cleanup temporary directory."
            return 1
        }
    fi

    log info "Done."
    return 0
}

function install_shfmt {
    local bin_path
    local download_url
    local tmp_dir

    bin_path="$1"
    download_url="$2"

    log info "Preparing."

    {
        if ! [ -d "${bin_path}" ]; then
            mkdir -p "${bin_path}" >/dev/null 2>&1
        fi

        if ! tmp_dir="$(mktemp -d 2>/dev/null)"; then
            log error "Failed to create temporary directory."
            return 1
        fi

        _TMP_DIR="${tmp_dir:-}"
        trap 'cleanup_install' EXIT
    } || {
        log error "Pre-installation steps failed."
        return 1
    }

    {
        log info "Downloading."
        curl -o "$tmp_dir/shfmt" -fL "$download_url" >/dev/null 2>&1

        log info "Copying files."
        cp "$tmp_dir/shfmt" "$bin_path/shfmt" >/dev/null 2>&1

        log info "Setting permissions."
        chmod a+x "$bin_path/shfmt" >/dev/null 2>&1
    } || {
        log error "Failed to install shfmt."
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

    pre_install_checks "$version" || return 1

    log info "Starting installation for shfmt..."

    release=$(get_shfmt_release) || {
        log error "Failed to determine release."
        return 1
    }

    log info "Using release: $(sed 's/tags\///' <<<"${release}")"

    bin_path="$(get_bin_path)" || {
        log error "Failed to determine bin path."
        return 1
    }

    log info "Using bin path: ${bin_path}"

    arch=$(get_arch) || {
        log error "Failed to determine architecture."
        return 1
    }

    log info "Found architecture ${arch}."

    kernel=$(get_kernal) || {
        log error "Failed to determine kernel."
        return 1
    }

    log info "Found kernel ${kernel}."

    download_url=$(get_download_url "${kernel}" "${arch}" "${release}") || {
        log error "Failed to determine download URL."
        return 1
    }

    log info "Found download url: ${download_url}"

    install_shfmt "${bin_path}" "${download_url}" || return 1
    log info "Done."

    return 0
}

main "$*" || { log fatal "Installation failed."; }
