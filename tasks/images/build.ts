/** Builds images with the Dev Containers CLI, then checks their labels and tags them through the Docker API. */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  DEVCONTAINERS_CLI,
  IMAGE_DEVCONTAINER_FILE,
  IMAGE_MANIFEST_FILE,
  IMAGE_REPOSITORY,
  IMAGE_TEMPLATE,
  imageName,
} from "./config.ts";
import { dockerCall, ImageError } from "./errors.ts";
import { type ImageManifest, imageTags, labels, readManifest, renderTemplate } from "./manifest.ts";
import { checkManifests } from "./validation.ts";

/** Runs a command with its arguments, without a shell, and rejects if it fails. */
export type Runner = (command: string, args: readonly string[]) => Promise<void>;

/** The part of a Docker API image that the build uses, which dockerode's Image provides. */
export interface BuildImage {
  inspect(): Promise<{ Config?: { Labels?: Record<string, string> | null } }>;
  tag(options: { repo: string; tag: string }): Promise<unknown>;
}

/** The part of a Docker API client that the build uses, which a dockerode instance provides. */
export interface BuildClient {
  getImage(name: string): BuildImage;
}

/** Options for building images. */
export interface BuildOptions {
  /** Build without the build cache. */
  readonly noCache?: boolean;
  /** Build a release, rather than a dev build whose name and tags end in -dev. */
  readonly release?: boolean;
  /** The image template to render. The tests replace it. */
  readonly template?: string;
}

/** Runs the command with the task's stdin, stdout and stderr, and rejects with an ImageError if it fails. */
export const spawnRunner: Runner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    const shown = [command, ...args].join(" ");
    child.on("error", (error) => reject(new ImageError(`Can't run ${shown}: ${error.message}.`, { cause: error })));
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const how = signal === null ? `with exit code ${code}` : `on ${signal}`;
        reject(new ImageError(`${shown} failed ${how}.`));
      }
    });
  });

/** Writes the rendered template to the image's .devcontainer.json, leaving it as it was if the render fails. */
export function renderDevcontainer(
  imageDir: string,
  manifest: ImageManifest,
  release = true,
  template: string = IMAGE_TEMPLATE,
): void {
  const content = renderTemplate(template, manifest, release);
  writeFileSync(path.join(imageDir, IMAGE_DEVCONTAINER_FILE), content);
}

/** Builds the image with the Dev Containers CLI, run by the same Node as the task. */
export async function devcontainerBuild(run: Runner, imageDir: string, ref: string, noCache = false): Promise<void> {
  await run(process.execPath, [
    DEVCONTAINERS_CLI,
    "build",
    `--workspace-folder=${imageDir}`,
    `--image-name=${ref}`,
    "--no-lockfile",
    ...(noCache ? ["--no-cache"] : []),
  ]);
}

/** Throws an ImageError if any expected label is missing or different. */
export function checkLabels(
  actual: Record<string, string> | null | undefined,
  ref: string,
  expected: Record<string, string>,
): void {
  const found = actual ?? {};
  const wrong = Object.entries(expected)
    .filter(([key, value]) => found[key] !== value)
    .map(([key, value]) => `${key} is ${JSON.stringify(found[key]) ?? "missing"}, not ${JSON.stringify(value)}`);
  if (wrong.length > 0) {
    throw new ImageError(`Image ${ref} has the wrong labels: ${wrong.join("; ")}.`);
  }
}

/** Adds each tag to the image in the image repository. */
export async function tagImage(image: BuildImage, ref: string, tags: readonly string[]): Promise<void> {
  for (const tag of tags) {
    console.log(`Tagging image ${ref} as ${tag}`);
    await dockerCall(() => image.tag({ repo: IMAGE_REPOSITORY, tag }));
  }
}

/** Builds one image, checks its labels and tags it. */
export async function buildImage(
  run: Runner,
  docker: BuildClient,
  imageDir: string,
  { noCache = false, release = true, template = IMAGE_TEMPLATE }: BuildOptions = {},
): Promise<void> {
  const manifest = readManifest(path.join(imageDir, IMAGE_MANIFEST_FILE));
  const ref = imageName(path.basename(imageDir), release);
  const tags = imageTags(manifest, release);

  renderDevcontainer(imageDir, manifest, release, template);
  await devcontainerBuild(run, imageDir, ref, noCache);
  const image = docker.getImage(ref);
  const info = await dockerCall(() => image.inspect());
  checkLabels(info.Config?.Labels, ref, labels(manifest, release));
  await tagImage(image, ref, tags);
}

/**
 * Checks every manifest, then builds each image.
 *
 * @param check - Runs the manifest checks. The tests replace it.
 */
export async function buildImages(
  run: Runner,
  docker: BuildClient,
  imageDirs: readonly string[],
  { noCache = false, release = false, template = IMAGE_TEMPLATE }: BuildOptions = {},
  check: () => void = checkManifests,
): Promise<void> {
  check();
  for (const imageDir of imageDirs) {
    await buildImage(run, docker, imageDir, { noCache, release, template });
  }
}
