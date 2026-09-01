/**
 * Scorer for matching parsed agent output against ground truth and computing
 * benchmark metrics.
 */

import type {
  BenchmarkScores,
  DimensionApplicability,
  FixtureResult,
  GroundTruth,
  GroundTruthFinding,
  ParsedAgentOutput,
  ParsedFinding,
  Severity,
} from './types.js';
import {
  ALLOW_ADJACENT_SEVERITY,
  MIN_KEYWORD_MATCHES,
  SCORING_WEIGHTS,
} from './types.js';

// ============================================================
// Types
// ============================================================

export interface MatchResult {
  /** Ground truth finding IDs that were matched */
  matchedIds: string[];
  /** Ground truth finding IDs that were missed */
  missedIds: string[];
  /** Agent finding texts that didn't match any ground truth */
  spuriousTexts: string[];
  /** Total agent findings considered */
  totalAgentFindings: number;
}

// ============================================================
// Severity adjacency helpers
// ============================================================

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'MAJOR', 'MINOR'];

function severityDistance(a: Severity, b: Severity): number {
  return Math.abs(SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b));
}

function severityMatches(agentSeverity: Severity, gtSeverity: Severity): boolean {
  const dist = severityDistance(agentSeverity, gtSeverity);
  return ALLOW_ADJACENT_SEVERITY ? dist <= 1 : dist === 0;
}

// ============================================================
// Keyword matching
// ============================================================

function normalizeTextForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[`*_#()[\]{}<>"'.,;!?|\\]/g, ' ')
    .replace(/[-/:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordMatchesText(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  if (lowerText.includes(lowerKeyword)) {
    return true;
  }

  const normalizedText = normalizeTextForMatch(text);
  const normalizedKeyword = normalizeTextForMatch(keyword);
  if (!normalizedKeyword) return false;

  if (normalizedText.includes(normalizedKeyword)) {
    return true;
  }

  const keywordParts = normalizedKeyword.split(' ').filter(Boolean);
  if (keywordParts.length <= 1) return false;

  // Phrase fallback: all phrase tokens present, order-independent.
  return keywordParts.every((part) => normalizedText.includes(part));
}

function countKeywordMatches(text: string, keywords: string[]): number {
  return keywords.filter((kw) => keywordMatchesText(text, kw)).length;
}

function requiredKeywordMatches(keywords: string[]): number {
  if (keywords.length === 0) return 0;

  // Scale with keyword set size to reduce accidental matches on larger sets:
  // 4/5 keywords -> 2 required, 6 keywords -> 3 required.
  const proportional = Math.ceil(keywords.length * 0.4);
  return Math.min(
    keywords.length,
    Math.max(MIN_KEYWORD_MATCHES, proportional),
  );
}

/** Exposed for ground-truth validation tests. */
export function requiredKeywordMatchesForTest(keywords: string[]): number {
  return requiredKeywordMatches(keywords);
}

function textMatchesGroundTruth(text: string, gt: GroundTruthFinding): boolean {
  return countKeywordMatches(text, gt.keywords) >= requiredKeywordMatches(gt.keywords);
}

// ============================================================
// Flat agent finding list
// ============================================================

interface FlatFinding {
  text: string;
  severity: Severity;
  hasEvidence: boolean;
}

function flattenAgentFindings(parsed: ParsedAgentOutput): FlatFinding[] {
  const findings: FlatFinding[] = [];

  for (const f of parsed.criticalFindings) {
    findings.push({ text: f.text, severity: f.severity, hasEvidence: f.hasEvidence });
  }
  for (const f of parsed.majorFindings) {
    findings.push({ text: f.text, severity: f.severity, hasEvidence: f.hasEvidence });
  }
  for (const f of parsed.minorFindings) {
    findings.push({ text: f.text, severity: f.severity, hasEvidence: f.hasEvidence });
  }

  // missingItems and perspective notes are plain strings; treat as MINOR evidence-less
  for (const text of parsed.missingItems) {
    findings.push({ text, severity: 'MINOR', hasEvidence: false });
  }
  for (const text of [
    ...parsed.perspectiveNotes.security,
    ...parsed.perspectiveNotes.newHire,
    ...parsed.perspectiveNotes.ops,
  ]) {
    findings.push({ text, severity: 'MINOR', hasEvidence: false });
  }

  return findings;
}

// ============================================================
// Public: matchFindings
// ============================================================

/**
 * Match agent findings to ground truth findings using keyword overlap.
 * Each ground truth finding can be matched at most once (greedy first-match).
 */
export function matchFindings(
  parsed: ParsedAgentOutput,
  groundTruth: GroundTruth,
): MatchResult {
  const agentFindings = flattenAgentFindings(parsed);
  const matchedIds = new Set<string>();
  const matchedAgentIndices = new Set<number>();

  for (const gt of groundTruth.findings) {
    for (let i = 0; i < agentFindings.length; i++) {
      if (matchedAgentIndices.has(i)) continue;
      const af = agentFindings[i];
      if (textMatchesGroundTruth(af.text, gt)) {
        matchedIds.add(gt.id);
        matchedAgentIndices.add(i);
        break; // greedy first-match; move to next GT finding
      }
    }
  }

  const missedIds = groundTruth.findings
    .filter((gt) => !matchedIds.has(gt.id))
    .map((gt) => gt.id);

  const spuriousTexts = agentFindings
    .filter((_, i) => !matchedAgentIndices.has(i))
    .map((f) => f.text);

  return {
    matchedIds: Array.from(matchedIds),
    missedIds,
    spuriousTexts,
    totalAgentFindings: agentFindings.length,
  };
}

// ============================================================
// Severity accuracy helper
// ============================================================

/**
 * For each matched ground truth finding, check whether the agent's severity
 * for its matched finding aligns (exact or adjacent).
 */
function computeSeverityAccuracy(
  parsed: ParsedAgentOutput,
  groundTruth: GroundTruth,
  matchedIds: string[],
): number {
  if (matchedIds.length === 0) return 0;

  // Build a lookup from GT id -> GT severity
  const gtSeverityMap = new Map<string, Severity>(
    groundTruth.findings.map((gt) => [gt.id, gt.severity]),
  );

  // Collect all ParsedFindings with their severity (index-tracked to avoid reuse)
  const allParsed: ParsedFinding[] = [
    ...parsed.criticalFindings,
    ...parsed.majorFindings,
    ...parsed.minorFindings,
  ];

  const usedAgentIndices = new Set<number>();
  let correct = 0;

  for (const gtId of matchedIds) {
    const gtSeverity = gtSeverityMap.get(gtId);
    if (!gtSeverity) continue;

    const gt = groundTruth.findings.find((f) => f.id === gtId);
    if (!gt) continue;

    // Find the first unused agent finding that keyword-matches this GT entry
    let matchIdx = -1;
    for (let i = 0; i < allParsed.length; i++) {
      if (usedAgentIndices.has(i)) continue;
      if (countKeywordMatches(allParsed[i].text, gt.keywords) >= requiredKeywordMatches(gt.keywords)) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== -1) {
      usedAgentIndices.add(matchIdx);
      if (severityMatches(allParsed[matchIdx].severity, gtSeverity)) {
        correct++;
      }
    }
  }

  return correct / matchedIds.length;
}

// ============================================================
// Subset helpers
// ============================================================

function findingsForCategory(
  groundTruth: GroundTruth,
  category: GroundTruthFinding['category'],
): GroundTruthFinding[] {
  return groundTruth.findings.filter((f) => f.category === category);
}

/**
 * Count how many of the given GT IDs overlap with the given set.
 */
function countOverlap(ids: string[], matchedIds: string[]): number {
  const matched = new Set(matchedIds);
  return ids.filter((id) => matched.has(id)).length;
}

// ============================================================
// Evidence rate
// ============================================================

function computeEvidenceRate(parsed: ParsedAgentOutput): number {
  const highSeverity: ParsedFinding[] = [
    ...parsed.criticalFindings,
    ...parsed.majorFindings,
  ];
  if (highSeverity.length === 0) return 0;
  const withEvidence = highSeverity.filter((f) => f.hasEvidence).length;
  return withEvidence / highSeverity.length;
}

// ============================================================
// Clean-baseline false positives
// ============================================================

/**
 * On a clean baseline, count findings that match neither ground truth (there is
 * none) nor an `allowedObservations` entry. The allowance exists so a critic
 * that draws a fair minor observation about a deliberately solid fixture is not
 * charged as if it hallucinated.
 */
function computeCleanBaselineFalsePositiveRate(
  spuriousTexts: string[],
  groundTruth: GroundTruth,
): number {
  if (spuriousTexts.length === 0) return 0;

  const allowed = groundTruth.allowedObservations ?? [];
  if (allowed.length === 0) return 1;

  const disallowed = spuriousTexts.filter(
    (text) =>
      !allowed.some(
        (observation) =>
          countKeywordMatches(text, observation.keywords) >=
          requiredKeywordMatches(observation.keywords),
      ),
  );
  return disallowed.length / spuriousTexts.length;
}

// ============================================================
// Composite score
// ============================================================

/**
 * Weighted mean over APPLICABLE dimensions only, renormalised to sum to 1.
 *
 * LOCAL FIX (upstream e9e8fa38): upstream summed every dimension against fixed
 * weights, so a dimension the fixture could not express scored 0 rather than
 * being excluded. Two consequences it produced:
 *
 *   - A perfect clean-baseline run scored 0.35/1.00 (no ground truth means
 *     truePositiveRate, missingCoverage, perspectiveCoverage and evidenceRate
 *     are all structurally zero), then got averaged into the aggregate.
 *   - Any fixture set without `perspective`-category ground truth silently
 *     forfeited 10% of every score.
 *
 * `unmatchedFindingRate` is deliberately absent: it cannot distinguish a
 * spurious finding from a real one the fixture author did not seed.
 */
function computeComposite(
  scores: Omit<BenchmarkScores, 'compositeScore'>,
): number {
  const w = SCORING_WEIGHTS;
  const { applicability } = scores;

  const processComplianceScore =
    [scores.hasPreCommitment, scores.hasMultiPerspective, scores.hasGapAnalysis].filter(
      Boolean,
    ).length / 3;

  const dimensions: Array<{ weight: number; value: number; applicable: boolean }> = [
    {
      weight: w.truePositiveRate,
      value: scores.truePositiveRate,
      applicable: applicability.detection,
    },
    {
      weight: w.falseNegativeRate,
      value: 1 - scores.falseNegativeRate,
      applicable: applicability.detection,
    },
    {
      weight: w.falsePositiveRate,
      value: 1 - (scores.falsePositiveRate ?? 0),
      applicable: applicability.falsePositiveRate && scores.falsePositiveRate !== null,
    },
    {
      weight: w.missingCoverage,
      value: scores.missingCoverage,
      applicable: applicability.missingCoverage,
    },
    {
      weight: w.perspectiveCoverage,
      value: scores.perspectiveCoverage,
      applicable: applicability.perspectiveCoverage,
    },
    {
      weight: w.evidenceRate,
      value: scores.evidenceRate,
      applicable: applicability.evidenceRate,
    },
    // Process compliance is always expressible: any output either follows the
    // protocol's structure or does not.
    { weight: w.processCompliance, value: processComplianceScore, applicable: true },
  ];

  const applicable = dimensions.filter((d) => d.applicable);
  const totalWeight = applicable.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return 0;

  return applicable.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight;
}

// ============================================================
// Public: scoreFixture
// ============================================================

/**
 * Compute all 7 benchmark metrics plus composite score for one agent/fixture pair.
 */
export function scoreFixture(
  parsed: ParsedAgentOutput,
  groundTruth: GroundTruth,
): BenchmarkScores {
  const matchResult = matchFindings(parsed, groundTruth);
  const { matchedIds, missedIds, spuriousTexts, totalAgentFindings } = matchResult;

  const totalGt = groundTruth.findings.length;

  // Core detection
  const truePositiveRate = totalGt > 0 ? matchedIds.length / totalGt : 0;
  const falseNegativeRate = totalGt > 0 ? missedIds.length / totalGt : 0;

  // Diagnostic only — an unmatched finding may be spurious OR a real issue the
  // fixture author never seeded. The scorer cannot tell which.
  const unmatchedFindingRate =
    totalAgentFindings > 0 ? spuriousTexts.length / totalAgentFindings : 0;

  // A clean baseline is built to contain no genuine issues, so anything it
  // flags beyond its allowedObservations really is a false positive. That is
  // the only case where the answer key is authoritative about absence.
  const falsePositiveRate = groundTruth.isCleanBaseline
    ? computeCleanBaselineFalsePositiveRate(spuriousTexts, groundTruth)
    : null;

  // Severity accuracy
  const severityAccuracy = computeSeverityAccuracy(parsed, groundTruth, matchedIds);

  // Gap detection
  const missingGt = findingsForCategory(groundTruth, 'missing');
  const missingCoverage =
    missingGt.length > 0
      ? countOverlap(
          missingGt.map((f) => f.id),
          matchedIds,
        ) / missingGt.length
      : 0;

  const perspectiveGt = findingsForCategory(groundTruth, 'perspective');
  const perspectiveCoverage =
    perspectiveGt.length > 0
      ? countOverlap(
          perspectiveGt.map((f) => f.id),
          matchedIds,
        ) / perspectiveGt.length
      : 0;

  // Evidence quality
  const evidenceRate = computeEvidenceRate(parsed);

  // Process compliance
  const hasPreCommitment = parsed.hasPreCommitment;
  const hasMultiPerspective = parsed.hasMultiPerspective;
  const hasGapAnalysis = parsed.hasGapAnalysis;

  const applicability: DimensionApplicability = {
    detection: totalGt > 0,
    missingCoverage: missingGt.length > 0,
    perspectiveCoverage: perspectiveGt.length > 0,
    evidenceRate:
      parsed.criticalFindings.length + parsed.majorFindings.length > 0,
    falsePositiveRate: groundTruth.isCleanBaseline,
  };

  const partial = {
    truePositiveRate,
    unmatchedFindingRate,
    falsePositiveRate,
    falseNegativeRate,
    severityAccuracy,
    missingCoverage,
    perspectiveCoverage,
    evidenceRate,
    hasPreCommitment,
    hasMultiPerspective,
    hasGapAnalysis,
    applicability,
  };

  return { ...partial, compositeScore: computeComposite(partial) };
}

// ============================================================
// Public: aggregateScores
// ============================================================

type NumericScoreKey = {
  [K in keyof BenchmarkScores]: BenchmarkScores[K] extends number ? K : never;
}[keyof BenchmarkScores];

type BooleanScoreKey = {
  [K in keyof BenchmarkScores]: BenchmarkScores[K] extends boolean ? K : never;
}[keyof BenchmarkScores];

const NUMERIC_KEYS: NumericScoreKey[] = [
  'truePositiveRate',
  'unmatchedFindingRate',
  'falseNegativeRate',
  'severityAccuracy',
  'missingCoverage',
  'perspectiveCoverage',
  'evidenceRate',
  'compositeScore',
];

const BOOLEAN_KEYS: BooleanScoreKey[] = [
  'hasPreCommitment',
  'hasMultiPerspective',
  'hasGapAnalysis',
];

/**
 * Average scores across multiple fixture results (for the same agent type).
 */
export function aggregateScores(results: FixtureResult[]): BenchmarkScores {
  if (results.length === 0) {
    return {
      truePositiveRate: 0,
      unmatchedFindingRate: 0,
      falsePositiveRate: null,
      falseNegativeRate: 0,
      severityAccuracy: 0,
      missingCoverage: 0,
      perspectiveCoverage: 0,
      evidenceRate: 0,
      hasPreCommitment: false,
      hasMultiPerspective: false,
      hasGapAnalysis: false,
      applicability: {
        detection: false,
        missingCoverage: false,
        perspectiveCoverage: false,
        evidenceRate: false,
        falsePositiveRate: false,
      },
      compositeScore: 0,
    };
  }

  const n = results.length;
  const aggregate = {} as BenchmarkScores;

  for (const key of NUMERIC_KEYS) {
    const sum = results.reduce((acc, r) => acc + (r.scores[key] as number), 0);
    (aggregate as unknown as Record<string, number>)[key] = sum / n;
  }

  for (const key of BOOLEAN_KEYS) {
    // Majority vote: true if more than half of results have it true
    const trueCount = results.filter((r) => r.scores[key] as boolean).length;
    (aggregate as unknown as Record<string, boolean>)[key] = trueCount > n / 2;
  }

  // Average the true false-positive rate over the fixtures that can express it
  // (clean baselines). Averaging it as 0 elsewhere would dilute the only
  // precision signal the suite has.
  const fprValues = results
    .map((r) => r.scores.falsePositiveRate)
    .filter((value): value is number => value !== null);
  aggregate.falsePositiveRate =
    fprValues.length > 0
      ? fprValues.reduce((sum, value) => sum + value, 0) / fprValues.length
      : null;

  // A dimension is applicable in aggregate if any fixture could express it.
  aggregate.applicability = {
    detection: results.some((r) => r.scores.applicability.detection),
    missingCoverage: results.some((r) => r.scores.applicability.missingCoverage),
    perspectiveCoverage: results.some(
      (r) => r.scores.applicability.perspectiveCoverage,
    ),
    evidenceRate: results.some((r) => r.scores.applicability.evidenceRate),
    falsePositiveRate: results.some(
      (r) => r.scores.applicability.falsePositiveRate,
    ),
  };

  return aggregate;
}
