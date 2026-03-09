# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

react-planner is a Claude Code skill and agent for thorough React/Next.js/React Native implementation planning. It is a **prompt-only repository** — no build system, no runtime code, no dependencies. The deliverables are two markdown prompt files that get installed into a user's `~/.claude/` directory.

react-planner is the design companion to react-critic. While react-critic reviews implementations for correctness, react-planner prevents the hardest React bugs (state design, render performance, hook composition, RSC boundaries) by building architecture decisions upfront.

## Repository Structure

```
.claude/
  skills/react-planner/SKILL.md      # Skill definition (adds /react-planner slash command)
  agents/react-planner.md            # Agent definition (planning agent, Opus tier)
```

- **SKILL.md**: Orchestration layer — detects framework (React vs Next.js vs React Native), reads existing code context, delegates to the planning agent with the full 10-phase protocol embedded.
- **agents/react-planner.md**: Standalone agent prompt — contains the React planning protocol, component architecture patterns, state ownership decision matrix, performance budgeting, hook composition rules, and Next.js RSC/server action boundaries. Runs with full tool access (Read, Grep, Bash) for code exploration.

Both files encode the same 10-phase planning protocol (scope, code analysis, architecture, state ownership, hooks, performance budget, server/client boundaries, error/loading states, test strategy, and implementation tasks) but serve different entry points.

## Key Design Decisions

- The planner is **proactive and exploratory** (full tool access enabled) to read existing code and understand conventions before planning.
- The skill routes through OMC's `react-planner` agent type when available, falling back to `planner`, then `general-purpose`.
- Framework detection is automatic (detects React vs Next.js vs React Native from package.json, imports, and file structure).
- Plans are executable blueprints: every component has a responsibility statement, every hook has dependency arrays designed upfront, every state ownership is justified.
- Output format is a detailed markdown document saved to `docs/plans/YYYY-MM-DD-<feature-name>-react-plan.md` with a clear component architecture section.
- Plans explicitly identify review checkpoints where react-critic should verify component implementations.
- For Next.js: every component is classified as server or client component with rationale (RSC first-class concern).

## Core Insight: State Design Before Code

React's hardest bugs come from incorrect state ownership, stale closures in hooks, and render waterfalls — all architectural problems that ship as implementation bugs if not designed upfront. A developer who receives "implement the user settings panel" without a state plan will embed undocumented ownership assumptions. A developer who receives a plan with the component tree, state ownership map, hook composition rules, and performance budget will build something verifiable and maintainable.

react-planner produces plans with:

1. **Component tree diagram** — clear hierarchy with parent-child relationships and data flow (props down, events up)
2. **Component responsibility statements** — every component's job in one sentence
3. **State ownership map** — which component owns which state, why, and where derived state lives
4. **Hook composition plan** — custom hooks specified upfront with dependency arrays, cleanup functions, and memoization decisions
5. **Render performance budget** — which components re-render on which state changes, where are the waterfalls, what's worth memoizing vs premature optimization
6. **Next.js RSC boundaries** — explicit server/client classification with rationale, server action strategy, cache/revalidation decisions
7. **Error & loading states** — Suspense boundaries, error boundaries, loading skeletons, optimistic update strategy, stale data handling
8. **Test strategy** — testing approach per component (React Testing Library, Cypress, E2E), what to mock vs real data, accessibility plan
9. **Implementation task breakdown** — TDD rhythm with exact files, component signatures, hook stubs, and react-critic review checkpoints
10. **Failure mode analysis** — pre-mortem on common React mistakes specific to this architecture

## When Editing Prompts

- Preserve the exact section headings in the output format contract — downstream parsers depend on them.
- Keep the 10-phase planning protocol order intact (scope must come before architecture).
- Calibration guidance (preventing over-planning simple utilities AND ensuring sufficient detail for complex features) is load-bearing.
- The component responsibility statement format ("Component responsible for X, receives Y props, fires Z events") is non-negotiable — forces discipline.
- React-specific hard gates (every hook must have dependency arrays designed before implementation, every state ownership must be justified) must remain.

## Installation Paths

Users install by copying files to their Claude Code config:
- Skill: `cp -r .claude/skills/react-planner ~/.claude/skills/`
- Agent: `cp .claude/agents/react-planner.md ~/.claude/agents/`
- Or via: `npx claude-skills add https://github.com/zivtech/react-planner`

## Companion Skills

react-planner is enhanced by these external skills when installed:

**Design phase (always use if installed):**
- `brainstorming` (obra/superpowers): Explore component architecture options before committing. 2-3 options with trade-offs.
- `writing-plans` (obra/superpowers): Convert the React design into bite-sized implementation tasks with exact file paths.

**Code understanding (use at project start):**
- `code-archaeology` (flonat/claude-research): Understand existing component tree and state management patterns before planning modifications.

**Implementation (use during execution):**
- `test-driven-development` (obra/superpowers): TDD for React components with React Testing Library.
- `executing-plans` (obra/superpowers): Batch execution with checkpoints.
- `subagent-driven-development` (obra/superpowers): Fresh subagent per task with two-stage review.

**Verification (use at checkpoints):**
- `react-critic` (react-critic): 5-phase harsh code review at each checkpoint. Verify hooks, state ownership, render performance, and RSC boundaries.
- `verification-before-completion` (obra/superpowers): Enforce evidence before claims.
