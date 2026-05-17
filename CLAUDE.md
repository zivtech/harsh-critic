# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## What This Is

harsh-critic is a multi-surface critic/planner skillset for Claude Code, Codex, and local `.agents` installs, centered on `harsh-critic` and `proposal-critic` with synced domain planners and critics.

There is no application build system in this repo, but there are multiple prompt surfaces and registry documents that must stay aligned. The repository stores Claude Code skill and agent prompts, local `.agents` mirrors, Codex agent wrappers, synced domain planners/critics, docs, and the `AGENTS.md` inventory.

## Repository Structure

```text
.claude/
  skills/harsh-critic/SKILL.md
  skills/proposal-critic/SKILL.md
  agents/harsh-critic.md
  agents/proposal-critic.md
.agents/
  skills/harsh-critic/SKILL.md
  skills/proposal-critic/SKILL.md
.codex/
  agents/harsh-critic.toml
  agents/proposal-critic.toml
a11y-critic/
a11y-planner/
data-critic/
drupal-planner/
perf-critic/
react-planner/
zivtech-data-skills/
zivtech-proposal-skills/
docs/
AGENTS.md
```

The root `harsh-critic` and `proposal-critic` assets define the general review and proposal-review workflows. The synced domain directories add accessibility, React, Drupal, performance, data, and proposal-planning specialists.

## Key Design Decisions

- Critics are read-only where the agent surface supports tool restrictions.
- `harsh-critic` is for code, plans, and analysis; `proposal-critic` is for plans, proposals, and specs.
- Verdict scale is fixed: REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT.
- CRITICAL and MAJOR findings must include evidence: `file:line` for code or quoted excerpts/step references for plans.
- The "What's Missing" section is load-bearing; preserve it when editing critic prompts.
- `.agents` and `.codex` are first-class repo surfaces, not disposable local scratch.

## When Editing Prompts

- Preserve exact output headings in the root critic contracts unless the parser/consumer changes at the same time.
- Keep pre-commitment before verification in the `harsh-critic` protocol.
- Keep anti-rubber-stamp and anti-manufactured-outrage calibration guidance together.
- When changing project positioning or descriptions, update `README.md`, `CLAUDE.md`, `AGENTS.md`, root `.claude` skills/agents, `.agents` mirrors, and `.codex` wrappers together.
- Do not describe benchmark data as current or latest unless the referenced raw artifact exists in this checkout. If the artifact is absent, label the numbers historical.

## Installation Paths

- Claude Code skill: copy `.claude/skills/<skill-name>` to `~/.claude/skills/`.
- Claude Code agent: copy `.claude/agents/<agent-name>.md` to `~/.claude/agents/`.
- Local agent skill mirror: use `.agents/skills/<skill-name>`.
- Codex wrapper: use `.codex/agents/<agent-name>.toml`.
