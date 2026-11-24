/**
 * The entrypoint for `npm run tasks -- <task> <suite> [options]`: build, test and validate, as thin wrappers around
 * tasks/images. It has no tests by design, so keep any logic in tasks/images.
 */

import { parseArgs } from "node:util";

import Dockerode from "dockerode";

import { buildImages, checkManifests, ImageError, imageDirs, runImageTests, spawnRunner } from "./images/index.ts";

const USAGE = "npm run tasks -- <task> <suite> [options]";
const SUITE_HELP = "`images`. `features` isn't implemented yet.";

/** A flag's parseArgs type and help text. */
interface Flag {
  readonly type: "string" | "boolean";
  readonly help: string;
}

const FILTER: Flag = {
  type: "string",
  help: "Only include images whose folder name matches this shell-style glob, such as `base`.",
};
const NO_CACHE: Flag = { type: "boolean", help: "Build the images without using the build cache." };
const IS_RELEASE: Flag = {
  type: "boolean",
  help: "Build a release instead of a dev build, whose name and tags end in -dev.",
};
const TEST_IS_RELEASE: Flag = {
  type: "boolean",
  help: "Build and test the release build of each image instead of its dev build.",
};
const SKIP_BUILD: Flag = {
  type: "boolean",
  help: "Test the images that are already built instead of building them first.",
};

/** The flags parseArgs returns. */
type Values = ReturnType<typeof parseArgs>["values"];

/** A task's description, flags and what it does with the suite and the parsed flags. */
interface Task {
  readonly help: string;
  readonly flags: Readonly<Record<string, Flag>>;
  run(suite: string, values: Values): Promise<void>;
}

/** Throws an ImageError for a suite that isn't images. */
function requireImages(task: string, suite: string): void {
  if (suite === "features") {
    throw new ImageError(`The ${task} task isn't implemented for features yet.`);
  }
  if (suite !== "images") {
    throw new ImageError(`${suite} is not a valid ${task} suite. Use images.`);
  }
}

const TASKS: Readonly<Record<string, Task>> = {
  build: {
    help: "Checks the image manifests, then builds and tags the images under images/src.",
    flags: { filter: FILTER, "no-cache": NO_CACHE, "is-release": IS_RELEASE },
    async run(suite, values) {
      requireImages("build", suite);
      const dirs = imageDirs(values.filter as string | undefined);
      await buildImages(spawnRunner, new Dockerode(), dirs, {
        noCache: values["no-cache"] === true,
        release: values["is-release"] === true,
      });
    },
  },
  test: {
    help: "Builds the images, then runs each image's images/test/<image>/test.sh inside it.",
    flags: { filter: FILTER, "skip-build": SKIP_BUILD, "no-cache": NO_CACHE, "is-release": TEST_IS_RELEASE },
    async run(suite, values) {
      if (values["skip-build"] === true && values["no-cache"] === true) {
        console.log("Warning: --no-cache has no effect with --skip-build, so it will be ignored.");
      }

      requireImages("test", suite);
      const dirs = imageDirs(values.filter as string | undefined);
      const docker = new Dockerode();
      const release = values["is-release"] === true;
      if (values["skip-build"] !== true) {
        await buildImages(spawnRunner, docker, dirs, { noCache: values["no-cache"] === true, release });
      }
      await runImageTests(docker, dirs, undefined, { release });
    },
  },
  validate: {
    help: "Checks that the image manifests, their schema, ImageManifest and the image template agree.",
    flags: {},
    async run(suite) {
      requireImages("validate", suite);
      checkManifests();
      console.log("The image manifests, their schema, ImageManifest and the image template agree.");
    },
  },
};

/** Returns the help for every task, or for one task and its flags. */
function help(name?: string): string {
  const task = name === undefined ? undefined : TASKS[name];
  if (name === undefined || task === undefined) {
    const width = Math.max(...Object.keys(TASKS).map((key) => key.length));
    return [
      `Usage: ${USAGE}`,
      "",
      "Tasks:",
      ...Object.entries(TASKS).map(([key, { help }]) => `  ${key.padEnd(width)}  ${help}`),
      "",
      `Suite: ${SUITE_HELP}`,
      "Run `npm run tasks -- <task> --help` for a task's options.",
    ].join("\n");
  }

  const flags = Object.entries(task.flags).map(([key, flag]) => {
    const value = flag.type === "string" ? ` <${key}>` : "";
    return `  --${key}${value}\n      ${flag.help}`;
  });
  return [
    `Usage: npm run tasks -- ${name} <suite> [options]`,
    "",
    task.help,
    "",
    `Suite: ${SUITE_HELP}`,
    ...(flags.length > 0 ? ["", "Options:", ...flags] : []),
  ].join("\n");
}

/** Parses the arguments and runs the task, returning the exit code. */
async function main(argv: readonly string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "--help" || name === "-h") {
    console.log(help());
    return name === undefined ? 1 : 0;
  }

  const task = TASKS[name];
  if (task === undefined) {
    console.error(`${name} is not a task.\n\n${help()}`);
    return 1;
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...rest],
      options: { ...task.flags, help: { type: "boolean", short: "h" } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${help(name)}`);
    return 1;
  }

  if (parsed.values.help === true) {
    console.log(help(name));
    return 0;
  }

  if (parsed.positionals.length !== 1) {
    console.error(`The ${name} task takes one suite.\n\n${help(name)}`);
    return 1;
  }

  try {
    await task.run(parsed.positionals[0] as string, parsed.values);
  } catch (error) {
    if (error instanceof ImageError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }

  return 0;
}

process.exitCode = await main(process.argv.slice(2));
