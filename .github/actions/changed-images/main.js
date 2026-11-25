/**
 * Finds the images a pull request or a push to main changes, for ci-images.yml and release.yml. It uses only Node's
 * built-in modules, so the runner runs it without an npm install.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** The folder holding each image's source folder. */
export const IMAGES_SRC_FOLDER = "images/src";
/** The folder holding each image's test project. */
export const IMAGES_TEST_FOLDER = "images/test";

/**
 * Paths where a change can affect every image, so it counts as a change to them all. A folder ends in a slash.
 * ci.yml's PATHS must cover each of them.
 */
export const SHARED = [
  ".github/actions/changed-images/",
  ".github/workflows/ci-images.yml",
  ".github/workflows/ci.yml",
  "package.json",
  "images/src/template.hbs",
  "images/test/test_utils.sh",
  "schemas/",
  "tasks/index.ts",
  "tasks/images/",
];

/** Image names go into --filter, which is a shell-style glob, so they allow no glob characters. */
const NAME = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Runs git and returns its exit code and output. The tests pass a fake.
 *
 * @callback Git
 * @param {readonly string[]} args
 * @returns {{ status: number, stdout: string, stderr: string }}
 */

/** @type {Git} */
export function spawnGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error !== undefined) {
    throw new Error(`Can't run git: ${result.error.message}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Returns git's output, and throws with git's own error when it fails.
 *
 * @param {Git} git
 * @param {readonly string[]} args
 */
function gitOutput(git, args) {
  const { status, stdout, stderr } = git(args);
  if (status !== 0) {
    throw new Error(`git ${args[0]} failed with exit code ${status}: ${stderr.trim()}`);
  }
  return stdout;
}

/**
 * Returns the name of each folder in the source folder that holds a manifest.json, sorted.
 *
 * @param {string} [srcFolder]
 * @throws {Error} If a name holds a character --filter would read as a glob.
 */
export function imageNames(srcFolder = IMAGES_SRC_FOLDER) {
  const names = readdirSync(srcFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(srcFolder, entry.name, "manifest.json")))
    .map((entry) => entry.name)
    .sort();
  const invalid = names.filter((name) => !NAME.test(name));
  if (invalid.length > 0) {
    throw new Error(`Image folders ${invalid.join(", ")} aren't valid image names.`);
  }
  return names;
}

/**
 * Returns whether a change to the file can affect every image.
 *
 * @param {string} file - A path from the repository root.
 */
export function isShared(file) {
  return SHARED.some((shared) => (shared.endsWith("/") ? file.startsWith(shared) : file === shared));
}

/**
 * Returns the commit to compare HEAD with, or an empty string when there's none. For a pull request, HEAD is the merge
 * commit GitHub makes, so it's the merge base with the branch it merges into. For a push, it's the commit the branch was
 * at before the push, which a branch's first push doesn't have.
 *
 * @param {{ pull_request?: { base: { ref: string } }, before?: string }} payload - The event that started the run.
 * @param {Git} [git]
 */
export function compareBase(payload, git = spawnGit) {
  if (payload.pull_request !== undefined) {
    return gitOutput(git, ["merge-base", `origin/${payload.pull_request.base.ref}`, "HEAD"]).trim();
  }

  const before = payload.before ?? "";
  if (!/^[0-9a-f]{40}$/.test(before) || /^0+$/.test(before)) {
    return "";
  }
  return git(["cat-file", "-e", `${before}^{commit}`]).status === 0 ? before : "";
}

/**
 * Returns the files that changed since the commit. --no-renames lists a rename's old and new paths.
 *
 * @param {string} base
 * @param {Git} [git]
 */
export function changedFiles(base, git = spawnGit) {
  return gitOutput(git, ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"]).split("\0").filter(Boolean);
}

/**
 * Returns the images to build and test, and the images whose own files changed, which the code review reviews.
 *
 * @param {readonly string[]} images - Every image's name.
 * @param {readonly string[] | null} files - The changed files, or null when there's no commit to compare with.
 * @returns {{ images: string[], sources: string[] }}
 */
export function changedImages(images, files) {
  if (files === null) {
    return { images: [...images], sources: [] };
  }

  const sources = images.filter((name) =>
    files.some(
      (file) => file.startsWith(`${IMAGES_SRC_FOLDER}/${name}/`) || file.startsWith(`${IMAGES_TEST_FOLDER}/${name}/`),
    ),
  );
  return { images: files.some(isShared) ? [...images] : sources, sources };
}

/**
 * Writes a step output to the file GitHub Actions reads them from, or prints it when there's none, as locally.
 *
 * @param {string} name
 * @param {string} value - A single line.
 */
function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    appendFileSync(file, `${name}=${value}\n`);
  } else {
    console.log(`${name}=${value}`);
  }
}

/** Finds the changed images for the event in GITHUB_EVENT_PATH and sets the base, images and sources outputs. */
export function run() {
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const payload = eventPath ? JSON.parse(readFileSync(eventPath, "utf8")) : {};
    const images = imageNames();
    const base = compareBase(payload);
    const files = base ? changedFiles(base) : null;
    const changed = changedImages(images, files);

    if (files === null) {
      console.log("No earlier commit to compare with, so every image is included.");
    } else if (files.some(isShared)) {
      console.log("Shared build tooling changed, so every image is included.");
    }
    console.log(`Changed images: ${changed.images.join(", ") || "none"}`);
    console.log(`Images with changes to their own files: ${changed.sources.join(", ") || "none"}`);
    setOutput("base", base);
    setOutput("images", JSON.stringify(changed.images));
    setOutput("sources", JSON.stringify(changed.sources));
  } catch (error) {
    console.log(`::error title=Find changed images::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
