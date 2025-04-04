#!/usr/bin/env bash

set -e

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod common)" || exit 1
eval "$(sdkmod github)" || exit 1

POETRY_HOME="/usr/local/share/poetry"

_FEATURE_NAME="python"
_TMP_DIR=""
_CWD=""

function cleanup {
    if [[ -d "$_TMP_DIR" ]]; then
        log info "Cleaning up temporary directory $_TMP_DIR."
        rm -rf "$_TMP_DIR" || {
            log error "Failed to remove temporary directory $_TMP_DIR."
        }
    fi

    if [[ "$(pwd)" != "$_CWD" ]]; then
        log info "Restoring working directory."
        cd "$_CWD" || {
            log error "Failed to change directory to $_CWD."
            return 1
        }
    fi

    log info "Done!"
}

function get_python_release {
    local release
    local default_interpretter

    # release can be automatic, latest, or a specific release.
    case "${RELEASECYCLE:-"automatic"}" in
    automatic)
        log info "Using the platform's default Python release."
        if [[ -f /usr/libexec/platform-python ]]; then
            default_interpretter="/usr/libexec/platform-python"
        else
            default_interpretter="$(command -v python3 || command -v python)" || {
                log error "Failed to find the default Python interpreter."
                return 1
            }
        fi

        release="$($default_interpretter --version | sed -r 's/Python\s{0,1}//' | cut -d '.' -f 1,2)" || {
            log error "Failed to get the default Python release."
            return 1
        }

        log info "Found Python ${release}"
        ;;
    latest)
        log info "Using the latest Python release."
        release="$(curl -s https://endoflife.date/api/python.json | jq -r '.[0].latest' | cut -d '.' -f 1,2)" || {
            log error "Failed to get the latest Python release."
            return 1
        }

        log info "Found Python ${release}"
        ;;
    *)
        release="$(echo "$PYTHONRELEASE" | sed -r 's/v|V//')" || {
            log error "Failed to get the specified Python release."
            return 1
        }

        expr "$release" : '^[0-9]\+\.[0-9]\+$' >/dev/null || {
            log error "Invalid release format: $release"
            return 1
        }

        log info "Using Python ${release}"
        ;;
    esac

    echo "$release"
    return 0
}

function get_python_release_tag {
    local release
    local ref

    release="$1"

    if [[ -z "$release" ]]; then
        log error "Release is not set."
        return 1
    fi

    log info "Lookup up git tag for Python ${release}."

    ref="$(get_github_refs "python" "cpython" "tags/v$release" 2>/dev/null | jq -r '.[] | .ref' | sort -V | tail -n 1 | sed -r 's/refs\/tags\///')" || {
        log error "Failed to get refs for Python ${release}."
        return 1
    }

    if [[ -z "$ref" ]]; then
        log error "No refs found for Python ${release}."
        return 1
    fi

    log info "Using ref $ref."

    echo "$ref"
    return 0
}

function clone_python {
    local tag

    tag="$1"

    if [[ -z "$_TMP_DIR" || -z "$tag" ]]; then
        log error "Work directory or commit SHA is not set."
        return 1
    fi

    if ! [[ -d "$_TMP_DIR" ]]; then
        log error "Work directory $_TMP_DIR does not exist."
        return 1
    fi

    log info "Cloning Python repository into $_TMP_DIR."
    git clone --depth 1 --branch "$tag" https://github.com/python/cpython.git "$_TMP_DIR" >/dev/null 2>&1 || {
        log error "Failed to clone Python repository."
        return 1
    }
}

function build_python {
    local release
    release="$1"

    if [[ -z "$release" ]]; then
        log error "Release is not set."
        return 1
    fi

    if [[ ! -d "$_TMP_DIR" ]]; then
        log error "Work directory $_TMP_DIR does not exist."
        return 1
    fi

    cd "$_TMP_DIR" || {
        log error "Failed to change directory to $_TMP_DIR."
        return 1
    }

    log info "Configuring Python build."
    eval "$_TMP_DIR"/configure --prefix="/usr/local" >/dev/null 2>&1 || {
        log error "Failed to configure Python build."
        return 1
    }

    log info "Building Python."
    make -j "$(nproc)" >/dev/null 2>&1 || {
        log error "Failed to build Python."
        return 1
    }

    log info "Installing Python."
    make altinstall >/dev/null 2>&1 || {
        log error "Failed to install Python."
        return 1
    } 

    {
        local major_version
        major_version="$(echo "$release" | cut -d '.' -f 1)"

        update-alternatives --install "/usr/local/bin/python" "python" "/usr/local/bin/python$release" 99 >/dev/null 2>&1
        update-alternatives --install "/usr/local/bin/python$major_version" "python$major_version" "/usr/local/bin/python$release" 99 >/dev/null 2>&1
    } || {
        log error "Failed to create symlinks for Python$release"
        return 1
    }

    if ! check_commands python python3 "python$release"; then
        log error "Could not find Python or Python3 in the PATH."
        return 1
    fi

    log info "Python build and installation completed successfully."
    return 0
}

function install_poetry {
    local release
    local python_executable

    export POETRY_HOME
    release="$1"

    if [[ -z "$release" ]]; then
        log error "Release is not set."
        return 1
    fi

    python_executable="/usr/local/bin/python$release"
    if [[ ! -x "$python_executable" ]]; then
        log error "Python executable $python_executable does not exist."
        return 1
    fi

    if [[ ! -d "$POETRY_HOME" ]]; then
        mkdir -p "$POETRY_HOME" || {
            log error "Failed to create Poetry home directory $POETRY_HOME."
            return 1
        }
    fi

    log info "Installing Poetry using Python $release."
    curl -sSL https://install.python-poetry.org 2>/dev/null | $python_executable - >/dev/null 2>&1 || {
        log error "Failed to install Poetry."
        return 1
    }

    update-alternatives --install "/usr/local/bin/poetry" "poetry" "$POETRY_HOME/bin/poetry" 99 >/dev/null 2>&1 || {
        log error "Failed to create symlink for Poetry."
        return 1
    }

    if ! check_commands poetry; then
        log error "Could not find Poetry in the PATH."
        return 1
    fi

    log info "Poetry installed successfully."
    return 0
}

function main {
    local required_packages
    local release
    local tag

    _CWD="$(pwd)"
    _TMP_DIR="$(mktemp -d)" || {
        log error "Failed to create temporary directory."
        return 1
    }

    trap cleanup EXIT

    required_packages=("curl" "jq" "make" "git")
    if ! check_commands "${required_packages[@]}"; then
        log error "Missing required commands: curl, jq, make, git"
        return 1
    fi

    release="$(get_python_release)" || {
        log error "Failed to get Python release."
        return 1
    }

    tag="$(get_python_release_tag "$release")" || {
        log error "Failed to get Python release SHA."
        return 1
    }

    clone_python "$tag" || {
        log error "Failed to clone Python repository."
        return 1
    }

    build_python "$release" || {
        log error "Failed to build Python."
        return 1
    }

    install_poetry "$release" || {
        log error "Failed to install Poetry."
        return 1
    }

    # TODO: also remember to add the new github modules to the docs

    return 0
}

if [[ "$(basename "$0")" == "install.sh" ]]; then
    main "$@" 2>&1 || {
        log fatal "Failed to install Python."
    }
else
    log fatal "This script is not intended to be sourced."
fi
