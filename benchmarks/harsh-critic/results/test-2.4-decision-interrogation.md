# Test 2.4: Decision Interrogation (G4: T2 + T4)

**Fixture:** plan-api-redesign.md — Redesign Public API from REST v1 to GraphQL

---

## Step 7 — Socratic Deconstruction (T2)

### Decision 1: Adopt GraphQL as the replacement for REST v1

**Why-Chain:**

**Level 1 — Why GraphQL?**
The plan states: "industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority over REST for complex data models."

This is not a technical justification rooted in the team's own requirements. It is a pair of authority-based claims: (a) other companies use it, and (b) a conference speaker said it was superior.

**Level 2 — Why do these authorities' choices apply to our context?**
The plan does not answer this. GitHub, Shopify, and Stripe are platform companies whose primary product is a public developer API consumed by millions of third-party developers. Their adoption calculus (schema introspection for a massive external ecosystem, strongly-typed contracts for unknown consumers) may not transfer to a product API with 47 endpoints and an identifiable set of enterprise customers. The plan provides no analysis showing that the team's constraints (team size, data model complexity, client diversity, operational expertise) resemble those of the cited companies.

**Level 3 — Why assume that what worked for platform-scale companies works for our scale and context?**
No answer is provided. This is where the reasoning chain terminates in an unsupported assertion.

**Fallacies detected:**

| Fallacy | Evidence |
|---|---|
| **Appeal to authority** | The primary justification is "GitHub, Shopify, Stripe adopted it" and "our CTO attended a conference." Neither constitutes a technical argument. The conference keynote is an especially weak form: a keynote is a marketing event, not a peer-reviewed evaluation. |
| **Survivorship bias** | Only companies that successfully adopted GraphQL are cited. Companies that attempted GraphQL and reverted (or chose alternatives) are invisible. There is no mention of organizations that found GraphQL's operational complexity (query cost analysis, N+1 prevention, caching difficulty) to outweigh its benefits. |
| **False dichotomy** | The plan frames the choice as "current REST v1" versus "GraphQL." No intermediate option is considered. The Core Thesis states the REST API "cannot provide [flexible querying] without building dozens of new specialized endpoints," which is false — REST v2 patterns (sparse fieldsets, JSON:API compound documents, Backend-for-Frontend aggregation layers) solve this without dozens of endpoints and without GraphQL. |

---

### Decision 2: Directive-based field authorization over resolver-level checks

**Why-Chain:**

**Level 1 — Why directives over resolver-level auth?**
"Directives keep auth logic visible in the schema rather than buried in code."

**Level 2 — Why is schema visibility the deciding factor?**
Implicitly, the plan assumes that discoverability of auth rules matters more than testability, composability, or granularity. This is unstated and unexamined. Resolver-level checks are easier to unit test in isolation and can incorporate runtime context (e.g., row-level security) that directives handle poorly.

**Level 3 — Why is this tradeoff acceptable for our auth model?**
No answer. The plan does not describe the authorization model's complexity. If the system requires row-level or relationship-based permissions (e.g., "user can see only tasks assigned to their org"), directives like `@auth(requires: ADMIN)` are insufficient and the team will end up adding resolver-level logic anyway, negating the stated benefit.

**Fallacy detected:** Begging the question — the argument assumes that "visible in the schema" is the correct priority without establishing why. The conclusion (directives are better) is embedded in the premise (schema-visible auth is better).

---

### Decision 3: 6-month deprecation timeline with hard 410 cutoff

**Why-Chain:**

**Level 1 — Why 6 months?**
No explicit justification. The timeline is stated as a schedule, not argued.

**Level 2 — Why is 6 months sufficient for external developers to migrate?**
The plan does not reference customer contract obligations, SLA terms, or the typical integration update cycle for enterprise customers. Enterprise integrations often have quarterly release trains, meaning a 6-month window provides at most two release opportunities — and one of those falls during the beta period when the GraphQL API is not yet GA.

**Level 3 — Why return 410 Gone rather than maintaining a frozen REST v1?**
No answer. A hard cutoff creates a forcing function, but the plan does not weigh the cost (customer churn, support burden) against the benefit (reduced maintenance). This is an unstated assumption that operational simplicity trumps customer retention.

---

## Step 9 — Competing Alternatives (ACH-lite)

### Alternative A: REST v2 with Sparse Fieldsets and Compound Documents (JSON:API)

A REST v2 API adopting the JSON:API specification (or a similar convention) would support:
- **Sparse fieldsets** (`?fields[task]=id,title,status`) — clients request only the fields they need, eliminating over-fetching.
- **Compound documents / includes** (`?include=comments,attachments`) — clients retrieve related resources in a single request, eliminating the 8-12 calls per screen problem.
- **Standardized pagination, filtering, and sorting** via query parameters.

This approach reuses REST semantics the team already understands, preserves HTTP caching (which GraphQL largely breaks), and avoids the operational complexity of query cost analysis, DataLoader patterns, and persisted queries.

### Alternative B: Backend-for-Frontend (BFF) Aggregation Layer

A thin BFF layer sits in front of the existing REST v1 API. Each client type (mobile, web, third-party) gets a purpose-built aggregation endpoint that composes multiple v1 calls server-side and returns exactly the data shape the client needs. This:
- Solves the 8-12 calls problem without changing the underlying API.
- Can be built incrementally (one screen at a time) rather than requiring a full rewrite.
- Leaves the public API stable for external developers.

---

### Evidence Diagnostic Analysis

The plan presents several pieces of evidence to support the GraphQL decision. The critical question is: does each piece of evidence *distinguish* GraphQL from the alternatives, or is it equally consistent with all approaches?

| Evidence cited in plan | Supports GraphQL specifically? | Supports REST v2 (JSON:API)? | Supports BFF? | Diagnostic? |
|---|---|---|---|---|
| "8-12 REST calls per screen" | Yes (single query) | Yes (compound documents / includes) | Yes (aggregation endpoint) | **No** — consistent with all three |
| "Over-fetching / payload size" | Yes (client-specified fields) | Yes (sparse fieldsets) | Yes (tailored responses) | **No** — consistent with all three |
| "Enterprise customers requested flexible querying" | Yes (ad-hoc queries) | Partially (fieldsets + filters) | No (fixed aggregations) | **Partially** — but plan does not quantify how much flexibility is needed |
| "GitHub, Shopify, Stripe adopted it" | Irrelevant (appeal to authority) | N/A | N/A | **No** — not evidence about our system |
| "CTO conference keynote" | Irrelevant (appeal to authority) | N/A | N/A | **No** — not evidence about our system |
| "Cannot provide flexible querying without dozens of new endpoints" | Only if literally true | **Refuted** — JSON:API sparse fieldsets + includes provide flexibility without new endpoints | Partially refuted | **Diagnostic but in the wrong direction** — this claim is false and actually weakens the GraphQL case |

**Key finding:** Of the six evidence items the plan presents, **zero are diagnostic in favor of GraphQL over REST v2**. The two technical claims (call reduction, over-fetching) are solved equally by all three approaches. The two authority claims are not evidence at all. The "flexible querying" claim is the closest to diagnostic, but the plan does not establish the required *degree* of flexibility — and REST v2 with sparse fieldsets covers the common cases. The "dozens of new endpoints" claim is factually incorrect when JSON:API patterns are considered.

The only scenario where GraphQL becomes clearly superior is if the team needs to support *arbitrary, deeply nested, ad-hoc queries from unknown future consumers*. The plan does not establish this requirement. The stated consumers are 47 known endpoints and a set of enterprise customers — a bounded problem well-suited to REST v2 or BFF.

---

## Convergent Findings: Connecting Technique Outputs

The two techniques attack the same decisions but expose different facets of the same underlying flaws. Here is where their findings converge and reinforce each other:

### Convergence Point 1: The GraphQL Decision (Decision 1)

- **Socratic Deconstruction** reveals that the why-chain for "Why GraphQL?" terminates at Level 2 in an appeal to authority (GitHub, Shopify, Stripe; CTO conference) with no context-specific technical justification. It also identifies a false dichotomy: the plan considers only REST v1 vs. GraphQL.
- **Competing Alternatives** demonstrates *why* the false dichotomy matters: REST v2 with JSON:API is a concrete, viable alternative that solves every technical problem cited in the plan (over-fetching, multi-call screens) without GraphQL's operational costs. The evidence diagnostic table shows that none of the plan's evidence actually rules out this alternative.

**Combined strength:** The Socratic chain tells us the reasoning is logically unsound (authority-based, dichotomy-constrained). The ACH analysis tells us the reasoning is empirically unsound (the evidence doesn't discriminate). Together, they show both *why the argument fails logically* and *what it fails to consider practically*. Neither finding alone is as damaging: an appeal to authority might be forgivable if no alternatives existed, and non-diagnostic evidence might be acceptable if the reasoning chain were otherwise airtight. The combination leaves the GraphQL decision without either logical or evidential support.

### Convergence Point 2: The "8-12 Calls" Claim

- **Socratic Deconstruction** did not specifically challenge this claim's truth, because the claim itself may be accurate. However, it surfaced the false dichotomy that treats this as a problem only GraphQL can solve.
- **Competing Alternatives** explicitly marks "8-12 calls per screen" as non-diagnostic evidence — it is equally solved by compound documents (REST v2) or server-side aggregation (BFF).

**Combined strength:** The Socratic technique identifies the structural flaw (false dichotomy), while the ACH technique fills in the substance (here are the specific alternatives that also solve it). The Socratic finding without ACH would be abstract ("other options exist"); the ACH finding without Socratic context would lack the logical framing ("the plan's own reasoning structure excludes them").

### Divergence: Unique Contributions

- **Socratic only:** The analysis of Decision 2 (directive-based auth) and Decision 3 (6-month deprecation) are unique to the Socratic technique. ACH focused on the core technology choice, not implementation-level decisions. The begging-the-question fallacy in auth design and the unjustified deprecation timeline are findings that only the why-chain approach surfaced.
- **ACH only:** The evidence diagnostic table is unique to the ACH technique. The Socratic approach identified that the reasoning was authority-based but did not systematically evaluate each piece of evidence against alternatives. The table's conclusion — that zero evidence items are diagnostic — is a quantitative finding the Socratic method does not produce.

---

## Evaluation Checklist

| Criterion | Verdict | Justification |
|---|---|---|
| Socratic why-chains and alternative comparison address the same decisions but from different angles | **PASS** | Both techniques address the core GraphQL decision. Socratic examines the logical structure (why-chain, fallacy identification); ACH examines the evidential support (alternative comparison, diagnostic analysis). They converge on the same decision but through different analytical lenses. |
| If a why-chain reveals an unsupported assertion AND competing alternatives shows a viable alternative at that decision point, these are connected in the output | **PASS** | Convergence Point 1 explicitly connects the Socratic finding (appeal to authority terminates the why-chain at Level 2) with the ACH finding (REST v2 is a viable alternative the plan ignores). Convergence Point 2 connects the false dichotomy finding with the non-diagnostic evidence finding for the "8-12 calls" claim. |
| Neither technique simply repeats the other's findings in different words | **PASS** | The Socratic section produces why-chains and fallacy labels (appeal to authority, false dichotomy, survivorship bias, begging the question). The ACH section produces an alternative specification and an evidence diagnostic table. The "Divergence" subsection explicitly identifies what each technique uniquely contributes: auth and deprecation findings from Socratic only; the diagnostic evidence table from ACH only. |
| Combined output provides a stronger case than either alone for the seeded GraphQL decision flaw (appeal to authority + REST v2 alternative not considered) | **PASS** | Convergence Point 1 explicitly argues that neither finding alone is as damaging as the combination: "An appeal to authority might be forgivable if no alternatives existed, and non-diagnostic evidence might be acceptable if the reasoning chain were otherwise airtight. The combination leaves the GraphQL decision without either logical or evidential support." The Socratic technique alone would say "the reasoning is fallacious" but not demonstrate what was missed; the ACH technique alone would say "alternatives exist" but not expose why they were excluded. Together they show the decision is both logically and evidentially unsupported. |
