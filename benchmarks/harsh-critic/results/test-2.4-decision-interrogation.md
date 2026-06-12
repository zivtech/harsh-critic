# Test 2.4: Decision Interrogation (G4: T2 + T4)

**Fixture:** plan-api-redesign.md — Redesign Public API from REST v1 to GraphQL
**Techniques:** Socratic Deconstruction (T2), Competing Alternatives (T4)

---

## Step 7 — Socratic Deconstruction (T2)

### Decision 1: Adopt GraphQL as the Replacement for REST v1 (Core Thesis + Step 1)

**As stated (Core Thesis):** "GraphQL is the right replacement for our REST API because it solves the over-fetching problem and gives clients control over response shape, which our REST API cannot provide without building dozens of new specialized endpoints."

**As stated (Step 1 decision):** "We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority over REST for complex data models."

#### Why-Chain

**Level 1 — Why GraphQL as the replacement?**
The plan offers two reasons: (a) it solves over-fetching and gives clients control over response shape, and (b) industry leaders have adopted it and the CTO saw a conference keynote demonstrating its superiority.

**Level 2 — Why do these reasons justify adopting an entirely new API paradigm?**
Reason (a) would be sufficient only if over-fetching cannot be addressed by incremental improvements to REST. The plan claims REST "cannot provide" flexible responses "without building dozens of new specialized endpoints," but this is factually incorrect — REST APIs routinely support field selection (`?fields=id,name`), resource embedding (`?include=comments`), and compound documents (JSON:API) via query parameters, requiring zero new endpoints. Reason (b) is not a technical argument at all — it is a citation of other companies' choices and a conference presentation.

The plan collapses at Level 2 because the primary technical justification (REST cannot solve over-fetching) is false, and the secondary justification (authority citation) is not evidence about this system.

**Fallacies detected:**
- **Appeal to authority:** The justification "GitHub, Shopify, and Stripe have adopted it" treats other companies' technology choices as evidence of suitability for this system without any domain-specific analysis. The CTO's conference attendance is cited as additional evidence: "our CTO attended a conference where the keynote speaker demonstrated its superiority." A conference keynote is a marketing event, not an engineering evaluation. No benchmarks, prototypes, or domain-specific analysis are cited.
- **Survivorship bias:** Only companies that successfully adopted GraphQL are cited. Companies that adopted GraphQL and later scaled it back, encountered significant performance challenges (query complexity explosions, caching difficulty, N+1 problems in production), or chose alternatives are invisible. Stripe's primary public API remains REST, which undermines the citation.
- **False dichotomy:** The plan presents exactly two options: keep REST v1 as-is, or replace it entirely with GraphQL. No intermediate option is considered. The Core Thesis makes this explicit: REST "cannot provide" flexible querying "without building dozens of new specialized endpoints" — ignoring JSON:API sparse fieldsets, OData `$select`/`$expand`, Backend-for-Frontend patterns, and other approaches that solve over-fetching within REST.

---

### Decision 2: Schema-First Approach with SDL Files (Step 1)

**As stated:** "Use a schema-first approach with SDL files."

#### Why-Chain

**Level 1 — Why schema-first?**
The plan does not state an explicit reason. The implicit reasoning is that schema-first is the recommended practice in the GraphQL ecosystem for ensuring the API contract is defined before implementation.

**Level 2 — Why is schema-first appropriate here?**
Schema-first development ensures the API contract is defined upfront, enabling parallel development (frontend and backend teams can work from the schema simultaneously), tooling support (code generation, validation), and clear documentation. These are well-established benefits that apply broadly to API development.

**Level 3 — Does this approach have tradeoffs the plan should acknowledge?**
Schema-first requires maintaining SDL files in sync with resolver implementations, which can be error-prone as the schema grows. However, this is a well-understood operational concern with tooling solutions (schema linting, generated type bindings). The choice is consistent with standard GraphQL development practices.

**Chain Termination: SUPPORTED AXIOM**
The schema-first approach rests on the well-established principle that defining API contracts before implementation enables parallel development, better tooling, and clearer documentation. This is a sound and broadly applicable engineering axiom.

**Fallacy Scan:** No fallacies detected.

---

### Decision 3: Directive-Based Field Authorization (Step 3)

**As stated:** "We chose directive-based field auth over resolver-level checks because directives keep auth logic visible in the schema rather than buried in code."

#### Why-Chain

**Level 1 — Why directives over resolver-level auth?**
The plan states that directives keep auth logic "visible in the schema rather than buried in code."

**Level 2 — Why is schema visibility the deciding factor for authorization design?**
Visibility is one engineering concern among several. A sufficient justification would also need to address: (a) whether directive-based auth handles complex, context-dependent authorization rules (e.g., "user can see this field only if they are a member of the owning organization"), (b) whether directives compose and interact correctly with other directives, (c) whether the testing story for directive-based auth is adequate, and (d) whether the team has experience with this pattern. The plan addresses none of these. Resolver-level auth, while less visible in the schema, offers more flexibility for complex rules and is easier to unit test in isolation.

**Level 3 — Why should we believe schema visibility outweighs flexibility and testability?**
The plan does not make this case. The preference for visibility is stated as self-evidently good. The plan's authorization example (`@auth(requires: ADMIN)`) is a simple role check; whether this pattern scales to the actual authorization model of the application is not analyzed. Many production GraphQL APIs use resolver-level auth precisely because real-world authorization rules are too complex for declarative directives.

**Chain Termination: SUPPORTED AXIOM (with reservation)**
The preference for declarative, schema-visible authorization over imperative code is a recognized design principle ("make the implicit explicit"). However, the plan does not analyze whether its actual authorization requirements fit within the constraints of directive-based auth. The axiom is sound but its applicability to this specific system is unexamined.

**Fallacy Scan:** No fallacies detected at the level of formal logical fallacies. The reasoning is incomplete (missing complexity analysis) but not fallacious.

---

### Decision 4: 6-Month Deprecation Timeline with Hard 410 Cutoff (Step 6)

**As stated:** Months 1-2 beta, Months 3-4 GA with deprecation, Months 5-6 REST returns 410 Gone for unmigrated clients.

#### Why-Chain

**Level 1 — Why a 6-month timeline with a hard cutoff?**
The plan states this as a schedule but provides no explicit justification for the specific duration or the decision to return 410 Gone rather than maintaining a frozen REST v1.

**Level 2 — Why is 6 months sufficient for external developers to migrate from REST to an entirely different API paradigm?**
This would be sufficient only if (a) the number and diversity of external integrations is small enough, (b) the REST-to-GraphQL proxy provides a genuine safety net, and (c) external developers have GraphQL expertise and development capacity to migrate within this window. The plan states none of these. Enterprise integrations often have quarterly release trains, meaning a 6-month window provides at most two release opportunities — and one falls during the beta period when the GraphQL API is not yet GA.

**Level 3 — Why is a hard 410 cutoff the right approach rather than maintaining a frozen REST v1 alongside GraphQL?**
No answer is provided. The plan assumes that the operational cost of maintaining both APIs justifies a hard cutoff, but this assumption is never stated or quantified. The plan provides no data about external developer count, contract obligations, SLA terms, or historical migration timelines from comparable deprecations.

**Chain Termination: UNSUPPORTED ASSERTION**
The 6-month timeline and hard 410 cutoff are asserted without any supporting evidence about external developer capacity, contractual constraints, or historical precedent. The plan provides no justification for why this specific timeline is appropriate.

**Fallacy: Begging the Question.** The deprecation timeline assumes that 6 months is sufficient for external developers to migrate, and the plan uses this assumption as the basis for the schedule. But whether 6 months is sufficient is precisely the question that should be answered with evidence (developer counts, integration complexity, contract terms). The conclusion (6 months is enough) is embedded in the premise (we will deprecate in 6 months) without independent support.

**Cross-cutting fallacy: False Dichotomy.** Across the plan's decisions, there is a pervasive false dichotomy between "keep REST v1 exactly as-is" and "replace it entirely with GraphQL." This framing eliminates consideration of maintaining a frozen REST v1 indefinitely alongside GraphQL (which many API providers do successfully), building a REST v2 with field selection, adopting JSON:API conventions, or implementing a Backend-for-Frontend aggregation layer. The binary framing pervades the Core Thesis, the deprecation timeline, and the migration strategy.

---

### T2 Summary

| Decision | Chain Termination | Fallacies |
|----------|------------------|-----------|
| GraphQL adoption (Core Thesis + Step 1) | Unsupported assertion (L2) | Appeal to authority, Survivorship bias, False dichotomy |
| Schema-first approach | Supported axiom | None |
| Directive-based auth | Supported axiom (with reservation) | None |
| Deprecation timeline | Unsupported assertion | Begging the question |
| Cross-cutting | N/A | False dichotomy (pervades multiple decisions) |

---

## Step 9 — Competing Alternatives (T4)

### Alternative 1: REST v2 with JSON:API Sparse Fieldsets and Compound Documents

A REST v2 API adopting the JSON:API specification (or a similar convention like OData) would support:

- **Sparse fieldsets** (`?fields[task]=id,title,status`) — clients request only the fields they need, directly eliminating the over-fetching problem cited in the plan.
- **Compound documents / includes** (`?include=comments,attachments`) — clients retrieve related resources in a single request, directly addressing the "8-12 REST calls per screen" problem.
- **Standardized pagination, filtering, and sorting** via query parameters — providing the "flexible querying" that enterprise customers requested.

This approach reuses REST semantics the team already understands, preserves standard HTTP caching (which GraphQL largely breaks by routing all queries through POST to a single endpoint), avoids the operational complexity of query cost analysis and DataLoader patterns, and maintains backward compatibility (v1 endpoints continue working alongside v2).

### Alternative 2: Backend-for-Frontend (BFF) Pattern

A thin BFF aggregation layer sits in front of the existing REST v1 API. Each client type (mobile, web, third-party) gets purpose-built aggregation endpoints that compose multiple v1 calls server-side and return exactly the data shape the client needs. This:

- **Solves the 8-12 calls problem** without changing the underlying API — mobile clients make 1 BFF call instead of 8-12 v1 calls.
- **Can be built incrementally** — one screen at a time, one client at a time — rather than requiring a full API rewrite.
- **Leaves the public API stable** for external developers — no deprecation, no migration, no 410 errors.
- **Eliminates the over-fetching problem for known clients** by returning exactly the data shape each client needs.

---

### Evidence Diagnosticity Analysis

The plan presents several pieces of evidence to support the GraphQL decision. The critical question is: does each piece of evidence *distinguish* GraphQL from the alternatives, or is it equally consistent with all approaches?

| # | Evidence Cited in Plan | Supports GraphQL? | Supports REST v2 (JSON:API)? | Supports BFF? | Diagnostic? |
|---|---|---|---|---|---|
| 1 | "Mobile clients make 8-12 REST calls to assemble a single screen" | Yes (single query) | Yes (compound documents / includes) | Yes (aggregation endpoint) | **No** — consistent with all three |
| 2 | "Over-fetching / response payload sizes too large" | Yes (client-specified fields) | Yes (sparse fieldsets) | Yes (tailored responses) | **No** — consistent with all three |
| 3 | "Enterprise customers requested more flexible querying" | Yes (ad-hoc queries) | Partially (fieldsets + filters + sorting) | No (fixed aggregations) | **Partially** — but plan does not quantify how much flexibility is needed |
| 4 | "GitHub, Shopify, and Stripe have adopted it" | Irrelevant (appeal to authority) | N/A | N/A | **No** — not evidence about this system |
| 5 | "CTO attended a conference keynote" | Irrelevant (appeal to authority) | N/A | N/A | **No** — not evidence about this system |
| 6 | "REST cannot provide flexible querying without dozens of new endpoints" | Only if literally true | **Refuted** — JSON:API provides flexibility without new endpoints | Partially refuted | **Diagnostic but wrong direction** — this claim is false, weakening the GraphQL case |
| 7 | "Average response payload size reduced by 40%" | Yes | Yes (sparse fieldsets achieve same) | Yes (tailored responses) | **No** — consistent with all three |

**Key finding:** Of 7 evidence items, 5 are non-diagnostic (consistent with all approaches), 1 is partially diagnostic but requires scope clarification, and 1 is diagnostic in the wrong direction (the "dozens of endpoints" claim is factually incorrect given JSON:API patterns). Zero pieces of evidence are diagnostic in favor of GraphQL over REST v2 specifically.

The only scenario where GraphQL becomes clearly superior to REST v2 is if the team needs to support arbitrary, deeply nested, ad-hoc queries from unknown future consumers whose query patterns cannot be anticipated. The plan does not establish this requirement. The stated consumers are 47 known endpoints and an identifiable set of enterprise customers — a bounded problem well-suited to REST v2 or BFF.

**REST v2 is not ruled out by the plan's evidence.** The plan provides no analysis, benchmark, prototype, or domain-specific argument that distinguishes GraphQL from a REST v2 with JSON:API conventions. This alternative is not considered, not evaluated, and not ruled out.

---

## Connection: How T2 and T4 Reinforce Each Other

The two techniques attack the same decisions but from different analytical angles — T2 examines the logical structure of the reasoning, T4 examines whether the evidence discriminates between options. Their findings connect and compound.

### Primary Connection: The GraphQL Decision

- **T2 finds:** The why-chain for "Why GraphQL?" collapses at Level 2. The technical justification (REST cannot solve over-fetching) is factually incorrect. The secondary justification (industry leaders adopted it) is an appeal to authority with survivorship bias. The plan frames the choice as a false dichotomy (GraphQL vs. current REST v1).
- **T4 finds:** REST v2 with JSON:API is a concrete, viable alternative that solves every technical problem cited in the plan (over-fetching, multi-call screens, payload sizes) without GraphQL's operational costs. The evidence diagnostic table shows that 5 of 7 evidence items are non-diagnostic, and the remaining items do not favor GraphQL.
- **Combined strength:** T2's unsupported reasoning *feeds* T4's non-diagnostic evidence finding. The reason the evidence is non-diagnostic is precisely because the plan's reasoning contains a false dichotomy: by never considering REST v2, the plan never generates evidence that would distinguish GraphQL from it. T2 explains *why* the evidence fails to discriminate (the reasoning is logically flawed), while T4 demonstrates *that* the evidence fails to discriminate (no evidence item rules out REST v2). Neither finding alone is as damaging: an appeal to authority might be forgivable if no alternatives existed; non-diagnostic evidence might be acceptable if the reasoning chain were otherwise airtight. The combination leaves the GraphQL decision without either logical or evidential support.

### Secondary Connection: The Deprecation Timeline

- **T2 finds:** The 6-month deprecation timeline with 410 cutoff is an unsupported assertion with begging-the-question fallacy.
- **T4 finds:** The BFF alternative (Alternative 2) would eliminate the need for a deprecation timeline entirely — it leaves the existing REST v1 stable for external developers while solving the over-fetching problem for internal clients.
- **Combined insight:** T2 says the deprecation timeline is unjustified. T4 shows that an alternative exists that makes the deprecation question moot. Together, they reveal that the plan not only fails to justify its migration costs but that those costs may be entirely avoidable.

### Divergence: Unique Contributions

- **T2 only:** The analysis of directive-based auth (Decision 3) and schema-first approach (Decision 2) are unique to Socratic deconstruction. T4 focused on the core technology choice, not implementation-level decisions. The finding that schema-first and directive auth are supported axioms provides calibration — not every decision in the plan is flawed.
- **T4 only:** The evidence diagnostic table is unique to the ACH technique. T2 identified that the reasoning was authority-based but did not systematically evaluate each piece of evidence against alternatives. The table's conclusion — that 5 of 7 evidence items are non-diagnostic — is a quantitative finding the Socratic method does not produce.

---

## Evaluation Checklist

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Socratic why-chains and alternative comparison address the same decisions but from different angles | **PASS** | Both techniques address the core GraphQL decision. T2 examines the logical structure (why-chain termination, fallacy identification). T4 examines the evidential support (alternative specification, diagnostic analysis). They converge on the same decision but through different analytical lenses. T2 also examines implementation decisions (auth, schema, deprecation) that T4 does not address. |
| 2 | If a why-chain reveals an unsupported assertion AND competing alternatives shows a viable alternative at that decision point, these are connected in the output | **PASS** | The "Connection" section explicitly links T2's finding (appeal to authority and false dichotomy collapse the why-chain at L2) with T4's finding (REST v2 is a viable alternative the plan ignores, with non-diagnostic evidence). The connection explains the causal relationship: T2's unsupported reasoning feeds T4's non-diagnostic evidence because the false dichotomy prevented the plan from generating discriminating evidence. |
| 3 | Neither technique simply repeats the other's findings in different words | **PASS** | T2 produces why-chains with fallacy labels (appeal to authority, survivorship bias, false dichotomy, begging the question). T4 produces alternative specifications and a 7-row evidence diagnostic table. The "Divergence" subsection explicitly identifies unique contributions: T2 uniquely analyzes auth and schema decisions; T4 uniquely produces the diagnostic evidence table with quantitative non-diagnostic count. |
| 4 | Combined output provides a stronger case than either alone for the seeded GraphQL decision flaw | **PASS** | The "Connection" section explicitly argues that neither finding alone is as damaging: "an appeal to authority might be forgivable if no alternatives existed; non-diagnostic evidence might be acceptable if the reasoning chain were otherwise airtight." T2 alone says "the reasoning is fallacious" but does not demonstrate what was missed. T4 alone says "alternatives exist" but does not expose why they were excluded. Together they show the decision is both logically unsound (T2) and evidentially unsupported (T4), closing both defensive escape routes. |

**Overall: 4/4 PASS**
