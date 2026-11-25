/** Tests for main.js. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { changedFiles, changedImages, compareBase, imageNames, isShared } from "./main.js";

const folders = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/**
 * Returns a new source folder with each folder, holding a manifest.json when its value is true.
 *
 * @param {Record<string, boolean>} images
 */
function srcFolder(images) {
  const dir = mkdtempSync(path.join(tmpdir(), "changed-images-"));
  folders.push(dir);
  for (const [name, hasManifest] of Object.entries(images)) {
    mkdirSync(path.join(dir, name));
    if (hasManifest) {
      writeFileSync(path.join(dir, name, "manifest.json"), "{}");
    }
  }
  writeFileSync(path.join(dir, "template.hbs"), "");
  return dir;
}

/**
 * Returns a fake git that answers each command from the table, and the commands it was given.
 *
 * @param {Record<string, { status?: number, stdout?: string, stderr?: string }>} answers - Keyed by the command line.
 */
function fakeGit(answers) {
  const commands = [];
  /** @type {import("./main.js").Git} */
  const git = (args) => {
    const command = args.join(" ");
    commands.push(command);
    const answer = answers[command] ?? { status: 128, stderr: `unexpected: ${command}` };
    return { status: answer.status ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
  };
  return { git, commands };
}

const BEFORE = "a".repeat(40);

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

describe("isShared", () => {
  const cases = [
    { case: "matches a shared file exactly", file: "package.json", expected: true },
    { case: "matches a file under a shared folder", file: "tasks/images/build.ts", expected: true },
    { case: "matches the action's own files", file: ".github/actions/changed-images/main.js", expected: true },
    { case: "doesn't match an image's own file", file: "images/src/base/Dockerfile", expected: false },
    { case: "doesn't match a file that only starts like a shared file", file: "package.json.bak", expected: false },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(isShared(row.file), row.expected);
    });
  }
});

describe("compareBase", () => {
  const cases = [
    {
      case: "is the merge base for a pull request",
      payload: { pull_request: { base: { ref: "main" } } },
      answers: { "merge-base origin/main HEAD": { stdout: `${"b".repeat(40)}\n` } },
      expected: "b".repeat(40),
      commands: ["merge-base origin/main HEAD"],
    },
    {
      case: "is the commit before a push",
      payload: { before: BEFORE },
      answers: { [`cat-file -e ${BEFORE}^{commit}`]: {} },
      expected: BEFORE,
      commands: [`cat-file -e ${BEFORE}^{commit}`],
    },
    {
      case: "is empty for a branch's first push, whose before is all zeros",
      payload: { before: "0".repeat(40) },
      answers: {},
      expected: "",
      commands: [],
    },
    {
      case: "is empty when the commit before the push isn't in the checkout",
      payload: { before: BEFORE },
      answers: { [`cat-file -e ${BEFORE}^{commit}`]: { status: 1 } },
      expected: "",
      commands: [`cat-file -e ${BEFORE}^{commit}`],
    },
    { case: "is empty with no event", payload: {}, answers: {}, expected: "", commands: [] },
    {
      case: "reports git's error when the merge base fails",
      payload: { pull_request: { base: { ref: "main" } } },
      answers: { "merge-base origin/main HEAD": { status: 1, stderr: "no merge base\n" } },
      error: /^git merge-base failed with exit code 1: no merge base$/,
      commands: ["merge-base origin/main HEAD"],
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const { git, commands } = fakeGit(row.answers);
      if (row.error === undefined) {
        assert.equal(compareBase(row.payload, git), row.expected);
      } else {
        assert.throws(() => compareBase(row.payload, git), { message: row.error });
      }
      assert.deepEqual(commands, row.commands);
    });
  }
});

describe("changedFiles", () => {
  const cases = [
    {
      case: "lists the files the diff names, split on NUL",
      answers: {
        [`diff --name-only --no-renames -z ${BEFORE} HEAD`]: { stdout: "a.md\0images/src/base/Dockerfile\0" },
      },
      expected: ["a.md", "images/src/base/Dockerfile"],
    },
    {
      case: "is empty when nothing changed",
      answers: { [`diff --name-only --no-renames -z ${BEFORE} HEAD`]: { stdout: "" } },
      expected: [],
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const { git } = fakeGit(row.answers);
      assert.deepEqual(changedFiles(BEFORE, git), row.expected);
    });
  }
});

describe("changedImages", () => {
  const images = ["base", "python"];
  const cases = [
    {
      case: "includes only the image whose source changed",
      files: ["images/src/base/Dockerfile"],
      expected: { images: ["base"], sources: ["base"] },
    },
    {
      case: "counts a change to an image's test project as its own",
      files: ["images/test/python/test.sh"],
      expected: { images: ["python"], sources: ["python"] },
    },
    {
      case: "includes every image when shared tooling changed, but reviews only their own changes",
      files: ["tasks/images/build.ts", "images/src/base/README.md"],
      expected: { images: ["base", "python"], sources: ["base"] },
    },
    {
      case: "includes nothing for a change outside the images",
      files: ["README.md"],
      expected: { images: [], sources: [] },
    },
    {
      case: "doesn't count an image whose name only starts like a changed one",
      files: ["images/src/base-extra/Dockerfile"],
      expected: { images: [], sources: [] },
    },
    {
      case: "includes every image, and reviews none, with no commit to compare with",
      files: null,
      expected: { images: ["base", "python"], sources: [] },
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(changedImages(images, row.files), row.expected);
    });
  }
});
