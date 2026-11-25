/**
 * Finds the images a pull request changes, and whether it changes the workflows or actions, for ci.yml. It uses only
 * Node's built-in modules, so the runner runs it without an npm install.
 */

import { readFileSync } from "node:fs";

import { gitOutput, IMAGES_SRC_FOLDER, IMAGES_TEST_FOLDER, imageNames, matches, setOutput, spawnGit } from "../lib.js";

/**
 * Paths where a change can affect every image, so it counts as a change to them all: the workflows that build or
 * version-review each image, and the build's shared files. A folder ends in a slash.
 */
export const SHARED = [
  ".github/actions/changed-images/",
  ".github/actions/lib.js",
  ".github/workflows/ci-images.yml",
  ".github/workflows/ci-version-review.yml",
  ".github/workflows/ci.yml",
  "package.json",
  "images/src/template.hbs",
  "images/test/test_utils.sh",
  "schemas/",
  "tasks/index.ts",
  "tasks/images/",
];

/** Paths that ci-actions.yml lints or runs, so a change to one of them runs it. A folder ends in a slash. */
export const ACTIONS = [".github/actionlint.yaml", ".github/actions/", ".github/workflows/"];

/**
 * Returns the commit the pull request is compared with: the merge base of the branch it merges into and HEAD, the
 * merge commit GitHub makes for it.
 *
 * @param {{ pull_request?: { base: { ref: string } } }} payload - The event that started the run.
 * @param {import("../lib.js").Git} [git]
 * @throws {Error} If the event isn't a pull request.
 */
export function compareBase(payload, git = spawnGit) {
  if (payload.pull_request === undefined) {
    throw new Error("Finding changed images needs a pull_request event.");
  }
  return gitOutput(git, ["merge-base", `origin/${payload.pull_request.base.ref}`, "HEAD"]).trim();
}

/**
 * Returns the files that changed since the commit. --no-renames lists a rename's old and new paths.
 *
 * @param {string} base
 * @param {import("../lib.js").Git} [git]
 */
export function changedFiles(base, git = spawnGit) {
  return gitOutput(git, ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"]).split("\0").filter(Boolean);
}

/**
 * Returns whether a change to the file can affect every image.
 *
 * @param {string} file - A path from the repository root.
 */
export function isShared(file) {
  return matches(file, SHARED);
}

/**
 * Returns the images to build and test, and the images whose own files changed, which the code review reviews.
 *
 * @param {readonly string[]} images - Every image's name.
 * @param {readonly string[]} files - The changed files.
 * @returns {{ images: string[], sources: string[] }}
 */
export function changedImages(images, files) {
  const sources = images.filter((name) =>
    files.some(
      (file) => file.startsWith(`${IMAGES_SRC_FOLDER}/${name}/`) || file.startsWith(`${IMAGES_TEST_FOLDER}/${name}/`),
    ),
  );
  return { images: files.some(isShared) ? [...images] : sources, sources };
}

/**
 * Returns whether the files change a workflow, an action or actionlint's settings, so ci-actions.yml should run.
 *
 * @param {readonly string[]} files - The changed files.
 */
export function changedActions(files) {
  return files.some((file) => matches(file, ACTIONS));
}

/**
 * Finds the changes for the pull request in GITHUB_EVENT_PATH, and sets the base, images, sources and actions outputs.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {import("../lib.js").Git} [git]
 * @param {string} [srcFolder]
 */
export function run(env = process.env, git = spawnGit, srcFolder = IMAGES_SRC_FOLDER) {
  const payload = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")) : {};
  const base = compareBase(payload, git);
  const files = changedFiles(base, git);
  const changed = changedImages(imageNames(srcFolder), files);
  const actions = changedActions(files);

  if (files.some(isShared)) {
    console.log("Shared build tooling changed, so every image is included.");
  }
  console.log(`Changed images: ${changed.images.join(", ") || "none"}`);
  console.log(`Images with changes to their own files: ${changed.sources.join(", ") || "none"}`);
  console.log(`Workflows or actions changed: ${actions ? "yes" : "no"}`);
  setOutput("base", base, env);
  setOutput("images", JSON.stringify(changed.images), env);
  setOutput("sources", JSON.stringify(changed.sources), env);
  setOutput("actions", String(actions), env);
}
