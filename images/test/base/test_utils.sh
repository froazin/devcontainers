#!/usr/bin/env sh
# Helpers for image tests. Source this from test.sh, call the check functions,
# then finish with report_results. Everything prints to stdout, so the output
# stays in order when podman streams it.

FAILED=""

fail() {
    printf '❌  %s check failed.\n' "$1"
    FAILED="${FAILED}  - $1
"
    return 1
}

passed() {
    echo "✅  Passed!"
}

# check LABEL COMMAND [ARGS...]
# Passes when COMMAND exits with status 0. COMMAND runs in a subshell, so it
# can call exit or set variables without affecting the rest of the tests.
check() {
    label="$1"
    shift
    printf '\n🧪 Testing %s\n' "$label"
    if [ $# -eq 0 ]; then
        echo "No command given."
        fail "$label"
        return
    fi
    if ("$@"); then
        passed
        return 0
    fi
    fail "$label"
}

# check_version_ge LABEL CURRENT_VERSION REQUIRED_VERSION
# Passes when CURRENT_VERSION sorts at or above REQUIRED_VERSION. Anything
# before the first digit, such as "v" or "git version ", is ignored. Versions
# compare as sort -V orders them, so 2.0.0-rc1 counts as at or above 2.0.0.
check_version_ge() {
    label="$1"
    current="$(printf '%s' "$2" | sed 's/^[^0-9]*//')"
    required="$(printf '%s' "$3" | sed 's/^[^0-9]*//')"
    printf "\n🧪 Testing %s: '%s' is >= '%s'\n" "$label" "$2" "$3"
    if [ -z "$current" ]; then
        printf "No version found in '%s'.\n" "$2"
        fail "$label"
        return
    fi
    if [ -z "$required" ]; then
        printf "No required version found in '%s'.\n" "$3"
        fail "$label"
        return
    fi
    greater="$(printf '%s\n%s\n' "$current" "$required" | sort -V | tail -n 1)"
    if [ "$current" = "$greater" ]; then
        passed
        return 0
    fi
    fail "$label"
}

# check_multiple LABEL MINIMUM_PASSED EXPRESSION...
# Passes when at least MINIMUM_PASSED of the EXPRESSION strings exit with
# status 0. Each EXPRESSION is evaluated in a subshell, so it can use the test
# script's functions and variables.
check_multiple() {
    label="$1"
    minimum="$2"
    shift 2
    printf '\n🧪 Testing %s\n' "$label"
    if [ $# -eq 0 ]; then
        echo "No expressions given."
        fail "$label"
        return
    fi
    count=0
    for expression in "$@"; do
        if (eval "$expression"); then
            count=$((count + 1))
        fi
    done
    if [ "$count" -ge "$minimum" ]; then
        passed
        return 0
    fi
    fail "$label"
}

# check_os_packages LABEL PACKAGE...
# Passes when every PACKAGE is installed. Removed packages whose config files
# are still present don't count.
check_os_packages() {
    label="$1"
    shift
    printf '\n🧪 Testing %s\n' "$label"
    if [ $# -eq 0 ]; then
        echo "No packages given."
        fail "$label"
        return
    fi
    missing=""
    for package in "$@"; do
        status="$(dpkg-query --show -f='${db:Status-Abbrev}' "$package" 2> /dev/null)"
        if [ "$status" = "ii " ]; then
            dpkg-query --show -f='${Package}: ${Version}\n' "$package"
        else
            printf '%s: not installed\n' "$package"
            missing="$missing $package"
        fi
    done
    if [ -z "$missing" ]; then
        passed
        return 0
    fi
    fail "$label"
}

# check_os_release KEY VALUE
# Passes when KEY in /etc/os-release is VALUE.
check_os_release() {
    value="$(. /etc/os-release && eval "printf '%s' \"\${$1}\"")"
    check "os-release $1 is $2" test "$value" = "$2"
}

# report_results
# Prints the failed checks and exits with status 1 if there are any, or 0 if not.
report_results() {
    if [ -n "$FAILED" ]; then
        echo
        echo "💥  Failed checks:"
        printf '%s' "$FAILED"
        exit 1
    fi
    echo
    echo "💯  All passed!"
    exit 0
}
