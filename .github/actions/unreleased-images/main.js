/**
 * Finds the images whose manifest version is newer than every one of their release tags, for release.yml. It checks
 * every image rather than only the ones a push changed, so a release a cancelled or failed run missed is still made.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { gitOutput, IMAGES_SRC_FOLDER, imageNames, setOutput, spawnGit } from "../lib.js";

/** A release version, the schema's pattern for a manifest's version. */
export const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/**
 * Returns the version's three parts as numbers, or null when it isn't MAJOR.MINOR.PATCH.
 *
 * @param {string} version
 * @returns {[number, number, number] | null}
 */
export function parseVersion(version) {
  const match = VERSION.exec(version);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compares two versions part by part, as numbers, so 1.10.0 is newer than 1.9.0.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 * @throws {Error} If either isn't MAJOR.MINOR.PATCH.
 */
export function compareVersions(a, b) {
  const [left, right] = [parseVersion(a), parseVersion(b)];
  if (left === null || right === null) {
    throw new Error(`Can't compare the versions ${JSON.stringify(a)} and ${JSON.stringify(b)}.`);
  }
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] < right[i] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Throws unless the checkout has its full history and tags. A shallow clone has no tags, so every image would look
 * unreleased and its version tags would be pushed again.
 *
 * @param {import("../lib.js").Git} [git]
 */
export function assertFullClone(git = spawnGit) {
  if (gitOutput(git, ["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
    throw new Error("Finding unreleased images needs a checkout with fetch-depth 0, so the release tags are fetched.");
  }
}

/**
 * Returns the versions of the image's release tags, which are exactly `<image>-vX.Y.Z`. A tag such as
 * `base-v2-v0.0.1` belongs to an image called base-v2, so it doesn't count.
 *
 * @param {string} image
 * @param {import("../lib.js").Git} [git]
 */
export function releasedVersions(image, git = spawnGit) {
  const prefix = `${image}-v`;
  return gitOutput(git, ["tag", "--list", `${prefix}*`])
    .split("\n")
    .filter((tag) => tag.startsWith(prefix) && VERSION.test(tag.slice(prefix.length)))
    .map((tag) => tag.slice(prefix.length));
}

/**
 * Returns the version in the image's manifest.json.
 *
 * @param {string} image
 * @param {string} [srcFolder]
 * @throws {Error} If it's missing or isn't MAJOR.MINOR.PATCH.
 */
export function manifestVersion(image, srcFolder = IMAGES_SRC_FOLDER) {
  const { version } = JSON.parse(readFileSync(path.join(srcFolder, image, "manifest.json"), "utf8"));
  if (typeof version !== "string" || parseVersion(version) === null) {
    throw new Error(`${image}'s manifest.json has no MAJOR.MINOR.PATCH version.`);
  }
  return version;
}

/**
 * Returns whether the version is newer than every release, already released, or behind a release. Releasing a version
 * behind would move the image's floating tags, such as base-v0, back to an older build.
 *
 * @param {string} version
 * @param {readonly string[]} released - The versions of the image's release tags.
 * @returns {"unreleased" | "released" | "behind"}
 */
export function classify(version, released) {
  if (released.some((tag) => compareVersions(tag, version) > 0)) {
    return "behind";
  }
  return released.includes(version) ? "released" : "unreleased";
}

/**
 * Returns the newest of the versions.
 *
 * @param {readonly string[]} versions - At least one.
 */
function newest(versions) {
  return [...versions].sort(compareVersions).at(-1);
}

/**
 * Lists every image's version with no release yet, and the images whose version is behind their newest release.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {import("../lib.js").Git} [git]
 * @param {string} [srcFolder]
 */
export function run(env = process.env, git = spawnGit, srcFolder = IMAGES_SRC_FOLDER) {
  assertFullClone(git);

  const releases = [];
  for (const image of imageNames(srcFolder)) {
    const version = manifestVersion(image, srcFolder);
    const released = releasedVersions(image, git);
    const tag = `${image}-v${version}`;
    switch (classify(version, released)) {
      case "unreleased":
        console.log(`${tag} isn't released yet.`);
        releases.push({ image, version, tag });
        break;
      case "released":
        console.log(`${tag} is already released.`);
        break;
      case "behind":
        console.log(
          `::warning file=${srcFolder}/${image}/manifest.json,title=Release::${image} ${version} is behind its newest release, ${newest(released)}, so it isn't released.`,
        );
        break;
    }
  }

  console.log(`Images to release: ${releases.map((r) => r.tag).join(", ") || "none"}`);
  setOutput("releases", JSON.stringify(releases), env);
}
