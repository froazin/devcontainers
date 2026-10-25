import json
import re
import shutil
from unittest import mock

import jinja2
import pygit2
import pytest
from podman.errors import APIError

from devel.images import build
from devel.images.config import IMAGE_REPOSITORY
from devel.images.errors import ImageError
from devel.images.manifest import ImageManifest

MANIFEST = ImageManifest(
    name="Ubuntu",
    description="Base image",
    version="0.0.1",
    tags=["base"],
    build_args={"BASE_IMAGE": "ubuntu:26.04", "OTHER": 'quote "this"'},
)

# The build args the base template adds for the image's labels, for a release build of MANIFEST.
LABEL_ARGS = {
    "IMAGE_VERSION": "0.0.1",
    "IMAGE_TITLE": "Ubuntu",
    "IMAGE_DESCRIPTION": "Base image",
    "IMAGE_SOURCE": "https://github.com/froazin/devcontainers",
}


def _image_dir(tmp_path, manifest: dict[str, object] | None = None, template: bool = True) -> str:
    """Returns a new image folder called base, with MANIFEST, or manifest, and the base image's template."""

    image_dir = tmp_path / "base"
    image_dir.mkdir()
    (image_dir / "manifest.json").write_text(json.dumps(manifest or MANIFEST.__dict__))
    if template:
        shutil.copy("images/src/base/template.json", image_dir / "template.json")
    return str(image_dir)


def test_render_devcontainer_renders_the_base_template_to_valid_json(tmp_path) -> None:
    shutil.copy("images/src/base/template.json", tmp_path / "template.json")

    build.render_devcontainer(str(tmp_path), MANIFEST)

    devcontainer = json.loads((tmp_path / ".devcontainer.json").read_text())
    assert devcontainer["name"] == "Ubuntu"
    assert devcontainer["build"]["args"] == {**MANIFEST.build_args, **LABEL_ARGS}


def test_render_devcontainer_renders_the_dev_version_for_a_commit(tmp_path) -> None:
    shutil.copy("images/src/base/template.json", tmp_path / "template.json")

    build.render_devcontainer(str(tmp_path), MANIFEST, commit="abc1234-dirty")

    args = json.loads((tmp_path / ".devcontainer.json").read_text())["build"]["args"]
    assert args["IMAGE_VERSION"] == "0.0.1-dev+abc1234-dirty"


def test_render_devcontainer_renders_empty_build_args(tmp_path) -> None:
    shutil.copy("images/src/base/template.json", tmp_path / "template.json")
    manifest = ImageManifest(**{**MANIFEST.__dict__, "build_args": {}})

    build.render_devcontainer(str(tmp_path), manifest)

    assert json.loads((tmp_path / ".devcontainer.json").read_text())["build"]["args"] == LABEL_ARGS


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


def test_install_cli_runs_npm_install() -> None:
    commands: list[str] = []

    build.install_cli(commands.append)

    assert commands == ["npm install"]


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
    image = mock.Mock()

    build.tag_image(image, "repo:base", ["base", "base-0"])

    assert image.tag.call_args_list == [
        mock.call(repository=IMAGE_REPOSITORY, tag="base"),
        mock.call(repository=IMAGE_REPOSITORY, tag="base-0"),
    ]


def _labelled_client(labels: dict[str, str]) -> mock.Mock:
    """Returns a mock podman client whose images all have labels."""

    client = mock.Mock()
    client.images.get.return_value.labels = labels
    return client


def test_check_labels_passes_matching_labels() -> None:
    labels = MANIFEST.labels()

    build.check_labels(mock.Mock(labels={**labels, "other": "label"}), "repo:base", labels)


@pytest.mark.parametrize("labels", [None, {}, {**MANIFEST.labels(), "org.opencontainers.image.version": "0.0.0"}])
def test_check_labels_rejects_missing_or_wrong_labels(labels: dict[str, str] | None) -> None:
    with pytest.raises(ImageError, match=r"^Image repo:base has the wrong labels: org\.opencontainers\.image\.version"):
        build.check_labels(mock.Mock(labels=labels), "repo:base", MANIFEST.labels())


def test_build_image_renders_builds_checks_then_tags(tmp_path) -> None:
    image_dir = _image_dir(tmp_path)
    client = mock.Mock()
    steps = mock.Mock()
    ref = f"{IMAGE_REPOSITORY}:base"

    with (
        mock.patch.object(build, "render_devcontainer", steps.render_devcontainer),
        mock.patch.object(build, "devcontainer_build", steps.devcontainer_build),
        mock.patch.object(build, "check_labels", steps.check_labels),
        mock.patch.object(build, "tag_image", steps.tag_image),
    ):
        build.build_image(steps.run, client, image_dir, no_cache=True)

    image = client.images.get.return_value
    assert steps.mock_calls == [
        mock.call.render_devcontainer(image_dir, MANIFEST, None),
        mock.call.devcontainer_build(steps.run, image_dir, ref, True),
        mock.call.check_labels(image, ref, MANIFEST.labels()),
        mock.call.tag_image(image, ref, MANIFEST.image_tags()),
    ]
    client.images.get.assert_called_once_with(ref)


def test_build_image_checks_the_version_before_building(tmp_path) -> None:
    image_dir = _image_dir(tmp_path, {**MANIFEST.__dict__, "version": "1.0"}, template=False)
    commands: list[str] = []

    with pytest.raises(ValueError):
        build.build_image(commands.append, mock.Mock(), image_dir)

    assert commands == []


def test_build_image_builds_a_dev_build_when_given_a_commit(tmp_path) -> None:
    image_dir = _image_dir(tmp_path)
    commands: list[str] = []
    client = _labelled_client(MANIFEST.labels("abc1234"))

    build.build_image(commands.append, client, image_dir, commit="abc1234")

    assert f"--image-name={IMAGE_REPOSITORY}:base-dev " in commands[0]
    client.images.get.assert_called_once_with(f"{IMAGE_REPOSITORY}:base-dev")
    tags = [c.kwargs["tag"] for c in client.images.get.return_value.tag.call_args_list]
    assert tags == ["base-dev", "base-dev_abc1234"]
    args = json.loads((tmp_path / "base" / ".devcontainer.json").read_text())["build"]["args"]
    assert args["IMAGE_VERSION"] == "0.0.1-dev+abc1234"


def test_build_image_doesnt_tag_an_image_with_the_wrong_labels(tmp_path) -> None:
    image_dir = _image_dir(tmp_path)
    client = _labelled_client(MANIFEST.labels("old1234"))

    with pytest.raises(ImageError, match="has the wrong labels"):
        build.build_image([].append, client, image_dir, commit="abc1234")

    client.images.get.return_value.tag.assert_not_called()


@pytest.mark.parametrize(("release", "commit"), [(False, "abc1234"), (True, None)])
def test_build_images_checks_and_installs_before_building_each_image(release: bool, commit: str | None) -> None:
    steps = mock.Mock()
    steps.dev_commit.return_value = "abc1234"

    with (
        mock.patch.object(build, "check_manifests", steps.check_manifests),
        mock.patch.object(build, "dev_commit", steps.dev_commit),
        mock.patch.object(build, "install_cli", steps.install_cli),
        mock.patch.object(build, "build_image", steps.build_image),
        mock.patch.object(build.podman.PodmanClient, "from_env") as from_env,
    ):
        build.build_images(steps.run, ["images/src/a", "images/src/b"], no_cache=True, release=release)

    client = from_env.return_value.__enter__.return_value
    assert steps.mock_calls == [
        mock.call.check_manifests(),
        *([] if release else [mock.call.dev_commit()]),
        mock.call.install_cli(steps.run),
        mock.call.build_image(steps.run, client, "images/src/a", no_cache=True, commit=commit),
        mock.call.build_image(steps.run, client, "images/src/b", no_cache=True, commit=commit),
    ]


def test_build_images_stops_before_installing_when_a_check_fails() -> None:
    with (
        mock.patch.object(build, "check_manifests", side_effect=ImageError("The image manifest checks failed:")),
        mock.patch.object(build, "install_cli") as install_cli,
        mock.patch.object(build, "build_image") as build_image,
        pytest.raises(ImageError),
    ):
        build.build_images([].append, ["images/src/a"], release=True)

    install_cli.assert_not_called()
    build_image.assert_not_called()


def test_build_images_explains_a_failed_podman_api_call() -> None:
    with (
        mock.patch.object(build, "check_manifests"),
        mock.patch.object(build, "install_cli"),
        mock.patch.object(build.podman.PodmanClient, "from_env"),
        mock.patch.object(build, "build_image", side_effect=APIError("GET operation failed")),
        pytest.raises(ImageError, match=r"^The podman API call failed: GET operation failed\. .*podman\.socket"),
    ):
        build.build_images([].append, ["images/src/a"], release=True)


def _committed_repo(path) -> pygit2.Repository:
    """Returns a new repository at path with one commit, which adds a .gitignore that ignores ignored.txt."""

    repo = pygit2.init_repository(str(path))
    (path / ".gitignore").write_text("ignored.txt\n")
    repo.index.add(".gitignore")
    repo.index.write()
    signature = pygit2.Signature("Test", "test@example.com")
    repo.create_commit("HEAD", signature, signature, "Initial commit", repo.index.write_tree(), [])
    return repo


def test_dev_commit_reads_the_checked_out_commit(tmp_path) -> None:
    repo = _committed_repo(tmp_path)

    commit = build.dev_commit(str(tmp_path))

    assert commit == repo.revparse_single("HEAD").short_id
    assert re.fullmatch(r"[0-9a-f]{7,}", commit)


def test_dev_commit_finds_the_repository_from_a_subfolder(tmp_path) -> None:
    repo = _committed_repo(tmp_path)
    (tmp_path / "images").mkdir()

    assert build.dev_commit(str(tmp_path / "images")) == repo.revparse_single("HEAD").short_id


def test_dev_commit_ignores_ignored_files(tmp_path) -> None:
    _committed_repo(tmp_path)
    (tmp_path / "ignored.txt").write_text("ignored")

    assert not build.dev_commit(str(tmp_path)).endswith("-dirty")


@pytest.mark.parametrize("change", ["unstaged", "staged", "untracked"])
def test_dev_commit_marks_uncommitted_changes_as_dirty(tmp_path, change: str) -> None:
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

    assert build.dev_commit(str(tmp_path)) == f"{sha}-dirty"


def test_dev_commit_explains_a_missing_repository(tmp_path) -> None:
    with pytest.raises(ImageError, match="Can't read the checked out commit"):
        build.dev_commit(str(tmp_path))


def test_dev_commit_explains_a_repository_without_commits(tmp_path) -> None:
    pygit2.init_repository(str(tmp_path))

    with pytest.raises(ImageError, match="has no commits yet"):
        build.dev_commit(str(tmp_path))


def test_dev_commit_explains_an_os_error(tmp_path) -> None:
    with (
        mock.patch.object(build.pygit2, "Repository", side_effect=PermissionError("Permission denied")),
        pytest.raises(ImageError, match="Can't read the checked out commit: Permission denied"),
    ):
        build.dev_commit(str(tmp_path))
