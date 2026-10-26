# Review instructions

What Claude Code Review flags on pull requests in this repository, at what severity and what it skips. Rules for all work are in `CLAUDE.md`, and a change that breaks one of them is a finding. This file adds only what's specific to reviews.

Judge the images as what ships. Judge the dev-time tooling (`tasks.py`, `devel/`, the Claude Code hook and the CI workflows) by whether a contributor can still build, test and check the images correctly, not by the standards of a production service.

## What Important means here

Mark a finding Important only when the change would do one of these:

- Make an image's contents, labels, tags or version wrong. For example, a change to what an image contains without a version bump, or a template value that renders invalid JSON for some manifest values.
- Break `invoke build`, `invoke test` or `invoke validate` for someone following `README.md`, or make one of them pass when it should fail. The same goes for any other bug that makes the tooling do the wrong thing, such as building, tagging or testing the wrong image.
- Break CI so that it skips an image the pull request changed, builds an image before its version review passes, passes a version the review should fail, or gives `CLAUDE_CODE_OAUTH_TOKEN` to a step that runs the pull request's code. `docs/ci.md` describes how it should work.
- Break the Claude Code hook, so that it blocks an edit it should allow or allows one it should block. That includes blocking edits when uv or the `.venv` is missing.
- Leave the schema, `ImageManifest`, the manifests, the templates or their tests disagreeing.
- Put a secret, token, credential, personal path or internal hostname into the repository, or name or link to a private repository or an internal document. The repository is public.
- Weaken a supply-chain safeguard that the "Tool configuration" section of `docs/dev-tooling.md` or the "The wrapper" section of `docs/claude-code-hooks.md` describes, such as the 7-day release age, the `engines` ranges with `engine-strict` or `python -I`. That includes pinning a GitHub Action to a release less than 7 days old, or to a branch rather than a version tag.
- Make a design doc, `README.md`, an image's `README.md`, `CLAUDE.md`, a rule or a skill say something about the code that's false after the change, so that someone following it would do the wrong thing.

Naming, structure, refactoring ideas, docstrings and doc wording are Nits at most.

## Pre-existing findings

Report a Pre-existing finding only when it would be Important if this pull request had introduced it. Skip anything a design doc's Limits section records.

## Cap the Nits

Report at most five Nits per review. Choose the ones most likely to mislead the maintainer or a Claude agent working from the docs. On a review after new commits, report Nits only on code those commits change.

## Don't report

- Anything Ruff, Pyright, ShellCheck or shfmt reports. Contributors run them, as the "Build and test" section of `README.md` lists.
- Missing tests for `tasks.py`. It holds only thin wrappers, and has no tests by design.
- `NotImplementedError` and its traceback for the `features` suite. That's deliberate until features exist.
- A limit that a design doc's Limits section records, unless the change makes it worse. For example, that a plain build doesn't pull a newer base image, that nothing checks for two images sharing tags or that `test_utils.sh` uses `sort -V`. Do report a change that adds a shared tag, as "Always check" says.
- That there's no `CONTRIBUTING.md`. External pull requests aren't accepted yet.
- The contents of `node_modules/`.

## Always check

These are the rules that no tool, test or check enforces.

### Images

- A change to what an image contains or how it's labelled bumps `version` in its `manifest.json`, in the same pull request. That covers its `Containerfile`, a `template.json` change that changes the built image and the manifest's `name`, `description` or `build_args`. The Version rule in the "Add an image" section of `docs/images/overview.md` says which part to bump.
- A new or changed image follows every rule in the "Add an image" section of `docs/images/overview.md` and the "Labels" section of `docs/images/builds.md`. Its `template.json` passes all four label arguments in `build.args`.
- No manifest's `build_args` uses a label argument's name, and every `build_args` name is in upper snake case. The schema allows lower case.
- No tag repeats a tag of another image.
- The image's `README.md` changes with any change it describes, as the "Rules" section of `docs/images/readmes.md` lists. It mustn't copy a value that another file owns, such as the version, as those Rules say.
- `test.sh` doesn't use `set -e`, and doesn't rely on the variables `test_utils.sh` sets, as the Limits in `docs/images/tests.md` explain.
- Every `test_utils.sh` is an exact copy of `images/test/base/test_utils.sh`. Report a defect in the helpers once, on the base copy, and report another copy only when it differs.
- A pull request doesn't add a file that `.gitignore` ignores, such as a `.devcontainer.json`, `uv.lock` or `package-lock.json`.

### Manifests and the schema

- A change to a manifest field follows the Steps in `.claude/skills/image-manifest-schema/SKILL.md`. In particular, `MANIFEST` in `devel/images/test/test_build.py` lists every field, including optional ones. Nothing checks that.
- A schema change follows the Schema design rules in `docs/images/manifests.md` that `validation.py` doesn't check: a `description` on every property, `examples` for any formatted field and an anchored `pattern` that matches what the code accepts.
- A new type in `SCHEMA_TYPES` also gets a row in the type table under those Schema design rules.

### Python

- Code doesn't catch a broad exception type, such as `Exception` or `RuntimeError`, in a way that turns a bug into a one-line message or hides it.
- A new `devel` function that runs a shell command takes a `Runner`, and doesn't call `subprocess` or `os.system` itself. Nothing in `devel/` calls `sys.exit` except a hook script's `__main__` block.
- A new unit test would fail if the code it tests were wrong, such as by checking the order of steps rather than only that they ran.

### CI

- `PATHS` in `.github/workflows/ci.yml` still covers every path in `SHARED` in `.github/workflows/ci-images.yml`, and every image folder. A path missing from `PATHS` skips the image builds.
- A change to the version rules in the "Add an image" section of `docs/images/overview.md` also changes the review's prompt in `.github/workflows/ci-images.yml`, and the other way round.
- A new action that GitHub doesn't own needs a pattern on the repository's allow list, as the "Set up" section of `docs/ci.md` says. The list isn't in the repository, so report a new one as a Nit that reminds the maintainer to allow it.

### Shell

- Scripts have no Bash-only syntax, such as `[[`, arrays, `source`, `echo -e` or `$'...'`.
- The wrapper and the hook script still exit as the table in the "Interfaces" section of `docs/claude-code-hooks.md` lists.
- `WATCHED` in `devel/hooks/validate_image_manifests.py` and the `paths` front matter of `.claude/rules/image-manifest.md` still agree.

### Docs

- A breach of the Docs conventions in `CLAUDE.md`, such as a fact copied into a second doc, is a Nit, unless it makes a doc false. A private reference or a secret is Important, as "What Important means here" says.

## Evidence

- Cite a `file:line` in this repository for every claim about behaviour. Don't infer behaviour from a name.
- A review doesn't build images or run containers. Claim that a build, a test or a call to podman, Invoke, uv, npm or the Dev Containers command-line interface would fail only when the code or a doc in the repository shows why.
