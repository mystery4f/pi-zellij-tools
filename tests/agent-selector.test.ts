import { describe, it, expect } from "bun:test";
import { parseAgentSelector } from "../src/agents/selector.js";

describe("parseAgentSelector", () => {
  it("parses user prefix", () => {
    expect(parseAgentSelector("user:reviewer")).toEqual({ scope: "user", agentName: "reviewer" });
  });

  it("parses proj alias", () => {
    expect(parseAgentSelector("proj:reviewer")).toEqual({ scope: "project", agentName: "reviewer" });
  });

  it("parses project prefix", () => {
    expect(parseAgentSelector("project:reviewer")).toEqual({ scope: "project", agentName: "reviewer" });
  });

  it("parses both prefix", () => {
    expect(parseAgentSelector("both:reviewer")).toEqual({ scope: "both", agentName: "reviewer" });
  });

  it("supports no prefix", () => {
    expect(parseAgentSelector("reviewer")).toEqual({ agentName: "reviewer" });
  });

  it("supports empty name for list", () => {
    expect(parseAgentSelector("proj:")).toEqual({ scope: "project", agentName: "" });
  });

  it("throws for unknown prefix", () => {
    expect(() => parseAgentSelector("foo:reviewer")).toThrow("Unknown agent scope prefix");
  });
});
