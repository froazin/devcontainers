import json
import shutil
from unittest import mock

import jinja2
import pytest

from devel.images import build
from devel.images.config import IMAGE_REPOSITORY
from devel.images.manifest import ImageManifest

MANIFEST = ImageManifest(
    name="Ubuntu",
    description="Base image",
    registry="ghcr.io",
    owner="froazin",
    repo="devcontainers",
    version="0.0.1",
    tags=["base"],
    build_args={"BASE_IMAGE": "ubuntu:26.04", "OTHER": 'quote "this"'},
)


def test_render_devcontainer_renders_the_base_template_to_valid_json(tmp_path) -> None:
    shutil.copy("images/src/base/template.json", tmp_path / "template.json")

    build.render_devcontainer(str(tmp_path), MANIFEST)

    devcontainer = json.loads((tmp_path / ".devcontainer.json").read_text())
    assert devcontainer["name"] == "Ubuntu"
    assert devcontainer["build"]["args"] == MANIFEST.build_args


def test_render_devcontainer_renders_empty_build_args(tmp_path) -> None:
    shutil.copy("images/src/base/template.json", tmp_path / "template.json")
    manifest = ImageManifest(**{**MANIFEST.__dict__, "build_args": {}})

    build.render_devcontainer(str(tmp_path), manifest)

    assert json.loads((tmp_path / ".devcontainer.json").read_text())["build"]["args"] == {}


def test_render_devcontainer_escapes_the_name(tmp_path) -> None:
    shutil.copy("images/src/base/template.json", tmp_path / "template.json")
    manifest = ImageManifest(**{**MANIFEST.__dict__, "name": 'Ubuntu "LTS" \\ test'})

    build.render_devcontainer(str(tmp_path), manifest)

    assert json.loads((tmp_path / ".devcontainer.json").read_text())["name"] == manifest.name


def test_render_devcontainer_leaves_the_file_when_the_render_fails(tmp_path) -> None:
    (tmp_path / "template.json").write_text('{"name": "{{ missing }}"}')
    (tmp_path / ".devcontainer.json").write_text("previous")

    with pytest.raises(jinja2.UndefinedError):
        build.render_devcontainer(str(tmp_path), MANIFEST)

    assert (tmp_path / ".devcontainer.json").read_text() == "previous"


def test_devcontainer_build_runs_the_cli() -> None:
    commands: list[str] = []

    build.devcontainer_build(commands.append, "images/src/base", "repo:base")

    assert commands == [
        "npm exec @devcontainers/cli -- build --workspace-folder=images/src/base --image-name=repo:base --no-lockfile"
    ]


def test_devcontainer_build_passes_no_cache() -> None:
    commands: list[str] = []

    build.devcontainer_build(commands.append, "images/src/base", "repo:base", no_cache=True)

    assert commands[0].endswith(" --no-lockfile --no-cache")


def test_tag_image_applies_each_tag_to_the_repository() -> None:
    client = mock.Mock()

    build.tag_image(client, "repo:base", ["base", "base-0"])

    client.images.get.assert_called_once_with("repo:base")
    assert client.images.get.return_value.tag.call_args_list == [
        mock.call(repository=IMAGE_REPOSITORY, tag="base"),
        mock.call(repository=IMAGE_REPOSITORY, tag="base-0"),
    ]


def test_build_image_renders_builds_then_tags(tmp_path) -> None:
    image_dir = tmp_path / "base"
    image_dir.mkdir()
    shutil.copy("images/src/base/template.json", image_dir / "template.json")
    (image_dir / "manifest.json").write_text(json.dumps(MANIFEST.__dict__))
    commands: list[str] = []
    client = mock.Mock()

    build.build_image(commands.append, client, str(image_dir), no_cache=True)

    assert (image_dir / ".devcontainer.json").is_file()
    assert f"--image-name={IMAGE_REPOSITORY}:base" in commands[0]
    assert "--no-cache" in commands[0]
    client.images.get.assert_called_once_with(f"{IMAGE_REPOSITORY}:base")
    assert client.images.get.return_value.tag.call_count == len(MANIFEST.image_tags())


def test_build_image_checks_the_version_before_building(tmp_path) -> None:
    image_dir = tmp_path / "base"
    image_dir.mkdir()
    (image_dir / "manifest.json").write_text(json.dumps({**MANIFEST.__dict__, "version": "1.0"}))
    commands: list[str] = []

    with pytest.raises(ValueError):
        build.build_image(commands.append, mock.Mock(), str(image_dir))

    assert commands == []
