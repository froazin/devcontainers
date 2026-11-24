/**
 * Claude Code PostToolUse hook: check the image manifests after an edit to a file in WATCHED.
 *
 * Claude Code only passes stderr to Claude on exit 2, so that's how the errors reach it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { ImageError } from "../../tasks/images/errors.ts";

/** The repository root, two folders up from this script. */
export const ROOT = path.resolve(import.meta.dirname, "..", "..");
// Mirrors the paths of .claude/rules/image-manifest.md.
export const WATCHED = [
  "schemas/image-manifest.schema.json",
  "images/src/*/manifest.json",
  "images/src/template.hbs",
  "tasks/images/manifest.ts",
];

/** The manifest checks, which the hook loads only after an edit to a watched file. */
export interface Checks {
  checkManifests(): void;
}

/** Returns the value if it's an object, or an empty object. */
function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Returns the edited file's path from the hook event, or an empty string. */
export function editedFile(event: unknown): string {
  const file = asObject(asObject(event).tool_input).file_path;
  return typeof file === "string" ? file : "";
}

/** Returns whether the manifest checks cover the path. */
export function isWatched(file: string, root: string = ROOT): boolean {
  if (file === "") {
    return false;
  }

  const relative = path.relative(root, path.resolve(file));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  return WATCHED.some((pattern) => path.matchesGlob(relative, pattern));
}

/**
 * Runs the checks after an edit to a watched file, and returns the hook's exit code.
 *
 * @param input - The hook event, as Claude Code writes it to stdin.
 * @param loadChecks - Loads the checks. It's a dynamic import, so the hook can explain missing node_modules.
 */
export async function main(
  input: string,
  loadChecks: () => Promise<Checks> = () => import("../../tasks/images/validation.ts"),
): Promise<number> {
  let event: unknown;
  try {
    event = JSON.parse(input);
  } catch {
    return 0;
  }

  if (!isWatched(editedFile(event))) {
    return 0;
  }

  // The checks use paths relative to the repository root.
  process.chdir(ROOT);
  let checks: Checks;
  try {
    checks = await loadChecks();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Can't run the image manifest checks: ${reason}. Run \`npm install\`.`);
    return 1;
  }

  try {
    checks.checkManifests();
  } catch (error) {
    if (error instanceof ImageError) {
      console.error(error.message);
      console.error("Fix them by following the image-manifest-schema skill.");
      return 2;
    }
    throw error;
  }

  return 0;
}

if (import.meta.main) {
  process.exitCode = await main(readFileSync(0, "utf8"));
}
