
# Pulumi (pulumi)

A feature to install Pulumi CLI in a dev container.

## Example Usage

```json
"features": {
    "ghcr.io/froazin/devcontainer-features/pulumi:0": {}
}
```

## Options

| Options Id | Description | Type | Default Value |
|-----|-----|-----|-----|
| version | The version of Pulumi to install. Use 'latest' for the latest version. | string | latest |

## Customizations

### VS Code Extensions

- `pulumi.pulumi-vscode-tools`
- `pulumi.pulumi-vscode-copilot`
- `pulumi.pulumi-lsp-client`

## OS Support

This feature is designed to be distribution agnostic and should work on recent versions of Debian/Ubuntu, RedHat Enterprise Linux, Fedora, Alma, and RockyLinux distributions so long as `curl` and `tar` are available.

`bash` is required to execute the `install.sh` script.


---

_Note: This file was auto-generated from the [devcontainer-feature.json](https://github.com/froazin/devcontainers/blob/main/features/src/pulumi/devcontainer-feature.json).  Add additional notes to a `NOTES.md`._
