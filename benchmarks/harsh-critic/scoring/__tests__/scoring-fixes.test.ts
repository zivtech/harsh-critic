import { describe, expect, it } from "vitest";

import { scoreFixture, aggregateScores } from "../scorer.ts";
import { SCORING_WEIGHTS } from "../types.ts";
import type {
  FixtureResult,
  GroundTruth,
  ParsedAgentOutput,
  ParsedFinding,
} from "../types.ts";

/**
 * Regression tests for the two scoring defects documented in
 * research/upstream-omcc-critic-review.md §4.
 *
 * Both had the same root cause: the composite treated "this fixture cannot
 * express this dimension" as "this agent scored zero on this dimension".
 */

function critical(text: string): ParsedFinding {
  return { text, severity: "CRITICAL", hasEvidence: true };
}

function output(overrides: Partial<ParsedAgentOutput> = {}): ParsedAgentOutput {
  return {
    verdict: "REJECT",
    criticalFindings: [],
    majorFindings: [],
    minorFindings: [],
    missingItems: [],
    perspectiveNotes: { security: [], newHire: [], ops: [] },
    hasPreCommitment: true,
    hasGapAnalysis: true,
    hasMultiPerspective: true,
    rawOutput: "",
    ...overrides,
  };
}

const CLEAN_BASELINE: GroundTruth = {
  fixtureId: "clean",
  fixturePath: "fixtures/plans/clean.md",
  domain: "plan",
  expectedVerdict: "ACCEPT",
  findings: [],
  isCleanBaseline: true,
  allowedObservations: [
    {
      id: "ALLOW-1",
      summary: "Redis shared between cache and rate-limit state",
      keywords: ["Redis", "cache", "rate limit", "shared"],
    },
  ],
};

const SEEDED: GroundTruth = {
  fixtureId: "seeded",
  fixturePath: "fixtures/plans/seeded.md",
  domain: "plan",
  expectedVerdict: "REJECT",
  isCleanBaseline: false,
  findings: [
    {
      id: "A",
      severity: "CRITICAL",
      category: "finding",
      summary: "no rollback for the destructive migration",
      keywords: ["rollback", "schema", "DROP", "migration"],
      explanation: "seeded",
    },
  ],
};

describe("defect 1 — clean baselines are no longer capped by inapplicable dimensions", () => {
  it("scores a perfect clean-baseline run at 1.0, not 0.35", () => {
    const perfect = output({ verdict: "ACCEPT" });
    const scores = scoreFixture(perfect, CLEAN_BASELINE);

    expect(scores.compositeScore).toBeCloseTo(1, 5);
    // The dimensions the fixture cannot express are excluded, not zeroed.
    expect(scores.applicability.detection).toBe(false);
    expect(scores.applicability.missingCoverage).toBe(false);
    expect(scores.applicability.perspectiveCoverage).toBe(false);
    expect(scores.applicability.evidenceRate).toBe(false);
    expect(scores.applicability.falsePositiveRate).toBe(true);
  });

  it("still punishes fabricated findings on a clean baseline", () => {
    const noisy = output({
      criticalFindings: [
        critical("The choice of Postgres here is questionable"),
        critical("Rollout cadence is arbitrary"),
      ],
    });
    const scores = scoreFixture(noisy, CLEAN_BASELINE);

    expect(scores.falsePositiveRate).toBe(1);
    expect(scores.compositeScore).toBeLessThan(1);
  });

  it("does not charge a false positive for an allowed observation", () => {
    const fair = output({
      criticalFindings: [
        critical("Redis is shared between the gateway cache and rate limit state"),
      ],
    });
    const scores = scoreFixture(fair, CLEAN_BASELINE);

    expect(scores.falsePositiveRate).toBe(0);
    expect(scores.compositeScore).toBeCloseTo(1, 5);
    // It is still unmatched — the diagnostic reports it, the score does not punish it.
    expect(scores.unmatchedFindingRate).toBe(1);
  });

  it("excludes evidenceRate when the agent reported nothing to cite", () => {
    const silent = output({ verdict: "ACCEPT" });
    expect(scoreFixture(silent, CLEAN_BASELINE).applicability.evidenceRate).toBe(false);

    const speaking = output({ criticalFindings: [critical("x — see `a.ts:1`")] });
    expect(scoreFixture(speaking, SEEDED).applicability.evidenceRate).toBe(true);
  });
});

describe("defect 2 — valid findings outside the answer key are not penalised", () => {
  const matching = critical(
    "No rollback for the schema DROP COLUMN migration — see `db.sql:12`",
  );
  const extraReal = [
    critical("Refresh-token store is a new single point of failure — `auth.ts:88`"),
    critical("PII written to debug logs on auth failure — `log.ts:31`"),
  ];

  it("scores the same whether or not the agent finds unlisted real issues", () => {
    const minimal = scoreFixture(output({ criticalFindings: [matching] }), SEEDED);
    const thorough = scoreFixture(
      output({ criticalFindings: [matching, ...extraReal] }),
      SEEDED,
    );

    expect(thorough.compositeScore).toBeCloseTo(minimal.compositeScore, 5);
    // Upstream: 0.700 -> 0.633. Finding more real issues must not cost score.
    expect(thorough.compositeScore).toBeGreaterThanOrEqual(minimal.compositeScore);
  });

  it("reports the unmatched rate as a diagnostic without weighting it", () => {
    const thorough = scoreFixture(
      output({ criticalFindings: [matching, ...extraReal] }),
      SEEDED,
    );
    expect(thorough.unmatchedFindingRate).toBeCloseTo(2 / 3, 5);
    expect(thorough.falsePositiveRate).toBeNull();
    expect(thorough.applicability.falsePositiveRate).toBe(false);
  });

  it("leaves falsePositiveRate null on every seeded fixture", () => {
    expect(scoreFixture(output(), SEEDED).falsePositiveRate).toBeNull();
  });
});

describe("composite renormalisation", () => {
  it("renormalises applicable weights to sum to 1", () => {
    // Seeded fixture with no `missing` or `perspective` ground truth, and an
    // agent that cites evidence: detection + evidence + process apply.
    const scores = scoreFixture(
      output({
        criticalFindings: [
          critical("No rollback for the schema DROP COLUMN migration — `db.sql:12`"),
        ],
      }),
      SEEDED,
    );
    const w = SCORING_WEIGHTS;
    const applicableWeight =
      w.truePositiveRate + w.falseNegativeRate + w.evidenceRate + w.processCompliance;
    // A run that is perfect on every applicable dimension must reach exactly 1.
    expect(applicableWeight).toBeLessThan(1);
    expect(scores.compositeScore).toBeCloseTo(1, 5);
  });

  it("scores a silent, protocol-free run on a clean baseline at 0.5", () => {
    // Only two dimensions apply here — precision (perfect: nothing flagged) and
    // process compliance (zero: no protocol sections). Equal nominal weights, so
    // the renormalised composite is exactly 0.5. Reporting nothing is not the
    // same as reviewing well.
    const silentNoProtocol = output({
      verdict: "",
      hasPreCommitment: false,
      hasGapAnalysis: false,
      hasMultiPerspective: false,
    });
    const scores = scoreFixture(silentNoProtocol, CLEAN_BASELINE);
    expect(scores.falsePositiveRate).toBe(0);
    expect(scores.compositeScore).toBeCloseTo(0.5, 5);
  });

  it("bottoms out at 0 when every applicable dimension scores 0", () => {
    const noisyNoProtocol = output({
      verdict: "",
      // No file:line or backticks, so evidenceRate is applicable and scores 0.
      criticalFindings: [
        { text: "Postgres choice is questionable", severity: "CRITICAL", hasEvidence: false },
      ],
      hasPreCommitment: false,
      hasGapAnalysis: false,
      hasMultiPerspective: false,
    });
    const scores = scoreFixture(noisyNoProtocol, CLEAN_BASELINE);
    expect(scores.falsePositiveRate).toBe(1);
    expect(scores.compositeScore).toBe(0);
  });
});

describe("aggregation across mixed fixtures", () => {
  function result(scores: FixtureResult["scores"]): FixtureResult {
    return {
      fixtureId: "f",
      domain: "plan",
      agentType: "harsh-critic",
      parsedOutput: output(),
      scores,
      matchedFindings: [],
      missedFindings: [],
      spuriousFindings: [],
    };
  }

  it("averages falsePositiveRate only over fixtures that can express it", () => {
    const clean = scoreFixture(
      output({
        criticalFindings: [critical("Postgres choice is questionable")],
      }),
      CLEAN_BASELINE,
    );
    const seeded = scoreFixture(output(), SEEDED);
    expect(clean.falsePositiveRate).toBe(1);
    expect(seeded.falsePositiveRate).toBeNull();

    const aggregate = aggregateScores([result(clean), result(seeded)]);
    // Averaging the seeded fixture in as 0 would halve the only precision
    // signal the suite has.
    expect(aggregate.falsePositiveRate).toBe(1);
  });

  it("reports falsePositiveRate as null when no clean baseline ran", () => {
    const seeded = scoreFixture(output(), SEEDED);
    expect(aggregateScores([result(seeded)]).falsePositiveRate).toBeNull();
  });

  it("marks a dimension applicable in aggregate if any fixture expressed it", () => {
    const clean = scoreFixture(output({ verdict: "ACCEPT" }), CLEAN_BASELINE);
    const seeded = scoreFixture(output(), SEEDED);
    const aggregate = aggregateScores([result(clean), result(seeded)]);

    expect(aggregate.applicability.detection).toBe(true);
    expect(aggregate.applicability.falsePositiveRate).toBe(true);
    expect(aggregate.applicability.perspectiveCoverage).toBe(false);
  });
});
