"""Paths, names and registry settings for the images in this repository."""

DEVCONTAINERS_BASE_COMMAND = ("npm", "exec", "@devcontainers/cli", "--")
IMAGES_PROJECT_FOLDER = "images"
IMAGES_SRC_FOLDER = "/".join([IMAGES_PROJECT_FOLDER, "src"])
IMAGES_TEST_FOLDER = "/".join([IMAGES_PROJECT_FOLDER, "test"])
IMAGE_REGISTRY = "ghcr.io"
IMAGE_OWNER = "froazin"
IMAGE_REPO = "devcontainers"
IMAGE_REPOSITORY = "/".join([IMAGE_REGISTRY, IMAGE_OWNER, IMAGE_REPO])
IMAGE_SOURCE = "/".join(["https://github.com", IMAGE_OWNER, IMAGE_REPO])
IMAGE_DEV_SUFFIX = "-dev"
IMAGE_VERSION_PREFIX = "v"
IMAGE_MANIFEST_FILE = "manifest.json"
IMAGE_MANIFEST_SCHEMA = "schemas/image-manifest.schema.json"
IMAGE_TEMPLATE_FILE = "template.json"
IMAGE_DEVCONTAINER_FILE = ".devcontainer.json"
IMAGE_TEST_SCRIPT = "test.sh"
IMAGE_TEST_MOUNT = "/test-project"


def image_name(name: str, release: bool) -> str:
    """Returns the name the build gives an image and the tests look for.

    That's <IMAGE_REPOSITORY>:<name> for a release, and <IMAGE_REPOSITORY>:<name>-dev for any other build.
    """

    return f"{IMAGE_REPOSITORY}:{name}{'' if release else IMAGE_DEV_SUFFIX}"
