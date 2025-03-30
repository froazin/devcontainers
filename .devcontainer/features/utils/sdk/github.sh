#! /usr/bin/env bash

set -e

function get_github_release_with_tag {
    # Fetch the JSON formatted payload for the github release at the given tag.
    local owner
    local repo
    local tag

    if [[ $# -ne 3 ]]; then
        log error "usage: get_github_release <owner> <repo> <tag>"
        return 1
    fi

    owner="$1"
    repo="$2"

    if [[ "$3" == "latest" ]]; then
        tag="latest"
    else
        tag="tags/$3"
    fi

    curl -fL "https://api.github.com/repos/$owner/$repo/releases/$tag" 2>/dev/null || {
        log error "Failed to fetch download URL."
        return 1
    }

    return 0
}

function get_github_latest_release {
    # Fetch the JSON formatted payload for the latest github release.
    local owner
    local repo

    if [[ $# -ne 2 ]]; then
        log error "usage: get_github_latest_release <owner> <repo>"
        return 1
    fi

    owner="$1"
    repo="$2"

    get_github_release_with_tag "$owner" "$repo" "latest" || {
        log error "Failed to fetch latest release."
        return 1
    }

    return 0
}
