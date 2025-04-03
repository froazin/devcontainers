#!/bin/sh

# Source all scripts in ~/.local/profile.d
if [ -d "$HOME/.local/profile.d" ]; then
    for script in "$HOME/.local/profile.d"/*.sh; do
        # shellcheck disable=SC1090 # Don't check if the file exists
        [ -r "$script" ] && . "$script"
    done
fi
