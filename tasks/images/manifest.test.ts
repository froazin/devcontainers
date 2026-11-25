/** Tests for manifest.ts. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  type ImageManifest,
  imageTags,
  imageVersion,
  labels,
  parseManifest,
  readManifest,
  renderTemplate,
  templateVars,
} from "./manifest.ts";

// The SemVer 2.0.0 pattern from https://semver.org, for versions with a pre-release and build metadata.
const SEMVER = new RegExp(
  "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
    "(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?" +
    "(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$",
);

// Every required field, so a new required field fails these tests until it's added.
const REQUIRED = { name: "Ubuntu", description: "Base image", version: "1.2.3", tags: ["ubuntu", "base"] };

/** Returns a valid manifest, with any field replaced. */
function manifest(overrides: Partial<ImageManifest> = {}): ImageManifest {
  return parseManifest({ ...REQUIRED, ...overrides });
}

const folders: string[] = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new folder holding each file. */
function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "manifest-"));
  folders.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

describe("parseManifest", () => {
  const cases = [
    {
      case: "reads every field, including the optional ones",
      data: { ...REQUIRED, build_args: { BASE_IMAGE: "ubuntu:26.04" }, devcontainer: { init: false } },
      expected: { ...REQUIRED, build_args: { BASE_IMAGE: "ubuntu:26.04" }, devcontainer: { init: false } },
    },
    {
      case: "defaults build_args and devcontainer to empty",
      data: REQUIRED,
      expected: { ...REQUIRED, build_args: {}, devcontainer: {} },
    },
    { case: "rejects a misspelt or unknown field", data: { ...REQUIRED, base_image: "ubuntu" }, error: /base_image/ },
    {
      case: "rejects a missing required field",
      data: { ...REQUIRED, version: undefined },
      error: /version is required/,
    },
    {
      case: "rejects a field of the wrong type",
      data: { ...REQUIRED, tags: "base" },
      error: /tags must have the kind string\[\]/,
    },
    {
      case: "rejects devcontainer settings that aren't an object",
      data: { ...REQUIRED, devcontainer: ["init"] },
      error: /devcontainer must have the kind object/,
    },
    { case: "rejects data that isn't an object", data: ["base"], error: /must be a JSON object/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const data = JSON.parse(JSON.stringify(row.data));
      if (row.error === undefined) {
        assert.deepEqual(parseManifest(data), row.expected);
      } else {
        assert.throws(() => parseManifest(data), { name: "TypeError", message: row.error });
      }
    });
  }
});

describe("readManifest", () => {
  const cases = [
    {
      case: "reads and parses the file",
      content: JSON.stringify({ ...REQUIRED, build_args: { A: "b" } }),
      expected: { ...REQUIRED, build_args: { A: "b" }, devcontainer: {} },
    },
    {
      case: "rejects an unknown field in the file",
      content: JSON.stringify({ ...REQUIRED, other: 1 }),
      error: TypeError,
    },
    { case: "rejects invalid JSON", content: "{", error: SyntaxError },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const file = path.join(folder({ "manifest.json": row.content }), "manifest.json");
      if (row.error === undefined) {
        assert.deepEqual(readManifest(file), row.expected);
      } else {
        assert.throws(() => readManifest(file), row.error);
      }
    });
  }
});

describe("imageVersion", () => {
  const cases = [
    { case: "a release is the version with a v prefix", release: true, expected: "v1.2.3" },
    { case: "a dev build adds -dev, as a SemVer pre-release", release: false, expected: "v1.2.3-dev" },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const version = imageVersion(manifest(), row.release);

      assert.equal(version, row.expected);
      assert.match(version.replace(/^v/, ""), SEMVER);
    });
  }
});

describe("labels", () => {
  const cases = [
    { case: "a release carries the release version", release: true, version: "v1.2.3" },
    { case: "a dev build carries -dev in the version", release: false, version: "v1.2.3-dev" },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(labels(manifest(), row.release), {
        "org.opencontainers.image.version": row.version,
        "org.opencontainers.image.title": "Ubuntu",
        "org.opencontainers.image.description": "Base image",
        "org.opencontainers.image.source": "https://github.com/froazin/devcontainers",
      });
    });
  }
});

/** A row of the imageTags table. */
interface ImageTagsCase {
  case: string;
  release: boolean;
  version?: string;
  expected?: string[];
  error?: new (...args: never[]) => Error;
}

describe("imageTags", () => {
  const cases: ImageTagsCase[] = [
    {
      case: "a release adds the version suffixes to each tag, in order",
      release: true,
      expected: ["ubuntu", "ubuntu-v1", "ubuntu-v1.2", "ubuntu-v1.2.3", "base", "base-v1", "base-v1.2", "base-v1.2.3"],
    },
    {
      case: "a dev build adds -dev to every tag",
      release: false,
      expected: [
        "ubuntu-dev",
        "ubuntu-v1-dev",
        "ubuntu-v1.2-dev",
        "ubuntu-v1.2.3-dev",
        "base-dev",
        "base-v1-dev",
        "base-v1.2-dev",
        "base-v1.2.3-dev",
      ],
    },
    ...["1.2", "1.2.3.4", "1.2.x"].flatMap((version) =>
      [true, false].map((release) => ({
        case: `rejects ${version} for a ${release ? "release" : "dev build"}`,
        version,
        release,
        error: RangeError,
      })),
    ),
  ];

  for (const row of cases) {
    it(row.case, () => {
      const image = manifest({ version: row.version ?? "1.2.3" });
      if (row.error === undefined) {
        assert.deepEqual(imageTags(image, row.release), row.expected);
      } else {
        assert.throws(() => imageTags(image, row.release), row.error);
      }
    });
  }
});

describe("templateVars", () => {
  const cases = [
    {
      case: "are every field and the label values, so a rename fails here before a build",
      release: false,
      expected: {
        ...REQUIRED,
        build_args: { BASE_IMAGE: "ubuntu:26.04" },
        devcontainer: {},
        image_version: "v1.2.3-dev",
        image_source: "https://github.com/froazin/devcontainers",
      },
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(
        templateVars(manifest({ build_args: { BASE_IMAGE: "ubuntu:26.04" } }), row.release),
        row.expected,
      );
    });
  }
});

describe("renderTemplate", () => {
  const cases = [
    {
      case: "renders a nested build arg and the release version",
      template: "{{name}} {{build_args.BASE_IMAGE}} {{image_version}}\n",
      release: true,
      expected: "Ubuntu u v1.2.3\n",
    },
    {
      case: "renders the dev version for a dev build",
      template: "{{name}} {{build_args.BASE_IMAGE}} {{image_version}}\n",
      release: false,
      expected: "Ubuntu u v1.2.3-dev\n",
    },
    {
      case: "doesn't HTML-escape values",
      template: "{{json name}}",
      name: '<a & "b">',
      release: true,
      expected: '"<a & \\"b\\">"',
    },
    {
      case: "fails on a missing variable",
      template: "{{maintainer}}",
      release: true,
      error: /"maintainer" not defined/,
    },
    {
      case: "fails on a missing helper argument, which strict mode alone misses",
      template: '{\n  "name": {{json maintainer}}\n}',
      release: true,
      error: /json was given a missing value on line 2/,
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const template = path.join(folder({ "template.hbs": row.template }), "template.hbs");
      const image = manifest({ name: row.name ?? "Ubuntu", build_args: { BASE_IMAGE: "u" } });
      if (row.error === undefined) {
        assert.equal(renderTemplate(template, image, row.release), row.expected);
      } else {
        assert.throws(() => renderTemplate(template, image, row.release), row.error);
      }
    });
  }
});
