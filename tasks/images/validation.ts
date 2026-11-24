/** Checks that the manifest schema, MANIFEST_FIELDS, each image's manifest.json and the shared template agree. */

import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getSystemErrorMessage, isDeepStrictEqual } from "node:util";

import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

import { IMAGE_MANIFEST_FILE, IMAGE_MANIFEST_SCHEMA, IMAGE_TEMPLATE_FILE, IMAGES_SRC_FOLDER } from "./config.ts";
import { ImageError } from "./errors.ts";
import { type FieldKind, type FieldSpec, MANIFEST_FIELDS, parseManifest, renderTemplate } from "./manifest.ts";

/** A JSON object, such as the schema or one of its properties. */
type JsonObject = Record<string, unknown>;

/** The schema each MANIFEST_FIELDS kind must have. */
export const SCHEMA_TYPES: Record<FieldKind, JsonObject> = {
  string: { type: "string" },
  "string[]": { type: "array", items: { type: "string" } },
  record: { type: "object", additionalProperties: { type: "string" } },
  object: { type: "object" },
};

/** Returns whether the value is a JSON object, rather than an array, null or a scalar. */
function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns whether actual holds every key and value in expected, recursing into objects. */
function has(expected: JsonObject, actual: unknown): boolean {
  if (!isObject(actual)) {
    return false;
  }

  return Object.entries(expected).every(([key, value]) =>
    isObject(value) ? has(value, actual[key]) : isDeepStrictEqual(actual[key], value),
  );
}

/** Returns the reason a file couldn't be read, such as "permission denied". */
function readFailure(error: unknown): string {
  const errno = (error as NodeJS.ErrnoException).errno;
  return errno === undefined ? String(error) : getSystemErrorMessage(errno);
}

/** Returns the error's message, or the value itself if it isn't an Error. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns each Ajv error as the location in the data and the message. */
function ajvMessages(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
}

/** Returns errors if the schema is invalid or allows unknown fields. */
export function schemaErrors(schema: JsonObject, schemaPath: string = IMAGE_MANIFEST_SCHEMA): string[] {
  const ajv = new Ajv2020({ allErrors: true });
  if (!ajv.validateSchema(schema)) {
    return [`${schemaPath} is not a valid JSON schema: ${ajvMessages(ajv.errors).join("; ")}`];
  }

  if (schema.additionalProperties !== false) {
    return [`${schemaPath} must set "additionalProperties": false, because ImageManifest rejects unknown fields.`];
  }

  return [];
}

/** Returns the differences between the schema's properties and MANIFEST_FIELDS. */
export function fieldErrors(schema: JsonObject): string[] {
  const errors: string[] = [];
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields: Record<string, FieldSpec> = MANIFEST_FIELDS;
  const sorted = (names: Iterable<string>) => [...names].sort();

  for (const name of sorted(Object.keys(properties).filter((name) => !Object.hasOwn(fields, name)))) {
    errors.push(`Schema property ${JSON.stringify(name)} has no ImageManifest field.`);
  }
  for (const name of sorted(Object.keys(fields).filter((name) => !Object.hasOwn(properties, name)))) {
    errors.push(`ImageManifest field ${JSON.stringify(name)} has no schema property.`);
  }
  for (const name of sorted([...required].filter((name) => !Object.hasOwn(properties, name)))) {
    errors.push(`${JSON.stringify(name)} is in the schema's required list, but has no schema property.`);
  }

  for (const name of sorted(Object.keys(fields).filter((name) => Object.hasOwn(properties, name)))) {
    const field = fields[name] as FieldSpec;
    const prop = properties[name];
    const hasDefault = field.default !== undefined;
    const quoted = JSON.stringify(name);

    if (hasDefault && required.has(name)) {
      errors.push(`${quoted} is in the schema's required list, but ImageManifest gives it a default.`);
    } else if (!hasDefault && !required.has(name)) {
      errors.push(`${quoted} has no default in ImageManifest, so add it to the schema's required list.`);
    } else if (hasDefault) {
      const fieldDefault = field.default?.();
      const schemaDefault = isObject(prop) ? prop.default : undefined;
      if (!isDeepStrictEqual(schemaDefault, fieldDefault)) {
        errors.push(
          `${quoted} has the schema default ${JSON.stringify(schemaDefault)}, ` +
            `but ImageManifest uses ${JSON.stringify(fieldDefault)}.`,
        );
      }
    }

    const expected = SCHEMA_TYPES[field.kind];
    if (!has(expected, prop)) {
      errors.push(
        `Schema property ${quoted} should have ${JSON.stringify(expected)} for the kind ${JSON.stringify(field.kind)}.`,
      );
    }
  }

  return errors;
}

/**
 * Returns the schema errors in each manifest and the errors rendering the template with it.
 *
 * @param template - The template every image renders, template.hbs in the source folder unless given.
 */
export function manifestErrors(
  schema: JsonObject,
  srcFolder: string = IMAGES_SRC_FOLDER,
  template: string = path.join(srcFolder, IMAGE_TEMPLATE_FILE),
): string[] {
  const errors: string[] = [];
  const validator = new Ajv2020({ allErrors: true }).compile(schema);
  // Every build needs the template, so its absence is an error, reported once. The manifests are still checked.
  const hasTemplate = existsSync(template) && statSync(template).isFile();
  if (!hasTemplate) {
    errors.push(`${template} not found, so no image can build.`);
  }

  for (const file of globSync(path.join(srcFolder, "*", IMAGE_MANIFEST_FILE)).sort()) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      errors.push(`Can't read ${file}: ${readFailure(error)}.`);
      continue;
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      errors.push(`${file} is not valid JSON: ${message(error)}`);
      continue;
    }

    if (!validator(data)) {
      errors.push(...ajvMessages(validator.errors).map((error) => `${file}: ${error}`));
      continue;
    }

    if (!hasTemplate) {
      continue;
    }

    let rendered: string;
    try {
      rendered = renderTemplate(template, parseManifest(data));
    } catch (error) {
      errors.push(`${template} doesn't render with ${file}: ${message(error)}`);
      continue;
    }

    try {
      JSON.parse(rendered);
    } catch (error) {
      errors.push(`${template} doesn't render to valid JSON with ${file}: ${message(error)}`);
    }
  }

  return errors;
}

/** Runs every check and returns the errors. */
export function validate(schemaPath: string = IMAGE_MANIFEST_SCHEMA, srcFolder: string = IMAGES_SRC_FOLDER): string[] {
  let text: string;
  try {
    text = readFileSync(schemaPath, "utf8");
  } catch (error) {
    return [`Can't read ${schemaPath}: ${readFailure(error)}.`];
  }

  let schema: unknown;
  try {
    schema = JSON.parse(text);
  } catch (error) {
    return [`${schemaPath} is not valid JSON: ${message(error)}`];
  }

  if (!isObject(schema)) {
    return [`${schemaPath} must hold a JSON object.`];
  }

  const errors = schemaErrors(schema, schemaPath);
  if (errors.length > 0) {
    return errors;
  }

  return [...fieldErrors(schema), ...manifestErrors(schema, srcFolder)];
}

/** Runs every check and throws an ImageError listing any errors. */
export function checkManifests(
  schemaPath: string = IMAGE_MANIFEST_SCHEMA,
  srcFolder: string = IMAGES_SRC_FOLDER,
): void {
  const errors = validate(schemaPath, srcFolder);
  if (errors.length > 0) {
    throw new ImageError(["The image manifest checks failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  }
}
