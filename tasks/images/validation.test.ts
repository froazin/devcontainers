/** Tests for validation.ts. They read the repository's schema and base manifest, so run them from its root. */

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { IMAGE_MANIFEST_SCHEMA } from "./config.ts";
import { ImageError } from "./errors.ts";
import { checkManifests, fieldErrors, manifestErrors, schemaErrors, validate } from "./validation.ts";

/** A JSON object, such as the schema. */
type Json = Record<string, any>;

/** Returns a fresh copy of the repository's manifest schema. */
function schema(): Json {
  return JSON.parse(readFileSync(IMAGE_MANIFEST_SCHEMA, "utf8"));
}

/** Returns the base image's manifest, which passes every check. */
function baseManifest(): Json {
  return JSON.parse(readFileSync("images/src/base/manifest.json", "utf8"));
}

/** Returns the schema after a change to it. */
function changed(change: (schema: Json) => void): Json {
  const copy = schema();
  change(copy);
  return copy;
}

const folders: string[] = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new folder. */
function tmp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "validation-"));
  folders.push(dir);
  return dir;
}

/** A template that renders every manifest that passes the schema. */
const TEMPLATE = '{"name": {{json name}} }';

/**
 * Returns a new source folder holding each image's manifest and the shared template. A string manifest is written as
 * is, so it can be invalid JSON, and a null template is left out.
 */
function srcFolder(manifests: Record<string, unknown>, template: string | null = TEMPLATE): string {
  const src = tmp();
  for (const [name, manifest] of Object.entries(manifests)) {
    mkdirSync(path.join(src, name));
    writeFileSync(
      path.join(src, name, "manifest.json"),
      typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    );
  }
  if (template !== null) {
    writeFileSync(path.join(src, "template.hbs"), template);
  }
  return src;
}

describe("schemaErrors", () => {
  const cases = [
    { case: "passes the repository's schema", schema: schema(), expected: [] },
    {
      case: "reports an unknown type, which only the metaschema check catches",
      schema: changed((s) => {
        s.properties.name.type = "text";
      }),
      match: /^other\.json is not a valid JSON schema: /,
    },
    {
      case: "requires additionalProperties false, and says why",
      schema: changed((s) => {
        delete s.additionalProperties;
      }),
      expected: ['other.json must set "additionalProperties": false, because ImageManifest rejects unknown fields.'],
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const errors = schemaErrors(row.schema, "other.json");
      if (row.match === undefined) {
        assert.deepEqual(errors, row.expected);
      } else {
        assert.equal(errors.length, 1);
        assert.match(errors[0] ?? "", row.match);
      }
    });
  }
});

describe("fieldErrors", () => {
  const cases = [
    { case: "passes the repository's schema", change: () => {}, expected: [] },
    {
      case: "reports a property without a field, which ImageManifest would reject",
      change: (s: Json) => {
        s.properties.labels = { type: "object" };
      },
      expected: ['Schema property "labels" has no ImageManifest field.'],
    },
    {
      case: "reports a field without a property, which the schema would reject",
      change: (s: Json) => {
        delete s.properties.build_args;
      },
      expected: ['ImageManifest field "build_args" has no schema property.'],
    },
    {
      case: "reports a required name without a property, which no manifest could satisfy",
      change: (s: Json) => {
        s.required.push("maintainer");
      },
      expected: [`"maintainer" is in the schema's required list, but has no schema property.`],
    },
    {
      case: "reports a required field missing from required",
      change: (s: Json) => {
        s.required = s.required.filter((name: string) => name !== "version");
      },
      expected: [`"version" has no default in ImageManifest, so add it to the schema's required list.`],
    },
    {
      case: "reports a field with a default in required",
      change: (s: Json) => {
        s.required.push("build_args");
      },
      expected: [`"build_args" is in the schema's required list, but ImageManifest gives it a default.`],
    },
    {
      case: "reports a default that differs",
      change: (s: Json) => {
        s.properties.build_args.default = { BASE_IMAGE: "ubuntu" };
      },
      expected: [`"build_args" has the schema default {"BASE_IMAGE":"ubuntu"}, but ImageManifest uses {}.`],
    },
    {
      case: "reports a plain type that differs",
      change: (s: Json) => {
        s.properties.name.type = "integer";
      },
      expected: [`Schema property "name" should have {"type":"string"} for the kind "string".`],
    },
    {
      case: "reports an array's items that differ",
      change: (s: Json) => {
        s.properties.tags.items = { type: "integer" };
      },
      expected: [
        `Schema property "tags" should have {"type":"array","items":{"type":"string"}} for the kind "string[]".`,
      ],
    },
    {
      case: "reports an object's values that differ",
      change: (s: Json) => {
        s.properties.build_args.additionalProperties = { type: "integer" };
      },
      expected: [
        `Schema property "build_args" should have {"type":"object","additionalProperties":{"type":"string"}} ` +
          `for the kind "record".`,
      ],
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(fieldErrors(changed(row.change)), row.expected);
    });
  }
});

/** A row of the manifestErrors table. */
interface ManifestErrorsCase {
  case: string;
  manifests: Record<string, unknown>;
  template?: string | null;
  unreadable?: boolean;
  skip?: string;
  expected?: (src: string) => string[];
  match?: RegExp;
}

describe("manifestErrors", () => {
  const pattern = schema().properties.version.pattern;
  const isRoot = process.getuid?.() === 0;
  const cases: ManifestErrorsCase[] = [
    {
      case: "reports schema errors with the file path",
      manifests: { base: { ...baseManifest(), version: "1.0" } },
      expected: (src: string) => [
        `${path.join(src, "base", "manifest.json")}: /version must match pattern "${pattern}"`,
      ],
    },
    {
      case: "reports an unreadable manifest rather than throwing",
      manifests: { base: baseManifest() },
      unreadable: true,
      skip: isRoot ? "root can read a file without read permission" : undefined,
      expected: (src: string) => [`Can't read ${path.join(src, "base", "manifest.json")}: permission denied.`],
    },
    {
      case: "reports invalid JSON rather than throwing",
      manifests: { base: "{" },
      match: /manifest\.json is not valid JSON: /,
    },
    {
      case: "reports a template using a missing field",
      manifests: { base: baseManifest() },
      template: '{"name": {{json maintainer}} }',
      match: /template\.hbs doesn't render with .*manifest\.json: json was given a missing value/,
    },
    {
      case: "reports a template that renders invalid JSON",
      manifests: { base: baseManifest() },
      template: '{"name": {{name}} }',
      match: /template\.hbs doesn't render to valid JSON with /,
    },
    {
      case: "renders the template with every manifest, naming the one it fails with",
      manifests: { good: baseManifest(), bad: { ...baseManifest(), build_args: {} } },
      template: '{"arg": {{json build_args.BASE_IMAGE}} }',
      expected: (src: string) => [
        `${path.join(src, "template.hbs")} doesn't render with ${path.join(src, "bad", "manifest.json")}: ` +
          "json was given a missing value on line 1.",
      ],
    },
    {
      case: "reports a missing template once, and still checks every manifest",
      manifests: { good: baseManifest(), bad: { ...baseManifest(), tags: [] } },
      template: null,
      expected: (src: string) => [
        `${path.join(src, "template.hbs")} not found, so no image can build.`,
        `${path.join(src, "bad", "manifest.json")}: /tags must NOT have fewer than 1 items`,
      ],
    },
  ];

  for (const row of cases) {
    it(row.case, { skip: row.skip }, () => {
      const src = srcFolder(row.manifests, row.template);
      if (row.unreadable) {
        chmodSync(path.join(src, "base", "manifest.json"), 0);
      }

      const errors = manifestErrors(schema(), src);
      if (row.match === undefined) {
        assert.deepEqual(errors, row.expected?.(src));
      } else {
        assert.equal(errors.length, 1);
        assert.match(errors[0] ?? "", row.match);
      }
    });
  }
});

describe("validate", () => {
  const invalid = changed((s) => {
    delete s.additionalProperties;
    s.required.push("maintainer");
  });
  const cases = [
    { case: "passes the repository", useRepository: true, expected: [] as string[] },
    {
      case: "stops at an invalid schema, so field errors don't follow",
      content: JSON.stringify(invalid),
      expected: (schemaPath: string) => schemaErrors(invalid, schemaPath),
    },
    { case: "reports a missing schema file", content: null, match: /^Can't read .*: no such file or directory\.$/ },
    { case: "reports a schema that isn't valid JSON", content: "{", match: /is not valid JSON/ },
    { case: "reports a schema that isn't an object", content: "true", match: /must hold a JSON object\.$/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      if (row.useRepository) {
        assert.deepEqual(validate(), row.expected);
        return;
      }

      const dir = tmp();
      const schemaPath = path.join(dir, "schema.json");
      if (row.content !== null && row.content !== undefined) {
        writeFileSync(schemaPath, row.content);
      }

      const errors = validate(schemaPath, dir);
      if (typeof row.expected === "function") {
        assert.deepEqual(errors, row.expected(schemaPath));
      } else {
        assert.equal(errors.length, 1);
        assert.match(errors[0] ?? "", row.match ?? /./);
      }
    });
  }
});

describe("checkManifests", () => {
  const cases = [
    { case: "passes for the repository, as the build's own check", useRepository: true },
    {
      case: "lists every error, one per line",
      manifests: { a: { ...baseManifest(), tags: [] }, b: { ...baseManifest(), version: "1" } },
      error: (src: string) =>
        [
          "The image manifest checks failed:",
          `- ${path.join(src, "a", "manifest.json")}: /tags must NOT have fewer than 1 items`,
          `- ${path.join(src, "b", "manifest.json")}: /version must match pattern "${schema().properties.version.pattern}"`,
        ].join("\n"),
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      if (row.useRepository) {
        checkManifests();
        return;
      }

      const src = srcFolder(row.manifests ?? {});
      assert.throws(
        () => checkManifests(IMAGE_MANIFEST_SCHEMA, src),
        (error: unknown) => {
          assert.ok(error instanceof ImageError);
          assert.equal(error.message, row.error?.(src));
          return true;
        },
      );
    });
  }
});
