/**
 * Report generator for benchmark results.
 *
 * Produces both machine-readable JSON (BenchmarkReport) and human-readable
 * markdown summaries comparing harsh-critic vs critic agents.
 */

import type {
  AgentType,
  BenchmarkReport,
  BenchmarkScores,
  FixtureResult,
} from './types.js';
import { aggregateScores } from './scorer.js';

// ============================================================
// Public: generateJsonReport
// ============================================================

/**
 * Build a structured BenchmarkReport from raw fixture results.
 *
 * @param results - All FixtureResult entries (both agent types, all fixtures).
 * @param model   - Model identifier used during the benchmark run.
 */
export function generateJsonReport(
  results: FixtureResult[],
  model: string,
): BenchmarkReport {
  const harshResults = results.filter((r) => r.agentType === 'harsh-critic');
  const criticResults = results.filter((r) => r.agentType === 'critic');

  const harshAggregate = aggregateScores(harshResults);
  const criticAggregate = aggregateScores(criticResults);

  // LOCAL FIX (upstream e9e8fa38): only report agents that actually produced
  // results. An exhaustive map published an all-zero aggregate for an agent
  // that never ran, which reads as a catastrophic score rather than "absent".
  const aggregateScoresMap: Partial<Record<AgentType, BenchmarkScores>> = {};
  if (harshResults.length > 0) aggregateScoresMap['harsh-critic'] = harshAggregate;
  if (criticResults.length > 0) aggregateScoresMap['critic'] = criticAggregate;

  // Per-metric deltas (harsh-critic minus critic) for numeric fields only
  const numericKeys: Array<keyof BenchmarkScores> = [
    'truePositiveRate',
    'falsePositiveRate',
    'falseNegativeRate',
    'severityAccuracy',
    'missingCoverage',
    'perspectiveCoverage',
    'evidenceRate',
    'compositeScore',
  ];

  const deltas: Partial<Record<keyof BenchmarkScores, number>> = {};
  for (const key of numericKeys) {
    const harshVal = harshAggregate[key];
    const criticVal = criticAggregate[key];
    if (typeof harshVal === 'number' && typeof criticVal === 'number') {
      deltas[key] = harshVal - criticVal;
    }
  }

  // Head-to-head per fixture (match by fixtureId).
  // LOCAL FIX (upstream e9e8fa38): upstream zero-filled a missing observation
  // (`?? 0`), so a fixture that ran for only one agent produced a fabricated
  // landslide win for that agent. Unpaired fixtures are excluded and reported.
  // This mirrors the pairing contract in benchmarks/shared/reporter.ts.
  const fixtureIds = Array.from(new Set(results.map((r) => r.fixtureId)));
  const headToHead: BenchmarkReport['headToHead'] = [];
  const unpairedFixtures: string[] = [];

  for (const fixtureId of fixtureIds) {
    const harsh = harshResults.find((r) => r.fixtureId === fixtureId);
    const critic = criticResults.find((r) => r.fixtureId === fixtureId);

    if (!harsh || !critic) {
      unpairedFixtures.push(fixtureId);
      continue;
    }

    const delta = harsh.scores.compositeScore - critic.scores.compositeScore;

    let winner: AgentType | 'tie';
    if (Math.abs(delta) < 0.001) {
      winner = 'tie';
    } else if (delta > 0) {
      winner = 'harsh-critic';
    } else {
      winner = 'critic';
    }

    headToHead.push({ fixtureId, winner, delta });
  }

  return {
    timestamp: new Date().toISOString(),
    model,
    results,
    aggregateScores: aggregateScoresMap,
    deltas,
    headToHead,
    unpairedFixtures,
  };
}

// ============================================================
// Markdown formatting helpers
// ============================================================

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function sign(value: number): string {
  return value >= 0 ? `+${pct(value)}` : `-${pct(Math.abs(value))}`;
}

function bool(value: boolean): string {
  return value ? 'yes' : 'no';
}

const METRIC_LABELS: Partial<Record<keyof BenchmarkScores, string>> = {
  truePositiveRate: 'True Positive Rate',
  falseNegativeRate: 'False Negative Rate',
  unmatchedFindingRate: 'Unmatched Finding Rate (diagnostic)',
  falsePositiveRate: 'False Positive Rate (clean baselines)',
  severityAccuracy: 'Severity Accuracy',
  missingCoverage: 'Missing Coverage',
  perspectiveCoverage: 'Perspective Coverage',
  evidenceRate: 'Evidence Rate',
  compositeScore: 'Composite Score',
};

const SUMMARY_METRICS: Array<keyof BenchmarkScores> = [
  'truePositiveRate',
  'falseNegativeRate',
  'falsePositiveRate',
  'severityAccuracy',
  'missingCoverage',
  'perspectiveCoverage',
  'evidenceRate',
  'compositeScore',
];

// ============================================================
// Public: generateMarkdownReport
// ============================================================

/**
 * Render a human-readable markdown report from a BenchmarkReport.
 */
export function generateMarkdownReport(report: BenchmarkReport): string {
  const harsh = report.aggregateScores['harsh-critic'];
  const critic = report.aggregateScores['critic'];

  const fixtureCount = new Set(report.results.map((r) => r.fixtureId)).size;

  const lines: string[] = [];

  // ---- Header ----
  lines.push('# Harsh-Critic Benchmark Report');
  lines.push('');
  lines.push(`**Date**: ${report.timestamp}`);
  lines.push(`**Model**: ${report.model}`);
  lines.push(`**Fixtures**: ${fixtureCount}`);
  lines.push('');

  // LOCAL FIX (upstream e9e8fa38): the summary table assumed both agents ran.
  // With a partial aggregate map a single-agent run must say so rather than
  // render a comparison against an absent arm.
  if (report.unpairedFixtures.length > 0) {
    lines.push(
      `**Unpaired fixtures (not scored)**: ${report.unpairedFixtures.join(', ')}`,
    );
    lines.push('');
  }

  if (!harsh || !critic) {
    lines.push('## Summary');
    lines.push('');
    lines.push(
      'Comparison unavailable — this run produced results for ' +
        `${[harsh && 'harsh-critic', critic && 'critic'].filter(Boolean).join(' and ') || 'no agent'}.`,
    );
    lines.push('');
    return lines.join('\n');
  }

  // ---- Summary Table ----
  lines.push('## Summary Table');
  lines.push('');
  lines.push('| Metric | harsh-critic | critic | Delta |');
  lines.push('|--------|-------------|--------|-------|');

  for (const key of SUMMARY_METRICS) {
    const label = METRIC_LABELS[key] ?? key;
    const harshVal = harsh[key];
    const criticVal = critic[key];
    if (typeof harshVal === 'number' && typeof criticVal === 'number') {
      const delta = harshVal - criticVal;
      lines.push(`| ${label} | ${pct(harshVal)} | ${pct(criticVal)} | ${sign(delta)} |`);
    }
  }

  // Process compliance booleans
  lines.push(`| Pre-Commitment | ${bool(harsh.hasPreCommitment)} | ${bool(critic.hasPreCommitment)} | — |`);
  lines.push(`| Multi-Perspective | ${bool(harsh.hasMultiPerspective)} | ${bool(critic.hasMultiPerspective)} | — |`);
  lines.push(`| Gap Analysis | ${bool(harsh.hasGapAnalysis)} | ${bool(critic.hasGapAnalysis)} | — |`);
  lines.push('');

  // ---- Per-Fixture Results ----
  lines.push('## Per-Fixture Results');
  lines.push('');

  const fixtureIds = Array.from(new Set(report.results.map((r) => r.fixtureId))).sort();

  for (const fixtureId of fixtureIds) {
    lines.push(`### ${fixtureId}`);
    lines.push('');

    for (const agentType of ['harsh-critic', 'critic'] as AgentType[]) {
      const result = report.results.find(
        (r) => r.fixtureId === fixtureId && r.agentType === agentType,
      );
      if (!result) continue;

      const s = result.scores;
      lines.push(
        `- **${agentType}**: composite=${pct(s.compositeScore)} ` +
          `tp=${pct(s.truePositiveRate)} fn=${pct(s.falseNegativeRate)} ` +
          `unmatched=${pct(s.unmatchedFindingRate)} ` +
          `fp=${s.falsePositiveRate === null ? 'n/a' : pct(s.falsePositiveRate)}`,
      );
      lines.push(
        `  - Matched: ${result.matchedFindings.length}/${result.matchedFindings.length + result.missedFindings.length} findings`,
      );

      if (result.missedFindings.length > 0) {
        lines.push(`  - Missed: ${result.missedFindings.join(', ')}`);
      }
      if (result.spuriousFindings.length > 0) {
        const preview = result.spuriousFindings
          .slice(0, 3)
          .map((t) => t.slice(0, 60).replace(/\n/g, ' '))
          .join('; ');
        lines.push(`  - Spurious: ${preview}${result.spuriousFindings.length > 3 ? ' …' : ''}`);
      }
    }
    lines.push('');
  }

  // ---- Statistical Summary ----
  lines.push('## Statistical Summary');
  lines.push('');

  const meanDelta = report.headToHead.reduce((acc, h) => acc + h.delta, 0) /
    Math.max(report.headToHead.length, 1);

  const wins = report.headToHead.filter((h) => h.winner === 'harsh-critic').length;
  const losses = report.headToHead.filter((h) => h.winner === 'critic').length;
  const ties = report.headToHead.filter((h) => h.winner === 'tie').length;

  lines.push(`- Mean composite delta: ${sign(meanDelta)}`);
  lines.push(`- Win/Loss/Tie: ${wins}/${losses}/${ties}`);
  lines.push('');

  // ---- Key Insight ----
  lines.push('## Key Insight');
  lines.push('');

  // Find metric with largest absolute improvement for harsh-critic
  let largestMetric: string = 'compositeScore';
  let largestDelta = 0;

  for (const key of SUMMARY_METRICS) {
    const delta = report.deltas[key];
    if (typeof delta === 'number' && Math.abs(delta) > Math.abs(largestDelta)) {
      largestDelta = delta;
      largestMetric = key;
    }
  }

  const label = METRIC_LABELS[largestMetric as keyof BenchmarkScores] ?? largestMetric;
  const direction = largestDelta >= 0 ? 'improved' : 'regressed';
  lines.push(
    `**${label}** showed the largest difference: harsh-critic ${direction} by ${sign(largestDelta)} over critic.`,
  );
  lines.push('');

  return lines.join('\n');
}
