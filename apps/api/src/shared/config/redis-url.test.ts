import { describe, expect, it } from "vitest";
import { redisUrlProblem } from "./redis-url";

describe("redisUrlProblem", () => {
  it.each([
    "redis://localhost:6379",
    "redis://redis:6379",
    "redis://:abc123DEF@redis:6379",
    "rediss://:s3cret@cache.example.com:6380/2",
    "redis://:p%40ss%2Fword@redis:6379",
    "redis://:100%25@redis:6379",
    "redis://:pw@[::1]:6379/2",
    "redis://:pw@redis:6379?family=6", // ioredis options in the query string are legitimate
  ])("accepts %s", (value) => {
    expect(redisUrlProblem(value)).toBeNull();
  });

  const REJECTED: Array<[string, string]> = [
    ["notaurl", "redis://"],
    ["redis://:pa#ss@redis:6379", "cannot be parsed"],
    ["redis://:pa?ss@redis:6379", "cannot be parsed"],
    ["redis://:pa/ss@redis:6379", "cannot be parsed"],
    ["redis://:pw@:6379", "cannot be parsed"],
    ["http://redis:6379", "redis://"],
    ["redis://:pa@ss@redis:6379", "unencoded '@'"],
    ["redis://redis:6379/notadb", "database number"],
    ["redis://redis:6379#frag", "'#'"],
    ["redis://:100%@redis:6379", "%25"],
    [" redis://:pw@redis:6379", "whitespace"],
    ["redis://:pw@redis:6379\n", "whitespace"],
    ["redis://:p w@redis:6379", "whitespace"],
  ];

  it.each(REJECTED)("rejects %j", (value, fragment) => {
    expect(redisUrlProblem(value)).toContain(fragment);
  });

  it("never echoes the password, whatever the reason for rejection", () => {
    for (const [value] of [
      ["redis://:SuperSecret@x@redis:6379"],
      ["redis://:SuperSecret%@redis:6379"],
      [" redis://:SuperSecret@redis:6379"],
      ["redis://:SuperSecret/x@redis:6379"],
      ["http://:SuperSecret@redis:6379"],
      ["redis://:SuperSecret@redis:6379/notadb"],
    ] as Array<[string]>) {
      const problem = redisUrlProblem(value);
      expect(problem).not.toBeNull();
      expect(problem).not.toContain("SuperSecret");
    }
  });
});
