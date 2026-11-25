---
paths:
  - "images/src/*/manifest.json"
  - "images/src/template.hbs"
  - "schemas/image-manifest.schema.json"
  - "tasks/images/manifest.ts"
---

# Image manifests

The manifest schema, `MANIFEST_FIELDS` and the `ImageManifest` type, each image's `manifest.json` and the shared image template, `images/src/template.hbs`, must agree.

- **Load the `image-manifest-schema` skill before you add, rename or remove a manifest field, or change its type, default, pattern or whether it's required.** If the skill isn't listed, read `.claude/skills/image-manifest-schema/SKILL.md`. Changing only a value, such as an image's `version`, doesn't need it.
- A PostToolUse hook runs the checks after each Edit or Write to these files. It sees one edit at a time, so it can report errors partway through a change across several files. Carry on, then run `npm run tasks -- validate images` at the end and fix what it reports.
