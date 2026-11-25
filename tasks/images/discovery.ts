/** Finds the images under images/src. */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { IMAGE_MANIFEST_FILE, IMAGES_SRC_FOLDER } from "./config.ts";
import { ImageError } from "./errors.ts";

/** Returns whether the path is a regular file. */
function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile();
}

/** Returns the image folders with a manifest, in name order. Files beside them, such as the template, are skipped. */
export function imageDirs(nameFilter?: string, srcFolder: string = IMAGES_SRC_FOLDER): string[] {
  const dirs: string[] = [];
  for (const name of readdirSync(srcFolder).sort()) {
    const imageDir = path.join(srcFolder, name);
    if (!statSync(imageDir).isDirectory()) {
      continue;
    }

    if (nameFilter !== undefined && !path.matchesGlob(name, nameFilter)) {
      continue;
    }

    if (!isFile(path.join(imageDir, IMAGE_MANIFEST_FILE))) {
      console.log(`Skipping ${name}: ${IMAGE_MANIFEST_FILE} not found.`);
      continue;
    }

    dirs.push(imageDir);
  }

  if (dirs.length === 0) {
    const found = nameFilter === undefined ? "was found" : `matches the filter ${JSON.stringify(nameFilter)}`;
    throw new ImageError(`No image in ${srcFolder} with a ${IMAGE_MANIFEST_FILE} ${found}.`);
  }

  return dirs;
}
