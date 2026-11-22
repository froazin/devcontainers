---
name: image-manifest-schema
description: "Create or update the JSON schema for image manifests, schemas/image-manifest.schema.json. Use when a task adds, renames, removes or changes a field in an images/src/<image>/manifest.json, changes a field's type, pattern, default or whether it's required, edits the ImageManifest dataclass in utilities/images/manifest.py or validates manifests against the schema."
---

# Image manifest schema

This skill is for Claude agents changing the fields of an image's `manifest.json`. A field change has to land in all of these files together. [Image manifests](../../../docs/images/manifests.md) explains how they relate, and its [Schema design rules](../../../docs/images/manifests.md#schema-design-rules) list what the checks don't enforce.

| File | What to change |
| --- | --- |
| `schemas/image-manifest.schema.json` | The property, and `required` if that changes |
| `utilities/images/manifest.py` | The matching `ImageManifest` field, and `image_tags`, `labels` or `template_vars` if they use it |
| `images/src/*/manifest.json` | Every manifest a required, renamed or removed field affects |
| `images/src/*/template.json` | Every template that renders the field |
| `utilities/images/test/test_manifest.py` | `_manifest` lists every required field |
| `utilities/images/test/test_build.py` | `MANIFEST` lists every field, including optional ones |

Nothing checks the two test field lists. A missing required field fails the tests with `TypeError`, but a missing optional field in `MANIFEST` goes unnoticed, so keep it complete by hand.

The image name and repository don't come from the manifest. They're in `utilities/images/config.py`.

## Checks

Run these, and fix anything they report:

```bash
uv run invoke validate images
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

If there's no `.venv`, create it first as [Set up](../../../README.md#set-up) describes, or `uv run` makes one without system site packages. Ask the user before you run `uv run invoke build images`, because it builds and tags real images.
