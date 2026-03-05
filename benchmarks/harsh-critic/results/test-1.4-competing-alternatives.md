# Test 1.4 — Competing Alternatives (ACH-lite) Analysis

## Plan Under Analysis

**Plan:** Redesign Public API from REST v1 to GraphQL

**Central Approach:** Replace the entire REST v1 API with a GraphQL API to solve over-fetching, reduce multi-call latency for mobile clients, and provide flexible querying for enterprise customers.

**Problem Being Solved:** Mobile clients make 8-12 REST calls per screen (latency/battery drain), responses contain more data than needed (over-fetching), and enterprise customers want more flexible querying. The existing REST v1 API is 3 years old and has not kept pace with the data model's growth.

---

## Alternative Approaches Identified

### Alternative A: REST API v2 with Sparse Fieldsets and Compound Documents (JSON:API)

Redesign the REST API as a v2 conforming to the JSON:API specification (or a similar convention). This directly addresses the stated problems:

- **Over-fetching:** JSON:API's `?fields[resource]=field1,field2` (sparse fieldsets) lets clients request only the fields they need, achieving the same payload reduction GraphQL promises.
- **Multiple round-trips:** JSON:API compound documents (`?include=comments,attachments`) allow a single request to return a primary resource plus its related resources, collapsing the 8-12 calls into 1-2 calls per screen.
- **Flexible querying:** Filtering, sorting, and pagination are standardized in JSON:API. Enterprise customers get query flexibility without a new paradigm.
- **Migration cost:** A REST v2 shares the same HTTP semantics, caching model, and tooling as v1. External developers migrate by updating URLs and adding query parameters — not by learning an entirely new query language.

This is not a strawman. JSON:API is used at scale (Ember ecosystem, numerous enterprise SaaS platforms), and sparse fieldsets + compound documents directly target the exact problems the plan cites.

### Alternative B: Backend-for-Frontend (BFF) Pattern

Introduce a thin BFF layer that aggregates existing REST v1 calls into purpose-built endpoints for each client (mobile, web, enterprise). Each BFF endpoint returns exactly the shape the client needs.

- **Over-fetching:** Each BFF endpoint is tailored, so responses contain only what the client requires.
- **Multiple round-trips:** The BFF does the aggregation server-side; the client makes one call.
- **Flexible querying:** Enterprise customers get their own BFF endpoints or a parameterized BFF surface.
- **Migration cost:** The BFF sits in front of existing REST v1 services. External integrations can continue using REST v1 unchanged; the BFF is an additive layer, not a replacement.

The BFF pattern is used at Netflix, SoundCloud, and many microservice architectures. It is a credible, industry-proven alternative.

---

## Evidence Diagnosticity Analysis

The plan offers several pieces of evidence and reasoning in favor of GraphQL. Below, each is evaluated for whether it is **diagnostic** (uniquely supports GraphQL over the alternatives) or **non-diagnostic** (equally consistent with the alternatives).

| # | Evidence / Reasoning from the Plan | Diagnostic? | Assessment |
|---|-------------------------------------|-------------|------------|
| 1 | "Mobile clients now make 8-12 REST calls to assemble a single screen's data" | **NON-DIAGNOSTIC** | JSON:API compound documents (`?include=`) collapse multiple calls into one. BFF endpoints do the same. This problem is solved equally well by all three approaches. |
| 2 | "Over-fetching problem" / "API response payload sizes reduced by 40%" | **NON-DIAGNOSTIC** | JSON:API sparse fieldsets (`?fields[type]=a,b`) give clients the same per-field control over payload shape. BFF endpoints return only what the client needs. All three approaches achieve this. |
| 3 | "Gives clients control over response shape" | **WEAKLY DIAGNOSTIC** | GraphQL offers the most granular per-query control. However, JSON:API sparse fieldsets + includes offer substantial control, and for many use cases the difference is marginal. This is partially diagnostic but overstated — the plan does not demonstrate that the *degree* of extra flexibility GraphQL provides is needed. |
| 4 | "Industry leaders like GitHub, Shopify, and Stripe have adopted it" | **NON-DIAGNOSTIC** | This is an appeal to authority, not evidence about the team's specific problem. Equally many (or more) successful APIs use REST with modern conventions (Stripe's primary API is REST, not GraphQL). This evidence is consistent with any approach. |
| 5 | "CTO attended a conference where the keynote speaker demonstrated its superiority" | **NON-DIAGNOSTIC** | This is anecdotal and not evidence that bears on the specific tradeoffs in this system. It would not distinguish GraphQL from any alternative. |
| 6 | "Our REST API cannot provide [flexible querying] without building dozens of new specialized endpoints" | **PARTIALLY DIAGNOSTIC, BUT FLAWED** | This is framed as a binary: current REST v1 vs. GraphQL. It ignores that a REST v2 with JSON:API conventions provides flexible querying *without* dozens of specialized endpoints — sparse fieldsets and compound documents are general-purpose mechanisms. The reasoning contains a false dichotomy. |
| 7 | "Several enterprise customers have requested more flexible querying" | **NON-DIAGNOSTIC** | All three approaches offer more flexible querying than REST v1. JSON:API filtering/sorting/sparse fieldsets address this. BFF can expose parameterized endpoints. This does not uniquely favor GraphQL. |

### Summary of Diagnosticity

- **5 of 7 pieces of evidence are fully non-diagnostic** — they support all three approaches equally and cannot be used to choose between them.
- **1 piece is weakly diagnostic** (granular per-field control) but the plan does not demonstrate that this extra granularity over JSON:API sparse fieldsets is actually required.
- **1 piece contains a false dichotomy** that ignores the REST v2 alternative entirely.

---

## Judgment: Does the Plan's Evidence Rule Out the Alternatives?

**No. The plan's evidence does not rule out either alternative.**

The core problems cited — over-fetching, multiple round-trips per screen, need for flexible querying — are solved by REST v2 with JSON:API conventions (Alternative A) and by the BFF pattern (Alternative B) with comparable effectiveness.

The plan's reasoning contains two critical weaknesses:

1. **False dichotomy.** The plan frames the choice as "current REST v1 (broken) vs. GraphQL (solution)" and never considers a REST v2 that incorporates modern conventions like sparse fieldsets and compound documents. The statement "our REST API cannot provide [flexibility] without building dozens of new specialized endpoints" is only true of the *current* v1 design, not of REST as an architectural style.

2. **Non-diagnostic evidence treated as decisive.** The majority of the plan's evidence — 8-12 calls per screen, over-fetching, enterprise flexibility requests — is consistent with all approaches. The plan treats this evidence as if it uniquely supports GraphQL, but it does not. Under ACH principles, evidence that is equally consistent with competing hypotheses has zero diagnostic value for choosing between them.

Furthermore, the alternatives have advantages the plan does not address:

- **REST v2 (JSON:API):** Leverages existing HTTP caching infrastructure natively (ETags, CDN caching per-URL), avoids the complexity of GraphQL query complexity analysis, requires far less migration effort from external developers (same HTTP verbs, same mental model), and avoids the well-known GraphQL pitfalls of N+1 resolver queries and cache invalidation complexity.
- **BFF pattern:** Can be implemented incrementally with zero disruption to existing integrations, does not require external developers to learn anything new, and the aggregation layer can be optimized per-client.

---

## FINDING: Approach Selection Is Unsupported

The plan's choice of GraphQL over alternatives is a **finding**. The decision to adopt GraphQL is not justified by diagnostic evidence. The plan would need to demonstrate at least one of the following to rule out alternatives:

- A concrete use case where per-field, per-query flexibility *beyond* what JSON:API sparse fieldsets provide is required
- Evidence that external developers prefer GraphQL over improved REST (the plan assumes this; the satisfaction metric is forward-looking, not evidence)
- A cost-benefit analysis comparing GraphQL migration cost (new paradigm, new tooling, resolver implementation, query complexity protection, cache redesign) against REST v2 migration cost (URL versioning, add sparse fieldset/include support to existing controllers)
- An analysis of GraphQL-specific risks (query complexity attacks, N+1 resolver problems, loss of HTTP-native caching) and why they are acceptable

None of these appear in the plan. The approach selection appears to be driven primarily by industry hype and a conference talk rather than by diagnostic analysis of the team's specific problem.

---

## Self-Evaluation Checklist

| Criterion | Result | Notes |
|-----------|--------|-------|
| 1-2 specific, credible alternative approaches identified (not strawmen) | **PASS** | REST v2 with JSON:API (sparse fieldsets, compound documents) and BFF pattern are both industry-proven, credible alternatives that directly solve the stated problems. |
| Seeded flaw: REST API v2 alternative identified as a strong competing approach | **PASS** | Alternative A is explicitly "REST API v2 with Sparse Fieldsets and Compound Documents (JSON:API)" and is evaluated as the strongest competitor. |
| Each alternative is evaluated against the plan's evidence | **PASS** | All 7 pieces of evidence/reasoning from the plan are evaluated in the diagnosticity table against both alternatives. |
| Non-diagnostic evidence is identified | **PASS** | 5 of 7 pieces are marked non-diagnostic with explanations. The "8-12 REST calls per screen" example is specifically called out as solvable by both GraphQL and REST v2 compound documents. |
| A clear judgment is made: does the plan's evidence rule out the alternatives or not? | **PASS** | Judgment section explicitly states "No. The plan's evidence does not rule out either alternative." with detailed reasoning. |
| If alternatives are not ruled out, this is flagged as a finding about approach selection | **PASS** | A dedicated "FINDING: Approach Selection Is Unsupported" section flags this and specifies what evidence would be needed to justify the choice. |
| Alternatives are NOT weak strawmen | **PASS** | Both alternatives are real industry patterns with named adopters and specific mechanisms that map to each stated problem. |
| Evidence diagnosticity IS evaluated | **PASS** | A 7-row table evaluates each piece of evidence as diagnostic, non-diagnostic, or partially diagnostic. |
| Conclusion is NOT vague | **PASS** | The conclusion is specific: approach selection is unsupported, with four concrete items the plan would need to provide. |
| The obvious REST alternative is NOT missed | **PASS** | REST v2 with JSON:API is the primary alternative analyzed. |
