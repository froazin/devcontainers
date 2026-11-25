/** Tests for main.js. They check that SHARED and ACTIONS name real paths, so run them from the repository root. */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { ACTIONS, changedActions, changedFiles, changedImages, compareBase, isShared, run, SHARED } from "./main.js";

const folders = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/**
 * Returns a fake git that answers each command from the table, and the commands it was given.
 *
 * @param {Record<string, { status?: number, stdout?: string, stderr?: string }>} answers - Keyed by the command line.
 */
function fakeGit(answers) {
  const commands = [];
  /** @type {import("../lib.js").Git} */
  const git = (args) => {
    const command = args.join(" ");
    commands.push(command);
    const answer = answers[command] ?? { status: 128, stderr: `unexpected: ${command}` };
    return { status: answer.status ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
  };
  return { git, commands };
}

const BASE = "b".repeat(40);
const PULL = { pull_request: { base: { ref: "main" } } };

describe("compareBase", () => {
  const cases = [
    {
      case: "is the merge base with the branch the pull request merges into",
      payload: PULL,
      answers: { "merge-base origin/main HEAD": { stdout: `${BASE}\n` } },
      expected: BASE,
    },
    {
      case: "reports git's error when the merge base fails",
      payload: PULL,
      answers: { "merge-base origin/main HEAD": { status: 1, stderr: "no merge base\n" } },
      error: /^git merge-base failed with exit code 1: no merge base$/,
    },
    {
      case: "refuses an event that isn't a pull request",
      payload: { before: BASE },
      answers: {},
      error: /pull_request/,
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const { git } = fakeGit(row.answers);
      if (row.error === undefined) {
        assert.equal(compareBase(row.payload, git), row.expected);
      } else {
        assert.throws(() => compareBase(row.payload, git), { message: row.error });
      }
    });
  }
});

describe("changedFiles", () => {
  const cases = [
    {
      case: "lists the files the diff names, split on NUL",
      stdout: "a.md\0images/src/base/Dockerfile\0",
      expected: ["a.md", "images/src/base/Dockerfile"],
    },
    { case: "is empty when nothing changed", stdout: "", expected: [] },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const { git } = fakeGit({ [`diff --name-only --no-renames -z ${BASE} HEAD`]: { stdout: row.stdout } });
      assert.deepEqual(changedFiles(BASE, git), row.expected);
    });
  }
});

describe("isShared", () => {
  const cases = [
    { case: "matches a shared file exactly", file: "package.json", expected: true },
    { case: "matches a file under a shared folder", file: "tasks/images/build.ts", expected: true },
    { case: "matches the action's own files", file: ".github/actions/changed-images/main.js", expected: true },
    { case: "matches the actions' shared module", file: ".github/actions/lib.js", expected: true },
    {
      case: "matches the version review, which runs on every image",
      file: ".github/workflows/ci-version-review.yml",
      expected: true,
    },
    {
      case: "doesn't match the code review, which reviews only changed images",
      file: ".github/workflows/ci-code-review.yml",
      expected: false,
    },
    { case: "doesn't match the release workflow", file: ".github/workflows/release.yml", expected: false },
    { case: "doesn't match another action", file: ".github/actions/unreleased-images/main.js", expected: false },
    { case: "doesn't match an image's own file", file: "images/src/base/Dockerfile", expected: false },
    ...SHARED.map((shared) => ({ case: `names ${shared}, which exists`, file: shared, expected: true, exists: true })),
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(isShared(row.file), row.expected);
      if (row.exists) {
        assert.ok(existsSync(row.file), `${row.file} doesn't exist, so a rename has left SHARED behind`);
      }
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
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(changedImages(images, row.files), row.expected);
    });
  }
});

describe("changedActions", () => {
  const cases = [
    { case: "is true for a workflow", files: [".github/workflows/release.yml"], expected: true },
    { case: "is true for an action", files: [".github/actions/changed-images/main.js"], expected: true },
    { case: "is true for actionlint's settings", files: [".github/actionlint.yaml"], expected: true },
    { case: "is false for another file in .github", files: [".github/dependabot.yml"], expected: false },
    { case: "is false for an image's files", files: ["images/src/base/Dockerfile"], expected: false },
    { case: "is false when nothing changed", files: [], expected: false },
    ...ACTIONS.map((p) => ({ case: `names ${p}, which exists`, files: [p], expected: true, exists: p })),
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(changedActions(row.files), row.expected);
      if (row.exists) {
        assert.ok(existsSync(row.exists), `${row.exists} doesn't exist, so a rename has left ACTIONS behind`);
      }
    });
  }
});

describe("run", () => {
  const cases = [
    {
      case: "includes every image for a pull request that changes a shared workflow",
      diff: ".github/workflows/ci.yml\0",
      expected: { base: BASE, images: '["base","python"]', sources: "[]", actions: "true" },
    },
    {
      case: "includes only the base image for a pull request that changes only its README",
      diff: "images/src/base/README.md\0",
      expected: { base: BASE, images: '["base"]', sources: '["base"]', actions: "false" },
    },
  ];

  for (const row of cases) {
    it(row.case, (t) => {
      t.mock.method(console, "log", () => {});
      const dir = mkdtempSync(path.join(tmpdir(), "changed-images-run-"));
      folders.push(dir);
      writeFileSync(path.join(dir, "event.json"), JSON.stringify(PULL));
      writeFileSync(path.join(dir, "output"), "");
      for (const image of ["base", "python"]) {
        mkdirSync(path.join(dir, "src", image), { recursive: true });
        writeFileSync(path.join(dir, "src", image, "manifest.json"), "{}");
      }
      const { git } = fakeGit({
        "merge-base origin/main HEAD": { stdout: `${BASE}\n` },
        [`diff --name-only --no-renames -z ${BASE} HEAD`]: { stdout: row.diff },
      });

      run(
        { GITHUB_EVENT_PATH: path.join(dir, "event.json"), GITHUB_OUTPUT: path.join(dir, "output") },
        git,
        path.join(dir, "src"),
      );

      const outputs = Object.fromEntries(
        readFileSync(path.join(dir, "output"), "utf8")
          .trim()
          .split("\n")
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
      );
      assert.deepEqual(outputs, row.expected);
    });
  }
});
