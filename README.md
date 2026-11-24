# Dev Containers

Dev Container images for `ghcr.io/froazin/devcontainers`, with the TypeScript tooling that builds and tests them locally with Docker. Nothing is published yet, and Dev Container features are planned.

## How it's built

Each image has a source folder in `images/src/<image>/` and a test project in `images/test/<image>/`. The npm script `tasks` runs `tasks/index.ts`, a thin wrapper around the `tasks/images` package, which checks each manifest, renders the shared image template, `images/src/template.hbs`, into each image's `.devcontainer.json`, builds the image with the Dev Containers command-line interface (CLI), checks its labels, tags it and runs its tests in a dev container of the image:

```mermaid
flowchart LR
    accTitle: How the images are built and tested
    accDescr: npm run tasks runs tasks/index.ts, which calls the tasks/images package. It checks every manifest against the schema, for the validate task and before any build. The build renders the shared images/src/template.hbs into each image's .devcontainer.json, builds the image with the Dev Containers CLI, then checks its labels and tags it through the Docker API. The test task brings up a dev container of each built image with the Dev Containers CLI, with the image's test project mounted read-only, runs its test.sh there with devcontainer exec, then removes the container through the Docker API.
    tasks[tasks/index.ts] -->|build, test, validate| images[tasks/images]
    schema[schemas/image-manifest.schema.json] -->|the schema for every manifest, read before any build| images
    src["images/src/#lt;image#gt;"] -->|manifest.json| images
    template[images/src/template.hbs] -->|the template every image renders| images
    images -->|writes .devcontainer.json| src
    images -->|devcontainer build| cli[Dev Containers CLI]
    src -->|.devcontainer.json and Dockerfile| cli
    cli -->|builds with docker| store[(Docker image store)]
    images -->|checks the labels and tags the image| store
    tests["images/test/#lt;image#gt;"] -->|the test project, mounted read-only| container[Dev container]
    store -->|image| container
    images -->|devcontainer up and exec| cli
    cli -->|brings up and runs test.sh in| container
    images -->|removes the container| container
```

Node.js runs the TypeScript directly, by stripping the types, so nothing is compiled to JavaScript. TypeScript's own compiler, `tsc`, only type checks.

## Design docs

| Doc | Covers |
| --- | --- |
| [Container images](docs/images/overview.md) | The image pipeline and the rules for adding or changing an image |
| [Image manifests](docs/images/manifests.md) | How the schema, `ImageManifest`, the manifests and the templates are kept in step |
| [Image builds](docs/images/builds.md) | Image names, tags and labels, and why the build works the way it does |
| [Image tests](docs/images/tests.md) | The test runner and the shared `test_utils.sh` helpers |
| [systemd in the images](docs/images/systemd.md) | How every image runs systemd as PID 1, and stops when the editor closes |

## Prerequisites

| Tool | Notes |
| --- | --- |
| Node.js and npm, in the versions `engines` in `package.json` allows | Node.js runs the tasks' TypeScript directly. `npm install` fails on an older npm, which would ignore the release age `.npmrc` sets |
| Docker, with its daemon running | The Dev Containers CLI builds with `docker`, and the tasks tag and test images through Docker's API socket. They use `DOCKER_HOST` when it's set |
| [ShellCheck](https://www.shellcheck.net/) and [shfmt](https://github.com/mvdan/sh) | Not project dependencies |

The project runs on an Ubuntu 26.04 Windows Subsystem for Linux (WSL) instance built with the [froazin/dotfiles WSL provisioning](https://github.com/froazin/dotfiles#wsl-provisioning), with Docker installed. Run `nvm install` in the repository for the Node.js version `.nvmrc` sets.

## Set up

```bash
npm install
```

## Build and test

Run every command from the repository root. npm takes any flag before `--` as its own, so put `--` straight after `npm run tasks` whenever you pass a flag. `npm run tasks -- <task> --help` lists a task's flags.

| Task | Command |
| --- | --- |
| Check the image manifests | `npm run tasks -- validate images` |
| Build every image as a dev build | `npm run tasks -- build images` |
| Build every image as a release | `npm run tasks -- build images --is-release` |
| Build, then test, the images | `npm run tasks -- test images` |
| Test the images already built | `npm run tasks -- test images --skip-build` |
| Lint and check formatting | `npm run lint` |
| Fix formatting and safe lint findings | `npm run format` |
| Type check | `npm run typecheck` |
| Run the unit tests | `npm test` |
| Check shell scripts | `shellcheck images/src/*/*.sh images/test/*.sh images/test/*/*.sh .claude/hooks/*.sh` |
| Check shell formatting | `shfmt -d images/src images/test .claude/hooks` |

The unit tests use fakes for Docker and the Dev Containers CLI. The `build` and `test` tasks create real images and containers in Docker's store.

### CI

GitHub Actions runs the checks above on every pull request to `main`. For each image the pull request changes, Claude Haiku then checks its version against [Add an image](docs/images/overview.md#add-an-image), the image is built and tested, and Claude Sonnet reviews its own files, following `REVIEW.md`. The code review posts each finding as a review comment, and the `Protect Main` ruleset holds the pull request until every comment is resolved. The reasons for each step are in the [workflows](.github/workflows/).

- The reviews need a `CLAUDE_CODE_OAUTH_TOKEN` repository secret. Create it with `claude setup-token`, which prints a token that lasts a year, and save it with `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. Without it, both reviews skip and pass.
- The repository only allows actions owned by GitHub and an allow list, so a new action from anywhere else needs a pattern there, or the run fails to start.

## Licence

MIT. See [LICENSE](LICENSE).
