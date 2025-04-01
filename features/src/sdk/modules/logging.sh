#! /usr/bin/env bash

_LOG_LEVEL=info

function _parse_level {
    local level
    level=$(echo "$1" | tr '[:upper:]' '[:lower:]')

    case "$level" in
    "trace")
        echo "0"
        ;;
    "debug")
        echo "1"
        ;;
    "info")
        echo "2"
        ;;
    "warning")
        echo "3"
        ;;
    "error")
        echo "4"
        ;;
    "fatal")
        echo "5"
        ;;
    *)
        echo "9"
        ;;
    esac
}

function _get_level_string {
    local level
    level=$1

    case "$level" in
    "0")
        echo "TRACE"
        ;;
    "1")
        echo "DEBUG"
        ;;
    "2")
        echo "INFO"
        ;;
    "3")
        echo "WARN"
        ;;
    "4")
        echo "ERROR"
        ;;
    "5")
        echo "FATAL"
        ;;
    *)
        echo "INVALID"
        ;;
    esac
}

function _log_to_console {
    local level
    local msg
    local timestamp
    local color

    if ! [ -t 1 ]; then
        # stdout is not a tty
        return 0
    fi

    color=''
    level=$1
    msg=$2
    timestamp=$3

    case "$level" in
    "0")
        color='\033[1;30m' # Grey
        ;;
    "1")
        color='\033[1;33m' # Yellow
        ;;
    "2")
        color='\033[1;36m' # Cyan
        ;;
    "3")
        color='\033[1;33m' # Yellow
        ;;
    "4")
        color='\033[1;31m' # Red
        ;;
    "5")
        color='\033[1;91m' # Red
        ;;
    *)
        return 1
        ;;
    esac

    local green='\033[0;32m' # Green
    local nc='\033[0m'       # Text Reset

    # shellcheck disable=SC1087
    echo -e "$green$timestamp \033[$color[$(_get_level_string "$level")]$nc $msg" 1>&2
    return 0
}

function log {
    local timestamp
    local level
    local msg
    local log_file
    local log_file_name
    local log_feature_name
    local min_level

    timestamp=$(date --iso-8601=seconds)
    level="$(_parse_level "$1")"
    min_level="$(_parse_level "$_LOG_LEVEL")"

    shift 1
    msg="$*"

    if ! [[ $level =~ ^[0-9]+$ ]]; then
        return 1
    fi

    if [[ $level -lt $min_level ]]; then
        return 0
    fi

    _log_to_console "$level" "$msg" "$timestamp" 1>&2

    if [[ "$log_file_name" == "" ]]; then
        if [[ "$_FEATURE_NAME" == "" ]]; then
            log_file_name="default"
            log_feature_name="Unspecified"
        else
            log_file_name="${_FEATURE_NAME// /-}"
            log_feature_name="$_FEATURE_NAME"
        fi
    fi

    log_file="/usr/local/var/log/vscode-dev-containers/features/$log_file_name.log"

    if ! [ -d "$(dirname "$log_file")" ]; then
        if ! mkdir -p "$(dirname "$log_file")" >/dev/null 2>&1; then
            return 1
        fi
    fi

    if ! [ -f "$log_file" ]; then
        if ! touch "$log_file" >/dev/null 2>&1; then
            return 1
        fi

        chmod 644 "$log_file" >/dev/null 2>&1
    fi

    if [ -f "$log_file" ]; then
        tee -a "$log_file" <<<"{\"timestamp\":\"$timestamp\",\"level\":\"$(_get_level_string "$level" | tr '[:upper:]' '[:lower:]')\",\"feature\":\"$log_feature_name\",\"message\":\"$msg\"}" >/dev/null 2>&1
    fi

    if [[ "$level" -ge 5 ]]; then
        # Program should immediately exit if a fatal error occurs
        exit 1
    fi

    return 0
}
