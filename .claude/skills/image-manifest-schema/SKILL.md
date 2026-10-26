---
name: image-manifest-schema
description: "Create or update the JSON schema for image manifests, schemas/image-manifest.schema.json. Use when a task adds, renames, removes or changes a field in an images/src/<image>/manifest.json, changes a field's type, pattern, default or whether it's required, edits the ImageManifest dataclass in devel/images/manifest.py or validates manifests against the schema."
---

# Image manifest schema

This skill is for Claude agents changing the fields of an image's `manifest.json`. It covers how to keep the schema, the `ImageManifest` dataclass, the manifests, the templates and the tests in step. Paths are relative to the repository root.

## What has to stay in step

| File                                 | What it holds                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemas/image-manifest.schema.json` | The schema. VS Code checks every `images/src/*/manifest.json` against it, through `json.schemas` in `.vscode/settings.json`                                                                                 |
| `devel/images/manifest.py`           | The `ImageManifest` dataclass, with `ImageManifest.template_vars`, and the module-level `render_template`. See [The ImageManifest dataclass](../../../docs/images/manifests.md#the-imagemanifest-dataclass) |
| `images/src/*/manifest.json`         | Each image's values                                                                                                                                                                                         |
| `images/src/*/template.json`         | Jinja2 templates. `render_template` renders them with every manifest field, and fails on a field that's gone. See [Rendering template.json](../../../docs/images/manifests.md#rendering-templatejson)       |
| `devel/images/test/test_manifest.py` | `_manifest` lists every required field                                                                                                                                                                      |
| `devel/images/test/test_build.py`    | `MANIFEST` lists every field                                                                                                                                                                                |

`devel/images/validation.py` checks that the schema, `ImageManifest`, the manifests and the templates agree. It doesn't check the test field lists. A required field missing from `_manifest` or `MANIFEST` fails the tests with `TypeError`, but nothing checks a missing optional field in `MANIFEST`, so keep `MANIFEST` complete by hand.

## Schema rules

**Read [Schema design rules](../../../docs/images/manifests.md#schema-design-rules) before you change the schema or `ImageManifest`.** It holds the rules for the schema and the type mapping that `SCHEMA_TYPES` in `devel/images/validation.py` checks.

## Steps

1. Change the property in `schemas/image-manifest.schema.json`, and its entry in `required` if that changes.
1. Change the matching field in `ImageManifest`.
1. Update every `images/src/*/manifest.json`:
   - **New required field:** add a value to every manifest.
   - **New optional field:** add it only to the manifests that need a value other than the default.
   - **Renamed field:** rename it in every manifest and in every `template.json` that uses it.
   - **Removed field:** remove it from every manifest and every `template.json`.
   - **Changed type, pattern or default:** update any value that no longer validates.
1. A new field does nothing until something uses it:
   - **In `.devcontainer.json`:** render it in each `template.json`.
   - **In the tags or labels:** change `image_tags`, `dev_tags` or `labels` in `devel/images/manifest.py`, and test them in `test_manifest.py`.
   - **In how the build runs:** change `devel/images/build.py`, and test it in `test_build.py`.

   The image name and repository don't come from the manifest. They're in `devel/images/config.py`, as [Names and tags](../../../docs/images/builds.md#names-and-tags) describes.

1. Update the tests:
   - The field lists in `_manifest` and `MANIFEST`.
   - A test for any new rule, such as a default or a rejected value.
   - An assertion for anything the tags, labels or build now do with the field.
1. Run the checks below.

## Checks

Check that `.venv` exists first. Without it, `uv run` creates one without system site packages, which [Set up](../../../README.md#set-up) warns against. If it's missing, create it as Set up describes. The command also needs `uv` on `PATH`, which [Prerequisites](../../../README.md#prerequisites) lists.

Run the image manifest checks, which [Validation](../../../docs/images/manifests.md#validation) describes:

```bash
uv run invoke validate images
```

It prints the errors and exits 1 when anything disagrees.

Then run the project checks, and fix anything they report:

```bash
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

`uv run invoke build images` runs the same checks, but it also builds and tags real images, so ask the user before you run it.

## Checklist

Before you finish, check that:

- `uv run invoke validate images` passes.
- The schema follows every rule in [Schema design rules](../../../docs/images/manifests.md#schema-design-rules).
- `_manifest` lists every required field, and `MANIFEST` lists every field.
- Ruff, Pyright and pytest pass.
