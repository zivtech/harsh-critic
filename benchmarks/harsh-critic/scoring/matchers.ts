/**
 * Flaw matchers: deciding whether an agent's review identifies a seeded flaw.
 *
 * LOCAL ADDITION (not upstream). Upstream had exactly one answer to that
 * question — substring keywords against a single finding — and
 * research/captured-output-audit.md section 8.2 shows it deciding a 10-point
 * suite delta on one word form. This module makes the decision procedure a
 * swappable, testable component so candidates can be judged against the hand
 * audit rather than against the delta they produce.
 *
 * Selection rule and predictions: research/matcher-selection-precommitment.md.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';

import type { GroundTruthFinding, Severity } from './types.js';
import { MIN_KEYWORD_MATCHES } from './types.js';

// ============================================================
// Shared shapes
// ============================================================

/** One agent finding, flattened out of the parsed output's sections. */
export interface FlatFinding {
  text: string;
  severity: Severity;
  hasEvidence: boolean;
}

/** Everything a matcher may know about the output it is judging. */
export interface MatchContext {
  fixtureId: string;
  /** Full raw output text. Only the cached grader needs it — as a cache key. */
  rawOutput: string;
}

export interface FlawMatch {
  matched: boolean;
  /**
   * Indices into the flattened finding list that carry this flaw, in order.
   * All of them, not just the first: severity accuracy walks these and takes
   * the first not already spent on another flaw, which is how the pre-existing
   * scorer behaved and must keep behaving.
   */
  findingIndices: number[];
}

export interface FlawMatcher {
  readonly name: string;
  matchFlaw(findings: FlatFinding[], gt: GroundTruthFinding, ctx: MatchContext): FlawMatch;
}

// ============================================================
// Keyword primitives (moved here from scorer.ts, behaviour unchanged)
// ============================================================

export function normalizeTextForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[`*_#()[\]{}<>"'.,;!?|\\]/g, ' ')
    .replace(/[-/:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function keywordMatchesText(text: string, keyword: string): boolean {
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

export function countKeywordMatches(text: string, keywords: string[]): number {
  return keywords.filter((kw) => keywordMatchesText(text, kw)).length;
}

export function requiredKeywordMatches(keywords: string[]): number {
  if (keywords.length === 0) return 0;

  // Scale with keyword set size to reduce accidental matches on larger sets:
  // 4/5 keywords -> 2 required, 6 keywords -> 3 required.
  const proportional = Math.ceil(keywords.length * 0.4);
  return Math.min(keywords.length, Math.max(MIN_KEYWORD_MATCHES, proportional));
}

// ============================================================
// Candidate 1: keyword (status quo)
// ============================================================

/**
 * A flaw is found if ONE finding contains enough of its keywords.
 *
 * This is the pre-existing behaviour, kept as the default so that swapping in
 * a candidate is an explicit act and every existing score stays reproducible.
 */
export const keywordMatcher: FlawMatcher = {
  name: 'keyword',
  matchFlaw(findings, gt) {
    const need = requiredKeywordMatches(gt.keywords);
    const findingIndices: number[] = [];
    for (let i = 0; i < findings.length; i++) {
      if (countKeywordMatches(findings[i].text, gt.keywords) >= need) {
        findingIndices.push(i);
      }
    }
    return { matched: findingIndices.length > 0, findingIndices };
  },
};

// ============================================================
// Candidate 2: accumulate
// ============================================================

/**
 * A flaw is found if the DISTINCT keywords it needs turn up anywhere across the
 * review, rather than all inside one finding.
 *
 * The case this exists for: on plan-api-redesign the baseline answers SF-3
 * across two findings — C1 carries "no alternative was evaluated", M2 carries
 * the unfounded payload goal — and per-finding matching scores that as a miss
 * (audit section 8.2).
 *
 * The risk it carries: a review with 25 findings offers 25 chances for each
 * keyword, so the bar is much lower than the same threshold looks. That is what
 * the cross-fixture negatives in the gold set are there to price.
 */
export const accumulateMatcher: FlawMatcher = {
  name: 'accumulate',
  matchFlaw(findings, gt) {
    const need = requiredKeywordMatches(gt.keywords);
    const hitKeywords = new Set<string>();
    const contributors: number[] = [];

    for (let i = 0; i < findings.length; i++) {
      let contributed = false;
      for (const kw of gt.keywords) {
        if (hitKeywords.has(kw)) continue;
        if (keywordMatchesText(findings[i].text, kw)) {
          hitKeywords.add(kw);
          contributed = true;
        }
      }
      if (contributed) contributors.push(i);
    }

    const matched = hitKeywords.size >= need;
    if (!matched) return { matched: false, findingIndices: [] };

    // Rank contributors by how much of the flaw each one carries, so severity
    // accuracy reads the finding that best represents the flaw rather than
    // whichever one happened to contribute a keyword first.
    const ranked = contributors
      .map((i) => ({ i, hits: countKeywordMatches(findings[i].text, gt.keywords) }))
      .sort((a, b) => b.hits - a.hits || a.i - b.i)
      .map((c) => c.i);

    return { matched: true, findingIndices: ranked };
  },
};

// ============================================================
// Candidate 3: graded (cached model judgments)
// ============================================================

/**
 * Bump when the grading prompt or its output contract changes. Cached verdicts
 * are keyed on it, so a bump invalidates every stored judgment rather than
 * silently mixing two rubrics in one score.
 */
export const GRADING_RUBRIC_VERSION = 'v1';

export interface GradedVerdict {
  flawId: string;
  /** Did the review identify this flaw? */
  found: boolean;
  /** Verbatim span from the review that shows it. Empty when found is false. */
  quote: string;
  reasoning: string;
}

export interface GradingCache {
  rubricVersion: string;
  model: string;
  entries: Record<string, GradedVerdict>;
}

/** Cache key for one (flaw text, review text) judgment. */
export function gradingCacheKey(gt: GroundTruthFinding, rawOutput: string): string {
  const flawFingerprint = createHash('sha256')
    .update(`${gt.id}\n${gt.summary}\n${gt.explanation}`, 'utf-8')
    .digest('hex');
  const outputFingerprint = createHash('sha256').update(rawOutput, 'utf-8').digest('hex');
  return `${GRADING_RUBRIC_VERSION}:${flawFingerprint.slice(0, 16)}:${outputFingerprint.slice(0, 16)}`;
}

export function loadGradingCache(path: string): GradingCache {
  if (!existsSync(path)) {
    return { rubricVersion: GRADING_RUBRIC_VERSION, model: 'unknown', entries: {} };
  }
  const cache = JSON.parse(readFileSync(path, 'utf-8')) as GradingCache;
  if (cache.rubricVersion !== GRADING_RUBRIC_VERSION) {
    throw new Error(
      `Grading cache at ${path} was written under rubric ${cache.rubricVersion}, ` +
        `but this build is ${GRADING_RUBRIC_VERSION}. Re-grade rather than mixing rubrics.`,
    );
  }
  return cache;
}

/**
 * A flaw is found if a model, shown the flaw and the review, says so and can
 * quote the review to prove it.
 *
 * Scoring stays offline: this reads cached verdicts and never calls anything.
 * A missing verdict is an error, not a silent `false` — an ungraded pair
 * scored as a miss would look exactly like a detection failure.
 */
export function makeGradedMatcher(cache: GradingCache): FlawMatcher {
  return {
    name: 'graded',
    matchFlaw(findings, gt, ctx) {
      const key = gradingCacheKey(gt, ctx.rawOutput);
      const verdict = cache.entries[key];
      if (!verdict) {
        throw new Error(
          `No cached grading for ${gt.id} on ${ctx.fixtureId} (key ${key}). ` +
            'Run: npx tsx benchmarks/harsh-critic/grade-outputs.ts <dir>',
        );
      }
      if (!verdict.found) return { matched: false, findingIndices: [] };

      // Attribute the verdict to the finding its quote came from, so severity
      // accuracy still has something to read. A quote that matches no finding
      // (the grader may quote a section this parser does not collect) still
      // counts as found — the flaw was identified either way.
      const needle = normalizeTextForMatch(verdict.quote).slice(0, 60);
      const findingIndices: number[] = [];
      if (needle.length >= 12) {
        for (let i = 0; i < findings.length; i++) {
          if (normalizeTextForMatch(findings[i].text).includes(needle)) {
            findingIndices.push(i);
          }
        }
      }
      return { matched: true, findingIndices };
    },
  };
}

export const MATCHER_NAMES = ['keyword', 'accumulate', 'graded'] as const;
export type MatcherName = (typeof MATCHER_NAMES)[number];
