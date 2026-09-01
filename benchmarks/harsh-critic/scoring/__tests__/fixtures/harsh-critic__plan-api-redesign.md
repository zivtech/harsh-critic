# VERDICT: REJECT

**Overall Assessment**: This plan is internally contradictory in ways that guarantee it fails its own purpose. It builds a REST-to-GraphQL proxy that structurally reintroduces the over-fetching it exists to kill, then commits to a hard 6-month `410 Gone` sunset that punishes the clients the proxy just told they didn't need to migrate. Worse, the entire motivation — mobile making "8-12 REST calls" — is never addressed by any step, because no client-side work is in scope. The core technology choice is justified by appeal to authority (and a factual error), with zero alternatives evaluated. The individual tooling instincts (DataLoader, schema-first SDL, query-complexity limits) are competent; the strategy connecting them is not.

**Scope limitation (read this first)**: This session has no accessible codebase — the working directory is empty (greenfield). I therefore **could not verify a single codebase claim**: that "existing service layer classes" exist and map cleanly to resolvers, that the "existing OAuth2 token validation middleware" is reusable, that there are exactly 47 endpoints, or what authorization the current REST API enforces. Every finding that depends on the current system is capped in confidence and flagged as such; the codebase-dependent verifications are routed to Open Questions. The findings below stand on the plan's **internal logic and contradictions**, which need no codebase to evaluate.

**Mode**: Escalated to **ADVERSARIAL** after Phase 2 — multiple CRITICAL findings, 6+ MAJOR findings, and a systemic pattern of internal contradiction (not isolated mistakes) met the escalation bar.

**Pre-commitment Predictions** (made before detailed analysis):
1. Over-fetching win undermined by GraphQL caching difficulty → **CONFIRMED** (CDN POST caching + proxy).
2. Authorization complexity underestimated → **CONFIRMED** (role-only directive, no resource-level auth).
3. Timeline unrealistic / enterprise contract breakage from hard sunset → **CONFIRMED**.
4. "40% payload reduction" metric unfounded/unmeasurable → **CONFIRMED**.
5. "Delegate to service layer" mapping is fragile; effort underestimated → **CONFIRMED**.
Two things I did **not** predict and only found on analysis: (a) the plan never touches the mobile clients that motivate the whole project, and (b) the Stripe citation is factually wrong.

---

## Critical Findings (block execution)

**C1 — The proxy and the sunset are mutually contradictory, and the proxy defeats the headline goal.**
- Evidence: Step 5 builds a `"REST-to-GraphQL proxy that translates incoming REST calls to GraphQL queries, allowing existing integrations to work without code changes."` Step 6 then makes `"REST v1 returns 410 Gone for unmigrated clients"` at month 5-6.
- Two structural problems: (1) A proxy that translates one REST call into one GraphQL query returns the **same fixed, over-fetched shape** as the REST endpoint. Proxied traffic — which is *most* traffic early in a migration — gets **zero payload reduction**, so the `"40% on average"` goal cannot be met until clients hand-write lean queries. (2) The proxy explicitly removes the incentive to migrate ("without code changes"), yet month 5-6 hard-kills the very clients who took that offer.
- Confidence: HIGH. This is a contradiction in the plan text, not a codebase claim.
- Why this matters: The plan will "succeed" on endpoint-count while missing the payload goal, then break paying integrations at the sunset. There is no rollback path from `410 Gone`.
- Fix: Pick one coherent strategy. Either (a) run GraphQL additively and let REST die organically (no hard 410), or (b) if you must sunset, drop the transparent proxy and give clients a real migration deadline with SDK/tooling and per-client tracking — don't offer "no code changes" and then punish it. Do not ship both.

**C2 — The project's stated motivation (mobile) is never addressed by any step.**
- Evidence: Background: `"Mobile clients now make 8-12 REST calls to assemble a single screen's data, causing latency and battery drain."` No step touches the mobile app. Step 1-4 are server-side; Step 5's proxy keeps mobile on REST-shaped payloads.
- A server-side GraphQL API changes nothing for a mobile client until that client is **rewritten** to issue GraphQL queries. That rewrite (client query design, Apollo/Relay integration, caching, release cycles across app-store versions) is a large project and is entirely absent.
- Compounding it: the Success Metrics don't even measure the motivating problem — there is no "mobile screen latency" or "calls-per-screen" metric. The plan can hit every listed metric while mobile latency/battery is unchanged.
- Confidence: HIGH (the gap is on the face of the plan).
- Why this matters: You can execute this plan flawlessly and fail the reason it exists.
- Fix: Add explicit client-migration scope (at minimum the mobile app, since it's the primary driver), and add a success metric that measures the motivating pain: calls-per-screen and screen-assembly latency on real devices, before/after.

**C3 — Success metrics don't measure the goal, and the core payload metric is unmeasurable as written.**
- Evidence: `"API response payload sizes reduced by 40% on average"` — average over what population, weighted how (per request? per endpoint? per byte over a week?), against what **baseline** (never captured)? And `"External developer satisfaction score ≥4.0/5.0"` names no instrument, no baseline, no sample. `"all 47 existing REST endpoints have GraphQL equivalents"` never defines "equivalent" (field parity? filtering/sorting/error-code parity?).
- Confidence: HIGH.
- Why this matters: Unfalsifiable metrics mean the project can be declared "done" arbitrarily. You cannot claim a 40% reduction without a measured baseline you never took.
- Fix: Define each metric operationally: capture a payload baseline now (p50/p90 bytes per endpoint, weighted by production request volume); define "equivalent" as a passing contract test per endpoint; specify the satisfaction survey instrument, cohort, and baseline.

---

## Major Findings (cause significant rework)

**M1 — Field auth is role-level only; there is no design for resource/tenant-level authorization.**
- Evidence: Step 3's only mechanism is `@auth(requires: ADMIN)` — a static role gate. REST APIs for a multi-tenant model (Users/Organizations/Projects) almost always enforce *instance* authorization ("can this user see *this* org's tasks?"). A schema directive generally can't express row-level/ownership checks because it fires without the resolved parent/resource context.
- Confidence: MEDIUM (design-level; I cannot verify what the current REST API enforces — see Open Questions). This is a **design-risk finding, not a demonstrated exploit** — no exploit path can be shown against a nonexistent codebase.
- Why this matters: If instance-level auth silently drops during the port, the failure mode is cross-tenant data exposure. High blast radius.
- Fix: Design the authorization layer explicitly. Directives are fine for coarse role gates, but add a resolver/policy layer for ownership and tenancy checks, and require an authorization decision on every resolver that returns tenant-scoped data. This is not directives-XOR-resolvers (a false dichotomy in the plan) — mature GraphQL auth uses both.

**M2 — CDN caching of GraphQL is underspecified and partly infeasible, with a cross-user data-leak risk.**
- Evidence: Step 4: `"Enable response caching at the CDN layer using Cache-Control headers derived from query complexity and data volatility."` GraphQL queries are conventionally `POST` and are **not CDN-cacheable by default**; caching requires GET + persisted queries. More dangerous: caching authenticated, per-user responses at a shared CDN leaks one user's data to another unless the cache key includes auth/user identity — the plan's cache key is derived from `"complexity and data volatility"`, not identity. "Data volatility" is also never defined anywhere (per-type? per-field? who sets it?).
- Confidence: HIGH on the mechanics; MEDIUM that the leak would actually ship (depends on implementation). Design-risk, not demonstrated exploit.
- Fix: Restrict CDN caching to persisted GET queries over demonstrably public data only; make auth identity part of the cache key for anything else; define a per-field/per-type volatility model or drop the claim.

**M3 — The core technology decision is justified by appeal to authority and contains a factual error; no alternative was evaluated.**
- Evidence: Step 1: `"We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority."` Stripe's public API is **REST/JSON — Stripe does not offer a public GraphQL API**, so it's cited as precedent for the opposite of what it does (survivorship bias + factual error). "A keynote demonstrated superiority" is not evidence.
- Competing alternatives the plan never rules out: a **Backend-for-Frontend / aggregation endpoint** tailored to mobile screens (solves the 8-12-calls pain directly, no query-language rewrite, no proxy, no sunset); **sparse fieldsets** (`?fields=`) or **JSON:API compound documents / `include`** on existing REST (solves over-fetching with a fraction of the change). The plan's claim that REST `"cannot [do this] without building dozens of new specialized endpoints"` is a false dichotomy — these approaches need neither dozens of endpoints nor a full replacement.
- Confidence: HIGH (Stripe fact + absence of alternatives analysis are both on the face of the plan).
- Why this matters: The most expensive decision in the plan (replace the entire public API) rests on the weakest reasoning in it. Evidence consistent with "GraphQL is trendy" is non-diagnostic — it's equally consistent with keeping REST + a BFF.
- Fix: Add a real approach-selection section that evaluates GraphQL vs BFF/aggregation vs sparse fieldsets against your actual constraints, and states why the alternatives lose. Remove the Stripe claim and the keynote reasoning.

**M4 — Effort estimate and timeline omit the largest work items.**
- Evidence: The only estimate is Step 2: `"3 developers for 4 weeks"` for resolvers. Not estimated anywhere: the Step 5 proxy (translating 47 endpoints' query params, filtering, sorting, pagination, error semantics — effectively re-implementing v1 atop GraphQL, plausibly the single biggest item), mutations, testing/contract-equivalence, the auth layer, and observability rework. Meanwhile the metric `"REST v1 traffic <5% by month 4"` sits against a timeline where GA is only `"Month 3-4"` — clients would have ~0-4 weeks post-GA to fully migrate, which no enterprise integration cycle meets, especially when the proxy removes urgency (see C1).
- Confidence: MEDIUM-HIGH. The finding is the *omission* of major items from scope/estimate, which is unambiguous; the exact numbers are inherently uncertain.
- Fix: Produce a work-breakdown that estimates the proxy, mutations, contract tests, auth, and observability separately, then rebuild the timeline from the migration mechanics (how do clients actually cut over, and by when).

**M5 — Production persisted-query allowlist contradicts the "flexible querying" premise.**
- Evidence: Step 4: `"Add persistent query support (allowlisted query hashes) for production clients."` If production only accepts allowlisted query hashes, then **ad-hoc flexible querying is disabled in production** — directly contradicting the Background's `"enterprise customers have requested more flexible querying"` and the Core Thesis of clients controlling response shape.
- Confidence: MEDIUM-HIGH (could be reconciled if allowlisting is scoped to specific clients, but the plan says "production clients," implying all).
- Fix: State explicitly who is allowlist-only (e.g., first-party mobile/web) vs who gets ad-hoc access (enterprise), and how enterprise ad-hoc queries are protected without an allowlist (depth/complexity limits + auth + rate limits).

**M6 — Hard `410 Gone` sunset with no rollback is a business-risk landmine.**
- Evidence: Step 6: `"REST v1 returns 410 Gone for unmigrated clients"` at month 5-6, with no rollback plan and no per-client migration tracking. Enterprise API contracts frequently mandate long deprecation notice (commonly 12+ months); a 6-month hard removal may breach them.
- Confidence: MEDIUM. The *design* risk (hard cutover, no rollback) is HIGH-confidence; the *contract-breach* claim is unverifiable here (no contract access) — see recalibration below.
- Fix: Add per-client migration telemetry as the gate for any sunset; keep an emergency un-sunset path (feature-flag REST back on) for the first weeks post-410; confirm the notice period against actual enterprise contracts before committing to a date.

---

## Minor Findings (suboptimal but functional)
- Step 2's DataLoader is the right instinct, but it silently assumes the service layer exposes **batch-by-keys** methods. If existing service methods are single-entity fetches (likely, if built for REST), DataLoader can't batch and N+1 persists — verify before relying on it.
- DataLoader's per-request cache must be scoped with auth context; a naively shared loader can serve a resource fetched under one authorization context to a differently-authorized field in the same request.
- Query-complexity scoring (Step 4) is static; it can diverge sharply from real runtime cost (a "cheap" query hitting an expensive resolver). Pair it with actual timeout/cost budgets, not just point counts.

## What's Missing (gaps / unhandled cases / unstated assumptions)
- **Mutations** — the schema (Step 1) lists only entity types; writes/actions are never mentioned. Many of the 47 REST endpoints are operations (archive, bulk ops, exports, invites, auth flows) that don't map to CRUD types.
- **Subscriptions / real-time** — "Notifications" strongly implies push/real-time; not addressed.
- **File upload for Attachments** — GraphQL file upload is a known special case (multipart); unaddressed.
- **Error taxonomy** — GraphQL returns HTTP 200 with an `errors` array; REST clients branch on status codes. The proxy must map this, and none of it is specified.
- **Rate limiting** — complexity budget ≠ rate limiting; a client can flood cheap queries. Single `/graphql` endpoint breaks per-route rate limits/WAF rules built around REST paths.
- **Observability** — per-endpoint metrics, logging, and alerting anchored to REST routes collapse into one endpoint; no plan to restore visibility.
- **Schema evolution governance** — how do you make breaking changes post-GA (field removal/rename) without versioning? Unaddressed.
- **Contract/equivalence testing** — nothing verifies a GraphQL "equivalent" actually matches REST behavior for all 47 endpoints.
- **Payload baseline measurement** — required to claim 40%, never taken.
- **Rollback** — for the schema, for GA, and especially for the `410` phase.

## Ambiguity Risks (plan reviews)
- `"REST v1 deprecated within 6 months"` (Goal) vs `"REST v1 marked deprecated"` at month 3-4 vs `"410 Gone"` at month 5-6.
  - Interpretation A: "deprecated" = notice only, REST stays reachable. Interpretation B: "deprecated" = removed (410). The plan uses both. Risk if wrong: teams plan for a soft notice while ops executes a hard removal (or vice versa) — client breakage or a stalled migration.
- `"all 47 endpoints have GraphQL equivalents."`
  - A: 1:1 field/data parity. B: full behavioral parity (filtering, sorting, pagination, error codes, status semantics). Risk if wrong: "done" is declared at data parity while integrations relying on REST filtering/error semantics silently break through the proxy.
- `"Cache-Control derived from ... data volatility"` — "volatility" is defined nowhere. Two engineers will pick different TTLs; one over-caches mutable data → stale/incorrect responses.

## Multi-Perspective Notes
- **Executor**: I cannot start Step 2 without the service-layer method surface (does it batch?). Step 4 gives no volatility model to derive `Cache-Control` from. Step 1 doesn't tell me whether to implement writes (mutations). I will be blocked immediately and repeatedly.
- **Stakeholder**: The plan can pass all four Success Metrics while the mobile latency/battery problem — the reason we funded this — is untouched (C2). The 40% metric has no baseline and no definition (C3). "REST <5% by month 4" conflicts with GA at month 3-4.
- **Skeptic**: The strongest failure argument is the proxy↔sunset contradiction (C1) plus the false dichotomy that only "dozens of specialized endpoints" could fix over-fetching on REST (M3). The plan never constructs, let alone rebuts, the cheaper BFF/sparse-fieldset alternatives.

## Murder-Board Verdict (core-thesis attack)
This plan pairs a transparent compatibility proxy that structurally recreates the over-fetching GraphQL was adopted to eliminate with a hard 6-month `410` sunset that punishes the clients the proxy told to do nothing — while never touching the mobile clients whose call-fan-out was the entire justification. The technology choice itself (GraphQL) is *defensible*, but the execution strategy is internally contradictory and disconnected from its own motivation. Assessment: **COMPELLING** — this is a structural failure, not a nitpick elevated to thesis level. The thesis "GraphQL is the right replacement" is not *disproven*, but the plan gives no valid evidence for it (M3) and no coherent path to realize it.

## Verdict Justification
**REJECT** — the maximum-severity verdict, and it is warranted: three CRITICAL findings, at least six MAJOR, and a systemic pattern of internal contradiction. This is not "add more detail." Two of the contradictions (C1 proxy-vs-sunset, M5 allowlist-vs-flexible-querying) and one disconnect (C2 motivation-vs-scope) mean the plan would fail its own purpose even if executed perfectly.

**Realist Check recalibrations**:
- **M6 downgraded CRITICAL→MAJOR.** *Mitigated by*: I have no access to the actual enterprise contracts, so the contract-breach claim is unverifiable; the hard-cutover/no-rollback design risk remains real and MAJOR.
- **M1 held at MAJOR (not raised to CRITICAL).** *Mitigated by*: it is a design-level risk on a plan, with no demonstrable exploit path against a nonexistent codebase; the codebase-dependent confirmation is routed to Open Questions. Data-exposure potential keeps it from being downgraded further.
- **C1, C2, C3 held at CRITICAL** — they survive all four realist questions: realistic worst case is goal-failure or client breakage, no mitigating factor exists in the plan, and (for C1/C2) the failure is only detected late or never within the metrics as written.

**Verdict challenge** ("is REJECT too lenient?"): REJECT is already the floor of the scale, so no harsher tier exists. The opposite check — am I being *too harsh*? — resolves no: the findings are grounded in the plan's own text, not in unverifiable codebase claims. To upgrade toward ACCEPT, the plan must resolve C1-C3 (pick a coherent migration strategy, bring client migration into scope, define measurable metrics with a baseline), justify GraphQL against real alternatives (M3), and design resource-level auth (M1).

**What genuinely works** (kept brief per protocol): DataLoader for N+1, schema-first SDL, Relay cursor connections, query-complexity limits, and persisted queries are all correct, industry-standard building blocks. The failure is at the strategy and gap level, not the tooling level.

## Open Questions (unscored — codebase-dependent, could not verify)
- Does the current REST v1 enforce resource/tenant-level authorization (ownership checks), or only role checks? If only role checks, M1's severity drops substantially. *Security finding M1 is design-level; no exploit path can be demonstrated here — confirm against the real auth code before acting.*
- Do the "existing service layer classes" expose batch-by-keys methods that DataLoader can use, or only single-entity fetches?
- How many of the 47 endpoints are non-CRUD operations/mutations vs simple reads (drives whether "7 domains" plausibly covers "47 equivalents")?
- What do the enterprise API contracts actually specify for deprecation notice? This gates whether M6's sunset date is a breach.
- Is the persisted-query allowlist intended for all production clients or only first-party clients (reconciles or confirms M5)?