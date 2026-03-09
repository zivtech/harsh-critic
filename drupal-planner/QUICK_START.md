# drupal-planner Quick Start

## Installation

```bash
# Copy to your Claude Code skills directory
cp -r .claude/skills/drupal-planner ~/.claude/skills/
cp .claude/agents/drupal-planner.md ~/.claude/agents/
```

## Usage

```
/drupal-planner <feature description>
```

## The 10-Phase Protocol

drupal-planner designs Drupal implementations through these phases:

| Phase | Focus | Key Output |
|-------|-------|-----------|
| 1 | Scope & Context | Feature definition, Drupal version, constraints |
| 2 | Existing Architecture | Current entities, modules, hooks, conventions |
| 3 | Data Model Design | Entity types, fields, relationships, diagram |
| 4 | Module Architecture | Custom vs contrib decisions, plugins, services |
| 5 | Configuration Schema | Config items classified (simple/entity/state) |
| 6 | Permission & Access | Roles, permissions, workflow transitions |
| 7 | Cache Strategy | Tags, contexts, max-age, invalidation |
| 8 | Migration & Update | Idempotency, rollback, update sequence |
| 9 | Theme & Render | Templates, preprocess, accessibility |
| 10 | Implementation Tasks | TDD tasks with drupal-critic checkpoints |

## Key Artifacts

A drupal-planner output includes:

1. **Entity Relationship Diagram** — Shows all entity types and how they reference each other
2. **Entity Design Table** — Purpose, fields, cardinality, bundles for each entity
3. **Module Architecture Table** — Responsibilities, contrib decisions, plugins, services
4. **Permission Model** — Role → Permission mapping with rationale
5. **Cache Strategy Table** — Cache tags, contexts, max-age for each cacheable item
6. **Migration Plan** — Source → target mapping, idempotency approach, rollback
7. **Implementation Tasks** — TDD task breakdown with drupal-critic checkpoints

## Hard Gates

drupal-planner enforces these non-negotiable requirements:

- [ ] Every entity type has its purpose defined in one sentence
- [ ] Every entity has its relationships to other entities documented
- [ ] Every custom module justifies why a contrib module doesn't solve the problem
- [ ] Every config item is classified (simple config vs config entity vs state API)
- [ ] Every permission is mapped to a role with rationale
- [ ] Every cacheable item has cache tags, contexts, and max-age specified
- [ ] Every migration has an idempotency and rollback strategy

## Scale of Plans

| Complexity | Examples | Typical Size |
|-----------|----------|-------------|
| **Simple** | Add a field to content type, simple permission model | 2-3 pages |
| **Medium** | New content type with form and basic permissions | 5-8 pages |
| **Complex** | Multi-entity system with migrations and workflow | 10-15 pages |

## Example: Product Review System

### Scope (Phase 1)
Feature: Allow customers to submit reviews of products with ratings
Drupal version: Drupal 10
Constraint: Performance — cache reviews per product, must support 1000+ reviews per product

### Entity Design (Phase 3)
- **ProductReview** (content): user-created reviews with product ref, rating, comment, status
- **ProductReviewType** (config): admin-defined review type settings

### Permission Model (Phase 6)
- Anonymous: view published only
- Authenticated: view all, create own
- Moderator: view all, approve/delete
- Admin: administer

### Cache Strategy (Phase 7)
- ProductReview view: tags=[productreview:ID, product:PARENT_ID], contexts=[user.permissions], max-age=3600
- ProductReview list: tags=[productreview_list, product:PARENT_ID], contexts=[user], max-age=1800

### Implementation Task 1
- Create ProductReview entity with base fields
- Write Kernel test for entity creation and relationships
- drupal-critic checkpoint: verify entity relationships and permission hooks

## Companion Skills

Use these skills alongside drupal-planner:

- **brainstorming**: Explore multiple architecture options before committing
- **code-archaeology**: Understand existing Drupal modules before planning changes
- **drupal-critic**: Harsh review of implementation at each checkpoint
- **drupal-coding-standards**: Drupal coding standards compliance

## Failure Modes Prevented

drupal-planner prevents these common Drupal mistakes:

1. **Vague entity design** → Clearly documented entity relationships and field cardinality
2. **Config/state confusion** → Every config item classified and placed correctly
3. **Missing permissions** → Role → permission mapping with explicit rationale
4. **No cache tags** → Every cacheable item tagged for invalidation
5. **Non-idempotent migrations** → Migrations designed as state machines with rollback
6. **Contrib avoidance** → Justify every custom module against contrib alternatives
7. **Unclear relationships** → Entity diagram shows all references clearly

## Tips

- Start with **Phase 3 (Data Model)** — entity relationships are foundational
- Make **Phase 6 (Permissions)** explicit — permission bugs are expensive
- Specify **Phase 7 (Cache)** tags upfront — cache invalidation is hard to retrofit
- Document **Phase 4 (Module Architecture)** — justify every custom module
- Use **drupal-critic checkpoints** at each implementation task for verification

## File Locations

| File | Purpose |
|------|---------|
| `/sessions/gallant-determined-mendel/mnt/harsh-critic/drupal-planner/CLAUDE.md` | Repository documentation |
| `/sessions/gallant-determined-mendel/mnt/harsh-critic/drupal-planner/.claude/skills/drupal-planner/SKILL.md` | Skill definition |
| `/sessions/gallant-determined-mendel/mnt/harsh-critic/drupal-planner/.claude/agents/drupal-planner.md` | Agent prompt |
