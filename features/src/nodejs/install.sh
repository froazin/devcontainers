#!/usr/bin/env bash

set -e

# shellcheck disable=SC1090 # sdkmod is designed to be sourced.
source "$(sdkmod logging)" || exit 1

# shellcheck disable=SC1090 # sdkmod is designed to be sourced.
source "$(sdkmod common)" || exit 1

_FEATURE_NAME="nodejs"

function check_release {
    local release
    local min_release
    local max_release

    release="$1"
    min_release="16"
    max_release="24"

    if ! [[ "$release" =~ ^[0-9]+$ ]]; then
        return 1
    fi

    if [[ "$release" -lt "$min_release" ]] ||
        [[ "$release" -gt "$max_release" ]]; then
        return 1
    fi

    return 0
}

function get_latest_lts_release {
    local release

    release="$(curl -sL https://nodejs.org/dist/index.json | jq -r '.[] | select(.lts != false) | .version' | sort -V | tail -n 1)" || {
        log error "Failed to get latest LTS release."
        return 1
    }

    release="$(echo "$release" | sed 's/v//' | cut -d '.' -f 1)" || {
        log error "Failed to parse latest LTS release."
        return 1
    }

    echo "$release"

    return 0
}

function pre_install_checks {
    local release
    local required_packages

    release="$1"
    required_packages=("curl" "bash" "zip" "sdkmod")

    log info "Running pre-installation checks."

    check_release "$release" || {
        log error "Invalid Node.js release: $release"
        return 1
    }

    check_commands "${required_packages[@]}" || {
        log error "Missing required packages: ${required_packages[*]}"
        return 1
    }

    return 0
}

function install_nodejs {
    local release
    local distro
    local tmp_dir
    local install_cmd
    local cleanup_cmd

    release="$1"

    distro="$(get_distro_name)" || {
        log error "Failed to get distribution name."
        return 1
    }

    # shellcheck disable=SC2317
    function post_install {
        trap true RETURN

        if [ -z "$cleanup_cmd" ]; then
            cleanup_cmd='true'
        fi

        log info "Cleaning up Node.js installation files."
        bash <<<"$cleanup_cmd" >/dev/null 2>&1 || {
            log error "Failed to run clean-up for Node.js installation."
        }

        if [ -z "$tmp_dir" ]; then
            return 0
        fi

        if [ -d "$tmp_dir" ]; then
            log info "Removing temporary files."

            rm -rf "$tmp_dir" || {
                log warning "Failed to remove temporary files."
            }
        fi

        return 0
    }
    trap post_install RETURN

    case "$distro" in
    debian | ubuntu)
        setup_url="https://deb.nodesource.com/setup_$release.x"
        install_cmd="DEBIAN_FRONTEND=noninteractive; apt-get update --yes && apt-get install --yes --no-install-recommends nodejs"
        cleanup_cmd="apt clean; rm -rf /var/lib/apt/lists/*"

        type node >/dev/null 2>&1 && {
            log info "Removing existing Node.js installation."

            apt-get remove -y nodejs >/dev/null 2>&1 || {
                log error "Failed to remove existing Node.js installation."
                return 1
            }

            apt-get autoremove -y >/dev/null 2>&1 || {
                log error "Failed to remove unused packages."
                return 1
            }
        }
        ;;
    *)
        log error "Unsupported distribution: $distro"
        return 1
        ;;
    esac

    tmp_dir="$(mktemp -d)" || {
        log error "Failed to create temporary directory."
        return 1
    }

    log info "Downloading Node.js setup script from $setup_url."
    curl -o "$tmp_dir/setup.sh" -fL "$setup_url" >/dev/null 2>&1 || {
        log error "Failed to download Node.js setup script."
        return 1
    }

    log info "Running Node.js setup script."
    bash "$tmp_dir/setup.sh" >/dev/null 2>&1 || {
        log error "Failed to run Node.js setup script."
        return 1
    }

    log info "Installing Node.js."
    bash <<<"$install_cmd" >/dev/null 2>&1 || {
        log error "Failed to install Node.js."
        return 1
    }

    log info "Updating Node.js packages."
    npm install -g npm >/dev/null 2>&1 || {
        log error "Failed to upgrade npm to the latest version"
    }

    npm install -g corepack >/dev/null 2>&1 || {
        log error "Failed to upgrade corepack to the latest version"
    }

    log info "Node.js installation completed."
    return 0
}

function main {
    local release

    release="${NODERELEASE:-"automatic"}"

    log info "Running Node.js install script."
    if [[ "$release" == "automatic" ]]; then
        log info "Looking up latest LTS release."

        release="$(get_latest_lts_release)" || {
            log error "Failed to get latest LTS release."
            return 1
        }
    fi

    pre_install_checks "${release}" || return 1

    log info "Using Node.js release: $release"
    install_nodejs "${release}" || return 1

    log info "Verifying Node.js installation."
    check_commands "node" "npm" "npx" "corepack" || {
        log error "Node.js installation could not be verified."
        return 1
    }

    log info "Done."
    return 0
}

main "$@" || {
    log error "Failed to install SDK."
    exit 1
}
