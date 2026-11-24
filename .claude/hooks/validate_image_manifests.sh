#!/usr/bin/env sh
#
# Without node or node_modules, exit 0 so the hook doesn't block Claude.

root="$(cd "$(dirname "$0")/../.." && pwd)"
problem=""

if ! command -v node > /dev/null 2>&1; then
    problem="node isn't on PATH."
elif [ ! -d "$root/node_modules" ]; then
    problem="there's no node_modules. Run npm install as README.md describes."
fi

if [ -n "$problem" ]; then
    echo "Can't run the image manifest checks: $problem" >&2
    exit 0
fi

# NODE_OPTIONS can preload code or change how Node loads modules, so don't let it
# change what the hook runs.
unset NODE_OPTIONS
exec node "$root/.claude/hooks/validate_image_manifests.ts"
