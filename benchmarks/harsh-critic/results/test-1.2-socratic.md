# Test 1.2: Socratic Deconstruction — API Redesign Plan

**Fixture:** `plan-api-redesign.md`
**Technique:** Socratic Deconstruction (why-chains + logical fallacy scan)

---

## Decisions Identified

The plan contains the following four major decisions:

1. **Adopt GraphQL** as the replacement for REST v1 (Core Thesis + Step 1 decision: justified by industry leader adoption and CTO conference attendance)
2. **Schema-first approach with SDL files** and Relay-style cursor pagination (Step 1 approach)
3. **Directive-based field authorization** over resolver-level checks (Step 3 decision)
4. **6-month deprecation timeline** with hard 410 Gone cutoff (Step 6)

---

## Decision 1: Adopt GraphQL Because Industry Leaders Use It

**As stated:** "We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority over REST for complex data models."

This is the plan's primary justification for the GraphQL migration. While the Core Thesis also cites over-fetching as a motivation, Step 1 makes the actual decision rationale explicit: the choice is driven by industry leader precedent and a conference keynote.

### Why-Chain

**Level 1 — Why adopt GraphQL?**
The plan states that GitHub, Shopify, and Stripe have adopted it, and the CTO saw a conference keynote demonstrating GraphQL's superiority over REST for complex data models.

**Level 2 — Why is the adoption by other companies and a conference keynote a sufficient reason for our adoption?**
This reasoning collapses. The adoption of a technology by other companies is evidence that those companies found it suitable for their specific constraints, scale, data models, and team capabilities. It is not evidence that the technology is suitable for ours. GitHub is a developer tools platform with deeply nested relational data and hundreds of engineers. Shopify is an e-commerce platform with high-throughput storefront queries. Stripe is a payments API whose primary public API is famously REST — their GraphQL usage is limited and internal. None of these companies share our data model, team size ("3 developers for 4 weeks"), client population, or operational constraints. The CTO's conference keynote is a marketing presentation, not an engineering evaluation. A keynote is designed to persuade, not to provide domain-specific evidence. No benchmarks, prototypes, or comparative analysis of our specific system were performed. The chain collapses here because the authority being cited (industry leaders, conference speaker) provides no domain-specific evidence for our context.

**Level 3 — Why should we believe that the technology choices of unrelated companies predict success for our system?**
There is no reason to believe this without a domain-specific analysis showing that our constraints match theirs. The plan provides none. Furthermore, the selection of GitHub, Shopify, and Stripe as examples is itself misleading — these are companies known to have adopted GraphQL, but companies that tried GraphQL and reverted, or that solve similar problems without GraphQL, are not mentioned. The evidence is cherry-picked from successes.

### Chain Termination: **COLLAPSES AT LEVEL 2 — Appeal to Authority**
The chain does not reach a supported premise or even a debatable assertion. It collapses at Level 2 because the sole justification — other companies use it, and a conference speaker endorsed it — is an appeal to authority that provides no evidence relevant to this system's specific requirements.

### Fallacy Scan

- **Appeal to authority without evidence: DETECTED.** This is a textbook example. The plan cites three companies (GitHub, Shopify, Stripe) as "industry leaders" whose adoption justifies ours, without any domain-specific evidence — no benchmarks, no comparison of data model complexity, no prototype results. The CTO's conference attendance is cited as further evidence: "our CTO attended a conference where the keynote speaker demonstrated its superiority." A keynote demonstration is a persuasive presentation, not an engineering evaluation. The plan treats external adoption and a conference experience as substitutes for technical analysis.

- **Survivorship bias: DETECTED.** The plan cites GitHub, Shopify, and Stripe — three companies known to have successfully adopted GraphQL — while ignoring companies that adopted GraphQL and later scaled it back, encountered significant performance or complexity challenges, or abandoned it. It also ignores that Stripe's primary public API remains REST, undermining the citation. By selecting only visible successes, the plan creates a misleading impression of GraphQL's universal suitability.

- **False dichotomy: NOT DETECTED** in this specific decision (but see cross-cutting finding below).

- **Begging the question: NOT DETECTED** in this specific decision.

---

## Decision 2: Schema-First Approach with SDL Files

**As stated:** "Use a schema-first approach with SDL files. [...] Include pagination via Relay-style cursor connections."

### Why-Chain

**Level 1 — Why a schema-first approach with Relay-style cursors?**
The plan does not provide an explicit justification. The implicit reasoning is that schema-first development and Relay-style cursors are established best practices in the GraphQL ecosystem.

**Level 2 — Why are GraphQL ecosystem conventions sufficient justification for these architectural choices?**
Following ecosystem conventions is a reasonable starting point when the conventions align with the system's requirements. Schema-first development enforces a contract-driven workflow where the API surface is defined before implementation, which provides clear documentation, enables parallel frontend/backend development, and catches breaking changes at the schema level. These are well-understood engineering benefits that do not depend on our specific context to hold. Relay-style cursor pagination is the GraphQL community's standardized pagination pattern, supported by client libraries and tooling. Adopting it reduces friction for external developers familiar with GraphQL conventions.

**Level 3 — Why should we believe these conventions will work for our specific system?**
The core benefits of schema-first development (contract clarity, parallel development, breaking-change detection) are domain-independent engineering properties — they apply regardless of our specific data model. The choice is defensible on first principles. For Relay cursors specifically, there is a minor concern: if the underlying database uses OFFSET/LIMIT rather than cursor-based queries, the cursors may be a leaky abstraction. However, this is an implementation detail that does not undermine the architectural decision itself.

### Chain Termination: **SUPPORTED AXIOM**
The chain terminates in a supported axiom: schema-first development provides contract clarity and parallel development benefits that are well-established engineering principles, not dependent on domain-specific evidence. The Relay cursor choice is convention-driven but supported by tooling and ecosystem compatibility arguments.

### Fallacy Scan

- **False dichotomy: NOT DETECTED.**
- **Appeal to authority without evidence: NOT DETECTED.** While the choice follows ecosystem convention, the underlying reasons (contract clarity, tooling support) are substantive engineering arguments, not mere citation of authority.
- **Begging the question: NOT DETECTED.**
- **Survivorship bias: NOT DETECTED.**

No fallacies detected.

---

## Decision 3: Directive-Based Field Authorization Over Resolver-Level Checks

**As stated:** "We chose directive-based field auth over resolver-level checks because directives keep auth logic visible in the schema rather than buried in code."

### Why-Chain

**Level 1 — Why directive-based auth over resolver-level checks?**
The plan states that directives keep authorization logic "visible in the schema rather than buried in code."

**Level 2 — Why is schema visibility of auth logic a sufficient reason to prefer directives over resolver-level checks?**
Schema visibility is a genuine engineering benefit: it makes authorization rules discoverable by reading the schema definition rather than tracing through resolver implementations. This supports auditability (security reviewers can see which fields are protected without reading code), documentation (the schema is self-documenting for authorization), and enforcement (a field without an auth directive is visibly unprotected). These benefits are real and do not depend on external authority or domain-specific evidence — they follow from the general principle that declarative, visible constraints are easier to audit than imperative, distributed ones.

**Level 3 — Why should we believe that the auditability and visibility advantages of directives outweigh potential limitations?**
The auditability argument is grounded in a well-established software engineering principle: declarative specifications of security constraints are easier to review comprehensively than imperative implementations scattered across resolvers. This is the same reasoning behind declarative RBAC policies, database constraints, and security annotations in frameworks like Spring Security. The principle is sound. There is a valid concern that directive-based auth may struggle with complex, context-dependent rules (e.g., "user can see this field only if they belong to the owning organization"), but the plan's example (`@auth(requires: ADMIN)`) shows a role-based model, which is well-suited to the directive pattern. Whether it scales to the full authorization model is an implementation question, not a structural flaw in the decision.

### Chain Termination: **SUPPORTED AXIOM**
The chain terminates in the supported axiom that declarative, schema-visible security constraints are easier to audit and maintain than imperative, resolver-distributed ones. This is a well-established principle in software security design.

### Fallacy Scan

- **False dichotomy: NOT DETECTED.** While the plan frames it as directives vs. resolvers (not mentioning middleware or policy engines), the two options presented are the two most common approaches in the GraphQL ecosystem, making this a reasonable scope of comparison rather than an artificial exclusion.
- **Appeal to authority without evidence: NOT DETECTED.**
- **Begging the question: NOT DETECTED.**
- **Survivorship bias: NOT DETECTED.**

No fallacies detected.

---

## Decision 4: 6-Month Deprecation Timeline with Hard 410 Cutoff

**As stated:** Months 1-2: GraphQL API in beta alongside REST v1. Months 3-4: GraphQL GA with REST v1 marked deprecated with sunset headers. Months 5-6: REST v1 returns 410 Gone for unmigrated clients.

### Why-Chain

**Level 1 — Why a 6-month timeline with a hard cutoff?**
The plan states this as the deprecation schedule but provides no explicit justification for the timeline length or the hard-cutoff approach.

**Level 2 — Why is 6 months sufficient for external developers to migrate from REST to an entirely different API paradigm?**
This would be sufficient only if (a) the number and diversity of external integrations is known and manageable, (b) external developers have the GraphQL expertise and development capacity to migrate within this window, (c) the REST-to-GraphQL proxy (Step 5) provides a genuine safety net, and (d) there are no contractual or SLA obligations that prevent hard cutoffs. The plan provides no data on any of these factors. It does not state how many external integrations exist, whether external developers have been consulted, or whether enterprise customers have contractual API stability guarantees.

**Level 3 — Why should we believe 6 months is the right timeline when the plan provides no data about external developer capacity, contractual constraints, or migration precedent?**
The plan asserts the timeline as given. It offers the REST-to-GraphQL proxy as a migration aid, but the proxy is itself a temporary measure that will be removed. The 410 hard cutoff at month 6 means that any external integration that has not migrated will simply break — returning 410 Gone is not a graceful degradation, it is a service termination. The plan provides no evidence that 6 months is based on analysis of the external developer population, historical API migration timelines, or customer contractual requirements. The timeline appears to be chosen for internal convenience (matching the development schedule) rather than derived from external constraints. This is an assertion presented as a plan, not a justified decision.

### Chain Termination: **UNSUPPORTED ASSERTION AT LEVEL 3**
The chain terminates in an unsupported assertion: the 6-month timeline is stated without any supporting evidence about external developer capacity, contractual constraints, or historical precedent. The hard 410 cutoff is asserted as acceptable without analysis of its impact on external integrations.

### Fallacy Scan

- **False dichotomy: NOT DETECTED.**
- **Appeal to authority without evidence: NOT DETECTED.**
- **Begging the question: DETECTED.** The plan's deprecation timeline implicitly assumes that 6 months is sufficient for migration because the plan provides a 6-month deprecation timeline. The justification for the timeline is the timeline itself — "we set a 6-month sunset, therefore clients have 6 months to migrate, therefore 6 months is enough." No external evidence is cited to validate that 6 months actually corresponds to the migration capacity of the developer population. The plan assumes its own timeline is adequate as a premise of the timeline being adequate.
- **Survivorship bias: NOT DETECTED.**

---

## Cross-Cutting Finding: False Dichotomy in the Plan's Framing

Beyond the four individual decisions, the plan as a whole exhibits a **false dichotomy** that shapes every downstream decision. The Core Thesis states: "GraphQL is the right replacement for our REST API because it solves the over-fetching problem and gives clients control over response shape, which our REST API cannot provide without building dozens of new specialized endpoints."

This frames the choice as: keep REST v1 exactly as-is, or replace it entirely with GraphQL. It never considers:
- A **REST v2** with sparse fieldsets (`?fields=id,name,email`) to address over-fetching
- A **JSON:API** implementation with compound documents and field selection
- An **OData-style** approach with `$select` and `$expand`
- A **Backend-for-Frontend (BFF)** pattern where a thin aggregation layer assembles mobile-optimized responses from existing endpoints
- A **partial GraphQL adoption** for the mobile use case only, keeping REST for existing integrations

The claim that REST "cannot provide" flexible querying "without building dozens of new specialized endpoints" is demonstrably false — REST APIs routinely support field selection, resource embedding, and compound documents via query parameters without new endpoints. By excluding all intermediate solutions, the plan artificially narrows the decision space to a binary choice that makes GraphQL appear inevitable.

**Fallacy: False Dichotomy — DETECTED at the plan level.** The plan presents exactly two options (keep current REST v1 or replace with GraphQL) while ignoring well-established alternatives that could address the stated problems at far lower cost and risk.

---

## Summary of Findings

| Decision | Chain Termination | Fallacies Detected |
|---|---|---|
| 1. Adopt GraphQL (industry leaders) | Collapses at Level 2 (appeal to authority) | Appeal to Authority, Survivorship Bias |
| 2. Schema-first SDL with Relay cursors | Supported axiom | None |
| 3. Directive-based field auth | Supported axiom | None |
| 4. 6-month deprecation with 410 cutoff | Unsupported assertion at Level 3 | Begging the Question |
| Cross-cutting | — | False Dichotomy (only GraphQL vs current REST, no REST v2 or alternatives considered) |

**Most damaging flaws:**

1. **Decision 1** — the adoption of GraphQL is justified entirely by appeal to authority (industry leaders, conference keynote) with survivorship bias in the selection of cited examples. No domain-specific evidence, benchmarks, or prototypes support the decision. The chain does not merely terminate in an unsupported assertion — it collapses at Level 2 because the cited authorities provide zero evidence relevant to this system.

2. **Cross-cutting false dichotomy** — the plan frames the decision as "current REST v1 or GraphQL" while never considering REST v2 with field selection, JSON:API, BFF patterns, or other incremental solutions. This artificial narrowing makes GraphQL appear to be the only viable option when multiple lower-cost alternatives exist.

3. **Decision 4** — the 6-month hard deprecation timeline is asserted without any evidence about external developer capacity or contractual constraints, with circular reasoning (the timeline justifies itself).

---

## Evaluation Checklist

- [x] **PASS** — Each major decision in the plan has a visible 3-level why-chain.
  All four decisions have explicit Level 1, Level 2, and Level 3 questions with answers.

- [x] **PASS** — Why-chains are genuinely recursive (each level questions the previous answer, not just rephrasing).
  Each level interrogates a new aspect: Level 1 asks "why this approach," Level 2 asks "why is that justification sufficient," Level 3 asks "why should we believe the underlying premise." The levels are distinct.

- [x] **PASS** — At least one chain terminates in an unsupported assertion and this is flagged.
  Decision 4 terminates in an unsupported assertion, explicitly labeled "UNSUPPORTED ASSERTION AT LEVEL 3." Decision 1 collapses at Level 2 due to appeal to authority, which is a stronger failure mode.

- [x] **PASS** — Seeded flaw: appeal to authority for GraphQL decision is detected in fallacy scan (justified by "GitHub, Shopify, Stripe adopted it" and CTO's conference).
  Decision 1 explicitly identifies the appeal to authority, naming all three companies and the CTO conference keynote as textbook examples of the fallacy. Survivorship bias in the selection of examples is also detected.

- [x] **PASS** — Seeded flaw: false dichotomy (only GraphQL vs current REST API, no REST v2 considered) is detected.
  The cross-cutting finding explicitly identifies the false dichotomy, noting that the plan never considers REST v2 with sparse fieldsets, JSON:API, OData, BFF patterns, or partial GraphQL adoption.

- [x] **PASS** — Fallacy scan explicitly checks for the 4 listed fallacy types (not a generic "reasoning seems weak").
  Each decision's fallacy scan enumerates all four types: false dichotomy, appeal to authority without evidence, begging the question, and survivorship bias, with explicit DETECTED or NOT DETECTED verdicts.

- [x] **PASS** — Output clearly labels where each chain terminates and why.
  Each decision has a "Chain Termination" line with bold labeling: "COLLAPSES AT LEVEL 2" for Decision 1, "SUPPORTED AXIOM" for Decisions 2 and 3, and "UNSUPPORTED ASSERTION AT LEVEL 3" for Decision 4.
