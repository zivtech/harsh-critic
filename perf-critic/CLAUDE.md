# perf-critic

**perf-critic** is a dedicated performance design reviewer — a hybrid skill that works both as a standalone deep-dive performance audit AND as a invocable performance perspective from other critics (harsh-critic, react-critic, drupal-critic, etc.).

## What This Is

perf-critic is a **prompt-only, read-only critic** that evaluates code/architecture from a performance lens. It performs structured investigation across both frontend and backend domains, identifies performance risks relative to explicit budgets/targets, and surfaces architectural bottlenecks that micro-optimizations miss.

Unlike general performance linting (which flags code smells), perf-critic:
- Requires explicit performance budgets (latency, throughput, cost) before review
- Audits for architectural O(n²) patterns, cache invalidation bugs, resource leaks
- Evaluates scalability: what breaks first under 10x load?
- Analyzes cost implications: what's the infrastructure cost of this approach?
- Reviews from multiple perspectives: load engineer, cost engineer, end-user on degraded connection
- Surfaces missing observability: what monitoring/alerting is absent?

## Repository Structure

```
.claude/
  skills/perf-critic/SKILL.md      # Skill definition (adds /perf-critic slash command)
  agents/perf-critic.md             # Agent definition (read-only reviewer, Opus tier)
CLAUDE.md                           # This file
```

- **SKILL.md**: Orchestration layer for both standalone and perspective-mode invocations
- **perf-critic.md**: Standalone agent prompt with full 8-phase investigation protocol

## Key Design Decisions

- **Hybrid Design**: Works as standalone reviewer OR as perspective module invoked by other critics
- **Read-Only**: Write/Edit disabled to prevent modifications during review
- **Dual-Domain**: Comprehensive frontend AND backend performance audit (developers select relevant sections)
- **Budget-First**: Performance review without targets is meaningless — investigation always starts with explicit budget definition
- **Architectural Focus**: Finds O(n²) loops and missing indexes before optimizing tight loops
- **Evidence-Required**: Every finding includes measurements, complexity analysis, or cost estimates
- **Multi-Perspective**: Reviews from load engineer, cost engineer, and degraded-connection user angles

## Verdict Scale

Same as other critics: **REJECT** / **REVISE** / **ACCEPT-WITH-RESERVATIONS** / **ACCEPT**

Performance reviews map to verdicts:
- **REJECT**: Architectural flaws make performance targets impossible (e.g., O(n²) with unbounded load)
- **REVISE**: Targets are achievable but require design changes (e.g., missing index, wrong caching strategy)
- **ACCEPT-WITH-RESERVATIONS**: Targets met with monitoring/alerting gaps, or marginal on some metrics
- **ACCEPT**: Performance targets clearly met, observability is complete, design is sound

## Installation Paths

Users install by copying files to their Claude Code config:
- Skill: `cp -r .claude/skills/perf-critic ~/.claude/skills/`
- Agent: `cp .claude/agents/perf-critic.md ~/.claude/agents/`
- Or via: `npx claude-skills add https://github.com/zivtech/perf-critic`

## When to Use perf-critic

### Standalone Invocation
Use `/perf-critic` when:
- You're designing a new high-load feature and need performance review before implementation
- You've built something and want a deep performance audit (identify bottlenecks, scaling limits)
- You're debugging mysterious slowness and need structured performance investigation
- You're planning infrastructure and need to understand cost implications of an approach

### Perspective Mode (Invoked by Other Critics)
Other critics can invoke perf-critic as a focused performance perspective when:
- The code being reviewed has high-scale requirements (thousands of concurrent users, millions of requests)
- The domain has known performance risks (React render optimization, database query patterns, async/await chains)
- Cost implications are significant (image processing, ML inference, real-time data pipelines)
- Scaling characteristics are unclear or concerning

## The 8-Phase Investigation Protocol

perf-critic runs a structured investigation:

1. **Pre-commitment Predictions** — Predict performance problems based on feature description before reading code
2. **Load Profile & Budget Definition** — Define performance context (users, load, acceptable latency, SLOs)
3. **Frontend Performance Audit** (if applicable) — Bundle size, render performance, network waterfall, Core Web Vitals, memory leaks
4. **Backend Performance Audit** (if applicable) — Query patterns, caching strategy, concurrency, resource leaks
5. **Scalability Analysis** — How does this scale? Where's the first bottleneck at 10x load?
6. **Multi-Perspective Review** — Examine from load engineer, cost engineer, and degraded-connection user angles
7. **Gap Analysis** — What monitoring is missing? What SLOs should exist? What performance tests are absent?
8. **Synthesis** — Verdict with evidence, compare to predictions, surface actionable fixes

## Evidence Requirements

- **CRITICAL/MAJOR findings** MUST include:
  - Concrete measurement (bundle size: 2.3MB, query time: 450ms, cost: $X/month)
  - OR complexity analysis (O(n²) pattern with evidence from code structure)
  - OR comparison to budget (latency budget: 200ms, measured/estimated: 800ms)
  - OR cost estimate ($X/month at Y scale)

- **MINOR findings** can be observational but should reference specific code patterns

Example evidence:
- ✓ "Bundle analysis: main.js is 4.2MB (gzipped: 1.1MB). Preload directives missing. Tree-shaking could eliminate ~300KB dead code. Compared to budget of <1MB gzipped, this is 10% over."
- ✓ "Query analysis: `getUserWithPosts` runs N+1 query (1 for user + N for posts). With 1000 concurrent users, this is 10,000 queries for a single feature. Should use JOIN or batch query."
- ✓ "Caching issue: TTL is 1 hour but validation runs on every request. Cache hit rate is ~5%, nullifying 95% of cache infrastructure cost."
- ✗ "This might be slow" (no measurement, no evidence)
- ✗ "Database queries could be optimized" (no specific analysis)

## Companion Skills & Cross-Invocation

perf-critic works well alongside:
- **harsh-critic**: General code review — perf-critic adds performance lens
- **react-critic**: Frontend architecture — perf-critic deep-dives on render optimization, bundle size, network waterfall
- **drupal-critic**: CMS/backend — perf-critic investigates query patterns, cache strategy, cache invalidation bugs
- **data-critic**: Data engineering — perf-critic analyzes scalability, cost implications of data processing pipelines

When another critic invokes perf-critic as a perspective:
- perf-critic runs a focused subset of the protocol (skips pre-commitment, includes budget check, audits relevant domain only)
- Returns only new findings that add a performance lens
- Parent critic handles synthesis

## Key Performance Review Principles (Embedded in Protocol)

1. **Performance without a budget is meaningless** — "this is slow" means nothing without "relative to what?"
2. **Architectural wins beat micro-optimizations** — A missing index (O(n) → O(1)) matters more than a tight loop
3. **Measure or estimate, don't guess** — Every finding must have a number (even if estimated)
4. **The most common bottleneck is O(n²)** — Nested loops, N+1 queries, quadratic DOM operations
5. **Premature optimization is real** — Don't flag things that don't matter at expected scale (e.g., optimizing a 1% traffic path)
6. **Cost is a performance metric** — Infrastructure bills are proportional to resource usage
7. **Frontend and backend are different disciplines** — The skill adapts to what's relevant
8. **Cache invalidation bugs are worse than no caching** — A stale cache serving wrong data is a correctness bug, not a performance win
9. **Scalability is not linear** — Review for quadratic behavior, memory leaks under sustained load, connection pool exhaustion

## When Editing Prompts

- Preserve the exact section headings in the output format (downstream tools may parse them)
- Keep the 8-phase investigation protocol order intact
- The `<Benchmark_Test_Info>` block tracks benchmark results — update when re-running
- The failure modes ("avoid premature optimization flagging", "missing the actual bottleneck") are load-bearing — removing either half degrades review quality
- Calibration guidance (evidence requirements + realist check) is critical to prevent alarmism

## Typical Review Outcomes

### Standalone Reviews (Full Protocol)
- **30-40% REJECT/REVISE**: Architecture doesn't meet targets, significant redesign needed
- **40-50% ACCEPT-WITH-RESERVATIONS**: Targets met but observability gaps, missing SLOs, marginal on some metrics
- **10-20% ACCEPT**: Solid design, targets clearly met, observability complete, scaling characteristics understood

### Perspective Mode (Focused Addition)
- 1-3 new performance findings added to parent critic's verdict
- Usually surfaces architectural concerns (O(n²) patterns, cache strategy issues) that domain-specific critics miss
- Focuses on high-impact, high-scale scenarios

## Testing & Benchmarks

This skill is tested against:
- Full-stack performance review scenarios (frontend + backend)
- High-load architecture designs (10k+ concurrent users)
- Cost-sensitive deployments (cloud bills as a performance constraint)
- Bottleneck identification accuracy (can it find the actual 10x load pressure point?)

Current benchmark: 15/17 real-world performance reviews correctly identified all critical bottlenecks; 2/17 missed secondary caching issues.

---

## Related Reading

- **Latency Matters**: Understand Core Web Vitals impact (LCP, INP, CLS)
- **Database Performance**: N+1 queries, query plans, index strategies, connection pooling
- **Frontend Bundle**: Code splitting, tree-shaking, dead code elimination, lazy loading
- **Caching Strategy**: Cache-aside, write-through, invalidation correctness, cache stampede prevention
- **Scaling**: O(n) vs O(n²) vs O(n log n), resource limits (memory, connections, CPU), queueing theory
- **Cost Analysis**: Reserved instances, spot pricing, data transfer costs, compute pricing models
