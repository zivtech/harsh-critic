# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

zivtech-data-skills is a collection of Claude Code skills and agents for thorough review and planning of data-intensive code. It is a **prompt-only repository** — no build system, no runtime code, no dependencies. The deliverables are markdown prompt files that get installed into a user's `~/.claude/` directory.

## Repository Structure

```
zivtech-data-skills/
├── CLAUDE.md                    # This file
├── SKILLS-INVENTORY.md          # Inventory of external skills these tools leverage
├── critic/                      # data-critic: math & data correctness reviewer
│   └── .claude/
│       ├── skills/data-critic/SKILL.md
│       └── agents/data-critic.md
└── planner/                     # data-planner: data pipeline & analysis planner
    └── .claude/
        ├── skills/data-planner/SKILL.md
        └── agents/data-planner.md
```

## Two Complementary Tools

### data-critic (implemented)
Reviews code for numerical correctness: formulas, assumptions, fallbacks, data provenance, unit consistency, statistical validity, precision & rounding. Produces a structured verdict (REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT) with evidence-backed findings.

### data-planner (implemented)
Plans data pipeline implementations with correctness built in from the start. Produces specification-first plans with: formulas in mathematical notation, test cases defined before code, unit convention registries, data assumption registers with fragility ratings, fallback strategies, data provenance maps, and validation checkpoints. Follows an 11-phase protocol and integrates with data-critic via review checkpoints.

## External Skills

Both tools are designed to leverage the ecosystem of publicly available Claude Code skills. See [SKILLS-INVENTORY.md](SKILLS-INVENTORY.md) for the full catalog of 35+ evaluated skills, classified by:

- **Criticism vs Planning vs Both** — which tool uses each skill
- **What aspects** each skill covers (verification, statistical methods, debugging, pipeline architecture, etc.)
- **MCP/API requirements** — whether the skill needs external connections and their cost
- **Recommended compositions** — which skills to chain together for common workflows

Key external skill sources:
- [obra/superpowers](https://github.com/obra/superpowers) — verification, debugging, planning, execution, code review workflows
- [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills) — statistical analysis, EDA, visualization, Bayesian modeling, symbolic math
- [flonat/claude-research](https://github.com/flonat/claude-research) — devil's advocate, multi-perspective review, pipeline mapping, code archaeology
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — data engineering, data science, financial analysis, performance profiling
- [github/awesome-copilot](https://github.com/github/awesome-copilot) — BigQuery pipeline audit, SQL code review, PostgreSQL review, Power BI review

All recommended external skills are free (some data-source skills require free API keys).

## Installation

### Full suite
```bash
# Critic
cp -r critic/.claude/skills/data-critic ~/.claude/skills/
cp critic/.claude/agents/data-critic.md ~/.claude/agents/

# Planner
cp -r planner/.claude/skills/data-planner ~/.claude/skills/
cp planner/.claude/agents/data-planner.md ~/.claude/agents/
```

### Recommended companion skills
```bash
# Verification & debugging (obra/superpowers)
npx @anthropic-ai/claude-code@latest skills add obra/superpowers

# Statistical methods (K-Dense-AI)
npx @anthropic-ai/claude-code@latest skills add K-Dense-AI/claude-scientific-skills

# Research review patterns (flonat/claude-research)
npx @anthropic-ai/claude-code@latest skills add flonat/claude-research
```

## When Editing Prompts

- Preserve exact section headings in output format contracts — parsers depend on them
- Keep investigation protocol phase order intact
- The evidence requirement (file:line + concrete input/output example) is non-negotiable
- Calibration guidance (anti-rubber-stamp AND anti-manufactured-outrage) is load-bearing
- External skill references in SKILL.md should match entries in SKILLS-INVENTORY.md
