#!/usr/bin/env bash

set -e

function main {
    echo "Setting up utils."

    for file in "$(dirname "$0")/bin/"*; do
        local file_name
        file_name=$(basename "$file")

        if [ -z "$file_name" ]; then
            echo "File name is empty. Skipping."
            continue
        fi

        cp --force "$file" "/usr/local/bin/$file_name" || {
            echo "Failed to copy $file to /usr/local/bin/$file_name."
            return 1
        }

        chmod +x "/usr/local/bin/$file_name" || {
            echo "Failed to make $file executable."
            return 1
        }

        echo "Copied $file to /usr/local/bin/$file_name."
    done

    if ! type generate-docs >/dev/null 2>&1; then
        echo "generate-docs did not install correctly."
        return 1
    fi

    echo "Done."
    return 0
}

main "$@" || {
    echo "Setup failed for $? package(s)."
}
