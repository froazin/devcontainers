/** Tests for lib.js. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { encodeCommand, gitOutput, imageNames, matches, setOutput } from "./lib.js";

const folders = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new temporary folder. */
function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-lib-"));
  folders.push(dir);
  return dir;
}

/**
 * Returns a new source folder with each folder, holding a manifest.json when its value is true.
 *
 * @param {Record<string, boolean>} images
 */
function srcFolder(images) {
  const dir = tmp();
  for (const [name, hasManifest] of Object.entries(images)) {
    mkdirSync(path.join(dir, name));
    if (hasManifest) {
      writeFileSync(path.join(dir, name, "manifest.json"), "{}");
    }
  }
  writeFileSync(path.join(dir, "template.hbs"), "");
  return dir;
}

describe("gitOutput", () => {
  const cases = [
    { case: "returns stdout when git succeeds", result: { status: 0, stdout: "abc\n", stderr: "" }, expected: "abc\n" },
    {
      case: "throws with git's own error when it fails",
      result: { status: 128, stdout: "", stderr: "fatal: bad revision\n" },
      error: /^git log failed with exit code 128: fatal: bad revision$/,
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const git = () => row.result;
      if (row.error === undefined) {
        assert.equal(gitOutput(git, ["log"]), row.expected);
      } else {
        assert.throws(() => gitOutput(git, ["log"]), { message: row.error });
      }
    });
  }
});

describe("imageNames", () => {
  const cases = [
    {
      case: "lists the folders with a manifest.json, sorted",
      images: { zeta: true, base: true, "no-manifest": false },
      expected: ["base", "zeta"],
    },
    { case: "rejects a name --filter would read as a glob", images: { "base*": true }, error: /base\*/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const dir = srcFolder(row.images);
      if (row.error === undefined) {
        assert.deepEqual(imageNames(dir), row.expected);
      } else {
        assert.throws(() => imageNames(dir), { message: row.error });
      }
    });
  }
});

describe("matches", () => {
  const cases = [
    { case: "matches a file exactly", file: "package.json", paths: ["package.json"], expected: true },
    { case: "matches a file under a folder", file: "tasks/images/build.ts", paths: ["tasks/images/"], expected: true },
    {
      case: "doesn't match a file that only starts like one",
      file: "package.json.bak",
      paths: ["package.json"],
      expected: false,
    },
    {
      case: "doesn't match a folder that only starts like one",
      file: ".github/actions-old/x.js",
      paths: [".github/actions/"],
      expected: false,
    },
    { case: "matches nothing with no paths", file: "package.json", paths: [], expected: false },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(matches(row.file, row.paths), row.expected);
    });
  }
});

describe("encodeCommand", () => {
  const cases = [
    { case: "leaves plain text as it is", text: "a plain message", expected: "a plain message" },
    { case: "encodes a percent sign first", text: "100%", expected: "100%25" },
    {
      case: "encodes line breaks, so text can't start a new command",
      text: "a\r\n::error::b",
      expected: "a%0D%0A::error::b",
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(encodeCommand(row.text), row.expected);
    });
  }
});

describe("setOutput", () => {
  const cases = [
    { case: "appends name=value to GITHUB_OUTPUT", value: '["base"]', expected: 'images=["base"]\n' },
    { case: "rejects a value with a line break", value: "a\nb=c", error: /single line/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const file = path.join(tmp(), "output");
      writeFileSync(file, "");
      if (row.error === undefined) {
        setOutput("images", row.value, { GITHUB_OUTPUT: file });
        assert.equal(readFileSync(file, "utf8"), row.expected);
      } else {
        assert.throws(() => setOutput("images", row.value, { GITHUB_OUTPUT: file }), { message: row.error });
        assert.equal(readFileSync(file, "utf8"), "");
      }
    });
  }
});
