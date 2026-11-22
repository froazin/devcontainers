import io
import json
import os
import shutil
import subprocess
import sys
from unittest import mock

import pytest
import validate_image_manifests as hook

from utilities.images import validation

WRAPPER = os.path.join(hook.ROOT, ".claude", "hooks", "validate_image_manifests.sh")


@pytest.fixture(autouse=True)
def _restore_cwd_and_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """Undoes the os.chdir and sys.path change that main makes, after each test."""

    monkeypatch.chdir(os.getcwd())
    monkeypatch.setattr(sys, "path", list(sys.path))


def _event(file_path: str) -> io.StringIO:
    """Returns stdin holding an Edit hook event for the file."""
    return io.StringIO(json.dumps({"tool_name": "Edit", "tool_input": {"file_path": file_path}}))


@pytest.mark.parametrize(
    "path",
    [
        "schemas/image-manifest.schema.json",
        "images/src/base/manifest.json",
        "images/src/base/template.json",
        "utilities/images/manifest.py",
    ],
)
def test_is_watched_matches_the_files_the_checks_cover(path: str) -> None:
    """Catches an edit to a checked file getting past the hook."""
    assert hook.is_watched(str(hook.ROOT / path))


@pytest.mark.parametrize(
    "path",
    ["tasks.py", "images/src/base/Containerfile", "images/src/base/nested/manifest.json", "images/test/base/test.sh"],
)
def test_is_watched_ignores_other_files_in_the_repository(path: str) -> None:
    """Includes a nested manifest.json, which isn't an image's own manifest."""
    assert not hook.is_watched(str(hook.ROOT / path))


def test_is_watched_ignores_files_outside_the_repository(tmp_path) -> None:
    """Uses the same layout under another folder, so only the repository root counts."""
    assert not hook.is_watched(str(tmp_path / "images" / "src" / "base" / "manifest.json"))
    assert not hook.is_watched("")


def test_edited_file_reads_the_tool_input() -> None:
    """Falls back to an empty path when the event or its input isn't an object."""
    assert hook.edited_file({"tool_input": {"file_path": "a.json"}}) == "a.json"
    assert hook.edited_file({"tool_input": "not an object"}) == ""
    assert hook.edited_file([]) == ""


def test_main_skips_files_it_does_not_watch() -> None:
    """Catches the checks running after an edit to an unwatched file."""
    with mock.patch("sys.stdin", _event(str(hook.ROOT / "tasks.py"))), mock.patch.object(validation, "validate") as v:
        assert hook.main() == 0

    v.assert_not_called()


def test_main_ignores_input_that_is_not_json() -> None:
    """Checks the hook fails open, rather than blocking, on an event it can't parse."""
    with mock.patch("sys.stdin", io.StringIO("not json")):
        assert hook.main() == 0


def test_main_reports_errors_with_exit_2(capsys: pytest.CaptureFixture[str]) -> None:
    """Catches errors not reaching Claude, which only reads the hook's stderr on exit 2."""
    path = str(hook.ROOT / "images/src/base/manifest.json")
    with mock.patch("sys.stdin", _event(path)), mock.patch.object(validation, "validate", return_value=["bad"]):
        assert hook.main() == 2

    assert "- bad" in capsys.readouterr().err


def test_main_passes_the_repository_checks() -> None:
    """Runs the real checks, so it fails when the repository's manifests break."""
    with mock.patch("sys.stdin", _event(str(hook.ROOT / "images/src/base/manifest.json"))):
        assert hook.main() == 0


@pytest.mark.parametrize("path", ["tasks.py", "images/src/base/manifest.json"])
def test_wrapper_accepts_a_hook_event(path: str) -> None:
    """Runs the real sh wrapper, so it catches a broken path or a noisy uv."""
    event = json.dumps({"tool_name": "Edit", "tool_input": {"file_path": str(hook.ROOT / path)}})

    result = subprocess.run([WRAPPER], input=event, capture_output=True, text=True, check=False)

    assert (result.returncode, result.stderr) == (0, "")


@pytest.mark.skipif(
    os.path.dirname(shutil.which("uv") or "") in ("/usr/bin", "/bin"), reason="uv is installed in /usr/bin or /bin"
)
def test_wrapper_without_uv_fails_open() -> None:
    """Drops uv from PATH, so the wrapper must warn and let the edit through."""
    env = {**os.environ, "PATH": "/usr/bin:/bin"}
    event = json.dumps({"tool_input": {"file_path": str(hook.ROOT / "images/src/base/manifest.json")}})

    result = subprocess.run([WRAPPER], input=event, capture_output=True, text=True, env=env, check=False)

    assert result.returncode == 0
    assert "uv isn't on PATH" in result.stderr
