"""Task definitions for the devcontainers project."""

# invoke's top-level module doesn't re-export these for type checkers, so import from the submodules.
from invoke.context import Context
from invoke.tasks import task


@task
def hello(ctx: Context) -> None:
    """Prints a hello message."""
    print("Hello from the devcontainers project!")
