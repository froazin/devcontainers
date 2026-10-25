---
paths:
  - "images/src/*/manifest.json"
  - "images/src/*/template.json"
  - "schemas/image-manifest.schema.json"
  - "devel/images/manifest.py"
---

# Image manifests

The manifest schema, the `ImageManifest` dataclass, each image's `manifest.json` and its `template.json` must agree. This rule is for Claude agents changing any of them.

- **Load the `image-manifest-schema` skill before you change the manifest's fields.** That's any change that needs a schema update: adding, renaming or removing a field in a `manifest.json` or in `ImageManifest`, or changing a field's type, default, pattern or whether it's required. If the skill isn't listed, read `.claude/skills/image-manifest-schema/SKILL.md`.
- Changing only a value in one image's `manifest.json`, such as its `version` or `tags`, doesn't need the skill.
- When you change a manifest's `name`, `description`, `owner`, `repo`, `version`, `tags` or `build_args`, update the image's `README.md` in the same change, as [Image READMEs](../../docs/container-images/readmes.md) describes.
- **After every change to these files, run the checks by hand:**

  ```bash
  .claude/hooks/validate_image_manifests.sh --all
  ```

  It exits non-zero and lists the errors when something disagrees. Fix them before you finish.
- The same checks also run as a PostToolUse hook after each Edit or Write to one of these files. The hook sees one edit at a time, so it can report errors partway through a change that touches several files. Carry on with the change, then run the command above at the end.
