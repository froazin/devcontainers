/** Paths, names and registry settings for the images in this repository. */

import { fileURLToPath } from "node:url";

/** The Dev Containers CLI's own entry script, which the build runs with Node. */
export const DEVCONTAINERS_CLI = fileURLToPath(import.meta.resolve("@devcontainers/cli/devcontainer.js"));
export const IMAGES_PROJECT_FOLDER = "images";
export const IMAGES_SRC_FOLDER = [IMAGES_PROJECT_FOLDER, "src"].join("/");
export const IMAGES_TEST_FOLDER = [IMAGES_PROJECT_FOLDER, "test"].join("/");
export const IMAGE_REGISTRY = "ghcr.io";
export const IMAGE_OWNER = "froazin";
export const IMAGE_REPO = "devcontainers";
export const IMAGE_REPOSITORY = [IMAGE_REGISTRY, IMAGE_OWNER, IMAGE_REPO].join("/");
export const IMAGE_SOURCE = ["https://github.com", IMAGE_OWNER, IMAGE_REPO].join("/");
export const IMAGE_DEV_SUFFIX = "-dev";
export const IMAGE_VERSION_PREFIX = "v";
export const IMAGE_MANIFEST_FILE = "manifest.json";
export const IMAGE_MANIFEST_SCHEMA = "schemas/image-manifest.schema.json";
export const IMAGE_TEMPLATE_FILE = "template.hbs";
/** The template every image's .devcontainer.json is rendered from, beside the image folders. */
export const IMAGE_TEMPLATE = [IMAGES_SRC_FOLDER, IMAGE_TEMPLATE_FILE].join("/");
export const IMAGE_DEVCONTAINER_FILE = ".devcontainer.json";
export const IMAGE_TEST_SCRIPT = "test.sh";
export const IMAGE_TEST_MOUNT = "/test-project";
/** The helpers every image's test.sh sources, shared by every test project in the test folder. */
export const IMAGE_TEST_UTILS_FILE = "test_utils.sh";
/** Where the helpers are mounted, outside the test project, which is read-only. */
export const IMAGE_TEST_UTILS_MOUNT = "/test-utils/test_utils.sh";
/** The variable that gives test.sh the helpers' path. */
export const IMAGE_TEST_UTILS_ENV = "TEST_UTILS";
/** The label that marks each test container, with a value unique to its test run, so it can always be removed. */
export const IMAGE_TEST_LABEL = "io.github.froazin.devcontainers.test";

/** Returns the name the build gives an image, with -dev for a dev build. */
export function imageName(name: string, release: boolean): string {
  return `${IMAGE_REPOSITORY}:${name}${release ? "" : IMAGE_DEV_SUFFIX}`;
}
