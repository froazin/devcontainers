#!/usr/bin/env sh
#
# uv run would create a missing .venv without system site packages, so check
# for it first. Without uv or a .venv, exit 0 so the hook doesn't block Claude.

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

# --quiet keeps uv's warnings out of the stderr Claude sees. -I keeps PYTHONPATH,
# user site-packages and the script's folder from changing what Python imports.
exec uv run --directory "$root" --quiet python -I utilities/hooks/validate_image_manifests.py
