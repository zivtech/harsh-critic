# harsh-critic Agent Registry

**Updated:** 2026-05-17

This repository is a multi-surface critic/planner skillset for Claude Code, Codex, and local `.agents` installs, centered on `harsh-critic` and `proposal-critic` with synced domain planners and critics.

This registry reflects files present in this checkout. Rows marked duplicate are present surfaces that overlap another skill; they are intentionally listed until the repo chooses a canonical consolidation.

## Root Critics

| Name | Type | Surface | Path | Status | Description |
|---|---|---|---|---|---|
| harsh-critic | critic | Claude agent | `.claude/agents/harsh-critic.md` | present | Evidence-backed critic for code, plans, and analysis |
| harsh-critic | critic | Claude skill | `.claude/skills/harsh-critic/SKILL.md` | present | Slash-command/orchestration surface |
| harsh-critic | critic | local `.agents` skill | `.agents/skills/harsh-critic/SKILL.md` | present | Local agent-skill mirror |
| harsh-critic | critic | Codex agent | `.codex/agents/harsh-critic.toml` | present | Codex wrapper |
| proposal-critic | critic | Claude agent | `.claude/agents/proposal-critic.md` | present | Evidence-backed critic for plans, proposals, and specs |
| proposal-critic | critic | Claude skill | `.claude/skills/proposal-critic/SKILL.md` | present | Slash-command/orchestration surface |
| proposal-critic | critic | local `.agents` skill | `.agents/skills/proposal-critic/SKILL.md` | present | Local agent-skill mirror |
| proposal-critic | critic | Codex agent | `.codex/agents/proposal-critic.toml` | present | Codex wrapper |

## Synced Domain Critics

| Name | Type | Surface | Path | Status | Description |
|---|---|---|---|---|---|
| a11y-critic | critic | Claude agent | `a11y-critic/.claude/agents/a11y-critic.md` | present | Accessibility design review |
| a11y-critic | critic | Claude skill | `a11y-critic/.claude/skills/a11y-critic/SKILL.md` | present | Accessibility design review skill |
| data-critic | critic | Claude agent | `data-critic/.claude/agents/data-critic.md` | present duplicate | Data/math correctness review |
| data-critic | critic | Claude skill | `data-critic/.claude/skills/data-critic/SKILL.md` | present duplicate | Data/math correctness review skill |
| perf-critic | critic | Claude agent | `perf-critic/.claude/agents/perf-critic.md` | present | Performance design review |
| perf-critic | critic | Claude skill | `perf-critic/.claude/skills/perf-critic/SKILL.md` | present | Performance review skill |
| data-critic | critic | Claude agent | `zivtech-data-skills/critic/.claude/agents/data-critic.md` | present duplicate | Data/math correctness review |
| data-critic | critic | Claude skill | `zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md` | present duplicate | Data/math correctness review skill |

## Synced Domain Planners

| Name | Type | Surface | Path | Status | Description |
|---|---|---|---|---|---|
| a11y-planner | planner | Claude agent | `a11y-planner/.claude/agents/a11y-planner.md` | present | Accessibility implementation planning |
| a11y-planner | planner | Claude skill | `a11y-planner/.claude/skills/a11y-planner/SKILL.md` | present | Accessibility planning skill |
| drupal-planner | planner | Claude agent | `drupal-planner/.claude/agents/drupal-planner.md` | present | Drupal implementation planning |
| drupal-planner | planner | Claude skill | `drupal-planner/.claude/skills/drupal-planner/SKILL.md` | present | Drupal planning skill |
| react-planner | planner | Claude agent | `react-planner/.claude/agents/react-planner.md` | present | React/Next.js/React Native planning |
| react-planner | planner | Claude skill | `react-planner/.claude/skills/react-planner/SKILL.md` | present | React planning skill |
| data-planner | planner | Claude agent | `zivtech-data-skills/planner/.claude/agents/data-planner.md` | present | Data pipeline and numerical implementation planning |
| data-planner | planner | Claude skill | `zivtech-data-skills/planner/.claude/skills/data-planner/SKILL.md` | present | Data planning skill |
| plan-writer | planner | Claude agent | `zivtech-proposal-skills/planner/.claude/agents/plan-writer.md` | present | Proposal and implementation plan writing |
| plan-writer | planner | Claude skill | `zivtech-proposal-skills/planner/.claude/skills/plan-writer/SKILL.md` | present | Plan-writing skill |

## External Companions

These companion critics are referenced by planner workflows but are not present in this checkout:

| Name | Status | Note |
|---|---|---|
| react-critic | external | Referenced as a companion for `react-planner` |
| drupal-critic | external | Referenced as a companion for `drupal-planner` |

## Benchmark And Fixture Notes

Older docs and prompt blocks include historical benchmark numbers for `harsh-critic`. The raw benchmark artifact referenced in those notes is not present in this checkout, so fixture counts and benchmark scores should be treated as historical until the harness and raw results are restored.

Do not add present rows for bridge or eval agents unless their files are restored in the same patch.

## Development Rules

1. Keep `README.md`, `CLAUDE.md`, this registry, root `.claude` surfaces, `.agents` mirrors, and `.codex` wrappers aligned when changing repo positioning.
2. Mark missing companions as external or planned; do not list absent paths as present.
3. Keep local junk out of Git: `.DS_Store`, `.fuse_hidden*`, and `.claude/settings.local.json`.
4. Treat `.agents/` and `.codex/` as first-class project scaffolding in this repo.
