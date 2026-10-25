---
name: image-manifest-schema
description: "Create or update the JSON schema for image manifests, schemas/image-manifest.schema.json. Use when a task adds, renames, removes or changes a field in an images/src/<image>/manifest.json, changes a field's type, pattern, default or whether it's required, edits the ImageManifest dataclass in devel/images/manifest.py or validates manifests against the schema."
---

# Image manifest schema

This skill is for Claude agents changing the fields of an image's `manifest.json`. It covers how to keep the schema, the `ImageManifest` dataclass, the manifests, the templates and the tests in step. Paths are relative to the repository root.

## What has to stay in step

| File | What it holds |
| --- | --- |
| `schemas/image-manifest.schema.json` | The schema. VS Code checks every `images/src/*/manifest.json` against it, through `json.schemas` in `.vscode/settings.json` |
| `devel/images/manifest.py` | The `ImageManifest` dataclass. `from_json` passes the JSON straight to it, so an unknown field raises `TypeError` |
| `images/src/*/manifest.json` | Each image's values |
| `images/src/*/template.json` | Jinja2 templates. `render_template` passes every manifest field, and `StrictUndefined` fails on a field that's gone |
| `devel/images/test/test_manifest.py` | `_manifest` lists every required field |
| `devel/images/test/test_build.py` | `MANIFEST` lists every field |

`devel/images/validation.py` checks that these agree, and so do the hook and the tests that call it.

## Schema rules

**Read [Schema design rules](../../../docs/container-images/manifests.md#schema-design-rules) before you change the schema or `ImageManifest`.** It holds the rules for the schema and the type mapping that `SCHEMA_TYPES` in `devel/images/validation.py` checks.

## Steps

1. Change the property in `schemas/image-manifest.schema.json`, and its entry in `required` if that changes.
1. Change the matching field in `ImageManifest`.
1. Update every `images/src/*/manifest.json`:
   - **New required field:** add a value to every manifest.
   - **New optional field:** add it only to the manifests that need a value other than the default.
   - **Renamed field:** rename it in every manifest and in every `template.json` that uses it.
   - **Removed field:** remove it from every manifest and every `template.json`.
   - **Changed type, pattern or default:** update any value that no longer validates.
1. A new field does nothing until something uses it. If it belongs in `.devcontainer.json`, render it in each `template.json`. If it changes the build, such as the image name or tags, update `devel/images/build.py`.
1. Update the tests: the field lists in `_manifest` and `MANIFEST`, a test for any new rule such as a default or a rejected value and an assertion in `test_build.py` for anything the build now does with the field.
1. Run the checks below.

## Checks

Run the image manifest checks. They validate the schema, every manifest against it, the schema against `ImageManifest` and an offline render of every `template.json`:

```bash
.claude/hooks/validate_image_manifests.sh --all
```

It prints the errors and exits non-zero when anything disagrees. It runs the checks through `uv run`, so it needs `uv` on `PATH` and the project's `.venv`. If either is missing, set them up as `CONTRIBUTING.md` describes.

Then run the project checks, and fix anything they report:

```bash
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

`uv run invoke build images` also builds and tags real images, so ask the user before you run it.

## Checklist

Before you finish, check that:

- `.claude/hooks/validate_image_manifests.sh --all` passes.
- The schema follows every rule in [Schema design rules](../../../docs/container-images/manifests.md#schema-design-rules).
- `_manifest` lists every required field, and `MANIFEST` lists every field.
- Ruff, Pyright and pytest pass.
