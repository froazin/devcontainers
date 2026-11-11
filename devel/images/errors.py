"""The error devel.images raises for a failure the user can fix."""


class ImageError(Exception):
    """A failure the user can fix, such as a manifest that breaks the schema or an image with the wrong labels.

    Its message is ready to show as it is. tasks.py turns it into an Exit with status 1. Any other exception is a bug,
    so it keeps its traceback.
    """


def podman_api_error(error: Exception) -> ImageError:
    """Returns an ImageError for a podman API call that failed, such as when podman's API socket isn't running."""

    return ImageError(
        f"The podman API call failed: {error}. Check that podman's API socket is running, such as with "
        "`systemctl --user status podman.socket`."
    )
