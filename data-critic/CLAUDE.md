# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

data-critic is a Claude Code skill and agent for thorough review of math, data logic, and numerical correctness in code. Like its sibling [harsh-critic](https://github.com/zivtech/harsh-critic), it is a **prompt-only repository** — no build system, no runtime code, no dependencies. The deliverables are two markdown prompt files that get installed into a user's `~/.claude/` directory.

## Repository Structure

```
.claude/
  skills/data-critic/SKILL.md    # Skill definition (adds /data-critic slash command)
  agents/data-critic.md          # Agent definition (read-only reviewer, Opus tier)
```

- **SKILL.md**: Orchestration layer — determines routing (OMC vs general-purpose), reads the target, delegates to a reviewer subagent with the full data review protocol embedded in the prompt.
- **agents/data-critic.md**: Standalone agent prompt — contains the 11-phase investigation protocol, output format contract, calibration guidance, and examples. Runs with `disallowedTools: Write, Edit` (read-only).

Both files encode the same investigation protocol but serve different entry points.

In the parent `harsh-critic` checkout, `zivtech-data-skills/critic/` is the canonical behavioral source for `data-critic`. This root `data-critic/` directory is a compatibility mirror. The two surfaces may differ only in local path/context notes; the review protocol and agent behavior must stay equivalent. `scripts/verify_surfaces.py` enforces the load-bearing equivalence checks from the parent repo root.

## How It Differs from harsh-critic

harsh-critic is a general-purpose code/plan/analysis reviewer. data-critic is specialized:

| Aspect | harsh-critic | data-critic |
|--------|-------------|-------------|
| Focus | Code quality, architecture, gaps | Numerical correctness, data integrity |
| Key question | "Does this work correctly?" | "Does this produce correct numbers?" |
| Perspectives | Security / New-hire / Ops | Data Engineer / Domain Expert / Adversarial Input |
| Evidence | file:line references | file:line + concrete input/output examples |
| Unique phases | Pre-mortem, ambiguity scan | Formula verification, unit consistency, rounding audit, statistical validity, provenance trace |
| Verdict meaning | REJECT = flawed work | REJECT = wrong output for normal inputs |

They are complementary — use harsh-critic for general quality, data-critic for numerical correctness.

## Key Design Decisions

- The agent is intentionally **read-only** (Write/Edit disabled) to prevent a reviewer from modifying the code it reviews.
- The skill routes through OMC's `data-critic` agent type when available, falling back to `critic`, then `general-purpose`.
- Verdict scale matches harsh-critic: REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT, but definitions are domain-specific (REJECT means "produces wrong numbers for normal inputs").
- **Evidence requirement is stricter**: CRITICAL/MAJOR findings must include `file:line` AND a concrete input/output example showing expected vs actual. "The formula looks wrong" is not a finding — "Given input X, this produces Y instead of Z" is.
- **Assumption Register** is a unique output section — rates every data assumption as VERIFIED / REASONABLE / FRAGILE.
- The "What's Missing" section focuses on absent data validations, sanity checks, and reconciliation mechanisms.

## Investigation Protocol (11 Phases)

1. **Pre-commitment Predictions** — predict likely data/math issues before reading code
2. **Formula Verification** — verify every formula against spec, test boundaries
3. **Assumption Extraction** — list all data assumptions, rate by fragility
4. **Fallback & Default Audit** — what happens with null/zero/negative/NaN/out-of-range
5. **Data Provenance Trace** — follow data from source to output through all transformations
6. **Unit Consistency Check** — currencies, timezones, measurement systems
7. **Statistical Validity Review** — aggregation traps, Simpson's paradox, sample sizes
8. **Precision & Rounding Audit** — rounding mode, position in chain, accumulation drift
9. **Multi-perspective Review** — data engineer / domain expert / adversarial input
10. **Gap Analysis** — missing validations, sanity checks, reconciliation, monitoring
10.5. **Self-Audit** — confidence gating, move low-confidence to Open Questions
10.75. **Realist Check** — pragmatic severity calibration for surviving findings
11. **Synthesis** — compare predictions vs findings, produce verdict

## When Editing Prompts

- Preserve the exact section headings in the output format contract — downstream parsers depend on them.
- Keep the 11-phase protocol order intact (pre-commitment must come before formula verification).
- The evidence requirement (file:line + input/output example) is non-negotiable — it's the core differentiator from vague "the math might be wrong" reviews.
- The Assumption Register section is load-bearing — it forces the reviewer to externalize implicit data assumptions.
- Calibration guidance (anti-rubber-stamp AND anti-manufactured-data-bugs) is load-bearing — removing either half degrades review quality.

## Installation Paths

Users install by copying files to their Claude Code config:
- Skill: `cp -r .claude/skills/data-critic ~/.claude/skills/`
- Agent: `cp .claude/agents/data-critic.md ~/.claude/agents/`
