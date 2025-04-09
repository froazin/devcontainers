#! /usr/bin/env bash

# Check if the $HOME/.local/bin directory exists and add it to the PATH
if [ -d "$HOME/.local/bin" ]; then
    mkdir -p "$HOME/.local/bin"
fi

if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
    PATH="$HOME/.local/bin:$PATH"
    export PATH
fi
