/** Tests for config.ts. */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { DEVCONTAINERS_CLI, imageName } from "./config.ts";

describe("imageName", () => {
  const cases = [
    { case: "a release has no suffix", name: "base", release: true, expected: "ghcr.io/froazin/devcontainers:base" },
    {
      case: "a dev build ends in -dev",
      name: "base",
      release: false,
      expected: "ghcr.io/froazin/devcontainers:base-dev",
    },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.equal(imageName(row.name, row.release), row.expected);
    });
  }
});

describe("DEVCONTAINERS_CLI", () => {
  const cases = [
    { case: "resolves to the installed CLI's entry script", expected: /@devcontainers\/cli\/devcontainer\.js$/ },
  ];

  for (const row of cases) {
    it(row.case, () => {
      assert.match(DEVCONTAINERS_CLI, row.expected);
      assert.ok(existsSync(DEVCONTAINERS_CLI));
    });
  }
});
