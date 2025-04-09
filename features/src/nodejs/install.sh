#!/usr/bin/env bash

set -e

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
        return 1
    }

    release="$(echo "$release" | sed 's/v//' | cut -d '.' -f 1)" || {
        return 1
    }

    echo "$release"

    return 0
}

function pre_install_checks {
    local release
    local required_packages

    release="$1"

    echo "Running pre-installation checks."

    check_release "$release" || {
        echo "Invalid Node.js release: $release"
        return 1
    }

    required_packages=("curl" "bash" "zip" "sdkmod")
    for pkg in "${required_packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Missing required package: $pkg."
            return 1
        }
    done

    return 0
}

function install_nodejs {
    local release
    local distro
    local tmp_dir
    local install_cmd
    local cleanup_cmd

    release="$1"

    if ! [ -f /etc/os-release ]; then
        echo "Unsupported distribution."
        return 1
    fi

    distro="$(grep '^ID=' /etc/os-release | cut -d '=' -f 2 | tr -d '"')" || {
        echo "Failed to get distribution name."
        return 1
    }

    # shellcheck disable=SC2317
    function post_install {
        trap true RETURN

        if [ -z "$cleanup_cmd" ]; then
            cleanup_cmd='true'
        fi

        echo "Cleaning up Node.js installation files."
        bash <<<"$cleanup_cmd" >/dev/null 2>&1 || {
            echo "Failed to run clean-up for Node.js installation."
        }

        if [ -z "$tmp_dir" ]; then
            return 0
        fi

        if [ -d "$tmp_dir" ]; then
            echo "Removing temporary files."

            rm -rf "$tmp_dir" || {
                echo "Failed to remove temporary files."
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
            echo "Removing existing Node.js installation."

            apt-get remove -y nodejs >/dev/null 2>&1 || {
                echo "Failed to remove existing Node.js installation."
                return 1
            }

            apt-get autoremove -y >/dev/null 2>&1 || {
                echo "Failed to remove unused packages."
                return 1
            }
        }
        ;;
    *)
        echo "Unsupported distribution: $distro"
        return 1
        ;;
    esac

    tmp_dir="$(mktemp -d)" || {
        echo "Failed to create temporary directory."
        return 1
    }

    echo "Downloading Node.js setup script from $setup_url."
    curl -o "$tmp_dir/setup.sh" -fL "$setup_url" >/dev/null 2>&1 || {
        echo "Failed to download Node.js setup script."
        return 1
    }

    echo "Running Node.js setup script."
    bash "$tmp_dir/setup.sh" >/dev/null 2>&1 || {
        echo "Failed to run Node.js setup script."
        return 1
    }

    echo "Installing Node.js."
    bash <<<"$install_cmd" >/dev/null 2>&1 || {
        echo "Failed to install Node.js."
        return 1
    }

    echo "Updating Node.js packages."
    npm install -g npm >/dev/null 2>&1 || {
        echo "Failed to upgrade npm to the latest version"
    }

    npm install -g corepack >/dev/null 2>&1 || {
        echo "Failed to upgrade corepack to the latest version"
    }

    echo "Node.js installation completed."
    return 0
}

function main {
    local release

    release="${NODERELEASE:-"automatic"}"

    echo "Running Node.js install script."
    if [[ "$release" == "automatic" ]]; then
        echo "Looking up latest LTS release."

        release="$(get_latest_lts_release)" || {
            echo "Failed to get latest LTS release."
            return 1
        }
    fi

    pre_install_checks "${release}" || return 1

    echo "Using Node.js release: $release"
    install_nodejs "${release}" || return 1

    echo "Verifying Node.js installation."
    packages=("node" "npm" "npx" "corepack")
    for pkg in "${packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Couldn't find required package: $pkg."
            return 1
        }

        echo "$pkg is installed."
    done

    echo "Done."
    return 0
}

main "$@" || exit 1
