"""Paths, names and registry settings for the images in this repository."""

DEVCONTAINERS_BASE_COMMAND = " ".join(["npm", "exec", "@devcontainers/cli", "--"])
IMAGES_PROJECT_FOLDER = "images"
IMAGES_SRC_FOLDER = "/".join([IMAGES_PROJECT_FOLDER, "src"])
IMAGES_TEST_FOLDER = "/".join([IMAGES_PROJECT_FOLDER, "test"])
IMAGE_REGISTRY = "ghcr.io"
IMAGE_OWNER = "froazin"
IMAGE_REPO = "devcontainers"
IMAGE_REPOSITORY = "/".join([IMAGE_REGISTRY, IMAGE_OWNER, IMAGE_REPO])
IMAGE_MANIFEST_FILE = "manifest.json"
IMAGE_TEMPLATE_FILE = "template.json"
IMAGE_DEVCONTAINER_FILE = ".devcontainer.json"
IMAGE_TEST_SCRIPT = "test.sh"
IMAGE_TEST_MOUNT = "/test-project"
