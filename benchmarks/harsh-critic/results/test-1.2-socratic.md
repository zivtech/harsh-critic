# Test 1.2: Socratic Deconstruction — API Redesign Plan

**Fixture:** `plan-api-redesign.md`
**Technique:** Socratic Deconstruction (why-chains + logical fallacy scan)

---

## Decisions Identified

The plan contains the following major decisions:

1. Replace REST v1 with GraphQL (the core thesis)
2. Use GraphQL specifically because industry leaders adopted it and CTO saw a conference keynote (Step 1 decision)
3. Use directive-based field authorization over resolver-level checks (Step 3 decision)
4. 6-month deprecation timeline with hard cutoff returning 410 Gone (Step 6)
5. REST-to-GraphQL proxy as the migration bridge (Step 5)
6. Schema-first approach with Relay-style cursor pagination (Step 1 approach)

---

## Decision 1: Replace REST v1 with GraphQL (Core Thesis)

**As stated:** "GraphQL is the right replacement for our REST API because it solves the over-fetching problem and gives clients control over response shape, which our REST API cannot provide without building dozens of new specialized endpoints."

### Why-Chain

**Level 1 — Why GraphQL as the replacement?**
The plan states it solves over-fetching and gives clients control over response shape, which REST v1 cannot do "without building dozens of new specialized endpoints."

**Level 2 — Why is "solves over-fetching and gives client control" a sufficient reason to adopt an entirely new API paradigm?**
This reason would be sufficient only if (a) over-fetching is the primary pain point causing measurable harm, (b) no incremental improvement to REST could address it, and (c) the costs of a full paradigm migration are justified by the gains. The plan provides some evidence for (a) — mobile clients making 8-12 calls per screen — but no evidence for (b). The claim that REST "cannot provide" flexible responses "without building dozens of new specialized endpoints" is presented as self-evident. A REST v2 with sparse fieldsets (e.g., `?fields=id,name,email`), compound documents (JSON:API style), or BFF (Backend-for-Frontend) patterns could address over-fetching without a paradigm shift. The plan never considers these alternatives.

**Level 3 — Why should we believe that REST cannot be incrementally improved to solve over-fetching?**
There is no evidence provided for this premise. The plan asserts that the only way REST could support flexible responses is by "building dozens of new specialized endpoints," but this is not true — REST APIs routinely support field selection, resource embedding, and compound documents via query parameters. The premise that REST is incapable of solving the over-fetching problem is an unsupported assertion that serves as the foundation for the entire plan.

### Chain Termination: **UNSUPPORTED ASSERTION**
The chain terminates at the claim that REST cannot be improved to address over-fetching. This is stated as fact but is demonstrably false — multiple well-established REST patterns (sparse fieldsets, JSON:API, OData `$select`/`$expand`) solve exactly this problem. The plan provides no analysis of why these alternatives were rejected.

### Fallacy Scan

- **False dichotomy: DETECTED.** The plan presents exactly two options: keep the current REST v1 API as-is, or replace it with GraphQL. It never considers a REST v2 with field selection, a JSON:API implementation, an OData-style approach, a Backend-for-Frontend pattern, or any other intermediate solution. The Core Thesis makes this dichotomy explicit: REST "cannot provide" flexible querying "without building dozens of new specialized endpoints" — framing the choice as "GraphQL or dozens of endpoints" while ignoring well-known REST patterns that provide flexible querying with minimal endpoint changes.

- **Appeal to authority without evidence: NOT DETECTED HERE** (but see Decision 2 below, where this is the primary justification).

- **Begging the question: DETECTED.** The Core Thesis states GraphQL is the "right replacement" because it "solves the over-fetching problem." But whether over-fetching is best solved by a full API paradigm replacement (rather than incremental REST improvements) is precisely the question the plan should be answering. The plan assumes the conclusion (GraphQL is the right solution) in its premises (we need GraphQL's features) without demonstrating that only GraphQL can provide those features.

- **Survivorship bias: NOT DETECTED** in this specific decision.

---

## Decision 2: Adopting GraphQL Because Industry Leaders Use It (Step 1 Decision)

**As stated:** "We are using GraphQL because industry leaders like GitHub, Shopify, and Stripe have adopted it, and our CTO attended a conference where the keynote speaker demonstrated its superiority over REST for complex data models."

### Why-Chain

**Level 1 — Why use GraphQL because GitHub, Shopify, and Stripe adopted it?**
The implicit reasoning is that these are successful, technically sophisticated companies, so their technology choices are likely sound and applicable to our context.

**Level 2 — Why is the adoption by other companies a sufficient reason for our adoption?**
It would be sufficient only if our technical context, scale, team capabilities, data model, and client needs closely mirror those of GitHub, Shopify, and Stripe. The plan provides no evidence of this similarity. GitHub is a developer tools platform with deeply nested relational data. Shopify is an e-commerce platform with high-throughput storefront queries. Stripe is a payments API with a famously well-designed REST API (Stripe's primary public API remains REST; their GraphQL usage is limited). These companies have different data models, different client populations, and engineering teams orders of magnitude larger than "3 developers for 4 weeks." Their decision to adopt GraphQL was based on their specific constraints, not ours.

**Level 3 — Why should we believe that the technology choices of unrelated companies with different constraints predict success for our system?**
There is no reason to believe this without a domain-specific analysis showing that our constraints match theirs. The plan provides a CTO's conference experience as additional support, but a keynote demonstration of "superiority" is a marketing event, not an engineering evaluation. No benchmarks, prototypes, or domain-specific evidence are cited.

### Chain Termination: **UNSUPPORTED ASSERTION**
The chain terminates at the implicit premise that adoption by industry leaders constitutes evidence of suitability for our specific system. This is asserted but never supported with any domain-specific analysis.

### Fallacy Scan

- **False dichotomy: NOT DETECTED** in this specific decision statement (though the broader plan has this flaw; see Decision 1).

- **Appeal to authority without evidence: DETECTED.** This is a textbook example. The plan cites three companies (GitHub, Shopify, Stripe) as "industry leaders" whose adoption of GraphQL justifies ours. No domain-specific evidence is provided — no benchmarks, no comparison of our data model complexity to theirs, no prototype results. Furthermore, the CTO's conference attendance is cited as evidence: "our CTO attended a conference where the keynote speaker demonstrated its superiority." A conference keynote is a persuasive presentation, not an engineering evaluation. The plan treats the CTO's experience of a keynote as technical evidence, which is an appeal to the authority of the keynote speaker without any supporting data.

- **Begging the question: NOT DETECTED** in this specific decision.

- **Survivorship bias: DETECTED.** The plan cites GitHub, Shopify, and Stripe — three companies known to have adopted GraphQL successfully — while ignoring companies that adopted GraphQL and later scaled it back, encountered significant performance challenges, or abandoned it. It also ignores that Stripe's primary public API remains REST, which undermines the citation. By selecting only successful adopters, the plan creates a misleading impression of GraphQL's universal suitability. Companies that tried GraphQL and reverted to REST (or never adopted it despite being "industry leaders") are invisible in this analysis.

---

## Decision 3: Directive-Based Field Authorization Over Resolver-Level Checks (Step 3)

**As stated:** "We chose directive-based field auth over resolver-level checks because directives keep auth logic visible in the schema rather than buried in code."

### Why-Chain

**Level 1 — Why directive-based auth over resolver-level checks?**
The plan states that directives keep auth logic "visible in the schema rather than buried in code."

**Level 2 — Why is schema visibility of auth logic a sufficient reason to prefer directives?**
Visibility is one engineering concern among several. A sufficient justification would also need to address: (a) whether directive-based auth handles complex, context-dependent authorization rules (e.g., "user can see this field only if they are a member of the owning organization"), (b) whether directives can compose and interact correctly with other directives, (c) whether the testing story for directive-based auth is adequate, and (d) whether the team has experience with this pattern. The plan addresses none of these. Resolver-level auth, while less visible in the schema, offers more flexibility for complex rules and is easier to unit test in isolation.

**Level 3 — Why should we believe that "visibility in the schema" outweighs the flexibility and testability advantages of resolver-level auth?**
The plan does not make this case. The preference for visibility is stated as self-evidently good, but many production GraphQL APIs use resolver-level auth precisely because real-world authorization rules are too complex for declarative directives. The plan's authorization example (`@auth(requires: ADMIN)`) is a simple role check; whether this scales to the actual authorization model of the application is not analyzed.

### Chain Termination: **UNSUPPORTED ASSERTION**
The chain terminates at the unexamined premise that schema visibility is the overriding concern for authorization design. No analysis of the complexity of the actual authorization model, the composability of directives, or the testability tradeoffs is provided.

### Fallacy Scan

- **False dichotomy: DETECTED.** The plan presents exactly two options: directive-based auth or resolver-level checks. Other approaches exist: middleware-based auth layers, policy engines (e.g., OPA/Rego), authorization-as-a-service, or hybrid approaches where simple rules use directives and complex rules use resolvers. The binary framing prevents consideration of potentially better-fitting solutions.

- **Appeal to authority without evidence: NOT DETECTED.**

- **Begging the question: NOT DETECTED.**

- **Survivorship bias: NOT DETECTED.**

---

## Decision 4: 6-Month Deprecation Timeline with Hard 410 Cutoff (Step 6)

**As stated:** Months 1-2 beta, Months 3-4 GA with deprecation, Months 5-6 REST returns 410 Gone for unmigrated clients.

### Why-Chain

**Level 1 — Why a 6-month timeline with a hard cutoff?**
The plan states this as the timeline but provides no explicit justification. The implicit reasoning is likely: 6 months provides enough time for clients to migrate.

**Level 2 — Why is 6 months sufficient for external developers to migrate from REST to an entirely different API paradigm?**
This would be sufficient only if (a) the number and diversity of external integrations is small enough, (b) the REST-to-GraphQL proxy provides a genuine safety net, and (c) external developers have the GraphQL expertise and development capacity to migrate within this window. The plan does not state how many external integrations exist, what their diversity looks like, or whether external developers have been consulted about the timeline.

**Level 3 — Why should we believe external developers can and will migrate within 6 months when the plan provides no data about their capacity or willingness?**
There is no evidence. The plan states a timeline without any reference to customer input, historical migration data from comparable deprecations, or contractual obligations (SLAs, enterprise agreements) that might prohibit hard cutoffs.

### Chain Termination: **UNSUPPORTED ASSERTION**
The 6-month timeline is asserted without any supporting evidence about external developer capacity, contractual constraints, or historical precedent for API migration timelines.

### Fallacy Scan

- **False dichotomy: NOT DETECTED.**
- **Appeal to authority without evidence: NOT DETECTED.**
- **Begging the question: NOT DETECTED.**
- **Survivorship bias: NOT DETECTED.**

No specific fallacies from the four listed types are detected in this decision, though the absence of any justification is itself a critical weakness.

---

## Decision 5: REST-to-GraphQL Proxy as Migration Bridge (Step 5)

**As stated:** "Build a REST-to-GraphQL proxy that translates incoming REST calls to GraphQL queries, allowing existing integrations to work without code changes during the transition period."

### Why-Chain

**Level 1 — Why build a translation proxy rather than running both APIs in parallel against the same data layer?**
The implicit reasoning is that a proxy avoids maintaining two codebases, since all requests ultimately flow through the GraphQL layer.

**Level 2 — Why is a translation proxy a sufficient migration strategy?**
It would be sufficient only if the proxy can faithfully reproduce REST v1 behavior — including error formats, pagination semantics, rate limiting behavior, header conventions, and edge cases — through GraphQL translation. REST and GraphQL have fundamentally different error models (HTTP status codes vs. `errors` array in a 200 response), different pagination models (page/offset vs. cursors), and different caching semantics. The plan does not address how these semantic mismatches will be handled.

**Level 3 — Why should we believe the proxy can faithfully reproduce REST semantics through GraphQL without introducing subtle behavioral changes that break existing integrations?**
The plan provides no analysis of this risk. In practice, REST-to-GraphQL proxies frequently introduce subtle changes in error handling, pagination behavior, and response structure. The plan treats the proxy as a transparent pass-through, which is an optimistic assumption that is not supported.

### Chain Termination: **UNSUPPORTED ASSERTION**
The chain terminates at the assumption that a REST-to-GraphQL proxy can transparently preserve REST v1 behavior. This is asserted but not analyzed.

### Fallacy Scan

- **False dichotomy: NOT DETECTED.**
- **Appeal to authority without evidence: NOT DETECTED.**
- **Begging the question: NOT DETECTED.**
- **Survivorship bias: NOT DETECTED.**

---

## Decision 6: Schema-First Approach with Relay-Style Cursor Pagination (Step 1)

**As stated:** "Use a schema-first approach with SDL files. [...] Include pagination via Relay-style cursor connections."

### Why-Chain

**Level 1 — Why schema-first with Relay-style cursors?**
The implicit reasoning is that schema-first is an industry best practice for GraphQL, and Relay-style cursors are the standard pagination approach in the GraphQL ecosystem.

**Level 2 — Why is following GraphQL ecosystem conventions sufficient justification?**
It would be sufficient if the team has experience with schema-first development and if Relay-style cursors match the existing data access patterns. Schema-first requires maintaining SDL files in sync with resolvers, which can be error-prone. Relay cursors assume cursor-based database queries, which may not align with the existing REST API's offset-based pagination that clients currently rely on. The plan does not address whether the existing data layer supports efficient cursor-based pagination.

**Level 3 — Why should we believe cursor-based pagination is appropriate when the existing system presumably uses offset-based pagination?**
The plan provides no analysis of the current pagination model or the cost of transitioning. If the underlying database queries use OFFSET/LIMIT, Relay-style cursors may be a leaky abstraction that provides no real performance benefit while complicating the implementation. The choice appears driven by convention rather than analysis.

### Chain Termination: **UNSUPPORTED ASSERTION**
The choice of Relay-style cursors is convention-driven with no analysis of whether the underlying data layer supports efficient cursor-based queries.

### Fallacy Scan

- **False dichotomy: NOT DETECTED.**
- **Appeal to authority without evidence: MINOR INSTANCE.** The choice of Relay-style cursors appears to be driven by ecosystem convention ("this is what GraphQL projects do") rather than evidence that it fits this system's needs. This is a mild form of appeal to authority (the authority being ecosystem convention), though less egregious than the industry-leader citation in Decision 2.
- **Begging the question: NOT DETECTED.**
- **Survivorship bias: NOT DETECTED.**

---

## Summary of Findings

| Decision | Chain Termination | Fallacies Detected |
|---|---|---|
| 1. Replace REST with GraphQL | Unsupported assertion | False dichotomy, Begging the question |
| 2. Adopt because industry leaders did | Unsupported assertion | Appeal to authority without evidence, Survivorship bias |
| 3. Directive-based auth | Unsupported assertion | False dichotomy |
| 4. 6-month deprecation timeline | Unsupported assertion | None of the four listed types |
| 5. REST-to-GraphQL proxy | Unsupported assertion | None of the four listed types |
| 6. Schema-first with Relay cursors | Unsupported assertion | Minor appeal to authority |

**Critical observation:** Every why-chain in this plan terminates in an unsupported assertion. Not a single decision is grounded in domain-specific evidence, benchmarks, prototypes, or data. The plan reads as a set of conclusions in search of justifications rather than an analysis that arrives at conclusions.

**Most damaging flaws:**
1. The false dichotomy between "keep REST v1 as-is" and "replace with GraphQL" eliminates consideration of REST v2 with field selection, JSON:API, BFF patterns, or other incremental solutions that could address the stated problems at far lower cost and risk.
2. The appeal to authority in Decision 2 — citing GitHub, Shopify, and Stripe as justification — provides no domain-specific evidence and exhibits survivorship bias by ignoring companies that adopted GraphQL with poor outcomes or that solve similar problems without GraphQL.

---

## Evaluation Checklist (Test 1.2 Success Criteria)

- [x] **PASS** — Each major decision in the plan has a visible 3-level why-chain.
  All six identified decisions have explicit Level 1, Level 2, and Level 3 questions with answers.

- [x] **PASS** — Why-chains are genuinely recursive (each level questions the previous answer, not just rephrasing).
  Each level interrogates a new aspect: Level 1 asks "why this approach," Level 2 asks "why is that justification sufficient," and Level 3 asks "why should we believe the underlying premise." The levels are not restatements of each other.

- [x] **PASS** — At least one chain terminates in an unsupported assertion and this is flagged.
  All six chains terminate in unsupported assertions, and each is explicitly labeled as such with the text "Chain Termination: UNSUPPORTED ASSERTION."

- [x] **PASS** — Seeded flaw: appeal to authority for GraphQL decision is detected in fallacy scan (justified by "GitHub, Shopify, Stripe adopted it" and CTO's conference).
  Decision 2 explicitly identifies the appeal to authority, naming all three companies and the CTO conference keynote as textbook examples of the fallacy.

- [x] **PASS** — Seeded flaw: false dichotomy (only GraphQL vs current API, no REST v2 considered) is detected.
  Decision 1 explicitly identifies the false dichotomy, noting that the plan never considers REST v2 with sparse fieldsets, JSON:API, OData, or BFF patterns.

- [x] **PASS** — Fallacy scan explicitly checks for the 4 listed fallacy types (not a generic "reasoning seems weak").
  Each decision's fallacy scan enumerates all four types: false dichotomy, appeal to authority without evidence, begging the question, and survivorship bias, with explicit DETECTED or NOT DETECTED verdicts for each.

- [x] **PASS** — Output clearly labels where each chain terminates and why.
  Each decision has a "Chain Termination" line with bold labeling of the termination type (UNSUPPORTED ASSERTION) followed by an explanation of why it terminates there.
