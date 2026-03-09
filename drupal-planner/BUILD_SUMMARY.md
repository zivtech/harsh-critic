# drupal-planner Build Summary

## Repository Structure

```
drupal-planner/
├── CLAUDE.md                                    # Repository documentation
└── .claude/
    ├── skills/
    │   └── drupal-planner/
    │       └── SKILL.md                         # Skill definition (584 lines)
    └── agents/
        └── drupal-planner.md                    # Agent prompt (458 lines)
```

## Files Created

### 1. CLAUDE.md (74 lines)
Repository-level documentation explaining drupal-planner as a companion to drupal-critic. Covers:
- What this is (prompt-only skill repository)
- Key design decisions (planning-only, 10-phase protocol, Drupal-specific)
- When to edit prompts (preserve phase order, keep section headings)
- Key Drupal principles encoded (entity design as high-consequence, config vs state confusion, etc.)

### 2. .claude/skills/drupal-planner/SKILL.md (584 lines)
The skill definition. Includes:
- **Purpose**: Design Drupal implementations before coding
- **Use_When**: User wants to plan entity types, modules, config, permissions, cache, migrations
- **Do_Not_Use_When**: Code review (use drupal-critic), implementation (use normal workflow)
- **Why_This_Exists**: Drupal's hardest bugs are design bugs
- **Companion_Skills**: brainstorming, code-archaeology, drupal-critic, drupal-coding-standards, etc.
- **Steps**: 5-step workflow (identify scope, check for companions, understand context, route to agent, return plan)
- **Embedded Planning Protocol** (full 10-phase protocol for subagent execution):
  - Phase 1: Scope & Context
  - Phase 2: Existing Architecture Analysis
  - Phase 3: Data Model Design (entity types, fields, relationships)
  - Phase 4: Module Architecture (contrib vs custom decisions)
  - Phase 5: Configuration Schema (config items classified)
  - Phase 6: Permission & Access Model (roles, permissions, transitions)
  - Phase 7: Cache Strategy (tags, contexts, max-age, invalidation)
  - Phase 8: Migration & Update Path (idempotency, rollback)
  - Phase 9: Theme & Render Design (templates, preprocess, accessibility)
  - Phase 10: Implementation Tasks & Review Checkpoints (TDD with drupal-critic checkpoints)
- **Hard Gates**: Entity purpose documented, module decisions justified, config classified, permissions mapped, cache tagged, migrations idempotent
- **Output Format**: Plan saved to docs/plans/YYYY-MM-DD-<feature-name>-drupal-plan.md with entity tables, permission mappings, cache strategy, implementation tasks
- **Calibration**: Simple feature = 2-3 pages, medium = 5-8 pages, complex = 10-15 pages
- **Examples**: Good (complete architecture with relationships, permissions, cache), Bad (vague tasks without design)
- **Final_Checklist**: 15-point verification

### 3. .claude/agents/drupal-planner.md (458 lines)
Standalone agent prompt. Includes:
- **YAML Frontmatter**: name, description, model (claude-opus-4-6)
- **Role**: The Drupal Planner — designs implementations correct by construction
- **Why_This_Matters**: 5 concrete examples of design-phase bugs and how planning prevents them
- **Success_Criteria**: Entity purpose + relationships, module decisions justified, config classified, permissions→roles, cache tags specified, migrations idempotent, hooks documented
- **Constraints**: No implementation code, every entity must have purpose, every module must justify custom vs contrib, etc.
- **Planning_Protocol** (same 10-phase as SKILL.md):
  - Phase 1-10 with detailed guidance for each phase
  - Phase 3 emphasizes entity relationships as core design artifact
  - Phase 4 emphasizes contrib-first decision process with search strategy
  - Phase 6 emphasizes permission→role mapping with workflow transitions
  - Phase 7 emphasizes cache tags + contexts + invalidation strategy
  - Phase 8 emphasizes migration idempotency as state machine (not ad-hoc list)
  - Phase 10 emphasizes TDD with drupal-critic review checkpoints
- **Hard Gates**: Enforce no code, every entity has purpose, every module justified, etc.
- **Calibration**: Scales plan size to feature complexity
- **Output Format**: Plan template with tables for entities, modules, config, permissions, cache, migrations, implementations
- **Failure_Modes_To_Avoid**: Vague entity design, config/state confusion, missing permissions, no cache tags, non-idempotent migrations, contrib avoidance, unclear relationships, logic in preprocess, hook ordering assumptions, ignoring existing code
- **Examples**: Good (complete architecture with relationships, permissions, cache, migrations), Good (focused fix for specific drupal-critic finding), Bad (vague task list)
- **Final_Checklist**: 15-point verification

## Design Principles

The drupal-planner encodes these key Drupal architectural principles:

1. **Entity Type Design is High-Consequence**: Changing field structure after content exists requires migrations. Get this right upfront.

2. **Config vs State Confusion Breaks Deployments**: State stored in config doesn't deploy correctly across environments. Every config item must be classified.

3. **Contrib Module Decisions Have Long-Term Implications**: Choosing custom over contrib means owning security, version compatibility, maintenance. Justify every custom module.

4. **Cache Invalidation Bugs Are Invisible Until Production Load**: Plan cache tags and contexts upfront. Retroactive fixes are hard.

5. **Permission Models Need Edge Case Handling**: Plan for both happy path and edge cases (multiple roles, workflow transitions, field-level access).

6. **The Plugin System Is Powerful but Misuse Is Easy**: Choosing the wrong plugin type means wrong extension point. Plan plugin architecture upfront.

7. **hook_update_N Ordering Matters**: Data migrations must happen in the right sequence. Plan migrations as a state machine.

8. **Theme Layer Should Be Thin**: Business logic in preprocess functions is a maintenance nightmare. Architecture should push logic to services.

## Companion Skills Integration

drupal-planner works alongside these skills:

- **brainstorming** (design phase): Explore multiple architectures before committing
- **code-archaeology** (understanding): Understand existing modules before planning modifications
- **drupal-critic** (verification): Harsh code review at checkpoints
- **drupal-coding-standards** (standards): Drupal coding standards compliance
- **test-driven-development** (implementation): TDD for Drupal with PHPUnit and Kernel tests
- **writing-plans** (task breakdown): Convert architecture into implementation tasks

## Key Features vs react-planner

| Feature | React Planner | Drupal Planner |
|---------|---------------|----------------|
| Focus | Component state, hooks, render performance | Entity model, module architecture, config schema |
| Design Artifacts | Component tree, state ownership map, hook composition | Entity diagram, module breakdown, permission model, cache strategy |
| Hard Gates | Every component has responsibility, hooks have dependency arrays | Every entity has purpose, modules justified, permissions mapped, cache tagged |
| Error Prevention | Stale closures, render waterfalls, prop drilling | Entity design mistakes, config deployment failures, permission gaps, cache bugs |
| Scale | Simple component (1-2 pages) to complex feature (8-15 pages) | Simple feature (2-3 pages) to complex system (10-15 pages) |
| Review Checkpoints | react-critic at each component | drupal-critic at each architectural phase |

## Installation

Users install drupal-planner by:

```bash
# Option 1: Copy files directly
cp -r .claude/skills/drupal-planner ~/.claude/skills/
cp .claude/agents/drupal-planner.md ~/.claude/agents/

# Option 2: Use claude-skills CLI (when available)
npx claude-skills add https://github.com/zivtech/drupal-planner
```

## Usage

Invoke with:

```
/drupal-planner <feature description>
```

Examples:
- `/drupal-planner Plan a product review system for Drupal 10`
- `/drupal-planner Design a content migration from Drupal 7 to Drupal 11`
- `/drupal-planner Plan the permission model for a multi-tenant SaaS platform`
- `/drupal-planner Fix the entity relationship design found in the drupal-critic review`

## Test Coverage

The plan template (in SKILL.md and agent prompt) includes:
- Entity design with field cardinality and relationships
- Permission model with role→permission mapping
- Cache strategy with tags, contexts, max-age
- Migration strategy with idempotency and rollback
- Implementation tasks with TDD and review checkpoints

## Metrics

- **SKILL.md**: 584 lines (comprehensive orchestration + full 10-phase protocol)
- **Agent prompt**: 458 lines (comprehensive agent with full protocol + failure modes + examples)
- **CLAUDE.md**: 74 lines (repo documentation)
- **Total**: 1,116 lines of prompt-only specification

All files follow the patterns established by harsh-critic and react-planner.
