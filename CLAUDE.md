# Dev Containers

Dev Container images for `ghcr.io/froazin/devcontainers`, built locally, with the dev-time TypeScript tooling that builds and tests them. Dev Container features are planned. This file is the index for Claude agents: it says what each part holds, which design doc to read before you change it and the rules to follow.

## Contents

1. [Layout](#layout)
1. [Conventions](#conventions)
1. [Ways of working](#ways-of-working)

## Layout

| Path | Holds | Before you change it, read |
| --- | --- | --- |
| `tasks/index.ts` | The entrypoint for `npm run tasks`: the tasks `build`, `test` and `validate`, as thin wrappers around `tasks/images` | Nothing |
| `tasks/images/` | The image package: discovery, builds, tests and validation, with a `<module>.test.ts` beside each module | [docs/images/overview.md](docs/images/overview.md), then the doc for the module |
| `tasks/images/manifest.ts`, `tasks/images/validation.ts` | `MANIFEST_FIELDS` and the `ImageManifest` type, rendering the image template and the manifest checks | [docs/images/manifests.md](docs/images/manifests.md) |
| `tasks/images/build.ts` | Writing `.devcontainer.json`, the Dev Containers command-line interface (CLI) build, the label check and tagging | [docs/images/builds.md](docs/images/builds.md) |
| `tasks/images/testing.ts` | The image test runner | [docs/images/tests.md](docs/images/tests.md) |
| `images/src/template.hbs` | The Handlebars template every image's `.devcontainer.json` is rendered from | [Add an image](docs/images/overview.md#add-an-image), then [docs/images/manifests.md](docs/images/manifests.md) |
| `images/src/<image>/` | An image: `manifest.json`, `Dockerfile`, `README.md` and `devcontainer-init.sh`, which starts systemd | [Add an image](docs/images/overview.md#add-an-image), then [docs/images/manifests.md](docs/images/manifests.md) and [docs/images/systemd.md](docs/images/systemd.md) |
| `images/test/<image>/` | An image's test project: `test.sh` and `test_utils.sh` | [docs/images/tests.md](docs/images/tests.md) |
| `schemas/image-manifest.schema.json` | The JSON schema for `manifest.json` | [docs/images/manifests.md](docs/images/manifests.md) |
| `features/` | Dev Container features, which are planned. None exist yet | Nothing yet |
| `docs/` | The design docs, listed in [Design docs](README.md#design-docs). The rows above name the one to read for each part | [Docs](#docs) in Conventions |
| `REVIEW.md` | Instructions for Claude Code Review on pull requests, and for CI's code review of each image: what counts as Important, the Nit cap, what to skip, what to always check and the evidence a finding needs | [Customize Code Review](https://code.claude.com/docs/en/code-review-customize) |
| `.claude/` | Project settings, rules, skills and the Claude Code hooks in `.claude/hooks/`: each one's TypeScript, its test and its `sh` wrapper | Nothing |
| `.github/workflows/` | `ci.yml` and `ci-images.yml`, the CI for pull requests, including the prompts for the Claude version and code reviews | [CI](README.md#ci), then the comments in each workflow |
| `.github/dependabot.yml` | The weekly dependency updates | Nothing |
| `.vscode/` | Editor settings, including the `json.schemas` mapping that checks each `manifest.json` | [Image manifests](docs/images/manifests.md#overview) |
| `package.json`, `tsconfig.json`, `biome.json`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.shellcheckrc` | npm, TypeScript, Biome and shell tooling settings | Nothing |

## Conventions

### Working in the repository

- For every build, test and lint command, see [Build and test](README.md#build-and-test). [Prerequisites](README.md#prerequisites) and [Set up](README.md#set-up) come before it. Run the commands from the repository root.
- The project runs on an Ubuntu 26.04 Windows Subsystem for Linux (WSL) instance set up with [froazin/dotfiles](https://github.com/froazin/dotfiles), with Docker. Keep the tooling working with Docker. See [Prerequisites](README.md#prerequisites).
- Update the design docs in the same change as the code that makes them out of date.
- **When you review a change locally, such as with `/code-review`, also follow `REVIEW.md` as it is on `main` (`git show main:REVIEW.md`), not a copy the change edits.** `/code-review` reads this file but not `REVIEW.md`, and Code Review on pull requests reads `REVIEW.md` itself. Report the findings `REVIEW.md` calls Important first, and treat its Nit cap as a limit on minor findings.
- The repository is public. Never name or link to a private repository or an internal document, and never write a token, credential, personal path or internal hostname.

### Images

- **Before you add or change an image, read [Add an image](docs/images/overview.md#add-an-image).** It holds the rules for each image's files, build arguments, labels, tags, `version`, template and tests.
- Edit `images/src/template.hbs`, never an image's `.devcontainer.json`. The build generates it, and Git ignores it. See [Add an image](docs/images/overview.md#add-an-image).
- **Before you change a manifest's fields, the schema or `MANIFEST_FIELDS`, follow the `image-manifest` rule in `.claude/rules/`.** It loads the `image-manifest-schema` skill.

### Code

- Node.js runs the TypeScript directly by stripping the types, with no compile step, and `tsc` only type checks. So write only erasable syntax: no enums, namespaces or parameter properties. `erasableSyntaxOnly` in `tsconfig.json` enforces it. Import relative modules with their `.ts` extension.
- Keep `tasks/index.ts` to argument parsing and thin calls into `tasks/images`. It has no tests by design, so put any logic in `tasks/images`, with its tests.
- A function that runs a command takes a `run` callable, and one that talks to Docker takes the client, so the tests can pass fakes. `tasks/images` throws `ImageError` for a failure the user can fix, and `tasks/index.ts` prints its message and exits 1.
- In `tasks/images`, take paths, file names, names and suffixes from `tasks/images/config.ts` rather than writing new copies. `WATCHED` in the hook script is the exception, because it mirrors the rule's `paths`.
- Give each module exactly one test file, `<module>.test.ts`, beside it, and no other test files. The `index.ts` files have none. In it, write one `describe` per function it tests, holding a table of cases that `for (const row of cases) it(row.case, ...)` runs. Keep fakes in the test file that uses them.
- Give every module, class, interface and function, tests included, a short TSDoc `/** */` comment that says what it does, without repeating what its signature already says. Keep comments for why the code does something, not what it does.
- Put hook logic in TypeScript in `.claude/hooks/`, beside its test and the POSIX `sh` wrapper that runs it. `tsconfig.json` and `npm test` name the folder, because their globs skip dot-directories.
- Write shell scripts in POSIX `sh`, not Bash. `/bin/sh` in the Ubuntu images is dash.
- Feature scripts, which are planned, will run on the container's system Python. Import only the standard library and packages the system package manager installs, never packages from PyPI.

### Docs

- State each fact in one doc, and link to it from the others. Link to code with relative paths, rather than copying docstrings or long excerpts.
- Start every doc with a `#` title and a sentence that says what it covers and who it's for. Give every doc in `docs/`, and this file, a `## Contents` list straight after the intro that lists each `##` section in order.
- Give every design doc at least one Mermaid diagram, with an `accTitle`, an `accDescr` and a sentence that introduces it. Validate each diagram you add or change, with a Mermaid Model Context Protocol (MCP) server when one is connected.
- Keep each doc under 200 lines, so agents don't truncate it when they read it. Split a longer one by topic.
- Write in British English, with sentence-case headings, short sentences, the active voice and contractions. Don't write "e.g.", "i.e.", "please", "simply", "just" or "easy", and don't use em dashes or a serial comma. Spell out an abbreviation the first time each doc uses it.
- Describe anything planned as planned. Mark a fact "observed" when you saw it happen, and "inferred" when you didn't check it.

## Ways of working

How this project's repositories, commits, versions and releases work.

| Repository | Path | GitHub | Visibility | Default branch | Kind |
| --- | --- | --- | --- | --- | --- |
| Source | `.` | `froazin/devcontainers` | Public | `main` | Code: pull requests, squash-merged |
| Wiki | `../devcontainers.wiki/` | `froazin/devcontainers.wiki` | Public | `master` | Wiki: direct commits, a push publishes. Planned, to be added after `feature/base` merges |

- **Commit scopes:** `images`, `tasks`, `tooling`, `docs` and `claude`.
- **Releases:** none yet. Nothing is published, images are built locally and there are no Git tags. Each image will be released on its own, with a Git tag `<image>-vX.Y.Z`, such as `base-v1.2.3`, not a repository-wide `vX.Y.Z`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) headers with one of the scopes above, such as `feat(images): Add a Python image`.
- **Versions:** each image has its own `version` in its `manifest.json`, and the version gives its stage: alpha, beta or stable. When and how to bump it is in [Add an image](docs/images/overview.md#add-an-image).
- **CI:** GitHub Actions on every pull request to `main`, with Claude reviews of each changed image's version and of each image's own changed files. See [CI](README.md#ci).
- **Build and test:** see [Build and test](README.md#build-and-test).
- **No `CONTRIBUTING.md`:** external pull requests aren't accepted yet, so there's no `CONTRIBUTING.md`. Add it back only when they're allowed. Until then, `README.md` holds the prerequisites, set-up, build, test and CI facts, so link to [Build and test](README.md#build-and-test) wherever a doc would link to `CONTRIBUTING.md`.
- **User docs:** there's no wiki yet, so each image's `README.md` in `images/src/<image>/` stays its user doc until the wiki exists.
