/**
 * Helpers the local actions share. Like the actions, it uses only Node's built-in modules, so the runner runs them
 * without an npm install.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** The folder holding each image's source folder. */
export const IMAGES_SRC_FOLDER = "images/src";
/** The folder holding each image's test project. */
export const IMAGES_TEST_FOLDER = "images/test";
/** Image names go into --filter, which is a shell-style glob, so they allow no glob characters. */
export const NAME = /^[a-z0-9][a-z0-9._-]*$/;
/** A full commit SHA, the only form a commit input or output takes. */
export const SHA = /^[0-9a-f]{40}$/;

/**
 * Runs git and returns its exit code and output. The tests pass a fake.
 *
 * @callback Git
 * @param {readonly string[]} args
 * @returns {{ status: number, stdout: string, stderr: string }}
 */

/** @type {Git} */
export function spawnGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
export function gitOutput(git, args) {
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
 * Returns whether the file is one of the paths, or under one of them that's a folder, which ends in a slash.
 *
 * @param {string} file - A path from the repository root.
 * @param {readonly string[]} paths
 */
export function matches(file, paths) {
  return paths.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
}

/**
 * Returns the text with the characters a workflow command reads specially encoded, so text from git or an API can't
 * end the command or start another one.
 *
 * @param {string} text
 */
export function encodeCommand(text) {
  return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/**
 * Writes a step output to the file GitHub Actions reads them from, or prints it when there's none, as locally.
 *
 * @param {string} name
 * @param {string} value - A single line.
 * @param {NodeJS.ProcessEnv} [env]
 * @throws {Error} If the value holds a line break, which would end the output early.
 */
export function setOutput(name, value, env = process.env) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`The ${name} output must be a single line.`);
  }
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  } else {
    console.log(`${name}=${value}`);
  }
}

/**
 * Runs an action's main function, and reports any error as a workflow error that fails the step.
 *
 * @param {string} title - The action's name, for the error's title.
 * @param {() => void | Promise<void>} main
 */
export async function runAction(title, main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::error title=${title}::${encodeCommand(message)}`);
    process.exitCode = 1;
  }
}
