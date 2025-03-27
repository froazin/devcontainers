#!/usr/bin/env bash

# If the GitHub CLI is used locally, it creates problems when the global git
# config is copied into the dev container. This ensures that the gh cli
# git credential helper is not used.
if command -v git >/dev/null 2>&1; then
    if [ -n "$(git config --global credential.https://github.com.helper)" ]; then
        git config --global --unset-all credential.https://github.com.helper
    fi

    if [ -n "$(git config --global credential.https://gist.github.com.helper)" ]; then
        git config --global --unset-all credential.https://gist.github.com.helper
    fi

  # the SSH agent will be forwarded to the container from the host, if this config
  # is copied to the container, it will cause the forwarded agent to be ignored
  # more often than not resulting in an error
    if [ -n "$(git config --global gpg.ssh.program)" ]; then
        git config --global --unset-all gpg.ssh.program
    fi
fi
