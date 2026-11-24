/** Tests for testing.ts. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { after, describe, it } from "node:test";

import { IMAGE_REPOSITORY, IMAGE_TEST_MOUNT } from "./config.ts";
import { ImageError } from "./errors.ts";
import {
  projectMount,
  runContainer,
  runImageTest,
  runImageTests,
  type TestClient,
  type TestContainer,
  type TestContainerOptions,
} from "./testing.ts";

/** How a fake container behaves. */
interface FakeContainerOptions {
  output?: string[];
  exitCode?: number;
  /** Never finish streaming, as a long test would. */
  hang?: boolean;
  startError?: Error;
}

/** A fake container and the steps it records, in order. */
function fakeContainer({ output = [], exitCode = 0, hang = false, startError }: FakeContainerOptions = {}) {
  const steps: string[] = [];
  const container: TestContainer = {
    async start() {
      steps.push("start");
      if (startError !== undefined) {
        throw startError;
      }
    },
    async logs() {
      steps.push("logs");
      if (hang) {
        return new Promise<never>(() => {});
      }
      const stream = new PassThrough();
      for (const chunk of output) {
        stream.write(chunk);
      }
      stream.end();
      return stream;
    },
    async wait() {
      steps.push("wait");
      return { StatusCode: exitCode };
    },
    async remove(options) {
      steps.push(`remove force=${options.force}`);
    },
  };
  return { container, steps };
}

/** How a fake Docker client behaves. */
interface FakeDockerOptions {
  /** The status code inspecting an image fails with, such as 404 for an image that isn't built. */
  inspectStatus?: number;
  container?: TestContainer;
  /** Hold back createContainer until this resolves, as a slow Docker would. */
  created?: Promise<void>;
  /** Fail createContainer with this error. */
  createError?: Error;
}

/** A fake Docker client, what it was asked for and the output it demultiplexed. */
function fakeDocker({
  inspectStatus,
  container = fakeContainer().container,
  created: release,
  createError,
}: FakeDockerOptions = {}) {
  const inspected: string[] = [];
  const created: TestContainerOptions[] = [];
  const output: string[] = [];
  const client: TestClient = {
    getImage(name) {
      return {
        async inspect() {
          inspected.push(name);
          if (inspectStatus !== undefined) {
            throw Object.assign(new Error(`(HTTP code ${inspectStatus})`), { statusCode: inspectStatus });
          }
          return {};
        },
      };
    },
    async createContainer(options) {
      created.push(options);
      await release;
      if (createError !== undefined) {
        throw createError;
      }
      return container;
    },
    modem: {
      demuxStream(stream) {
        stream.on("data", (chunk: Buffer) => output.push(chunk.toString()));
      },
    },
  };
  return { client, inspected, created, output };
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

describe("projectMount", () => {
  const cases = [
    { case: "is a read-only bind of the image's test project", folder: "images/test" },
    { case: "uses the given test folder", folder: "other/tests" },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.deepEqual(projectMount("base", row.folder), {
        Type: "bind",
        Source: path.resolve(row.folder, "base"),
        Target: IMAGE_TEST_MOUNT,
        ReadOnly: true,
      });
    });
  }
});

/** A row of the runContainer table. */
interface RunContainerCase {
  case: string;
  container: FakeContainerOptions;
  createError?: Error;
  /** When to send Ctrl+C: while the container is created, or once its logs begin. */
  interrupt?: "creating" | "running";
  expected?: number;
  output?: string[];
  error?: RegExp;
  steps: string[];
}

const OPTIONS: TestContainerOptions = {
  Image: "repo:base-dev",
  Cmd: ["/bin/sh", "/test-project/test.sh"],
  WorkingDir: "/test-project",
  StopTimeout: 0,
  HostConfig: { Mounts: [] },
};

describe("runContainer", () => {
  const cases: RunContainerCase[] = [
    {
      case: "streams the output and returns the exit code, then removes the container",
      container: { output: ["one\n", "two\n"], exitCode: 3 },
      expected: 3,
      output: ["one\n", "two\n"],
      steps: ["start", "logs", "wait", "remove force=true"],
    },
    {
      case: "removes the container when it fails to start",
      container: { startError: new Error("no such file") },
      error: /^The Docker API call failed: no such file\./,
      steps: ["start", "remove force=true"],
    },
    {
      case: "removes the container after Ctrl+C",
      container: { hang: true },
      interrupt: "running",
      error: /^The image tests were interrupted\.$/,
      steps: ["start", "logs", "remove force=true"],
    },
    {
      case: "removes a container whose creation Ctrl+C interrupts, once it's created",
      container: {},
      interrupt: "creating",
      error: /^The image tests were interrupted\.$/,
      steps: ["remove force=true"],
    },
    {
      case: "has nothing to remove when the container can't be created",
      container: {},
      createError: new Error("no such image"),
      error: /^The Docker API call failed: no such image\./,
      steps: [],
    },
  ];

  for (const row of cases) {
    it(row.case, async () => {
      const { container, steps } = fakeContainer(row.container);
      let finishCreating = () => {};
      const created = new Promise<void>((resolve) => {
        finishCreating = resolve;
      });
      const { client, output } = fakeDocker({ container, created, createError: row.createError });
      const listeners = process.listenerCount("SIGINT");

      const ran = runContainer(client, OPTIONS);
      if (row.interrupt === "creating") {
        process.emit("SIGINT");
      }
      finishCreating();
      if (row.interrupt === "running") {
        // Let the container start and its logs begin before the interrupt.
        await new Promise((resolve) => setImmediate(resolve));
        process.emit("SIGINT");
      }

      const expectedError = row.error;
      if (expectedError === undefined) {
        assert.equal(await ran, row.expected);
        assert.deepEqual(output, row.output);
      } else {
        await assert.rejects(ran, (error: unknown) => {
          assert.ok(error instanceof ImageError);
          assert.match(error.message, expectedError);
          return true;
        });
      }

      assert.deepEqual(steps, row.steps);
      // The Ctrl+C handler must go, or a later Ctrl+C would be swallowed.
      assert.equal(process.listenerCount("SIGINT"), listeners);
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
      inspected: [dev],
      log: `Image ${dev} not found. Build it first with \`npm run tasks -- build images\`.`,
    },
    {
      case: "fails with the release build command when the release isn't built",
      release: true,
      inspectStatus: 404,
      expected: false,
      inspected: [release],
      log: `Image ${release} not found. Build it first with \`npm run tasks -- build images --is-release\`.`,
    },
    {
      case: "passes the dev build when test.sh exits 0",
      release: false,
      exitCode: 0,
      expected: true,
      inspected: [dev],
    },
    { case: "fails when test.sh exits non-zero", release: false, exitCode: 1, expected: false, inspected: [dev] },
    { case: "tests the release build of a release", release: true, exitCode: 0, expected: true, inspected: [release] },
    {
      case: "explains a Docker API failure other than a missing image",
      release: false,
      inspectStatus: 500,
      inspected: [dev],
      error: /^The Docker API call failed: \(HTTP code 500\)\./,
    },
  ];

  for (const row of cases) {
    it(row.case, async (t) => {
      const log = t.mock.method(console, "log", () => {});
      const { container } = fakeContainer({ exitCode: row.exitCode ?? 0 });
      const { client, inspected, created } = fakeDocker({ inspectStatus: row.inspectStatus, container });

      const tested = runImageTest(client, "base", "other/tests", { release: row.release });
      if (row.error === undefined) {
        assert.equal(await tested, row.expected);
      } else {
        await assert.rejects(tested, { name: "ImageError", message: row.error });
      }

      assert.deepEqual(inspected, row.inspected);
      if (row.inspectStatus === undefined) {
        assert.deepEqual(created, [
          {
            Image: row.inspected[0],
            Cmd: ["/bin/sh", `${IMAGE_TEST_MOUNT}/test.sh`],
            WorkingDir: IMAGE_TEST_MOUNT,
            StopTimeout: 0,
            HostConfig: { Mounts: [projectMount("base", "other/tests")] },
          },
        ]);
      } else {
        assert.deepEqual(created, []);
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
      const tested: string[] = [];
      const runTest: typeof runImageTest = async (docker, name, folderArg, options) => {
        assert.equal(docker, client);
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
