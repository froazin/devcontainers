import json
import re
from typing import Any

import pytest

from devel.images.manifest import ImageManifest, render_template

# The SemVer 2.0.0 pattern from https://semver.org, for versions with a pre-release and build metadata.
SEMVER = (
    r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?"
)


def _manifest(**overrides: Any) -> ImageManifest:
    fields: dict[str, Any] = {
        "name": "Ubuntu",
        "description": "Base image",
        "version": "1.2.3",
        "tags": ["ubuntu", "base"],
    }
    return ImageManifest(**{**fields, **overrides})


def test_image_tags_adds_version_suffixes_to_each_tag() -> None:
    assert _manifest().image_tags() == [
        "ubuntu",
        "ubuntu-v1",
        "ubuntu-v1.2",
        "ubuntu-v1.2.3",
        "base",
        "base-v1",
        "base-v1.2",
        "base-v1.2.3",
    ]


def test_image_tags_adds_version_suffixes_and_dev_to_each_tag_for_a_dev_build() -> None:
    assert _manifest().image_tags(release=False) == [
        "ubuntu-dev",
        "ubuntu-v1-dev",
        "ubuntu-v1.2-dev",
        "ubuntu-v1.2.3-dev",
        "base-dev",
        "base-v1-dev",
        "base-v1.2-dev",
        "base-v1.2.3-dev",
    ]


def test_image_version_is_the_version_for_a_release() -> None:
    assert _manifest().image_version() == "v1.2.3"


def test_image_version_is_a_semver_dev_version_for_a_dev_build() -> None:
    version = _manifest().image_version(release=False)

    assert version == "v1.2.3-dev"
    assert re.fullmatch(SEMVER, version.removeprefix("v"))


def test_labels_are_the_oci_labels_for_the_build() -> None:
    assert _manifest().labels(release=False) == {
        "org.opencontainers.image.version": "v1.2.3-dev",
        "org.opencontainers.image.title": "Ubuntu",
        "org.opencontainers.image.description": "Base image",
        "org.opencontainers.image.source": "https://github.com/froazin/devcontainers",
    }


@pytest.mark.parametrize("release", [True, False])
@pytest.mark.parametrize("version", ["1.2", "1.2.3.4", "1.2.x"])
def test_image_tags_rejects_versions_that_are_not_major_minor_patch(version: str, release: bool) -> None:
    with pytest.raises(ValueError):
        _manifest(version=version).image_tags(release)


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


def test_template_vars_are_the_fields_and_the_label_values() -> None:
    assert _manifest(build_args={"BASE_IMAGE": "ubuntu:26.04"}).template_vars(release=False) == {
        "name": "Ubuntu",
        "description": "Base image",
        "version": "1.2.3",
        "tags": ["ubuntu", "base"],
        "build_args": {"BASE_IMAGE": "ubuntu:26.04"},
        "image_version": "v1.2.3-dev",
        "image_source": "https://github.com/froazin/devcontainers",
    }


@pytest.mark.parametrize(("release", "version"), [(True, "v1.2.3"), (False, "v1.2.3-dev")])
def test_render_template_renders_the_image_template(tmp_path, release: bool, version: str) -> None:
    (tmp_path / "template.json").write_text("{{ name }} {{ build_args.BASE_IMAGE }} {{ image_version }}\n")

    rendered = render_template(str(tmp_path), _manifest(build_args={"BASE_IMAGE": "u"}), release)

    assert rendered == f"Ubuntu u {version}\n"
