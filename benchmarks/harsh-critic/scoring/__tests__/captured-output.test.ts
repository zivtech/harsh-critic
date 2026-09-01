import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgentOutput } from '../parser.js';
import { matchFindings } from '../scorer.js';
import type { AgentType, GroundTruth } from '../types.js';

/**
 * Parser tests against the REAL captured agent outputs from the 2026-09-01
 * live run, asserted against a hand audit of those files.
 *
 * Why this file exists: upstream's parser tests used idealised samples where
 * every finding's bold title sat alone on its own line. Real model output does
 * not look like that — roughly a third of the captured findings are written as
 * `**M1 — title.** body prose on the same line`. That shape was silently
 * dropped by the parser, and because the only tests were idealised, the defect
 * survived into a scored run and corrupted its detection metrics.
 *
 * The counts below were established by reading all ten files by hand and
 * cross-checking with an independent mechanical extraction; both agreed on all
 * forty numbers. They are ground truth ABOUT THE PARSER, deliberately recorded
 * as data rather than derived from the scorer. Never "fix" a number here to
 * make a composite score move — if the parser disagrees with this table, either
 * the parser is wrong or the audit needs re-doing by reading the file again.
 *
 * Audit date: 2026-09-01. Source: research/upstream-omcc-critic-review.md §12.
 */

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

interface AuditEntry {
  verdict: string;
  critical: number;
  major: number;
  minor: number;
  missing: number;
}

const AUDIT: Record<string, AuditEntry> = {
  'critic__plan-api-redesign': { verdict: 'REJECT', critical: 4, major: 4, minor: 4, missing: 8 },
  'critic__plan-auth-migration': { verdict: 'REJECT', critical: 4, major: 6, minor: 4, missing: 7 },
  'critic__plan-clean-baseline': { verdict: 'REJECT', critical: 3, major: 6, minor: 6, missing: 7 },
  'critic__plan-data-pipeline': { verdict: 'REJECT', critical: 3, major: 12, minor: 4, missing: 8 },
  'critic__plan-weak-justification': { verdict: 'REJECT', critical: 3, major: 5, minor: 3, missing: 12 },
  'harsh-critic__plan-api-redesign': { verdict: 'REJECT', critical: 3, major: 6, minor: 3, missing: 10 },
  'harsh-critic__plan-auth-migration': { verdict: 'REJECT', critical: 3, major: 6, minor: 4, missing: 11 },
  'harsh-critic__plan-clean-baseline': { verdict: 'REVISE', critical: 0, major: 6, minor: 5, missing: 10 },
  'harsh-critic__plan-data-pipeline': { verdict: 'REJECT', critical: 2, major: 10, minor: 2, missing: 7 },
  'harsh-critic__plan-weak-justification': { verdict: 'REJECT', critical: 3, major: 8, minor: 3, missing: 12 },
};

function agentOf(key: string): AgentType {
  return (key.startsWith('harsh-critic__') ? 'harsh-critic' : 'critic') as AgentType;
}

function parseFixture(key: string) {
  const text = readFileSync(join(FIXTURES_DIR, `${key}.md`), 'utf8');
  return parseAgentOutput(text, agentOf(key));
}

describe('captured outputs are only scored against the plan they reviewed', () => {
  // The captured outputs are frozen artifacts of the 2026-09-01 run. Editing a
  // fixture plan afterwards silently invalidates them for scoring -- which is
  // precisely the class of stale-artifact error this whole audit was about.
  // Parser assertions over these files stay valid regardless; only scoring does
  // not. Any drifted plan must be declared, with a reason.
  const manifest = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'MANIFEST.json'), 'utf8'),
  ) as {
    planSha256AtCapture: Record<string, string>;
    staleForScoring: Record<string, string>;
  };

  const planPath = (fixtureId: string) =>
    join(FIXTURES_DIR, '..', '..', '..', 'fixtures', 'plans', `${fixtureId}.md`);

  test.each(Object.keys(manifest.planSha256AtCapture))(
    '%s: plan is unchanged since capture, or is declared stale',
    (fixtureId) => {
      const current = createHash('sha256')
        .update(readFileSync(planPath(fixtureId)))
        .digest('hex');
      if (current === manifest.planSha256AtCapture[fixtureId]) return;
      expect(
        manifest.staleForScoring[fixtureId],
        `${fixtureId}: plan text changed since the outputs were captured, so those outputs can no ` +
          `longer be scored against it. Declare it in MANIFEST.json staleForScoring with a reason, ` +
          `and re-run before reporting any number for this fixture.`,
      ).toBeTruthy();
    },
  );

  test('plan-clean-baseline is stale for scoring after the rebuild', () => {
    // Guards the specific case: the original fixture was not clean, so its two
    // captured outputs reviewed a different plan and cannot back a precision
    // claim against the rebuilt ground truth.
    expect(manifest.staleForScoring['plan-clean-baseline']).toMatch(/rebuilt/i);
  });
});

describe('captured live-run outputs: audit coverage', () => {
  test('every captured fixture has an audit entry', () => {
    const onDisk = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort();
    expect(onDisk).toEqual(Object.keys(AUDIT).sort());
  });
});

describe.each(Object.entries(AUDIT))('captured output: %s', (key, audit) => {
  test(`verdict is ${audit.verdict}`, () => {
    expect(parseFixture(key).verdict).toBe(audit.verdict);
  });

  test(`finds ${audit.critical} CRITICAL findings`, () => {
    expect(parseFixture(key).criticalFindings).toHaveLength(audit.critical);
  });

  test(`finds ${audit.major} MAJOR findings`, () => {
    expect(parseFixture(key).majorFindings).toHaveLength(audit.major);
  });

  test(`finds ${audit.minor} MINOR findings`, () => {
    expect(parseFixture(key).minorFindings).toHaveLength(audit.minor);
  });

  test(`finds ${audit.missing} What's Missing entries`, () => {
    expect(parseFixture(key).missingItems).toHaveLength(audit.missing);
  });
});

describe('output-shape regressions the live run exposed', () => {
  // The defect that produced the invalid first run: a finding whose bold title
  // is followed by body prose on the SAME line matched no list/heading pattern
  // and was dropped. Three of ten captured files write every MAJOR this way.
  test.each([
    ['critic__plan-data-pipeline', 12],
    ['critic__plan-weak-justification', 5],
    ['harsh-critic__plan-data-pipeline', 10],
  ])('%s: bold-lead-in findings are not dropped (%i MAJOR)', (key, expected) => {
    expect(parseFixture(key).majorFindings.length).toBe(expected);
  });

  test('a section with no findings parses as empty, not as a failure', () => {
    // harsh-critic returned REVISE on the clean baseline with no Critical
    // section at all. Absence must read as zero, not as an unparsed file.
    const parsed = parseFixture('harsh-critic__plan-clean-baseline');
    expect(parsed.criticalFindings).toHaveLength(0);
    expect(parsed.majorFindings.length).toBeGreaterThan(0);
    expect(parsed.verdict).toBe('REVISE');
  });

  test('verdict is found when it is not on the first line', () => {
    // Two harsh-critic outputs open with prose or a title before the verdict
    // (line 5 and line 9 respectively).
    expect(parseFixture('harsh-critic__plan-auth-migration').verdict).toBe('REJECT');
    expect(parseFixture('harsh-critic__plan-weak-justification').verdict).toBe('REJECT');
  });

  test('verdict is found under an h1 heading as well as bold', () => {
    // harsh-critic__plan-api-redesign uses `# VERDICT: REJECT`; the rest use
    // `**VERDICT: ...**`.
    expect(parseFixture('harsh-critic__plan-api-redesign').verdict).toBe('REJECT');
  });

  test('findings numbered continuously across sections are attributed correctly', () => {
    // harsh-critic__plan-auth-migration numbers findings 1-9 straight through:
    // Critical = 1,2,3 and Major = 4-9, rather than C1-C3 / M1-M6.
    const parsed = parseFixture('harsh-critic__plan-auth-migration');
    expect(parsed.criticalFindings).toHaveLength(3);
    expect(parsed.majorFindings).toHaveLength(6);
  });

  test('a consolidated finding can satisfy more than one seeded flaw', () => {
    // On plan-api-redesign the baseline arm answers SF-1 (appeal to authority)
    // and SF-2 (false dichotomy / no REST alternative) inside a single C1
    // block. Scoring one agent finding against at most one seeded flaw counted
    // that as 1/3 and penalised consolidation rather than measuring detection.
    // Each flaw still has to clear the keyword bar on its own.
    const parsed = parseFixture('critic__plan-api-redesign');
    const groundTruth = JSON.parse(
      readFileSync(
        join(FIXTURES_DIR, '..', '..', '..', 'ground-truth', 'plan-api-redesign.json'),
        'utf8',
      ),
    ) as GroundTruth;
    const matched = matchFindings(parsed, groundTruth).matchedIds;
    expect(matched).toContain('SF-1');
    expect(matched).toContain('SF-2');
  });

  test('header style varies within each arm, so parsing cannot key on it', () => {
    // Both arms mix `##`/`###` and `**bold**` section headers across runs, and
    // harsh-critic__plan-data-pipeline mixes both styles inside one file. The
    // first live run misread this as an arm-level style split.
    const hashStyle = parseFixture('harsh-critic__plan-api-redesign');
    const boldStyle = parseFixture('harsh-critic__plan-auth-migration');
    expect(hashStyle.criticalFindings.length).toBeGreaterThan(0);
    expect(boldStyle.criticalFindings.length).toBeGreaterThan(0);
  });
});
