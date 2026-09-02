/**
 * Model-graded flaw matcher: grades whether captured agent outputs identify
 * seeded ground-truth flaws, and caches the verdicts so scoring stays
 * offline afterward.
 *
 * Usage:
 *   npx tsx benchmarks/harsh-critic/grade-outputs.ts <dir> [options]
 *   ANTHROPIC_API_KEY=sk-... npx tsx benchmarks/harsh-critic/grade-outputs.ts <dir> --runner api
 *
 * Positional:
 *   <dir>                    Directory of captured outputs to grade. Two
 *                            filename conventions are recognised:
 *                              <agent>__<fixture>__r<n>.md  (multi-sample runs,
 *                                e.g. benchmarks/harsh-critic/captures/2026-09-01_3x)
 *                              <agent>__<fixture>.md        (single-sample runs,
 *                                e.g. scoring/__tests__/fixtures)
 *                            agent is one of harsh-critic, critic, critic-legacy.
 *                            Non-matching files (run-manifest.json, MANIFEST.json,
 *                            grading-cache.json, ...) are ignored.
 *
 * Options:
 *   --cache <path>           Grading cache file (default: <dir>/grading-cache.json)
 *   --model <model>          Claude model to use (default: claude-opus-4-8)
 *   --runner claude-cli|api  claude-cli (default) shells out to `claude -p`,
 *                            running on the signed-in Claude subscription — no
 *                            API key needed. api calls the Anthropic API
 *                            directly and requires ANTHROPIC_API_KEY.
 *   --concurrency <n>        Pairs graded in parallel (default: 2)
 *   --cross-fixture          Also pair each output against every OTHER
 *                            fixture's seeded flaws — the cross-fixture
 *                            negative set from
 *                            research/matcher-selection-precommitment.md §3.
 *                            A "found" verdict there is a false alarm by
 *                            construction. Off by default.
 *   --dry-run                List the pairs and which are already cached.
 *                            No model calls.
 *
 * The `graded` flaw matcher (scoring/matchers.ts) reads this cache offline and
 * throws if a pair it needs has no cached verdict — this script is what fills
 * the cache.
 */

import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { GroundTruth } from './scoring/types.ts';
import { GRADING_RUBRIC_VERSION, gradingCacheKey, loadGradingCache } from './scoring/matchers.ts';
import type { GradingCache } from './scoring/matchers.ts';
import {
  buildGraderUserMessage,
  GRADER_SYSTEM_PROMPT,
  isDowngraded,
  parseCaptureFilename,
  parseGraderResponse,
  quoteIsVerbatim,
  toVerdict,
} from './scoring/grading.ts';
import type { ParsedGraderResponse } from './scoring/grading.ts';
import { callClaude, callClaudeCliWithRetry, isRunner, runPool } from './runners.ts';
import type { Runner } from './runners.ts';

// ============================================================
// Directory resolution
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCHMARK_DIR = __dirname;

// ============================================================
// CLI argument parsing
// ============================================================

interface CliArgs {
  dir: string;
  cache: string;
  model: string;
  runner: Runner;
  concurrency: number;
  crossFixture: boolean;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let dir: string | null = null;
  let cache: string | null = null;
  let model = 'claude-opus-4-8';
  let runner: Runner = 'claude-cli';
  let concurrency = 2;
  let crossFixture = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--cache':
        cache = argv[++i];
        break;
      case '--model':
        model = argv[++i];
        break;
      case '--runner': {
        const val = argv[++i];
        if (!isRunner(val)) {
          console.error(`Error: --runner must be api or claude-cli (got "${val}")`);
          process.exit(1);
        }
        runner = val;
        break;
      }
      case '--concurrency': {
        const val = Number(argv[++i]);
        if (!Number.isInteger(val) || val < 1) {
          console.error(`Error: --concurrency must be a positive integer (got "${val}")`);
          process.exit(1);
        }
        concurrency = val;
        break;
      }
      case '--cross-fixture':
        crossFixture = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown argument: ${arg}`);
          process.exit(1);
        }
        if (dir !== null) {
          console.error(`Unexpected extra positional argument: "${arg}"`);
          process.exit(1);
        }
        dir = arg;
    }
  }

  if (dir === null || dir.length === 0) {
    console.error(
      'Error: <dir> is required.\n' +
        'Usage: npx tsx benchmarks/harsh-critic/grade-outputs.ts <dir> [options]',
    );
    process.exit(1);
  }

  return {
    dir,
    cache: cache ?? join(dir, 'grading-cache.json'),
    model,
    runner,
    concurrency,
    crossFixture,
    dryRun,
  };
}

// ============================================================
// Ground truth loading
// ============================================================

function loadAllGroundTruth(): Map<string, GroundTruth> {
  const gtDir = join(BENCHMARK_DIR, 'ground-truth');
  const map = new Map<string, GroundTruth>();
  if (!existsSync(gtDir)) return map;

  for (const file of readdirSync(gtDir)) {
    if (!file.endsWith('.json')) continue;
    const fixtureId = file.replace(/\.json$/, '');
    try {
      const gt = JSON.parse(readFileSync(join(gtDir, file), 'utf-8')) as GroundTruth;
      map.set(fixtureId, gt);
    } catch (err) {
      console.error(`Error: failed to parse ground truth "${file}": ${err}`);
      process.exit(1);
    }
  }
  return map;
}

// ============================================================
// Capture discovery
// ============================================================

interface CaptureFile {
  fileName: string;
  displayName: string;
  agent: string;
  fixtureId: string;
  repeat: number | null;
  rawOutput: string;
}

function discoverCaptures(dir: string): CaptureFile[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (err) {
    console.error(`Error: could not read directory "${dir}": ${err}`);
    process.exit(1);
  }

  const captures: CaptureFile[] = [];
  for (const fileName of files) {
    const parsed = parseCaptureFilename(fileName);
    if (parsed === null) continue; // manifest/cache/non-matching file — ignore
    const rawOutput = readFileSync(join(dir, fileName), 'utf-8');
    captures.push({
      fileName,
      displayName: fileName.replace(/\.md$/, ''),
      ...parsed,
      rawOutput,
    });
  }

  if (captures.length === 0) {
    console.error(
      `Error: no capture files found in "${dir}" ` +
        '(expected <agent>__<fixture>.md or <agent>__<fixture>__r<n>.md)',
    );
    process.exit(1);
  }

  return captures;
}

// ============================================================
// Pair construction
// ============================================================

interface Pair {
  capture: CaptureFile;
  gtFixtureId: string;
  finding: GroundTruth['findings'][number];
  crossFixture: boolean;
  cacheKey: string;
}

function buildPairs(
  captures: CaptureFile[],
  allGroundTruth: Map<string, GroundTruth>,
  crossFixture: boolean,
): Pair[] {
  const pairs: Pair[] = [];
  const warnedMissing = new Set<string>();

  for (const capture of captures) {
    const ownGt = allGroundTruth.get(capture.fixtureId);
    if (!ownGt) {
      if (!warnedMissing.has(capture.fixtureId)) {
        console.warn(
          `Warning: no ground truth for fixture "${capture.fixtureId}" — skipping ${capture.fileName}`,
        );
        warnedMissing.add(capture.fixtureId);
      }
      continue;
    }

    // A ground truth with zero findings (the clean baseline) contributes no
    // pairs — the loops below are simply empty for it.
    for (const finding of ownGt.findings) {
      pairs.push({
        capture,
        gtFixtureId: ownGt.fixtureId,
        finding,
        crossFixture: false,
        cacheKey: gradingCacheKey(finding, capture.rawOutput),
      });
    }

    if (crossFixture) {
      for (const [otherFixtureId, otherGt] of allGroundTruth) {
        if (otherFixtureId === capture.fixtureId) continue;
        for (const finding of otherGt.findings) {
          pairs.push({
            capture,
            gtFixtureId: otherFixtureId,
            finding,
            crossFixture: true,
            cacheKey: gradingCacheKey(finding, capture.rawOutput),
          });
        }
      }
    }
  }

  return pairs;
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = parseArgs();

  // Only the opt-in `api` runner needs a key; claude-cli runs on the
  // signed-in subscription. Same early check as run-benchmark.ts.
  if (args.runner === 'api' && !args.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: --runner api requires ANTHROPIC_API_KEY, which is not set.\n' +
        '  Drop the flag to use the default subscription runner instead.\n' +
        'Set it before running:\n' +
        '  ANTHROPIC_API_KEY=sk-... npx tsx benchmarks/harsh-critic/grade-outputs.ts <dir> --runner api',
    );
    process.exit(1);
  }

  const captures = discoverCaptures(args.dir);
  console.log(`Discovered ${captures.length} capture file(s) in ${args.dir}`);

  const allGroundTruth = loadAllGroundTruth();
  const pairs = buildPairs(captures, allGroundTruth, args.crossFixture);

  const cache: GradingCache = loadGradingCache(args.cache);
  if (cache.model !== 'unknown' && cache.model !== args.model) {
    console.error(
      `Error: cache at "${args.cache}" was graded with model "${cache.model}", ` +
        `but --model is "${args.model}". Pass a different --cache path rather ` +
        'than mixing graders.',
    );
    process.exit(1);
  }

  const cachedPairs = pairs.filter((p) => cache.entries[p.cacheKey] !== undefined);
  const toGradePairs = pairs.filter((p) => cache.entries[p.cacheKey] === undefined);

  if (args.dryRun) {
    console.log(
      `\nPairs: ${pairs.length} total (${cachedPairs.length} cached, ${toGradePairs.length} to grade)\n`,
    );
    for (const p of pairs) {
      const cached = cache.entries[p.cacheKey] !== undefined;
      const tag = p.crossFixture ? ' [cross-fixture]' : '';
      console.log(
        `  ${cached ? 'cached  ' : 'to-grade'}  ${p.finding.id} on ${p.capture.displayName} ` +
          `(gt=${p.gtFixtureId})${tag}`,
      );
    }
    console.log('\nDry run complete. No model calls made.');
    return;
  }

  cache.model = args.model;
  cache.rubricVersion = GRADING_RUBRIC_VERSION;

  function saveCache(): void {
    writeFileSync(args.cache, JSON.stringify(cache, null, 2), 'utf-8');
  }

  const client = args.runner === 'api' ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

  async function callRunner(systemPrompt: string, userMessage: string): Promise<string> {
    if (args.runner === 'claude-cli') {
      const result = await callClaudeCliWithRetry(systemPrompt, userMessage, args.model);
      return result.text;
    }
    return callClaude(client as Anthropic, systemPrompt, userMessage, args.model);
  }

  console.log(
    `\nGrading ${toGradePairs.length} pair(s) (${cachedPairs.length} already cached), ` +
      `runner=${args.runner}, model=${args.model}, concurrency=${args.concurrency}...\n`,
  );

  interface Failure {
    pair: Pair;
    error: string;
  }
  const failures: Failure[] = [];
  let completed = 0;

  /**
   * One call, parsed. A malformed reply (prose instead of the JSON object) is
   * model noise, not evidence about the pair, so it gets exactly one more
   * attempt before the pair is recorded as failed.
   */
  async function askGrader(message: string): Promise<ParsedGraderResponse> {
    const first = await callRunner(GRADER_SYSTEM_PROMPT, message);
    try {
      return parseGraderResponse(first);
    } catch {
      const second = await callRunner(GRADER_SYSTEM_PROMPT, message);
      return parseGraderResponse(second);
    }
  }

  async function gradePair(pair: Pair): Promise<void> {
    const userMessage = buildGraderUserMessage(pair.finding, pair.capture.rawOutput);
    const startMs = Date.now();

    try {
      let parsed = await askGrader(userMessage);

      // Evidence retry: a claimed "found" whose quote cannot be verified gets
      // one more chance to either quote correctly or recant. If it still
      // cannot, toVerdict() downgrades it — the claim never counts as a match.
      if (parsed.found && !quoteIsVerbatim(parsed.quote, pair.capture.rawOutput)) {
        const retryMessage =
          `${userMessage}\n` +
          'Your previous quote was not a verbatim span of the review. ' +
          'Copy the exact characters, or answer found=false.';
        parsed = await askGrader(retryMessage);
      }

      const verdict = toVerdict(pair.finding.id, parsed, pair.capture.rawOutput);
      cache.entries[pair.cacheKey] = verdict;
      saveCache();

      completed++;
      const elapsedS = ((Date.now() - startMs) / 1000).toFixed(1);
      const status = verdict.found
        ? 'found'
        : isDowngraded(verdict)
          ? 'not found (unverified quote)'
          : 'not found';
      console.log(
        `  [${completed}/${toGradePairs.length}] ${pair.finding.id} on ${pair.capture.displayName} → ${status} (${elapsedS}s)`,
      );
    } catch (err) {
      completed++;
      console.log(
        `  [${completed}/${toGradePairs.length}] FAILED ${pair.finding.id} on ` +
          `${pair.capture.displayName}: ${String(err).slice(0, 160)}`,
      );
      // Deliberately not written to the cache — a failure must not be
      // indistinguishable from a graded "not found".
      failures.push({ pair, error: String(err) });
    }
  }

  await runPool(toGradePairs, args.concurrency, gradePair);

  // ============================================================
  // Summary
  // ============================================================

  let totalFound = 0;
  let totalNotFound = 0;
  let totalDowngraded = 0;
  for (const p of pairs) {
    const v = cache.entries[p.cacheKey];
    if (!v) continue; // failed this run — excluded, not zeroed
    if (v.found) totalFound++;
    else totalNotFound++;
    if (isDowngraded(v)) totalDowngraded++;
  }

  console.log('\n=== Grading summary ===');
  console.log(`  Pairs:      ${pairs.length}`);
  console.log(`  Cached:     ${cachedPairs.length}`);
  console.log(`  Graded now: ${toGradePairs.length}`);
  console.log(`  Found:      ${totalFound}`);
  console.log(`  Not found:  ${totalNotFound}`);
  console.log(`  Downgraded (unverified quote): ${totalDowngraded}`);
  console.log(`  Failed:     ${failures.length}`);

  console.log('\n=== Per-output findings (same-fixture) ===');
  for (const capture of captures) {
    const foundIds = pairs
      .filter((p) => p.capture === capture && !p.crossFixture && cache.entries[p.cacheKey]?.found)
      .map((p) => p.finding.id);
    console.log(`  ${capture.displayName}: ${foundIds.length > 0 ? foundIds.join(', ') : '(none)'}`);
  }

  if (args.crossFixture) {
    console.log('\n=== Cross-fixture false alarms (found by construction should be false) ===');
    for (const capture of captures) {
      const alarmIds = pairs
        .filter((p) => p.capture === capture && p.crossFixture && cache.entries[p.cacheKey]?.found)
        .map((p) => `${p.gtFixtureId}/${p.finding.id}`);
      console.log(
        `  ${capture.displayName}: ${alarmIds.length > 0 ? alarmIds.join(', ') + ' — false alarm(s) by construction' : '(none)'}`,
      );
    }
  }

  if (failures.length > 0) {
    console.log('\n=== Failed pairs (not written to cache) ===');
    for (const f of failures) {
      console.log(`  ${f.pair.finding.id} on ${f.pair.capture.displayName}: ${f.error.slice(0, 200)}`);
    }
    console.log(
      `\n${failures.length} pair(s) failed to grade. Fix and re-run before scoring — ` +
        'a partial cache must not be scored silently.\n',
    );
    process.exit(1);
  }

  console.log('\nGrading complete.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
