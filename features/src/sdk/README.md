
# Script Development Kit (sdk)

A collection of useful bash functions for writting devcontainer features.

## Example Usage

```json
"features": {
    "ghcr.io/froazin/devcontainer-features/sdk:0": {}
}
```

## Options

| Options Id | Description | Type | Default Value |
|-----|-----|-----|-----|


## Usage

Once installed in your devcontainer, the SDK can be sourced in your project using the following command:

```bash
source "/usr/local/lib/vscode-dev-containers/features/sdk/modules/<package name>.sh" 2> /dev/null || exit 1
```

For your convenience, `sdkmod` is installed along with the SDK. This helper script will return the fully qualified path to the module you are trying to source:

```bash
source "$(sdkmod <package name>)" 2> /dev/null || exit 1
```

You can also use the `sdkmod` command to list all available modules:

```bash
$ sdkmod --list
```

## Modules

### logging

Facilitates logging to console and file. Logs are stored in `/usr/local/var/log/vscode-dev-containers/features/<feature name>.log`.

#### Import

```bash
source "$(sdkmod logging)" || exit 1
```

#### Exported Functions

##### *__log__ <level: enum> <message: string>*

Logs a message to the console and to a log file stored in `/usr/local/var/log/vscode-dev-containers/features/<feature name>.log`. To set the feature name, set the `_FEATURE_NAME` variable before sourcing the logging script. If the feature name is not set, the log file will be stored in `/usr/local/var/log/vscode-dev-containers/features/default.log`.

Valid log levels are: `trace`, `debug`, `info`, `warning`, `error`, `fatal`. Logs with a level of `fatal` will exit the script with a status code of 1.

#### Exported Variables

| Variable | value | description |
| -------- | ------- | ----------- |
| `_LOG_LEVEL` | info | The log level to be used for the current session. This can be set to any of valid log levels above. The default value is `info`. |

_Example_

```bash
#!/usr/bin/env bash

source "$(sdkmod logging)" || exit 1

# Set the feature name
_FEATURE_NAME="my-feature"

# Set the log level
_LOG_LEVEL="debug"

log debug "This is an debug log message"

```

### common

Common helper functions for the SDK.

#### Import

```bash
source "$(sdkmod common)" || exit 1
```

#### Exported Functions

##### *__check_commands__ <package_names: list>*

Checks if the provided packages are installed and available in the current shell session. Returns a non-zero exit code if any of the packages are not installed or not available.

##### *__get_distro_name__*
Returns the name of the current distribution. This is useful for checking if the current distribution is supported by the SDK.

> :warning: Currently, Red Hat Enterprise Linux, Fedora and CentOS will all return `redhat` as the distribution name. This may change in the future....

#### Exported Variables

No variables are exported by this script.

_Example_

```bash
#!/usr/bin/env bash

source "$(sdkmod common)" || exit 1
source "$(sdkmod logging)" || exit 1

required_commands=(
    "git"
    "curl"
    "python3"
)

if check_commands "${required_commands[@]}"; then
    # the packages are installed and available in the current shell session
    log info "Required packages are present."
else
    # the packages are not installed or not available in the current shell session
    log fatal "Required packages are not present."
fi

```

---

_Note: This file was auto-generated from the [devcontainer-feature.json](https://github.com/froazin/devcontainers/blob/main/features/src/sdk/devcontainer-feature.json).  Add additional notes to a `NOTES.md`._
