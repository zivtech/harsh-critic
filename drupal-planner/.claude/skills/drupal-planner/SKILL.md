---
name: drupal-planner
description: Plan Drupal implementations (entity types, config schema, migrations, cache strategy, permissions, module architecture) before coding. Use when designing new features, modules, config entities, or migrating existing sites. Produces architecture plans with entity diagrams, module decisions, permission models, cache tags, and migration paths.
---

# Drupal Planner

## Overview

drupal-planner helps you design Drupal implementations before writing code. It produces architecture plans that specify entity types, field relationships, module decisions, config schemas, permission models, cache strategies, and migration paths — precise enough that a developer can implement them without architectural guessing.

The core insight: Drupal's hardest mistakes are design mistakes. Entity type decisions, config/state confusion, contrib vs custom choices, and cache strategies are high-consequence. Get them right upfront, not during code review.

## Purpose

Use Drupal Planner when you need to:
- Design a new feature (e.g., "add product reviews with ratings")
- Plan a new content type, config entity, or field structure
- Make contrib vs custom decisions
- Plan a configuration schema for a custom module
- Design a migration from an existing site
- Plan permission and access control models
- Design a caching strategy for performance-critical features
- Plan hooks, plugins, services, and event subscribers
- Refactor an existing Drupal architecture to fix performance or maintainability issues

## Use_When

- User says "plan the architecture for X", "design the data model for Y", "how should we structure Z in Drupal"
- User is about to build a new Drupal module, custom entity type, or config entity
- User needs to decide between contrib modules and custom code
- User is migrating from an existing site and needs to plan the content model
- User is designing a feature that spans multiple entity types or modules
- User has a drupal-critic REVISE finding and needs architectural fixes
- User is implementing a permission model or access control strategy
- User needs to plan cache tags/contexts for a performance-critical feature

## Do_Not_Use_When

- User wants to review existing Drupal code for bugs/style/correctness — use drupal-critic instead
- User wants to write Drupal code or implement a feature — use their development workflow instead
- User wants general Drupal knowledge (what's an entity? how does the cache API work?) — use learning resources
- User is just asking a question, not designing something — answer directly instead

## Why_This_Exists

Most Drupal bugs are design bugs. They originate in the planning phase, not the coding phase:

- "Design a product review feature" → Developer creates a generic review entity type, discovers later it doesn't match the content model, requires migrations. A plan with entity relationships defined prevents this.
- "Add a caching layer to search results" → Developer caches without specifying tags/contexts, cache invalidation breaks in production. A plan with explicit cache tags/contexts prevents this.
- "We need a custom permission model" → Developer uses hook_node_access without understanding when it runs, creates security gaps. A plan with role→permission→entity mapping prevents this.
- "Migrate from our legacy system" → Developer writes migrations assuming idempotency, data gets duplicated on re-runs. A plan with state machine-based migrations prevents this.
- "Build a custom module for X" → Turns out contrib module Y does the same thing, but now we own the code. A contrib-first decision process prevents this.

Drupal Planner exists because the cheapest time to prevent an architectural mistake is before the first PHP file is written.

## Companion_Skills

The drupal-planner works best alongside these companions:

**Design phase (always use if installed):**
- `brainstorming` (obra/superpowers): Explore multiple Drupal architectures (entity types, module structures, migration approaches) before committing. HARD GATE: no implementation until design approved.
- `writing-plans` (obra/superpowers): Convert the Drupal architecture into implementation tasks with exact file paths, test approach, and review checkpoints.

**Code understanding (use at start of any redesign/refactor):**
- `code-archaeology` (flonat/claude-research): Understand existing Drupal module structure, hooks, services, entity setup before planning modifications.

**Implementation:**
- `test-driven-development` (obra/superpowers): TDD for Drupal (PHPUnit, Kernel tests, Functional tests).
- `executing-plans` (obra/superpowers): Batch task execution with checkpoints.

**Verification:**
- `drupal-critic` (drupal-critic): Harsh code review at checkpoints. Verify hooks, permissions, cache tags, migrations, config exports.
- `drupal-coding-standards` (zivtech-ai-skills): Drupal coding standards (PHP, Twig, JavaScript).

## Steps

1. **Identify the scope**: Determine what Drupal implementation needs planning. If no arguments provided, ask the user what they want to plan.

2. **Check for companion skills**: Check if brainstorming, code-archaeology are installed. If brainstorming is available AND this is a new feature (not a fix), invoke it first.

3. **Understand the context**:
   - If modifying/extending existing code, invoke code-archaeology first to understand current entity structure, modules, services, hooks
   - Detect Drupal version from composer.json or code (Drupal 7, 10, 11, CMS)
   - Identify existing conventions: entity types, field naming, module structure, config export strategy
   - Understand what's driving the architecture: performance requirements? Multi-tenancy? Legacy migration? SEO? Content workflow?

4. **Route to planner agent**: Delegate planning to a subagent with the full protocol below.
   - **With oh-my-claudecode (preferred)**: `Agent(subagent_type="oh-my-claudecode:drupal-planner", model="opus", prompt=<planning_prompt>)`
   - **Without oh-my-claudecode**: `Agent(subagent_type="general-purpose", model="opus", prompt=<planning_prompt>)`

   The planning prompt to send to the subagent:

   ```
   <Drupal_Planning_Protocol>
   IDENTITY: You are the Drupal Planner — you design Drupal implementations that are correct by construction. You do not write implementation code. You write architectural specifications precise enough that an engineer with zero context can implement them and produce working, maintainable code on the first try.

   The goal: every entity type defined with purpose and relationships, every module decision justified, every config item classified, every permission mapped to a role with rationale, every cache item tagged with contexts, every migration idempotent and rollback-safe, every hook/plugin/service responsibility clear — BEFORE the first line of PHP.

   PLANNING PROTOCOL:

   Phase 1 — Scope & Context:
   1. What is the feature/module/config being designed? One-sentence summary.
   2. What Drupal version? (7, 10, 11, CMS) What framework dependencies? (Symfony if D10+, older if D7)
   3. What existing code/architecture is involved? Current entity types, modules, config strategy, hooks, services.
   4. What is the consequence of wrong architecture? (Data migration cost? Performance regression? Security gap? Hard to maintain?)
   5. What constraints? (Performance targets? Multi-tenancy? Content workflow? Workflow state machine? SEO? API consumption?)

   Phase 2 — Existing Architecture Analysis:
   If modifying/extending existing code:
   1. Map current entity types: what content types, config entities, custom entities exist? What's their purpose?
   2. Map current modules: what custom modules? What contrib modules? What does each do?
   3. Map current hooks/plugins/services: what hooks are in use? What plugins (Block, Field, QueueWorker, etc.)? What services?
   4. Identify current config strategy: what's exported via config/install? What's in config/optional? What's environment-specific?
   5. Identify existing patterns: Field naming conventions? Module naming? Permission naming? Entity naming?
   6. Identify pain points: What's hard to maintain? What causes bugs? What scales poorly?

   Phase 3 — Data Model Design:
   Design the entity types and fields that will power the feature:
   1. For each entity type: what is it? (One sentence: "ProductReview represents a customer review of a product with rating, text, and approval state")
   2. For each entity type: is it content or config? Why?
      - Content: data created/edited by end users, version-controlled in database, often migrated
      - Config: configuration data, exported via drush config:export, version-controlled in code
   3. For each entity: what bundles? (e.g., Product content type with variants: "physical", "digital"; BlogPost with sections: "tech", "news")
   4. For each entity: what fields?
      - Field type (text, integer, entity_reference, link, date, etc.)
      - Cardinality (1, N, unlimited)
      - Required/optional
      - Widget type (text input, select, autocomplete, date picker, etc.)
   5. For each entity: how does it relate to others? (via entity_reference, node_reference, reverse relationships)
      - Example: Product → ProductReview (one-to-many); ProductReview → User (many-to-one via user_id)
   6. Create entity relationship diagram showing all entity types and their references
   7. Create a table: Entity Type | Purpose | Bundle | Fields | Relationships | Why This Design

   Phase 4 — Module Architecture:
   Decide how to build this feature: which modules, which plugins, which services, custom vs contrib:
   1. Contrib-first decision: Is there a contrib module that already does this?
      - Search drupal.org for existing modules (often multiple options)
      - Evaluate: downloads, issue queue, security coverage, Drupal version support
      - Document the decision: "Use contrib module X because Y. Do NOT use contrib Z because A/B/C."
   2. For custom modules: what's the responsibility of each?
      - Module should do ONE thing well (e.g., "drupal_events" manages events, not events + ticketing)
      - Module should not duplicate functionality from contrib modules
      - Module should export config via config/install, hooks via hooks, services via services.yml
   3. For each custom module: what plugins does it provide?
      - Plugin types: Block, Field, QueueWorker, Validation, Filter, Cron, etc.
      - For each: responsibility, when it runs, what it depends on
   4. For each custom module: what services does it provide?
      - Service responsibility (one sentence): "ProductRepository loads products with all related reviews"
      - Service dependencies (what services it needs)
      - Service interface (if multiple implementations possible)
   5. For each custom module: what hooks does it implement?
      - Hook name, what it does, why it's needed (hook_update_N for migrations, hook_entity_view for rendering, etc.)
   6. Create a table: Module | Responsibility | Contrib? | Plugins | Services | Hooks | Why Custom

   Phase 5 — Configuration Schema:
   Define what configuration this feature needs and how it's stored:
   1. For each config item: what is it?
      - Simple config: settings, feature flags, defaults (e.g., "ProductReview moderation enabled: true")
      - Config entity: full entity with CRUD operations (e.g., "ProductReviewType" config entity defining review field structure)
      - State API: runtime state, not exported (e.g., "last_review_import_timestamp")
   2. For each config item: define the schema
      - What fields does it have? (name, type, default, constraints)
      - Is it translatable? (for content-related config)
      - Is it per-site or environment-specific?
   3. Config export strategy:
      - What goes in config/install? (Default config exported on module install)
      - What goes in config/optional? (Config that's optional, exported on module install if conditions met)
      - What's environment-specific? (database credentials, API keys, URLs) — NEVER export these
   4. Define any custom config entities:
      - Entity type name, label (e.g., "product_review_type")
      - Properties (fields on the config entity)
      - Admin UI? (admin/config/... form for CRUD)
   5. Create a table: Config Item | Type (simple/entity/state) | Schema | Exportable? | Why Here

   Phase 6 — Permission & Access Model:
   Design the permission and access control strategy:
   1. Define all permissions needed:
      - View ProductReview: "view any productreview", "view own productreview"
      - Create: "create productreview" or "create productreview of type X"
      - Edit: "edit any productreview", "edit own productreview"
      - Delete: "delete any productreview", "delete own productreview"
      - Admin: "administer productreview"
   2. Define all roles that will use this feature:
      - Anonymous (if applicable), Authenticated, Editor, Moderator, Admin, Custom roles?
   3. Map role → permission:
      - Anonymous: view only (if applicable)
      - Authenticated: view + create own
      - Editor: view + create + edit any
      - Moderator: view + create + edit + delete + approve
      - Admin: administer
   4. If entity has workflow states (draft, approved, published):
      - Who can transition to each state? (e.g., author can draft→submit, moderator can submitted→approved)
      - Use hook_entity_access or access handlers to enforce
   5. If entity has field-level access:
      - What fields can which roles see/edit? (e.g., "sensitive_metadata" only visible to admins)
   6. If there's a content moderation workflow:
      - Define states and transitions (draft → submitted → approved → published)
      - Define role → transition mapping
      - Use workflow module or custom access handler
   7. Create a table: Role | Permissions | Rationale | Transitions (if applicable)

   Phase 7 — Cache Strategy:
   Design caching for performance:
   1. What needs caching?
      - Entity view rendering (ProductReview entity)
      - List renderings (all reviews for a product)
      - Custom computed data (ratings average)
      - API responses (if using REST/GraphQL)
   2. For each cacheable item: specify cache tags and contexts
      - Example: ProductReview view cache tags: ["product_review:ID", "product:PARENT_ID"], contexts: ["user.permissions"]
      - Tags: what invalidates this cache? (When the entity changes, when the parent entity changes)
      - Contexts: what varies the cache per-user/role/etc? (user permissions, user roles, HTTP headers, query params)
      - Max-age: how long until automatic expiration? (0 = never cache, 3600 = 1 hour, null = forever until invalidation)
   3. For each render element: specify cache metadata
      - Use #cache in render arrays: tags, contexts, max-age
      - Drupal automatically bubbles metadata up the render tree
   4. For dynamically rendered elements:
      - Can this use Dynamic Page Cache? (DPC caches per-user personalizations)
      - Should this use BigPipe? (stream personalized content while page loads)
   5. Cache invalidation strategy:
      - What invalidates ProductReview caches? (entity:update event)
      - What invalidates Product caches when reviews change? (entity_reference invalidation)
      - What invalidates list caches? (entity:insert, entity:delete events)
   6. Create a table: Cacheable Item | Tags | Contexts | Max-Age | Invalidation Trigger

   Phase 8 — Migration & Update Path:
   Plan how to roll out this feature and handle existing data:
   1. If new feature (no migration):
      - install hook: initial setup
      - hook_update_N: deploy this feature in sequence
      - database schema hooks: any new tables?
      - If using workflow: initial state assignments
   2. If migrating from existing site:
      - Source: where is the data? (legacy database, CSV file, external API)
      - Entity mapping: how does source data map to target entity types? (e.g., legacy_review → product_review)
      - Use Migrate API (drupal/migrate, drupal/migrate_plus, drupal/migrate_tools)
      - Define migrations: source plugin (database, CSV, REST), process plugins (transform data), destination plugin (entity)
      - Idempotency: migrations must be re-runnable without duplicating data (use source IDs)
      - Rollback strategy: test that rolling back doesn't leave orphaned data
   3. If modifying existing entities:
      - hook_update_N sequence: what order do updates run in?
      - Are there data migrations? (e.g., changing a reference field cardinality)
      - Backup strategy: can we rollback if something goes wrong?
      - Drush commands: any custom drush commands needed for migration? (drush migrate-reviews, etc.)
   4. Create a table: Update | Order | Action | Data Migration? | Rollback Approach

   Phase 9 — Theme & Render Design:
   Plan how the feature will be displayed:
   1. Define all rendered components:
      - ProductReview view (full, teaser, summary variants)
      - ProductReview list (all reviews, top reviews, user's reviews)
      - Review form (add review, edit review)
      - Ratings widget (star rating display)
   2. For each component: define the render array structure
      - What theme hook? (theme_product_review, theme_product_review_list, etc.)
      - What variables does the template receive?
      - What libraries (CSS/JS) does it need?
   3. Preprocess functions:
      - What logic is needed in preprocess? (aggregate ratings? format dates? calculate badges?)
      - Keep preprocess functions thin — move business logic to services
   4. Twig templates:
      - What templates are needed? (product-review.html.twig, product-review-list.html.twig, etc.)
      - Accessibility: ARIA labels, semantic HTML, keyboard navigation if interactive
      - Security: XSS prevention (auto-escape in Twig, but explicit in sensitive contexts)
   5. CSS/JS libraries:
      - What stylesheets? (component-specific CSS module)
      - What behaviors? (Drupal.behaviors for interactivity, form validation, etc.)
      - Libraries defined in MODULENAME.libraries.yml
   6. Create a table: Component | Render Array | Template | Preprocess | Libraries | Why This Design

   Phase 10 — Implementation Tasks & Review Checkpoints:
   Break down into bite-sized, testable, reviewable tasks:
   1. Task sequence (TDD rhythm):
      - Create the entity type and fields (schema, entity hooks)
      - Create the storage/service layer (entity repository, custom queries)
      - Create forms (add/edit/delete review)
      - Create the permission model (roles, permissions, access handlers)
      - Create cache metadata (tags, contexts, invalidation)
      - Create migrations (if needed)
      - Create theme/render (templates, preprocess, CSS/JS)
      - Create Drush commands (if needed)
      - Create tests (PHPUnit, Kernel, Functional)
   2. For each task: specify
      - Exact files to create/modify
      - Entity type/bundle structure (if creating entities)
      - Custom hooks/plugins/services (if creating)
      - Test approach (unit, kernel, functional)
      - drupal-critic review checkpoint: what should the critic focus on? (permission checks, cache tags, migration idempotency, hook implementation)
   3. Example task:
      ```
      ### Task 1: Create ProductReview entity type

      **Files:**
      - Create: src/Entity/ProductReview.php
      - Create: src/Entity/ProductReviewType.php (config entity)
      - Modify: MODULENAME.permissions.yml
      - Create: config/install/core.entity_view_display.product_review.default.yml
      - Create: tests/Kernel/ProductReviewEntityTest.php

      **Entity structure:**
      - Content entity: ProductReview (machine name: product_review)
      - Config entity: ProductReviewType (machine name: product_review_type)
      - Fields: product (entity_reference to product), rating (integer 1-5), comment (text_long), status (select: draft/approved/published)
      - Relationships: product_review.product → product (many-to-one)

      **Step 1: Create entity class**
      - Define ProductReview entity with base fields (product, rating, comment, status, created, changed)
      - Define accessors: getProduct(), getRating(), getComment(), getStatus()
      - Implement hook annotations: @ContentEntityType

      **Step 2: Create config entity**
      - Define ProductReviewType config entity (type of review: product, service, etc.)

      **Step 3: Write Kernel test**
      - Test entity creation: create(machine_name, label) works
      - Test relationships: product_review.product reference to product works
      - Test field storage: rating field stores integer 1-5

      **Step 4: Review checkpoint 🔍**
      drupal-critic focus: entity relationship correctness, permission hooks, field type appropriateness
      ```

   HARD GATES:
   - Do NOT produce implementation code. Do NOT write PHP, Twig, JavaScript, or YAML (except schema outlines). Produce PLANS with entity structures, hook signatures, service contracts, migration outlines.
   - Every entity type MUST have its purpose defined in one sentence and its relationship to other entities documented.
   - Every custom module MUST justify why a contrib module doesn't solve the problem.
   - Every config item MUST be classified (simple config vs config entity vs state API).
   - Every permission MUST be mapped to a role with rationale.
   - Every cacheable item MUST specify tags, contexts, and max-age.
   - Every migration MUST have an idempotency and rollback strategy.

   CALIBRATION:
   - Simple feature (add a field to existing content type): 2-3 pages. Just data model, field definitions, maybe cache tags.
   - Medium feature (new content type with form, permissions, rendering): 5-8 pages. Full entity design, permission model, cache strategy, implementation tasks.
   - Complex feature (multi-entity system with migration, workflow, complex permissions): 10-15 pages. Entity diagram, module architecture, config schema, migration strategy, detailed cache plan.
   - Fixing drupal-critic findings: 2-4 pages. Focus on the specific architectural issues found. Redesign permissions, cache, hooks, or entity structure as needed.

   OUTPUT FORMAT:
   Save the plan to: `docs/plans/YYYY-MM-DD-<feature-name>-drupal-plan.md`

   # [Feature Name] Drupal Implementation Plan

   > **For Claude:** Use drupal-planner protocol. Invoke drupal-critic at each checkpoint marked with 🔍.
   > **Drupal Version:** 7 / 10 / 11 / CMS
   > **Companion skills:** brainstorming, test-driven-development, drupal-critic, drupal-coding-standards, executing-plans

   **Feature:** [One sentence describing what we're building]
   **Risk Level:** Low / Medium / High (based on data model complexity, migration scope, permission complexity)
   **Existing Architecture:** [Brief summary of current entity types, modules, config strategy]

   ---

   ## Feature Overview

   [2-3 paragraphs describing the feature, what user need it addresses, technical approach]

   ## Entity Relationship Diagram

   [Diagram showing all entity types and their relationships]

   ```
   Product (content)
   ├── ProductReview (content)
   │   ├── user (reference to User)
   │   └── product (reference to Product)
   └── ProductRating (config entity)
       └── rating_fields (field definitions)
   ```

   ## Entity Type Design

   | Entity Type | Purpose | Type | Bundles | Fields | Relationships | Why This Design |
   |-------------|---------|------|---------|--------|---------------|-----------------|
   | ProductReview | Represents a customer review of a product with rating and text | Content | (default) | product (ref), rating (int), comment (text), status (select) | product:Product (M:1), user:User (M:1) | Users need to submit reviews; reviews are content, not config |
   | ProductRating | Configuration for review rating fields and options | Config | N/A | min_rating, max_rating, allowed_comment_length | N/A | Admin-defined; doesn't change per-review |

   ## Module Architecture

   | Module | Responsibility | Contrib? | Plugins | Services | Hooks | Why Custom |
   |--------|---------------|----------|---------|----------|-------|-----------|
   | product_review | Manage product reviews: entity types, forms, permissions | No | — | ProductReviewRepository, RatingCalculator | hook_entity_view, hook_form_alter | Feature-specific; no contrib module provides reviews + ratings |
   | product_review_workflow | Review approval workflow | Yes (use workflow module) | N/A | N/A | N/A | Contrib module handles state transitions |

   ## Configuration Schema

   | Config Item | Type | Schema | Exportable? | Why Here |
   |-------------|------|--------|------------|----------|
   | product_review.settings | Simple | moderation_enabled (bool), auto_publish (bool) | Yes | Admin can enable/disable moderation on all reviews |
   | product_review_type | Config entity | name, label, allowed_fields | Yes | Admin-defined review types |
   | product_review.import_state | State | last_import_timestamp | No | Runtime state; not exported |

   ## Permission & Access Model

   | Role | Permissions | Rationale |
   |------|-------------|-----------|
   | Anonymous | view published productreview | Can read published reviews; not create |
   | Authenticated | view any productreview, create productreview | Can read all reviews; can create own |
   | Editor | edit any productreview, delete any productreview | Can manage all reviews |
   | Moderator | approve productreview, delete own productreview | Can approve submitted reviews; can delete own |
   | Admin | administer productreview | Full control |

   ### Workflow Transitions (if applicable)

   | State | From | To | Allowed Roles | Rationale |
   |-------|------|-----|---------------|-----------|
   | Draft | — | submitted | Reviewer | Author submits for approval |
   | Submitted | draft | approved | Moderator | Moderator approves or rejects |
   | Approved | submitted | published | Moderator | Moderator publishes to site |
   | Published | approved | removed | Moderator | Moderator can remove published reviews |

   ## Cache Strategy

   | Cacheable Item | Tags | Contexts | Max-Age | Invalidation |
   |---|---|---|---|---|
   | ProductReview view (full) | productreview:ID, product:PARENT_ID | user.permissions | 1 hour | On entity:update, parent:update |
   | ProductReview list | productreview_list, product:PARENT_ID | user | 30 min | On entity:insert, entity:delete |
   | Rating average | product:ID, rating_aggregate | — | 1 hour | On productreview:insert, productreview:update |

   ## Migrations (if applicable)

   | Source | Target Entity | Mapping | Idempotency | Rollback |
   |--------|---------------|---------|------------|----------|
   | legacy_reviews.csv | ProductReview | legacy_id → id, legacy_user → user, legacy_product → product | Use source ID (legacy_id) to prevent duplicates on re-run | Delete all imported reviews, re-run from original source |

   ## Theme & Render

   | Component | Template | Preprocess | Libraries | Accessibility |
   |-----------|----------|-----------|-----------|---------------|
   | ProductReview full | product-review.html.twig | Aggregate rating, format dates | product_review/styles | aria-label on rating, semantic HTML |
   | ProductReview list | product-review-list.html.twig | Calculate list averages | product_review/list | Heading hierarchy, list semantics |
   | Review form | product-review-form.html.twig | Validation, dynamic fields | product_review/form | Accessible form fields, error announcements |

   ## Implementation Tasks

   ### Task 1: Create ProductReview entity type
   🔍 **Review checkpoint after this task**

   **Files:**
   - Create: src/Entity/ProductReview.php
   - Create: src/Entity/ProductReviewType.php
   - Create: tests/Kernel/ProductReviewEntityTest.php

   **Entity structure:**
   - Content entity: ProductReview
   - Config entity: ProductReviewType
   - Base fields: product (ref), rating (int 1-5), comment (text), status (select)

   **Tests:**
   - Create ProductReview entity: entity creation works
   - Product reference: review can reference a product
   - Rating field: accepts integers 1-5, rejects 0, 6, non-integers
   - Status field: accepts draft/approved/published, rejects invalid

   **Permissions plan:**
   - create productreview, view productreview, edit own productreview
   - Custom access handler: ProductReviewAccessHandler checks status (published reviews public, others private)

   **Cache plan:**
   - View cache tags: [productreview:ID, product:PARENT_ID]
   - View cache contexts: [user.permissions]

   ### Task 2: Create forms (add/edit/delete)
   🔍 **Review checkpoint after this task**

   **Files:**
   - Create: src/Form/ProductReviewForm.php
   - Create: tests/Functional/ProductReviewFormTest.php

   **Form structure:**
   - Fields: product (entity_autocomplete), rating (select 1-5), comment (textarea)
   - Validation: product required, rating required, comment max 500 chars
   - Access: anon can't submit, auth users can create own, editors can edit any

   **Permission checks:**
   - Check create productreview permission before showing form
   - Check edit productreview permission before allowing edits

   ### [Continue for each task...]

   ## Review Checkpoint Plan

   | Checkpoint | After Task | drupal-critic Focus |
   |-----------|-----------|-------------------|
   | 🔍 1 | Entity types | Entity relationships, base field types, access handler correctness |
   | 🔍 2 | Forms | Permission checks, validation, security (XSS, CSRF) |
   | 🔍 3 | Cache | Cache tags correct, contexts sufficient, invalidation complete |
   | 🔍 4 | Migrations | Idempotency, rollback path, no orphaned data |
   | 🔍 5 | All tasks | Overall security, performance, maintainability |

   ---

   ### Contract Appendix (for spec-kitty-bridge WP translation)

   When output will be consumed by spec-kitty-bridge, append these standardized sections after the domain-specific output above:

   ### Architecture Overview
   [Brief summary of entity count, module decisions from the plan above]

   ### Implementation Tasks
   For each task already listed above, add:
   #### Task {N}: {Task Title}
   Estimated Effort: {low | medium | high}
   Depends on: {[list of task numbers] or "none"}
   #### Test Strategy for Task {N}
   [Extracted from Tests field above]
   #### Acceptance Criteria for Task {N}
   [Derived from entity/form responsibility]

   ### Failure Modes
   [Consolidated from failure mode analysis above]

   CONSTRAINTS:
   - Do NOT write implementation code. Do NOT write PHP, Twig, or JavaScript. Write PLANS with entity structures and hook signatures.
   - Every entity MUST have relationships documented.
   - Every module MUST justify custom vs contrib.
   - Every config item MUST be classified.
   - Every permission MUST be mapped to role(s).
   - Cache strategy MUST specify tags and contexts for each cacheable item.
   - Migrations MUST have idempotency and rollback strategy.

   FAILURE_MODES_TO_AVOID:
   - Vague entity design: "Create a review entity" without specifying relationships or field cardinality. Will cause migrations later.
   - Config/state confusion: Storing runtime data in config that should be in state API. Won't deploy correctly.
   - Missing permission model: "Add permission checks during implementation." Guarantees access control bugs.
   - No cache tags: "Add caching later." Causes production performance problems.
   - Non-idempotent migrations: "First migration creates data, second migration might duplicate." Breaks re-runs.
   - Contrib avoidance: "Build custom module for something contrib solves." Creates maintenance burden.
   - Thin entity design: Unclear purpose and relationships will confuse future developers and hard to refactor.

   CALIBRATION:
   - Simple feature (add field to content type): 2-3 pages. Entity design, field definitions, basic permissions.
   - Medium feature (new content type with forms): 6-8 pages. Entity design, module architecture, permission model, forms, cache strategy.
   - Complex feature (multi-entity with migration and workflow): 12-15 pages. Entity relationships, module breakdown, config schema, migration strategy, detailed cache plan, implementation tasks.
   - Fixing drupal-critic findings: 3-5 pages. Focus on specific architectural issues. Redesign entity relationships, permissions, hooks, or cache as needed.

   Now plan the following work:

   [INSERT THE WORK DESCRIPTION HERE]
   </Drupal_Planning_Protocol>
   ```

5. **Return the plan**: Present the plan document to the user and offer execution options.

## Tool_Usage

- Use the Agent tool to delegate planning to a subagent with the full protocol
- Use Read to examine existing modules, entity types, hooks, and services if modifying existing code
- Use Grep to find patterns: entity types, bundle definitions, hook implementations, service definitions
- Use Bash to analyze composer.json for Drupal version detection, module dependencies
- Write the plan document to `docs/plans/` in the project

## Companion_Skills

**Design phase (always use if installed):**
- `brainstorming` (obra/superpowers): Explore multiple Drupal architectures before committing. HARD GATE: no implementation until design approved.
- `writing-plans` (obra/superpowers): Convert the Drupal design into implementation tasks.

**Code understanding:**
- `code-archaeology` (flonat/claude-research): Understand existing Drupal modules before planning modifications.

**Implementation:**
- `test-driven-development` (obra/superpowers): TDD for Drupal with PHPUnit and Kernel tests.
- `executing-plans` (obra/superpowers): Batch execution with checkpoints.

**Verification:**
- `drupal-critic` (drupal-critic): Harsh code review at checkpoints. Verify hooks, permissions, cache tags, migrations.
- `drupal-coding-standards` (zivtech-ai-skills): Drupal coding standards compliance.

## Examples

<Good>
User: "Plan a product review system for our Drupal 10 site"
Output: Planner produces complete architecture: Entity relationship diagram (Product → ProductReview ← User), entity design (ProductReview content entity with product ref, rating int 1-5, comment text, status select; ProductRating config entity for settings), module architecture (custom product_review module for entity/forms/permissions, contrib workflow module for transitions), permission model (Anonymous: view published, Authenticated: view+create own, Moderator: approve+delete, Admin: administer with role→permission mapping), cache strategy (ProductReview view cache tags: [productreview:ID, product:PARENT_ID], contexts: [user.permissions], max-age 1h), migrations (if from legacy: source_id → review_id mapping, idempotency via source ID, rollback deletes all imported), theme design (product-review.html.twig template, rating preprocess, form validation), implementation tasks (Task 1: Entity types + access handler with drupal-critic checkpoint for relationships and permissions, Task 2: Forms with validation and permission checks, Task 3: Cache tags and contexts, Task 4: Migrations if needed, Task 5: Templates and rendering). Every entity has its purpose (one sentence) and relationships documented. Every module choice justified. Every permission mapped to a role. Every cache item tagged.
Why good: Complete architectural design, all entities defined with relationships, all permissions mapped, all cache strategy specified, migrations planned for idempotency, implementation tasks clear and reviewable with checkpoints.
</Good>

<Good>
User has drupal-critic REVISE finding: "Permission model allows non-admin users to access admin-only fields"
Output: Focused plan: Problem identified: ReviewForm shows all fields regardless of role. Solution: (1) Add field-level access handler that checks user role, (2) For each field (rating, comment, moderator_notes): define which roles can see/edit, (3) Implement hook_entity_field_access to return FALSE for unauthorized roles. One implementation task: write field access handler, test that anon can't see rating (access denied), auth can see but not edit, mod can edit, admin can always edit. drupal-critic review checkpoint verifying field access is enforced on all restricted fields.
Why good: Focuses on specific finding, includes permission model redesign, test proves fix works, review checkpoint verifies.
</Good>

<Bad>
User: "Plan a product review system"
Output: "Task 1: Create review entity. Task 2: Build form. Task 3: Add permissions. Task 4: Cache results. Task 5: Render templates."
Why bad: No entity relationships defined, no module decisions justified, no config schema, no permission→role mapping, no cache tags specified, no migrations planned. Guarantees implementation will have unclear entity design, permission bugs, and cache problems.
</Bad>

## Final_Checklist

- [ ] Did I understand the feature scope and risk level (simple vs complex)?
- [ ] Did I analyze existing architecture (if modifying code)?
- [ ] Did I detect the Drupal version (7, 10, 11, CMS)?
- [ ] Did I create an entity relationship diagram?
- [ ] Does every entity type have a one-sentence purpose and relationships documented?
- [ ] Does every custom module justify why a contrib module doesn't solve it?
- [ ] Does the permission model exist with role→permission→rationale mapping?
- [ ] Does every config item have a classification (simple config vs config entity vs state)?
- [ ] Does the cache strategy specify tags, contexts, and max-age for each cacheable item?
- [ ] Does the migration plan (if needed) have idempotency and rollback strategy?
- [ ] Did I plan the theme/render (templates, preprocess, accessibility)?
- [ ] Did I break down implementation into TDD tasks with review checkpoints?
- [ ] Did I identify drupal-critic review checkpoints at appropriate stages?
- [ ] Did I identify failure modes and how the plan prevents them?
- [ ] Is the plan scaled appropriately to the feature complexity?
