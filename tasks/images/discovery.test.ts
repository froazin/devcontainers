/** Tests for discovery.ts. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { imageDirs } from "./discovery.ts";
import { ImageError } from "./errors.ts";

const folders: string[] = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new source folder holding each image, with its files each holding an empty JSON object. */
function srcFolder(images: Record<string, readonly string[]>, files: readonly string[] = []): string {
  const src = mkdtempSync(path.join(tmpdir(), "discovery-"));
  folders.push(src);
  for (const [name, imageFiles] of Object.entries(images)) {
    mkdirSync(path.join(src, name));
    for (const file of imageFiles) {
      writeFileSync(path.join(src, name, file), "{}");
    }
  }
  for (const file of files) {
    writeFileSync(path.join(src, file), "");
  }
  return src;
}

const MANIFEST = ["manifest.json"];

/** A row of the imageDirs table. */
interface ImageDirsCase {
  case: string;
  images: Record<string, readonly string[]>;
  files?: string[];
  filter?: string;
  expected?: string[];
  error?: RegExp;
  logs?: string[];
}

describe("imageDirs", () => {
  const cases: ImageDirsCase[] = [
    {
      case: "returns image folders in name order, not file system order",
      images: { zeta: MANIFEST, alpha: MANIFEST, base: MANIFEST },
      expected: ["alpha", "base", "zeta"],
    },
    {
      case: "ignores files beside the images",
      images: { base: MANIFEST },
      files: ["README.md"],
      expected: ["base"],
    },
    {
      case: "skips a folder without a manifest",
      images: { base: MANIFEST, empty: [], "template-only": ["template.hbs"] },
      expected: ["base"],
      logs: ["Skipping empty: manifest.json not found.", "Skipping template-only: manifest.json not found."],
    },
    {
      case: "ignores the shared template beside the images",
      images: { base: MANIFEST },
      files: ["template.hbs"],
      expected: ["base"],
      logs: [],
    },
    {
      case: "a filter matches a name exactly",
      images: { base: MANIFEST, "ubuntu-22.04": MANIFEST, "ubuntu-26.04": MANIFEST },
      filter: "base",
      expected: ["base"],
    },
    {
      case: "a filter matches names as a glob",
      images: { base: MANIFEST, "ubuntu-22.04": MANIFEST, "ubuntu-26.04": MANIFEST },
      filter: "ubuntu-*",
      expected: ["ubuntu-22.04", "ubuntu-26.04"],
    },
    {
      case: "a filter doesn't report skipped images it leaves out",
      images: { base: MANIFEST, empty: [] },
      filter: "base",
      expected: ["base"],
      logs: [],
    },
    {
      case: "a filter is case-sensitive, and matching nothing throws",
      images: { base: MANIFEST },
      filter: "Base",
      error: /with a manifest\.json matches the filter "Base"\.$/,
    },
    {
      case: "throws when there are no images, after reporting the skipped ones",
      images: { empty: [] },
      error: /with a manifest\.json was found\.$/,
      logs: ["Skipping empty: manifest.json not found."],
    },
  ];

  for (const row of cases) {
    it(row.case, (t) => {
      const src = srcFolder(row.images, row.files);
      const log = t.mock.method(console, "log", () => {});

      const expectedError = row.error;
      if (expectedError === undefined) {
        assert.deepEqual(
          imageDirs(row.filter, src),
          (row.expected ?? []).map((name) => path.join(src, name)),
        );
      } else {
        assert.throws(
          () => imageDirs(row.filter, src),
          (error: unknown) => {
            assert.ok(error instanceof ImageError);
            assert.match(error.message, expectedError);
            return true;
          },
        );
      }

      if (row.logs !== undefined) {
        assert.deepEqual(
          log.mock.calls.map((call) => call.arguments[0]),
          row.logs,
        );
      }
    });
  }
});
