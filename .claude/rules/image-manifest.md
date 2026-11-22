---
paths:
  - "images/src/*/manifest.json"
  - "images/src/*/template.json"
  - "schemas/image-manifest.schema.json"
  - "utilities/images/manifest.py"
---

# Image manifests

The manifest schema, the `ImageManifest` dataclass, each image's `manifest.json` and its `template.json` must agree.

- **Load the `image-manifest-schema` skill before you add, rename or remove a manifest field, or change its type, default, pattern or whether it's required.** If the skill isn't listed, read `.claude/skills/image-manifest-schema/SKILL.md`. Changing only a value, such as an image's `version`, doesn't need it.
- A PostToolUse hook runs the checks after each Edit or Write to these files. It sees one edit at a time, so it can report errors partway through a change across several files. Carry on, then run `uv run invoke validate images` at the end and fix what it reports.
