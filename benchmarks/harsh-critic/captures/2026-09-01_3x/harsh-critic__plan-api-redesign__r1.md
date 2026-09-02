# VERDICT: REJECT

**Overall Assessment**: This plan mistakes a technology preference for a problem diagnosis. The stated problem — mobile clients making 8-12 calls per screen and over-fetching — is real and worth solving, but the plan jumps straight to a full 47-endpoint GraphQL rewrite justified by a conference keynote, without measuring the baseline it promises to improve by 40%, without evaluating cheaper alternatives that address the same problem, and without reconciling three internal contradictions (caching vs. auth, proxy vs. deprecation, payload-size vs. round-trips). The individual steps are competently sketched; the foundation they rest on is not.

**Review mode**: Escalated to **ADVERSARIAL** during Phase 2. Trigger: 4 CRITICAL findings plus a systemic pattern — the two most consequential decisions (choose GraphQL; choose directive auth) are both justified by aesthetics/authority rather than analysis. When the decision-making method is unsound, every downstream step inherits the risk, so I widened scope to the success metrics and their internal consistency.

**Verification limitation**: The session context reports this as a greenfield/empty directory, yet the plan describes migrating an *existing* 47-endpoint REST API with a service layer and OAuth2 middleware. I could not verify any codebase claim (service-layer existence, endpoint inventory, auth middleware) because no source was accessible. This does not invalidate the plan review, but it means several load-bearing assumptions are unverifiable and must be treated as FRAGILE (see What's Missing).

**Pre-commitment Predictions** (made before detailed analysis):
1. Caching regression — GraphQL-over-POST breaks HTTP/CDN caching REST gets for free. → **Confirmed, and worse than predicted:** the plan gestures at CDN caching but never reconciles it with POST semantics or per-user field auth.
2. Field-level auth harder than it looks. → **Confirmed** — directive auth can't express instance/relationship-level authz.
3. The 40% metric is unsubstantiated. → **Confirmed** — no baseline measurement step exists.
4. Decision justification is weak (appeal to authority). → **Confirmed, verbatim** ("CTO attended a conference").
5. The REST-to-GraphQL proxy undermines the deprecation goal. → **Confirmed** — structural contradiction with the "REST <5% by month 4" metric.

---

## Critical Findings (block execution)

**C1 — The core approach was selected by authority, not by comparing it against alternatives that directly solve the stated problem.**
- Evidence: `"We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority."` The thesis further claims REST `"cannot provide [client control over response shape] without building dozens of new specialized endpoints."`
- Confidence: HIGH
- Why this matters: That premise is false. JSON:API sparse fieldsets (`?fields[project]=name,budget`) and compound documents (`?include=tasks,comments`) give clients control over response shape and solve both over-fetching AND the 8-12-call under-fetching problem — within REST, preserving HTTP caching, with zero client rewrite for existing integrations. A Backend-for-Frontend (a handful of screen-shaped aggregation endpoints) collapses the mobile call count even more cheaply. The evidence the plan cites (over-fetching, mobile call count, enterprise flexible querying) is **consistent with all three approaches** — it is non-diagnostic and does not rule out the cheaper two. This is a false dichotomy resting on appeal to authority and survivorship bias (those companies adopted GraphQL *and still maintain REST*; the plan cites adopters, not the population including regretters).
- Fix: Before committing, produce a one-page decision matrix comparing GraphQL vs. JSON:API/sparse-fieldsets vs. BFF against the *actual* problem statements (mobile call count, over-fetching, enterprise ad-hoc querying), with cost, caching impact, and client-migration burden. If GraphQL still wins, the decision is now defensible. If enterprise ad-hoc querying is the only true GraphQL differentiator, consider adding GraphQL as an *additive* capability rather than a full REST replacement.

**C2 — The plan will likely make the very latency it exists to fix *worse*, because it destroys edge caching and never reconciles caching with field-level auth.**
- Evidence: Step 4 says `"Enable response caching at the CDN layer using Cache-Control headers derived from query complexity and data volatility."` GraphQL requests are POST by default (not CDN-cacheable), and Step 3 introduces per-user field-level auth (`@auth(requires: ADMIN)`), which fragments any cache per-user and per-permission-set, collapsing hit rates.
- Confidence: HIGH
- Why this matters: The Background justifies the entire project by mobile "latency and battery drain." REST endpoints today are almost certainly GET-cacheable at the CDN. Replacing cache-friendly GETs with uncached POSTs, then trying to bolt caching back on via an undefined "derived from complexity and volatility" algorithm, is a high risk of *net latency regression* on read-heavy paths. If that happens, the project's core rationale is invalidated. No mitigation is specified.
- Fix: Make caching a first-class design constraint, not a Step 4 afterthought. Decide up front: persisted/allowlisted queries over GET (so the CDN can cache), an explicit cache-key strategy that accounts for auth scope, and a measured comparison of edge-cache hit rates before vs. after. Specify the "derived from complexity and volatility" algorithm concretely or delete the claim — as written it is a research problem, not a task.

**C3 — The REST-to-GraphQL proxy structurally prevents the deprecation success metric from ever being met.**
- Evidence: Step 5 builds a proxy that lets `"existing integrations to work without code changes."` Success Metrics require `"REST v1 traffic <5% by month 4"` and Step 6 issues `"410 Gone for unmigrated clients"` at month 5-6.
- Confidence: HIGH
- Why this matters: If the proxy transparently translates REST calls to GraphQL, clients have **zero incentive to migrate** — their code keeps working. The proxy's success (transparent compatibility) directly guarantees the failure of "REST traffic <5%." Backcasting from the goal: for REST traffic to drop below 5%, clients must migrate; the proxy removes the forcing function that would make them. You will reach month 4 with the proxy carrying most of the traffic, the metric unmet, and a hard 410 cutoff looming over clients who were never pushed to move.
- Fix: Choose one strategy and make it coherent. Either (a) the proxy is a *temporary bridge* with its own aggressive, separately-tracked sunset and active client-migration outreach, and REST-traffic metrics count proxy traffic as un-migrated; or (b) drop the transparent proxy and invest in migration tooling + guides that require deliberate client action. You cannot have transparent compatibility AND rapid voluntary migration.

**C4 — The hard "410 Gone at month 5-6" cutoff has no rollback path and creates direct contract/SLA exposure with enterprise customers.**
- Evidence: Step 6: `"Month 5-6: REST v1 returns 410 Gone for unmigrated clients."` The plan cites `"Several enterprise customers"` as stakeholders but specifies no per-client migration verification, no exception mechanism, and no recovery path.
- Confidence: HIGH
- Why this matters: Enterprise integrations move on quarterly (or slower) release cycles. A hard 410 at month 5-6 will almost certainly catch at least one enterprise customer mid-cycle, breaking their integration and creating an SLA/contract incident that escalates to executives. The realistic outcome is an emergency rollback of the sunset — at which point you maintain REST v1 + GraphQL + the proxy indefinitely, tripling maintenance burden (the exact opposite of the goal). There is no documented rollback, no "which clients are unmigrated" instrumentation, and no staged/allowlisted cutover.
- Realist Check: This survives at CRITICAL. It involves financial/contractual impact (per calibration rules, financial-impact findings are not downgraded), the detection-to-damage window is instant (clients break at cutover), and no compensating control exists in the plan.
- Fix: Replace the calendar-driven hard cutoff with a metrics-driven one: instrument per-client REST usage, require explicit sign-off or observed zero-traffic per enterprise client before their 410 flips, provide a per-client extension mechanism, and document the rollback (flip the 410 back to proxy-forwarding) with a named owner and runbook.

---

## Major Findings (cause significant rework)

**M1 — The 40% payload-reduction metric is unmeasurable as scoped — no baseline step exists.**
- Evidence: Success criteria require `"API response payload sizes reduced by 40% on average,"` but no step measures current per-endpoint payload sizes. "On average" across what distribution of calls is also undefined.
- Confidence: HIGH
- Why this matters: You cannot prove a 40% reduction against an unmeasured baseline, and "average" is undefined (weighted by call volume? by endpoint? by screen?). The metric is either un-gradeable or will be gamed post-hoc.
- Fix: Add a Step 0 that captures baseline payload distributions (weighted by real traffic) per endpoint/screen, and define "40% average" precisely (traffic-weighted mean of payload bytes per logical operation).

**M2 — Two success metrics actively conflict: minimizing payload size vs. minimizing round-trips.**
- Evidence: Success criteria pair `"payload size reduced by 40%"` with the Background goal of eliminating `"8-12 REST calls to assemble a single screen."` Step 1 mandates `"Relay-style cursor connections."`
- Confidence: MEDIUM-HIGH
- Why this matters: Relay cursor pagination requires multiple sequential round-trips to walk deep lists, and schemas optimized for small payloads tend to fragment data across more resolver fields/queries. Optimizing hard for payload size can *increase* round-trips for some clients, contradicting the mobile-call-reduction goal. The plan never acknowledges the tension or which metric wins when they conflict.
- Fix: State the priority ordering explicitly (latency/round-trips for mobile screens usually dominates payload bytes) and design the schema for screen-shaped fetches, not just minimal fields.

**M3 — Directive-based field auth cannot express instance/relationship-level authorization, which is the majority of real authz.**
- Evidence: Step 3 chooses `@auth(requires: ADMIN)` and rejects resolver-level checks because `"directives keep auth logic visible in the schema rather than buried in code."`
- Confidence: HIGH
- Why this matters: A static `@auth(requires: ADMIN)` directive expresses *role* but not *relationship*. Real rules like "you may see this Project's budget only if you are an admin **of that Project's org**" depend on the parent object and the requesting user's relationship to it — which a schema-static directive cannot capture. Build the system as specified and you get either over-blocking (legitimate users denied) or, worse, data exposure where instance-level rules were assumed but never enforced. "Visible in the schema" is an aesthetic benefit that does not outweigh the capability gap, and the plan hand-waves the rejection of resolver-level auth.
- Note: This is a *design-level* risk, not a confirmed exploit against existing code (none was accessible), so I am not asserting a proven vulnerability. It nonetheless needs resolution before build.
- Fix: Use directives only for coarse role gates; route instance/relationship-level authorization through a dedicated authz layer invoked in resolvers (or a policy engine). Hand the auth model to `security-threat-model-planner` before implementation.

**M4 — Query complexity analysis (static, budget 1000) does not prevent runtime query explosion, and the budget is an unjustified magic number.**
- Evidence: Step 4: `"Set a complexity budget of 1000 points per query."`
- Confidence: MEDIUM-HIGH
- Why this matters: Static complexity scoring struggles with list-multiplication at runtime (nested connections whose cardinality is unknown until executed), so a query can pass a 1000-point static check and still fan out into a DB-crushing execution — a DoS vector reachable by any *authorized* client, no special privilege needed. The 1000 figure has no derivation; it will be simultaneously too low for legitimate enterprise dashboards and too high to stop abuse.
- Fix: Combine static complexity limits with runtime guards (max nodes returned, depth limits, per-field pagination caps, timeouts, and per-client rate/cost budgets). Derive the budget from measured p99 query costs, not a round number.

**M5 — "Resolvers delegate to existing service layer" assumes a reusable, correctly-shaped service layer that is asserted, not verified — and the 3-dev/4-week estimate covers only resolvers.**
- Evidence: Step 2: `"Resolvers will delegate to existing service layer classes, so business logic is not duplicated. Estimated effort: 3 developers for 4 weeks."`
- Confidence: MEDIUM (unverifiable — see verification limitation)
- Why this matters: If business logic actually lives in REST controllers rather than a clean service layer (common in 3-year-old APIs), "delegate to the service layer" becomes "extract and refactor the service layer first" — a large hidden project. The 4-week estimate is scoped to resolvers only and silently excludes schema design (Step 1), the 47-endpoint→graph mapping, auth wiring (Step 3), the proxy (Step 5, itself multi-week), the migration guide, and testing. The real number is materially larger.
- Fix: Verify the service layer exists and exposes the needed operations before estimating. Re-estimate the whole program (schema, resolvers, auth, proxy, guide, tests, migration outreach) as separate line items, not one 4-week figure.

---

## Minor Findings (suboptimal but functional)

- **m1 — "47 endpoints → 7 types" is likely not a clean mapping.** 47 REST endpoints usually include action/RPC-style routes (bulk ops, export, password reset, state transitions) that don't fold into CRUD on 7 resource types. Step 1's 7-type list may not cover the 47; the endpoint-by-endpoint audit is implied but never a task. (Style/scope note, but worth an explicit mapping step.)
- **m2 — GraphQL returns HTTP 200 with an `errors` array.** Existing client error handling, monitoring, and alerting keyed on HTTP status codes will silently break. Not mentioned anywhere; the proxy (Step 5) inherits this mismatch.
- **m3 — Introspection exposure.** No mention of disabling/controlling introspection in production, a standard hardening step and information-disclosure surface.
- **m4 — "4.0/5.0 satisfaction" is a vanity metric with no current baseline** — you can't tell improvement from a fixed target with no "before" reading.

---

## What's Missing (gaps, unhandled edge cases, unstated assumptions)

- **No baseline measurement phase** for payload size, current mobile call counts, or CDN cache hit rates — yet three success metrics depend on before/after comparison.
- **No caching/auth reconciliation** — per-user field auth vs. shared CDN cache is left unaddressed (see C2).
- **No rollback strategy** anywhere: not for the 410 sunset (C4), not for breaking schema changes between beta and GA, not for the traffic cutover. No feature-flag/canary approach.
- **No per-client migration instrumentation** — "unmigrated clients" is referenced but there's no mechanism to identify them.
- **No error-semantics translation spec** for the proxy — HTTP status codes, headers, partial failures, retry behavior (m2).
- **No schema-versioning/evolution policy** — GraphQL's answer to breaking changes is field deprecation, not versioned endpoints; the plan never states how the schema evolves post-GA.
- **No testing/observability plan** — no contract tests, no per-resolver tracing, no N+1 detection in CI, despite N+1 being the named risk in Step 2.
- **Unverified assumptions** (treat as FRAGILE): service layer exists and is reusable; enterprise customers want *GraphQL specifically* (they asked for "flexible querying," not GraphQL); OAuth2 middleware is reusable at field granularity; 47 endpoints map to 7 types.
- **Persisted-query key management** — Step 4 mentions allowlisted query hashes but not how they're registered, rotated, or reconciled with the CDN cache key.

---

## Ambiguity Risks

- `"all 47 existing REST endpoints have GraphQL equivalents"` → **A**: literal 1:1 query-per-endpoint mapping (defeats GraphQL's flexibility, produces a bad schema). **B**: semantic coverage via a redesigned graph (harder to verify "equivalent," risk of silent gaps). Risk if A chosen: you build a REST-shaped GraphQL API that keeps the over-fetching problem. Risk if B chosen: "equivalent" is unfalsifiable and coverage gaps ship.
- `"410 Gone for unmigrated clients"` → **A**: all REST traffic 410s. **B**: selective per-client 410. B requires client-identification infrastructure that isn't in the plan; A breaks everyone who hasn't migrated at once.
- `"Cache-Control headers derived from query complexity and data volatility"` → no defined algorithm; two engineers will implement two incompatible schemes.

---

## Multi-Perspective Notes

- **Executor**: "Step 4 gives me no algorithm to derive Cache-Control from 'complexity and volatility' — I'll stall. Step 3's `@auth(requires: ADMIN)` doesn't cover owner-based access — I'll either block legit users or leak data. Step 2 assumes a service layer I haven't confirmed exists. I cannot execute several steps without going back for decisions."
- **Stakeholder**: "The primary metric (40% payload reduction) can't be measured (no baseline), two metrics conflict, and one is a vanity number. A BFF or JSON:API might solve my actual mobile problem for a fraction of the cost and risk. Why am I funding a 6-month full replacement?"
- **Skeptic**: "The strongest failure case: caching loss makes mobile latency *worse*, the proxy kills migration incentive so REST never drops below 5%, and the hard 410 breaks an enterprise contract and forces a rollback into permanent triple-maintenance. The GraphQL decision was made from a keynote, not from measuring our own system."

---

## Verdict Justification

**REJECT**, not REVISE. REVISE would imply the core approach is sound and needs editing. Here the foundational decision (full REST→GraphQL replacement) was selected by authority without evaluating alternatives that directly address the stated problem (C1), and the plan contains unresolved contradictions that block its own success criteria (C2 caching vs. rationale; C3 proxy vs. deprecation metric; C4 hard sunset vs. enterprise contracts). These are structural, not cosmetic. Send it back to a planner to (1) measure the baseline, (2) run the GraphQL-vs-JSON:API-vs-BFF decision matrix, and (3) reconcile the caching, auth, and sunset models — before any implementation resources are committed.

**Severity recalibrations**: C4 (hard 410 sunset) was pressure-tested by the Realist Check and *held* at CRITICAL — it carries contract/SLA (financial) exposure with no rollback and an instant damage window, which the calibration rules explicitly protect from downgrade. No CRITICALs were inflated by adversarial momentum; each maps to a distinct, evidence-backed structural defect. M3 (field auth) was deliberately held at MAJOR rather than escalated to a CRITICAL security finding, because no code exists to demonstrate a concrete exploit path — it is a design risk, not a confirmed vulnerability, and is routed to `security-threat-model-planner`.

**Verdict challenge (is REJECT too lenient?)**: REJECT is already the harshest actionable verdict; the question is whether it's too *harsh*. It is not — four independent, evidence-backed CRITICALs, two of which invalidate the plan's own success metrics, clear the bar. Not too lenient, not manufactured.

**What would upgrade the verdict**: A decision matrix that shows GraphQL genuinely beats JSON:API and a BFF on *this* system's measured problem; a baseline measurement phase; a caching design that survives per-user auth; a coherent (non-self-defeating) migration/proxy strategy; and a metrics-driven, rollback-capable sunset. With those, this becomes a REVISE or better.

**Handoff**: This needs a planner, not a critic's line-edits. Route to `meta-planner` (or `search-discovery-planner` / an API-architecture planner) for the alternatives analysis and baseline design, and `security-threat-model-planner` for the authorization model (M3) before re-review.

---

## Open Questions (unscored)

- Does a clean, reusable service layer actually exist, or is business logic in REST controllers? (Unverifiable here — empty/greenfield directory. Determines whether M5's estimate is off by 2x or 5x.)
- Did enterprise customers request *GraphQL*, or just "more flexible querying"? If the latter, does that justify replacing REST rather than augmenting it?
- What fraction of the 47 endpoints are action/RPC-style vs. clean resource CRUD? (Drives whether the 7-type schema can cover them — m1.)
- Is there a hard external constraint forcing the 6-month timeline, or is it self-imposed? (Changes the risk calculus on C4.)