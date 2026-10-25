import json
import re
import shutil
from unittest import mock

import jinja2
import pygit2
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


def test_build_image_uses_the_devel_tags_when_given_a_commit(tmp_path) -> None:
    image_dir = tmp_path / "base"
    image_dir.mkdir()
    shutil.copy("images/src/base/template.json", image_dir / "template.json")
    (image_dir / "manifest.json").write_text(json.dumps(MANIFEST.__dict__))
    client = mock.Mock()

    build.build_image([].append, client, str(image_dir), commit="abc1234")

    tags = [c.kwargs["tag"] for c in client.images.get.return_value.tag.call_args_list]
    assert tags == ["base", "base-develabc1234"]


def test_build_images_passes_the_commit_to_each_image() -> None:
    with (
        mock.patch.object(build.podman.PodmanClient, "from_env") as from_env,
        mock.patch.object(build, "build_image") as build_image,
    ):
        build.build_images([].append, ["images/src/a", "images/src/b"], no_cache=True, commit="abc1234")

    run = build_image.call_args_list[0].args[0]
    assert build_image.call_args_list == [
        mock.call(run, from_env.return_value, "images/src/a", True, "abc1234"),
        mock.call(run, from_env.return_value, "images/src/b", True, "abc1234"),
    ]


def _committed_repo(path) -> pygit2.Repository:
    """Returns a new repository at path with one commit, which adds a .gitignore that ignores ignored.txt."""

    repo = pygit2.init_repository(str(path))
    (path / ".gitignore").write_text("ignored.txt\n")
    repo.index.add(".gitignore")
    repo.index.write()
    signature = pygit2.Signature("Test", "test@example.com")
    repo.create_commit("HEAD", signature, signature, "Initial commit", repo.index.write_tree(), [])
    return repo


def test_devel_commit_reads_the_checked_out_commit(tmp_path) -> None:
    repo = _committed_repo(tmp_path)

    commit = build.devel_commit(str(tmp_path))

    assert commit == repo.revparse_single("HEAD").short_id
    assert re.fullmatch(r"[0-9a-f]{7,}", commit)


def test_devel_commit_finds_the_repository_from_a_subfolder(tmp_path) -> None:
    repo = _committed_repo(tmp_path)
    (tmp_path / "images").mkdir()

    assert build.devel_commit(str(tmp_path / "images")) == repo.revparse_single("HEAD").short_id


def test_devel_commit_ignores_ignored_files(tmp_path) -> None:
    _committed_repo(tmp_path)
    (tmp_path / "ignored.txt").write_text("ignored")

    assert not build.devel_commit(str(tmp_path)).endswith("-dirty")


@pytest.mark.parametrize("change", ["unstaged", "staged", "untracked"])
def test_devel_commit_marks_uncommitted_changes_as_dirty(tmp_path, change: str) -> None:
    repo = _committed_repo(tmp_path)
    sha = repo.revparse_single("HEAD").short_id
    match change:
        case "unstaged":
            (tmp_path / ".gitignore").write_text("changed\n")
        case "staged":
            (tmp_path / "new.txt").write_text("new")
            repo.index.add("new.txt")
            repo.index.write()
        case "untracked":
            (tmp_path / "new.txt").write_text("new")

    assert build.devel_commit(str(tmp_path)) == f"{sha}-dirty"


def test_devel_commit_explains_a_missing_repository(tmp_path) -> None:
    with pytest.raises(RuntimeError, match="Can't read the checked out commit"):
        build.devel_commit(str(tmp_path))


def test_devel_commit_explains_a_repository_without_commits(tmp_path) -> None:
    pygit2.init_repository(str(tmp_path))

    with pytest.raises(RuntimeError, match="has no commits yet"):
        build.devel_commit(str(tmp_path))


def test_devel_commit_explains_an_os_error(tmp_path) -> None:
    with (
        mock.patch.object(build.pygit2, "Repository", side_effect=PermissionError("Permission denied")),
        pytest.raises(RuntimeError, match="Can't read the checked out commit: Permission denied"),
    ):
        build.devel_commit(str(tmp_path))
