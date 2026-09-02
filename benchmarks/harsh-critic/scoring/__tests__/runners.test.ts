import { describe, expect, it } from 'vitest';
import { describeCliError } from '../../runners.ts';

/**
 * execFile's error message starts with the full command line. For this
 * benchmark that line begins with the plan under review, so the first 120
 * characters of the error never contain the reason. The live 3x run on
 * 2026-09-01 logged exactly that: "CLI call failed (Error: Command failed:
 * claude -p Review the following work: # Plan: Add Rate Limiting..." and
 * nothing about why. These pin the fix.
 */
describe('describeCliError', () => {
  it('prefers stderr when the error carries it', () => {
    const err = Object.assign(new Error('Command failed: claude -p <20 KB of plan>'), {
      stderr: '\n  API Error: 529 overloaded_error\n',
    });
    expect(describeCliError(err)).toBe('API Error: 529 overloaded_error');
  });

  it('keeps the tail, not the head, when the text is long', () => {
    const plan = 'x'.repeat(5000);
    const err = new Error(`Command failed: claude -p ${plan} REASON AT THE END`);
    const described = describeCliError(err, 40);
    expect(described.startsWith('…')).toBe(true);
    expect(described.endsWith('REASON AT THE END')).toBe(true);
    expect(described.length).toBeLessThanOrEqual(41);
  });

  it('collapses whitespace and handles non-Error values', () => {
    expect(describeCliError('a\n\n  b   c')).toBe('a b c');
    expect(describeCliError({ stderr: '' , message: 'm' })).toBe('[object Object]');
  });
});
