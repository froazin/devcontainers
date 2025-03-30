#!/usr/bin/env bash

set -e

source "$(dirname "$0")/sdk/logging.sh" 2>/dev/null || exit 1
source "$(dirname "$0")/sdk/common.sh" 2>/dev/null || exit 1

_FEATURE_NAME="fis-devcontainer-development-utils"

function install_nodejs {
    source "$(dirname "$0")/node.sh" || {
        log error "Couldn't find node.sh in the current directory."
        return 1
    }

    log info "Running Node.js install script."
    run "$*" || {
        log error "Node.js install script failed."
        return 1
    }

    log info "Verifying Node.js installation."
    check_commands "node" "npm" "npx" "corepack" || {
        log error "Node.js installation could not be verified."
        return 1
    }

    log info "Node.js installation verified."
    return 0
}

function install_utils {
    log warning "install_utils is not implemented"
    return 0
}

function main {
    log info "Starting setup."

    ( install_nodejs ) || return 1
    ( install_utils ) || return 1

    return 0
}

main "$*" && log info "Setup completed." || {
    log fatal "Setup failed for $? package(s)."
}
