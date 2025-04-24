#! /usr/bin/env bash

set -e

TMP_DIR=''

function pre_install_checks {
    local required_packages

    required_packages=("curl" "tar" "mktemp")

    for pkg in "${required_packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Failed to find require package: $pkg."
            return 1
        }
    done

    return 0
}

function get_arch {
    local arch
    
    arch="$(uname -m | tr "[:upper:]" "[:lower:]")"
    case "$arch" in
    x86_64)
        arch="x64"
        ;;
    aarch64)
        arch="arm64"
        ;;
    *)
        echo "Unsupported architecture: $arch." 1>&2
        return 1
        ;;
    esac

    echo "$arch"
    return 0
}

function github_api_request {
    local request_method
    local request_uri
    local request_body
    local request_args

    request_method="$1"
    request_uri="$2"
    request_body="${3:-}"

    if [[ ! "$request_method" =~ ^(GET|POST|PUT|DELETE)$ ]]; then
        echo "$request_method is not a valid HTTP method." 1>&2
        return 1
    fi

    request_uri="$(sed -r 's/^\///' <<<"$request_uri")"
    if [[ -z "$request_uri" ]]; then
        echo "Request URI is required." 1>&2
        return 1
    fi

    request_args=(
        "-X" "$request_method"
        "-H" "Accept: application/vnd.github.v3+json"
        "-H" "User-Agent: @froazin/devcontainers"
        "-H" "Accept-Encoding: utf-8"
    )

    # If GITHUB_TOKEN is set, use it to authenticate the request otherwise
    # a lower rate limit will be applied.
    if [[ -n "${GITHUB_TOKEN:-""}" ]]; then
        echo "Using GITHUB_TOKEN for authentication." 1>&2
        request_args+=(
            "-H" "Authorization: token ${GITHUB_TOKEN}"
        )
    fi

    if [[ -n "$request_body" ]]; then
        if ! jq --exit-status <<<"$request_body" >/dev/null 2>&1; then
            echo "Failed to parse request body as JSON." 1>&2
            return 1
        fi

        request_args+=(
            "-H" "Content-Type: application/json"
            "-d" "$(jq -c <<<"$request_body" || { return 1; })"
        )
    fi

    curl -sfL "${request_args[@]}" "https://api.github.com/$request_uri" || {
        echo "Failed to make request to GitHub API." 1>&2
        return 1
    }

    return 0
}

function get_matching_tag {
    # Fetch the latest matching tag for the given ref.
    local ref
    local uri

    ref="tags/v$(sed -r 's/(refs\/){0,1}(tags\/){0,1}v//' <<<"$1")"
    if [[ -z "$ref" ]]; then
        echo "Ref is required." 1>&2
        return 1
    fi

    uri="repos/pulumi/pulumi/git/refs/$(sed -r 's/^\///' <<<"$ref")"
    response="$(github_api_request GET "$uri")" || {
        echo "Failed to get ref information." 1>&2
        return 1
    }

    tags="$(jq -r '.[] | select(.ref | startswith("refs/tags/v")) | .ref' <<<"$response" 2>/dev/null)" || {
        echo "Failed to parse response." 1>&2
        return 1
    }

    tag="$(uniq <<<"$tags" | sort -V | tail -n 1)" || {
        echo "Failed to get latest tag." 1>&2
        return 1
    }

    echo "$tag" | sed -r 's/refs\/tags\///'

    return 0
}

function get_download_url {
    local arch
    local release
    local download_url

    release="$1"
    if [[ -z "$release" ]]; then
        echo "Release is required." 1>&2
        return 1
    fi

    arch="$(get_arch)"
    if ! [[ "$arch" =~ ^(x64|arm64)$ ]]; then
        echo "Architecture is not supported: $arch." 1>&2
        return 1
    fi

    if [[ "$release" == "latest" ]]; then
        uri="repos/pulumi/pulumi/releases/latest"
    else
        uri="repos/pulumi/pulumi/releases/tags/$release"
    fi

    response="$(github_api_request GET "$uri")" || {
        echo "Failed to get release information." 1>&2
        return 1
    }

    jq -r ".assets[] | select(.name | startswith(\"pulumi-\") and endswith(\"linux-$arch.tar.gz\")) | .browser_download_url" <<<"$response" 2>/dev/null || {
        echo "Failed to parse response." 1>&2
        return 1
    }

    return 0
}

function cleanup_install {
    local tmp_dir

    tmp_dir="${TMP_DIR:-}"

    if [ -d "${tmp_dir}" ]; then
        echo "Cleaning up."
        rm -rf "${tmp_dir}" >/dev/null 2>&1 || {
            echo "Failed to cleanup temporary directory."
            return 1
        }
    fi

    echo "Done."
    return 0
}

function install_pulumi {
    local bin_path
    local download_url
    local tmp_dir

    download_url="$1"
    bin_path="/usr/local/bin"

    echo "Running pre-installation steps."
    {
        if ! [ -d "${bin_path}" ]; then
            mkdir -p "${bin_path}" || {
                echo "Failed to create directory ${bin_path}"
                return 1
            }
        fi

        tmp_dir="$(mktemp -d)" || {
            echo "Failed to create temporary directory."
            return 1
        }

        TMP_DIR="${tmp_dir:-}"
        trap 'cleanup_install' EXIT
    } || {
        echo "Pre-installation steps failed."
        return 1
    }

    {
        echo "Downloading."
        curl -o "$tmp_dir/pulumi.tar.gz" -sfL "$download_url" || {
            echo "Failed to download Pulumi."
            return 1
        }

        echo "Extracting archive."
        tar -xzf "$tmp_dir/pulumi.tar.gz" -C "$tmp_dir" || {
            echo "Failed to extract Pulumi."
            return 1
        }

        for file in "$tmp_dir"/pulumi/*; do
            if [[ -f "$file" ]]; then
                local filename
                filename="$(basename "$file")"

                echo "Copying $filename to $bin_path/$filename."
                cp "$file" "$bin_path/$filename" || {
                    echo "Failed to copy $filename to $bin_path."
                    return 1
                }

                chown "$(id -u):$(id -g)" "$bin_path/$filename" || {
                    echo "Failed to change ownership of $filename."
                    return 1
                }

                chmod +x "$bin_path/$filename" || {
                    echo "Failed to make $filename executable."
                    return 1
                }
            fi
        done
    } || {
        echo "Failed to install pulumi."
        return 1
    }

    return 0
}

function main {
    local download_url
    local release

    pre_install_checks || return 1

    echo "Starting installation for Pulumi..."

    if [[ "${VERSION:-latest}" == "latest" ]]; then
        release="latest"
    else
        echo "Getting latest matching tag for version ${VERSION}..."
        release="$(get_matching_tag "${VERSION}")" || return 1
        echo "Found matching tag: ${release}"
    fi

    echo "Getting download URL..."
    download_url="$(get_download_url "${release:-latest}")" || return 1
    if [[ -z "$download_url" ]]; then
        echo "Failed to get download URL." 1>&2
        return 1
    fi
    echo "Pulumi will be downloaded from: ${download_url}"

    echo "Installing Pulumi..."
    install_pulumi "${download_url}" || return 1

    echo "Done!"
    return 0
}

if [[ "$(basename "$0")" == "install.sh" ]]; then
    main "$@" || {
        echo "Installation failed."
        exit 1
    }
fi
