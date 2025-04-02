## Usage

> :warning: The Script Development Kit is designed for use with bash and is not POSIX compliant. It is recommended to use the SDK in a bash shell.

Once installed in your devcontainer, the SDK can be sourced in your project using the following command:

```bash
source "/usr/local/lib/vscode-dev-containers/features/sdk/modules/<package name>.sh" 2> /dev/null || exit 1
```

For your convenience, `sdkmod` is installed along with the SDK. This helper script will print the contents of the SDK module to stdout, which can be used to source the module in your project:

```bash
eval "$(sdkmod <package name>)" 2> /dev/null || exit 1
```

You can also use the `sdkmod` command to list all available modules:

```bash
$ sdkmod --list
```

## Modules

### common

Common helper functions for the SDK.

#### Import

```bash
eval "$(sdkmod common)"
```

#### Exported Functions

##### *__check_commands__ <package_names: list>*

Checks if the provided packages are installed and available in the current shell session. Returns a non-zero exit code if any of the packages are not installed or not available.

##### *__get_distro_name__*
Returns the name of the current distribution. This is useful for checking if the current distribution is supported by the SDK.

> :warning: Currently, Red Hat Enterprise Linux, Fedora and CentOS will all return `redhat` as the distribution name. This may change in the future....

#### Exported Variables

No variables are exported by this module.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod common)" || exit 1

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

### logging

Facilitates logging to console and file. Logs are stored in `/usr/local/var/log/vscode-dev-containers/features/<feature name>.log`.

#### Import

```bash
eval "$(sdkmod logging)"
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

eval "$(sdkmod logging)" || exit 1

# Set the feature name
_FEATURE_NAME="my-feature"

# Set the log level
_LOG_LEVEL="debug"

log debug "This is an debug log message"

```

### github

Functions for working with github.

#### Import

```bash
eval "$(sdkmod github)"
```

#### Exported Functions

##### *__get_github_release_with_tag__ <owner: string> <repo: string> <tag: string>*

Returns the JSON formatted response from the GitHub API for the specified release tag. This is useful for checking if a specific release tag exists in a repository.

The function will return a non-zero exit code if the release tag does not exist or if there is an error with the API request.

##### *__get_github_latest_release__ <owner: string> <repo: string>*

Returns the JSON formatted response from the GitHub API for the latest release.

The function will return a non-zero exit code if there is an error with the API request.

#### Exported Variables

No variables are exported by this module.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod github)" || exit 1

release="$(get_github_latest_release "Microsoft" "vscode" | jq -r '.tag_name')" || {
    log error "Failed to get latest release from GitHub"
    exit 1
}

log info "Latest release: $release"

```
