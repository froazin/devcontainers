/** Runs each image's test project inside the built image, through the Docker API. */

import { existsSync } from "node:fs";
import path from "node:path";

import { IMAGE_TEST_MOUNT, IMAGE_TEST_SCRIPT, IMAGES_TEST_FOLDER, imageName } from "./config.ts";
import { dockerApiError, dockerCall, ImageError, isDockerStatus } from "./errors.ts";

/** A bind mount in the Docker API's container create options. */
export interface BindMount {
  Type: "bind";
  Source: string;
  Target: string;
  ReadOnly: boolean;
}

/** The container create options the tests use. */
export interface TestContainerOptions {
  Image: string;
  Cmd: string[];
  WorkingDir: string;
  StopTimeout: number;
  HostConfig: { Mounts: BindMount[] };
}

/** The part of a Docker API container that the tests use, which dockerode's Container provides. */
export interface TestContainer {
  start(): Promise<unknown>;
  logs(options: { follow: true; stdout: true; stderr: true }): Promise<NodeJS.ReadableStream>;
  wait(): Promise<{ StatusCode: number }>;
  remove(options: { force: boolean }): Promise<unknown>;
}

/** The part of a Docker API client that the tests use, which a dockerode instance provides. */
export interface TestClient {
  getImage(name: string): { inspect(): Promise<unknown> };
  createContainer(options: TestContainerOptions): Promise<TestContainer>;
  modem: {
    demuxStream(stream: NodeJS.ReadableStream, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): void;
  };
}

/** Options for testing images. */
export interface TestOptions {
  /** Test the release build, rather than the dev build. */
  readonly release?: boolean;
}

/** Returns a read-only bind mount of the image's test folder. */
export function projectMount(name: string, testFolder: string = IMAGES_TEST_FOLDER): BindMount {
  return { Type: "bind", Source: path.resolve(testFolder, name), Target: IMAGE_TEST_MOUNT, ReadOnly: true };
}

/** Returns whether the image exists, throwing an ImageError if the Docker API call fails. */
async function imageExists(docker: TestClient, ref: string): Promise<boolean> {
  try {
    await docker.getImage(ref).inspect();
    return true;
  } catch (error) {
    if (isDockerStatus(error, 404)) {
      return false;
    }
    throw dockerApiError(error);
  }
}

/**
 * Creates the container and runs it to the end, streaming its output. It always removes the container, even after
 * a Ctrl+C that comes while the container is still being created.
 *
 * @returns The container's exit code.
 */
export async function runContainer(docker: TestClient, options: TestContainerOptions): Promise<number> {
  const interruption = new ImageError("The image tests were interrupted.");
  let wasInterrupted = false;
  let onInterrupt = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onInterrupt = () => {
      wasInterrupted = true;
      reject(interruption);
    };
  });
  // Listen before creating, so no Ctrl+C can stop the task between creating the container and removing it.
  // once, so a second Ctrl+C while the container is removed still stops the task at once.
  process.once("SIGINT", onInterrupt);
  const creating = dockerCall(() => docker.createContainer(options));
  // A container created after a Ctrl+C is only removed, never started.
  const streaming = creating.then((container) =>
    wasInterrupted ? Promise.reject(interruption) : streamContainer(docker, container),
  );

  try {
    return await Promise.race([interrupted, streaming]);
  } finally {
    process.off("SIGINT", onInterrupt);
    // After a Ctrl+C, the container can still be on its way, so wait for it before removing it.
    const container = await creating.catch(() => undefined);
    if (container !== undefined) {
      await dockerCall(() => container.remove({ force: true }));
    }
  }
}

/** Starts the container, copies its output to the task's stdout and stderr, and returns its exit code. */
async function streamContainer(docker: TestClient, container: TestContainer): Promise<number> {
  await dockerCall(() => container.start());
  const logs = await dockerCall(() => container.logs({ follow: true, stdout: true, stderr: true }));
  const ended = new Promise<void>((resolve, reject) => {
    logs.on("end", resolve);
    logs.on("error", reject);
  });
  docker.modem.demuxStream(logs, process.stdout, process.stderr);

  const { StatusCode } = await dockerCall(() => container.wait());
  await ended;
  return StatusCode;
}

/** Runs the image's test.sh in a container of its build, and returns whether it passed. */
export async function runImageTest(
  docker: TestClient,
  name: string,
  testFolder: string = IMAGES_TEST_FOLDER,
  { release = false }: TestOptions = {},
): Promise<boolean> {
  const image = imageName(name, release);
  if (!(await imageExists(docker, image))) {
    const command = release ? "npm run tasks -- build images --is-release" : "npm run tasks -- build images";
    console.log(`Image ${image} not found. Build it first with \`${command}\`.`);
    return false;
  }

  console.log(`Testing image ${image}...`);
  const exitCode = await runContainer(docker, {
    Image: image,
    Cmd: ["/bin/sh", `${IMAGE_TEST_MOUNT}/${IMAGE_TEST_SCRIPT}`],
    WorkingDir: IMAGE_TEST_MOUNT,
    // sh runs as PID 1 and ignores SIGTERM, so don't wait for it to stop.
    StopTimeout: 0,
    HostConfig: { Mounts: [projectMount(name, testFolder)] },
  });
  return exitCode === 0;
}

/**
 * Tests each image, then throws an ImageError naming any that failed.
 *
 * @param runTest - Tests one image. The tests replace it.
 */
export async function runImageTests(
  docker: TestClient,
  imageDirs: readonly string[],
  testFolder: string = IMAGES_TEST_FOLDER,
  { release = false }: TestOptions = {},
  runTest: typeof runImageTest = runImageTest,
): Promise<void> {
  const failed: string[] = [];
  try {
    for (const imageDir of imageDirs) {
      const name = path.basename(imageDir);
      const script = path.join(testFolder, name, IMAGE_TEST_SCRIPT);

      if (!existsSync(script)) {
        console.log(`Skipping ${name}: ${script} not found.`);
        continue;
      }

      if (!(await runTest(docker, name, testFolder, { release }))) {
        failed.push(name);
      }
    }
  } catch (error) {
    if (failed.length > 0 && error instanceof ImageError) {
      throw new ImageError(`${error.message} Image tests had already failed: ${failed.join(", ")}`, { cause: error });
    }
    throw error;
  }

  if (failed.length > 0) {
    throw new ImageError(`Image tests failed: ${failed.join(", ")}`);
  }
}
