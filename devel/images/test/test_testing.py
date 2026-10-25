import os
from unittest import mock

import pytest

from devel.images import testing
from devel.images.config import IMAGE_REPOSITORY, IMAGE_TEST_MOUNT


def test_test_mount_is_a_read_only_bind_of_the_test_project() -> None:
    mount = testing.test_mount("base", test_folder="images/test")

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


def test_test_image_fails_when_the_image_is_not_built(capsys) -> None:
    client = mock.Mock()
    client.images.exists.return_value = False

    assert testing.test_image(client, "base") is False

    assert "Build it first" in capsys.readouterr().out
    client.containers.create.assert_not_called()


@pytest.mark.parametrize(("exit_code", "passed"), [(0, True), (1, False)])
def test_test_image_runs_the_test_script(exit_code: int, passed: bool) -> None:
    client = mock.Mock()
    client.images.exists.return_value = True

    with mock.patch.object(testing, "run_container", return_value=exit_code) as run_container:
        assert testing.test_image(client, "base") is passed

    args, kwargs = client.containers.create.call_args
    assert args == (f"{IMAGE_REPOSITORY}:base", ["/bin/sh", f"{IMAGE_TEST_MOUNT}/test.sh"])
    assert kwargs["working_dir"] == IMAGE_TEST_MOUNT
    assert kwargs["mounts"] == [testing.test_mount("base")]
    run_container.assert_called_once_with(client.containers.create.return_value)


def test_test_images_skips_images_without_a_test_script_and_returns_failures(tmp_path, capsys) -> None:
    for name in ["fails", "passes"]:
        (tmp_path / name).mkdir()
        (tmp_path / name / "test.sh").write_text("")
    image_dirs = [f"images/src/{name}" for name in ["fails", "no-tests", "passes"]]

    with (
        mock.patch.object(testing.podman.PodmanClient, "from_env"),
        mock.patch.object(testing, "test_image", side_effect=lambda _, name: name == "passes") as test_image,
    ):
        failed = testing.test_images(image_dirs, test_folder=str(tmp_path))

    assert failed == ["fails"]
    assert [c.args[1] for c in test_image.call_args_list] == ["fails", "passes"]
    assert "Skipping no-tests" in capsys.readouterr().out
