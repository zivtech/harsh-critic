import { describe, expect, it } from "vitest";

import { parseAgentOutput, parseCriticOutput } from "../parser.ts";

/**
 * Regression tests for the shared parser's delegation to the canonical
 * harsh-critic parser.
 *
 * Upstream (e9e8fa38) exposed `parseCriticOutput` with `export { ... } from`
 * only. That re-export does not create a local binding, so parseAgentOutput()
 * threw `ReferenceError: parseCriticOutput is not defined` for critic agent
 * types. Their tsconfig typechecks `src/**` only, so nothing caught it.
 */
const CRITIC_OUTPUT = `
**VERDICT: REVISE**

**Overall Assessment**: Two blocking defects.

**Pre-commitment Predictions**: expected rollback gaps; found them.

**Critical Findings**:
1. No rollback for the destructive migration — \`db/migrate.sql:12\` drops the column.
   - Confidence: HIGH
   - Fix: stage the drop behind a backup window.

**Major Findings**:
1. Auth endpoints have no rate limiting — \`api/auth.ts:88\`.
   - Confidence: HIGH

**What's Missing**:
- No session invalidation plan for logged-in users

**Multi-Perspective Notes**:
- Security: token replay window is unbounded
- New-hire: undocumented Redis dependency
- Ops: no circuit breaker on the external call
`;

describe("shared parser delegation", () => {
  it.each(["critic", "harsh-critic"])(
    "parses %s output without throwing on an unbound re-export",
    (agentType) => {
      const parsed = parseAgentOutput(CRITIC_OUTPUT, agentType);
      expect(parsed.verdict).toBe("REVISE");
      expect(parsed.criticalFindings).toHaveLength(1);
      expect(parsed.majorFindings).toHaveLength(1);
      expect(parsed.missingItems).toHaveLength(1);
      expect(parsed.hasGapAnalysis).toBe(true);
      expect(parsed.hasPreCommitment).toBe(true);
      expect(parsed.hasMultiPerspective).toBe(true);
    },
  );

  it("routes critic agent types through the canonical parser, not the generic one", () => {
    expect(parseAgentOutput(CRITIC_OUTPUT, "critic")).toEqual(
      parseCriticOutput(CRITIC_OUTPUT, "critic"),
    );
  });

  it("still routes non-critic agents to the generic parser", () => {
    const parsed = parseAgentOutput(CRITIC_OUTPUT, "debugger");
    expect(parsed).not.toEqual(parseCriticOutput(CRITIC_OUTPUT, "critic"));
    expect(parsed.rawOutput).toBe(CRITIC_OUTPUT);
  });
});
