/**
 * Benchmark runner for harsh-critic vs critic agent evaluation.
 *
 * Usage:
 *   npx tsx benchmarks/harsh-critic/run-benchmark.ts [options]
 *   ANTHROPIC_API_KEY=sk-... npx tsx benchmarks/harsh-critic/run-benchmark.ts --runner api
 *
 * Options:
 *   --agent harsh-critic|critic|critic-legacy|both
 *                                      Which agent(s) to run (default: both).
 *                                      harsh-critic reads the live prompt from
 *                                      .claude/agents/; critic and critic-legacy
 *                                      read pinned snapshots from prompts/.
 *   --fixture <fixture-id>             Run a single fixture only
 *   --output-dir <path>                Where to write results (default: benchmarks/harsh-critic/results)
 *   --model <model>                    Claude model to use (default: claude-opus-4-8)
 *   --runner claude-cli|api            claude-cli (default) shells out to
 *                                      `claude -p`, running on the signed-in
 *                                      Claude subscription — no API key needed.
 *                                      api calls the Anthropic API directly and
 *                                      requires ANTHROPIC_API_KEY. The two do NOT
 *                                      measure the same thing; see runners.ts
 *                                      before comparing across them.
 *   --repeats <n>                      Samples per cell (default: 1). n=1 cannot
 *                                      separate a prompt difference from run-to-run
 *                                      variance; 3 is the documented minimum for a
 *                                      reportable delta.
 *   --concurrency <n>                  Cells to run in parallel (default: 1)
 *   --capture-dir <path>               Where to write each cell's raw output as it
 *                                      completes (default: <output-dir>/captures/<timestamp>).
 *                                      Raw outputs make re-scoring free — never
 *                                      spend quota to re-measure a scorer change.
 *   --resume                           Reuse any cells already captured in
 *                                      --capture-dir instead of re-running them.
 *                                      Without this flag, a --capture-dir holding
 *                                      non-empty captured cells is refused rather
 *                                      than silently overwritten.
 *   --dry-run                          Load fixtures and ground truth but skip API calls
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { AgentType, FixtureResult, GroundTruth } from './scoring/types.ts';
import { parseAgentOutput } from './scoring/parser.ts';
import { scoreFixture, matchFindings } from './scoring/scorer.ts';
import { generateJsonReport, generateMarkdownReport } from './scoring/reporter.ts';
import {
  type Runner,
  isRunner,
  type CliResult,
  getIsolatedCwd,
  callClaude,
  callClaudeCliWithRetry,
  describeCliError,
  runPool,
  sha256,
} from './runners.ts';

// ============================================================
// Directory resolution
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCHMARK_DIR = __dirname;
const REPO_ROOT = resolve(__dirname, '..', '..');

// ============================================================
// CLI argument parsing
// ============================================================

interface CliArgs {
  agent: 'harsh-critic' | 'critic' | 'critic-legacy' | 'both';
  runner: Runner;
  fixture: string | null;
  outputDir: string;
  model: string;
  dryRun: boolean;
  repeats: number;
  concurrency: number;
  captureDir: string | null;
  resume: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    agent: 'both',
    fixture: null,
    outputDir: join(BENCHMARK_DIR, 'results'),
    model: 'claude-opus-4-8',
    // Default to the subscription runner: it is the path that works without a
    // metered API key, and is what this repo actually runs on.
    runner: 'claude-cli',
    dryRun: false,
    repeats: 1,
    concurrency: 1,
    captureDir: null,
    resume: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--runner': {
        const val = args[++i];
        if (!isRunner(val)) {
          console.error(`Error: --runner must be api or claude-cli (got "${val}")`);
          process.exit(1);
        }
        result.runner = val;
        break;
      }
      case '--agent': {
        const val = args[++i];
        if (
          val !== 'harsh-critic' &&
          val !== 'critic' &&
          val !== 'critic-legacy' &&
          val !== 'both'
        ) {
          console.error(
            `Error: --agent must be harsh-critic, critic, critic-legacy, or both (got "${val}")`,
          );
          process.exit(1);
        }
        result.agent = val;
        break;
      }
      case '--fixture':
        result.fixture = args[++i];
        break;
      case '--output-dir':
        result.outputDir = args[++i];
        break;
      case '--model':
        result.model = args[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--repeats': {
        const val = Number(args[++i]);
        if (!Number.isInteger(val) || val < 1) {
          console.error(`Error: --repeats must be a positive integer (got "${val}")`);
          process.exit(1);
        }
        result.repeats = val;
        break;
      }
      case '--concurrency': {
        const val = Number(args[++i]);
        if (!Number.isInteger(val) || val < 1) {
          console.error(`Error: --concurrency must be a positive integer (got "${val}")`);
          process.exit(1);
        }
        result.concurrency = val;
        break;
      }
      case '--capture-dir':
        result.captureDir = args[++i];
        break;
      case '--resume':
        result.resume = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  return result;
}

// ============================================================
// Agent prompt loading
// LOCAL ADAPTATION (upstream e9e8fa38): upstream read live prompts from its
// own `agents/` directory and fell back to an ARCHIVED snapshot for agents it
// had removed. In this repo the live surface is `.claude/agents/<name>.md`, so
// `harsh-critic` and `proposal-critic` benchmark the CURRENT prompt. Comparison
// baselines that do not live here (for example upstream's consolidated
// `critic`) are kept as pinned snapshots under `benchmarks/harsh-critic/prompts/`.
//
// This ordering matters: upstream's published deltas were produced against a
// stale archived harsh-critic snapshot and do not describe the current prompt.
// ============================================================

function stripFrontmatter(content: string): string {
  const match = content.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

function loadAgentPromptFromFile(agentName: string): string {
  const candidatePaths = [
    join(REPO_ROOT, '.claude', 'agents', `${agentName}.md`),
    join(REPO_ROOT, 'benchmarks', 'harsh-critic', 'prompts', `${agentName}.md`),
  ];
  for (const agentPath of candidatePaths) {
    try {
      const content = readFileSync(agentPath, 'utf-8');
      return stripFrontmatter(content);
    } catch {
      // Try the next candidate path.
    }
  }
  console.error(`Error: Could not load agent prompt for "${agentName}" from any known prompt path`);
  process.exit(1);
  // process.exit() throws — TypeScript needs this to satisfy the return type
  return '';
}

// ============================================================
// Fixture loading
// ============================================================

interface Fixture {
  id: string;
  content: string;
  domain: string;
}

function loadFixtures(fixtureFilter: string | null): Fixture[] {
  const fixturesDir = join(BENCHMARK_DIR, 'fixtures');
  const domains = ['plans', 'code', 'analysis'];
  const fixtures: Fixture[] = [];

  for (const domain of domains) {
    const domainDir = join(fixturesDir, domain);
    if (!existsSync(domainDir)) continue;

    let files: string[];
    try {
      files = readdirSync(domainDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.ts')) continue;
      const id = file.replace(/\.(md|ts)$/, '');
      if (fixtureFilter !== null && id !== fixtureFilter) continue;

      const filePath = join(domainDir, file);
      const content = readFileSync(filePath, 'utf-8');
      fixtures.push({ id, content, domain });
    }
  }

  if (fixtures.length === 0) {
    if (fixtureFilter !== null) {
      console.error(`Error: Fixture "${fixtureFilter}" not found in fixtures/ directory`);
    } else {
      console.error('Error: No fixtures found in fixtures/ directory');
    }
    process.exit(1);
  }

  return fixtures;
}

// ============================================================
// Ground truth loading
// ============================================================

function loadGroundTruth(fixtureId: string): GroundTruth | null {
  const gtPath = join(BENCHMARK_DIR, 'ground-truth', `${fixtureId}.json`);
  if (!existsSync(gtPath)) {
    return null;
  }
  try {
    const raw = readFileSync(gtPath, 'utf-8');
    return JSON.parse(raw) as GroundTruth;
  } catch (err) {
    console.error(`Error: Failed to parse ground truth for "${fixtureId}": ${err}`);
    process.exit(1);
    // process.exit() throws — TypeScript needs this to satisfy the return type
    return null;
  }
}

// ============================================================
// Runners
//
// LOCAL ADDITION (not upstream): the claude-cli / api runner implementations
// live in ./runners.ts, shared with grade-outputs.ts. See the comment at the
// top of that file for what the two runners measure and why the CLI runner
// runs from an isolated cwd instead of this repo's.
// ============================================================

// ============================================================
// Retry + concurrency helpers
//
// LOCAL ADDITION (not upstream): retry-with-backoff and the concurrency pool
// also live in ./runners.ts — a long unattended run must survive transient
// failures rather than aborting on the first one. See that file for details.
// ============================================================

// ============================================================
// Capture / resume support
//
// LOCAL ADDITION (not upstream): a captured cell is quota already spent.
// Silently overwriting it on a re-run would re-spend it — that is the exact
// failure mode a capture dir exists to prevent, so a non-empty captured cell
// is refused rather than overwritten unless --resume says to reuse it.
// ============================================================

interface Cell {
  agentType: AgentType;
  fixture: Fixture;
  repeat: number;
}

function capturedFileName(cell: Cell): string {
  return `${cell.agentType}__${cell.fixture.id}__r${cell.repeat}.md`;
}

interface ExistingCapture {
  cell: Cell;
  capturedAs: string;
  path: string;
}

/**
 * Cells whose raw output already exists on disk. A zero-byte file is a crash
 * artifact — the write started but the process died mid-write — and is
 * treated as absent, not as a captured cell.
 */
function existingCaptures(captureDir: string, cells: Cell[]): ExistingCapture[] {
  const found: ExistingCapture[] = [];
  for (const cell of cells) {
    const capturedAs = capturedFileName(cell);
    const path = join(captureDir, capturedAs);
    if (existsSync(path) && statSync(path).size > 0) {
      found.push({ cell, capturedAs, path });
    }
  }
  return found;
}

interface RunManifestFile {
  capturedOn?: string;
  promptSha256?: Record<string, string>;
  planSha256AtCapture?: Record<string, string>;
  [key: string]: unknown;
}

function readManifestIfPresent(captureDir: string): RunManifestFile | null {
  const manifestPath = join(captureDir, 'run-manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as RunManifestFile;
  } catch (err) {
    console.error(`Error: could not parse existing run-manifest.json at ${manifestPath}: ${err}`);
    process.exit(1);
    // process.exit() throws — TypeScript needs this to satisfy the return type
    return null;
  }
}

/**
 * A resumed cell's output was reviewed against specific prompt/fixture text.
 * If that text has since changed, the cell cannot be pooled with fresh ones —
 * they would be scoring two different reviews as if they were one measurement.
 */
function verifyManifestProvenance(
  manifest: RunManifestFile | null,
  agentsToRun: AgentType[],
  agentPrompts: Partial<Record<AgentType, string>>,
  fixtures: Fixture[],
): void {
  if (manifest === null) {
    console.warn(
      "  Warning: no run-manifest.json in the capture dir — reused cells' provenance could not be verified.\n",
    );
    return;
  }

  const mismatches: string[] = [];
  for (const agent of agentsToRun) {
    const prev = manifest.promptSha256?.[agent];
    const current = sha256(agentPrompts[agent] ?? '');
    if (prev !== undefined && prev !== current) {
      mismatches.push(`    agent "${agent}": prompt sha256 ${prev} -> ${current}`);
    }
  }
  for (const fixture of fixtures) {
    const prev = manifest.planSha256AtCapture?.[fixture.id];
    const current = sha256(fixture.content);
    if (prev !== undefined && prev !== current) {
      mismatches.push(`    fixture "${fixture.id}": plan sha256 ${prev} -> ${current}`);
    }
  }

  if (mismatches.length > 0) {
    console.error(
      '\nError: --resume cannot reuse the captured cells in this directory — the\n' +
        '  prompt or fixture text differs from what they reviewed:\n' +
        mismatches.join('\n') +
        '\n\n  The existing cells reviewed different text and cannot be pooled with new\n' +
        '  ones. Choose a different --capture-dir, or revert the prompt/fixture and\n' +
        '  retry.\n',
    );
    process.exit(1);
  }
}

// ============================================================
// Console formatting helpers
// ============================================================

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function printSummaryTable(results: FixtureResult[]): void {
  const agentTypes: AgentType[] = ['harsh-critic', 'critic'];
  const fixtureIds = Array.from(new Set(results.map((r) => r.fixtureId))).sort();

  console.log('\n=== Benchmark Results ===\n');
  console.log(
    padEnd('Fixture', 30) +
    padEnd('Agent', 16) +
    padEnd('Composite', 12) +
    padEnd('TP Rate', 10) +
    padEnd('FN Rate', 10) +
    padEnd('Missing Cov', 12),
  );
  console.log('-'.repeat(90));

  for (const fixtureId of fixtureIds) {
    for (const agentType of agentTypes) {
      const result = results.find(
        (r) => r.fixtureId === fixtureId && r.agentType === agentType,
      );
      if (!result) continue;
      const s = result.scores;
      console.log(
        padEnd(fixtureId, 30) +
        padEnd(agentType, 16) +
        padEnd(pct(s.compositeScore), 12) +
        padEnd(pct(s.truePositiveRate), 10) +
        padEnd(pct(s.falseNegativeRate), 10) +
        padEnd(pct(s.missingCoverage), 12),
      );
    }
  }

  console.log('');
}

function printHeadToHead(
  headToHead: Array<{ fixtureId: string; winner: AgentType | 'tie'; delta: number }>,
): void {
  console.log('=== Head-to-Head ===\n');
  const wins = headToHead.filter((h) => h.winner === 'harsh-critic').length;
  const losses = headToHead.filter((h) => h.winner === 'critic').length;
  const ties = headToHead.filter((h) => h.winner === 'tie').length;
  console.log(`harsh-critic wins: ${wins}  |  critic wins: ${losses}  |  ties: ${ties}\n`);
  for (const h of headToHead) {
    const deltaSign = h.delta >= 0 ? '+' : '';
    console.log(
      `  ${padEnd(h.fixtureId, 30)} winner=${padEnd(h.winner, 14)} delta=${deltaSign}${pct(h.delta)}`,
    );
  }
  console.log('');
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = parseArgs();

  // Validate API key early (unless dry run)
  // Only the opt-in `api` runner needs a key; the default runs on the subscription.
  if (args.runner === 'api' && !args.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: --runner api requires ANTHROPIC_API_KEY, which is not set.\n' +
      '  Drop the flag to use the default subscription runner instead.\n' +
      'Set it before running:\n' +
      '  ANTHROPIC_API_KEY=sk-... npx tsx benchmarks/harsh-critic/run-benchmark.ts --runner api',
    );
    process.exit(1);
  }

  // Determine which agents to run
  const agentsToRun: AgentType[] =
    args.agent === 'both' ? ['harsh-critic', 'critic'] : [args.agent];

  // Load agent prompts
  console.log('Loading agent prompts...');
  // LOCAL FIX (upstream e9e8fa38): upstream eagerly loaded every agent prompt,
  // so a single-agent run still aborted when an unrelated prompt file was
  // absent. Load only what this run needs.
  const agentPrompts: Partial<Record<AgentType, string>> = {};
  for (const agent of agentsToRun) {
    agentPrompts[agent] = loadAgentPromptFromFile(agent);
  }

  // Load fixtures
  console.log('Loading fixtures...');
  const fixtures = loadFixtures(args.fixture);
  console.log(`  ${fixtures.length} fixture(s) found: ${fixtures.map((f) => f.id).join(', ')}`);

  // Load ground truth for each fixture
  console.log('Loading ground truth...');
  const groundTruthMap = new Map<string, GroundTruth | null>();
  for (const fixture of fixtures) {
    const gt = loadGroundTruth(fixture.id);
    groundTruthMap.set(fixture.id, gt);
    if (gt === null) {
      console.warn(
        `  Warning: No ground truth found for fixture "${fixture.id}" — will score with empty ground truth`,
      );
    } else {
      console.log(`  ${fixture.id}: ${gt.findings.length} ground truth finding(s)`);
    }
  }

  if (args.dryRun) {
    console.log('\nDry run complete. Pipeline validated — skipping API calls.');
    console.log(`  Agents:     ${agentsToRun.join(', ')}`);
    console.log(`  Fixtures:   ${fixtures.map((f) => f.id).join(', ')}`);
    console.log(`  Model:      ${args.model}`);
    console.log(`  Output dir: ${args.outputDir}`);
    return;
  }

  // Initialize Anthropic client
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Create output directory if needed
  if (!existsSync(args.outputDir)) {
    mkdirSync(args.outputDir, { recursive: true });
  }

  // ============================================================
  // Work list: one cell per (agent, fixture, repeat)
  //
  // LOCAL ADDITION (not upstream): repeats are interleaved -- every agent and
  // fixture completes repeat 1 before repeat 2 starts -- rather than nested per
  // agent. If service behaviour drifts over the hour a full run takes, an
  // interleaved order spreads that drift across both arms instead of loading it
  // onto whichever arm ran last.
  // ============================================================
  const allResults: FixtureResult[] = [];

  const cells: Cell[] = [];
  for (let repeat = 1; repeat <= args.repeats; repeat++) {
    for (const fixture of fixtures) {
      for (const agentType of agentsToRun) {
        cells.push({ agentType, fixture, repeat });
      }
    }
  }

  const runStamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const captureDir = args.captureDir ?? join(args.outputDir, 'captures', runStamp);
  mkdirSync(captureDir, { recursive: true });

  // ============================================================
  // Overwrite guard / resume
  //
  // LOCAL ADDITION (not upstream): must run before any model call and before
  // the "Running benchmark" banner — see the section comment above.
  // ============================================================
  const existing = existingCaptures(captureDir, cells);

  if (!args.resume && existing.length > 0) {
    console.error(
      `\nError: ${existing.length} of ${cells.length} cell(s) already have captured\n` +
        `  output in ${captureDir}:\n` +
        existing.map((e) => `    ${e.capturedAs}`).join('\n') +
        '\n\n' +
        '  Pass --resume to reuse them, or choose a different --capture-dir to start\n' +
        '  clean.\n',
    );
    process.exit(1);
  }

  const priorManifest = args.resume ? readManifestIfPresent(captureDir) : null;

  if (args.resume && existing.length > 0) {
    verifyManifestProvenance(priorManifest, agentsToRun, agentPrompts, fixtures);
  }

  const capturedOn = priorManifest?.capturedOn ?? runStamp;
  const existingByKey = new Map(existing.map((e) => [e.capturedAs, e]));

  console.log(
    `\nRunning benchmark: ${cells.length} cell(s)` +
      ` (${agentsToRun.join(', ')} x ${fixtures.length} fixture(s) x ${args.repeats} repeat(s)),` +
      ` concurrency ${args.concurrency}` +
      (args.resume
        ? `, reusing ${existing.length} captured / running ${cells.length - existing.length} fresh`
        : '') +
      `...\n`,
  );
  console.log(`  Raw outputs: ${captureDir}\n`);

  let notionalCostUsd = 0;

  if (args.runner === 'claude-cli') {
    console.log(
      'Runner: claude-cli (signed-in subscription). Absolute scores are NOT\n' +
        '  comparable with the api runner — see runners.ts.\n' +
        `  Isolated working directory: ${getIsolatedCwd()}\n`,
    );
  }

  interface CellFailure {
    agentType: AgentType;
    fixtureId: string;
    repeat: number;
    error: string;
  }
  interface CellTelemetry {
    agentType: AgentType;
    fixtureId: string;
    repeat: number;
    capturedAs: string;
    resumed: boolean;
    elapsedS: number;
    inputTokens?: number;
    outputTokens?: number;
    rawOutputChars: number;
  }
  type CellOutcome =
    | { kind: 'output'; rawOutput: string; telemetry: CellTelemetry }
    | { kind: 'failure'; failure: CellFailure; elapsedS: string };

  const failures: CellFailure[] = [];
  const telemetry: CellTelemetry[] = [];
  let completed = 0;

  function writeManifest(): void {
    const manifest: Record<string, unknown> = {
      capturedOn,
      runner: args.runner,
      model: args.model,
      agents: agentsToRun,
      samplesPerCell: args.repeats,
      concurrency: args.concurrency,
      planSha256AtCapture: Object.fromEntries(
        fixtures.map((f) => [f.id, sha256(f.content)]),
      ),
      promptSha256: Object.fromEntries(
        agentsToRun.map((a) => [a, sha256(agentPrompts[a] ?? '')]),
      ),
      cells: telemetry.slice().sort(
        (a, b) =>
          a.repeat - b.repeat ||
          a.fixtureId.localeCompare(b.fixtureId) ||
          a.agentType.localeCompare(b.agentType),
      ),
      failures,
    };

    if (args.resume) {
      manifest.resumedOn = runStamp;
      manifest.reusedCells = telemetry.filter((t) => t.resumed).length;
    }

    writeFileSync(
      join(captureDir, 'run-manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
  }

  // LOCAL ADDITION (not upstream): a captured cell is quota already spent —
  // --resume reads it back instead of re-spending it.
  function reuseCapturedCell(cell: Cell, capturedAs: string, path: string): CellOutcome {
    const rawOutput = readFileSync(path, 'utf-8');
    return {
      kind: 'output',
      rawOutput,
      telemetry: {
        agentType: cell.agentType,
        fixtureId: cell.fixture.id,
        repeat: cell.repeat,
        capturedAs,
        resumed: true,
        elapsedS: 0,
        rawOutputChars: rawOutput.length,
      },
    };
  }

  async function callModelForCell(cell: Cell, capturedAs: string): Promise<CellOutcome> {
    const systemPrompt = agentPrompts[cell.agentType];
    if (!systemPrompt) {
      console.error(`Error: no prompt loaded for agent "${cell.agentType}"`);
      process.exit(1);
    }

    const startMs = Date.now();
    const userMessage = `Review the following work:\n\n${cell.fixture.content}`;

    let rawOutput: string;
    let cliTelemetry: CliResult | null = null;
    try {
      if (args.runner === 'claude-cli') {
        cliTelemetry = await callClaudeCliWithRetry(systemPrompt, userMessage, args.model);
        rawOutput = cliTelemetry.text;
      } else {
        rawOutput = await callClaude(client, systemPrompt, userMessage, args.model);
      }
    } catch (err) {
      return {
        kind: 'failure',
        elapsedS: ((Date.now() - startMs) / 1000).toFixed(1),
        failure: {
          agentType: cell.agentType,
          fixtureId: cell.fixture.id,
          repeat: cell.repeat,
          // The raw error embeds the whole command line, plan text included;
          // keep the cause, not 20 KB of fixture, in the log and manifest.
          error: describeCliError(err),
        },
      };
    }

    if (cliTelemetry) {
      notionalCostUsd += cliTelemetry.notionalCostUsd ?? 0;
    }

    // Write the raw output before parsing anything. Re-scoring is free only if
    // the raw text survives the run, and a run that dies at cell 25 should keep
    // the 24 outputs it already paid for.
    writeFileSync(join(captureDir, capturedAs), rawOutput, 'utf-8');

    return {
      kind: 'output',
      rawOutput,
      telemetry: {
        agentType: cell.agentType,
        fixtureId: cell.fixture.id,
        repeat: cell.repeat,
        capturedAs,
        resumed: false,
        elapsedS: Number(((Date.now() - startMs) / 1000).toFixed(1)),
        inputTokens: cliTelemetry?.inputTokens,
        outputTokens: cliTelemetry?.outputTokens,
        rawOutputChars: rawOutput.length,
      },
    };
  }

  async function runCell(cell: Cell): Promise<void> {
    const label = `${cell.agentType} on ${cell.fixture.id} [r${cell.repeat}]`;
    const capturedAs = capturedFileName(cell);
    const existingHit = existingByKey.get(capturedAs);

    const outcome = existingHit
      ? reuseCapturedCell(cell, capturedAs, existingHit.path)
      : await callModelForCell(cell, capturedAs);

    completed++;

    if (outcome.kind === 'failure') {
      console.log(
        `  [${completed}/${cells.length}] FAILED ${label} (${outcome.elapsedS}s): ${outcome.failure.error}`,
      );
      failures.push(outcome.failure);
      writeManifest();
      return;
    }

    if (outcome.telemetry.resumed) {
      console.log(`  [${completed}/${cells.length}] reused ${label}`);
    } else {
      console.log(
        `  [${completed}/${cells.length}] done   ${label} (${outcome.telemetry.elapsedS.toFixed(1)}s)`,
      );
    }
    telemetry.push(outcome.telemetry);

    const parsedOutput = parseAgentOutput(outcome.rawOutput, cell.agentType);

    // Build ground truth — use empty placeholder if none exists
    const groundTruth: GroundTruth = groundTruthMap.get(cell.fixture.id) ?? {
      fixtureId: cell.fixture.id,
      fixturePath: cell.fixture.id,
      domain: cell.fixture.domain as GroundTruth['domain'],
      expectedVerdict: 'REJECT',
      findings: [],
      isCleanBaseline: false,
    };

    const scores = scoreFixture(parsedOutput, groundTruth);
    const matchResult = matchFindings(parsedOutput, groundTruth);

    allResults.push({
      fixtureId: cell.fixture.id,
      domain: groundTruth.domain,
      agentType: cell.agentType,
      repeat: cell.repeat,
      parsedOutput,
      scores,
      matchedFindings: matchResult.matchedIds,
      missedFindings: matchResult.missedIds,
      spuriousFindings: matchResult.spuriousTexts,
    });

    writeManifest();
  }

  // Capture manifest: what was run, against which plan text, and what came
  // back. Written now (before any cell runs) so a crash leaves a provenance
  // record, then rewritten after every cell and once more at the end.
  writeManifest();

  await runPool(cells, args.concurrency, runCell);

  writeManifest();

  if (failures.length > 0) {
    console.log(
      `\n  ${failures.length} of ${cells.length} cell(s) FAILED and are excluded from scoring:`,
    );
    for (const f of failures) {
      console.log(`    ${f.agentType} / ${f.fixtureId} r${f.repeat}: ${f.error.slice(0, 160)}`);
    }
    console.log(
      '  Cells are excluded, not zeroed. Any aggregate below is over an unbalanced\n' +
        '  design — re-run the missing cells before comparing arms.\n',
    );
  }

  if (allResults.length === 0) {
    console.error('\nEvery cell failed. Nothing to report.');
    process.exit(1);
  }

  // Generate reports
  console.log('\nGenerating reports...');
  const jsonReport = generateJsonReport(allResults, args.model);
  const markdownReport = generateMarkdownReport(jsonReport);

  // Timestamped + "latest" output files
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const jsonPath = join(args.outputDir, `results_${timestamp}.json`);
  const mdPath = join(args.outputDir, `report_${timestamp}.md`);
  const latestJsonPath = join(args.outputDir, 'results.json');
  const latestMdPath = join(args.outputDir, 'report.md');

  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  writeFileSync(mdPath, markdownReport, 'utf-8');
  writeFileSync(latestJsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
  writeFileSync(latestMdPath, markdownReport, 'utf-8');

  console.log(`  Written: ${jsonPath}`);
  console.log(`  Written: ${mdPath}`);
  console.log(`  Latest:  ${latestJsonPath}`);
  console.log(`  Latest:  ${latestMdPath}`);

  // Print summary
  printSummaryTable(allResults);

  if (agentsToRun.length === 2) {
    if (args.repeats > 1) {
      console.log(
        'NOTE: the built-in head-to-head below pairs by fixture id and is not\n' +
          '  repeat-aware — it reports whichever rows it matched first, not a mean.\n' +
          '  For a multi-sample delta with its spread, run:\n' +
          `    npx tsx benchmarks/harsh-critic/aggregate-repeats.ts ${captureDir}\n`,
      );
    }
    printHeadToHead(jsonReport.headToHead);

    const harsh = jsonReport.aggregateScores['harsh-critic'];
    const critic = jsonReport.aggregateScores['critic'];

    if (jsonReport.unpairedFixtures.length > 0) {
      console.log(
        `  Unpaired fixtures (not scored): ${jsonReport.unpairedFixtures.join(', ')}\n`,
      );
    }

    if (harsh && critic) {
      const delta = harsh.compositeScore - critic.compositeScore;
      const deltaSign = delta >= 0 ? '+' : '';

      console.log('=== Aggregate Scores ===\n');
      console.log(`  harsh-critic composite: ${pct(harsh.compositeScore)}`);
      console.log(`  critic composite:       ${pct(critic.compositeScore)}`);
      console.log(`  delta:                  ${deltaSign}${pct(delta)}`);
      console.log('');
    } else {
      console.log('=== Aggregate Scores ===\n');
      console.log('  Comparison unavailable — one arm produced no results.\n');
    }
  }

  if (args.runner === 'claude-cli') {
    console.log(
      `  Notional API-equivalent cost: $${notionalCostUsd.toFixed(2)} ` +
        '(informational — subscription runs draw on plan quota, not this figure)\n',
    );
  }

  console.log('Benchmark complete.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
