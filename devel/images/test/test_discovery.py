import os

from devel.images import discovery


def _make_image(src, name: str, files: tuple[str, ...] = ("manifest.json", "template.json")) -> None:
    image_dir = src / name
    image_dir.mkdir()
    for file in files:
        (image_dir / file).write_text("{}")


def test_returns_image_dirs_in_name_order(tmp_path) -> None:
    for name in ["zeta", "alpha", "base"]:
        _make_image(tmp_path, name)

    dirs = discovery.image_dirs(src_folder=str(tmp_path))

    assert dirs == [os.path.join(tmp_path, name) for name in ["alpha", "base", "zeta"]]


def test_ignores_files(tmp_path) -> None:
    _make_image(tmp_path, "base")
    (tmp_path / "README.md").write_text("")

    assert discovery.image_dirs(src_folder=str(tmp_path)) == [os.path.join(tmp_path, "base")]


def test_skips_images_missing_a_manifest_or_template(tmp_path, capsys) -> None:
    _make_image(tmp_path, "base")
    _make_image(tmp_path, "empty", files=())
    _make_image(tmp_path, "no-template", files=("manifest.json",))

    dirs = discovery.image_dirs(src_folder=str(tmp_path))

    assert dirs == [os.path.join(tmp_path, "base")]
    out = capsys.readouterr().out
    assert "Skipping empty: manifest.json, template.json not found." in out
    assert "Skipping no-template: template.json not found." in out


def test_filter_matches_names_as_a_glob(tmp_path) -> None:
    for name in ["base", "ubuntu-22.04", "ubuntu-26.04"]:
        _make_image(tmp_path, name)

    assert discovery.image_dirs("base", src_folder=str(tmp_path)) == [os.path.join(tmp_path, "base")]
    assert discovery.image_dirs("ubuntu-*", src_folder=str(tmp_path)) == [
        os.path.join(tmp_path, "ubuntu-22.04"),
        os.path.join(tmp_path, "ubuntu-26.04"),
    ]
    assert discovery.image_dirs("Base", src_folder=str(tmp_path)) == []


def test_filter_does_not_report_skipped_images_it_excludes(tmp_path, capsys) -> None:
    _make_image(tmp_path, "base")
    _make_image(tmp_path, "empty", files=())

    discovery.image_dirs("base", src_folder=str(tmp_path))

    assert "Skipping" not in capsys.readouterr().out
