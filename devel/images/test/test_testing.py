import os
from unittest import mock

import pytest
from podman.errors import APIError

from devel.images import testing
from devel.images.config import IMAGE_REPOSITORY, IMAGE_TEST_MOUNT
from devel.images.errors import ImageError


def test_project_mount_is_a_read_only_bind_of_the_test_project() -> None:
    mount = testing.project_mount("base", test_folder="images/test")

    assert mount == {
        "type": "bind",
        "source": os.path.abspath("images/test/base"),
        "target": IMAGE_TEST_MOUNT,
        "read_only": True,
        "relabel": "z",
    }


def test_run_container_streams_logs_and_returns_the_exit_code(capsys) -> None:
    container = mock.Mock()
    container.logs.return_value = iter([b"one\n", b"two\n"])
    container.wait.return_value = 3

    assert testing.run_container(container) == 3

    assert capsys.readouterr().out == "one\ntwo\n"
    container.start.assert_called_once()
    container.remove.assert_called_once_with(force=True)


def test_run_container_removes_the_container_when_interrupted() -> None:
    container = mock.Mock()
    container.logs.side_effect = KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        testing.run_container(container)

    container.remove.assert_called_once_with(force=True)


@pytest.mark.parametrize(
    ("release", "message"),
    [
        (False, f"Image {IMAGE_REPOSITORY}:base-dev not found. Build it first with `invoke build images`."),
        (True, f"Image {IMAGE_REPOSITORY}:base not found. Build it first with `invoke build images --is-release`."),
    ],
)
def test_run_image_test_fails_when_the_image_is_not_built(capsys, release: bool, message: str) -> None:
    client = mock.Mock()
    client.images.exists.return_value = False

    assert testing.run_image_test(client, "base", release=release) is False

    assert capsys.readouterr().out.strip() == message
    client.containers.create.assert_not_called()


def test_run_image_test_mounts_the_given_test_folder() -> None:
    client = mock.Mock()
    client.images.exists.return_value = True

    with mock.patch.object(testing, "run_container", return_value=0):
        testing.run_image_test(client, "base", test_folder="other/tests")

    assert client.containers.create.call_args.kwargs["mounts"] == [testing.project_mount("base", "other/tests")]


@pytest.mark.parametrize(("exit_code", "passed"), [(0, True), (1, False)])
def test_run_image_test_runs_the_test_script(exit_code: int, passed: bool) -> None:
    client = mock.Mock()
    client.images.exists.return_value = True

    with mock.patch.object(testing, "run_container", return_value=exit_code) as run_container:
        assert testing.run_image_test(client, "base") is passed

    args, kwargs = client.containers.create.call_args
    assert args == (f"{IMAGE_REPOSITORY}:base-dev", ["/bin/sh", f"{IMAGE_TEST_MOUNT}/test.sh"])
    assert kwargs["working_dir"] == IMAGE_TEST_MOUNT
    assert kwargs["mounts"] == [testing.project_mount("base")]
    run_container.assert_called_once_with(client.containers.create.return_value)


@pytest.mark.parametrize(
    ("release", "image"), [(False, f"{IMAGE_REPOSITORY}:base-dev"), (True, f"{IMAGE_REPOSITORY}:base")]
)
def test_run_image_test_looks_for_the_dev_or_release_build(release: bool, image: str) -> None:
    client = mock.Mock()
    client.images.exists.return_value = True

    with mock.patch.object(testing, "run_container", return_value=0):
        testing.run_image_test(client, "base", release=release)

    client.images.exists.assert_called_once_with(image)
    assert client.containers.create.call_args.args[0] == image


def test_run_image_tests_skips_images_without_a_test_script_and_names_failures(tmp_path, capsys) -> None:
    for name in ["fails", "passes"]:
        (tmp_path / name).mkdir()
        (tmp_path / name / "test.sh").write_text("")
    image_dirs = [f"images/src/{name}" for name in ["fails", "no-tests", "passes"]]

    with (
        mock.patch.object(testing.podman.PodmanClient, "from_env") as from_env,
        mock.patch.object(testing, "run_image_test", side_effect=lambda _, name, *__, **___: name == "passes") as run,
        pytest.raises(ImageError, match=r"^Image tests failed: fails$"),
    ):
        testing.run_image_tests(image_dirs, test_folder=str(tmp_path), release=True)

    client = from_env.return_value.__enter__.return_value
    assert run.call_args_list == [
        mock.call(client, "fails", str(tmp_path), release=True),
        mock.call(client, "passes", str(tmp_path), release=True),
    ]
    assert "Skipping no-tests" in capsys.readouterr().out


def test_run_image_tests_explains_a_failed_podman_api_call(tmp_path) -> None:
    for name in ["fails", "unreachable"]:
        (tmp_path / name).mkdir()
        (tmp_path / name / "test.sh").write_text("")

    with (
        mock.patch.object(testing.podman.PodmanClient, "from_env"),
        mock.patch.object(testing, "run_image_test", side_effect=[False, APIError("GET operation failed")]),
        pytest.raises(ImageError, match=r"^The podman API call failed: GET operation failed\..*failed: fails$"),
    ):
        testing.run_image_tests(["images/src/fails", "images/src/unreachable"], test_folder=str(tmp_path))


def test_run_image_tests_passes_when_every_image_passes(tmp_path) -> None:
    (tmp_path / "base").mkdir()
    (tmp_path / "base" / "test.sh").write_text("")

    with (
        mock.patch.object(testing.podman.PodmanClient, "from_env"),
        mock.patch.object(testing, "run_image_test", return_value=True),
    ):
        testing.run_image_tests(["images/src/base"], test_folder=str(tmp_path))
