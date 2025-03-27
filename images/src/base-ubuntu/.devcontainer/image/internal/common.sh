#! /usr/bin/env bash

set -e

function check_commands() {
    # Check if the required packages are installed and available in the path.
    # if any are missing, return 1, otherwise return 0.
    requirements=("$@")
    failed=false

    for req in "${requirements[@]}"; do
        command -v "$req" >/dev/null 2>&1 || {
            command -v log >/dev/null 2>&1 || {
                log error "Failed to find command: $req"
            }
            failed=true
        }
    done

    if [[ $failed == true ]]; then
        return 1
    else
        return 0
    fi
}
