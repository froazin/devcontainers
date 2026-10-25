import copy
import json
import os
from typing import Any

import pytest

from devel.images import validation
from devel.images.config import IMAGE_MANIFEST_SCHEMA


def _schema() -> dict[str, Any]:
    with open(IMAGE_MANIFEST_SCHEMA) as f:
        return json.load(f)


def _base_manifest() -> dict[str, Any]:
    with open("images/src/base/manifest.json") as f:
        return json.load(f)


def _write_image(src, name: str, manifest: object, template: str | None = '{"name": "{{ name }}"}') -> None:
    image_dir = src / name
    image_dir.mkdir()
    (image_dir / "manifest.json").write_text(manifest if isinstance(manifest, str) else json.dumps(manifest))
    if template is not None:
        (image_dir / "template.json").write_text(template)


def test_the_repository_passes_every_check() -> None:
    assert validation.validate() == []


def test_schema_errors_reports_an_invalid_schema() -> None:
    schema = _schema()
    schema["properties"]["name"]["type"] = "text"

    assert "is not a valid JSON schema" in validation.schema_errors(schema)[0]


def test_schema_errors_requires_additional_properties_false() -> None:
    schema = _schema()
    del schema["additionalProperties"]

    assert '"additionalProperties": false' in validation.schema_errors(schema)[0]


def test_dataclass_errors_reports_a_property_without_a_field() -> None:
    schema = _schema()
    schema["properties"]["labels"] = {"type": "object"}

    assert validation.dataclass_errors(schema) == ["Schema property 'labels' has no ImageManifest field."]


def test_dataclass_errors_reports_a_field_without_a_property() -> None:
    schema = _schema()
    del schema["properties"]["build_args"]

    assert validation.dataclass_errors(schema) == ["ImageManifest field 'build_args' has no schema property."]


def test_dataclass_errors_reports_a_required_name_without_a_property() -> None:
    schema = _schema()
    schema["required"].append("maintainer")

    assert validation.dataclass_errors(schema) == [
        "'maintainer' is in the schema's required list, but has no schema property."
    ]


def test_dataclass_errors_reports_a_required_field_missing_from_required() -> None:
    schema = _schema()
    schema["required"].remove("version")

    assert "'version' has no default in ImageManifest" in validation.dataclass_errors(schema)[0]


def test_dataclass_errors_reports_a_field_with_a_default_in_required() -> None:
    schema = _schema()
    schema["required"].append("build_args")

    assert "'build_args' is in the schema's required list" in validation.dataclass_errors(schema)[0]


def test_dataclass_errors_reports_a_default_that_differs() -> None:
    schema = _schema()
    schema["properties"]["build_args"]["default"] = {"BASE_IMAGE": "ubuntu"}

    assert "'build_args' has the schema default" in validation.dataclass_errors(schema)[0]


@pytest.mark.parametrize(
    ("name", "change"),
    [
        ("name", {"type": "integer"}),
        ("tags", {"items": {"type": "integer"}}),
        ("build_args", {"additionalProperties": {"type": "integer"}}),
    ],
)
def test_dataclass_errors_reports_a_type_that_differs(name: str, change: dict[str, Any]) -> None:
    schema = _schema()
    schema["properties"][name].update(change)

    assert f"Schema property {name!r} should have" in validation.dataclass_errors(schema)[0]


def test_manifest_errors_reports_schema_errors(tmp_path) -> None:
    manifest = _base_manifest() | {"version": "1.0"}
    _write_image(tmp_path, "base", manifest)

    errors = validation.manifest_errors(_schema(), str(tmp_path))

    assert errors == [
        f"{os.path.join(tmp_path, 'base', 'manifest.json')}: '1.0' does not match "
        + repr(_schema()["properties"]["version"]["pattern"])
    ]


def test_manifest_errors_reports_invalid_json(tmp_path) -> None:
    _write_image(tmp_path, "base", "{")

    assert "is not valid JSON" in validation.manifest_errors(_schema(), str(tmp_path))[0]


def test_manifest_errors_reports_a_template_using_a_missing_field(tmp_path) -> None:
    _write_image(tmp_path, "base", _base_manifest(), template='{"name": "{{ maintainer }}"}')

    assert "doesn't render with" in validation.manifest_errors(_schema(), str(tmp_path))[0]


def test_manifest_errors_reports_a_template_that_renders_invalid_json(tmp_path) -> None:
    _write_image(tmp_path, "base", _base_manifest(), template='{"name": {{ name }}}')

    assert "doesn't render to valid JSON" in validation.manifest_errors(_schema(), str(tmp_path))[0]


def test_manifest_errors_checks_manifests_without_a_template(tmp_path) -> None:
    _write_image(tmp_path, "good", _base_manifest(), template=None)
    _write_image(tmp_path, "bad", copy.deepcopy(_base_manifest()) | {"tags": []}, template=None)

    errors = validation.manifest_errors(_schema(), str(tmp_path))

    assert len(errors) == 1
    assert errors[0].startswith(os.path.join(tmp_path, "bad", "manifest.json"))


def test_validate_stops_at_an_invalid_schema(tmp_path) -> None:
    schema = _schema()
    del schema["additionalProperties"]
    schema_path = tmp_path / "schema.json"
    schema_path.write_text(json.dumps(schema))

    assert len(validation.validate(str(schema_path), str(tmp_path))) == 1
