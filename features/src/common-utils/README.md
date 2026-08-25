
# Common Utilities (common-utils)

Installs a set of common command line utilities and sets up a non-root user.

## Example Usage

```json
"features": {
    "ghcr.io/froazin/devcontainer-features/common-utils:0": {}
}
```

## Options

| Options Id | Description | Type | Default Value |
|-----|-----|-----|-----|
| upgradePackages | Upgrade OS packages? | boolean | true |
| username | Enter name of a non-root user to configure or none to skip | string | automatic |
| userUid | Enter UID for non-root user | string | automatic |
| userGid | Enter GID for non-root user | string | automatic |
| githubToken | CI only. This is used to authenticate with GitHub to bypass the API rate limit when checking for and downloading packages. If you are not running in CI, you can safely ignore this option. | string | - |



---

_Note: This file was auto-generated from the [devcontainer-feature.json](https://github.com/froazin/devcontainers/blob/main/features/src/common-utils/devcontainer-feature.json).  Add additional notes to a `NOTES.md`._
