"""The manifest.json that describes each image, and rendering the image's template.json with it."""

import dataclasses
import json
from dataclasses import dataclass, field

import jinja2

from utilities.images.config import IMAGE_DEV_SUFFIX, IMAGE_SOURCE, IMAGE_TEMPLATE_FILE, IMAGE_VERSION_PREFIX


@dataclass(frozen=True, kw_only=True)
class ImageManifest:
    """An image's manifest.json. utilities.images.validation checks that it agrees with the schema."""

    name: str
    description: str
    version: str
    tags: list[str]
    build_args: dict[str, str] = field(default_factory=dict)

    def template_vars(self, release: bool = True) -> dict[str, object]:
        """Returns every field, plus the values the label build arguments need."""
        # dict() raises TypeError if a field is ever named like one of the extra variables, rather than hiding it.
        return dict(**dataclasses.asdict(self), image_version=self.image_version(release), image_source=IMAGE_SOURCE)

    def image_version(self, release: bool = True) -> str:
        """Returns the version label: v<version>, with -dev for a dev build."""
        return f"{IMAGE_VERSION_PREFIX}{self.version}{'' if release else IMAGE_DEV_SUFFIX}"

    def labels(self, release: bool = True) -> dict[str, str]:
        """Returns the OCI labels the build checks on the image."""
        return {
            "org.opencontainers.image.version": self.image_version(release),
            "org.opencontainers.image.title": self.name,
            "org.opencontainers.image.description": self.description,
            "org.opencontainers.image.source": IMAGE_SOURCE,
        }

    def image_tags(self, release: bool = True) -> list[str]:
        """Returns each tag on its own and with the version suffixes."""
        major, minor, patch = map(int, self.version.split("."))
        v = f"-{IMAGE_VERSION_PREFIX}"
        suffixes = ["", f"{v}{major}", f"{v}{major}.{minor}", f"{v}{major}.{minor}.{patch}"]
        dev = "" if release else IMAGE_DEV_SUFFIX
        return [f"{tag}{suffix}{dev}" for tag in self.tags for suffix in suffixes]

    @classmethod
    def from_json(cls, path: str) -> ImageManifest:
        """Reads a manifest.json without checking it against the schema."""
        with open(path) as f:
            return cls(**json.load(f))


def render_template(image_dir: str, manifest: ImageManifest, release: bool = True) -> str:
    """Renders the image's template.json with the manifest's variables."""
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(image_dir),
        undefined=jinja2.StrictUndefined,
        keep_trailing_newline=True,
    )

    return env.get_template(IMAGE_TEMPLATE_FILE).render(manifest.template_vars(release))
