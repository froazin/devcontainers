/** Tests for main.js. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  assertFullClone,
  classify,
  compareVersions,
  manifestVersion,
  parseVersion,
  releasedVersions,
  run,
} from "./main.js";

const folders = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new temporary folder. */
function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), "unreleased-images-"));
  folders.push(dir);
  return dir;
}

/**
 * Returns a new source folder with a manifest.json for each image, holding its version.
 *
 * @param {Record<string, unknown>} versions
 */
function srcFolder(versions) {
  const dir = tmp();
  for (const [image, version] of Object.entries(versions)) {
    mkdirSync(path.join(dir, image));
    writeFileSync(path.join(dir, image, "manifest.json"), JSON.stringify({ version }));
  }
  return dir;
}

/**
 * Returns a fake git that answers each command from the table.
 *
 * @param {Record<string, { status?: number, stdout?: string, stderr?: string }>} answers - Keyed by the command line.
 */
function fakeGit(answers) {
  /** @type {import("../lib.js").Git} */
  return (args) => {
    const answer = answers[args.join(" ")] ?? { status: 128, stderr: `unexpected: ${args.join(" ")}` };
    return { status: answer.status ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
  };
}

describe("parseVersion", () => {
  const cases = [
    { case: "reads MAJOR.MINOR.PATCH", version: "1.20.3", expected: [1, 20, 3] },
    { case: "rejects a leading zero", version: "01.2.3", expected: null },
    { case: "rejects two parts", version: "1.2", expected: null },
    { case: "rejects a pre-release", version: "1.2.3-rc.1", expected: null },
    { case: "rejects a v prefix", version: "v1.2.3", expected: null },
    { case: "rejects an empty string", version: "", expected: null },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(parseVersion(row.version), row.expected);
    });
  }
});

describe("compareVersions", () => {
  const cases = [
    { case: "compares as numbers, not text", a: "1.10.0", b: "1.9.0", expected: 1 },
    { case: "is 0 for equal versions", a: "0.0.1", b: "0.0.1", expected: 0 },
    { case: "lets the major version outrank the rest", a: "1.99.99", b: "2.0.0", expected: -1 },
    { case: "compares patch versions as numbers", a: "0.0.10", b: "0.0.9", expected: 1 },
    { case: "throws for a version it can't read", a: "1.2", b: "1.2.0", error: /Can't compare/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      if (row.error === undefined) {
        assert.equal(compareVersions(row.a, row.b), row.expected);
      } else {
        assert.throws(() => compareVersions(row.a, row.b), { message: row.error });
      }
    });
  }
});

describe("assertFullClone", () => {
  const cases = [
    { case: "passes a full clone", answer: { stdout: "false\n" } },
    { case: "fails a shallow clone, which has no tags", answer: { stdout: "true\n" }, error: /fetch-depth 0/ },
    {
      case: "fails when git fails",
      answer: { status: 128, stderr: "not a git repository" },
      error: /not a git repository/,
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const git = fakeGit({ "rev-parse --is-shallow-repository": row.answer });
      if (row.error === undefined) {
        assert.doesNotThrow(() => assertFullClone(git));
      } else {
        assert.throws(() => assertFullClone(git), { message: row.error });
      }
    });
  }
});

describe("releasedVersions", () => {
  const cases = [
    {
      case: "reads each release tag's version",
      image: "base",
      tags: "base-v0.0.1\nbase-v0.0.2\n",
      expected: ["0.0.1", "0.0.2"],
    },
    {
      case: "skips a tag of an image whose name starts with this one's",
      image: "base",
      tags: "base-v2-v0.0.1\nbase-v0.0.1\n",
      expected: ["0.0.1"],
    },
    {
      case: "skips a tag that isn't MAJOR.MINOR.PATCH",
      image: "base",
      tags: "base-v1.2\nbase-v1.2.3-rc1\n",
      expected: [],
    },
    { case: "is empty with no tags", image: "base", tags: "", expected: [] },
    { case: "throws when git fails", image: "base", status: 128, error: /git tag failed/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const git = fakeGit({
        [`tag --list ${row.image}-v*`]: { status: row.status ?? 0, stdout: row.tags ?? "", stderr: "fatal" },
      });
      if (row.error === undefined) {
        assert.deepEqual(releasedVersions(row.image, git), row.expected);
      } else {
        assert.throws(() => releasedVersions(row.image, git), { message: row.error });
      }
    });
  }
});

describe("manifestVersion", () => {
  const cases = [
    { case: "reads the manifest's version", version: "0.1.0", expected: "0.1.0" },
    { case: "throws for a missing version", version: undefined, error: /no MAJOR.MINOR.PATCH version/ },
    {
      case: "throws for a version that isn't MAJOR.MINOR.PATCH",
      version: "1.2",
      error: /no MAJOR.MINOR.PATCH version/,
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const dir = srcFolder({ base: row.version });
      if (row.error === undefined) {
        assert.equal(manifestVersion("base", dir), row.expected);
      } else {
        assert.throws(() => manifestVersion("base", dir), { message: row.error });
      }
    });
  }
});

describe("classify", () => {
  const cases = [
    { case: "is unreleased with no tags", version: "0.0.1", released: [], expected: "unreleased" },
    {
      case: "is unreleased when newer than every tag",
      version: "0.0.3",
      released: ["0.0.1", "0.0.2"],
      expected: "unreleased",
    },
    { case: "compares as numbers", version: "1.10.0", released: ["1.9.0"], expected: "unreleased" },
    {
      case: "is released when it's the newest tag",
      version: "0.0.2",
      released: ["0.0.1", "0.0.2"],
      expected: "released",
    },
    { case: "is behind when a newer tag skips it", version: "0.0.2", released: ["0.0.1", "0.0.3"], expected: "behind" },
    {
      case: "is behind after a revert to an older release",
      version: "0.0.2",
      released: ["0.0.2", "0.0.3"],
      expected: "behind",
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(classify(row.version, row.released), row.expected);
    });
  }
});

describe("run", () => {
  const cases = [
    {
      case: "releases the new versions, sorted, and skips released and behind ones",
      versions: { zeta: "0.0.1", base: "0.0.2", python: "0.0.1", node: "0.0.1" },
      tags: { base: "base-v0.0.1\n", python: "python-v0.0.1\n", node: "node-v0.0.2\n", zeta: "" },
      expected:
        '[{"image":"base","version":"0.0.2","tag":"base-v0.0.2"},{"image":"zeta","version":"0.0.1","tag":"zeta-v0.0.1"}]',
      warning: /node 0\.0\.1 is behind its newest release, 0\.0\.2/,
    },
    {
      case: "releases nothing when every version is released",
      versions: { base: "0.0.1" },
      tags: { base: "base-v0.0.1\n" },
      expected: "[]",
    },
    {
      case: "fails on a shallow clone before it reads any tag",
      versions: { base: "0.0.1" },
      tags: { base: "" },
      shallow: true,
      error: /fetch-depth 0/,
    },
  ];

  for (const row of cases) {
    it(row.case, (t) => {
      const log = t.mock.method(console, "log", () => {});
      const src = srcFolder(row.versions);
      const output = path.join(tmp(), "output");
      writeFileSync(output, "");
      const git = fakeGit({
        "rev-parse --is-shallow-repository": { stdout: row.shallow ? "true\n" : "false\n" },
        ...Object.fromEntries(
          Object.entries(row.tags).map(([image, tags]) => [`tag --list ${image}-v*`, { stdout: tags }]),
        ),
      });

      if (row.error === undefined) {
        run({ GITHUB_OUTPUT: output }, git, src);
        assert.equal(readFileSync(output, "utf8"), `releases=${row.expected}\n`);
      } else {
        assert.throws(() => run({ GITHUB_OUTPUT: output }, git, src), { message: row.error });
        assert.equal(readFileSync(output, "utf8"), "");
      }
      if (row.warning !== undefined) {
        assert.ok(
          log.mock.calls.some((call) => /^::warning /.test(call.arguments[0]) && row.warning.test(call.arguments[0])),
        );
      }
    });
  }
});
