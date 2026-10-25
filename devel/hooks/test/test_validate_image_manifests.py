import io
import json
import os
import subprocess
from unittest import mock

import pytest
import validate_image_manifests as hook

from devel.images import validation

WRAPPER = os.path.join(hook.ROOT, ".claude", "hooks", "validate_image_manifests.sh")


def _event(file_path: str) -> io.StringIO:
    return io.StringIO(json.dumps({"tool_name": "Edit", "tool_input": {"file_path": file_path}}))


@pytest.mark.parametrize(
    "path",
    [
        "schemas/image-manifest.schema.json",
        "images/src/base/manifest.json",
        "images/src/base/template.json",
        "devel/images/manifest.py",
    ],
)
def test_is_watched_matches_the_files_the_checks_cover(path: str) -> None:
    assert hook.is_watched(str(hook.ROOT / path))


@pytest.mark.parametrize(
    "path",
    ["tasks.py", "images/src/base/Containerfile", "images/src/base/nested/manifest.json", "images/test/base/test.sh"],
)
def test_is_watched_ignores_other_files_in_the_repository(path: str) -> None:
    assert not hook.is_watched(str(hook.ROOT / path))


def test_is_watched_ignores_files_outside_the_repository(tmp_path) -> None:
    assert not hook.is_watched(str(tmp_path / "images" / "src" / "base" / "manifest.json"))
    assert not hook.is_watched("")


def test_edited_file_reads_the_tool_input() -> None:
    assert hook.edited_file({"tool_input": {"file_path": "a.json"}}) == "a.json"
    assert hook.edited_file({"tool_input": "not an object"}) == ""
    assert hook.edited_file([]) == ""


def test_main_skips_files_it_does_not_watch() -> None:
    with mock.patch("sys.stdin", _event(str(hook.ROOT / "tasks.py"))), mock.patch.object(validation, "validate") as v:
        assert hook.main([]) == 0

    v.assert_not_called()


def test_main_ignores_input_that_is_not_json() -> None:
    with mock.patch("sys.stdin", io.StringIO("not json")):
        assert hook.main([]) == 0


def test_main_reports_errors_with_exit_2(capsys: pytest.CaptureFixture[str]) -> None:
    path = str(hook.ROOT / "images/src/base/manifest.json")
    with mock.patch("sys.stdin", _event(path)), mock.patch.object(validation, "validate", return_value=["bad"]):
        assert hook.main([]) == 2

    assert "- bad" in capsys.readouterr().err


def test_main_with_all_checks_without_reading_stdin(capsys: pytest.CaptureFixture[str]) -> None:
    with mock.patch("sys.stdin", io.StringIO("")), mock.patch.object(validation, "validate", return_value=[]):
        assert hook.main(["--all"]) == 0

    assert "agree" in capsys.readouterr().out


def test_wrapper_passes_the_repository_checks() -> None:
    result = subprocess.run([WRAPPER, "--all"], capture_output=True, text=True, check=False)

    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("path", ["tasks.py", "images/src/base/manifest.json"])
def test_wrapper_accepts_a_hook_event(path: str) -> None:
    event = json.dumps({"tool_name": "Edit", "tool_input": {"file_path": str(hook.ROOT / path)}})

    result = subprocess.run([WRAPPER], input=event, capture_output=True, text=True, check=False)

    assert (result.returncode, result.stderr) == (0, "")


def test_wrapper_without_uv_fails_open_but_fails_with_all() -> None:
    env = {**os.environ, "PATH": "/usr/bin:/bin"}
    event = json.dumps({"tool_input": {"file_path": str(hook.ROOT / "images/src/base/manifest.json")}})

    as_hook = subprocess.run([WRAPPER], input=event, capture_output=True, text=True, env=env, check=False)
    by_hand = subprocess.run([WRAPPER, "--all"], capture_output=True, text=True, env=env, check=False)

    assert (as_hook.returncode, by_hand.returncode) == (0, 1)
    assert "uv isn't on PATH" in by_hand.stderr
