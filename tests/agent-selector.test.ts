import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAgentSelector } from "../src/agents/selector.js";

describe("parseAgentSelector", () => {
  it("parses user prefix", () => {
    assert.deepStrictEqual(parseAgentSelector("user:reviewer"), { scope: "user", agentName: "reviewer" });
  });

  it("parses proj alias", () => {
    assert.deepStrictEqual(parseAgentSelector("proj:reviewer"), { scope: "project", agentName: "reviewer" });
  });

  it("parses project prefix", () => {
    assert.deepStrictEqual(parseAgentSelector("project:reviewer"), { scope: "project", agentName: "reviewer" });
  });

  it("parses both prefix", () => {
    assert.deepStrictEqual(parseAgentSelector("both:reviewer"), { scope: "both", agentName: "reviewer" });
  });

  it("supports no prefix", () => {
    assert.deepStrictEqual(parseAgentSelector("reviewer"), { agentName: "reviewer" });
  });

  it("supports empty name for list", () => {
    assert.deepStrictEqual(parseAgentSelector("proj:"), { scope: "project", agentName: "" });
  });

  it("throws for unknown prefix", () => {
    assert.throws(() => parseAgentSelector("foo:reviewer"), (err: Error) => {
      assert.ok(err.message.includes("Unknown agent scope prefix"));
      return true;
    });
  });
});
