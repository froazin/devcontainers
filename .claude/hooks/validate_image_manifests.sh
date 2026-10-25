#!/usr/bin/env sh
#
# Claude Code PostToolUse hook for the image manifests. It runs
# devel/hooks/validate_image_manifests.py through uv run from the repository
# root. See docs/claude-code-hooks.md.
#
# uv run would create a missing .venv without system site packages, so check
# for it first. Without uv or a .venv, do nothing: exit 0 doesn't block Claude.

root="$(cd "$(dirname "$0")/../.." && pwd)"
problem=""

if ! command -v uv > /dev/null 2>&1; then
    problem="uv isn't on PATH."
elif [ ! -d "$root/.venv" ]; then
    problem="there's no .venv. Set it up as README.md describes."
fi

if [ -n "$problem" ]; then
    echo "Can't run the image manifest checks: $problem" >&2
    exit 0
fi

exec uv run --directory "$root" --quiet python -I devel/hooks/validate_image_manifests.py
