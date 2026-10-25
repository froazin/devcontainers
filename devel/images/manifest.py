"""The manifest.json that describes each image."""

import json
from dataclasses import dataclass, field

import jinja2


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

    def render_template(self, template: jinja2.Template) -> str:
        return template.render(**self.__dict__)

    def image_tags(self) -> list[str]:
        """Returns the release tags: each tag alone and with -MAJOR, -MAJOR.MINOR and -MAJOR.MINOR.PATCH suffixes."""
        major, minor, patch = map(int, self.version.split("."))
        suffixes = ["", f"-{major}", f"-{major}.{minor}", f"-{major}.{minor}.{patch}"]
        return [f"{tag}{suffix}" for tag in self.tags for suffix in suffixes]

    def commit_tags(self, commit: str) -> list[str]:
        """Returns the tags for a build that isn't a release: each tag on its own and with a -<commit> suffix."""
        return [f"{tag}{suffix}" for tag in self.tags for suffix in ["", f"-{commit}"]]

    @classmethod
    def from_json(cls, path: str) -> ImageManifest:
        with open(path) as f:
            return cls(**json.load(f))
