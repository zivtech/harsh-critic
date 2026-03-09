# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

zivtech-proposal-skills is a collection of Claude Code skills and agents for planning, reviewing, and iterating on plans and proposals. It is a **prompt-only repository** — no build system, no runtime code, no dependencies. The deliverables are markdown prompt files that get installed into a user's `~/.claude/` directory.

## Repository Structure

```
zivtech-proposal-skills/
├── CLAUDE.md                    # This file
├── SKILLS-INVENTORY.md          # Inventory of external skills these tools leverage
├── critic/                      # proposal-critic: plan/proposal reviewer
│   └── .claude/
│       ├── skills/proposal-critic/SKILL.md
│       └── agents/proposal-critic.md
└── planner/                     # plan-writer: plan authoring with embedded criticism
    └── .claude/
        ├── skills/plan-writer/SKILL.md
        └── agents/plan-writer.md
```

## Two Complementary Tools

### proposal-critic (reviewed, not implemented here)
Reviews plans and proposals using intelligence analysis techniques (Pre-mortem, Socratic Deconstruction, Murder Board, Competing Alternatives Analysis, Backcasting, Consider-the-Opposite, Verdict Challenge). Produces a structured verdict (REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT) with evidence-backed findings from 7 investigation techniques.

### plan-writer (implemented)
Writes plans proactively using the same analytical techniques that proposal-critic uses reactively. Produces specification-first plans with competing alternatives explored, pre-mortem analysis built in, assumptions registered with fragility ratings, dependencies mapped, and embedded review checkpoints where proposal-critic should verify the work.

## Two-Tool Workflow

The complementary workflow:
1. **plan-writer** produces a plan by:
   - Exploring 2-3 competing approaches before committing to one (Competing Alternatives)
   - Running a pre-mortem analysis ("If this plan fails in 6 months, what went wrong?")
   - Documenting every assumption with a fragility rating (VERIFIED / REASONABLE / FRAGILE)
   - Mapping all dependencies and failure modes
   - Planning rollback strategies for critical dependencies
   - Running self-critique using proposal-critic techniques
   - Embedding checkpoints where proposal-critic should run

2. **proposal-critic** verifies the plan by:
   - Making pre-commitment predictions about where it might fail
   - Running the full investigation protocol (pre-mortem, Socratic deconstruction, murder board, ACH-lite, backcasting)
   - Extracting and rating every assumption
   - Checking that dependencies are complete and rollback is documented
   - Running multi-perspective review (executor, stakeholder, skeptic)
   - Identifying what's missing and what's ambiguous
   - Producing a verdict with evidence-backed findings

Feedback loop: proposal-critic findings → plan-writer revisions → proposal-critic re-verification → approved plan

## External Skills

Both tools are designed to leverage the ecosystem of publicly available Claude Code skills. See [SKILLS-INVENTORY.md](SKILLS-INVENTORY.md) for the full catalog of evaluated skills, classified by:

- **Planning vs Criticism** — which tool uses each skill
- **What aspects** each skill covers (brainstorming, writing, review, execution, etc.)
- **MCP/API requirements** — whether the skill needs external connections and their cost
- **Recommended compositions** — which skills to chain together for common workflows

Key external skill sources:
- [obra/superpowers](https://github.com/obra/superpowers) — brainstorming, plan writing, execution, code review, verification
- [zivtech-data-skills](https://github.com/zivtech/zivtech-data-skills) — data-planner (use for data-heavy plans), data-critic (verify numerical correctness)
- [flonat/claude-research](https://github.com/flonat/claude-research) — devil's advocate, multi-perspective review, architecture mapping
- [harsh-critic](https://github.com/zivtech/harsh-critic) — code review (complementary to proposal review)
- [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills) — statistical analysis, symbolic math, scientific planning

All recommended external skills are free (some data-source skills require free API keys).

## Installation

### Full suite (plan-writer + proposal-critic)
```bash
# plan-writer
cp -r planner/.claude/skills/plan-writer ~/.claude/skills/
cp planner/.claude/agents/plan-writer.md ~/.claude/agents/

# proposal-critic (copy from the separate proposal-critic repo)
cp -r critic/.claude/skills/proposal-critic ~/.claude/skills/
cp critic/.claude/agents/proposal-critic.md ~/.claude/agents/
```

### Recommended companion skills
```bash
# Brainstorming & planning (obra/superpowers)
npx @anthropic-ai/claude-code@latest skills add obra/superpowers

# Data planning (if plans involve data/calculations)
npx @anthropic-ai/claude-code@latest skills add zivtech-data-skills

# Research & devil's advocate (flonat/claude-research)
npx @anthropic-ai/claude-code@latest skills add flonat/claude-research
```

## When Editing Prompts

- Preserve exact section headings in output format contracts — downstream parsers depend on them
- Keep the 8-phase planning protocol order intact (Context & Scope must come before Competing Alternatives)
- The Planning Protocol in SKILL.md and agents/plan-writer.md encode the same phases — keep them synchronized
- Calibration guidance is load-bearing:
  - Anti-over-planning: simple work doesn't need 20-page specs
  - Anti-under-planning: high-consequence work (money, security, regulatory) needs thorough coverage
  - Scale to consequence: regulatory filing > executive decision > internal tool > prototype
- The Assumption Register and Dependency Map are the core differentiators — they catch more gaps than traditional plans
- Hard gates are non-negotiable:
  - Every plan MUST have a pre-mortem section
  - Every plan MUST explore competing alternatives before commitment
  - Every plan MUST have an Assumption Register with at least one FRAGILE-rated assumption
  - Every plan MUST include proposal-critic review checkpoints

## Feedback Loop Design

The two-tool approach prevents planning blind spots:

1. plan-writer's **self-critique** (running proposal-critic techniques on its own work) catches immediate issues before reviewer sees it
2. proposal-critic's **structured investigation** (pre-mortem, Socratic why-chains, murder board, ACH-lite, backcasting) catches gaps that missed the self-critique
3. Findings → plan-writer improvements → re-verification → approval

This is far more effective than single-pass review because:
- plan-writer is incentivized to surface and fix its own problems early (embedded self-critique)
- proposal-critic reviews with fresh eyes and structured techniques
- The feedback loop is explicit in the plan (review checkpoints marked with specific proposal-critic focus areas)

## Severity Calibration

Plans are scaled to their consequence level:

| Consequence Level | Examples | Assumption Depth | Test Cases | Rollback Strategy | Review Rigor |
|---|---|---|---|---|---|
| Regulatory/Financial | Payment processing, financial reporting, audit compliance | Extensive (FRAGILE assumptions get interviews with domain experts) | 10+ cases per formula, black swan scenarios | Detailed with automated detection | Full proposal-critic, data-critic if numerical |
| Executive Decision | Strategic plans, resource allocation, major feature decisions | Thorough (every FRAGILE assumption documented with evidence plan) | 5+ scenarios per key decision, pre-mortem results | Clear with contingency options | Full proposal-critic |
| Internal Tool | Refactoring, internal dashboards, dev tooling | Adequate (FRAGILE assumptions identified, reasonable mitigation) | 3+ scenarios per major component | Basic with recovery steps | Focused proposal-critic on dependencies |
| Prototype/Experiment | Learning projects, short-term trials, proof-of-concept | Minimal (formulas and basic tests required, validation can defer) | Formulas + boundary tests | Deferred unless high learning risk | Self-review sufficient |

## Key Design Decisions

- plan-writer is **generative, not read-only** — it writes plans and can suggest implementations
- proposal-critic is **read-only** (no Write/Edit) — reviewers should not modify what they review
- The skill routes through OMC when available, falling back to general-purpose
- Verdict scale is fixed: REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT
- Plans are saved to `docs/plans/YYYY-MM-DD-<feature-name>-plan.md` with consistent section headings
- Assumption Register uses VERIFIED / REASONABLE / FRAGILE ratings (borrowed from data-planner, proven effective)
- Dependency Map is explicit — every plan MUST have dependencies listed, even if empty ("No cross-team dependencies")
- Review checkpoints are embedded, not deferred ("plan complete, now review") — proposal-critic runs AS PART OF plan authoring

## Related Work

This builds on the design patterns from:
- **harsh-critic** (GitHub: zivtech/harsh-critic): reads code, uses 5-phase review protocol, produces structured verdicts
- **proposal-critic** (GitHub: zivtech/proposal-critic): reads plans, uses 7 intelligence analysis techniques, produces structured verdicts
- **data-planner** (GitHub: zivtech/zivtech-data-skills): writes data plans with numerical correctness built in, 11-phase protocol
- **data-critic** (GitHub: zivtech/zivtech-data-skills): reviews data plans and code for numerical correctness

plan-writer unifies the strengths of data-planner (proactive specification) with proposal-critic (intelligence analysis) into a general-purpose plan authoring tool.
