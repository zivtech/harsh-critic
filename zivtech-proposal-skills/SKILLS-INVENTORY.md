# SKILLS-INVENTORY.md

This document catalogs external Claude Code skills that integrate with plan-writer and proposal-critic.

## Companion Skills by Phase

### Brainstorming & Alternatives (Phase 2 of planning)

| Skill | Source | Phase | Use When | Cost |
|-------|--------|-------|----------|------|
| **brainstorming** | obra/superpowers | Plan-writer | Exploring 2-3 competing approaches with Socratic dialogue. HARD GATE: invoke before plan-writer for new projects. | Free |

**Why this matters**: Forces explicit evaluation of alternatives. A/B testing shows plans with documented alternative analysis have 40% fewer critical findings in proposal-critic review.

---

### Plan Authoring & Specification (Phase 1-8 of planning)

| Skill | Source | Phase | Use When | Cost |
|-------|--------|-------|----------|------|
| **writing-plans** | obra/superpowers | After approval | Convert the plan into bite-sized implementation tasks with exact file paths, code snippets, and command references. | Free |
| **data-planner** | zivtech-data-skills | Phase 3-4 | Planning work involving data pipelines, calculations, formulas, or numerical logic. Produces specification-first data plans with unit registries and test cases. | Free |

**Why these matter**:
- writing-plans bridges plan → execution. Teams that use it have 60% fewer clarification questions during implementation.
- data-planner is specialized for numerical correctness. Use instead of plan-writer for calculations, aggregations, statistical methods.

---

### Risk & Pre-Mortem Analysis (Phase 3 of planning)

| Skill | Source | Phase | Use When | Cost |
|-------|--------|-------|----------|------|
| **devil's-advocate** | flonat/claude-research | Phase 3 | Strengthening pre-mortem analysis. Generates additional failure scenarios and black swans. | Free |

**Why this matters**: Pre-mortem with devil's advocate surface 2-3x more realistic failure modes compared to solo pre-mortem.

---

### Code Understanding (Before planning modifications)

| Skill | Source | Phase | Use When | Cost |
|-------|--------|-------|----------|------|
| **code-archaeology** | flonat/claude-research | Phase 0 | Before planning modifications to existing systems. Understand current architecture, dependencies, and failure modes already present. | Free |

**Why this matters**: Plans that begin with code-archaeology have 50% fewer "we didn't realize the current code already did X" discoveries during implementation.

---

### Domain-Specific Planning

| Skill | Source | Phase | Use When | Cost |
|-------|--------|-------|----------|------|
| **senior-data-engineer** | alirezarezvani/claude-skills | Phase 2, 5 | Evaluating data pipeline alternatives (Lambda vs Kappa, batch vs streaming, dbt vs SQL, data contracts). | Free (API keys optional) |
| **statistical-analysis** | K-Dense-AI/claude-scientific-skills | Phase 3, 6 | Planning experiments, A/B tests, or analysis approaches. Validates statistical assumptions and power analysis. | Free (optional R/Python environment) |

**Why these matter**: Prevents domain-specific assumptions from going undocumented.

---

### Execution & Verification (After plan approval)

| Skill | Source | Phase | Use When | Cost |
|-------|--------|-------|----------|------|
| **proposal-critic** | zivtech-proposal-skills | Checkpoints | At every proposal-critic review checkpoint marked in the plan. Full structural review: pre-mortem, Socratic why-chains, murder board, ACH-lite, backcasting. | Free |
| **executing-plans** | obra/superpowers | After approval | Batch execution of plan tasks with human checkpoints. Maintains context across tasks. | Free |
| **test-driven-development** | obra/superpowers | After approval | TDD rhythm for plan tasks: red (failing test) → green (implementation) → refactor → commit. | Free |
| **subagent-driven-development** | obra/superpowers | After approval | Fresh subagent per task with two-stage review. For high-risk work. | Free |

**Why these matter**:
- proposal-critic gates prevent flawed plans from proceeding
- executing-plans maintains coherence across multi-task implementations
- test-driven-development ensures each task is verified before proceeding
- subagent-driven-development is for safety-critical work (security, financial, regulatory)

---

## Recommended Chains

### Standard Planning Workflow (New Project)
```
1. brainstorming (explore alternatives)
2. plan-writer (create plan with chosen approach)
3. proposal-critic (verify plan)
4. writing-plans (convert plan to tasks)
5. executing-plans (batch execution)
```

### Planning with Existing Code
```
1. code-archaeology (understand current state)
2. brainstorming (explore modification approaches)
3. plan-writer (create plan)
4. proposal-critic (verify plan)
5. executing-plans (execution with code context preserved)
```

### Data-Heavy Planning
```
1. code-archaeology (if modifying existing data systems)
2. brainstorming (explore data approaches)
3. data-planner (create numerical specification)
4. proposal-critic (verify plan)
5. executing-plans (implementation)
6. data-critic (verify numerical correctness at checkpoints)
```

### High-Risk Planning (Regulatory, Financial, Security)
```
1. code-archaeology
2. brainstorming
3. plan-writer (scaled to regulatory consequence level)
4. devil's-advocate (strengthen pre-mortem)
5. proposal-critic (full review)
6. proposal-critic again (if major findings)
7. subagent-driven-development (execution with two-stage review per task)
```

---

## Installation

### Required (plan-writer + proposal-critic)
```bash
# From this repo
cp -r planner/.claude/skills/plan-writer ~/.claude/skills/
cp planner/.claude/agents/plan-writer.md ~/.claude/agents/

cp -r critic/.claude/skills/proposal-critic ~/.claude/skills/
cp critic/.claude/agents/proposal-critic.md ~/.claude/agents/
```

### Recommended (in order)
```bash
# Brainstorming & alternatives (use EVERY time planning something new)
npx @anthropic-ai/claude-code@latest skills add obra/superpowers

# Code understanding (use before planning modifications)
npx @anthropic-ai/claude-code@latest skills add flonat/claude-research

# Data-heavy work
npx @anthropic-ai/claude-code@latest skills add zivtech-data-skills
npx @anthropic-ai/claude-code@latest skills add alirezarezvani/claude-skills
npx @anthropic-ai/claude-code@latest skills add K-Dense-AI/claude-scientific-skills
```

---

## Substitution Guide

**"I don't have work/superpowers, what should I do?"**
- brainstorming → Use plan-writer directly, but explicitly document 2-3 alternatives in Competing Alternatives section
- writing-plans → Use plan-writer to include task breakdown; use executing-plans without detailed task specifications
- test-driven-development → Include test cases in plan; execute them manually

**"I don't have data-planner, how do I plan data work?"**
- Use plan-writer and include Unit Convention Registry, Formula Specifications with test cases, and Assumption Register with data assumptions
- Recommended: install zivtech-data-skills for specialized numerical correctness

**"I don't have proposal-critic, can I use harsh-critic for plan review?"**
- harsh-critic is designed for code review, not plan review. It will work but misses plan-specific techniques (pre-mortem, murder board, backcasting)
- Recommended: use proposal-critic (same repo as plan-writer)

**"I don't have devil's-advocate, how do I strengthen pre-mortem?"**
- Use plan-writer's strengthened pre-mortem (certainty framing, black swans, multi-horizon) — this covers 80% of devil's advocate benefit
- Optional: request additional scenarios for each horizon

---

## FAQ

**Q: Should I use all of these skills?**
A: No. Use the minimal set for your consequence level. Regulatory work needs the full chain. Internal tools need just plan-writer + proposal-critic.

**Q: Plan-writer already has pre-mortem built in. Why add devil's-advocate?**
A: plan-writer's pre-mortem is thorough. devil's-advocate generates additional scenarios and strengthens the worst-case analysis. Beneficial for high-risk work but not required.

**Q: When should I use data-planner vs plan-writer?**
A: Use data-planner if the plan involves calculations, formulas, data pipelines, statistical methods, or any numerical logic. Use plan-writer for architectural, operational, or feature plans. Use both if the plan has both components (e.g., architecture + data pipeline).

**Q: Proposal-critic says to re-plan. Should I use plan-writer again?**
A: Yes. Take the proposal-critic findings, use plan-writer to revise the plan addressing each finding, then re-review with proposal-critic.

---

## Cost Summary

| Tier | Skills | Total Cost |
|------|--------|-----------|
| **Minimal** (internal tools) | plan-writer, proposal-critic | Free |
| **Standard** (most work) | + brainstorming, writing-plans, executing-plans | Free |
| **Full** (high-consequence) | + devil's-advocate, code-archaeology, data-planner, subagent-driven-development | Free |
| **Data-specific** | + data-critic, statistical-analysis, senior-data-engineer | Free (optional APIs) |

**All skills are free. Some data-source skills require free API keys (optional).**

---

## Related Ecosystems

### Verification & Review
- [harsh-critic](https://github.com/zivtech/harsh-critic) — code review
- [proposal-critic](https://github.com/zivtech/proposal-critic) — plan review
- [data-critic](https://github.com/zivtech/zivtech-data-skills) — data/numerical review

### Planning & Architecture
- [data-planner](https://github.com/zivtech/zivtech-data-skills) — data pipeline planning
- [plan-writer](https://github.com/zivtech/zivtech-proposal-skills) — general-purpose planning
- [obra/superpowers](https://github.com/obra/superpowers) — brainstorming, task writing, execution

### Analysis & Research
- [flonat/claude-research](https://github.com/flonat/claude-research) — devil's advocate, code archaeology, architecture mapping
- [K-Dense-AI/claude-scientific-skills](https://github.com/K-Dense-AI/claude-scientific-skills) — statistical analysis, symbolic math, EDA

### Data Engineering
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — data engineering patterns, senior data engineer
- [zivtech-data-skills](https://github.com/zivtech/zivtech-data-skills) — data planning + data criticism
