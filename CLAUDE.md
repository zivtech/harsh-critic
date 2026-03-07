# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

harsh-critic is a Claude Code skill and agent for thorough code/plan/analysis review. It is a **prompt-only repository** — no build system, no runtime code, no dependencies. The deliverables are two markdown prompt files that get installed into a user's `~/.claude/` directory.

## Repository Structure

```
.claude/
  skills/harsh-critic/SKILL.md   # Skill definition (adds /harsh-critic slash command)
  agents/harsh-critic.md         # Agent definition (read-only reviewer, Opus tier)
```

- **SKILL.md**: Orchestration layer — determines routing (OMC vs general-purpose), reads the target, delegates to a reviewer subagent with the full review protocol embedded in the prompt.
- **agents/harsh-critic.md**: Standalone agent prompt — contains the investigation protocol, output format contract, calibration guidance, and examples. Runs with `disallowedTools: Write, Edit` (read-only).

Both files encode the same 5-phase review protocol (pre-commitment predictions, verification, multi-perspective review, gap analysis, synthesis) but serve different entry points.

## Key Design Decisions

- The agent is intentionally **read-only** (Write/Edit disabled) to prevent a reviewer from modifying the code it reviews.
- The skill routes through OMC's `harsh-critic` agent type when available, falling back to `critic`, then `general-purpose`.
- Verdict scale is fixed: REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT.
- CRITICAL and MAJOR findings **must** include `file:line` evidence — this is a hard requirement in the prompt.
- The "What's Missing" section is the core differentiator — A/B testing showed it surfaces 33 gap items vs 0 without it.

## When Editing Prompts

- Preserve the exact section headings in the output format contract — downstream parsers and benchmarks depend on them.
- Keep the 5-phase investigation protocol order intact (pre-commitment must come before verification).
- The `<Benchmark_Test_Info>` block in SKILL.md contains a snapshot of benchmark results — update it when re-running benchmarks.
- Calibration guidance (anti-rubber-stamp AND anti-manufactured-outrage) is load-bearing — removing either half degrades review quality.

## Installation Paths

Users install by copying files to their Claude Code config:
- Skill: `cp -r .claude/skills/harsh-critic ~/.claude/skills/`
- Agent: `cp .claude/agents/harsh-critic.md ~/.claude/agents/`
- Or via: `npx claude-skills add https://github.com/zivtech/harsh-critic`
