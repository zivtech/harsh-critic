# drupal-planner

drupal-planner is a Claude Code skill for designing Drupal implementations before coding. It is a companion to drupal-critic, complementing a mature review workflow.

## What This Is

drupal-planner is a **prompt-only repository** — no build system, no runtime code, no dependencies. The deliverables are two markdown prompt files that get installed into a user's `~/.claude/` directory.

Like harsh-critic and react-planner, drupal-planner encodes an architectural protocol: 10 phases of design that identify entity types, config schemas, module decisions, cache strategies, permission models, and migration paths before the first line of PHP is written.

## Repository Structure

```
.claude/
  skills/drupal-planner/SKILL.md     # Skill definition (adds /drupal-planner slash command)
  agents/drupal-planner.md           # Agent definition (Opus tier, full-featured planning)
```

- **SKILL.md**: Orchestration layer — routes through OMC's `drupal-planner` agent type when available, falling back to general-purpose. Reads the design scope (feature/module/config), delegates to a planner subagent with the full protocol embedded.
- **agents/drupal-planner.md**: Standalone agent prompt — contains the 10-phase design protocol (scope, architecture analysis, data model, modules, config schema, permissions, cache, migrations, theme, tasks), output format contract, Drupal-specific domain knowledge, and failure mode prevention.

## Key Design Decisions

- **Planning-only**: The planner produces architecture specifications, not implementation code. Code stubs show what to implement; actual PHP/Twig is left to implementation tasks.
- **Companion to critic**: The planner designs for correctness (entity relationships defined, cache tags planned, migrations thought through). The critic verifies it at checkpoints with drupal-critic.
- **10-phase protocol**: Scope → Architecture Analysis → Data Model → Module Architecture → Config Schema → Permissions & Access → Cache Strategy → Migrations → Theme Design → Implementation Tasks.
- **Drupal-specific**: Understands entity API (content vs config entities, bundles, fields, references), plugin system, hooks, services, config API (config entities vs simple config vs state), Migrate API, cache API (tags, contexts, max-age), and permission models.
- **Hard gates**: Every entity must have its purpose and relationships documented. Every custom module must justify why contrib doesn't solve it. Every config item must be classified. Cache strategy must specify tags/contexts upfront. Migrations must account for idempotency and rollback.

## When to Edit Prompts

- Keep the 10-phase protocol order intact (scope before architecture analysis before data model)
- Preserve exact section headings in the output format contract — downstream tooling depends on them
- Calibration guidance balances comprehensiveness with practicality: small features get 3-4 page plans, complex systems get 10-15 pages
- The "What's Missing" section (inspired by harsh-critic) is the core differentiator — surfaces architecture gaps that implementation won't catch
- Hard gates are load-bearing — removing them allows vague designs that fail during code review

## Installation Paths

Users install by copying files to their Claude Code config:
- Skill: `cp -r .claude/skills/drupal-planner ~/.claude/skills/`
- Agent: `cp .claude/agents/drupal-planner.md ~/.claude/agents/`
- Or via: `npx claude-skills add https://github.com/zivtech/drupal-planner`

## Key Drupal Architecture Principles Encoded in This Tool

1. **Entity Type Design is High-Consequence**: Changing an entity type's field structure after content exists requires migrations. Get this right upfront.
2. **Config vs State Confusion Breaks Deployments**: State stored in config doesn't deploy correctly. Every config item must be classified.
3. **Contrib Module Decisions Have Long-Term Implications**: Choosing a custom module over a contrib alternative means owning security updates, version compatibility, and maintenance.
4. **Cache Invalidation Bugs Are Invisible Until Production Load**: Plan cache tags and contexts upfront — retroactive fixes are hard.
5. **Permission Models Need Edge Case Handling**: Plan for both happy path (user with role X can do Y) and edge cases (what can a user with two roles do? what if a permission is revoked mid-action?).
6. **The Plugin System Is Powerful but Misuse Is Easy**: Choosing the wrong plugin type means wrong extension point. Plan plugin architecture upfront.
7. **hook_update_N Ordering Matters**: Data migrations must happen in the right sequence. Plan migrations as a state machine, not a list.
8. **Theme Layer Should Be Thin**: Business logic in preprocess functions is a maintenance nightmare. Architecture should push logic to entities/services.

## Companion to drupal-critic

The planner and critic are complementary:
- **Planner** (before code): Design the architecture. What entities? What modules? How do they relate? What's the cache strategy? What permissions do we need?
- **Critic** (during/after code): Verify the implementation matches the plan. Did the code follow the permission model? Are cache tags correct? Did the migration handle idempotency?

When drupal-critic finds MAJOR/CRITICAL findings, the planner can design focused fixes: "The permission model has a privilege escalation risk — redesign access handlers using role-based checks instead of node owner checks."

## Design Philosophy

drupal-planner aims to prevent the most expensive Drupal mistakes:
- Entity type design that requires data migration after launch
- Config/state confusion that breaks deployments
- Contrib vs custom decisions that create maintenance nightmares
- Cache strategies that work in dev but fail under production load
- Permission models with security gaps
- Migration paths that aren't idempotent or rollback-safe

The protocol is thorough but calibrated: a simple "add a field to product" gets 2-3 pages; a complex "redesign content modeling for multi-tenant SaaS" gets 12-15 pages.
