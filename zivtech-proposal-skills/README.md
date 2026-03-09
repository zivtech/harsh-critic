# zivtech-proposal-skills

Plan authoring and review tools for creating robust plans that anticipate failure modes and integrate intelligence analysis techniques.

## What's Inside

### plan-writer
Writes detailed plans using intelligence analysis techniques from proposal-critic, but applied **proactively during authoring** rather than reactively during review.

**Key features:**
- Competing Alternatives Analysis (ACH-lite) — explores 2-3 approaches before commitment
- Strengthened Pre-Mortem — day 1, 1-month, 6-month horizons with black swan analysis
- Assumption Register — every assumption rated VERIFIED / REASONABLE / FRAGILE
- Dependency Map — external, internal, resource dependencies with fallback strategies
- Backcasting Verification — traces from goal to step 1, verifies no broken links
- Self-Critique — runs proposal-critic techniques on own work before presenting
- Embedded Review Checkpoints — specifies where proposal-critic should verify

**Use when:** Planning features, migrations, architecture changes, system designs, or any work with consequence (money, security, regulatory, executive decisions)

### proposal-critic (reference structure)
Reviews plans using 7 intelligence analysis techniques. Deliverables are copied from the separate proposal-critic repository.

**Techniques:**
1. Pre-commitment predictions (predict likely problems)
2. Pre-mortem with certainty framing (imagine failure, work backward)
3. Socratic Deconstruction (why-chains collapse unsupported reasoning)
4. Murder Board (attack core thesis of plan)
5. Competing Alternatives (ACH-lite — does evidence actually rule out alternatives?)
6. Backcasting (trace backward from goals)
7. Consider-the-Opposite (false negative debiasing)

## Installation

### Copy plan-writer to your Claude Code config
```bash
cp -r planner/.claude/skills/plan-writer ~/.claude/skills/
cp planner/.claude/agents/plan-writer.md ~/.claude/agents/
```

### Copy proposal-critic from the separate repo
```bash
# From zivtech/proposal-critic repository
cp -r .claude/skills/proposal-critic ~/.claude/skills/
cp .claude/agents/proposal-critic.md ~/.claude/agents/
```

Or install both via npm:
```bash
npx @anthropic-ai/claude-code@latest skills add zivtech/zivtech-proposal-skills
npx @anthropic-ai/claude-code@latest skills add zivtech/proposal-critic
```

## Quick Start

### Write a plan
```
/plan-writer I need to plan a migration from our monolithic API to microservices
```

plan-writer will produce a detailed plan with:
- Competing alternatives (lift-and-shift vs strangler fig vs rewrite)
- Pre-mortem analysis (what could fail at day 1, month 1, month 6)
- Assumption register (every assumption rated for fragility)
- Dependency map (all cross-team dependencies)
- Rollback strategies (how to recover from each failure)
- Review checkpoints (where proposal-critic should verify)

### Review the plan
```
/proposal-critic docs/plans/YYYY-MM-DD-microservices-migration-plan.md
```

proposal-critic will produce a structured verdict with:
- Critical findings (block execution)
- Major findings (require rework)
- What's missing (gaps the plan doesn't address)
- Multi-perspective analysis (executor, stakeholder, skeptic views)

### Iterate
Address proposal-critic findings, run plan-writer again on the revised plan, then re-review.

### Execute
Once proposal-critic approves (ACCEPT or ACCEPT-WITH-RESERVATIONS):
```
/writing-plans docs/plans/YYYY-MM-DD-microservices-migration-plan.md
/executing-plans <tasks>
```

## Design Philosophy

The two-tool workflow prevents blind spots:

1. **plan-writer** catches problems during authoring via embedded self-critique
2. **proposal-critic** catches problems with fresh eyes via structured investigation
3. Feedback loop: findings → revisions → re-review → approval

This is more effective than single-pass review because:
- plan-writer incentivizes surfacing and fixing problems early
- proposal-critic reviews with the full 7-technique protocol
- Review checkpoints are explicit in the plan (not deferred to "after execution")

## Files

```
zivtech-proposal-skills/
├── README.md                                    # This file
├── CLAUDE.md                                    # Repo guidance (editing, design decisions)
├── SKILLS-INVENTORY.md                          # Companion skills catalog & integration guide
├── planner/
│   └── .claude/
│       ├── skills/plan-writer/SKILL.md          # Skill definition (461 lines)
│       └── agents/plan-writer.md                # Standalone agent (348 lines)
└── critic/
    └── .claude/
        ├── skills/proposal-critic/SKILL.md      # (Copy from proposal-critic repo)
        └── agents/proposal-critic.md             # (Copy from proposal-critic repo)
```

## Key Sections in Plans

All plans saved to `docs/plans/YYYY-MM-DD-<feature-name>-plan.md` include:

1. **Executive Summary** — goal, timeframe, audience, scope, consequence level
2. **Competing Alternatives Analysis** — 2-3 approaches evaluated with cost/risk/speed/maintainability
3. **Pre-Mortem Analysis** — failure scenarios at day 1, 1-month, 6-month horizons + black swans
4. **Assumption Register** — every assumption rated VERIFIED / REASONABLE / FRAGILE with mitigation
5. **Dependency Map** — external, internal, resource dependencies with fallbacks
6. **Failure Mode & Rollback Design** — detection, fallback, recovery for critical steps
7. **Implementation Phases** — sequenced tasks with dependencies and success criteria
8. **Review Checkpoints** — embedded proposal-critic gates with specific focus areas

## Consequence Scaling

Plans are scaled to their consequence level:

| Level | Examples | Depth |
|-------|----------|-------|
| **Regulatory/Financial** | Payment processing, audits, financial reports | Maximum: extensive assumptions, 10+ test cases, detailed rollback |
| **Executive Decision** | Strategic plans, resource allocation, major features | Thorough: every assumption documented, 5+ scenarios, clear contingencies |
| **Internal Tool** | Refactoring, dashboards, dev tooling | Adequate: formulas + tests, identified fragile assumptions |
| **Prototype** | Learning projects, short-term experiments | Minimal: essentials only, formulas + basic tests |

## Companion Skills

Recommended external skills to chain with plan-writer:

- **brainstorming** (obra/superpowers) — explore alternatives before planning
- **writing-plans** (obra/superpowers) — convert plan to implementation tasks
- **code-archaeology** (flonat/claude-research) — understand existing code before planning modifications
- **data-planner** (zivtech-data-skills) — for plans involving calculations/formulas
- **devil's-advocate** (flonat/claude-research) — strengthen pre-mortem analysis
- **executing-plans** (obra/superpowers) — batch execution of plan tasks

See [SKILLS-INVENTORY.md](SKILLS-INVENTORY.md) for the full catalog.

## Examples

### Example 1: Microservices Migration
- Competing Alternatives: lift-and-shift vs strangler fig vs rewrite
- Pre-Mortem: service discovery misconfiguration (day 1), data inconsistency (1 month), performance degradation (6 months)
- Critical dependency: API gateway team provides routing by month 2
- Rollback: if any service error rate > 10% for 5 min, flip traffic back to monolith
- Result: structured plan with clear risk management

### Example 2: Data Pipeline Redesign
- Competing Alternatives: batch vs streaming, Lambda vs Kappa, dbt vs SQL
- Pre-Mortem: late data arrival (day 1), duplicates after join (1 month), staleness at scale (6 months)
- Assumptions: "vendor SLA covers our latency needs" → FRAGILE, needs verification
- Rollback: if data quality drops below threshold, revert to previous pipeline
- Integration: proposal-critic verifies assumptions, data-critic verifies numerical correctness

## FAQ

**Q: How is this different from just writing a plan?**
A: Traditional plans describe what to do. plan-writer adds proactive risk analysis — competing alternatives, pre-mortem failure scenarios, assumption fragility ratings, dependency maps, and rollback strategies. This structure prevents avoidable disasters.

**Q: Should I use plan-writer for everything?**
A: No. Scale to consequence: quick internal tools don't need full plans. High-consequence work (regulatory, financial, security, architectural) benefits greatly from thorough planning.

**Q: What if proposal-critic finds issues?**
A: That's the point. Take findings, revise the plan with plan-writer (addressing each finding), re-review with proposal-critic. Feedback loop continues until approved.

**Q: Can I use just plan-writer without proposal-critic?**
A: Yes, but proposal-critic is recommended for high-consequence work. plan-writer includes self-critique, but fresh eyes catch different issues.

**Q: What's the difference between plan-writer and data-planner?**
A: data-planner is specialized for numerical correctness (formulas, test cases, unit conventions, fallback strategies for data). plan-writer is general-purpose (architecture, operations, features, migrations). Use both if the plan has both components.

## Design Decisions

- **plan-writer is generative** — it produces plans and can suggest implementations
- **proposal-critic is read-only** — reviewers don't modify what they review (prevents reviewer bias)
- Plans follow consistent structure — section headings, assumption register format, review checkpoint markers are standardized
- Hard gates are non-negotiable:
  - Every plan MUST explore 2+ alternatives before commitment
  - Every plan MUST include a pre-mortem section
  - Every plan MUST have an Assumption Register with fragility ratings
  - Every plan MUST include proposal-critic review checkpoints

## Related Work

This builds on design patterns from:
- [harsh-critic](https://github.com/zivtech/harsh-critic) — code review with 5-phase protocol
- [proposal-critic](https://github.com/zivtech/proposal-critic) — plan review with 7 intelligence analysis techniques
- [data-planner](https://github.com/zivtech/zivtech-data-skills) — data pipeline planning with numerical specifications
- [obra/superpowers](https://github.com/obra/superpowers) — brainstorming, plan writing, execution framework

## License

These are prompt-only tools. No build system, no runtime, no dependencies. Copy freely into your Claude Code config.

## Support

For issues or suggestions related to plan-writer:
- Check [CLAUDE.md](CLAUDE.md) for design decisions and when to edit prompts
- See [SKILLS-INVENTORY.md](SKILLS-INVENTORY.md) for integration with companion skills
- Review [planner/.claude/agents/plan-writer.md](planner/.claude/agents/plan-writer.md) for the full planning protocol
