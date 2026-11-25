---
name: image-manifest-schema
description: "Create or update the JSON schema for image manifests, schemas/image-manifest.schema.json. Use when a task adds, renames, removes or changes a field in an images/src/<image>/manifest.json, changes a field's type, pattern, default or whether it's required, edits MANIFEST_FIELDS or the ImageManifest type in tasks/images/manifest.ts or validates manifests against the schema."
---

# Image manifest schema

This skill is for Claude agents changing the fields of an image's `manifest.json`. A field change has to land in all of these files together. [Image manifests](../../../docs/images/manifests.md) explains how they relate, and its [Schema design rules](../../../docs/images/manifests.md#schema-design-rules) list what the checks don't enforce.

| File | What to change |
| --- | --- |
| `schemas/image-manifest.schema.json` | The property, and `required` if that changes |
| `tasks/images/manifest.ts` | The matching entry in `MANIFEST_FIELDS`, with a `default` for an optional field, and `imageTags`, `labels` or `templateVars` if they use it |
| `images/src/*/manifest.json` | Every manifest a required, renamed or removed field affects |
| `images/src/template.hbs` | The shared image template, if it renders the field |
| `tasks/images/manifest.test.ts` | `REQUIRED` lists every required field |
| `tasks/images/build.test.ts` | `MANIFEST` lists every field, including optional ones |

Nothing checks the two test field lists. A missing required field fails the tests with a `TypeError` from `parseManifest`, but a missing optional field in `MANIFEST` goes unnoticed, so keep it complete by hand.

A new field kind also needs a type in `KindTypes`, a check in `hasKind` and its schema in `SCHEMA_TYPES` in `tasks/images/validation.ts`.

The image name and repository don't come from the manifest. They're in `tasks/images/config.ts`.

## Checks

Run these, and fix anything they report:

```bash
npm run tasks -- validate images
npm run lint && npm run typecheck && npm test
```

If there's no `node_modules`, run `npm install` first, as [Set up](../../../README.md#set-up) describes. Ask the user before you run `npm run tasks -- build images`, because it builds and tags real images.
