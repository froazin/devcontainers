"""The error utilities.images raises for a failure the user can fix."""


class ImageError(Exception):
    """A failure the user can fix, with a message ready to show. Any other exception is a bug."""


def podman_api_error(error: Exception) -> ImageError:
    """Returns an ImageError for a failed podman API call, with a hint to check the socket."""
    return ImageError(
        f"The podman API call failed: {error}. Check that podman's API socket is running, such as with "
        "`systemctl --user status podman.socket`."
    )
