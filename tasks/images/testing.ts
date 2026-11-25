/** Runs each image's test project inside a dev container of the built image, through the Dev Containers CLI. */

import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Runner } from "./build.ts";
import {
  DEVCONTAINERS_CLI,
  IMAGE_TEST_LABEL,
  IMAGE_TEST_MOUNT,
  IMAGE_TEST_SCRIPT,
  IMAGE_TEST_UTILS_ENV,
  IMAGE_TEST_UTILS_FILE,
  IMAGE_TEST_UTILS_MOUNT,
  IMAGES_TEST_FOLDER,
  imageName,
} from "./config.ts";
import { dockerApiError, dockerCall, ImageError, isDockerStatus } from "./errors.ts";

/** The part of a Docker API client that the tests use, which a dockerode instance provides. */
export interface TestClient {
  getImage(name: string): { inspect(): Promise<unknown> };
  listContainers(options: { all: true; filters: { label: string[] } }): Promise<{ Id: string }[]>;
  getContainer(id: string): { remove(options: { force: boolean }): Promise<unknown> };
}

/** The devcontainer.json that a test container is brought up with. */
export interface TestConfig {
  image: string;
  workspaceFolder: string;
  workspaceMount: string;
  mounts: string[];
  remoteEnv: Record<string, string>;
}

/** Options for testing images. */
export interface TestOptions {
  /** Test the release build, rather than the dev build. */
  readonly release?: boolean;
}

/**
 * Returns a read-only bind mount in the --mount format the CLI passes to Docker.
 *
 * @throws ImageError if the source holds a comma, which the format would read as the end of the value.
 */
function readOnlyBind(source: string, target: string): string {
  if (source.includes(",")) {
    throw new ImageError(`Can't mount ${source} in a test container, because its path holds a comma.`);
  }
  return `type=bind,source=${source},target=${target},readonly`;
}

/** Returns the devcontainer.json that runs the image with its test project and the shared helpers mounted read-only. */
export function testConfig(image: string, name: string, testFolder: string = IMAGES_TEST_FOLDER): TestConfig {
  return {
    image,
    workspaceFolder: IMAGE_TEST_MOUNT,
    workspaceMount: readOnlyBind(path.resolve(testFolder, name), IMAGE_TEST_MOUNT),
    mounts: [readOnlyBind(path.resolve(testFolder, IMAGE_TEST_UTILS_FILE), IMAGE_TEST_UTILS_MOUNT)],
    remoteEnv: { [IMAGE_TEST_UTILS_ENV]: IMAGE_TEST_UTILS_MOUNT },
  };
}

/** Returns the arguments for a CLI command on the test container that the config and the run's id label find. */
export function cliArgs(command: "up" | "exec", workspace: string, config: string, id: string): string[] {
  return [
    DEVCONTAINERS_CLI,
    command,
    `--workspace-folder=${workspace}`,
    `--config=${config}`,
    `--id-label=${IMAGE_TEST_LABEL}=${id}`,
  ];
}

/** Removes every container with the run's id label, however far it got. */
export async function removeTestContainers(docker: TestClient, id: string): Promise<void> {
  const containers = await dockerCall(() =>
    docker.listContainers({ all: true, filters: { label: [`${IMAGE_TEST_LABEL}=${id}`] } }),
  );
  for (const { Id } of containers) {
    await dockerCall(() => docker.getContainer(Id).remove({ force: true }));
  }
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
 * Brings up a dev container with the config, runs test.sh in it and removes it, even after a Ctrl+C. A failure of
 * either CLI command fails the image, because an image whose command doesn't start can't come up.
 *
 * @param workspace - The folder the CLI names the dev container after, the image's test project.
 * @param id - The label value that finds the container. The tests replace it.
 * @returns Whether test.sh passed.
 */
export async function runInDevcontainer(
  docker: TestClient,
  run: Runner,
  config: TestConfig,
  workspace: string,
  id: string = randomUUID(),
): Promise<boolean> {
  const folder = mkdtempSync(path.join(tmpdir(), "image-test-"));
  const file = path.join(folder, "devcontainer.json");
  writeFileSync(file, JSON.stringify(config, null, 2));

  // A Ctrl+C in the terminal reaches the CLI too, which stops. Listening keeps the task alive to remove the container,
  // and once, so a second Ctrl+C while it's removed still stops the task at once.
  let interrupted = false;
  const onInterrupt = () => {
    interrupted = true;
  };
  process.once("SIGINT", onInterrupt);

  let passed = false;
  try {
    await run(process.execPath, cliArgs("up", workspace, file, id));
    await run(process.execPath, [
      ...cliArgs("exec", workspace, file, id),
      "/bin/sh",
      `${IMAGE_TEST_MOUNT}/${IMAGE_TEST_SCRIPT}`,
    ]);
    passed = true;
  } catch (error) {
    if (!(error instanceof ImageError)) {
      throw error;
    }
    if (!interrupted) {
      console.log(error.message);
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    rmSync(folder, { recursive: true, force: true });
    await removeTestContainers(docker, id);
  }

  if (interrupted) {
    throw new ImageError("The image tests were interrupted.");
  }
  return passed;
}

/** Runs the image's test.sh in a dev container of its build, and returns whether it passed. */
export async function runImageTest(
  docker: TestClient,
  run: Runner,
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
  return runInDevcontainer(docker, run, testConfig(image, name, testFolder), path.resolve(testFolder, name));
}

/**
 * Tests each image, then throws an ImageError naming any that failed.
 *
 * @param runTest - Tests one image. The tests replace it.
 */
export async function runImageTests(
  docker: TestClient,
  run: Runner,
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

      if (!(await runTest(docker, run, name, testFolder, { release }))) {
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
