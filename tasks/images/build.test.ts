/** Tests for build.ts. They render the repository's shared image template, so run them from its root. */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  type BuildClient,
  buildImage,
  buildImages,
  checkLabels,
  devcontainerBuild,
  renderDevcontainer,
  spawnRunner,
  tagImage,
} from "./build.ts";
import { DEVCONTAINERS_CLI, IMAGE_REPOSITORY } from "./config.ts";
import { ImageError } from "./errors.ts";
import { type ImageManifest, labels, parseManifest } from "./manifest.ts";

// Every field, including optional ones, so the tests cover each. Nothing checks this list, so keep it complete.
const MANIFEST = parseManifest({
  name: "Ubuntu",
  description: "Base image",
  version: "0.0.1",
  tags: ["base"],
  build_args: { BASE_IMAGE: "ubuntu:26.04", OTHER: 'quote "this"' },
});

// The build args the base template adds for the image's labels, for a release build of MANIFEST.
const LABEL_ARGS = {
  IMAGE_VERSION: "v0.0.1",
  IMAGE_TITLE: "Ubuntu",
  IMAGE_DESCRIPTION: "Base image",
  IMAGE_SOURCE: "https://github.com/froazin/devcontainers",
};

const folders: string[] = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new image folder called base, holding the manifest. */
function imageDir(manifest: unknown = MANIFEST): string {
  const parent = mkdtempSync(path.join(tmpdir(), "build-"));
  folders.push(parent);
  const dir = path.join(parent, "base");
  mkdirSync(dir);
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

/** Returns the image folder's rendered .devcontainer.json. */
function devcontainer(dir: string): any {
  return JSON.parse(readFileSync(path.join(dir, ".devcontainer.json"), "utf8"));
}

/** A fake Docker client, its image and the steps both record, in order. */
function fakeDocker(imageLabels: Record<string, string> | null, fail = false) {
  const steps: string[] = [];
  const client: BuildClient = {
    getImage(name) {
      steps.push(`getImage ${name}`);
      return {
        async inspect() {
          steps.push("inspect");
          if (fail) {
            throw new Error("(HTTP code 500) server error");
          }
          return { Config: { Labels: imageLabels } };
        },
        async tag({ repo, tag }) {
          steps.push(`tag ${repo} ${tag}`);
        },
      };
    },
  };
  return { client, steps };
}

/** A fake runner that records each command and whether the image folder's .devcontainer.json existed by then. */
function fakeRunner(steps: string[], dir?: string) {
  return async (command: string, args: readonly string[]) => {
    const rendered = dir === undefined || existsSync(path.join(dir, ".devcontainer.json"));
    steps.push(`run ${rendered ? "after" : "before"} render: ${[command, ...args].join(" ")}`);
  };
}

describe("renderDevcontainer", () => {
  const cases = [
    {
      case: "renders the shared image template to valid JSON",
      manifest: MANIFEST,
      release: true,
      check: (json: any) => {
        assert.equal(json.name, "Ubuntu");
        assert.deepEqual(json.build.args, { ...MANIFEST.build_args, ...LABEL_ARGS });
      },
    },
    {
      case: "renders the dev version for a dev build",
      manifest: MANIFEST,
      release: false,
      check: (json: any) => assert.equal(json.build.args.IMAGE_VERSION, "v0.0.1-dev"),
    },
    {
      case: "renders empty build args to valid JSON",
      manifest: { ...MANIFEST, build_args: {} },
      release: true,
      check: (json: any) => assert.deepEqual(json.build.args, LABEL_ARGS),
    },
    {
      case: "escapes quotes and a backslash in the name",
      manifest: { ...MANIFEST, name: 'Ubuntu "LTS" \\ test' },
      release: true,
      check: (json: any) => assert.equal(json.name, 'Ubuntu "LTS" \\ test'),
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const dir = imageDir();

      renderDevcontainer(dir, row.manifest as ImageManifest, row.release);

      row.check(devcontainer(dir));
    });
  }

  const failures = [
    { case: "leaves the last good file when the render fails", template: '{"name": {{json missing}} }' },
  ];

  for (const row of failures) {
    it(row.case, () => {
      const dir = imageDir();
      const template = path.join(path.dirname(dir), "template.hbs");
      writeFileSync(template, row.template);
      writeFileSync(path.join(dir, ".devcontainer.json"), "previous");

      assert.throws(() => renderDevcontainer(dir, MANIFEST, true, template));

      assert.equal(readFileSync(path.join(dir, ".devcontainer.json"), "utf8"), "previous");
    });
  }
});

describe("spawnRunner", () => {
  const cases = [
    { case: "resolves when the command succeeds", command: process.execPath, args: ["-e", ""] },
    {
      case: "rejects with the exit code when the command fails",
      command: process.execPath,
      args: ["-e", "process.exit(3)"],
      error: /failed with exit code 3\.$/,
    },
    { case: "rejects when the command can't run", command: "no-such-command-here", args: [], error: /^Can't run / },
  ];

  for (const row of cases) {
    it(row.case, async () => {
      if (row.error === undefined) {
        await spawnRunner(row.command, row.args);
      } else {
        await assert.rejects(spawnRunner(row.command, row.args), (error: unknown) => {
          assert.ok(error instanceof ImageError);
          assert.match(error.message, row.error);
          return true;
        });
      }
    });
  }
});

describe("devcontainerBuild", () => {
  const base = [
    DEVCONTAINERS_CLI,
    "build",
    "--workspace-folder=images/src/base",
    "--image-name=repo:base",
    "--no-lockfile",
  ];
  const cases = [
    { case: "runs the CLI with Node, flags and all", noCache: false, expected: base },
    { case: "adds --no-cache after the default flags", noCache: true, expected: [...base, "--no-cache"] },
  ];

  for (const row of cases) {
    it(row.case, async () => {
      const calls: [string, readonly string[]][] = [];

      await devcontainerBuild(
        async (command, args) => void calls.push([command, args]),
        "images/src/base",
        "repo:base",
        row.noCache,
      );

      assert.deepEqual(calls, [[process.execPath, row.expected]]);
    });
  }
});

describe("checkLabels", () => {
  const expected = labels(MANIFEST);
  const cases = [
    { case: "passes matching labels, with an extra one", actual: { ...expected, other: "label" } },
    { case: "rejects no labels", actual: null, error: /is missing, not "v0\.0\.1"/ },
    { case: "rejects empty labels", actual: {}, error: /is missing, not "v0\.0\.1"/ },
    {
      case: "rejects a wrong version",
      actual: { ...expected, "org.opencontainers.image.version": "0.0.0" },
      error: /version is "0\.0\.0", not "v0\.0\.1"\.$/,
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      if (row.error === undefined) {
        checkLabels(row.actual, "repo:base", expected);
      } else {
        assert.throws(
          () => checkLabels(row.actual, "repo:base", expected),
          (error: unknown) => {
            assert.ok(error instanceof ImageError);
            assert.match(error.message, /^Image repo:base has the wrong labels: org\.opencontainers\.image\.version/);
            assert.match(error.message, row.error);
            return true;
          },
        );
      }
    });
  }
});

describe("tagImage", () => {
  const cases = [
    {
      case: "adds each tag to the image repository, in order",
      tags: ["base", "base-v0"],
      expected: [`tag ${IMAGE_REPOSITORY} base`, `tag ${IMAGE_REPOSITORY} base-v0`],
    },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      t.mock.method(console, "log", () => {});
      const { client, steps } = fakeDocker(null);

      await tagImage(client.getImage("repo:base"), "repo:base", row.tags);

      assert.deepEqual(steps.slice(1), row.expected);
    });
  }
});

/** A row of the buildImage table. */
interface BuildImageCase {
  case: string;
  release: boolean;
  noCache: boolean;
  labels: Record<string, string> | null;
  expected: string[];
  version?: string;
  error?: RegExp | (new (...args: never[]) => Error);
  manifest?: unknown;
  /** The template to render, rather than the repository's. */
  template?: string;
}

describe("buildImage", () => {
  const releaseRef = `${IMAGE_REPOSITORY}:base`;
  const devRef = `${IMAGE_REPOSITORY}:base-dev`;
  const cli = (ref: string, noCache: boolean) =>
    `${process.execPath} ${DEVCONTAINERS_CLI} build --workspace-folder=DIR --image-name=${ref} --no-lockfile` +
    (noCache ? " --no-cache" : "");
  const cases: BuildImageCase[] = [
    {
      case: "renders, builds, checks the labels, then tags",
      release: true,
      noCache: true,
      labels: labels(MANIFEST, true),
      expected: [
        `run after render: ${cli(releaseRef, true)}`,
        `getImage ${releaseRef}`,
        "inspect",
        ...["base", "base-v0", "base-v0.0", "base-v0.0.1"].map((tag) => `tag ${IMAGE_REPOSITORY} ${tag}`),
      ],
      version: "v0.0.1",
    },
    {
      case: "builds a dev build with the dev name, tags and version",
      release: false,
      noCache: false,
      labels: labels(MANIFEST, false),
      expected: [
        `run after render: ${cli(devRef, false)}`,
        `getImage ${devRef}`,
        "inspect",
        ...["base-dev", "base-v0-dev", "base-v0.0-dev", "base-v0.0.1-dev"].map(
          (tag) => `tag ${IMAGE_REPOSITORY} ${tag}`,
        ),
      ],
      version: "v0.0.1-dev",
    },
    {
      case: "doesn't tag an image with the wrong labels",
      release: false,
      noCache: false,
      labels: labels(MANIFEST, true),
      expected: [`run after render: ${cli(devRef, false)}`, `getImage ${devRef}`, "inspect"],
      error: /has the wrong labels/,
    },
    ...[true, false].map((release) => ({
      case: `checks the version before building a ${release ? "release" : "dev build"}`,
      release,
      noCache: false,
      labels: null,
      manifest: { ...MANIFEST, version: "1.0" },
      // A missing template, so a check after rendering would fail with a different error.
      template: "no/such/template.hbs",
      expected: [],
      error: RangeError,
    })),
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      t.mock.method(console, "log", () => {});
      const dir = imageDir(row.manifest ?? MANIFEST);
      const { client, steps } = fakeDocker(row.labels);
      const run = fakeRunner(steps, dir);

      const built = buildImage(run, client, dir, {
        noCache: row.noCache,
        release: row.release,
        template: row.template,
      });
      if (row.error === undefined) {
        await built;
        assert.equal(devcontainer(dir).build.args.IMAGE_VERSION, row.version);
      } else {
        await assert.rejects(built, row.error);
      }

      assert.deepEqual(
        steps.map((step) => step.replace(`=${dir} `, "=DIR ")),
        row.expected,
      );
    });
  }
});

describe("buildImages", () => {
  const dirs = () => [imageDir(), imageDir()];
  const cases = [
    {
      case: "checks the manifests before building each image",
      check: () => {},
      expectedRuns: 2,
      checkedFirst: true,
    },
    {
      case: "stops before building when a check fails",
      check: () => {
        throw new ImageError("The image manifest checks failed:");
      },
      expectedRuns: 0,
      error: /^The image manifest checks failed:$/,
    },
    {
      case: "explains a failed Docker API call",
      check: () => {},
      fail: true,
      expectedRuns: 1,
      error: /^The Docker API call failed: \(HTTP code 500\) server error\. .*docker info/,
    },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      t.mock.method(console, "log", () => {});
      const { client, steps } = fakeDocker(labels(MANIFEST, false), row.fail);
      const check = () => {
        steps.push("check");
        row.check();
      };

      const built = buildImages(fakeRunner(steps), client, dirs(), { release: false }, check);
      if (row.error === undefined) {
        await built;
      } else {
        await assert.rejects(built, (error: unknown) => {
          assert.ok(error instanceof ImageError);
          assert.match(error.message, row.error);
          return true;
        });
      }

      assert.equal(steps[0], "check");
      assert.equal(steps.filter((step) => step.startsWith("run ")).length, row.expectedRuns);
    });
  }
});
