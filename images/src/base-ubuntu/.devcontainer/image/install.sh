#!/usr/bin/env bash

set -e

source "$(dirname "$0")/internal/logging.sh" 2>/dev/null || exit 1
source "$(dirname "$0")/internal/common.sh" 2>/dev/null || exit 1

MARKER_FILE="/usr/local/etc/vscode-dev-containers/fis-ubuntu.marker"

function print_banner {
    # This is literally just a bit of fun and is probably cause a
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

    check_commands "${required_packages[@]}" || {
        log error "Missing required packages."
        return 1
    }

    return 0
}

function install_profiles {
    local profile_name

    log info "Installing profiles."

    if ! [ -d "/usr/local/etc/profile.d" ]; then
        log info "Creating directory for profiles."

        mkdir --parents "/usr/local/etc/profile.d" >/dev/null 2>&1 || {
            log error "Failed to create directory for profiles."
            return 1
        }
    fi

    for profile in "$(dirname "$0")/profiles"/*; do
        log info "Creating profile: $(basename "$profile")"
        profile_name="fis-$(basename "$profile")"

        cp "$profile" "/usr/local/etc/profile.d/${profile_name}" >/dev/null 2>&1 || {
            log error "Failed to copy profile: $(basename "${profile}")"
            return 1
        }

        chmod 644 "/usr/local/etc/profile.d/${profile_name}" >/dev/null 2>&1 || {
            log error "Failed to set permissions for profile: $(basename "$profile")"
            return 1
        }

        ln --symbolic "/usr/local/etc/profile.d/${profile_name}" "/etc/profile.d/${profile_name}" >/dev/null 2>&1 || {
            log error "Failed to create symbolic link for profile: ${profile_name}"
            return 1
        }
    done

    log info "Installed profiles."
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
        log info "Group with id $user_gid already exists. Renaming to $username."

        groupmod --new-name "${username}" "$(id --name --group "$user_gid")" >/dev/null 2>&1 || {
            log error "Failed to rename group with id $user_gid."
            return 1
        }
    else
        log info "Creating group with id $user_gid."

        groupadd --gid "$user_gid" "${username}" >/dev/null 2>&1 || {
            log error "Group creation failed."
            return 1
        }
    fi

    if id -u "$user_uid" >/dev/null 2>&1; then
        log info "User with id $user_uid already exists. Renaming to $username."
        old_username="$(id --name --user "$user_uid")"

        usermod --login "${username}" "$(id --name --user "$user_uid")" >/dev/null 2>&1 || {
            log error "Failed to rename user."
            return 1
        }
    else
        log info "Creating user."

        useradd --create-home --uid "$user_uid" --gid "$user_gid" --shell /bin/bash "${username}" >/dev/null 2>&1 || {
            log error "Failed to create user."
            return 1
        }
    fi

    usermod --home "/home/${username}" "${username}" >/dev/null 2>&1 || {
        log error "Failed to set home directory."
        return 1
    }

    if [ -n "${old_username}" ] && [ -d "/home/${old_username}" ]; then
        log info "Renaming home directory."

        mv "/home/${old_username}" "/home/${username}" >/dev/null 2>&1 || {
            log error "Failed to rename old home directory to new home directory."
            return 1
        }
    else
        log info "Creating home directory."

        mkdir --parents "/home/${username}" >/dev/null 2>&1 || {
            log error "Failed to create home directory."
            return 1
        }
    fi

    chown --recursive "${username}:${username}" "/home/${username}" >/dev/null 2>&1 || {
        log error "Failed to set ownership of home directory."
        return 1
    }

    if ! [ -f "/home/$username/.sudo_as_admin_successful" ]; then
        log info "Supressing first time sudo message"

        touch "/home/$username/.sudo_as_admin_successful" || {
            log warning "Failed to supress first time sudo message."
        }
    fi
}

function install_bashrc {
    local bashrc_file

    bashrc_file="$(dirname "$0")/rcs/bash.bashrc"

    if [ -f "$bashrc_file" ]; then
        log info "Installing bashrc file."

        cp --force "$bashrc_file" "/etc/bash.bashrc" >/dev/null 2>&1 || {
            log error "Failed to copy bashrc file."
            return 1
        }

        chmod 644 "/etc/bash.bashrc" >/dev/null 2>&1 || {
            log error "Failed to set permissions for bashrc file."
            return 1
        }

        chown root:root "/etc/bash.bashrc" >/dev/null 2>&1 || {
            log error "Failed to set ownership for bashrc file."
            return 1
        }
    else
        log error "Bashrc file not found."
        return 1
    fi

    log info "Bashrc file installed."
    return 0
}

function cleanup {
    local tmp_dir
    local first_run_file

    tmp_dir='/tmp/devcontainer'
    first_run_file='/usr/local/etc/vscode-dev-containers/first-run-notice.txt'

    log info "Creating marker file."
    if ! [ -d "$(dirname "$MARKER_FILE")" ]; then
        mkdir --parents "$(dirname "$MARKER_FILE")" >/dev/null 2>&1 || {
            log error "Failed to create directory for marker file."
            return 1
        }
    fi

    touch "$MARKER_FILE" >/dev/null 2>&1 || {
        log error "Failed to create marker file."
        return 1
    }

    log info "Supressing default first run notice."
    if ! [ -d "$(dirname "$first_run_file")" ]; then
        mkdir --parents "$(dirname "$first_run_file")" >/dev/null 2>&1 || {
            log error "Failed to create directory for first run file."
            return 1
        }
    fi

    touch "$first_run_file" >/dev/null 2>&1 || {
        log error "Failed to create first run file."
        return 1
    }

    log info "Cleaning up temporary files."
    if [ -d "${tmp_dir}" ]; then
        rm --recursive --force "${tmp_dir}" >/dev/null 2>&1 || {
            log warning "Failed to remove temporary files."
        }
    fi

    log info "Cleanup completed."
    return 0
}

function main {
    local user_name
    local user_uid
    local user_gid

    user_name="${USER_NAME:-"devcontainer"}"
    user_uid="${USER_UID:-"1000"}"
    user_gid="${USER_GID:-"${user_uid}"}"

    trap cleanup EXIT
    log info "Starting setup."

    print_banner || return 1

    pre_setup_checks || return 1
    install_profiles || return 1
    install_bashrc || return 1
    create_user "${user_name}" "${user_uid}" "${user_gid}" || return 1

    log info "Setup completed."
    return 0
}

main "$*" || log fatal "Setup failed."
