# Review instructions

What Claude Code Review, and CI's code review of each image whose own files a pull request changes, flag on pull requests in this repository, at what severity and what they skip. Rules for all work are in `CLAUDE.md`, and a change that breaks one of them is a finding. This file adds only what's specific to reviews.

Judge the images as what ships. Judge the dev-time tooling (`tasks.py`, `devel/`, the Claude Code hook and the CI workflows) by whether a contributor can still build, test and check the images correctly, not by the standards of a production service.

## What Important means here

Mark a finding Important only when the change would do one of these:

- Make an image's contents, labels, tags or version wrong. For example, a change to what an image contains without a version bump, or a template value that renders invalid JSON for some manifest values.
- Break `invoke build`, `invoke test` or `invoke validate` for someone following `README.md`, or make one of them pass when it should fail. The same goes for any other bug that makes the tooling do the wrong thing, such as building, tagging or testing the wrong image.
- Break CI so that it skips an image the pull request changed, drops or narrows a check that the `checks` job runs, builds any image before `checks` and every changed image's version review pass, passes a version the review should fail, runs the code review before every build passes or gives `CLAUDE_CODE_OAUTH_TOKEN` to a step that runs the pull request's code. `docs/ci.md` describes how it should work.
- Widen what either Claude review in CI can do, such as its `permissions`, its `github_token`, its `--allowedTools` or its `--disallowedTools`, past what the "Security" section of `docs/ci.md` allows, even when the change updates that doc too. Both prompts read text that the pull request's author wrote.
- Break the Claude Code hook, so that it reports errors for a watched edit that passes the checks, misses errors in one that fails them, or exits other than as the table in the "Interfaces" section of `docs/claude-code-hooks.md` lists. That includes exiting non-zero when uv or the `.venv` is missing.
- Leave the schema, `ImageManifest`, the manifests, the templates or their tests disagreeing.
- Put a secret, token, credential, personal path or internal hostname into the repository, or name or link to a private repository or an internal document. The repository is public.
- Weaken a supply-chain safeguard that the "Tool configuration" section of `docs/dev-tooling.md` or the "The wrapper" section of `docs/claude-code-hooks.md` describes, such as the 7-day release age, the `engines` ranges with `engine-strict` or `python -I`. That includes pinning a GitHub Action to a release less than 7 days old, or to a tag or branch rather than a full commit SHA, as the "Decisions" section of `docs/ci.md` says.
- Make a design doc, `README.md`, an image's `README.md`, `CLAUDE.md`, a rule or a skill say something about the code that's false after the change, so that someone following it would do the wrong thing.

Naming, structure, refactoring ideas, docstrings and doc wording are Nits at most.

## Pre-existing issues

Don't report an issue that was there before this pull request, however serious. It's out of scope for the pull request.

## Cap the Nits

Every comment must be resolved before the pull request can merge, so report Nits sparingly: at most three per review, and only ones likely to mislead the maintainer or a Claude agent working from the docs. On a review after new commits, report Nits only on code those commits change. CI's code review posts none from an image's fourth review on a pull request, as the "Code review" section of `docs/ci.md` says.

## Don't report

- Anything Ruff, Pyright, ShellCheck or shfmt reports. Contributors run them, as the "Build and test" section of `README.md` lists.
- A limit that a design doc's Limits section records, unless the change makes it worse. For example, that `tasks.py` has no tests, that the `features` suite fails with a `NotImplementedError` traceback, that a plain build doesn't pull a newer base image, that nothing checks for two images sharing tags or that `test_utils.sh` uses `sort -V`. Do report a change that adds a shared tag, as "Always check" says.
- An issue that a resolved review thread on the pull request already raises, whatever its replies say. Resolving a thread settles it.
- That there's no `CONTRIBUTING.md`, as `CLAUDE.md` explains.
- The contents of `node_modules/`.

## Always check

These are the rules that no tool, test or check enforces.

### Images

- A change to what an image contains or how it's labelled bumps `version` in its `manifest.json`, in the same pull request, to a version newer than every release tag of the image. That covers its `Containerfile`, a `template.json` change that changes the built image and the manifest's `name`, `description` or `build_args`. The Version rule in the "Add an image" section of `docs/images/overview.md` says which part to bump. CI's version review checks this too, but its verdict is Claude's judgement and it doesn't run without `CLAUDE_CODE_OAUTH_TOKEN`, such as on a pull request from a fork, as the "Version review" section of `docs/ci.md` says.
- A new or changed image follows every rule in the "Add an image" section of `docs/images/overview.md` and the "Labels" section of `docs/images/builds.md`. Its `template.json` writes every string value through `tojson`. `invoke validate images` catches a quoted value only once a manifest value holds a character JSON must escape, as the Limits in `docs/images/manifests.md` record.
- No manifest's `build_args` uses a label argument's name, and every `build_args` name is in upper snake case. The schema allows lower case.
- No image's name or tags repeat another image's, including the names and tags the build generates. The "Names and tags" section of `docs/images/builds.md` lists them: the folder name, `-dev` on a dev build and the `-vMAJOR`, `-vMAJOR.MINOR` and `-vMAJOR.MINOR.PATCH` suffixes on every tag. For example, no folder is named `base-dev`, and no other image has the tag `base-v0`. Nothing checks either, as the Limits in `docs/images/overview.md` record.
- The image's `README.md` changes with any change it describes, as the "Rules" section of `docs/images/readmes.md` lists. It mustn't copy a value that another file owns, such as the version, as those Rules say.
- `test.sh` doesn't use `set -e`, and doesn't rely on the variables `test_utils.sh` sets, as the Limits in `docs/images/tests.md` explain.
- Every `test_utils.sh` is an exact copy of `images/test/base/test_utils.sh`. Report a defect in the helpers once, on the base copy, and report another copy only when it differs.
- A pull request doesn't add a file that `.gitignore` ignores, such as an image's generated `images/src/<image>/.devcontainer.json`, `uv.lock` or `package-lock.json`.

### Manifests and the schema

- A change to a manifest field follows the Steps in `.claude/skills/image-manifest-schema/SKILL.md`. In particular, `MANIFEST` in `devel/images/test/test_build.py` lists every field, including optional ones. Nothing checks that.
- A schema change follows the Schema design rules in `docs/images/manifests.md` that `validation.py` doesn't check: `$schema` set to draft 2020-12, a `description` on every property, `examples` for any formatted field and an anchored `pattern` that matches what the code accepts.
- A change to the code that uses a manifest field, such as `image_tags` or `image_version`, keeps the field's `description` in the schema true. For example, the `tags` description lists the suffixes `image_tags` adds.
- A new type in `SCHEMA_TYPES` also gets a row in the type table under those Schema design rules.

### Python

- Code doesn't catch a broad exception type, such as `Exception` or `RuntimeError`, in a way that turns a bug into a one-line message or hides it.
- No `devel` code outside its `test/` folders calls `subprocess` or `os.system` itself. Nothing in `devel/` exits the process, such as with `sys.exit` or `raise SystemExit`, except a hook script's `__main__` block, as the "Between tasks.py and devel" section of `docs/dev-tooling.md` says.
- A new unit test would fail if the code it tests were wrong, such as by checking the order of steps rather than only that they ran.

### CI

- `PATHS` in `.github/workflows/ci.yml` still covers every path in `SHARED` in `.github/workflows/ci-images.yml`, and every image folder. A path missing from `PATHS` skips the image builds.
- A change to the version rules in the "Add an image" section of `docs/images/overview.md` also changes the version review's prompt in `.github/workflows/ci-images.yml`, and the other way round.
- A change to this file's severities, its Nit cap or what it says about pre-existing issues also changes the code review's prompt in `.github/workflows/ci-images.yml`, and the other way round.
- A new action that GitHub doesn't own needs a pattern on the repository's allow list, as the "Set up" section of `docs/ci.md` says. The list isn't in the repository, so report a new one as a Nit that reminds the maintainer to allow it.

### Shell

- Every shell script starts with `#!/usr/bin/env sh`, because ShellCheck checks a Bash script as Bash. A `RUN` instruction in a `Containerfile`, or a script outside `images/test/` and `.claude/hooks/`, has no Bash-only syntax, such as `[[`, arrays, `source`, `echo -e` or `$'...'`. ShellCheck and shfmt don't check them.
- The wrapper and the hook script still exit as the table in the "Interfaces" section of `docs/claude-code-hooks.md` lists, for the rows that `devel/hooks/test/test_validate_image_manifests.py` doesn't test. No test covers exit 1, from a failed import or an exception other than `ImageError`, the wrapper's exit 0 when there's no `.venv`, or its exit 2 when uv can't sync the `.venv`.
- `WATCHED` in `devel/hooks/validate_image_manifests.py` and the `paths` front matter of `.claude/rules/image-manifest.md` still agree.

### Docs

- A breach of the Docs conventions in `CLAUDE.md`, such as a fact copied into a second doc, is a Nit, unless it makes a doc false. A private reference or a secret is Important, as "What Important means here" says.

## Evidence

- Cite a `file:line` in this repository for every claim about behaviour. Don't infer behaviour from a name.
- A review doesn't build images or run containers. Claim that a build, a test or a call to podman, Invoke, uv, npm or the Dev Containers command-line interface would fail only when the code or a doc in the repository shows why.
