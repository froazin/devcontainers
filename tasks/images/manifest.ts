/** The manifest.json that describes each image, and rendering the shared image template with it. */

import { readFileSync } from "node:fs";

import Handlebars from "handlebars";

import { IMAGE_DEV_SUFFIX, IMAGE_SOURCE, IMAGE_VERSION_PREFIX } from "./config.ts";

/** The value types a manifest field can have. validation.ts maps each to the schema it must have. */
export type FieldKind = "string" | "string[]" | "record";

/** A manifest field's kind and, for an optional field, a function returning its default. */
export interface FieldSpec {
  readonly kind: FieldKind;
  readonly default?: () => unknown;
}

/**
 * Every field of an image's manifest.json. Types are erased at run time, so this table is what the code and
 * validation.ts read, and ImageManifest is derived from it.
 */
export const MANIFEST_FIELDS = {
  name: { kind: "string" },
  description: { kind: "string" },
  version: { kind: "string" },
  tags: { kind: "string[]" },
  build_args: { kind: "record", default: () => ({}) },
} as const satisfies Record<string, FieldSpec>;

/** The TypeScript type for each field kind. */
interface KindTypes {
  string: string;
  "string[]": string[];
  record: Record<string, string>;
}

/** An image's manifest.json, with every default filled in. validation.ts checks it agrees with the schema. */
export type ImageManifest = {
  readonly [Name in keyof typeof MANIFEST_FIELDS]: KindTypes[(typeof MANIFEST_FIELDS)[Name]["kind"]];
};

/** Returns whether the value has the field kind's type. */
function hasKind(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string";
    case "string[]":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "record":
      return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every((item) => typeof item === "string")
      );
  }
}

/**
 * Returns the manifest with its defaults filled in, without checking it against the schema.
 *
 * @throws TypeError if the data isn't an object, has an unknown field, lacks a required one or has a field of the
 * wrong type.
 */
export function parseManifest(data: unknown): ImageManifest {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new TypeError("An image manifest must be a JSON object.");
  }

  const unknown = Object.keys(data).filter((name) => !Object.hasOwn(MANIFEST_FIELDS, name));
  if (unknown.length > 0) {
    throw new TypeError(`Unknown manifest fields: ${unknown.join(", ")}.`);
  }

  const fields: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(MANIFEST_FIELDS) as [string, FieldSpec][]) {
    const value = Object.hasOwn(data, name) ? (data as Record<string, unknown>)[name] : spec.default?.();
    if (value === undefined) {
      throw new TypeError(`The manifest field ${name} is required.`);
    }
    if (!hasKind(value, spec.kind)) {
      throw new TypeError(`The manifest field ${name} must be a ${spec.kind}.`);
    }
    fields[name] = value;
  }

  return fields as ImageManifest;
}

/** Reads a manifest.json without checking it against the schema. */
export function readManifest(file: string): ImageManifest {
  return parseManifest(JSON.parse(readFileSync(file, "utf8")));
}

/** Returns the version label: v<version>, with -dev for a dev build. */
export function imageVersion(manifest: ImageManifest, release = true): string {
  return `${IMAGE_VERSION_PREFIX}${manifest.version}${release ? "" : IMAGE_DEV_SUFFIX}`;
}

/** Returns the OCI labels the build checks on the image. */
export function labels(manifest: ImageManifest, release = true): Record<string, string> {
  return {
    "org.opencontainers.image.version": imageVersion(manifest, release),
    "org.opencontainers.image.title": manifest.name,
    "org.opencontainers.image.description": manifest.description,
    "org.opencontainers.image.source": IMAGE_SOURCE,
  };
}

/**
 * Returns each tag on its own and with the version suffixes.
 *
 * @throws RangeError if the version isn't MAJOR.MINOR.PATCH.
 */
export function imageTags(manifest: ImageManifest, release = true): string[] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);
  if (match === null) {
    throw new RangeError(`The version ${JSON.stringify(manifest.version)} isn't MAJOR.MINOR.PATCH.`);
  }

  const [major, minor, patch] = match.slice(1).map(Number);
  const v = `-${IMAGE_VERSION_PREFIX}`;
  const suffixes = ["", `${v}${major}`, `${v}${major}.${minor}`, `${v}${major}.${minor}.${patch}`];
  const dev = release ? "" : IMAGE_DEV_SUFFIX;
  return manifest.tags.flatMap((tag) => suffixes.map((suffix) => `${tag}${suffix}${dev}`));
}

/**
 * Returns every field, plus the values the label build arguments need.
 *
 * @throws TypeError if a field is ever named like one of the extra variables, rather than hiding it.
 */
export function templateVars(manifest: ImageManifest, release = true): Record<string, unknown> {
  const extras = { image_version: imageVersion(manifest, release), image_source: IMAGE_SOURCE };
  const clashes = Object.keys(extras).filter((name) => Object.hasOwn(manifest, name));
  if (clashes.length > 0) {
    throw new TypeError(`Manifest fields clash with template variables: ${clashes.join(", ")}.`);
  }

  return { ...manifest, ...extras };
}

/** Returns the value as JSON, and fails rather than rendering nothing for a missing value. */
function jsonHelper(value: unknown, options: Handlebars.HelperOptions): string {
  const json = JSON.stringify(value);
  if (json === undefined) {
    // strict mode only covers plain {{name}} lookups, not a helper's arguments, so check here.
    const line = (options as { loc?: { start: { line: number } } }).loc?.start.line;
    throw new Error(`json was given a missing value${line === undefined ? "" : ` on line ${line}`}.`);
  }

  return json;
}

/** Renders the template file, such as the shared images/src/template.hbs, with the manifest's variables. */
export function renderTemplate(template: string, manifest: ImageManifest, release = true): string {
  const handlebars = Handlebars.create();
  handlebars.registerHelper("json", jsonHelper);
  const source = readFileSync(template, "utf8");
  return handlebars.compile(source, { strict: true, noEscape: true })(templateVars(manifest, release));
}
