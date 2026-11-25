/**
 * Prepares Claude's code review of one image on a pull request, for ci-code-review.yml. It counts the image's earlier
 * reviews, so the review knows whether Nits are still allowed and where the last one stopped, and saves the review
 * threads already on the image's files. It uses only Node's built-in modules and fetch, so it needs no npm install.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { IMAGES_SRC_FOLDER, IMAGES_TEST_FOLDER, NAME, SHA, setOutput } from "../lib.js";

/** Reviews up to this one may post Nits. Later ones post Important findings only. */
export const NIT_REVIEWS = 3;
/** Anyone can comment on a public pull request, so Claude only sees comments from these. */
export const TRUSTED = ["OWNER", "MEMBER", "COLLABORATOR"];
/** Bots whose comments Claude sees: the account Claude's review comments come from. */
export const BOTS = ["github-actions", "github-actions[bot]"];
/** The folder the review's inputs are saved in, which the review step reads. */
export const OUT_DIR = ".code-review";

/**
 * The action's inputs.
 *
 * @typedef {{ image: string, base: string, workflow: string, job: string, step: string, token: string }} Inputs
 */

/**
 * Returns the action's inputs, which GitHub Actions passes as INPUT_<NAME> variables.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Inputs}
 * @throws {Error} If one is missing, the image isn't an image name or the base isn't a full commit SHA.
 */
export function readInputs(env) {
  const inputs = {};
  for (const name of ["image", "base", "workflow", "job", "step", "token"]) {
    const value = (env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
    if (value === "") {
      throw new Error(`The ${name} input is required.`);
    }
    inputs[name] = value;
  }
  if (!NAME.test(inputs.image)) {
    throw new Error(`${JSON.stringify(inputs.image)} isn't an image name.`);
  }
  // An empty base would make git read the pull request's own REVIEW.md and diff nothing.
  if (!SHA.test(inputs.base)) {
    throw new Error(`The base input must be a full commit SHA, not ${JSON.stringify(inputs.base)}.`);
  }
  return /** @type {Inputs} */ (inputs);
}

/**
 * Returns whether the job is the review job. A called workflow's jobs are listed as `<caller job> / <job>`.
 *
 * @param {string} name - The job's name, from the API.
 * @param {string} job - The review job's own name.
 */
export function isReviewJob(name, job) {
  return name === job || name.endsWith(` / ${job}`);
}

/**
 * One earlier review: the commit it reviewed, when it started and whether its review step succeeded.
 *
 * @typedef {{ sha: string, at: string, succeeded: boolean }} Review
 */

/**
 * Returns the image's earlier reviews on the pull request. A review is a run of the pull request workflow for this pull
 * request, or an earlier attempt of this run, whose review step ran. A cancelled or failed review may still have posted
 * comments, so it counts too.
 *
 * @param {object} data
 * @param {readonly { id: number, head_sha: string, created_at: string, pull_requests: { number: number }[] }[]} data.runs
 * @param {ReadonlyMap<number, readonly { name: string, run_attempt: number, started_at: string, steps?: { name: string, conclusion: string | null }[] }[]>} data.jobsByRun
 * @param {{ number: number, created_at: string }} data.pull
 * @param {number} data.runId - This run, whose current and later attempts don't count.
 * @param {number} data.attempt - This run's attempt.
 * @param {string} data.job - The review job's own name.
 * @param {string} data.step - The name of the step that runs the review.
 * @returns {Review[]}
 */
export function earlierReviews({ runs, jobsByRun, pull, runId, attempt, job, step }) {
  const reviews = [];
  for (const run of runs) {
    // A run lists the branch's open pull request when it's queried, so a run from a closed pull request on the same
    // branch also lists this one. Only runs since this pull request opened are its own.
    if (!isForPull(run, pull)) {
      continue;
    }
    for (const j of jobsByRun.get(run.id) ?? []) {
      if (!isReviewJob(j.name, job) || (run.id === runId && j.run_attempt >= attempt)) {
        continue;
      }
      const conclusion = j.steps?.find((s) => s.name === step)?.conclusion;
      if (conclusion === "success" || conclusion === "failure" || conclusion === "cancelled") {
        reviews.push({ sha: run.head_sha, at: j.started_at, succeeded: conclusion === "success" });
      }
    }
  }
  return reviews;
}

/**
 * Returns whether the workflow run belongs to the pull request.
 *
 * @param {{ created_at: string, pull_requests: { number: number }[] }} run
 * @param {{ number: number, created_at: string }} pull
 */
export function isForPull(run, pull) {
  return (
    run.pull_requests.some((p) => p.number === pull.number) && Date.parse(run.created_at) >= Date.parse(pull.created_at)
  );
}

/**
 * Returns this review's number, from 1, and whether it may post Nits.
 *
 * @param {readonly Review[]} reviews - The earlier reviews.
 */
export function reviewNumber(reviews) {
  const review = reviews.length + 1;
  return { review, nits: review <= NIT_REVIEWS };
}

/**
 * Returns the commit the latest successful review reviewed, or `none` when no review has succeeded.
 *
 * @param {readonly Review[]} reviews
 * @throws {Error} If that commit isn't a full SHA, which would go unchecked into git and the step outputs.
 */
export function previousReview(reviews) {
  const latest = reviews.filter((r) => r.succeeded).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (latest === undefined) {
    return "none";
  }
  if (!SHA.test(latest.sha)) {
    throw new Error("The last successful review's commit isn't a full SHA.");
  }
  return latest.sha;
}

/**
 * Returns whether Claude may read the comment.
 *
 * @param {{ authorAssociation: string, author: { __typename: string, login: string } | null }} comment
 */
export function isTrusted(comment) {
  return (
    TRUSTED.includes(comment.authorAssociation) ||
    (comment.author?.__typename === "Bot" && BOTS.includes(comment.author.login))
  );
}

/**
 * One review thread, as the GraphQL API returns it.
 *
 * @typedef {{ isResolved: boolean, isOutdated: boolean, path: string, line: number | null, originalLine: number | null, comments: { nodes: { authorAssociation: string, author: { __typename: string, login: string } | null, body: string }[] } }} Thread
 */

/**
 * Returns the threads on the image's own files that Claude may read, with only their trusted comments. A thread an
 * untrusted user started is left out, unless it's resolved and a trusted user replied: then it's settled.
 *
 * @param {readonly Thread[]} threads
 * @param {string} image
 */
export function threadsInScope(threads, image) {
  return threads
    .filter(
      (t) =>
        t.path.startsWith(`${IMAGES_SRC_FOLDER}/${image}/`) || t.path.startsWith(`${IMAGES_TEST_FOLDER}/${image}/`),
    )
    .filter((t) => {
      const [first] = t.comments.nodes;
      return first !== undefined && (isTrusted(first) || (t.isResolved && t.comments.nodes.some(isTrusted)));
    })
    .map((t) => ({
      path: t.path,
      line: t.line ?? t.originalLine,
      resolved: t.isResolved,
      outdated: t.isOutdated,
      comments: t.comments.nodes.filter(isTrusted).map((c) => ({ author: c.author?.login ?? "ghost", body: c.body })),
    }));
}

/**
 * Returns the URL of the next page from a Link header, or null on the last page.
 *
 * @param {string | null} header
 */
export function nextLink(header) {
  for (const part of (header ?? "").split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match !== null) {
      return match[1];
    }
  }
  return null;
}

/**
 * Where to call the API, and the token to call it with.
 *
 * @typedef {{ apiUrl: string, graphqlUrl: string, token: string }} Api
 */

/**
 * Returns the headers for an API call.
 *
 * @param {string} token
 */
function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "devcontainers-prepare-code-review",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Returns every item of a paginated REST list, following the Link header's next pages.
 *
 * @param {typeof fetch} fetchFn
 * @param {Api} api
 * @param {string} route - The path and query, such as `/repos/o/r/actions/runs?per_page=100`.
 * @param {string} key - The response's key that holds the items, such as `workflow_runs`.
 * @throws {Error} If a call fails, or a next page is on another origin, which would be sent the token.
 */
export async function rest(fetchFn, api, route, key) {
  const origin = new URL(api.apiUrl).origin;
  const items = [];
  let url = `${api.apiUrl}${route}`;
  while (url !== null) {
    if (new URL(url).origin !== origin) {
      throw new Error(`The API's next page is on another origin, ${new URL(url).origin}, so it isn't followed.`);
    }
    const response = await fetchFn(url, { headers: headers(api.token) });
    if (!response.ok) {
      throw new Error(`GET ${new URL(url).pathname} failed with HTTP ${response.status}.`);
    }
    const body = await response.json();
    items.push(...(body[key] ?? []));
    url = nextLink(response.headers.get("link"));
  }
  return items;
}

/**
 * Returns a GraphQL query's data.
 *
 * @param {typeof fetch} fetchFn
 * @param {Api} api
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @throws {Error} If the call fails or the response has errors, which GraphQL sends with HTTP 200.
 */
export async function graphql(fetchFn, api, query, variables) {
  const response = await fetchFn(api.graphqlUrl, {
    method: "POST",
    headers: { ...headers(api.token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`The GraphQL query failed with HTTP ${response.status}.`);
  }
  const body = await response.json();
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(`The GraphQL query failed: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  return body.data;
}

/** Review threads, rather than the REST API's comments, because only threads say whether they're resolved. */
const THREADS = `query ($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first: 100) { nodes { author { __typename login } authorAssociation body } }
        }
      }
    }
  }
}`;

/**
 * Returns every review thread on the pull request. Only a thread's first 100 comments are read.
 *
 * @param {typeof fetch} fetchFn
 * @param {Api} api
 * @param {string} owner
 * @param {string} repo
 * @param {number} number
 * @returns {Promise<Thread[]>}
 */
export async function reviewThreads(fetchFn, api, owner, repo, number) {
  const threads = [];
  let cursor = null;
  do {
    const data = await graphql(fetchFn, api, THREADS, { owner, repo, number, cursor });
    const page = data?.repository?.pullRequest?.reviewThreads;
    if (page == null) {
      throw new Error(`Pull request #${number} has no review threads to read.`);
    }
    threads.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor !== null);
  return threads;
}

/**
 * Counts the image's earlier reviews, saves the trusted review threads on its files in .code-review/comments.json and
 * sets the review, nits and previous outputs.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchFn]
 * @param {string} [outDir]
 */
export async function run(env = process.env, fetchFn = fetch, outDir = OUT_DIR) {
  const inputs = readInputs(env);
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8"));
  const pull = event.pull_request;
  if (pull === undefined) {
    throw new Error("Preparing the code review needs a pull_request event.");
  }
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
  const api = {
    apiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
    graphqlUrl: env.GITHUB_GRAPHQL_URL ?? "https://api.github.com/graphql",
    token: inputs.token,
  };

  const query = new URLSearchParams({ event: "pull_request", branch: pull.head.ref, per_page: "100" });
  const runs = await rest(
    fetchFn,
    api,
    `/repos/${owner}/${repo}/actions/workflows/${inputs.workflow}/runs?${query}`,
    "workflow_runs",
  );
  const jobsByRun = new Map();
  for (const r of runs.filter((r) => isForPull(r, pull))) {
    // filter=all lists every attempt's jobs, so each attempt counts as a review.
    jobsByRun.set(
      r.id,
      await rest(fetchFn, api, `/repos/${owner}/${repo}/actions/runs/${r.id}/jobs?filter=all&per_page=100`, "jobs"),
    );
  }
  const reviews = earlierReviews({
    runs,
    jobsByRun,
    pull,
    runId: Number(env.GITHUB_RUN_ID),
    attempt: Number(env.GITHUB_RUN_ATTEMPT),
    job: inputs.job,
    step: inputs.step,
  });
  const { review, nits } = reviewNumber(reviews);
  const previous = previousReview(reviews);
  console.log(
    `This is review ${review} of ${inputs.image} on this pull request. The last review that succeeded was of ${previous}.`,
  );

  const threads = threadsInScope(await reviewThreads(fetchFn, api, owner, repo, pull.number), inputs.image);
  // The job checks out the pull request, which could hold a file at this path, so start from an empty folder.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "comments.json"), JSON.stringify(threads, null, 2));
  console.log(
    `Saved ${threads.length} earlier review threads on ${inputs.image}'s files, ${threads.filter((t) => t.resolved).length} of them resolved.`,
  );

  setOutput("review", String(review), env);
  setOutput("nits", String(nits), env);
  setOutput("previous", previous, env);
}
