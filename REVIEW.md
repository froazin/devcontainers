# Review instructions

What Claude Code Review, and CI's code review of each image whose own files a pull request changes, flag on pull requests in this repository, at what severity and what they skip. Rules for all work are in `CLAUDE.md`, and a change that breaks one of them is a finding.

Judge the images as what ships. Judge the dev-time tooling (`tasks/`, the Claude Code hook and the CI workflows) by whether a contributor can still build, test and check the images correctly, not by the standards of a production service.

## What Important means here

Mark a finding Important only when the change would do one of these:

- Make an image's contents, labels, tags or version wrong, such as a change to what an image contains without a version bump.
- Break `npm run tasks -- build`, `test` or `validate`, make one of them pass when it should fail, or make the tooling build, tag or test the wrong image.
- Break CI so that it skips an image the pull request changed or a check the `checks` job runs, builds before the checks and version reviews pass or passes a version the review should fail.
- Widen what either Claude review in CI can do, or give `CLAUDE_CODE_OAUTH_TOKEN` to a step that runs the pull request's code. Both reviews read text the pull request's author wrote. The version review may only run git's read commands and read files, with a read-only `github_token`. The code review may only read files and post review comments. Neither may run `npm`, `npx` or `node`, which would run the pull request's tasks with the token.
- Change how the Claude Code hook exits, so that Claude misses errors it should see, or a missing `node` or `node_modules` blocks Claude. Claude only sees the hook's stderr on exit 2.
- Leave the schema, `MANIFEST_FIELDS`, the manifests, the image template or their tests disagreeing.
- Change `images/src/template.hbs` so that it changes an image's rendered `.devcontainer.json` without bumping that image's version.
- Weaken a supply-chain safeguard, such as the 7-day release age, `engine-strict`, the hook wrapper's `unset NODE_OPTIONS` or pinning each action to the full commit SHA of a release at least 7 days old.
- Put a secret, token, credential, personal path or internal hostname into the repository, or name or link to a private repository or an internal document. The repository is public.
- Make a doc, a README, `CLAUDE.md`, a rule or a skill say something about the code that's false after the change, so that someone following it would do the wrong thing.

Naming, structure, refactoring ideas, docstrings and doc wording are Nits at most.

## Pre-existing issues

Don't report an issue that was there before this pull request, however serious. It's out of scope for the pull request.

## Cap the Nits

Every comment must be resolved before the pull request can merge, so report Nits sparingly: at most three per review, and only ones likely to mislead the maintainer or a Claude agent working from the docs. On a review after new commits, report Nits only on code those commits change. CI's code review posts none from an image's fourth review on a pull request.

## Don't report

- Anything Biome, `tsc`, ShellCheck or shfmt reports.
- A limit that a design doc's Limits section records, unless the change makes it worse.
- An issue that a resolved review thread on the pull request already raises, whatever its replies say.
- That there's no `CONTRIBUTING.md`, as `CLAUDE.md` explains, or anything in `node_modules/`.

## Always check

Nothing enforces these:

- A new or changed image follows "Add an image" in `docs/images/overview.md`, including its version rules, its layer order and writing every template value through the `json` helper.
- No image's name or tags repeat another's, including the `-dev` and version suffixes the build adds, as "Names and tags" in `docs/images/builds.md` lists.
- Every `test_utils.sh` matches `images/test/base/test_utils.sh`. Report a defect in the helpers once, on the base copy.
- A manifest field change updates `MANIFEST` in `tasks/images/build.test.ts`, which lists every field, including optional ones, and follows the "Schema design rules" in `docs/images/manifests.md`.
- `PATHS` in `.github/workflows/ci.yml` still covers every path in `SHARED` in `.github/workflows/ci-images.yml`, and every image folder.
- The version rules in "Add an image" and the version review's prompt in `ci-images.yml` still agree. So do this file's severities, Nit cap and rule on pre-existing issues and the code review's prompt.
- `WATCHED` in `.claude/hooks/validate_image_manifests.ts` and the `paths` of `.claude/rules/image-manifest.md` still agree.
- A `RUN` instruction in a `Dockerfile` has no Bash-only syntax, because `/bin/sh` is dash and ShellCheck doesn't see it.
- No generated or ignored file is added, such as an image's `.devcontainer.json` or `package-lock.json`.
- A new action that GitHub doesn't own needs a pattern on the repository's allow list, which isn't in the repository. Report it as a Nit that reminds the maintainer.

## Evidence

- Cite a `file:line` in this repository for every claim about behaviour. Don't infer behaviour from a name.
- A review doesn't build images or run containers. Claim that a build, a test or a call to Docker, npm or the Dev Containers command-line interface would fail only when the code or a doc in the repository shows why.
