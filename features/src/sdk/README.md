
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


# :warning: This package is deprecated.

## Usage

> :warning: The Script Development Kit is designed for use with bash and is not POSIX compliant. It is recommended to use the SDK in a bash shell.

Once installed in your devcontainer, the SDK can be sourced in your project using the following command:

```bash
source "/usr/local/lib/vscode-dev-containers/features/sdk/modules/<module name>.sh" 2> /dev/null || exit 1
```

For your convenience, `sdkmod` is installed along with the SDK. This helper script will print the contents of the SDK module to stdout, which can be used to source the module in your project:

```bash
eval "$(sdkmod <module name>)" 2> /dev/null || exit 1
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

##### *__get_distro_name__*

Returns the name of the current distribution. This is useful for checking if the current distribution is supported by the SDK.

> :warning: Currently, Red Hat Enterprise Linux, Fedora and CentOS will all return `redhat` as the distribution name. This may change in the future....

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod common)" || exit 1

distro_name="$(get_distro_name)" || {
    log error "Failed to get distribution name"
    exit 1
}

log info "Distribution name: $distro_name"

```

##### *__is_devcontainer__*

Returns true if the current shell session is running inside a devcontainer.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod common)" || exit 1

if is_devcontainer; then
    # the current shell session is running inside a devcontainer
    log info "Running inside a devcontainer."
else
    # the current shell session is not running inside a devcontainer
    log info "Not running inside a devcontainer."
fi

```

##### *__is_wsl__*

Returns true if the current shell session is running inside WSL.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod common)" || exit 1

if is_wsl; then
    # the current shell session is running inside WSL
    log info "Running inside WSL."
else
    # the current shell session is not running inside WSL
    log info "Not running inside WSL."
fi

```

##### *__is_root__*

Returns true if the current shell session is running as root.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod common)" || exit 1

if is_root; then
    # the current shell session is running as root
    log info "Running as root."
else
    # the current shell session is not running as root
    log info "Not running as root."
fi

```

#### Exported Variables

No variables are exported by this module.

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

#### Exported Variables

| Variable | value | description |
| -------- | ------- | ----------- |
| `_LOG_LEVEL` | info | The log level to be used for the current session. This can be set to any of valid log levels above. The default value is `info`. |

### github

Helpful functions for working with the GitHub API.

> :warning: Warning  
This module will automatically use the `GITHUB_TOKEN` environment variable when making requests if it exists. This will increase the rate limit for the requests and permit requests that would otherwise fail due requiring authentication. 

#### Import

```bash
eval "$(sdkmod github)"
```

#### Exported Functions

##### *__github_api_request__ <method: string> <uri: string> <data:? string>*

Performs a request to the GitHub API using the specified method (GET, POST, PUT, DELETE) and URI. The data parameter is optional and can be used to send data with the request. Any response is returned in JSON format.

The function will return a non-zero exit code if the request fails.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod github)" || exit 1

response="$(github_api_request "GET" "/repos/Microsoft/vscode/releases/latest")" || {
    log error "Failed to get latest release from GitHub"
    exit 1
}

log info "Latest release: $(echo "$response" | jq)"

```

##### *__get_github_release_with_tag__ <owner: string> <repo: string> <tag: string>*

Returns the JSON formatted response from the GitHub API for the specified release tag. This is useful for checking if a specific release tag exists in a repository.

The function will return a non-zero exit code if the release tag does not exist or if there is an error with the API request.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod github)" || exit 1

release="$(get_github_release_with_tag "Microsoft" "vscode" "v1.0.0")" || {
    log error "Failed to get release from GitHub"
    exit 1
}

log info "Release: $(echo "$release" | jq)"

```

##### *__get_github_latest_release__ <owner: string> <repo: string>*

Returns the JSON formatted response from the GitHub API for the latest release.

The function will return a non-zero exit code if there is an error with the API request.

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

##### *__get_github_refs__ <owner: string> <repo: string> <ref:? string>*

Returns the JSON formatted response from the GitHub API for the specified repository and ref. An optional ref or partial ref can be provided to filter the results. If no ref is provided, all refs will be returned.

The function will return a non-zero exit code if the ref does not exist or if there is an error with the API request.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod github)" || exit 1

refs="$(get_github_refs "Microsoft" "vscode")" || {
    log error "Failed to get refs from GitHub"
    exit 1
}

log info "Refs: $(echo "$refs" | jq)"

```

##### *__get_github_ref__ <owner: string> <repo: string> <ref: string>*

Returns the JSON formatted response from the GitHub API for the specified repository and ref.

The function will return a non-zero exit code if the ref does not exist or if there is an error with the API request.

_Example_

```bash
#!/usr/bin/env bash

eval "$(sdkmod logging)" || exit 1
eval "$(sdkmod github)" || exit 1

ref="$(get_github_ref "Microsoft" "vscode" "tags/v1.0.0")" || {
    log error "Failed to get ref from GitHub"
    exit 1
}

log info "Commit SHA: $(echo "$ref" | jq)"

```

#### Exported Variables

No variables are exported by this module.


---

_Note: This file was auto-generated from the [devcontainer-feature.json](https://github.com/froazin/devcontainers/blob/main/features/src/sdk/devcontainer-feature.json).  Add additional notes to a `NOTES.md`._
