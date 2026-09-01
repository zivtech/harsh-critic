/**
 * Parser for extracting structured data from agent review output.
 *
 * Supports two agent formats:
 * - harsh-critic: Structured sections with verdicts, severity-bucketed findings,
 *   "What's Missing", and multi-perspective notes.
 * - critic: Simpler OKAY/REJECT verdict with findings from summary/justification.
 */

import type {
  AgentType,
  ParsedAgentOutput,
  ParsedFinding,
  Severity,
} from './types.js';

// ============================================================
// Evidence detection
// ============================================================

/**
 * Matches evidence markers such as:
 * - backtick snippets: `code()`
 * - path/file refs: src/auth.ts:42, auth.ts:12:5
 * - function location refs: processPayment():47-52
 */
const EVIDENCE_PATTERN =
  /`[^`]+`|\b(?:[A-Za-z0-9_./-]+\.[A-Za-z0-9_+-]+|[A-Za-z_][A-Za-z0-9_]*\(\)):\d+(?:-\d+)?(?:[:]\d+)?\b/;

function hasEvidence(text: string): boolean {
  return EVIDENCE_PATTERN.test(text);
}

// ============================================================
// Shared utilities
// ============================================================

type PerspectiveKey = 'security' | 'newHire' | 'ops';

interface SectionBounds {
  start: number;
  end: number;
}

const NUMBERED_ITEM_PATTERN = /^([ \t]*)(?:\*{1,2}\s*)?\d+[.)](?:\*{1,2})?\s+(.+)$/;
const BULLET_ITEM_PATTERN = /^([ \t]*)[-*•]\s+(.+)$/;
const LIST_MARKER_PATTERN = /^(?:[-*•]|(?:\*{1,2}\s*)?\d+[.)](?:\*{1,2})?)\s+(.+)$/;

// Common subfields used inside a finding item; keep them attached to the parent item.
const SUBFIELD_PATTERN =
  /^(?:\*{1,2})?(?:evidence|why this matters|fix|impact|risk|mitigation|proof|location|example|note)\b/i;

function normalizeHeadingLine(line: string): string {
  let normalized = line.trim();
  normalized = normalized.replace(/^#{1,6}\s*/, '');
  normalized = normalized.replace(/^\*{1,2}\s*/, '');
  normalized = normalized.replace(/\s*\*{1,2}\s*:?\s*$/, '');
  normalized = normalized.replace(/[—–]/g, '-');
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim().toLowerCase();
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:---+|\*\*\*+)\s*$/.test(line);
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (isHorizontalRule(trimmed)) return true;
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;

  // Bold-numbered lines like "**1. Finding**" are list items, not headings.
  if (/^\*{1,2}\s*\d+[.)]\s+/.test(trimmed)) return false;

  if (/^\*{1,2}[^*\n]+?\*{1,2}(?:\s*\([^)\n]*\))?\s*:?\s*$/.test(trimmed)) {
    return true;
  }

  if (/^[A-Za-z][A-Za-z0-9'() \-/]{2,}:\s*$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * LOCAL FIX (upstream e9e8fa38): upstream tested section aliases against EVERY
 * line, so ordinary prose that merely named a section captured it. A live run
 * anchored `Critical Findings` to the sentence
 *
 *   **Mode**: Escalated to **ADVERSARIAL** after Phase 2 — multiple CRITICAL
 *   findings, 6+ MAJOR findings, and a systemic pattern ...
 *
 * which appears BEFORE the real `## Critical Findings` header. The section then
 * spanned a single prose line and every finding under the real header was lost.
 *
 * The trigger is our own prompt: the protocol requires the reviewer to state
 * whether it escalated to ADVERSARIAL mode and why, so a compliant review
 * reliably writes that sentence. A section alias must therefore only match a
 * line that is structurally a heading.
 */
/**
 * The LABEL of a heading-like line, or null if the line is ordinary prose.
 *
 *   `## Critical Findings (block execution)`      -> "Critical Findings (block execution)"
 *   `**Pre-commitment Predictions**: I predict…`  -> "Pre-commitment Predictions"
 *   `**Mode**: Escalated … CRITICAL findings …`   -> "Mode"
 *   `Critical Findings:`                          -> "Critical Findings"
 *   `- Evidence: the plan says …`                 -> null
 */
function headingLabel(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || isHorizontalRule(trimmed)) return null;

  const hashes = /^#{1,6}\s+(\S.*)$/.exec(trimmed);
  if (hashes) return hashes[1].trim();

  // Bold-numbered lines like "**1. Finding**" are list items, not headings.
  if (/^\*{1,2}\s*\d+[.)]\s+/.test(trimmed)) return null;

  // A bold label, whether alone on the line or followed by inline content.
  const bold = /^\*{1,2}([^*\n]+?)\*{1,2}(\s*\([^)\n]*\))?\s*:?/.exec(trimmed);
  if (bold) return (bold[1] + (bold[2] ?? '')).trim();

  const plain = /^([A-Za-z][A-Za-z0-9'() \-/]{2,}):\s*$/.exec(trimmed);
  if (plain) return plain[1].trim();

  return null;
}

/**
 * LOCAL FIX (upstream e9e8fa38): upstream tested section aliases against the
 * WHOLE of every line, so ordinary prose naming a section captured it. A live
 * run anchored `Critical Findings` to
 *
 *   **Mode**: Escalated to **ADVERSARIAL** after Phase 2 — multiple CRITICAL
 *   findings, 6+ MAJOR findings, and a systemic pattern …
 *
 * which precedes the real `## Critical Findings` header, so the section spanned
 * one prose line and every finding beneath the real header was lost.
 *
 * The trigger is our own prompt: the protocol requires the reviewer to report
 * whether it escalated to ADVERSARIAL mode and why, so a compliant review
 * reliably writes that sentence. Matching the heading LABEL rather than the
 * whole line keeps `**Mode**: …` out (label "Mode") while still accepting
 * `**Pre-commitment Predictions**: …`, which the output contract specifies.
 */
function lineMatchesAnyHeadingAlias(line: string, aliases: RegExp[]): boolean {
  const label = headingLabel(line);
  if (label === null) return false;
  const normalized = normalizeHeadingLine(label);
  return aliases.some((alias) => alias.test(normalized));
}

function findSectionHeadingIndex(lines: string[], aliases: RegExp[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lineMatchesAnyHeadingAlias(lines[i], aliases)) return i;
  }
  return -1;
}

/**
 * Structural depth of a heading. Markdown `#` headings use their own level;
 * a bold-only line is treated as the deepest level, because models use bold
 * lines both as top-level section headers AND as per-finding sub-headers.
 */
function headingLevel(line: string): number {
  const trimmed = line.trim();
  const hashes = /^(#{1,6})\s+\S/.exec(trimmed);
  if (hashes) return hashes[1].length;
  return BOLD_HEADING_LEVEL;
}

const BOLD_HEADING_LEVEL = 7;

/**
 * LOCAL FIX (upstream e9e8fa38): upstream ended a section at the FIRST
 * subsequent heading of any kind. Current models write findings as bold
 * sub-headings (`**C1 — title**`) underneath a markdown section header
 * (`## Critical Findings`), and those sub-headings match the bold-heading
 * pattern — so the section collapsed to zero lines and every CRITICAL and
 * MAJOR finding was silently dropped. A live run produced `REJECT` verdicts
 * with 0 critical and 0 major findings parsed, scoring both arms at the floor.
 *
 * A section now ends only at a heading at or above its own level, so bold
 * sub-headings stay inside their parent section. Sections that are themselves
 * bold headings still end at the next bold heading, preserving prior behaviour.
 */
function findSectionBounds(lines: string[], aliases: RegExp[]): SectionBounds | null {
  const headingIndex = findSectionHeadingIndex(lines, aliases);
  if (headingIndex === -1) return null;

  const sectionLevel = headingLevel(lines[headingIndex]);
  const start = headingIndex + 1;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (isHorizontalRule(line.trim())) {
      end = i;
      break;
    }
    if (!isHeadingLine(line) && !isKnownSectionHeading(line)) continue;

    // A markdown heading at or above this section's level ends it.
    if (/^\s*#{1,6}\s+\S/.test(line) && headingLevel(line) <= sectionLevel) {
      end = i;
      break;
    }

    // Otherwise only a heading naming a DIFFERENT known section ends it.
    //
    // LOCAL FIX (upstream e9e8fa38, second pass): bold section headers and bold
    // per-finding sub-headers are indistinguishable by depth — both are
    // `**…**`. Ending the section at any same-depth heading therefore truncated
    // `**Critical Findings** (block execution):` at its own first finding,
    // `**C1 — …**`. In the live run the two arms happened to choose different
    // markdown styles — `##` headers vs `**bold**` headers — so only the bold
    // arm was truncated, manufacturing a 29.7-point delta out of formatting.
    // Sections are delimited by known section NAMES; anything else bold is
    // internal structure.
    if (isKnownSectionHeading(line)) {
      end = i;
      break;
    }
  }

  return { start, end };
}

/** True when a line's heading label names one of the known output sections. */
function isKnownSectionHeading(line: string): boolean {
  const label = headingLabel(line);
  if (label === null) return false;
  const normalized = normalizeHeadingLine(label);
  return ALL_SECTION_ALIASES.some((alias) => alias.test(normalized));
}

function hasSection(lines: string[], aliases: RegExp[]): boolean {
  return findSectionHeadingIndex(lines, aliases) !== -1;
}

/** A bold-only line used as a per-finding sub-heading, e.g. `**C1 — title**`. */
function boldSubHeadingText(line: string): string | null {
  const trimmed = line.trim();
  if (!isHeadingLine(trimmed)) return null;
  if (/^#{1,6}\s+\S/.test(trimmed)) return null;
  if (isHorizontalRule(trimmed)) return null;
  const stripped = trimmed.replace(/\*/g, '').replace(/:\s*$/, '').trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * A finding written as `**M1 — title.** body prose on the same line`.
 *
 * This shape matches no list marker and is not a bold-only heading, so before
 * this was handled the whole line fell through to the continuation branch and,
 * with no item open, was dropped outright. Three of the ten captured live-run
 * outputs write every MAJOR finding this way; upstream's idealised fixtures
 * always broke the line after the title, which is why the defect survived.
 *
 * Only recognised at a paragraph boundary, so a bold run mid-paragraph (e.g.
 * `**Black-swan risk:**` inside a finding's prose) cannot split its parent.
 */
const BOLD_LEAD_IN_PATTERN = /^\*\*[^*\n]+?\*\*[^\S\n]*(?=\S)/;

function boldLeadInText(line: string): string | null {
  const trimmed = line.trim();
  if (!BOLD_LEAD_IN_PATTERN.test(trimmed)) return null;
  if (isHorizontalRule(trimmed)) return null;
  const stripped = trimmed.replace(/\*/g, '').trim();
  return stripped.length > 0 ? stripped : null;
}

function extractListItemsFromSection(sectionLines: string[]): string[] {
  const items: string[] = [];
  let current = '';
  let currentKind: 'numbered' | 'bullet' | 'heading' | null = null;
  // The start of a section counts as a paragraph boundary.
  let atParagraphStart = true;

  const flush = () => {
    const item = current.trim();
    if (item && !/^none\.?$/i.test(item)) {
      items.push(item);
    }
    current = '';
    currentKind = null;
  };

  for (const rawLine of sectionLines) {
    const line = rawLine.replace(/\r/g, '');
    const trimmed = line.trim();

    if (!trimmed || isHorizontalRule(trimmed)) {
      atParagraphStart = true;
      // A finding introduced by a bold sub-heading keeps accumulating across
      // blank lines: its evidence, impact and fix bullets belong to it, and
      // splitting them apart scatters the keywords a match depends on.
      if (currentKind === 'heading' && !isHorizontalRule(trimmed)) continue;
      flush();
      continue;
    }

    const wasAtParagraphStart = atParagraphStart;
    atParagraphStart = false;

    // A bold sub-heading inside a section starts a new finding.
    const subHeading = boldSubHeadingText(line);
    if (subHeading) {
      flush();
      current = subHeading;
      currentKind = 'heading';
      continue;
    }

    // Same, but with the finding's prose running on from the bold title.
    if (wasAtParagraphStart) {
      const leadIn = boldLeadInText(line);
      if (leadIn) {
        flush();
        current = leadIn;
        currentKind = 'heading';
        continue;
      }
    }

    const numbered = NUMBERED_ITEM_PATTERN.exec(line);
    if (numbered) {
      flush();
      current = numbered[2].trim();
      currentKind = 'numbered';
      continue;
    }

    const bullet = BULLET_ITEM_PATTERN.exec(line);
    if (bullet) {
      const indent = bullet[1].replace(/\t/g, '  ').length;
      const text = bullet[2].trim();
      if (!text) continue;

      // Many model outputs use unindented "-" sub-bullets after numbered headings
      // (Evidence/Why/Fix). Keep those attached to the parent finding.
      const appendToCurrent =
        current.length > 0 &&
        (indent >= 2 ||
          currentKind === 'numbered' ||
          currentKind === 'heading' ||
          SUBFIELD_PATTERN.test(text));

      if (appendToCurrent) {
        current += ' ' + text;
      } else {
        flush();
        current = text;
        currentKind = 'bullet';
      }
      continue;
    }

    // Plain continuation prose inside the active item.
    if (current.length > 0) {
      current += ' ' + trimmed;
    }
  }

  flush();
  return items;
}

function extractSectionItems(lines: string[], aliases: RegExp[]): string[] {
  const bounds = findSectionBounds(lines, aliases);
  if (!bounds) return [];
  return extractListItemsFromSection(lines.slice(bounds.start, bounds.end));
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item.trim());
  }
  return deduped;
}

function detectPerspectiveHeading(line: string): PerspectiveKey | null {
  const normalized = normalizeHeadingLine(line);

  if (
    /\bsecurity\b(?:\s+engineer)?(?:\s+perspective)?\b/.test(normalized) ||
    normalized === 'security'
  ) {
    return 'security';
  }
  if (
    /\bnew[- ]?hire\b(?:\s+perspective)?\b/.test(normalized) ||
    normalized === 'new-hire' ||
    normalized === 'new hire'
  ) {
    return 'newHire';
  }
  if (
    /\bops\b(?:\s+engineer)?(?:\s+perspective)?\b/.test(normalized) ||
    normalized === 'ops'
  ) {
    return 'ops';
  }

  return null;
}

function parsePerspectiveNotes(
  lines: string[],
  multiPerspectiveHeadingIndex: number,
): { security: string[]; newHire: string[]; ops: string[] } {
  const notes = {
    security: [] as string[],
    newHire: [] as string[],
    ops: [] as string[],
  };

  const scopedLines =
    multiPerspectiveHeadingIndex >= 0
      ? lines.slice(multiPerspectiveHeadingIndex + 1)
      : lines;

  const pushNote = (key: PerspectiveKey, value: string) => {
    const text = value.trim();
    if (!text || /^none\.?$/i.test(text)) return;
    notes[key].push(text);
  };

  // Pass 1: inline labels like "- Security: ..."
  for (const line of scopedLines) {
    const bullet = BULLET_ITEM_PATTERN.exec(line);
    if (!bullet) continue;
    const inline = /^(Security|New-?hire|Ops)\s*:\s*(.+)$/i.exec(bullet[2].trim());
    if (!inline) continue;

    const label = inline[1].toLowerCase();
    const content = inline[2].trim();
    if (label === 'security') pushNote('security', content);
    else if (label.startsWith('new')) pushNote('newHire', content);
    else pushNote('ops', content);
  }

  // Pass 2: subsection headings like "### Security Engineer Perspective"
  let currentPerspective: PerspectiveKey | null = null;
  let currentItem = '';
  const flushCurrent = () => {
    if (currentPerspective && currentItem.trim()) {
      pushNote(currentPerspective, currentItem.trim());
    }
    currentItem = '';
  };

  for (const line of scopedLines) {
    const trimmed = line.trim();

    if (!trimmed || isHorizontalRule(trimmed)) {
      flushCurrent();
      continue;
    }

    if (isHeadingLine(line)) {
      const headingPerspective = detectPerspectiveHeading(line);
      if (headingPerspective) {
        flushCurrent();
        currentPerspective = headingPerspective;
        continue;
      }
      flushCurrent();
      currentPerspective = null;
      continue;
    }

    if (!currentPerspective) continue;

    const listContent = LIST_MARKER_PATTERN.exec(trimmed);
    if (listContent) {
      flushCurrent();
      currentItem = listContent[1].trim();
      continue;
    }

    currentItem = currentItem ? `${currentItem} ${trimmed}` : trimmed;
  }

  flushCurrent();

  return {
    security: dedupeStrings(notes.security),
    newHire: dedupeStrings(notes.newHire),
    ops: dedupeStrings(notes.ops),
  };
}

/**
 * Build a ParsedFinding from raw item text and severity.
 */
function toFinding(text: string, severity: Severity): ParsedFinding {
  return { text, severity, hasEvidence: hasEvidence(text) };
}

// ============================================================
// Harsh-critic parser
// ============================================================

const PRECOMMIT_ALIASES = [/\bpre-?commitment\s+predictions?\b/];
const CRITICAL_ALIASES = [/\bcritical\s+findings?\b/];
const MAJOR_ALIASES = [/\bmajor\s+findings?\b/];
const MINOR_ALIASES = [/\bminor\s+findings?\b/];
const MISSING_ALIASES = [/\bwhat'?s?\s+missing\b/];
const MULTI_PERSPECTIVE_ALIASES = [
  /\bmulti-?perspective\b.*\b(?:notes?|review)\b/,
  /\bphase\s*\d+\b.*\bmulti-?perspective\b/,
];
const SUMMARY_ALIASES = [/\bsummary\b/];
const JUSTIFICATION_ALIASES = [/\bjustification\b/];

/**
 * Every heading that delimits a section of the review contract. Used to end a
 * section at the next real section rather than at its own first finding.
 */
const ALL_SECTION_ALIASES: RegExp[] = [
  ...PRECOMMIT_ALIASES,
  ...CRITICAL_ALIASES,
  ...MAJOR_ALIASES,
  ...MINOR_ALIASES,
  ...MISSING_ALIASES,
  ...MULTI_PERSPECTIVE_ALIASES,
  // NOT SUMMARY_ALIASES / JUSTIFICATION_ALIASES. Those are bare /\bsummary\b/
  // and /\bjustification\b/, which the legacy critic parser uses to FIND a
  // section. As DELIMITERS they are far too loose: the finding title
  // `**C1 — The core justification is unproven …**` matches /\bjustification\b/
  // and truncated its own Critical Findings section to zero entries. A
  // delimiter must name the section, not merely contain one of its words.
  /\bverdict\s+justification\b/,
  /\bverdict\b/,
  /\boverall\s+assessment\b/,
  /\bambiguity\s+risks?\b/,
  /\bopen\s+questions?\b/,
  /\bmurder[\s-]?board\b/,
  /\bralplan\b/,
  /\bcompeting\s+alternatives?\b/,
  /\bbackcasting\b/,
  /\bself[\s-]?audit\b/,
  /\brealist\s+check\b/,
];

function parseVerdict(text: string): string {
  // Match: **VERDICT: REJECT** or **VERDICT: ACCEPT-WITH-RESERVATIONS**
  const m = /\*{1,2}VERDICT\s*:\s*([A-Z][A-Z\s-]*?)\*{1,2}/i.exec(text);
  if (m) return m[1].trim();

  // Fallback: look for bare verdict-like keyword
  const bare = /\bVERDICT\s*:\s*([A-Z][A-Z\s-]+)/i.exec(text);
  if (bare) return bare[1].trim();

  return '';
}

function parseFindingsSection(lines: string[], aliases: RegExp[], severity: Severity): ParsedFinding[] {
  return extractSectionItems(lines, aliases).map((item) => toFinding(item, severity));
}

function parseHarshCritic(rawOutput: string): ParsedAgentOutput {
  const lines = rawOutput.split(/\r?\n/);

  // Verdict
  const verdict = parseVerdict(rawOutput);

  // Pre-commitment predictions
  const hasPreCommitment = hasSection(lines, PRECOMMIT_ALIASES);

  // Findings sections
  const criticalFindings = parseFindingsSection(lines, CRITICAL_ALIASES, 'CRITICAL');
  const majorFindings = parseFindingsSection(lines, MAJOR_ALIASES, 'MAJOR');
  const minorFindings = parseFindingsSection(lines, MINOR_ALIASES, 'MINOR');

  // What's Missing
  const missingItems = extractSectionItems(lines, MISSING_ALIASES);
  const hasGapAnalysis = hasSection(lines, MISSING_ALIASES);

  // Multi-Perspective Notes/Review
  const multiPerspectiveHeadingIndex = findSectionHeadingIndex(
    lines,
    MULTI_PERSPECTIVE_ALIASES,
  );
  const perspectiveNotes = parsePerspectiveNotes(lines, multiPerspectiveHeadingIndex);
  const hasMultiPerspective =
    multiPerspectiveHeadingIndex !== -1 ||
    perspectiveNotes.security.length > 0 ||
    perspectiveNotes.newHire.length > 0 ||
    perspectiveNotes.ops.length > 0;

  return {
    verdict,
    criticalFindings,
    majorFindings,
    minorFindings,
    missingItems,
    perspectiveNotes,
    hasPreCommitment,
    hasGapAnalysis,
    hasMultiPerspective,
    rawOutput,
  };
}

// ============================================================
// Critic parser
// ============================================================

function parseCriticVerdict(text: string): string {
  // Match: **OKAY** / **REJECT** / **[OKAY]** / **[REJECT]**
  const m =
    /\*{1,2}\[?\s*(OKAY|REJECT)\s*\]?\*{1,2}/i.exec(text);
  if (m) return m[1].toUpperCase();

  // Fallback: bare keyword at line start
  const bare = /^\s*\[?\s*(OKAY|REJECT)\s*\]?\s*$/im.exec(text);
  if (bare) return bare[1].toUpperCase();

  return '';
}

/**
 * Extract findings from critic's Summary / Justification paragraphs.
 * Each numbered list item or dash-bullet becomes a MAJOR finding (default severity).
 */
function parseCriticFindings(text: string): ParsedFinding[] {
  const lines = text.split(/\r?\n/);
  const summaryItems = extractSectionItems(lines, SUMMARY_ALIASES);
  const justificationItems = extractSectionItems(lines, JUSTIFICATION_ALIASES);
  const merged = dedupeStrings([...summaryItems, ...justificationItems]);
  return merged.map((item) => toFinding(item, 'MAJOR'));
}

function parseCritic(rawOutput: string): ParsedAgentOutput {
  const verdict = parseCriticVerdict(rawOutput);

  // Critic has no severity-bucketed sections; put extracted findings in majorFindings
  const majorFindings = parseCriticFindings(rawOutput);

  return {
    verdict,
    criticalFindings: [],
    majorFindings,
    minorFindings: [],
    missingItems: [],
    perspectiveNotes: { security: [], newHire: [], ops: [] },
    hasPreCommitment: false,
    hasGapAnalysis: false,
    hasMultiPerspective: false,
    rawOutput,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Parse raw markdown output from a review agent into a structured representation.
 *
 * @param rawOutput - The full markdown text produced by the agent.
 * @param agentType - Which agent produced the output.
 * @returns Structured ParsedAgentOutput.
 *
 * LOCAL FIX (upstream e9e8fa38): upstream sent every non-'harsh-critic' type to
 * parseCritic(), the legacy OKAY/REJECT parser. That parser hardcodes empty
 * criticalFindings, missingItems, and perspectiveNotes and sets all three
 * process-compliance flags false, so a current `critic` review — same format as
 * harsh-critic since upstream 8641e541 — lost the 40% of composite weight
 * carried by missingCoverage, perspectiveCoverage, and processCompliance, plus
 * true-positive credit for every critical finding and gap. Measured on one
 * identical review: 0.857 parsed as 'harsh-critic' versus 0.100 as 'critic'.
 * Only 'critic-legacy' takes the legacy parser now.
 */
export function parseAgentOutput(
  rawOutput: string,
  agentType: AgentType,
): ParsedAgentOutput {
  if (agentType === 'critic-legacy') {
    return parseCritic(rawOutput);
  }
  return parseHarshCritic(rawOutput);
}
