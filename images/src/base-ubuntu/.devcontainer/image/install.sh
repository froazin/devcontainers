#!/usr/bin/env bash

set -e

MARKER_FILE="/usr/local/etc/vscode-dev-containers/fis-ubuntu.marker"

function print_banner {
    # This is literally just a bit of fun and is probably going to cause a
    # lot of problems. But I like it, so I'm keeping it. :)

    echo ""
    echo "  .-----."
    echo "  |F.-. |"
    echo "  | :i: |"
    echo "  | '-'S|"
    echo "  \`-----'"
    echo "Setup starting..."
    sleep 2

    return 0
}

function pre_setup_checks {
    local required_packages

    required_packages=("curl")

    if [[ $EUID -ne 0 ]]; then
        echo "This script must be run as root"
        return 1
    fi

    for pkg in "${required_packages[@]}"; do
        command -v "$pkg" >/dev/null 2>&1 || {
            echo "Missing required packages."
            return 1
        }
    done

    return 0
}

function install_code {
    # This script addresses an intermittent issue with the "code" command not detecting
    # vscode server as set up by the common-utils feature. It also ensures functionality
    # regardless of whether the common-utils feature is used. The script is installed
    # directly to /usr/bin to avoid being overwritten by the common-utils feature,
    # which installs its "code" command to /usr/local/bin.
    local code_path

    echo "Installing code helper script."
    code_path="$(dirname "$0")/bin/code"
    if [[ ! -f "$code_path" ]]; then
        echo "code not found at $code_path" 1>&2
        return 1
    fi

    cp --force "$code_path" /usr/bin || {
        echo "Failed to copy code to /usr/bin" 1>&2
        return 1
    }

    chmod +x /usr/bin/code || {
        echo "Failed to set permissions on /usr/bin/code" 1>&2
        return 1
    }
}

function install_profiles {
    local profile_name

    echo "Installing profiles."

    if ! [ -d "/usr/local/etc/profile.d" ]; then
        echo "Creating directory for profiles."

        mkdir --parents "/usr/local/etc/profile.d" >/dev/null 2>&1 || {
            echo "Failed to create directory for profiles."
            return 1
        }
    fi

    for profile in "$(dirname "$0")/profiles"/*; do
        echo "Creating profile: $(basename "$profile")"
        profile_name="fis-$(basename "$profile")"

        cp "$profile" "/usr/local/etc/profile.d/${profile_name}" >/dev/null 2>&1 || {
            echo "Failed to copy profile: $(basename "${profile}")"
            return 1
        }

        chmod 644 "/usr/local/etc/profile.d/${profile_name}" >/dev/null 2>&1 || {
            echo "Failed to set permissions for profile: $(basename "$profile")"
            return 1
        }

        ln --symbolic "/usr/local/etc/profile.d/${profile_name}" "/etc/profile.d/${profile_name}" >/dev/null 2>&1 || {
            echo "Failed to create symbolic link for profile: ${profile_name}"
            return 1
        }
    done

    echo "Installed profiles."
    return 0
}

function create_user {
    local username
    local user_uid
    local user_gid
    local old_username

    username="$1"
    user_uid="$2"
    user_gid="$3"

    if id -g "$user_gid" >/dev/null 2>&1; then
        echo "Group with id $user_gid already exists. Renaming to $username."

        groupmod --new-name "${username}" "$(id --name --group "$user_gid")" >/dev/null 2>&1 || {
            echo "Failed to rename group with id $user_gid."
            return 1
        }
    else
        echo "Creating group with id $user_gid."

        groupadd --gid "$user_gid" "${username}" >/dev/null 2>&1 || {
            echo "Group creation failed."
            return 1
        }
    fi

    if id -u "$user_uid" >/dev/null 2>&1; then
        echo "User with id $user_uid already exists. Renaming to $username."
        old_username="$(id --name --user "$user_uid")"

        usermod --login "${username}" "$(id --name --user "$user_uid")" >/dev/null 2>&1 || {
            echo "Failed to rename user."
            return 1
        }
    else
        echo "Creating user."

        useradd --create-home --uid "$user_uid" --gid "$user_gid" --shell /bin/bash "${username}" >/dev/null 2>&1 || {
            echo "Failed to create user."
            return 1
        }
    fi

    usermod --home "/home/${username}" "${username}" >/dev/null 2>&1 || {
        echo "Failed to set home directory."
        return 1
    }

    if [ -n "${old_username}" ] && [ -d "/home/${old_username}" ]; then
        echo "Renaming home directory."

        mv "/home/${old_username}" "/home/${username}" >/dev/null 2>&1 || {
            echo "Failed to rename old home directory to new home directory."
            return 1
        }
    else
        echo "Creating home directory."

        mkdir --parents "/home/${username}" >/dev/null 2>&1 || {
            echo "Failed to create home directory."
            return 1
        }
    fi

    chown --recursive "${username}:${username}" "/home/${username}" >/dev/null 2>&1 || {
        echo "Failed to set ownership of home directory."
        return 1
    }

    if ! [ -f "/home/$username/.sudo_as_admin_successful" ]; then
        echo "Supressing first time sudo message"

        touch "/home/$username/.sudo_as_admin_successful" || {
            echo "Failed to supress first time sudo message."
        }
    fi
}

function post_install {
    local first_run_file

    first_run_file='/usr/local/etc/vscode-dev-containers/first-run-notice.txt'

    echo "Creating marker file."
    if ! [ -d "$(dirname "$MARKER_FILE")" ]; then
        mkdir --parents "$(dirname "$MARKER_FILE")" >/dev/null 2>&1 || {
            echo "Failed to create directory for marker file."
            return 1
        }
    fi

    touch "$MARKER_FILE" >/dev/null 2>&1 || {
        echo "Failed to create marker file."
        return 1
    }

    echo "Supressing default first run notice."
    if ! [ -d "$(dirname "$first_run_file")" ]; then
        mkdir --parents "$(dirname "$first_run_file")" >/dev/null 2>&1 || {
            echo "Failed to create directory for first run file."
            return 1
        }
    fi

    touch "$first_run_file" >/dev/null 2>&1 || {
        echo "Failed to create first run file."
        return 1
    }

    rm -rf "$(dirname "$0")" >/dev/null 2>&1 || {
        echo "Failed to remove install script."
        return 1
    }

    echo "Cleanup completed."
    return 0
}

function main {
    local user_name
    local user_uid
    local user_gid

    user_name="${USER_NAME:-"devcontainer"}"
    user_uid="${USER_UID:-"1000"}"
    user_gid="${USER_GID:-"${user_uid}"}"

    trap post_install EXIT
    echo "Starting setup."

    print_banner || return 1

    pre_setup_checks || return 1
    install_profiles || return 1
    install_code || return 1
    create_user "${user_name}" "${user_uid}" "${user_gid}" || return 1

    echo "Setup completed."
    return 0
}

main "$*" || echo "Setup failed."
