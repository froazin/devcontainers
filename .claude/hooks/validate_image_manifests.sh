#!/usr/bin/env sh
#
# Claude Code PostToolUse hook for the image manifests. settings.json calls
# this wrapper, which runs devel/hooks/validate_image_manifests.py through
# uv run from the repository root, the same way a person runs the project's
# commands. The checks need jsonschema and jinja2 from the dev dependency
# group. The script lives in devel/hooks because Pyright doesn't check files
# in dot-directories. -I keeps PYTHONPATH, user site-packages and the script's
# directory off the import path.
#
# uv run would create a missing .venv without system site packages, so the
# wrapper checks for it first. Without uv or a .venv, a hook call does nothing
# (exit 0 is non-blocking), and a run by hand with --all fails.

root="$(cd "$(dirname "$0")/../.." && pwd)"
problem=""

if ! command -v uv > /dev/null 2>&1; then
    problem="uv isn't on PATH."
elif [ ! -d "$root/.venv" ]; then
    problem="there's no .venv. Set it up as CONTRIBUTING.md describes."
fi

if [ -n "$problem" ]; then
    echo "Can't run the image manifest checks: $problem" >&2
    [ "$1" = "--all" ] && exit 1
    exit 0
fi

exec uv run --directory "$root" --quiet python -I devel/hooks/validate_image_manifests.py "$@"
