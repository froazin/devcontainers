#!/bin/sh

if [ -t 1 ] &&
    { [ "${TERM_PROGRAM}" = "vscode" ] || [ "${TERM_PROGRAM}" = "codespaces" ]; } &&
    [ ! -f "$HOME/.config/vscode-dev-containers/.fis-banner-already-shown" ]; then
    echo "     .-----."
    echo "     |F.-. |"
    echo "     | :i: |"
    echo "     | '-'S|"
    echo "     \`-----'"
    lsb_release -d | cut -f2
    echo ""

    mkdir -p "$HOME/.config/vscode-dev-containers"

    (
        (
            sleep 10s
            touch "$HOME/.config/vscode-dev-containers/.fis-banner-already-shown"
        ) &
    )
fi
