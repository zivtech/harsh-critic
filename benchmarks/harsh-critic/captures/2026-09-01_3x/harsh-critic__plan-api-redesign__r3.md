I'm operating as the **Harsh Critic** (final quality gate) on this plan. One scoping note up front that shapes everything below: the session is a **greenfield/empty directory** — there is no codebase in front of me to verify the plan's "existing" claims against (existing service layer, OAuth2 middleware, 47 REST endpoints, current pagination style). Per my read-only mandate I attempted to ground the technical claims and found nothing to ground them in. So every "reuse existing X" assertion is an **unverified assumption**, and I'm treating it as such rather than pretending I confirmed it. That itself is a finding: a plan this consequential ships zero references to the code it claims to build on.

---

**VERDICT: REVISE** (hard revise, bordering REJECT — see verdict challenge)

**Overall Assessment**: The direction (add GraphQL to solve mobile round-trips) is defensible, but this is a *sketch presented as a plan*. Its central justification rests on a logical fallacy and a factual error about REST; its flagship metric is contradicted by its own migration strategy; it hard-sunsets a 3-year-old public API with enterprise customers in 6 months with no rollback and no criteria-gated phases; and 5 of 6 steps carry no effort estimate. The GraphQL idea survives. The plan as written does not.

**Pre-commitment Predictions** (made before detailed analysis): I predicted the five most likely failure areas would be (1) CDN caching of GraphQL being far harder than assumed, (2) appeal-to-authority justification instead of engineering rationale, (3) an over-aggressive public-API deprecation timeline, (4) the REST→GraphQL proxy being a hidden mega-project that undercuts the whole thesis, and (5) the payload/latency metrics being unmeasurable or contradicted. **All five landed.** That the predictions hit this cleanly is itself a signal: the plan follows the standard optimistic-migration failure template.

**Mode**: Escalated to **ADVERSARIAL** after finding 1 CRITICAL + multiple MAJORs plus a systemic pattern (under-specification across effort, rollback, auth, caching, and alternatives — not isolated mistakes).

---

**Critical Findings** (block execution):

**C1 — 6-month hard sunset of a public/enterprise API, time-gated not criteria-gated, with no rollback.**
- Evidence: Step 6 — `"Month 5-6: REST v1 returns 410 Gone for unmigrated clients"`; Background — `"Several enterprise customers"` depend on this API; the API was `"designed 3 years ago."` The phases are calendar-driven, and there is **no rollback path anywhere in the plan** if GraphQL GA reveals a critical defect after REST has been marked deprecated.
- Confidence: HIGH
- Why this matters: The cited exemplars undercut the plan — Stripe and GitHub (Step 1) maintain public API versions for *years*, not months, precisely because enterprise integrations can't be force-migrated on a quarter's notice. A `410 Gone` flip against paying customers mid-quarter is a churn/SLA/contract-breach event, not a technical toggle. And because phase transitions are dates rather than gates, you can enter deprecation while GraphQL is still unproven, with no documented way back. Realist Check: worst-case is real revenue loss and a breached enterprise contract — this earns CRITICAL and I will not downgrade it (financial/business impact, no compensating control in the plan).
- Fix: (a) Gate every phase on measurable criteria, not dates (e.g., "REST sunset begins only after GraphQL sustains X% of traffic at Y error rate for Z weeks"). (b) Define the rollback trigger and mechanism explicitly. (c) Run an enterprise-contract/SLA review *before* committing to any sunset date; large accounts likely need 12–24 month deprecation windows and per-account migration support. (d) Define how "unmigrated client" is even detected (see A1).

---

**Major Findings** (cause significant rework):

**M1 — The core thesis rests on a logical fallacy and a factual error; lower-risk alternatives are never evaluated.**
- Evidence: Step 1 Decision — `"We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority."` That is appeal-to-authority plus a keynote anecdote, not engineering rationale. The Core Thesis also claims REST `"cannot provide [response-shape control] without building dozens of new specialized endpoints."` **This is factually wrong** — JSON:API sparse fieldsets (`fields[project]=title,status`) and `include` give clients response-shape control within REST without new endpoints, and a BFF/aggregation endpoint solves the *actual* stated pain (`"8-12 REST calls to assemble a single screen"` — that's under-fetching/round-trips, not over-fetching) with a fraction of the migration risk.
- Confidence: HIGH
- Why this matters: The plan picks the single most disruptive option (full replacement + hard sunset) without ruling out additive/lower-risk paths that solve the same problem. Evidence that is consistent with *every* option (GraphQL, BFF, JSON:API all fix the mobile round-trip problem) does not justify choosing the riskiest one.
- Fix: Add an explicit alternatives section (ACH): GraphQL-as-additive-layer, BFF aggregation endpoints, JSON:API sparse fieldsets. Show why GraphQL *replacement* beats each. It's entirely possible the answer is "GraphQL, but additive and without a forced sunset" — which would also dissolve C1.

**M2 — Authorization design is incomplete for a multi-tenant data model.**
- Evidence: Step 3 specifies only role-based directives — `"@auth(requires: ADMIN)"`. But the schema (Step 1) is Users → Organizations → Projects → Tasks → Comments — a relationship/instance-level authz domain. "Can this user see *this* project?" cannot be expressed by a static role directive; it requires per-object ownership/membership checks. The plan asserts resolvers `"delegate to existing service layer classes, so business logic is not duplicated"` — which silently assumes the service layer already enforces instance-level authz on every path, an assumption I cannot verify (no codebase).
- Confidence: HIGH on the design gap; MEDIUM on impact (depends on unseen service layer).
- Why this matters: Security Exploitability Gate — I cannot demonstrate a concrete exploit without the codebase, so I am *not* asserting a confirmed vuln. But the plan's stated auth design is insufficient for its own data model, and GraphQL's graph-traversal nature means a field reachable via a new parent path can bypass a check that REST controllers used to enforce. If the service layer does *not* already enforce object-level authz independent of the REST controller, this escalates to CRITICAL (cross-tenant data exposure).
- Fix: Specify the instance-level authorization model explicitly (e.g., ownership checks in resolvers/DataLoaders, or an authz layer independent of directives). Confirm, with code references, where object-level authz currently lives. Do not ship on role directives alone.

**M3 — The "40% payload reduction" metric is contradicted by the proxy strategy.**
- Evidence: Success criteria — `"API response payload sizes reduced by 40% on average."` Step 5 — the REST→GraphQL proxy lets `"existing integrations work without code changes."` A client that doesn't change its code requests the same shape it always did, so the proxy must query every field the REST endpoint returned → **~0% payload reduction for all proxied traffic.** The 40% average is only reachable if most traffic migrates to hand-trimmed native GraphQL — which the proxy actively disincentivizes. Baseline ("40% *of what*, measured *how*, weighted *how*") is also undefined.
- Confidence: HIGH
- Why this matters: The flagship success metric and the flagship migration-support mechanism work against each other. As written, hitting the metric requires the proxy to fail at its job.
- Fix: Define the payload baseline and measurement precisely (traffic-weighted, per-operation). Decide whether the proxy is a bridge (accept that proxied traffic won't move the metric and scope the metric to native clients) or whether native migration is actually required (then the proxy's value is much smaller than presented).

**M4 — CDN response caching is largely infeasible for this workload.**
- Evidence: Step 4 — `"Enable response caching at the CDN layer using Cache-Control headers."` GraphQL is POST-with-body by default (CDNs don't cache POST), and these responses are per-user authenticated data (Users/Projects/Tasks scoped to an org). Shared-CDN caching of personalized authed responses yields near-zero hit rate. The plan mentions persistent queries but never connects the dots that CDN caching requires GET-based persisted/automatic-persisted queries *and* cacheable (non-personalized) payloads.
- Confidence: HIGH
- Why this matters: A per-resource REST API with stable URLs is *more* CDN-cacheable than GraphQL, so this migration may **reduce** cacheability and shift load to origin compute — the opposite of the latency goal, and it can eat the payload win in origin cost.
- Fix: Either drop CDN caching from the plan or specify the concrete mechanism (GET + APQ, split cacheable public queries from personalized ones, document expected hit rate). Don't assert CDN caching as a given.

**M5 — Effort is estimated for 1 of 6 steps; the timeline is not credible.**
- Evidence: Only Step 2 carries an estimate (`"3 developers for 4 weeks"`). Schema design (Step 1, 7 domains), auth directives + instance authz (Step 3), complexity analysis + persisted queries + caching (Step 4), the entire proxy + migration guide (Step 5), and rollout (Step 6) have none. Yet Step 6 puts GA at month 3–4, meaning Steps 1–5 must all land in ~3–4 months.
- Confidence: HIGH
- Why this matters: The REST→GraphQL proxy alone (faithful translation of 47 endpoints' shapes, pagination, filtering, errors, file transfer) is comparable in scope to the resolver work. An unestimated plan cannot be staffed or committed to.
- Fix: Estimate every step. Estimate the proxy as its own project with its own risk. Reconcile the sum against the 6-month envelope before committing.

**M6 — "Reuse the service layer as-is" conflicts with DataLoader batching.**
- Evidence: Step 2 — `"resolvers using a DataLoader pattern to prevent N+1"` *and* `"delegate to existing service layer classes, so business logic is not duplicated."` DataLoader requires batch-capable data access (`getUsers([ids])`). If the existing service layer exposes single-entity, REST-shaped methods (`getUser(id)`) — the common case — then either DataLoader is ineffective (N+1 persists) or the service layer must change (contradicting "no duplication / reuse as-is").
- Confidence: MEDIUM (the author could refute this by pointing to existing batch methods — which I cannot see).
- Why this matters: If this tension is real, the latency rationale can invert: GraphQL delegating to per-entity service calls is *slower* than a hand-tuned REST endpoint. This is the failure mode that quietly kills GraphQL migrations.
- Fix: Confirm (with code references) that the service layer exposes batch methods. If not, budget for that work explicitly and stop describing it as zero-cost reuse.

**M7 — Proxy fidelity: cursor connections can't faithfully proxy offset/page REST pagination.**
- Evidence: Step 1 mandates `"Relay-style cursor connections"`; Step 5 promises REST integrations `"work without code changes."` Cursor pagination has no "jump to page N," so a REST endpoint offering `?page=5` cannot be faithfully translated. Same fidelity problem for arbitrary filter params, REST error/status semantics, and multipart Attachment upload/download.
- Confidence: MEDIUM (depends on the current REST pagination scheme, which I can't verify).
- Why this matters: "Works without code changes" will be subtly false — behavioral drift surfaces as enterprise support tickets during the highest-risk window.
- Fix: Enumerate the REST behaviors the proxy must preserve and prove each is translatable, or scope the "no code changes" promise honestly to the subset that is.

---

**Minor Findings** (suboptimal but functional):
- GraphQL attack surface is only partly addressed. Step 4's complexity budget is good, but there's no mention of **introspection control in production**, **query depth limiting** (separate from complexity), or **alias/batch amplification** (aliasing the same expensive field N times to bypass rate limits / amplify load). 
- `"developer satisfaction score ≥4.0/5.0"` — no baseline, sample definition, or instrument. Vanity-metric risk.
- **Attachments** (binary files) don't map cleanly to GraphQL (multipart is a bolt-on). Listed as a type but file upload/download is never addressed — and it's the hardest thing to proxy.
- The `"complexity budget of 1000 points"` cites no scoring model, so the number is arbitrary until defined.

---

**What's Missing** (gaps / unstated assumptions):
- **No rollback or contingency** for any phase; no success gates between phases (the whole timeline is calendar-driven).
- **No contingency if REST traffic isn't <5% by month 4** — highly likely for a 3-year-old API — yet month 5 flips to `410 Gone` regardless. Note the internal tension: the metric *assumes* <5% by month 4, and the timeline *acts on* that assumption without a fallback.
- **No mechanism to identify an "unmigrated client"** (per-API-key? per-traffic? global?).
- **No introspection/depth/aliasing controls.**
- **No enterprise contract/SLA review** gating the sunset.
- **No effort/staffing for 5 of 6 steps.**
- **No binary-file handling story** (Attachments).
- **No observability plan**: how per-query cost, error rate, and native-vs-proxy adoption are measured during migration (you can't gate phases on data you don't collect).
- **No schema evolution/deprecation discipline** — GraphQL's "no versions" only works with strict additive-only governance, which is unaddressed.
- **No external client SDK / codegen story** — a big part of the "developer experience" success criterion.
- **No mention of what happens to rate-limits, API keys, and webhooks** under the new model.

---

**Ambiguity Risks** (multiple valid interpretations):
- `"REST v1 returns 410 Gone for unmigrated clients"` → **A:** per-client, only keys with zero GraphQL usage get 410. **B:** blanket 410 on all REST traffic. Blast radius differs by orders of magnitude, and the mechanism for A is never specified. *Risk if B is chosen:* every integration that didn't migrate breaks simultaneously.
- `"reduced by 40% on average"` → per-endpoint average vs traffic-weighted vs per-request. *Risk:* the metric is declared "met" on an unrepresentative average.
- `"GraphQL API in beta alongside REST v1"` → feature-complete beta vs partial. *Risk:* if partial, the month-3 GA date is fiction.
- `"complexity budget of 1000 points"` → no scoring function. *Risk:* set too low, legit dashboard queries 400; too high, abusive queries pass.

---

**Multi-Perspective Notes:**
- **Executor**: "Step 5 is one sentence — 'build a REST-to-GraphQL proxy.' Which framework? How do I translate `?page=N`, arbitrary filters, multipart Attachment uploads, and exact REST error bodies? This is a whole project with no design and no estimate. I cannot start."
- **Stakeholder**: "Does *replacement* solve the stated problem better than an additive layer? The pain is mobile round-trips — a BFF or additive GraphQL fixes that without risking enterprise churn. Why are we buying the deprecation risk at all? And 'developer satisfaction ≥4.0' — measured against what baseline?"
- **Skeptic**: "The strongest argument against this plan: the justification is a conference keynote, the central factual claim about REST is wrong, the flagship metric fights the migration mechanism, and the sunset endangers the exact enterprise accounts named as the motivation. The lower-risk alternative (additive, no forced sunset) is never even acknowledged."

**Murder Board** (attack on the core thesis): *This plan should be rejected as scoped because it takes the highest-risk option — full REST replacement with a hard 6-month public-API sunset — to solve a problem (mobile round-trips) that an additive GraphQL or BFF layer solves without forcing external customers to migrate, and it never evaluates that safer path. It then stakes its success on a 40% payload metric that its own compatibility proxy structurally prevents most traffic from achieving.* Self-assessment: **COMPELLING at the approach/scope level, not at the technology level.** The murder board does *not* kill "use GraphQL" — GraphQL is reasonable here. It kills "replace-and-hard-sunset." That's why the verdict is REVISE (re-scope to additive) rather than REJECT (abandon).

**Verdict Justification**: One CRITICAL (deprecation/rollback) plus seven MAJORs triggered ADVERSARIAL mode and, on their own, would justify REVISE. No Realist-Check downgrades were warranted — C1 involves financial/contract impact and is explicitly non-downgradable; M2 was held at MAJOR (not inflated to CRITICAL) *because* I cannot demonstrate an exploit path without the codebase, per the Security Exploitability Gate, and its escalation condition is recorded as an Open Question. M6 and M7 are MEDIUM-confidence (author could refute with code I can't see) but remain in-scope because the *unaddressed tension* is itself the defect. **Verdict challenge** ("argue this is too lenient → REJECT"): the case is real — fallacious thesis + factual error + revenue-endangering sunset + self-contradicting flagship metric + 5/6 steps unestimated could read as "not engineered at all." I stopped short of REJECT only because the GraphQL direction is sound and the scaffolding (schema-first, DataLoader intent, complexity analysis, migration guide) is reusable. To upgrade to ACCEPT-WITH-RESERVATIONS, the plan must: re-litigate additive-vs-replacement (M1), replace the calendar sunset with criteria gates + rollback (C1), reconcile the payload metric with the proxy (M3), specify instance-level authz (M2), and estimate every step (M5).

**Open Questions (unscored — cannot verify without the codebase):**
- Does the existing service layer already enforce **instance-level authorization** independent of the REST controllers? If yes, M2 is contained; if no, **M2 escalates to CRITICAL.**
- Does the service layer expose **batch methods** suitable for DataLoader (M6)?
- What is the **current REST pagination scheme** (offset/page vs cursor)? Determines M7's severity.
- What is the **actual traffic split** between enterprise and public REST consumers? Determines C1's blast radius and whether `<5% by month 4` is remotely plausible.
- Do **enterprise contracts/SLAs** permit a breaking deprecation on a 6-month horizon? This is a business/legal precondition the plan never checks.