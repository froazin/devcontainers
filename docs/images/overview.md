# Container images

The high-level design of the image pipeline, and the rules for adding or changing an image that the code can't show. It's for engineers who work on an image or on `utilities.images`.

## Contents

1. [Overview](#overview)
1. [Add an image](#add-an-image)
1. [Limits](#limits)

## Overview

Each image is a folder in `images/src/<image>/`, whose name is the image's name, with a test project in `images/test/<image>/`. [tasks.py](../../tasks.py) runs `utilities.images`, which checks every manifest, then builds, labels, tags and tests each image:

```mermaid
flowchart LR
    accTitle: The image pipeline
    accDescr: image_dirs finds each image folder with a manifest.json and a template.json, and passes the folders to build_images. build_images runs check_manifests on every image first, then build_image for each folder. render_devcontainer renders template.json with the fields of manifest.json and writes .devcontainer.json. devcontainer_build builds the image from it and the Containerfile, under the name image_name gives it. check_labels compares the built image's labels with the manifest's, and tag_image then tags it. run_image_test runs test.sh from images/test in a podman container of that image, and run_image_tests collects the results.
    discovery["image_dirs"] -->|image folders| build["build_images"]
    build -->|every image, first| check["check_manifests"]
    build -->|build_image, for each folder| render["render_devcontainer"]
    manifest["manifest.json"] -->|fields| render
    template["template.json"] -->|Jinja2 template| render
    render -->|writes| devcontainer[".devcontainer.json"]
    devcontainer -->|config| cli["devcontainer_build"]
    containerfile["Containerfile"] -->|build file| cli
    cli -->|image named by image_name| labels["check_labels"]
    manifest -->|expected labels| labels
    labels -->|labels match| tag["tag_image"]
    tag -->|image found by image_name| test["run_image_test"]
    testsh["test.sh in images/test"] -->|mounted read-only| test
    test -->|passed or failed| tests["run_image_tests"]
```

The stages have their own docs: [Image manifests](manifests.md), [Image builds](builds.md) and [Image tests](tests.md).

## Add an image

Copy `images/src/base` and `images/test/base`. Then keep to these rules, which nothing enforces:

- **Layer order:** put the steps that add content between `FROM` and the label `ARG`s. A step after them reruns on every version bump, because a `RUN` step's cache key includes the build arguments (see [Image builds](builds.md#design)).
- **Build arguments:** don't reuse a label argument's name in `build_args`. The template adds the label arguments last, so the manifest's value is silently dropped.
- **Template:** write every string value through `tojson`, or a value holding `"` or `\` breaks the JSON.
- **Tags:** no image's name or tags may repeat another's, including the `-dev` and version suffixes the build adds. A copy of `base` keeps `"tags": ["base"]`.
- **Version:** `version` is the image's semantic version. Bump it in the same change as anything that changes what the image contains or how it's labelled: its `Containerfile`, a `template.json` change that changes the built image or the manifest's `name`, `description` or `build_args`. A change to only the README, tests, tooling or docs bumps nothing. Which part to bump depends on the image's stage:
  - **Alpha, `0.0.x`:** every change bumps the patch version, even a breaking change or a new feature.
  - **Beta, `0.x` from `0.1.0`:** a breaking change or a new feature bumps the minor version, and anything else the patch version.
  - **Stable, from `1.0.0`:** a breaking change bumps the major version, a new feature the minor version and anything else the patch version.

  What a commit changes decides the bump, not its type: a `feat` commit that only edits the README bumps nothing. A `!` before the colon in a commit header marks a breaking change, and a change that clearly breaks the image's users is breaking without one. Only commits that touch the image's own folder count.

  Bump once per branch. The pull request is squash-merged into one commit, so the most significant change on the branch sets the bump: `1.2.3` with two new features gives `1.3.0`, not `1.4.0`. A new image starts at `0.0.1`, however many commits add it. A changed version must be newer than every release tag of the image, `<image>-vX.Y.Z`, which are planned. The maintainer moves an image to beta or stable by hand, with a jump to exactly `0.1.0` or `1.0.0`. CI's [Version review](../ci.md#version-review) checks these rules, and its prompt copies them, so change both together.

## Limits

- **No image can build `FROM` another of this repository's images yet.** Nothing is published, a template can't tell a dev build from a release, images build in name order rather than dependency order and each CI job builds one image in an empty podman store.
- Dev Container features are planned. The `features` suite raises `NotImplementedError` until they exist.
