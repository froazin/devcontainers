"""The manifest.json that describes each image, and rendering the image's template.json with it."""

import dataclasses
import json
from dataclasses import dataclass, field

import jinja2

from devel.images.config import IMAGE_DEV_SUFFIX, IMAGE_SOURCE, IMAGE_TEMPLATE_FILE


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

    def template_vars(self, commit: str | None = None) -> dict[str, object]:
        """Returns the variables template.json can use: every field, plus image_version and image_source."""
        # dict() raises TypeError if a field is ever named like one of the extra variables, rather than hiding it.
        return dict(**dataclasses.asdict(self), image_version=self.image_version(commit), image_source=IMAGE_SOURCE)

    def image_version(self, commit: str | None = None) -> str:
        """Returns the version for the image's labels: version for a release, or version-dev+<commit> otherwise."""
        return self.version if commit is None else f"{self.version}{IMAGE_DEV_SUFFIX}+{commit}"

    def labels(self, commit: str | None = None) -> dict[str, str]:
        """Returns the OCI labels the image's Containerfile sets, for a release or, with commit, a dev build."""
        return {
            "org.opencontainers.image.version": self.image_version(commit),
            "org.opencontainers.image.title": self.name,
            "org.opencontainers.image.description": self.description,
            "org.opencontainers.image.source": IMAGE_SOURCE,
        }

    def image_tags(self) -> list[str]:
        """Returns the release tags: each tag alone and with -MAJOR, -MAJOR.MINOR and -MAJOR.MINOR.PATCH suffixes."""
        major, minor, patch = map(int, self.version.split("."))
        suffixes = ["", f"-{major}", f"-{major}.{minor}", f"-{major}.{minor}.{patch}"]
        return [f"{tag}{suffix}" for tag in self.tags for suffix in suffixes]

    def dev_tags(self, commit: str) -> list[str]:
        """Returns the tags for a build that isn't a release: each tag with -dev, alone and with a _<commit> suffix."""
        return [f"{tag}{IMAGE_DEV_SUFFIX}{suffix}" for tag in self.tags for suffix in ["", f"_{commit}"]]

    @classmethod
    def from_json(cls, path: str) -> ImageManifest:
        """Reads a manifest.json without checking it against the schema. A missing or unknown field raises TypeError."""
        with open(path) as f:
            return cls(**json.load(f))


def render_template(image_dir: str, manifest: ImageManifest, commit: str | None = None) -> str:
    """Returns the image's template.json rendered with its manifest, for a release or, with commit, a dev build.

    A variable the template uses but the manifest doesn't have raises jinja2.UndefinedError.
    """

    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(image_dir),
        undefined=jinja2.StrictUndefined,
        keep_trailing_newline=True,
    )

    return env.get_template(IMAGE_TEMPLATE_FILE).render(manifest.template_vars(commit))
