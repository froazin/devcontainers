"""The manifest.json that describes each image, and rendering the image's template.json with it."""

import dataclasses
import json
from dataclasses import dataclass, field

import jinja2

from devel.images.config import IMAGE_DEV_SUFFIX, IMAGE_SOURCE, IMAGE_TEMPLATE_FILE, IMAGE_VERSION_PREFIX


@dataclass(frozen=True, kw_only=True)
class ImageManifest:
    """An image's manifest.json, and the version, tags and labels it gives the image's build.

    schemas/image-manifest.schema.json describes each field, and devel.images.validation checks that the two agree.
    """

    name: str
    description: str
    version: str
    tags: list[str]
    build_args: dict[str, str] = field(default_factory=dict)

    def template_vars(self, release: bool = True) -> dict[str, object]:
        """Returns the variables template.json can use: every field, plus image_version and image_source."""
        # dict() raises TypeError if a field is ever named like one of the extra variables, rather than hiding it.
        return dict(**dataclasses.asdict(self), image_version=self.image_version(release), image_source=IMAGE_SOURCE)

    def image_version(self, release: bool = True) -> str:
        """Returns the version for the image's labels: v<version> for a release, or v<version>-dev otherwise."""
        return f"{IMAGE_VERSION_PREFIX}{self.version}{'' if release else IMAGE_DEV_SUFFIX}"

    def labels(self, release: bool = True) -> dict[str, str]:
        """Returns the OCI labels the image's Containerfile sets, for a release or a dev build."""
        return {
            "org.opencontainers.image.version": self.image_version(release),
            "org.opencontainers.image.title": self.name,
            "org.opencontainers.image.description": self.description,
            "org.opencontainers.image.source": IMAGE_SOURCE,
        }

    def image_tags(self, release: bool = True) -> list[str]:
        """Returns each tag alone and with -vMAJOR, -vMAJOR.MINOR and -vMAJOR.MINOR.PATCH suffixes.

        A dev build's tags all end in -dev, such as base-v1.2.3-dev.
        """
        major, minor, patch = map(int, self.version.split("."))
        v = f"-{IMAGE_VERSION_PREFIX}"
        suffixes = ["", f"{v}{major}", f"{v}{major}.{minor}", f"{v}{major}.{minor}.{patch}"]
        dev = "" if release else IMAGE_DEV_SUFFIX
        return [f"{tag}{suffix}{dev}" for tag in self.tags for suffix in suffixes]

    @classmethod
    def from_json(cls, path: str) -> ImageManifest:
        """Reads a manifest.json without checking it against the schema. A missing or unknown field raises TypeError."""
        with open(path) as f:
            return cls(**json.load(f))


def render_template(image_dir: str, manifest: ImageManifest, release: bool = True) -> str:
    """Returns the image's template.json rendered with its manifest, for a release or a dev build.

    A variable the template uses but the manifest doesn't have raises jinja2.UndefinedError.
    """

    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(image_dir),
        undefined=jinja2.StrictUndefined,
        keep_trailing_newline=True,
    )

    return env.get_template(IMAGE_TEMPLATE_FILE).render(manifest.template_vars(release))
