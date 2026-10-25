#!/usr/bin/env sh
#
# Claude Code PostToolUse hook for the image manifests. settings.json calls
# this wrapper, which runs devel/hooks/validate_image_manifests.py with the
# project's virtual environment, because the checks need jsonschema and
# jinja2. The script lives in devel/hooks because Pyright doesn't check files
# in dot-directories. -I keeps PYTHONPATH, user site-packages and the script's
# directory off the import path.
#
# Without the environment, a hook call does nothing (exit 0 is non-blocking),
# and a run by hand with --all fails.

root="$(dirname "$0")/../.."
python="$root/.venv/bin/python"

if [ ! -x "$python" ]; then
    echo "Can't run the image manifest checks: there's no .venv. Run uv sync." >&2
    [ "$1" = "--all" ] && exit 1
    exit 0
fi

exec "$python" -I "$root/devel/hooks/validate_image_manifests.py" "$@"
