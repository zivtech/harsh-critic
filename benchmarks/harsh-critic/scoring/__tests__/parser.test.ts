import { describe, test, expect } from 'vitest';
import { parseAgentOutput } from '../parser.js';

// ============================================================
// Canned test data
// ============================================================

const SAMPLE_HARSH_CRITIC_OUTPUT = `**VERDICT: REJECT**

**Overall Assessment**: The auth migration plan has critical gaps that block safe execution.

**Pre-commitment Predictions**: Based on auth migration plans, I predict stale references and missing rollback procedures.

**Critical Findings** (blocks execution):
1. **Stale function reference**: The plan references \`validateSession()\` at \`auth.ts:42\` but this was renamed to \`verifySession()\` three weeks ago.
   - Why this matters: Executors will hit a runtime error
   - Fix: Update all references to \`verifySession()\`

**Major Findings** (causes significant rework):
1. No rate limiting strategy defined for the new endpoints.
   - Why this matters: DDoS vulnerability
   - Fix: Add rate limiting middleware config

**Minor Findings** (suboptimal but functional):
1. Inconsistent token naming throughout the plan

**What's Missing** (gaps, unhandled edge cases):
- No session invalidation plan for existing users
- No load testing mentioned
- No monitoring for auth failure spikes

**Multi-Perspective Notes**:
- Security: JWT secret rotation not addressed
- New-hire: Internal RBAC model assumed but not documented
- Ops: No circuit breaker for OAuth provider downtime

**Verdict Justification**: Critical stale references and missing rollback make this unexecutable.`;

const SAMPLE_MARKDOWN_HEADING_OUTPUT = `**VERDICT: REJECT**

## Pre-commitment Predictions
1. Task ordering issues

## Critical Findings
**1. Dual-write starts before schema readiness**
- **Evidence:** \`plan-auth-migration.md:117\`
- **Why this matters:** Deployment can fail mid-rollout.
- **Fix:** Gate dual-write behind completed migration.

## Major Findings
**1. No rollback drill documented**
- **Evidence:** processPayment():47-52
- **Why this matters:** Rollback quality is unverified.
- **Fix:** Add rollback test runbook.

## Minor Findings
- Naming inconsistency remains.

## What's Missing
- No load testing strategy

## Phase 3 — Multi-Perspective Review
### Security Engineer Perspective
- JWT secret rotation not addressed
### New-Hire Perspective
- RBAC model is assumed and undocumented
### Ops Engineer Perspective
- No circuit breaker for OAuth downtime`;

const SAMPLE_CRITIC_OUTPUT = `**[REJECT]**

**Summary**:
- The auth migration plan has critical stale references
- No rate limiting strategy

**Justification**:
- validateSession() is outdated
- Missing monitoring plan`;

const SAMPLE_CRITIC_OUTPUT_BARE_VERDICT = `REJECT

**Summary**:
- The migration has stale references`;

const SAMPLE_EMPTY_OUTPUT = ``;

// ============================================================
// Tests
// ============================================================

describe('parseAgentOutput', () => {
  describe('harsh-critic format', () => {
    test('extracts verdict from bold-formatted output', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.verdict).toBe('REJECT');
    });

    test('extracts critical findings with evidence detection', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.criticalFindings).toHaveLength(1);
      expect(result.criticalFindings[0].text).toContain('Stale function reference');
      expect(result.criticalFindings[0].severity).toBe('CRITICAL');
      expect(result.criticalFindings[0].hasEvidence).toBe(true);
    });

    test('extracts major findings', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.majorFindings).toHaveLength(1);
      expect(result.majorFindings[0].text).toContain('rate limiting');
    });

    test('extracts minor findings', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.minorFindings).toHaveLength(1);
    });

    test('extracts missing items from "What\'s Missing" section', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.missingItems).toHaveLength(3);
      expect(result.missingItems[0]).toContain('session invalidation');
    });

    test('extracts multi-perspective notes', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.perspectiveNotes.security).toHaveLength(1);
      expect(result.perspectiveNotes.newHire).toHaveLength(1);
      expect(result.perspectiveNotes.ops).toHaveLength(1);
      expect(result.perspectiveNotes.security[0]).toContain('JWT secret rotation');
    });

    test('detects process compliance flags', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.hasPreCommitment).toBe(true);
      expect(result.hasGapAnalysis).toBe(true);
      expect(result.hasMultiPerspective).toBe(true);
    });

    test('preserves raw output', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic');
      expect(result.rawOutput).toBe(SAMPLE_HARSH_CRITIC_OUTPUT);
    });

    // --- PR #1301: parser hardening tests ---

    test('parses markdown heading sections (##) and bold-number findings', () => {
      const result = parseAgentOutput(SAMPLE_MARKDOWN_HEADING_OUTPUT, 'harsh-critic');
      expect(result.hasPreCommitment).toBe(true);
      expect(result.criticalFindings).toHaveLength(1);
      expect(result.majorFindings).toHaveLength(1);
      expect(result.minorFindings).toHaveLength(1);
      expect(result.missingItems).toHaveLength(1);
    });

    test('parses perspective subsection headings under multi-perspective review', () => {
      const result = parseAgentOutput(SAMPLE_MARKDOWN_HEADING_OUTPUT, 'harsh-critic');
      expect(result.hasMultiPerspective).toBe(true);
      expect(result.perspectiveNotes.security).toHaveLength(1);
      expect(result.perspectiveNotes.newHire).toHaveLength(1);
      expect(result.perspectiveNotes.ops).toHaveLength(1);
      expect(result.perspectiveNotes.security[0]).toContain('JWT secret rotation');
    });

    test('treats "None." as no missing items but still marks gap-analysis section as present', () => {
      const output = `**VERDICT: ACCEPT**

## What's Missing
None.`;
      const result = parseAgentOutput(output, 'harsh-critic');
      expect(result.hasGapAnalysis).toBe(true);
      expect(result.missingItems).toHaveLength(0);
    });

    test('hasEvidence is true for function():line-range evidence markers', () => {
      const output = `**VERDICT: REJECT**

## Major Findings
1. Retry behavior is unsafe at processPayment():47-52`;
      const result = parseAgentOutput(output, 'harsh-critic');
      expect(result.majorFindings).toHaveLength(1);
      expect(result.majorFindings[0].hasEvidence).toBe(true);
    });
  });

  // LOCAL FIX (upstream e9e8fa38): this block exercises the PRE-CONSOLIDATION
  // critic output format (bracketed OKAY/REJECT, Summary/Justification only).
  // Upstream passed 'critic' here, which is why the stale routing survived —
  // the tests agreed with the bug. That format is now named 'critic-legacy'.
  describe('critic-legacy format (pre-consolidation)', () => {
    test('extracts critic verdict from bracket format', () => {
      const result = parseAgentOutput(SAMPLE_CRITIC_OUTPUT, 'critic-legacy');
      expect(result.verdict).toBe('REJECT');
    });

    test('extracts critic findings from summary and justification', () => {
      const result = parseAgentOutput(SAMPLE_CRITIC_OUTPUT, 'critic-legacy');
      expect(result.majorFindings.length).toBeGreaterThanOrEqual(2);
    });

    test('extracts critic verdict from bare keyword', () => {
      const result = parseAgentOutput(SAMPLE_CRITIC_OUTPUT_BARE_VERDICT, 'critic-legacy');
      expect(result.verdict).toBe('REJECT');
    });

    test('critic format has no process compliance flags', () => {
      const result = parseAgentOutput(SAMPLE_CRITIC_OUTPUT, 'critic-legacy');
      expect(result.hasPreCommitment).toBe(false);
      expect(result.hasGapAnalysis).toBe(false);
      expect(result.hasMultiPerspective).toBe(false);
    });

    test('extracts critic findings from markdown heading summary format', () => {
      const output = `**[REJECT]**

## Summary
- Missing rollback strategy
- Rate limiting not defined`;
      const result = parseAgentOutput(output, 'critic-legacy');
      expect(result.majorFindings).toHaveLength(2);
    });
  });

  // The consolidated `critic` (upstream 8641e541, 2026-03-08) emits the
  // harsh-critic format. Parsing it with the legacy parser discarded every
  // critical finding, every gap, and all three process-compliance flags —
  // worth 40% of composite weight plus true-positive credit.
  describe('critic format (post-consolidation)', () => {
    test('parses the four-tier verdict, not just OKAY/REJECT', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'critic');
      expect(result.verdict).toBe('REJECT');
    });

    test('is parsed identically to harsh-critic', () => {
      expect(parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'critic')).toEqual(
        parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'harsh-critic'),
      );
    });

    test('retains severity buckets, gaps, and process-compliance flags', () => {
      const result = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'critic');
      expect(result.criticalFindings.length).toBeGreaterThan(0);
      expect(result.missingItems.length).toBeGreaterThan(0);
      expect(result.hasGapAnalysis).toBe(true);
      expect(result.hasPreCommitment).toBe(true);
      expect(result.hasMultiPerspective).toBe(true);
    });

    test('the legacy parser would have discarded all of it', () => {
      const legacy = parseAgentOutput(SAMPLE_HARSH_CRITIC_OUTPUT, 'critic-legacy');
      // Not even the verdict survives: the legacy matcher wants the keyword
      // bracketed directly by asterisks (`**[REJECT]**`), and modern output
      // writes `**VERDICT: REJECT**`.
      expect(legacy.verdict).toBe('');
      expect(legacy.criticalFindings).toHaveLength(0);
      expect(legacy.missingItems).toHaveLength(0);
      expect(legacy.hasGapAnalysis).toBe(false);
      expect(legacy.hasPreCommitment).toBe(false);
      expect(legacy.hasMultiPerspective).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('handles empty output gracefully', () => {
      const result = parseAgentOutput(SAMPLE_EMPTY_OUTPUT, 'harsh-critic');
      expect(result.verdict).toBe('');
      expect(result.criticalFindings).toHaveLength(0);
      expect(result.majorFindings).toHaveLength(0);
      expect(result.minorFindings).toHaveLength(0);
      expect(result.missingItems).toHaveLength(0);
    });
  });
});
