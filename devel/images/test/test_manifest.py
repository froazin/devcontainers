import json
import re
from typing import Any

import jinja2
import pytest

from devel.images.manifest import ImageManifest

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


def test_dev_tags_adds_dev_and_the_commit_to_each_tag() -> None:
    assert _manifest().dev_tags("9027c9d") == ["ubuntu-dev", "ubuntu-dev_9027c9d", "base-dev", "base-dev_9027c9d"]


def test_dev_tags_keeps_a_dirty_commit_suffix() -> None:
    assert _manifest(tags=["base"]).dev_tags("9027c9d-dirty") == ["base-dev", "base-dev_9027c9d-dirty"]


def test_dev_tags_ignores_the_version() -> None:
    assert _manifest(version="not a version").dev_tags("abc1234") == [
        "ubuntu-dev",
        "ubuntu-dev_abc1234",
        "base-dev",
        "base-dev_abc1234",
    ]


def test_image_version_is_the_version_for_a_release() -> None:
    assert _manifest().image_version() == "1.2.3"


@pytest.mark.parametrize("commit", ["9027c9d", "9027c9d-dirty"])
def test_image_version_is_a_semver_dev_version_for_a_commit(commit: str) -> None:
    version = _manifest().image_version(commit)

    assert version == f"1.2.3-dev+{commit}"
    assert re.fullmatch(SEMVER, version)


def test_image_source_is_the_github_repository() -> None:
    assert _manifest().image_source() == "https://github.com/froazin/devcontainers"


def test_labels_are_the_oci_labels_for_the_build() -> None:
    assert _manifest().labels("abc1234") == {
        "org.opencontainers.image.version": "1.2.3-dev+abc1234",
        "org.opencontainers.image.title": "Ubuntu",
        "org.opencontainers.image.description": "Base image",
        "org.opencontainers.image.source": "https://github.com/froazin/devcontainers",
    }


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


@pytest.mark.parametrize(("commit", "version"), [(None, "1.2.3"), ("abc1234", "1.2.3-dev+abc1234")])
def test_render_template_exposes_the_label_values(commit: str | None, version: str) -> None:
    template = jinja2.Template("{{ image_version }} {{ image_source }}")

    rendered = _manifest().render_template(template, commit)

    assert rendered == f"{version} https://github.com/froazin/devcontainers"
