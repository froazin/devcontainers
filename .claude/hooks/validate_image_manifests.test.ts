/** Tests for validate_image_manifests.ts and the sh wrapper that runs it. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { ImageError } from "../../tasks/images/errors.ts";
import { type Checks, editedFile, isWatched, main, ROOT } from "./validate_image_manifests.ts";

const WRAPPER = path.join(ROOT, ".claude", "hooks", "validate_image_manifests.sh");

/** Returns an Edit hook event for the file, as Claude Code writes it to stdin. */
function event(file: string): string {
  return JSON.stringify({ tool_name: "Edit", tool_input: { file_path: file } });
}

const folders: string[] = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("isWatched", () => {
  const outside = mkdtempSync(path.join(tmpdir(), "hook-"));
  folders.push(outside);
  const cases = [
    ...[
      "schemas/image-manifest.schema.json",
      "images/src/base/manifest.json",
      "images/src/template.hbs",
      "tasks/images/manifest.ts",
    ].map((file) => ({ case: `watches ${file}`, file: path.join(ROOT, file), expected: true })),
    ...[
      "tasks/index.ts",
      "images/src/base/Dockerfile",
      "images/src/base/template.hbs",
      "images/src/base/nested/manifest.json",
      "images/test/base/test.sh",
    ].map((file) => ({ case: `ignores ${file}`, file: path.join(ROOT, file), expected: false })),
    {
      case: "ignores the same layout outside the repository",
      file: path.join(outside, "images", "src", "base", "manifest.json"),
      expected: false,
    },
    { case: "ignores an empty path", file: "", expected: false },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(isWatched(row.file), row.expected);
    });
  }
});

describe("editedFile", () => {
  const cases = [
    { case: "reads the tool input's file path", event: { tool_input: { file_path: "a.json" } }, expected: "a.json" },
    { case: "falls back when the input isn't an object", event: { tool_input: "not an object" }, expected: "" },
    { case: "falls back when the event isn't an object", event: [], expected: "" },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(editedFile(row.event), row.expected);
    });
  }
});

describe("main", () => {
  const manifest = path.join(ROOT, "images/src/base/manifest.json");
  const failing: Checks = {
    checkManifests() {
      throw new ImageError("The image manifest checks failed:\n- bad");
    },
  };
  const cases = [
    {
      case: "skips files it doesn't watch",
      input: event(path.join(ROOT, "tasks/index.ts")),
      checks: failing,
      expected: 0,
    },
    { case: "fails open on input that isn't JSON", input: "not json", checks: failing, expected: 0 },
    {
      case: "reports errors with exit 2, the only code whose stderr reaches Claude",
      input: event(manifest),
      checks: failing,
      expected: 2,
      stderr: /- bad\nFix them by following the image-manifest-schema skill\.$/,
    },
    {
      case: "explains checks that can't load",
      input: event(manifest),
      checks: new Error("Cannot find package 'ajv'"),
      expected: 1,
      stderr: /^Can't run the image manifest checks: Cannot find package 'ajv'\. Run `npm install`\.$/,
    },
    { case: "passes the repository's real checks", input: event(manifest), checks: undefined, expected: 0 },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      const cwd = process.cwd();
      t.after(() => process.chdir(cwd));
      const error = t.mock.method(console, "error", () => {});
      let loaded = false;
      const loadChecks =
        row.checks === undefined
          ? undefined
          : async () => {
              loaded = true;
              if (row.checks instanceof Error) {
                throw row.checks;
              }
              return row.checks;
            };

      assert.equal(await main(row.input, loadChecks), row.expected);

      if (row.stderr === undefined) {
        assert.deepEqual(error.mock.calls, []);
      } else {
        assert.match(error.mock.calls.map((call) => call.arguments.join(" ")).join("\n"), row.stderr);
      }
      if (row.expected === 0 && row.checks !== undefined) {
        assert.equal(loaded, false);
      }
    });
  }
});

describe("validate_image_manifests.sh", () => {
  const node = spawnSync("sh", ["-c", "command -v node"], { encoding: "utf8" }).stdout.trim();
  const cases = [
    { case: "accepts an event for an unwatched file", file: "tasks/index.ts", expected: 0, stderr: /^$/ },
    { case: "accepts an event for a watched file", file: "images/src/base/manifest.json", expected: 0, stderr: /^$/ },
    {
      case: "fails open without node on PATH",
      file: "images/src/base/manifest.json",
      env: { PATH: "/usr/bin:/bin" },
      skip: ["/usr/bin", "/bin"].includes(path.dirname(node)) ? "node is installed in /usr/bin or /bin" : undefined,
      expected: 0,
      stderr: /node isn't on PATH/,
    },
  ];

  for (const row of cases) {
    it(row.case, { skip: row.skip }, () => {
      const result = spawnSync(WRAPPER, {
        input: event(path.join(ROOT, row.file)),
        encoding: "utf8",
        env: { ...process.env, ...row.env },
      });

      assert.equal(result.status, row.expected);
      assert.match(result.stderr, row.stderr);
    });
  }
});
