/** Tests for testing.ts. */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { isDeepStrictEqual } from "node:util";

import type { Runner } from "./build.ts";
import { DEVCONTAINERS_CLI, IMAGE_REPOSITORY, IMAGE_TEST_LABEL } from "./config.ts";
import { ImageError } from "./errors.ts";
import {
  cliArgs,
  removeTestContainers,
  runImageTest,
  runImageTests,
  runInDevcontainer,
  type TestClient,
  type TestConfig,
  testConfig,
} from "./testing.ts";

/** How a fake Docker client behaves. */
interface FakeDockerOptions {
  /** The status code inspecting an image fails with, such as 404 for an image that isn't built. */
  inspectStatus?: number;
  /** The ids of the containers that have the run's label. */
  containers?: string[];
}

/** A fake Docker client and the steps it records, in order. */
function fakeDocker({ inspectStatus, containers = [] }: FakeDockerOptions = {}) {
  const steps: string[] = [];
  const client: TestClient = {
    getImage(name) {
      return {
        async inspect() {
          steps.push(`inspect ${name}`);
          if (inspectStatus !== undefined) {
            throw Object.assign(new Error(`(HTTP code ${inspectStatus})`), { statusCode: inspectStatus });
          }
          return {};
        },
      };
    },
    async listContainers(options) {
      steps.push(`list ${options.filters.label.join(" ")}`);
      return containers.map((Id) => ({ Id }));
    },
    getContainer(id) {
      return {
        async remove(options) {
          steps.push(`remove ${id} force=${options.force}`);
        },
      };
    },
  };
  return { client, steps };
}

/** How a fake runner behaves for each CLI command. */
type FakeBehaviour = "passes" | "fails" | "crashes" | "interrupted";

/** A fake runner for the CLI, the commands it ran and the config file each one was given. */
function fakeRunner(behaviours: Partial<Record<"up" | "exec", FakeBehaviour>> = {}) {
  const commands: string[] = [];
  const configs: unknown[] = [];
  const run: Runner = async (command, args) => {
    assert.equal(command, process.execPath);
    assert.equal(args[0], DEVCONTAINERS_CLI);
    const name = args[1] as "up" | "exec";
    commands.push(args.slice(1).join(" "));
    const config = args.find((arg) => arg.startsWith("--config="))?.slice("--config=".length);
    configs.push(config === undefined ? undefined : JSON.parse(readFileSync(config, "utf8")));
    switch (behaviours[name] ?? "passes") {
      case "passes":
        return;
      case "fails":
        throw new ImageError(`${name} failed with exit code 1.`);
      case "crashes":
        throw new TypeError("a bug");
      case "interrupted":
        process.emit("SIGINT");
        throw new ImageError(`${name} failed on SIGINT.`);
    }
  };
  return { run, commands, configs };
}

const folders: string[] = [];
after(() => {
  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** Returns a new test folder with a test.sh for each named image. */
function testFolder(names: readonly string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "testing-"));
  folders.push(dir);
  for (const name of names) {
    mkdirSync(path.join(dir, name));
    writeFileSync(path.join(dir, name, "test.sh"), "");
  }
  return dir;
}

describe("testConfig", () => {
  const cases = [
    { case: "mounts the image's test project and the shared helpers read-only", folder: "images/test" },
    { case: "uses the given test folder", folder: "other/tests" },
    { case: "rejects a path with a comma, which would break the mount", folder: "a,b", error: /holds a comma/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      if (row.error !== undefined) {
        assert.throws(() => testConfig("repo:base-dev", "base", row.folder), {
          name: "ImageError",
          message: row.error,
        });
        return;
      }
      assert.deepEqual(testConfig("repo:base-dev", "base", row.folder), {
        image: "repo:base-dev",
        workspaceFolder: "/test-project",
        workspaceMount: `type=bind,source=${path.resolve(row.folder, "base")},target=/test-project,readonly`,
        mounts: [
          `type=bind,source=${path.resolve(row.folder, "test_utils.sh")},target=/test-utils/test_utils.sh,readonly`,
        ],
        remoteEnv: { TEST_UTILS: "/test-utils/test_utils.sh" },
      });
    });
  }
});

describe("cliArgs", () => {
  const cases = [
    { case: "finds the container for up by the config and the run's label", command: "up" as const },
    { case: "finds the same container for exec", command: "exec" as const },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(cliArgs(row.command, "/w", "/c.json", "run-1"), [
        DEVCONTAINERS_CLI,
        row.command,
        "--workspace-folder=/w",
        "--config=/c.json",
        `--id-label=${IMAGE_TEST_LABEL}=run-1`,
      ]);
    });
  }
});

describe("removeTestContainers", () => {
  const cases = [
    { case: "removes every container with the run's label", containers: ["a", "b"] },
    { case: "does nothing when no container was created", containers: [] },
  ];

  for (const row of cases) {
    it(row.case, async () => {
      const { client, steps } = fakeDocker({ containers: row.containers });

      await removeTestContainers(client, "run-1");

      assert.deepEqual(steps, [
        `list ${IMAGE_TEST_LABEL}=run-1`,
        ...row.containers.map((id) => `remove ${id} force=true`),
      ]);
    });
  }
});

/** A row of the runInDevcontainer table. */
interface RunInDevcontainerCase {
  case: string;
  behaviours: Partial<Record<"up" | "exec", FakeBehaviour>>;
  expected?: boolean;
  error?: RegExp;
  commands: string[];
  log?: string;
}

describe("runInDevcontainer", () => {
  const CONFIG: TestConfig = testConfig("repo:base-dev", "base", "images/test");
  const up = cliArgs("up", "/w", "CONFIG", "run-1").slice(1).join(" ");
  const exec = `${cliArgs("exec", "/w", "CONFIG", "run-1").slice(1).join(" ")} /bin/sh /test-project/test.sh`;
  const cases: RunInDevcontainerCase[] = [
    { case: "passes when test.sh exits 0", behaviours: {}, expected: true, commands: [up, exec] },
    {
      case: "fails when test.sh exits non-zero",
      behaviours: { exec: "fails" },
      expected: false,
      commands: [up, exec],
      log: "exec failed with exit code 1.",
    },
    {
      case: "fails without running test.sh when the container doesn't come up",
      behaviours: { up: "fails" },
      expected: false,
      commands: [up],
      log: "up failed with exit code 1.",
    },
    {
      case: "removes the container after Ctrl+C",
      behaviours: { exec: "interrupted" },
      error: /^The image tests were interrupted\.$/,
      commands: [up, exec],
    },
    {
      case: "removes the container after a bug, and rethrows it",
      behaviours: { exec: "crashes" },
      error: /^a bug$/,
      commands: [up, exec],
    },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      const log = t.mock.method(console, "log", () => {});
      const { client, steps } = fakeDocker({ containers: ["c1"] });
      const { run, commands, configs } = fakeRunner(row.behaviours);
      const listeners = process.listenerCount("SIGINT");

      const ran = runInDevcontainer(client, run, CONFIG, "/w", "run-1");
      if (row.error === undefined) {
        assert.equal(await ran, row.expected);
      } else {
        await assert.rejects(ran, { message: row.error });
      }

      const config = commands[0]?.match(/--config=(\S+)/)?.[1] ?? "";
      assert.deepEqual(
        commands.map((command) => command.replace(config, "CONFIG")),
        row.commands,
      );
      assert.ok(configs.every((written) => isDeepStrictEqual(written, CONFIG)));
      assert.ok(!existsSync(config), "the temporary config is removed");
      assert.deepEqual(steps, [`list ${IMAGE_TEST_LABEL}=run-1`, "remove c1 force=true"]);
      // The Ctrl+C handler must go, or a later Ctrl+C would be swallowed.
      assert.equal(process.listenerCount("SIGINT"), listeners);
      if (row.log !== undefined) {
        assert.deepEqual(log.mock.calls.at(-1)?.arguments, [row.log]);
      }
    });
  }
});

describe("runImageTest", () => {
  const dev = `${IMAGE_REPOSITORY}:base-dev`;
  const release = `${IMAGE_REPOSITORY}:base`;
  const cases = [
    {
      case: "fails with the dev build command when the dev build isn't built",
      release: false,
      inspectStatus: 404,
      expected: false,
      image: dev,
      log: `Image ${dev} not found. Build it first with \`npm run tasks -- build images\`.`,
    },
    {
      case: "fails with the release build command when the release isn't built",
      release: true,
      inspectStatus: 404,
      expected: false,
      image: release,
      log: `Image ${release} not found. Build it first with \`npm run tasks -- build images --is-release\`.`,
    },
    { case: "brings up the dev build and passes", release: false, expected: true, image: dev },
    { case: "fails when test.sh fails", release: false, exec: "fails" as const, expected: false, image: dev },
    { case: "brings up the release build of a release", release: true, expected: true, image: release },
    {
      case: "explains a Docker API failure other than a missing image",
      release: false,
      inspectStatus: 500,
      image: dev,
      error: /^The Docker API call failed: \(HTTP code 500\)\./,
    },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      const log = t.mock.method(console, "log", () => {});
      const { client, steps } = fakeDocker({ inspectStatus: row.inspectStatus });
      const { run, commands, configs } = fakeRunner({ exec: row.exec });

      const tested = runImageTest(client, run, "base", "other/tests", { release: row.release });
      if (row.error === undefined) {
        assert.equal(await tested, row.expected);
      } else {
        await assert.rejects(tested, { name: "ImageError", message: row.error });
      }

      assert.equal(steps[0], `inspect ${row.image}`);
      if (row.inspectStatus === undefined) {
        assert.deepEqual(configs[0], testConfig(row.image, "base", "other/tests"));
        assert.match(commands[0] ?? "", new RegExp(`^up --workspace-folder=${path.resolve("other/tests", "base")} `));
      } else {
        assert.deepEqual(commands, []);
      }
      if (row.log !== undefined) {
        assert.deepEqual(log.mock.calls.at(-1)?.arguments, [row.log]);
      }
    });
  }
});

describe("runImageTests", () => {
  const apiError = new ImageError("The Docker API call failed: GET failed. Check that Docker is running.");
  const cases = [
    {
      case: "skips images without a test.sh and names only the failures",
      scripts: ["fails", "passes"],
      images: ["fails", "no-tests", "passes"],
      results: { fails: false, passes: true } as Record<string, boolean | Error>,
      tested: ["fails", "passes"],
      error: /^Image tests failed: fails$/,
      log: /Skipping no-tests: .*test\.sh not found\./,
    },
    {
      case: "still names an earlier failure when a Docker API call fails",
      scripts: ["fails", "unreachable"],
      images: ["fails", "unreachable"],
      results: { fails: false, unreachable: apiError } as Record<string, boolean | Error>,
      tested: ["fails", "unreachable"],
      error: /^The Docker API call failed: GET failed\..* Image tests had already failed: fails$/,
    },
    {
      case: "passes when every image passes",
      scripts: ["base"],
      images: ["base"],
      results: { base: true } as Record<string, boolean | Error>,
      tested: ["base"],
    },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      const log = t.mock.method(console, "log", () => {});
      const folder = testFolder(row.scripts);
      const { client } = fakeDocker();
      const { run } = fakeRunner();
      const tested: string[] = [];
      const runTest: typeof runImageTest = async (docker, runArg, name, folderArg, options) => {
        assert.equal(docker, client);
        assert.equal(runArg, run);
        assert.equal(folderArg, folder);
        assert.deepEqual(options, { release: true });
        tested.push(name);
        const result = row.results[name];
        if (result instanceof Error) {
          throw result;
        }
        return result === true;
      };

      const ran = runImageTests(
        client,
        run,
        row.images.map((name) => `images/src/${name}`),
        folder,
        { release: true },
        runTest,
      );
      if (row.error === undefined) {
        await ran;
      } else {
        await assert.rejects(ran, (error: unknown) => {
          assert.ok(error instanceof ImageError);
          assert.match(error.message, row.error);
          return true;
        });
      }

      assert.deepEqual(tested, row.tested);
      if (row.log !== undefined) {
        assert.ok(log.mock.calls.some((call) => row.log.test(String(call.arguments[0]))));
      }
    });
  }
});
