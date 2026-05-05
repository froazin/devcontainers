# Dev Containers

Features and templates in this repository are written and tested against Ubuntu operating systems. No guarantees are made about their functionality on other operating systems.

## Features

This repository contains a set of [features](#features) that can be used to augment the functionality of dev containers, such as install Docker, Pulumi or specific versions of Python.

### Example Usage

> _.devcontainer/devcontainer.json_

```json
{
  "name": "Ubuntu 24.04lts with Common Utils",
  "image": "docker.io/mcr.microsoft.com/devcontainers/base:ubuntu-24.04",
  "features": {
    "ghcr.io/froazin/devcontainer-features/common-utils": {
      "username": "devcontainer",
      "userUid": 1000,
      "userGid": 1000,
      "updatePackages": true
    },
  },
  "remoteUser": "devcontainer"
}
```

| Feature | Description |
|---|---|
| [ghcr.io/froazin/devcontainer-features/common-utils](features/src/common-utils/README.md) | Provides quality-of-life tools for development environments, including user setup, common packages and updates. |
