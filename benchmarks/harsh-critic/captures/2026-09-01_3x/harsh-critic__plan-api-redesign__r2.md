# VERDICT: REJECT

**Overall Assessment**: This plan picks the single most disruptive path available — full replacement of a public REST API plus a hard 6-month deprecation — and never justifies it against cheaper alternatives that solve the same stated problem. The central decision rests on an appeal to authority ("industry leaders use it," "our CTO attended a conference") and a factually wrong precedent. Underneath that, the plan contains a caching design that can leak one user's authorized data to another, an internally contradictory deprecation model (a compatibility proxy that keeps REST alive, sitting next to a `410 Gone` that kills it), and it omits the genuinely hard parts of any GraphQL migration: object-level authorization, error-status semantics, observability, file uploads, and subscriptions.

**Scope caveat (honest uncertainty)**: No codebase was provided in this environment. The plan asserts an "existing service layer," "existing OAuth2 token validation middleware," "47 existing REST endpoints," and a 3-year-old API. I could not verify any of these. Several findings below assume those claims are true; where an assumption is load-bearing I say so. Findings about the plan's internal logic, contradictions, and gaps stand regardless of the codebase.

**Pre-commitment Predictions** (made before detailed reading): I expected (1) broken HTTP/CDN caching dressed up as solved, (2) field-level auth underestimated, (3) query-complexity/DoS hand-waved, (4) the REST-compat proxy treated as a footnote, (5) an over-aggressive deprecation timeline, and (6) an unmeasurable payload-reduction metric. All six landed. That hit rate is itself a signal: the plan reads like a GraphQL enthusiasm brief, not an interrogated engineering plan.

---

## Findings

**Critical Findings** (block execution):

**C1 — CDN response caching + field-level auth = cross-user data leak.**
- Evidence: Step 4 says `"Enable response caching at the CDN layer using Cache-Control headers derived from query complexity and data volatility."` Step 3 introduces field-level authorization (`@auth(requires: ADMIN)`), meaning responses are user-dependent. The plan specifies no per-user cache key.
- Failure scenario: User A runs an allowlisted persisted query (Step 4) over GET and receives their private project data. The CDN caches the response keyed on the query hash. User B issues the same persisted query and is served A's cached, authorized response. This is reachable by any non-privileged user — it is a data-exposure vulnerability, not a theoretical one.
- Confidence: HIGH (that the design as written is unsafe); MEDIUM (that they'd ship it without noticing).
- Why it matters: Authorized-data caching without a user-scoped key is a classic GraphQL-at-CDN breach. Per the security gate: concrete exploit, non-privileged actor, no compensating control in the plan.
- Fix: Explicitly separate cacheable public queries from auth-varying queries. Only CDN-cache queries that return no per-user-authorized fields; make everything auth-gated `private`/`no-store` or key the cache on identity (which collapses hit rate — state that tradeoff). Do not "derive Cache-Control from query complexity" — complexity is unrelated to cacheability.

**C2 — Hard `410 Gone` deprecation of a public + enterprise API in 6 months risks contract breach and churn.**
- Evidence: Step 6, `"Month 5-6: REST v1 returns 410 Gone for unmigrated clients."` Background: `"Several enterprise customers have requested more flexible querying."` Backcasting the timeline: GraphQL reaches GA in `"Month 3-4"`, forced 410 lands `"Month 5-6"` → external developers get roughly 1–2 months of real migration runway.
- Failure scenario: An enterprise customer with a contractual API-stability window (common in B2B agreements) is force-cut at month 5, breaks in production, and either files a breach claim or churns. External developers who integrated against v1 get ~8 weeks, which is far below the 6–12 months typical for public breaking changes.
- Confidence: HIGH (timeline is aggressive); MEDIUM (contract-breach specifics unverifiable without the contracts).
- Why it matters: This is business/financial risk, not just engineering — it earns Critical and cannot be downgraded (Realist Check: data/financial impact does not get mitigated away).
- Fix: Decouple GA from sunset. Provide a minimum 6–12 month post-GA migration window for external/enterprise clients, per-customer migration SLAs, and an explicit exception process. Verify existing contractual stability commitments before publishing any sunset date.

**C3 — The compatibility proxy and the `410 Gone` sunset are mutually contradictory; the plan cannot be executed as written.**
- Evidence: Step 5 builds `"a REST-to-GraphQL proxy that translates incoming REST calls to GraphQL queries, allowing existing integrations to work without code changes during the transition period."` Step 6 then returns `"410 Gone for unmigrated clients."`
- Failure scenario: Two readings, both broken. (a) If the proxy stays, "unmigrated" clients keep working via the proxy indefinitely — so why return 410, and what is the client even migrating *to*? (b) If the proxy is removed at month 5, every client relying on "no code changes" breaks at once, and the proxy's entire value proposition evaporates. The plan never specifies the proxy's lifecycle, so an executor cannot know which reality to build.
- Confidence: HIGH.
- Why it matters: This is a logical contradiction at the core of the migration strategy — it blocks coherent execution and undermines the deprecation rationale itself (if a transparent proxy exists, the case for deprecating REST at all weakens).
- Fix: Decide and document the proxy's end state. Either (i) the proxy is permanent and REST is never 410'd (it becomes a thin facade), or (ii) the proxy is a temporary bridge with its own sunset that gives clients time to move to native GraphQL, with 410 applying only after the proxy retires. Pick one and rewrite Steps 5–6 to match.

**Major Findings** (significant rework):

**M1 — Core approach (full replace + hard deprecate) is never compared against alternatives; the justification is a logical fallacy and a factual error.**
- Evidence: Step 1, `"We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority."` Two problems: (1) appeal to authority + survivorship bias, not evidence about *your* constraints; (2) factually wrong — Stripe's public API is REST and has no public GraphQL API; GitHub runs GraphQL v4 *alongside* a maintained REST v3 (it did not replace/deprecate REST). So the precedents that are accurate mostly argue *against* the "replace and sunset" thesis.
- Competing alternatives the plan does not rule out, all of which address the stated problem (`"8-12 REST calls to assemble a single screen"`): a Backend-for-Frontend aggregation layer; JSON:API sparse fieldsets + compound documents (solves over-fetching and relationship inclusion within REST); or GraphQL added *additively* for mobile while REST v1 stays for existing integrations. The plan's evidence (over-fetching, high call counts) is consistent with all of these — it is non-diagnostic and does not select GraphQL-as-full-replacement.
- Confidence: HIGH (fallacy + Stripe error); HIGH (alternatives not addressed).
- Fix: Add an approach-selection section that evaluates BFF, JSON:API, and additive GraphQL against full replacement on cost, risk, client-migration burden, and the specific over-fetching problem. Justify full replacement or change course. Remove the conference/authority reasoning.

**M2 — Object-level (relationship-based) authorization is unaddressed; the directive design only expresses static roles.**
- Evidence: Step 3's only example is `@auth(requires: ADMIN)` — a static role check. Real authorization for Users/Organizations/Projects/Tasks is almost always instance-level ("can this user see *this* project because they're a member?"). Static-role directives cannot express ownership/membership.
- Failure scenario: A member of Org A crafts a query for a Project in Org B; the directive passes because the user has the required role in general, but there is no instance-level check, exposing cross-tenant data.
- Confidence: MEDIUM-HIGH (the plan may intend more but shows only role checks — that omission is itself the finding).
- Fix: Specify instance-level authorization (policy layer or resolver-level checks with a DataLoader-batched permission cache), and state explicitly how the directive approach handles — or defers to code for — ownership/membership. Address the devil's-advocate point the plan waved away: resolver-level checks are strictly more expressive for instance auth; the "auth visible in schema" argument does not answer that.

**M3 — Allowlisted persisted queries directly contradict the stated enterprise flexibility goal.**
- Evidence: Step 4 adds `"persistent query support (allowlisted query hashes) for production clients."` Background lists as a driver: `"Several enterprise customers have requested more flexible querying."` Allowlisting pre-registered queries is the opposite of ad-hoc flexible querying.
- Failure scenario: The exact customers whose flexibility need justified GraphQL are told they may only run pre-registered queries in production, delivering none of the promised benefit.
- Confidence: HIGH.
- Fix: Define the tiering — who runs ad-hoc queries (gated by complexity limits) vs. who must use persisted queries — and how third parties register queries operationally. Confirm the flexibility promise survives.

**M4 — Resourcing is a single optimistic estimate for one step; the rest of the plan is unestimated.**
- Evidence: Only Step 2 carries an estimate: `"3 developers for 4 weeks"` (12 dev-weeks) to implement resolvers for all seven types including mutations, pagination, DataLoader batching, and error handling. Steps 4 (complexity analysis, persisted queries, CDN), 5 (the proxy — a large workstream that effectively re-implements all 47 endpoints as translators, plus the migration guide), and 3 (auth) have no estimates.
- Confidence: MEDIUM (estimate quality unverifiable) / HIGH (that the plan is under-resourced).
- Fix: Estimate every step. Treat the REST-to-GraphQL proxy as its own major project with its own risk register, not a Step 5 sentence.

**M5 — Error-handling semantics change (GraphQL returns HTTP 200 with an `errors` array) and this is never addressed.**
- Evidence: The plan reuses REST-oriented infrastructure (Step 3 middleware, Step 5 proxy) but never mentions that GraphQL conventionally returns 200 even on errors. Every client, monitor, retry policy, and alert that keys on HTTP status breaks.
- Failure scenario: A client's error handling (and your APM's error-rate dashboards) silently treats failed GraphQL operations as successes; partial-failure responses (data + errors) are mis-handled; on-call alerting goes blind.
- Confidence: HIGH.
- Fix: Define the error contract (error codes/extensions, partial-failure policy), how the proxy maps GraphQL errors back to REST status codes, and how monitoring/alerting changes.

**M6 — "40% payload reduction" is unmeasurable as specified and conflates response size with backend cost.**
- Evidence: Success criteria include `"API response payload sizes reduced by 40% on average"` with no baseline, cohort, or weighting defined. Payload size depends entirely on which fields clients request — if they request the same data, there's no reduction. Separately, Step 2 delegates to `"existing service layer classes"`; those classes were built to serve full REST objects, so the database likely still fetches everything even when the response is trimmed. DataLoader batches N+1 fetches but does not make a coarse service layer field-selective. So payload reduction ≠ latency/battery reduction at the backend, which is the actual stated pain.
- Confidence: MEDIUM-HIGH.
- Fix: Define the measurement baseline, the client cohort, and averaging method. Add a separate, distinct goal for backend efficiency (fewer round trips, field-selective fetching) and validate that the service layer can support it — otherwise the mobile latency/battery problem may persist despite smaller payloads.

**Minor Findings** (suboptimal but functional):
- The `"complexity budget of 1000 points per query"` is an arbitrary number with no scoring methodology. Define how field/connection/depth costs are assigned before the number means anything.
- `"Cache-Control headers derived from query complexity"` conflates complexity with cacheability. Complexity governs rate/abuse limits; volatility governs TTL. Drop the complexity linkage.
- Seven types (`Users, Organizations, Projects, Tasks, Comments, Attachments, Notifications`) are asserted to cover 47 endpoints, but many REST endpoints are non-CRUD actions (archive, bulk ops, search, export, webhooks). How these map to mutations/queries is unspecified.

---

## What's Missing (gaps, unhandled edge cases, unstated assumptions)
- **Observability**: With everything behind `POST /graphql`, route-based APM, per-endpoint latency/error dashboards, and log analysis all break. No plan for per-field/per-operation tracing.
- **File uploads**: `Attachments` — GraphQL has no native file-upload transport (multipart is a bolt-on). How are attachment uploads handled? Unaddressed.
- **Real-time / subscriptions**: `Notifications` implies push/real-time. GraphQL subscriptions need WebSocket infrastructure. Not mentioned.
- **Introspection in production**: Should it be disabled? Security/schema-exposure decision missing.
- **Per-client rate limiting**: Complexity budget limits single-query cost but not aggregate abuse per client/token.
- **Schema evolution post-GA**: GraphQL's "deprecate fields, don't version" model, and how breaking schema changes are handled after GA, is unaddressed.
- **Pagination migration**: Step 1 mandates Relay cursor connections. If existing REST uses offset pagination, clients relying on page numbers face a semantic break with no migration note.
- **Parity/contract testing**: Nothing ensures the 47 GraphQL "equivalents" behaviorally match REST (auth, side effects, errors). "Has an equivalent" is a counting metric, not a correctness gate.
- **Team GraphQL expertise**: No mention of the team's GraphQL experience, training, or ramp-up. A common silent schedule-killer.
- **Client SDK / codegen**: Will you ship typed clients/codegen for external developers? Affects adoption speed and the satisfaction metric.
- **Rollback per step / contingency**: No recovery path if a step fails mid-flight, and no contingency if `"REST v1 traffic <5% by month 4"` is *not* met — yet the 410 fires at month 5 regardless. That's a decision without a branch.
- **Cost/benefit**: No ROI framing — the cost of this migration vs. the benefit of the cheaper alternatives (M1) is never weighed.

## Ambiguity Risks (multiple valid interpretations)
- `"all 47 existing REST endpoints have GraphQL equivalents"` → **A**: a query/mutation exists that returns similar data. **B**: full behavioral parity (auth, side effects, error semantics, pagination). Risk if A is chosen: shallow equivalents ship, parity bugs surface post-cutover when REST is already 410'd.
- `"response caching ... derived from ... data volatility"` → **A**: only demonstrably public data is cached. **B**: all responses cached with a volatility-based TTL. Risk if B: the C1 data leak.
- `"during the transition period"` (Step 5 proxy) → the period's length and the proxy's end state are undefined. Risk: the C3 contradiction.

## Multi-Perspective Notes
- **Executor**: I cannot build Step 5 or Step 6 without knowing whether the proxy is permanent (C3). I cannot build Step 3 for real tenant isolation because only static-role auth is specified (M2). I have an estimate for one step out of six (M4). I would be blocked repeatedly and forced to make architecture decisions the plan should have made.
- **Stakeholder**: The stated problem is mobile round-trips and enterprise flexibility. A BFF or JSON:API could solve the first at a fraction of the cost and risk (M1), and the persisted-query design actively withholds the second from enterprise customers (M3). The plan risks a large spend that breaks external integrations (C2) without a demonstrated benefit that beats cheaper options.
- **Skeptic (murder board)**: *This plan should be rejected because it commits a public, enterprise-facing API to a full-replacement-and-hard-sunset migration — the highest-risk option — on the strength of an appeal to authority and a factually incorrect precedent, while leaving the two hardest problems (object-level authorization and cacheability-vs-auth) either wrong or unsolved.* I assess this argument as **COMPELLING**, not a nitpick: it is a structural problem the step-level analysis confirms rather than manufactures. The step-level flaws (C1–C3, M1–M2) are symptoms of the same root cause — the core decision was never interrogated.

---

**Verdict Justification**: REJECT. The plan has three Critical findings (a cross-user data-leak caching design, a business-breaking forced deprecation, and a self-contradictory proxy/sunset model) and six Major findings, but the deciding factor is that the **core thesis itself is unsupported** — full replacement + hard deprecation is never compared to BFF, JSON:API, or additive GraphQL, and its stated justification is a logical fallacy resting on a factually wrong example. That is a redesign trigger, not a revise-and-proceed situation: the individual steps cannot be meaningfully fixed until the approach is re-justified, because several of them (the proxy, the deprecation, the resourcing) only exist to serve the unexamined full-replacement decision.

**Mode**: I escalated to ADVERSARIAL mode after finding the first Critical and a systemic pattern (enthusiasm-driven decisions, hardest problems deferred). In adversarial mode I checked adjacent concerns not explicitly in the steps — error semantics, observability, file uploads, subscriptions, introspection — and every one was missing.

**Realist Check applied**: C1 stays Critical (security breach — not downgradable, and the exploit path is reachable by non-privileged users). C2 stays Critical (financial/contractual impact — not downgradable). C3 stays Critical (it blocks coherent execution, not merely inconveniences it). No downgrades were warranted; no finding was inflated by investigation momentum — each traces to a specific quoted contradiction or omission.

**Security Exploitability Gate**: C1 passes — concrete cross-user exploit path, non-privileged actor, no compensating control in the plan. It hinges on the cache key not including user identity; the plan gives no indication it would, and field-level auth makes shared caching unsafe by default. If the authors intend to cache only unauthenticated/public queries, C1 collapses to a documentation gap — so the one thing that could clear it is an explicit, auth-aware cache-key policy, which the plan must state.

**Verdict challenge (is this too lenient?)**: REJECT is already the harshest verdict, so the challenge runs the other way — is REVISE defensible? No. REVISE would imply the skeleton is sound and needs filling in. Here the load-bearing decision is unjustified and two Critical findings are contradictions, not omissions. REJECT holds.

**What would upgrade this to REVISE or better**: (1) An approach-selection section that rules out BFF/JSON:API/additive GraphQL on evidence, or changes course; (2) reconcile the proxy lifecycle with the deprecation (C3) and extend the external/enterprise migration window with contractual review (C2); (3) an auth-aware caching design with an explicit cache-key policy (C1); (4) an object-level authorization design (M2); (5) full resourcing including the proxy as its own workstream (M4); and (6) an error-semantics + observability plan (M5, gaps).

**Open Questions (unscored)**:
- Unverifiable in this environment: Does the "existing service layer" support field-selective fetching, or will payloads shrink while backend load stays flat (bears on M6)? Do enterprise contracts contain API-stability clauses (bears on C2)?
- `[UNCONFIRMED — routed here per the security gate]` Whether C1 actually ships as a vulnerability depends on the intended cache key. If the authors can show the design caches only unauthenticated/public queries, C1 drops to a documentation gap rather than a breach.
- Does the team have production GraphQL experience? Absent, this is a schedule risk I can flag but not size.
- Are any of the 47 endpoints non-CRUD actions or webhooks that map poorly to GraphQL mutations, and how many? That count would sharpen the M4 estimate and the Minor "7 types vs 47 endpoints" concern.