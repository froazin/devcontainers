/** Tests for errors.ts. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dockerApiError, dockerCall, ImageError, isDockerStatus } from "./errors.ts";

describe("dockerApiError", () => {
  const cases = [
    { case: "an Error keeps its message", error: new Error("connect ENOENT"), expected: "connect ENOENT" },
    { case: "anything else is turned into a string", error: "socket closed", expected: "socket closed" },
  ];

  for (const row of cases) {
    it(row.case, () => {
      const error = dockerApiError(row.error);

      assert.ok(error instanceof ImageError);
      assert.equal(
        error.message,
        `The Docker API call failed: ${row.expected}. Check that Docker is running, such as with \`docker info\`.`,
      );
      assert.equal(error.cause, row.error);
    });
  }
});

describe("isDockerStatus", () => {
  const cases = [
    { case: "matches the status code", error: { statusCode: 404 }, expected: true },
    { case: "rejects another status code", error: { statusCode: 500 }, expected: false },
    { case: "rejects an error without one", error: new Error("no status"), expected: false },
    { case: "rejects null", error: null, expected: false },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(isDockerStatus(row.error, 404), row.expected);
    });
  }
});

describe("dockerCall", () => {
  const cases = [
    { case: "returns what the call resolves to", call: async () => "ok", expected: "ok", error: undefined },
    {
      case: "turns a rejection into an ImageError",
      call: async () => Promise.reject(new Error("HTTP 500")),
      expected: undefined,
      error: /^The Docker API call failed: HTTP 500\./,
    },
  ];

  for (const row of cases) {
    it(row.case, async () => {
      if (row.error === undefined) {
        assert.equal(await dockerCall(row.call), row.expected);
      } else {
        await assert.rejects(dockerCall(row.call), (error: unknown) => {
          assert.ok(error instanceof ImageError);
          assert.match(error.message, row.error);
          return true;
        });
      }
    });
  }
});
