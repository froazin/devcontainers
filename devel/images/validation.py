"""Checks that the manifest schema, ImageManifest, each image's manifest.json and its template.json agree."""

import dataclasses
import glob
import json
import os
from typing import Any, cast

import jinja2
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

from devel.images.config import IMAGE_MANIFEST_FILE, IMAGE_MANIFEST_SCHEMA, IMAGE_TEMPLATE_FILE, IMAGES_SRC_FOLDER
from devel.images.errors import ImageError
from devel.images.manifest import ImageManifest, render_template

# The schema each ImageManifest field type must have. Add a type here before using it in ImageManifest.
SCHEMA_TYPES: dict[object, dict[str, Any]] = {
    str: {"type": "string"},
    list[str]: {"type": "array", "items": {"type": "string"}},
    dict[str, str]: {"type": "object", "additionalProperties": {"type": "string"}},
}


def _has(expected: dict[str, Any], actual: object) -> bool:
    """Returns whether actual has every key in expected, with the same value, comparing nested dicts the same way."""

    if not isinstance(actual, dict):
        return False

    actual = cast(dict[str, Any], actual)
    for key, value in expected.items():
        if isinstance(value, dict):
            if not _has(cast(dict[str, Any], value), actual.get(key)):
                return False
        elif actual.get(key) != value:
            return False

    return True


def _default(field: dataclasses.Field[Any]) -> object:
    """Returns the field's default value, or dataclasses.MISSING when it has none."""

    if field.default_factory is not dataclasses.MISSING:
        return field.default_factory()

    return field.default


def schema_errors(schema: dict[str, Any], schema_path: str = IMAGE_MANIFEST_SCHEMA) -> list[str]:
    """Returns the errors that make the schema itself invalid. schema_path names the schema in the messages."""

    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        return [f"{schema_path} is not a valid JSON schema: {error.message}"]

    if schema.get("additionalProperties") is not False:
        return [f'{schema_path} must set "additionalProperties": false, because ImageManifest rejects unknown fields.']

    return []


def dataclass_errors(schema: dict[str, Any]) -> list[str]:
    """Returns the differences between the schema's properties and the ImageManifest fields."""

    errors = []
    properties: dict[str, Any] = schema.get("properties", {})
    required = set(schema.get("required", []))
    fields = {field.name: field for field in dataclasses.fields(ImageManifest)}

    for name in sorted(set(properties) - set(fields)):
        errors.append(f"Schema property {name!r} has no ImageManifest field.")
    for name in sorted(set(fields) - set(properties)):
        errors.append(f"ImageManifest field {name!r} has no schema property.")
    for name in sorted(required - set(properties)):
        errors.append(f"{name!r} is in the schema's required list, but has no schema property.")

    for name in sorted(set(properties) & set(fields)):
        field, prop = fields[name], properties[name]
        default = _default(field)
        has_default = default is not dataclasses.MISSING

        if has_default and name in required:
            errors.append(f"{name!r} is in the schema's required list, but ImageManifest gives it a default.")
        elif not has_default and name not in required:
            errors.append(f"{name!r} has no default in ImageManifest, so add it to the schema's required list.")
        elif has_default and prop.get("default") != default:
            errors.append(
                f"{name!r} has the schema default {prop.get('default')!r}, but ImageManifest uses {default!r}."
            )

        expected = SCHEMA_TYPES.get(field.type)
        if expected is None:
            errors.append(f"ImageManifest field {name!r} has the type {field.type!r}, which SCHEMA_TYPES doesn't map.")
        elif not _has(expected, prop):
            errors.append(f"Schema property {name!r} should have {json.dumps(expected)} for the type {field.type!r}.")

    return errors


def manifest_errors(schema: dict[str, Any], src_folder: str = IMAGES_SRC_FOLDER) -> list[str]:
    """Returns the schema errors in each image's manifest.json, and the errors rendering its template.json."""

    errors = []
    validator = Draft202012Validator(schema)

    for path in sorted(glob.glob(os.path.join(src_folder, "*", IMAGE_MANIFEST_FILE))):
        try:
            with open(path) as f:
                data = json.load(f)
        except OSError as error:
            errors.append(f"Can't read {path}: {error.strerror}.")
            continue
        except json.JSONDecodeError as error:
            errors.append(f"{path} is not valid JSON: {error}")
            continue

        found = [f"{path}: {error.message}" for error in validator.iter_errors(data)]
        if found:
            errors.extend(found)
            continue

        image_dir = os.path.dirname(path)
        template = os.path.join(image_dir, IMAGE_TEMPLATE_FILE)
        if not os.path.isfile(template):
            continue

        try:
            json.loads(render_template(image_dir, ImageManifest(**data)))
        except (jinja2.TemplateError, TypeError) as error:
            errors.append(f"{template} doesn't render with {path}: {error}")
        except json.JSONDecodeError as error:
            errors.append(f"{template} doesn't render to valid JSON with {path}: {error}")

    return errors


def validate(schema_path: str = IMAGE_MANIFEST_SCHEMA, src_folder: str = IMAGES_SRC_FOLDER) -> list[str]:
    """Runs every check and returns the errors, or an empty list when everything agrees."""

    try:
        with open(schema_path) as f:
            schema = json.load(f)
    except OSError as error:
        return [f"Can't read {schema_path}: {error.strerror}."]
    except json.JSONDecodeError as error:
        return [f"{schema_path} is not valid JSON: {error}"]

    if not isinstance(schema, dict):
        return [f"{schema_path} must hold a JSON object."]

    errors = schema_errors(cast(dict[str, Any], schema), schema_path)
    if errors:
        return errors

    return dataclass_errors(schema) + manifest_errors(schema, src_folder)


def check_manifests(schema_path: str = IMAGE_MANIFEST_SCHEMA, src_folder: str = IMAGES_SRC_FOLDER) -> None:
    """Runs every check, and raises ImageError that lists the errors when anything disagrees."""

    errors = validate(schema_path, src_folder)
    if errors:
        raise ImageError("\n".join(["The image manifest checks failed:", *(f"- {error}" for error in errors)]))
