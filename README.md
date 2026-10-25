# Dev Containers

## Development

The Python tooling uses the system `python3.14` and a uv-managed virtual environment.

### Set up

1. Create the virtual environment with access to the system site packages, so feature scripts and the editor see the same packages as the target image:

   ```bash
   uv venv --system-site-packages
   ```

1. Install the dev dependencies:

   ```bash
   uv sync
   ```

`uv sync` keeps an existing `.venv` as it is. If `uv sync` runs first, it creates a `.venv` **without** system site packages. Recreate it with `uv venv --system-site-packages --clear`, then run `uv sync` again.

### Feature scripts

Python scripts in features run on the container's system Python (Ubuntu 26.04 LTS, Python 3.14). Import only the standard library and packages that the system package manager installs, never packages from PyPI.

### Commands

| Task | Command |
| --- | --- |
| List tasks | `uv run inv --list` |
| Lint | `uv run ruff check .` |
| Format | `uv run ruff format .` |
| Type check | `uv run pyright` |
| Test | `uv run pytest` |
