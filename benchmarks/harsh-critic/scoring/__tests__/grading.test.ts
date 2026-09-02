import { describe, expect, it } from "vitest";

import {
  buildGraderUserMessage,
  isDowngraded,
  parseCaptureFilename,
  parseGraderResponse,
  quoteIsVerbatim,
  toVerdict,
} from "../grading.ts";
import type { GroundTruthFinding } from "../types.ts";

/**
 * Tests for the pure helpers behind the `graded` flaw matcher's grading step
 * (grade-outputs.ts). See research/matcher-selection-precommitment.md §§2-4
 * for why this candidate exists and the evidence rule it must satisfy.
 */

// ============================================================
// parseCaptureFilename
// ============================================================

describe("parseCaptureFilename", () => {
  it("parses the multi-sample convention <agent>__<fixture>__r<n>.md", () => {
    expect(parseCaptureFilename("critic__plan-auth-migration__r1.md")).toEqual({
      agent: "critic",
      fixtureId: "plan-auth-migration",
      repeat: 1,
    });
    expect(parseCaptureFilename("harsh-critic__plan-api-redesign__r3.md")).toEqual({
      agent: "harsh-critic",
      fixtureId: "plan-api-redesign",
      repeat: 3,
    });
  });

  it("parses the single-sample convention <agent>__<fixture>.md", () => {
    expect(parseCaptureFilename("critic-legacy__plan-clean-baseline.md")).toEqual({
      agent: "critic-legacy",
      fixtureId: "plan-clean-baseline",
      repeat: null,
    });
  });

  it("returns null for non-matching filenames", () => {
    expect(parseCaptureFilename("run-manifest.json")).toBeNull();
    expect(parseCaptureFilename("MANIFEST.json")).toBeNull();
    expect(parseCaptureFilename("grading-cache.json")).toBeNull();
  });

  it("returns null for an unknown agent", () => {
    expect(parseCaptureFilename("some-other-agent__plan-auth-migration.md")).toBeNull();
  });

  it("returns null for a malformed repeat suffix", () => {
    expect(parseCaptureFilename("critic__plan-auth-migration__rX.md")).toBeNull();
    expect(parseCaptureFilename("critic__plan-auth-migration__1.md")).toBeNull();
  });
});

// ============================================================
// parseGraderResponse
// ============================================================

describe("parseGraderResponse", () => {
  it("parses bare JSON", () => {
    const text = '{"found": true, "quote": "the exact span quoted", "reasoning": "matches"}';
    expect(parseGraderResponse(text)).toEqual({
      found: true,
      quote: "the exact span quoted",
      reasoning: "matches",
    });
  });

  it("parses a fenced ```json block", () => {
    const text = [
      "```json",
      '{"found": false, "quote": "", "reasoning": "no match found here"}',
      "```",
    ].join("\n");
    expect(parseGraderResponse(text)).toEqual({
      found: false,
      quote: "",
      reasoning: "no match found here",
    });
  });

  it("extracts JSON surrounded by prose", () => {
    const text =
      'Here is my judgment: {"found": true, "quote": "a verbatim quoted span", ' +
      '"reasoning": "clear identification"} Hope that helps!';
    expect(parseGraderResponse(text)).toEqual({
      found: true,
      quote: "a verbatim quoted span",
      reasoning: "clear identification",
    });
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseGraderResponse("I cannot determine this without more context.")).toThrow();
  });

  it("throws when a required field has the wrong type", () => {
    const text = '{"found": "yes", "quote": "abc", "reasoning": "why"}';
    expect(() => parseGraderResponse(text)).toThrow();
  });
});

// ============================================================
// quoteIsVerbatim
// ============================================================

describe("quoteIsVerbatim", () => {
  const rawOutput =
    "## Critical Findings\n\n" +
    "1. **No rollback path** exists for users, already converted to JWT tokens. " +
    "This is a critical gap.\n";

  it("passes on an exact span", () => {
    expect(quoteIsVerbatim("No rollback path exists for users", rawOutput)).toBe(true);
  });

  it("passes on a span differing only in markdown/punctuation", () => {
    // Raw output has "**No rollback path** exists for users," (bold + comma);
    // normalization strips ** and , from both sides before comparing.
    expect(
      quoteIsVerbatim("No rollback path exists for users already converted to JWT tokens", rawOutput),
    ).toBe(true);
  });

  it("fails on a paraphrase", () => {
    expect(
      quoteIsVerbatim("Rollback is never handled anywhere for JWT-authenticated users", rawOutput),
    ).toBe(false);
  });

  it("fails on a too-short quote even if it is a real substring", () => {
    // "no rollback" normalizes to 11 chars — under the 12-char floor.
    expect(quoteIsVerbatim("No rollback", rawOutput)).toBe(false);
  });
});

// ============================================================
// toVerdict / isDowngraded
// ============================================================

describe("toVerdict", () => {
  const rawOutput = "The review clearly states: no rollback path exists for JWT users at all.";

  it("passes through a verified found", () => {
    const verdict = toVerdict(
      "SF-1",
      { found: true, quote: "no rollback path exists for JWT users", reasoning: "clear identification" },
      rawOutput,
    );
    expect(verdict).toEqual({
      flawId: "SF-1",
      found: true,
      quote: "no rollback path exists for JWT users",
      reasoning: "clear identification",
    });
    expect(isDowngraded(verdict)).toBe(false);
  });

  it("downgrades a found claim with an unverifiable quote", () => {
    const verdict = toVerdict(
      "SF-1",
      { found: true, quote: "this exact phrase never appears anywhere in the review", reasoning: "seems right" },
      rawOutput,
    );
    expect(verdict.found).toBe(false);
    expect(verdict.quote).toBe("");
    expect(verdict.reasoning.startsWith("[UNVERIFIED QUOTE]")).toBe(true);
    expect(verdict.reasoning).toContain("seems right");
    expect(verdict.reasoning).toContain("this exact phrase never appears anywhere in the review");
    expect(isDowngraded(verdict)).toBe(true);
  });

  it("passes through a not-found verdict unchanged", () => {
    const verdict = toVerdict("SF-1", { found: false, quote: "", reasoning: "different issue entirely" }, rawOutput);
    expect(verdict).toEqual({
      flawId: "SF-1",
      found: false,
      quote: "",
      reasoning: "different issue entirely",
    });
    expect(isDowngraded(verdict)).toBe(false);
  });
});

// ============================================================
// buildGraderUserMessage
// ============================================================

describe("buildGraderUserMessage", () => {
  const gt: GroundTruthFinding = {
    id: "SF-9",
    severity: "MAJOR",
    category: "missing",
    summary: "No day-1 failure handling when the refresh endpoint is unavailable",
    keywords: ["zzz-secret-keyword-zzz", "another-forbidden-keyword"],
    location: "Step 2 (Auth Service Implementation)",
    explanation: "Users with expired access tokens and a down refresh service are locked out.",
  };

  it("includes id, summary, location, explanation, and the review text", () => {
    const message = buildGraderUserMessage(gt, "REVIEW BODY TEXT HERE");
    expect(message).toContain("SF-9");
    expect(message).toContain("No day-1 failure handling when the refresh endpoint is unavailable");
    expect(message).toContain("Step 2 (Auth Service Implementation)");
    expect(message).toContain("Users with expired access tokens and a down refresh service are locked out.");
    expect(message).toContain("REVIEW BODY TEXT HERE");
  });

  it("never includes any keyword from gt.keywords", () => {
    const message = buildGraderUserMessage(gt, "REVIEW BODY TEXT HERE");
    for (const keyword of gt.keywords) {
      expect(message).not.toContain(keyword);
    }
  });

  it('uses "(not specified)" when location is absent', () => {
    const { location: _location, ...withoutLocation } = gt;
    const message = buildGraderUserMessage(withoutLocation as GroundTruthFinding, "REVIEW BODY TEXT HERE");
    expect(message).toContain("(not specified)");
  });
});
