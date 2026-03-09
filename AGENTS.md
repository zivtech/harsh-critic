<!-- Generated: 2026-03-09 | Last Updated: 2026-03-09 -->

# harsh-critic Agent Registry

**Updated:** 2026-03-09

This file documents all agents (critics, planners, and bridges) available in this repository and its synced dependencies. It serves as the canonical registry for:
1. Installed skill agents in `.claude/agents/`
2. Companion critics and planners referenced by those skills
3. Contract conformance status across the skill ecosystem
4. Evaluation fixture counts for quality assurance

## Root Agents (harsh-critic repo)

| Agent | Type | Path | Status | Domain | Model | Eval Fixtures | Key Capabilities |
|-------|------|------|--------|--------|-------|---|---|
| harsh-critic | critic | `.claude/agents/harsh-critic.md` | ✅ Conforms to contract | General code/plan analysis | opus | 30 | Evidence requirements, severity calibration, 5-phase protocol, gap analysis |
| proposal-critic | critic | `.claude/agents/proposal-critic.md` | ✅ Conforms to contract | Proposal/specification review | opus | — | Standalone + perspective module capability |

## Synced Skills from zivtech-meta-skills

These agents are synchronized with the canonical zivtech-meta-skills monorepo. They conform to the **spec-kitty-bridge contract** for route compatibility and cross-skill composition.

### Critics (Read-only Domain Reviewers)

| Agent | Type | Path | Status | Domain | Model | Eval Fixtures | Key Capabilities |
|-------|------|------|--------|--------|-------|---|---|
| a11y-critic | critic | `a11y-critic/.claude/agents/a11y-critic.md` | ✅ Conforms to contract | Accessibility (ARIA, focus, semantics) | opus | 10 | WCAG pattern review, state communication, semantic validation |
| perf-critic | critic | `perf-critic/.claude/agents/perf-critic.md` | ✅ Conforms to contract | Performance (frontend + backend) | opus | 3 | Hybrid standalone + perspective mode, metrics analysis |
| data-critic | critic | `zivtech-data-skills/critic/.claude/agents/data-critic.md` | ✅ Conforms to contract | Data/numerical correctness | opus | 2 | Math validation, statistical accuracy, pipeline audit |

### Planners (Full-access Implementation Designers)

| Agent | Type | Path | Status | Domain | Model | Eval Fixtures | Key Capabilities |
|-------|------|------|--------|--------|-------|---|---|
| a11y-planner | planner | `a11y-planner/.claude/agents/a11y-planner.md` | ✅ Conforms to contract | Accessibility implementation | opus | — | 9-phase protocol, WCAG compliance planning |
| react-planner | planner | `react-planner/.claude/agents/react-planner.md` | ✅ Conforms to contract | React/Next.js/React Native | opus | — | 10-phase protocol, component architecture, state ownership |
| drupal-planner | planner | `drupal-planner/.claude/agents/drupal-planner.md` | ✅ Conforms to contract | Drupal architecture | opus | — | 10-phase protocol, entity types, migrations, permissions |
| data-planner | planner | `zivtech-data-skills/planner/.claude/agents/data-planner.md` | ✅ Conforms to contract | Data pipeline design | opus | — | Multi-stage validation, numerical correctness planning |
| plan-writer | planner | `zivtech-proposal-skills/planner/.claude/agents/plan-writer.md` | ✅ Conforms to contract | Proposal/plan authoring | opus | — | Intelligence analysis, structured writing |

### Infrastructure & Integration

| Agent | Type | Path | Status | Domain | Model | Eval Fixtures | Key Capabilities |
|-------|------|------|--------|--------|-------|---|---|
| spec-kitty-bridge | bridge | `integration/spec-kitty-bridge/.claude/agents/spec-kitty-bridge.md` | ✅ Conforms to contract | Workflow routing & translation | sonnet | — | Routes to planners/critics, SDD ↔ work-package translation |
| test-builder | eval | `evals/test-builder/.claude/agents/test-builder.md` | ✅ Conforms to contract | Eval fixture generation | opus | — | 8-phase protocol, rubric + baseline + harness generation |
| test-critic | eval | `evals/test-critic/.claude/agents/test-critic.md` | ✅ Conforms to contract | Eval suite quality assurance | opus | — | 7-phase protocol, statistical rigor review (read-only) |

---

## Contract Conformance Summary

**All critics and planners conform to the spec-kitty-bridge contract**, ensuring:
- ✅ Consistent output format (section headings, verdict scale, evidence requirements)
- ✅ Evidence requirements for CRITICAL/MAJOR findings (file:line references or measurements)
- ✅ Severity calibration guidance (anti-rubber-stamp AND anti-manufactured-outrage)
- ✅ Composite output appendix with contract metadata
- ✅ Hard gates preventing vague or incomplete output

**Evaluation Fixture Status:**
- **harsh-critic:** 30 fixtures (comprehensive general code review)
- **a11y-critic:** 10 fixtures (accessibility patterns)
- **perf-critic:** 3 fixtures (performance analysis)
- **data-critic:** 2 fixtures (numerical correctness)
- **Others:** In-progress or awaiting Phase 2 eval rollout

---

## Working with These Agents

### Key Patterns

1. **Sync Source**: All synced skills inherit from [zivtech-meta-skills](../claude/zivtech-meta-skills/) as the canonical monorepo. Updates there propagate via GitHub workflow.

2. **Companion Pairs**: Each planner has an optional critic companion for mid-design review checkpoints:
   - react-planner → react-critic (separate repo)
   - drupal-planner → drupal-critic (separate repo)
   - a11y-planner → a11y-critic (this repo)
   - data-planner → data-critic (this repo)
   - plan-writer → proposal-critic (this repo)

3. **Bridge Routing**: spec-kitty-bridge routes SDD workflows to appropriate planners/critics and translates back to work-package format. All agents conform to the bridge contract for seamless composition.

4. **Read-Only Critics**: All critic agents run with Write/Edit disabled to prevent modification of code/plans under review.

5. **Contract Appendix**: All agents include a composite output appendix documenting contract conformance, fixture reference IDs, and calibration evidence.

---

## For Development

When adding or updating an agent:

1. Verify contract conformance by checking:
   - Output format section headings match the contract
   - Evidence requirements for CRITICAL/MAJOR findings
   - Severity calibration guidance (both anti-rubber-stamp and anti-outrage)
   - Hard gates preventing incomplete output

2. Update eval fixture counts when new suites are completed

3. Sync planners/critics from zivtech-meta-skills via:
   ```bash
   # Copy synced skills
   cp -r ../claude/zivtech-meta-skills/{a11y-critic,a11y-planner,perf-critic,react-planner,drupal-planner,zivtech-data-skills,zivtech-proposal-skills} .
   ```

4. Test contract conformance by running the skill through spec-kitty-bridge

---

*For detailed skill documentation, see each skill's CLAUDE.md file.*
