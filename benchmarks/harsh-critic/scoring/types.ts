/**
 * Benchmark Scoring Types for Harsh-Critic Agent Evaluation
 *
 * Defines the schema for fixtures, ground truth, parsed agent output,
 * and scoring metrics used to compare review agents.
 */

// ============================================================
// GROUND TRUTH
// ============================================================

export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export type FindingCategory = 'finding' | 'missing' | 'perspective';

export type Perspective = 'security' | 'new-hire' | 'ops';

export type Domain = 'plan' | 'code' | 'analysis';

export type HarshCriticVerdict = 'REJECT' | 'REVISE' | 'ACCEPT-WITH-RESERVATIONS' | 'ACCEPT';

/**
 * Verdict vocabulary of the PRE-CONSOLIDATION critic (before upstream
 * 8641e541, 2026-03-08). The current `critic` uses HarshCriticVerdict.
 */
export type CriticVerdict = 'OKAY' | 'REJECT';

/**
 * LOCAL FIX (upstream e9e8fa38): upstream had only 'harsh-critic' | 'critic',
 * and its parser routed 'critic' to a parser written for the legacy
 * OKAY/REJECT format. Since upstream 8641e541 (2026-03-08) `critic` IS the
 * consolidated harsh-critic and emits the four-tier verdict with severity
 * buckets, What's Missing, and perspective notes — so that routing silently
 * discarded almost everything the agent produced. 'critic-legacy' now names the
 * old format explicitly, so historical runs stay reproducible while current
 * runs parse correctly.
 */
export type AgentType = 'harsh-critic' | 'critic' | 'critic-legacy';

/**
 * A single expected finding in a fixture's ground truth.
 * Each finding has keywords that must appear in a matching agent output.
 */
export interface GroundTruthFinding {
  /** Unique identifier, e.g. "AUTH-CRIT-1" */
  id: string;
  /** Expected severity level */
  severity: Severity;
  /** Whether this is a direct finding, a missing item, or a perspective-specific finding */
  category: FindingCategory;
  /** Which perspective this finding relates to (if category is 'perspective') */
  perspective?: Perspective;
  /** Short description of the embedded flaw */
  summary: string;
  /** Keywords that must appear in a matching agent finding (>= 2 must match) */
  keywords: string[];
  /** File:line or section reference if applicable */
  location?: string;
  /** Why this is a real issue (for documentation) */
  explanation: string;
}

/**
 * Ground truth for a single fixture.
 */
export interface GroundTruth {
  /** Fixture identifier matching the filename (without extension) */
  fixtureId: string;
  /** Path to the fixture file relative to benchmarks/harsh-critic/ */
  fixturePath: string;
  /** Domain of the fixture */
  domain: Domain;
  /** Expected verdict from a thorough reviewer */
  expectedVerdict: HarshCriticVerdict;
  /** All expected findings embedded in the fixture */
  findings: GroundTruthFinding[];
  /** Whether this is a clean baseline (for false-positive testing) */
  isCleanBaseline: boolean;
  /**
   * Observations a clean baseline may legitimately draw without being charged a
   * false positive. Without this, a critic that makes a fair minor observation
   * on a deliberately solid fixture is scored as if it hallucinated — the same
   * perverse incentive `unmatchedFindingRate` was demoted for.
   */
  allowedObservations?: AllowedObservation[];
}

/** A defensible observation on a clean baseline. Matched like a ground-truth finding. */
export interface AllowedObservation {
  id: string;
  summary: string;
  keywords: string[];
}

// ============================================================
// PARSED AGENT OUTPUT
// ============================================================

/**
 * A single finding extracted from agent output.
 */
export interface ParsedFinding {
  /** Raw text of the finding */
  text: string;
  /** Severity as stated by the agent */
  severity: Severity;
  /** Whether the finding includes file:line or specific code references */
  hasEvidence: boolean;
  /** ID of the matched ground-truth finding (set during scoring) */
  matchedGroundTruth?: string;
}

/**
 * Structured representation of an agent's review output.
 */
export interface ParsedAgentOutput {
  /** The agent's verdict string */
  verdict: string;
  /** Findings categorized by severity */
  criticalFindings: ParsedFinding[];
  majorFindings: ParsedFinding[];
  minorFindings: ParsedFinding[];
  /** Items from the "What's Missing" section */
  missingItems: string[];
  /** Multi-perspective notes */
  perspectiveNotes: {
    security: string[];
    newHire: string[];
    ops: string[];
  };
  /** Whether the agent made pre-commitment predictions before investigation */
  hasPreCommitment: boolean;
  /** Whether the agent's output includes a gap analysis section */
  hasGapAnalysis: boolean;
  /** Whether the agent addressed multiple perspectives */
  hasMultiPerspective: boolean;
  /** Raw output text (for debugging) */
  rawOutput: string;
}

// ============================================================
// SCORING
// ============================================================

/**
 * Scores for a single agent run against a single fixture.
 */
export interface BenchmarkScores {
  // Core detection metrics (0-1 scale)
  /** Findings that match ground truth / total ground truth */
  truePositiveRate: number;
  /**
   * Agent findings that matched no ground-truth entry / total agent findings.
   *
   * LOCAL FIX (upstream e9e8fa38): upstream called this `falsePositiveRate` and
   * weighted it on every fixture. It does not measure correctness — the scorer
   * has no way to judge whether an unmatched finding is wrong, only that it is
   * not in the answer key. Weighting it penalised finding real issues the
   * fixture author did not seed: adding two genuine, evidence-cited findings
   * moved the old metric from 0.00 to 0.67 and dropped the composite from 0.700
   * to 0.633. It is now a DIAGNOSTIC, reported everywhere and weighted nowhere.
   */
  unmatchedFindingRate: number;
  /**
   * True false-positive rate, and `null` where it cannot be determined.
   *
   * Only a clean baseline licenses the claim that an unmatched finding is
   * false: the fixture is constructed to contain no genuine issues, so anything
   * flagged beyond its `allowedObservations` really is a false positive. On
   * seeded fixtures this is `null` and carries no weight.
   */
  falsePositiveRate: number | null;
  /** Ground truth items not found / total ground truth */
  falseNegativeRate: number;

  // Severity accuracy
  /** Correct severity rating / total matched findings */
  severityAccuracy: number;

  // Gap detection (the key differentiator)
  /** "What's Missing" items matching ground truth / total missing-category ground truth */
  missingCoverage: number;
  /** Perspective findings matching ground truth / total perspective-category ground truth */
  perspectiveCoverage: number;

  // Evidence quality
  /** CRITICAL+MAJOR findings with file:line evidence / total CRITICAL+MAJOR findings */
  evidenceRate: number;

  // Process compliance (boolean flags)
  /** Pre-commitment predictions present */
  hasPreCommitment: boolean;
  /** All 3 perspectives addressed */
  hasMultiPerspective: boolean;
  /** "What's Missing" section present and non-empty */
  hasGapAnalysis: boolean;

  /**
   * Which dimensions the fixture could actually express.
   *
   * LOCAL FIX (upstream e9e8fa38): upstream's composite treated an
   * inapplicable dimension as a zero score. A clean baseline has no ground
   * truth, so truePositiveRate, missingCoverage, perspectiveCoverage and
   * evidenceRate were all structurally pinned to 0 — a PERFECT clean-baseline
   * run (correct ACCEPT, no spurious findings, full process compliance) scored
   * 0.35/1.00 and was then averaged into the aggregate, dragging both arms
   * down. The composite now renormalises over applicable dimensions only.
   */
  applicability: DimensionApplicability;

  // Aggregate
  /** Weighted combination of the APPLICABLE metrics, renormalised to sum to 1 */
  compositeScore: number;
}

/**
 * A dimension is applicable when the fixture and the agent output can express
 * it. Inapplicable dimensions are excluded from the composite rather than
 * scored zero.
 */
export interface DimensionApplicability {
  /** Ground truth has at least one finding (truePositiveRate, falseNegativeRate) */
  detection: boolean;
  /** Ground truth has at least one `missing`-category finding */
  missingCoverage: boolean;
  /** Ground truth has at least one `perspective`-category finding */
  perspectiveCoverage: boolean;
  /** The agent produced at least one CRITICAL or MAJOR finding to cite evidence for */
  evidenceRate: boolean;
  /** The fixture is a clean baseline, so unmatched findings are genuinely false */
  falsePositiveRate: boolean;
}

/**
 * Result of running one agent against one fixture.
 */
export interface FixtureResult {
  fixtureId: string;
  domain: Domain;
  agentType: AgentType;
  parsedOutput: ParsedAgentOutput;
  scores: BenchmarkScores;
  /** Ground truth findings that were matched */
  matchedFindings: string[];
  /** Ground truth findings that were missed */
  missedFindings: string[];
  /** Agent findings that didn't match any ground truth */
  spuriousFindings: string[];
}

/**
 * Aggregated result comparing two agents across all fixtures.
 */
export interface BenchmarkReport {
  /** Timestamp of the benchmark run */
  timestamp: string;
  /** Model used for the benchmark */
  model: string;
  /** Per-fixture results for each agent */
  results: FixtureResult[];
  /**
   * Aggregate scores per agent, for the agents that actually ran.
   * LOCAL FIX (upstream e9e8fa38): was an exhaustive Record, which forced the
   * report to invent an entry for every known agent type even when only one ran.
   */
  aggregateScores: Partial<Record<AgentType, BenchmarkScores>>;
  /** Per-metric deltas (harsh-critic minus critic) */
  deltas: Partial<Record<keyof BenchmarkScores, number>>;
  /**
   * Per-fixture win/loss/tie, for fixtures BOTH agents completed.
   * LOCAL FIX (upstream e9e8fa38): the reporter previously zero-filled a
   * missing observation (`?? 0`), manufacturing a win for whichever agent did
   * run. Unpaired fixtures are now reported separately instead of scored.
   */
  headToHead: Array<{
    fixtureId: string;
    winner: AgentType | 'tie';
    delta: number;
  }>;
  /** Fixture ids that did not run for both agents, and so were not scored. */
  unpairedFixtures: string[];
}

// ============================================================
// SCORING WEIGHTS
// ============================================================

/**
 * Weights for composite score calculation.
 * Sum to 1.0.
 */
/**
 * Nominal weights. Only APPLICABLE dimensions enter the composite, and their
 * weights are renormalised to sum to 1 — so these are ratios between dimensions
 * rather than fixed shares. `unmatchedFindingRate` has no weight by design.
 */
export const SCORING_WEIGHTS = {
  truePositiveRate: 0.25,
  falseNegativeRate: 0.15,   // inverted: lower is better
  falsePositiveRate: 0.10,   // inverted: lower is better; clean baselines only
  missingCoverage: 0.20,     // key differentiator
  perspectiveCoverage: 0.10,
  evidenceRate: 0.10,
  processCompliance: 0.10,
} as const;

/**
 * Minimum keyword matches required to consider a ground truth finding "matched".
 */
export const MIN_KEYWORD_MATCHES = 2;

/**
 * Whether severity must match exactly or can be within 1 level.
 * Adjacent severities: CRITICAL↔MAJOR, MAJOR↔MINOR
 */
export const ALLOW_ADJACENT_SEVERITY = true;
