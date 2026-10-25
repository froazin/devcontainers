"""The manifest.json that describes each image."""

import json
from dataclasses import dataclass, field

import jinja2

from devel.images.config import IMAGE_DEV_SUFFIX


@dataclass(frozen=True, kw_only=True)
class ImageManifest:
    name: str
    description: str
    registry: str
    owner: str
    repo: str
    version: str
    tags: list[str]
    build_args: dict[str, str] = field(default_factory=dict)

    def render_template(self, template: jinja2.Template, commit: str | None = None) -> str:
        """Renders the template with every field, and with image_version and image_source for the image's labels."""
        return template.render(
            **self.__dict__,
            image_version=self.image_version(commit),
            image_source=self.image_source(),
        )

    def image_version(self, commit: str | None = None) -> str:
        """Returns the version for the image's labels: version for a release, or version-dev+<commit> otherwise."""
        return self.version if commit is None else f"{self.version}{IMAGE_DEV_SUFFIX}+{commit}"

    def image_source(self) -> str:
        """Returns the URL of the GitHub repository the image is built from."""
        return f"https://github.com/{self.owner}/{self.repo}"

    def labels(self, commit: str | None = None) -> dict[str, str]:
        """Returns the OCI labels the image's Containerfile sets, for a release or, with commit, a dev build."""
        return {
            "org.opencontainers.image.version": self.image_version(commit),
            "org.opencontainers.image.title": self.name,
            "org.opencontainers.image.description": self.description,
            "org.opencontainers.image.source": self.image_source(),
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
        with open(path) as f:
            return cls(**json.load(f))
