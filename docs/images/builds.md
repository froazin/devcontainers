# Image builds

The high-level design of how an image is built, named, labelled and tagged, and why. It's for engineers who change [build.ts](../../tasks/images/build.ts), an image's `Containerfile` or the shared image template.

## Contents

1. [Overview](#overview)
1. [Names and tags](#names-and-tags)
1. [Design](#design)
1. [Limits](#limits)

## Overview

The build renders the shared image template into each image's `.devcontainer.json`, builds it with the Dev Containers command-line interface (CLI), then checks and tags the result through the Docker Engine API:

```mermaid
flowchart LR
    accTitle: How an image is built and tagged
    accDescr: The build renders the image's manifest.json and the shared images/src/template.hbs into the image's .devcontainer.json. The Dev Containers CLI builds the image from it and the Containerfile, by running docker. The image lands in Docker's image store. The build then reads the image through the Docker API, checks its labels against the manifest and adds its tags.
    manifest[manifest.json] -->|fields| render[Render the template]
    template[images/src/template.hbs] -->|Handlebars template, shared| render
    render -->|.devcontainer.json| cli[Dev Containers CLI]
    containerfile[Containerfile] -->|build file| cli
    cli -->|docker| store[(Docker image store)]
    store -->|Docker API| check[Check the labels]
    check -->|labels match| tag[Add the tags]
    tag -->|tags| store
```

## Names and tags

Every image goes in one repository, `ghcr.io/froazin/devcontainers`, named after its folder. A release of `base` at `0.1.0` is `base` and is tagged `base`, `base-v0`, `base-v0.1` and `base-v0.1.0`. A dev build, which is any build without `--is-release`, adds `-dev` to the name and every tag. The version label is `v0.1.0` or `v0.1.0-dev`.

## Design

- **The CLI runs as a child process.** `@devcontainers/cli` has no programmatic interface: it's one bundled script that parses `process.argv` as soon as it loads. The build runs that script with the same Node.js as the task, without a shell, so an argument such as a `--filter` value never reaches one.
- **The CLI and the API must reach the same Docker.** The CLI builds with `docker`, and the build then reads the image through the Docker Engine API, at `DOCKER_HOST` or the default socket. A `docker` context that points at another engine would build into a store the build can't see (inferred).
- **`RUN true` before `LABEL` keeps the labels fresh.** podman's cache key for an `ARG` or `LABEL` step ignored the argument values, so a release built after a dev build kept the dev version label. A `RUN` step's key includes them (observed with podman 5.7.0). With Docker 29.10, a release built straight after a dev build gets the release label (observed). The step stays, because removing it changes the image. It's also why content steps go before the label `ARG`s.
- **Labels come from build arguments,** so the `Containerfile` doesn't repeat the manifest's values. The CLI also writes the template's runtime settings, such as `init` and later `remoteUser`, into a `devcontainer.metadata` label (observed). Nothing checks that label.
- **Tagging happens after the label check,** through the API rather than the CLI's `--image-name`, so an image with the wrong labels gets none of the version tags.
- **Dev builds carry the version, not the commit,** so a dev build can never take a release's tag, and `test --skip-build` finds the latest dev build by name. CI reviews the version before it builds, so a dev build in CI has the version it's heading for.

## Limits

- Nothing is pushed or published, and the CLI builds for the host's platform only.
- A plain build reuses the base image already in Docker's store. `--no-cache` pulls it again.
- Tags are only added, so an old build keeps any tag a newer one doesn't take. A dev build doesn't record its commit.
