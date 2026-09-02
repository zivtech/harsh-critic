/**
 * Model runners shared by the benchmark runner and the output grader.
 *
 * LOCAL ADDITION (not upstream): extracted verbatim from run-benchmark.ts so
 * that grade-outputs.ts can drive the same isolated `claude -p` path without
 * duplicating the retry, isolation and pool logic. Behaviour is unchanged.
 *
 * Two runners exist and they do NOT measure the same thing:
 *
 *   claude-cli  shells out to `claude -p`, authenticated against the signed-in
 *               subscription. It carries Claude Code's ambient context — tool
 *               schemas, settings, any CLAUDE.md in scope. Measured on a
 *               two-line fixture with --system-prompt replacing the agent
 *               prompt: 49,696 cache-creation tokens the API runner never sends.
 *   api         calls the Anthropic API directly; requires ANTHROPIC_API_KEY.
 *
 * Consequences:
 *   1. Absolute scores are not comparable across runners. Compare within one.
 *   2. This repo's own CLAUDE.md documents the critic protocol by name (murder
 *      board, backcasting, ACH-lite). In scope, it would leak protocol knowledge
 *      into the BASELINE arm. So the CLI runner executes from an empty temp
 *      directory with --strict-mcp-config and no tools.
 */

import Anthropic from '@anthropic-ai/sdk';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type Runner = 'api' | 'claude-cli';

export function isRunner(value: string | undefined): value is Runner {
  return value === 'api' || value === 'claude-cli';
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

// ============================================================
// claude-cli runner
// ============================================================

/** Empty cwd so no project CLAUDE.md, skills, or agents load into the run. */
let isolatedCwd: string | null = null;
export function getIsolatedCwd(): string {
  if (isolatedCwd === null) {
    isolatedCwd = mkdtempSync(join(tmpdir(), 'harsh-critic-bench-'));
  }
  return isolatedCwd;
}

export const CLI_DISALLOWED_TOOLS = [
  'Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob',
  'WebFetch', 'WebSearch', 'Task', 'Agent', 'NotebookEdit',
];

export interface CliResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  apiDurationMs?: number;
  notionalCostUsd?: number;
}

export async function callClaudeCli(
  systemPrompt: string,
  userMessage: string,
  model: string,
): Promise<CliResult> {
  const { ANTHROPIC_API_KEY: _dropped, ...env } = process.env;

  const { stdout } = await execFileAsync(
    'claude',
    [
      '-p', userMessage,
      '--system-prompt', systemPrompt,
      '--model', model,
      '--output-format', 'json',
      '--max-turns', '1',
      '--strict-mcp-config',
      '--disallowedTools', ...CLI_DISALLOWED_TOOLS,
    ],
    {
      cwd: getIsolatedCwd(),
      env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    },
  );

  const payload = JSON.parse(stdout);
  if (payload.is_error) {
    throw new Error(`claude -p reported an error: ${payload.subtype ?? 'unknown'}`);
  }
  if (typeof payload.result !== 'string' || payload.result.length === 0) {
    throw new Error('claude -p returned no result text');
  }

  return {
    text: payload.result,
    inputTokens: payload.usage?.input_tokens,
    outputTokens: payload.usage?.output_tokens,
    apiDurationMs: payload.duration_api_ms,
    // Informational on a subscription: what the same tokens would have cost via
    // the API. Subscription usage draws on plan quota, not this figure.
    notionalCostUsd: payload.total_cost_usd,
  };
}

/**
 * Short, cause-bearing description of a failed CLI call. execFile's error
 * message begins with the full command line — which here starts with the plan
 * text under review — so the head of it never shows the reason. Prefer the
 * captured stderr, and take the TAIL of whatever is available.
 */
export function describeCliError(err: unknown, maxChars = 200): string {
  const stderr =
    typeof err === 'object' && err !== null && 'stderr' in err
      ? String((err as { stderr?: unknown }).stderr ?? '').trim()
      : '';
  const text = (stderr.length > 0 ? stderr : String(err)).replace(/\s+/g, ' ').trim();
  return text.length > maxChars ? `…${text.slice(-maxChars)}` : text;
}

/**
 * A long unattended run must survive transient CLI failures. Retries with
 * backoff; the caller decides what a cell that still fails means.
 */
export async function callClaudeCliWithRetry(
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxRetries = 3,
): Promise<CliResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callClaudeCli(systemPrompt, userMessage, model);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delayMs = Math.min(15000 * 2 ** attempt, 120000);
      process.stdout.write(
        `\n    CLI call failed (${describeCliError(err)}); ` +
          `retrying in ${(delayMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${maxRetries})...\n`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error('Exhausted retries');
}

// ============================================================
// api runner
// ============================================================

export async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  model: string,
  maxRetries = 5,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Claude response');
      }
      return textBlock.text;
    } catch (err: unknown) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes('529') ||
          err.message.includes('overloaded') ||
          err.message.includes('rate') ||
          err.message.includes('500'));
      if (isRetryable && attempt < maxRetries) {
        const delayMs = Math.min(1000 * 2 ** attempt, 60000);
        process.stdout.write(`\n    Retrying in ${(delayMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${maxRetries})... `);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Exhausted retries');
}

// ============================================================
// Concurrency
// ============================================================

/** Run `worker` over `items` with at most `concurrency` in flight. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const laneCount = Math.max(1, Math.min(concurrency, items.length));
  const lanes = Array.from({ length: laneCount }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(lanes);
}
