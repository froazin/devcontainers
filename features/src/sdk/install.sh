#! /usr/bin/env bash

set -e

source "$(dirname "$0")/modules/logging.sh" || exit 1
source "$(dirname "$0")/modules/common.sh" || exit 1

_FEATURE_NAME="sdk"
_INSTALL_DIR="/usr/local/lib/vscode-dev-containers/features/sdk"

function install_modules {
    local module_dir

    module_dir="$(dirname "$0")/modules"
    if [ ! -d "$module_dir" ]; then
        log error "Dist directory not found: $module_dir"
        return 1
    fi

    if [ ! -d "$_INSTALL_DIR/modules" ]; then
        mkdir -p "$_INSTALL_DIR/modules" >/dev/null 2>&1 || {
            log error "Failed to create directory $_INSTALL_DIR/modules"
            return 1
        }
    fi

    log info "Copying modules."
    for file in "$module_dir"/*.sh; do
        if [ -f "$file" ]; then
            cp --force "$file" "$_INSTALL_DIR/modules/$(basename "$file")" >/dev/null 2>&1 || {
                log error "Failed to copy $file to $_INSTALL_DIR/modules/"
                return 1
            }

            chmod +x "$_INSTALL_DIR/modules/$(basename "$file")" >/dev/null 2>&1 || {
                log error "Failed to make $file executable."
                return 1
            }
        fi
    done

    log info "Module files copied successfully."
    return 0
}

function install_bins {
    local bin_dir

    bin_dir="$(dirname "$0")/bin"
    if [ ! -d "$bin_dir" ]; then
        log error "Bin directory not found: $bin_dir"
        return 1
    fi

    if [ ! -d "$_INSTALL_DIR/bin" ]; then
        mkdir -p "$_INSTALL_DIR/bin" >/dev/null 2>&1 || {
            log error "Failed to create directory $_INSTALL_DIR/bin"
            return 1
        }
    fi

    log info "Copying bin files."
    for file in "$bin_dir"/*; do
        if [ -f "$file" ]; then
            local filename
            filename="$(basename "$file")"

            cp --force "$file" "$_INSTALL_DIR/bin/$filename" >/dev/null 2>&1 || {
                log error "Failed to copy $file to $_INSTALL_DIR/bin/"
                return 1
            }

            chmod +x "$_INSTALL_DIR/bin/$filename" >/dev/null 2>&1 || {
                log error "Failed to make $file executable."
                return 1
            }

            ln --symbolic --force "$_INSTALL_DIR/bin/$filename" "/usr/local/bin/$filename" >/dev/null 2>&1 || {
                log error "Failed to create symbolic link for $file."
                return 1
            }
        fi
    done

    if ! check_commands sdkmod; then
        log error "Did not find sdkmod in path."
        return 1
    fi

    log info "Bin files copied successfully."
    return 0
}

function main {
    install_modules || {
        log error "Failed to install modules."
        return 1
    }

    install_bins || {
        log error "Failed to install bins."
        return 1
    }

    return 0
}

main "$@" || {
    log error "Failed to install SDK."
    exit 1
}
