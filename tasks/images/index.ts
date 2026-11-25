/** Builds, tests and checks the container images under images/src. */

export { type BuildClient, buildImages, type Runner, spawnRunner } from "./build.ts";
export { imageDirs } from "./discovery.ts";
export { ImageError } from "./errors.ts";
export { runImageTests, type TestClient } from "./testing.ts";
export { checkManifests } from "./validation.ts";
