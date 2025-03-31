#! /usr/bin/env bash

set -e

function get_github_release_with_tag {
    # Fetch the JSON formatted payload for the github release at the given tag.
    local owner
    local repo
    local tag

    owner="$1"
    repo="$2"

    if [[ "$3" == "latest" ]]; then
        tag="latest"
    else
        tag="tags/$3"
    fi

    curl -fL "https://api.github.com/repos/$owner/$repo/releases/$tag" 2>/dev/null || {
        return 1
    }

    return 0
}

function get_github_latest_release {
    # Fetch the JSON formatted payload for the latest github release.
    local owner
    local repo

    owner="$1"
    repo="$2"

    get_github_release_with_tag "$owner" "$repo" "latest" || {
        return 1
    }

    return 0
}
