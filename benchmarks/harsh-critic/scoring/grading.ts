/**
 * Pure helpers for the `graded` flaw matcher: filename parsing, the grading
 * prompt, response parsing, and the verbatim-quote evidence rule.
 *
 * No I/O and no process access here on purpose — everything that touches the
 * filesystem or a model lives in grade-outputs.ts, so these functions stay
 * directly testable and reusable from a script or from vitest alike.
 */

import type { GradedVerdict } from './matchers.js';
import { normalizeTextForMatch } from './matchers.js';
import type { GroundTruthFinding } from './types.js';

// ============================================================
// Capture filename parsing
// ============================================================

const KNOWN_AGENTS = new Set(['harsh-critic', 'critic', 'critic-legacy']);

/**
 * Parses a captured-output filename under either convention:
 *   <agent>__<fixtureId>__r<n>.md   (multi-sample runs, e.g. captures/2026-09-01_3x)
 *   <agent>__<fixtureId>.md         (single-sample runs, e.g. test fixtures)
 *
 * Returns null for anything else — a non-.md file, an unknown agent, or a
 * malformed repeat suffix — so callers can filter a directory listing with a
 * plain `.filter(Boolean)` and skip manifests/caches without special-casing
 * their names.
 */
export function parseCaptureFilename(
  name: string,
): { agent: string; fixtureId: string; repeat: number | null } | null {
  if (!name.endsWith('.md')) return null;
  const stem = name.slice(0, -'.md'.length);
  const parts = stem.split('__');

  if (parts.length === 2) {
    const [agent, fixtureId] = parts;
    if (!KNOWN_AGENTS.has(agent) || fixtureId.length === 0) return null;
    return { agent, fixtureId, repeat: null };
  }

  if (parts.length === 3) {
    const [agent, fixtureId, repeatPart] = parts;
    const match = repeatPart.match(/^r(\d+)$/);
    if (!KNOWN_AGENTS.has(agent) || fixtureId.length === 0 || !match) return null;
    return { agent, fixtureId, repeat: Number(match[1]) };
  }

  return null;
}

// ============================================================
// Grading prompt
//
// IMPORTANT: any change to this prompt's wording or its output contract
// requires bumping GRADING_RUBRIC_VERSION in matchers.ts. Cached verdicts are
// keyed on that version — an unversioned prompt edit would silently mix
// judgments from two different rubrics into one score.
// ============================================================

export const GRADER_SYSTEM_PROMPT =
  'You grade whether a written review of a plan identified one specific, ' +
  'known flaw in that plan. You answer with a single JSON object and nothing else.';

/**
 * Builds the grading user message for one (ground-truth finding, captured
 * output) pair.
 *
 * Deliberately does NOT include `gt.keywords` — the graded matcher exists to
 * judge whether the review identified the same underlying problem, not to
 * replicate keyword substring matching under a model. Showing the grader the
 * keyword set would collapse that distinction.
 */
export function buildGraderUserMessage(gt: GroundTruthFinding, rawOutput: string): string {
  const location = gt.location ?? '(not specified)';
  return `THE FLAW (seeded into the plan by its author):
ID: ${gt.id}
Summary: ${gt.summary}
Where in the plan: ${location}
Why it is a flaw: ${gt.explanation}

THE REVIEW:
<review>
${rawOutput}
</review>

Question: does the review identify THIS flaw — the same underlying problem, not merely the same topic or section?

Rules:
- "Identify" means the review names the problem and treats it as a problem. Mentioning the section without objecting to it does not count. A finding that would lead a reader to fix this flaw counts even if its wording differs from the summary.
- A review that criticises the same section for a DIFFERENT reason has not identified this flaw.
- Do not reward severity, length, or confidence. Judge only whether this flaw was found.
- If found, "quote" must be a verbatim, contiguous span copied exactly from the review, 20 to 300 characters, that shows the identification. Do not paraphrase, do not fix typos, do not join separate sentences.
- If not found, "quote" must be an empty string.

Respond with exactly one JSON object and nothing else:
{"found": true or false, "quote": "...", "reasoning": "one or two sentences"}`;
}

// ============================================================
// Response parsing
// ============================================================

/**
 * Scans for the first balanced `{...}` object, respecting string literals so
 * a brace inside a quoted value does not throw off the depth count. Returns
 * null if no balanced object is found.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export interface ParsedGraderResponse {
  found: boolean;
  quote: string;
  reasoning: string;
}

/**
 * Parses a grader response, tolerating a fenced ```json block or leading /
 * trailing prose around the object. Throws on anything that isn't a single
 * well-typed object — a malformed pair must surface as a failure, never as a
 * silent `found: false`.
 */
export function parseGraderResponse(text: string): ParsedGraderResponse {
  const jsonText = extractFirstJsonObject(text);
  if (jsonText === null) {
    throw new Error('parseGraderResponse: no JSON object found in grader response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`parseGraderResponse: could not parse JSON object: ${String(err)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('parseGraderResponse: parsed value is not an object');
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.found !== 'boolean') {
    throw new Error('parseGraderResponse: "found" is not a boolean');
  }
  if (typeof obj.quote !== 'string') {
    throw new Error('parseGraderResponse: "quote" is not a string');
  }
  if (typeof obj.reasoning !== 'string') {
    throw new Error('parseGraderResponse: "reasoning" is not a string');
  }

  return { found: obj.found, quote: obj.quote, reasoning: obj.reasoning };
}

// ============================================================
// Evidence rule
// ============================================================

/**
 * True iff the quote, normalized the same way findings are matched elsewhere
 * in this scorer, is long enough to be meaningful (>= 12 chars) and is
 * actually present in the review. This is the check that keeps a grader's
 * unverifiable claim from silently becoming a "found".
 */
export function quoteIsVerbatim(quote: string, rawOutput: string): boolean {
  const normalizedQuote = normalizeTextForMatch(quote);
  if (normalizedQuote.length < 12) return false;
  return normalizeTextForMatch(rawOutput).includes(normalizedQuote);
}

/**
 * Turns a parsed grader response into the cached verdict, enforcing the
 * evidence rule: a claimed "found" whose quote cannot be verified is
 * downgraded to not-found rather than trusted. The original claim is kept in
 * `reasoning` (prefixed) purely for audit — it must not count as a match.
 */
export function toVerdict(
  gtId: string,
  parsed: ParsedGraderResponse,
  rawOutput: string,
): GradedVerdict {
  if (!parsed.found) {
    return { flawId: gtId, found: false, quote: '', reasoning: parsed.reasoning };
  }

  if (!quoteIsVerbatim(parsed.quote, rawOutput)) {
    return {
      flawId: gtId,
      found: false,
      quote: '',
      reasoning:
        `[UNVERIFIED QUOTE] ${parsed.reasoning} | claimed: ${parsed.quote.slice(0, 200)}`,
    };
  }

  return { flawId: gtId, found: true, quote: parsed.quote, reasoning: parsed.reasoning };
}

/** True iff `verdict` was downgraded by the evidence rule in toVerdict(). */
export function isDowngraded(verdict: GradedVerdict): boolean {
  return verdict.reasoning.startsWith('[UNVERIFIED QUOTE]');
}
