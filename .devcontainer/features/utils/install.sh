#!/usr/bin/env bash

set -e

source "$(sdkmod logging)" || exit 1
source "$(sdkmod common)" || exit 1

_FEATURE_NAME="utils"

function main {
    log info "Setting up utils."

    for file in "$(dirname "$0")/bin/"*; do
        local file_name
        file_name=$(basename "$file")

        if [ -z "$file_name" ]; then
            log error "File name is empty. Skipping."
            continue
        fi

        cp --force "$file" "/usr/local/bin/$file_name" || {
            log error "Failed to copy $file to /usr/local/bin/$file_name."
            return 1
        }

        chmod +x "/usr/local/bin/$file_name" || {
            log error "Failed to make $file executable."
            return 1
        }

        log info "Copied $file to /usr/local/bin/$file_name."
    done

    check_commands generate-docs || {
        log error "generate-docs did not install correctly."
        return 1
    }

    log info "Done."
    return 0
}

main "$@" || {
    log fatal "Setup failed for $? package(s)."
}
