import json
from typing import Any

import jinja2
import pytest

from devel.images.manifest import ImageManifest


def _manifest(**overrides: Any) -> ImageManifest:
    fields: dict[str, Any] = {
        "name": "Ubuntu",
        "description": "Base image",
        "registry": "ghcr.io",
        "owner": "froazin",
        "repo": "devcontainers",
        "version": "1.2.3",
        "tags": ["ubuntu", "base"],
    }
    return ImageManifest(**{**fields, **overrides})


def test_image_tags_adds_version_suffixes_to_each_tag() -> None:
    assert _manifest().image_tags() == [
        "ubuntu",
        "ubuntu-1",
        "ubuntu-1.2",
        "ubuntu-1.2.3",
        "base",
        "base-1",
        "base-1.2",
        "base-1.2.3",
    ]


def test_devel_tags_adds_devel_and_the_commit_to_each_tag() -> None:
    assert _manifest().devel_tags("9027c9d") == ["ubuntu", "ubuntu-devel9027c9d", "base", "base-devel9027c9d"]


def test_devel_tags_keeps_a_dirty_commit_suffix() -> None:
    assert _manifest(tags=["base"]).devel_tags("9027c9d-dirty") == ["base", "base-devel9027c9d-dirty"]


def test_devel_tags_ignores_the_version() -> None:
    assert _manifest(version="not a version").devel_tags("abc1234") == [
        "ubuntu",
        "ubuntu-develabc1234",
        "base",
        "base-develabc1234",
    ]


@pytest.mark.parametrize("version", ["1.2", "1.2.3.4", "1.2.x"])
def test_image_tags_rejects_versions_that_are_not_major_minor_patch(version: str) -> None:
    with pytest.raises(ValueError):
        _manifest(version=version).image_tags()


def test_from_json_reads_every_field(tmp_path) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({**_manifest().__dict__, "build_args": {"BASE_IMAGE": "ubuntu:26.04"}}))

    manifest = ImageManifest.from_json(str(path))

    assert manifest == _manifest(build_args={"BASE_IMAGE": "ubuntu:26.04"})


def test_from_json_defaults_build_args_to_empty(tmp_path) -> None:
    path = tmp_path / "manifest.json"
    fields = dict(_manifest().__dict__)
    del fields["build_args"]
    path.write_text(json.dumps(fields))

    assert ImageManifest.from_json(str(path)).build_args == {}


def test_from_json_rejects_unknown_fields(tmp_path) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({**_manifest().__dict__, "base_image": "ubuntu"}))

    with pytest.raises(TypeError):
        ImageManifest.from_json(str(path))


def test_render_template_exposes_manifest_fields() -> None:
    template = jinja2.Template("{{ name }} {{ version }} {{ build_args.BASE_IMAGE }}")

    rendered = _manifest(build_args={"BASE_IMAGE": "ubuntu:26.04"}).render_template(template)

    assert rendered == "Ubuntu 1.2.3 ubuntu:26.04"
