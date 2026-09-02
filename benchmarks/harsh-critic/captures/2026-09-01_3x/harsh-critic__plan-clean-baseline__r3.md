## Verification constraint (stated up front, per honesty over polish)

This is a **greenfield, empty working directory** (session hooks confirmed it three times). There is no Kong config, no `docs/rate-limit-policy.md`, no billing-lookup code, and no Redis provisioning to read. So I could not verify the plan's infrastructure claims against source — this review is on **internal coherence and rate-limiting domain correctness**, not codebase fidelity. Where the plan hand-waves to an external doc that doesn't exist, I flag it as a feasibility gap rather than pretend to verify it. I did not fabricate tool calls against files that aren't there.

One credit before the teardown, because it's earned and I won't pad it past a sentence: this plan pre-empts most of the classic rate-limiter critiques on purpose — fail-open rationale, synchronous-Redis rationale, algorithm-rejection reasoning, attempted-vs-served signal, jitter, an out-of-band override, and honest incident math — and its Kong claims (`window_type: sliding` is a *weighted* approximation, RLA supports multiple window pairs, no native dry-run, `pre-function` for shadow) are domain-accurate. The implementation spine is strong. The rot is concentrated in the **measurement layer** — the very metrics that form the plan's own go/no-go gate — and that layer reads like it was written fluently but never actually computed by hand.

---

**VERDICT: REVISE**

**Overall Assessment**: The implementation core (tiers, sliding-window at the gateway, sync-Redis counters, 3-week rollout) is sound and unusually well-reasoned. But the plan's success metrics and shadow-mode baseline — the instruments it uses to decide whether to enforce in Week 3 — contain multiple defects that make them uncomputable or non-diagnostic as written. You would build a good limiter and then be unable to validate it against your own gate. Several MAJOR findings cluster there, which is why this is REVISE and not ACCEPT-WITH-RESERVATIONS.

**Pre-commitment Predictions** (written before detailed pass): I expected to find (1) two-window Redis latency underestimated; (2) header semantics broken across the two windows; (3) shadow-mode-vs-enforcement being different code paths; (4) per-key keying trivially bypassed by key rotation; (5) fail-open + sync-Redis creating a correlated-failure blind spot. **Four of five landed.** The two-window latency concern (1) is adequately deferred to the Step 6 load test, so I dropped it. But I did *not* predict the arithmetic contradiction in the burst-ceiling rationale or the "attempted rate" incoherence in the single-key metric — those were the highest-value surprises.

---

### Major Findings (cause significant rework)

**M1 — The burst-ceiling rationale contradicts its own table.**
The plan asserts: `"The burst ceiling is set at roughly 4x the per-second average of the sustained limit."` Run the arithmetic on the Step 1 table:
- Free: 60/min = 1/sec sustained, burst 5 → **5.0×**
- Basic: 600/min = 10/sec, burst 30 → **3.0×**
- Pro: 3,000/min = 50/sec, burst 100 → **2.0×**
- Enterprise: 15,000/min = 250/sec, burst 400 → **1.6×**

No tier is "roughly 4×"; the ratio ranges 1.6×–5×. This isn't cosmetic. Enterprise "Custom SLA customers" get only **1.6× headroom** over their sustained per-second average — the *tightest* burst tolerance goes to the customers most likely to run legitimate batch jobs and most costly to false-reject. The stated design principle ("normal bursty-but-legitimate traffic passes") is violated worst exactly where it matters most.
- Confidence: HIGH (arithmetic on the plan's own numbers)
- Why this matters: An executor implementing "4×" produces different numbers than the table; and as tabulated, the design under-serves Enterprise burst tolerance.
- Fix: Pick one — either recompute burst ceilings to a consistent multiplier (and justify it), or delete the "4×" claim and justify each tier's ceiling from observed per-second traffic in the Week 1 baseline. State whether Enterprise's 1.6× headroom is intentional and back it with a real burst distribution.

**M2 — The single-key success metric measures the one quantity the limiter can't move.**
`"Peak single-key share of total API capacity: reduced from the observed 40% to under 10%, measured on attempted rate over any 1-hour window."` **Attempted rate is pre-limiter.** A runaway loop or a determined scraper *attempts* just as many requests after enforcement as before — the limiter rejects them, it does not reduce the attempts. Measured on attempted rate, an abuser stays at ~40% and the metric never hits <10% no matter how well the limiter works. If instead you meant *served* share, then for a single key it's nearly tautological (the tier cap mechanically bounds it — Enterprise 15k/min is ~3% of an 8k-rps-peak system). Worse: the metric is **per-key**, but the 40% incident and the follow-up trigger are **per-account**; a 10% target sized around ~3 keys × ~3% is silently conceding the multi-key bypass while measuring a unit that can't detect it.
- Confidence: HIGH
- Why this matters: This is a go/no-go success metric. As written it either can't be satisfied by a working limiter or is trivially satisfied without proving anything.
- Fix: Define it as **served** capacity share, per **account** (aggregate all keys), over a rolling 1-hour window, and set the target from what actually constitutes "fair." If you insist on per-key, acknowledge in the metric that it cannot detect the multi-key pattern.

**M3 — The false-rejection metric's methodology is not computable as written.**
`"<0.05% of all 429s in Week 3, measured by replaying shadow-mode counters against enforced decisions and counting divergences."` Shadow mode is defined as **Week 1**; enforcement is **Week 3**. Those are different traffic streams at different times — you cannot replay Week-1 counters against Week-3 decisions and call divergences "counter inconsistency." If you mean a *continuous parallel shadow counter running during Week 3*, that's feasible but is not what the plan says, and it collides with M4 (a parallel implementation would diverge from RLA for *implementation* reasons, not counter-inconsistency reasons).
- Confidence: MEDIUM-HIGH (may be underspecification rather than logic error — see Open Questions)
- Why this matters: You can't gate Week 3 on a divergence count you have no coherent procedure to produce.
- Fix: Specify the exact comparison: identical inputs into two counters at the same instant, or an authoritative recomputation from request logs. Define "within its configured limits" as ground truth computed how, from what log.

**M4 — Shadow mode and enforcement are different code paths, contaminating the baseline.**
`"Kong's plugin has no native dry-run, so shadow mode is implemented as a pre-function that runs the same counter logic and logs the decision without acting on it."` The `rate-limiting-advanced` plugin is compiled Lua with its own weighted-sliding-window math and Redis access pattern; a hand-written `pre-function` is a **separate reimplementation**. "The same counter logic" is an aspiration, not a guarantee. Every downstream claim rests on Week 1 shadow numbers being what Week 3 RLA will actually do — but a subtle weighting or rounding difference means the Week 1 baseline predicts, say, 2% rejection while RLA enforces 6%, tripping the 5% alert (Step 4) and triggering a rollback that looks like a false alarm.
- Confidence: HIGH
- Why this matters: The baseline "for all four Success Metrics" (Goal section) is captured with an implementation that is *not the thing that enforces*. This poisons M3's comparison too.
- Fix: Validate the pre-function against RLA on identical replayed traffic before trusting any baseline (e.g., run RLA in a canary and diff its decisions vs. the pre-function). Or drive shadow mode through RLA itself in a non-blocking configuration if achievable, rather than a parallel counter.

**M5 — Per-key keying is bypassable, and the evidence doesn't rule out per-account.**
The plan's justification: `"All four incidents came from authenticated customers on a single API key, which is what makes per-key limiting the right first lever."` That's a non-sequitur. Incidents originating from single keys are consistent with **both** per-key **and** per-account limiting — per-account would have caught all four equally, since an account with one key hitting its ceiling trips the account limit too. The evidence is **non-diagnostic** between the two approaches (ACH: evidence consistent with all hypotheses supports none). Meanwhile per-key has a concrete weakness per-account doesn't: `"A customer with multiple API keys gets each key limited independently."` The plan places **no limit on key creation**, so the one *deliberate* scraping incident (the 40%/6hr one) is defeated by a scraper that rotates keys — and the per-key success metric (M2) passes while the account reproduces the incident.
- Confidence: HIGH
- Why this matters: 3 of 4 incidents (accidental loops) are genuinely solved; the 1 deliberate one — the worst one — is not robustly addressed, and the plan's approach-selection reasoning for per-key over per-account is a non-sequitur.
- Fix: Either (a) justify per-key-first on grounds the evidence actually supports (e.g., implementation simplicity, blast-radius isolation) rather than "incidents came from single keys," and add a per-account *ceiling* now as a cheap backstop against key rotation; or (b) rate-limit key creation and state that as the containment for the bypass. Don't leave account-aggregation as an unscheduled "follow-up" while shipping a metric that can't see the account.

**M6 — Response headers describe only one of the two enforced windows.**
Step 3 exposes `RateLimit-Limit` = "sustained tier limit", `RateLimit-Remaining` = "requests remaining in the current **sustained** window", `RateLimit-Reset` = sustained reset. But Step 1 enforces **two** windows and `"A request is rejected if it exceeds either window."` A client hammering the per-second ceiling gets a `429` while `RateLimit-Remaining` reads, say, 2,400. The explicit goal of Step 3 — `"Consumers can detect and fix their behavior against a real signal"` — is actively undermined: the signal contradicts the enforcement.
- Confidence: MEDIUM-HIGH
- Why this matters: Step 3's entire purpose is client self-regulation; misleading headers defeat it, and two developers will implement "which window does Remaining reflect?" inconsistently.
- Mitigated by: the actual `429` carries `Retry-After`, so a client that respects `Retry-After` recovers regardless of the misleading `Remaining`. That caps the damage at confusion + suboptimal proactive throttling, not breakage.
- Fix: Expose **both** windows (the IETF `RateLimit` draft supports multiple named policies), or at minimum document that a 429 can occur with `Remaining > 0` and that `Remaining` tracks only the sustained window.

**M7 — The incident-response lever and its success metric depend on an unspecified, deferred mechanism.**
Step 4: `"an operator can set a per-key limit directly in the policy file, taking effect within 1 second via the admin API and bypassing the 5-minute billing cache."` A file is not an admin-API call. Something must watch the file and push to Kong — a controller, a CI job, a reconciler — and that "something," plus the entire policy-file schema, owner, and deploy path, is deferred to `docs/rate-limit-policy.md`, which is not provided. The `"Time to mitigate an abuse event... under 5 minutes"` metric and the Step 6 mitigation drill both hinge on this undefined file→gateway propagation. You cannot drill a mechanism you haven't specified.
- Confidence: HIGH
- Why this matters: This is the primary lever for an *active* abuse incident and a scored success metric; it's the plan's answer to the 3-week enforcement delay (Step 5), yet its mechanics live in a doc that doesn't exist.
- Fix: Specify in-plan how a policy-file edit reaches Kong within 1 second (watcher? `deck sync`? direct admin-API write?), the precedence rule when a per-key override conflicts with the tier-derived config, and who has write access. Don't outsource the incident-response core to an unwritten doc.

---

### Minor Findings

- **Fail-open assumes an *exogenous* Redis failure** ("a Redis blip") but the highest-value abuse can be *endogenous* — heavy load driving Redis latency past the plugin timeout, which fails open and removes protection exactly during the event. *Downgraded from MAJOR via Realist Check* — see Verdict Justification. The plugin's Redis **timeout value is unspecified**, and it governs both the fail-open trigger and the added per-request latency during Redis slowness (a too-high timeout turns a Redis slowdown into gateway-wide latency and worker-pool exhaustion).
- **Latency metric says "under production load"** but Step 6 validates on `"a staging gateway"`. Staging Redis latency ≠ production. Either test against production-representative Redis or soften the metric's wording.
- **Week 2 advisory mode is unspecified.** RLA has no native "serve 200 but attach `RateLimit-Warning`" mode any more than it has a dry-run; Week 2 needs the same custom `pre-function` logic as Week 1, but only Week 1's implementation is described.
- **`RateLimit-Reset` for a continuously-sliding window is an approximation** — a weighted sliding window has no discrete reset instant. Fine, but document that the value is approximate so clients don't treat it as exact.
- **`Retry-After` "up to 20% random jitter"** — direction unspecified (add-only vs. ±). ±20% could push a retry *before* the window clears, causing immediate re-rejection. Specify additive jitter.
- **Support-ticket metric (`fewer than 10 in the first month`)** is uncalibrated to customer-base size — meaningless without stating how many API consumers exist.

---

### What's Missing

- **Default tier for unknown / uncached / billing-miss keys.** What limit applies to a key with no billing match, or when the billing lookup itself fails? If the answer is "no limit," that's a fail-open-on-tier hole that interacts dangerously with the fail-open-on-Redis policy — two independent paths to "unlimited." Unspecified.
- **No limit on API key creation** — the enabling condition for the M5 bypass. If keys are free to mint, per-key limiting is porous by construction.
- **Added Redis *write* load on the shared caching cluster.** Every request now increments counters on the Redis instance `"already provisioned for gateway caching."` Two windows × up to 16k rps is a large write volume co-located with cache data; it risks evicting cache entries and degrading the cache the cluster was provisioned for. Capacity headroom is asserted nowhere.
- **Whether Week 1 analysis breaks rejections down by window type.** The *new* constraint is the per-second ceiling. If Week 1 shadow analysis only reports aggregate rejection rate, the per-second false-rejection risk (M1, Enterprise 1.6×) won't surface before Week 3 enforcement makes it a customer incident.
- **Header behavior in the fail-open state** — during a Redis outage, are `RateLimit-*` headers omitted, stale, or fabricated? Undefined.
- **Cardinality/retention cost** of logging *attempted* (pre-decision) per-key volume at 16k rps for the Step 4 "top 10 by attempted volume" and per-key distribution dashboards.

---

### Ambiguity Risks

- `"measured on attempted rate"` (single-key metric) → **A:** literal pre-limiter attempts (limiter cannot move it; target unreachable for an abuser). **B:** served share (near-tautological). *Risk if wrong reading chosen:* the Week 3 go/no-go is decided on a number that means the opposite of what's intended.
- `"replaying shadow-mode counters against enforced decisions"` → **A:** Week-1 counters vs Week-3 decisions (impossible). **B:** a continuous parallel shadow during Week 3 (feasible, un-stated). *Risk:* the false-rejection gate is either uncomputable or silently redefined.
- `"taking effect within 1 second via the admin API"` on a *policy file* edit → **A:** an automated watcher/reconciler exists. **B:** operator manually calls the admin API and the "file" is documentation. *Risk:* the <5-min mitigation metric is unachievable if it's actually a manual multi-step process.
- `"roughly 4x the per-second average"` vs. the table's 1.6×–5×. *Risk:* executor codes the prose, not the table (or vice versa), and Enterprise burst tolerance is wrong either way.

---

### Multi-Perspective Notes

- **Executor:** I cannot build Steps 2/4 from this alone. `docs/rate-limit-policy.md` (schema, owner, deploy path, override propagation) is the operational core and it isn't here. I'd also have to guess the default tier for unmatched keys and whether Week 2 needs its own `pre-function`. I'd be back asking questions within the first hour.
- **Stakeholder:** Two of five success metrics can't be computed as written (M2, M3), one drill depends on an unspecified mechanism (M7), and the "40% → 10%" headline is gameable by a customer minting a second key (M5). The plan will *look* successful on its dashboards while the account-level pattern it named as the follow-up trigger stays invisible — because the dashboards only measure per-key. That's a metric that blinds you to the thing you said you'd watch for.
- **Skeptic:** The strongest argument the approach fails: per-key limiting solves the three *accidental* incidents but not the one *deliberate* one, because a motivated scraper rotates keys and the plan neither limits key creation nor aggregates by account. The rejection rationale for per-account ("incidents came from single keys") is a non-sequitur — per-account catches those too. So the plan optimizes for the easy 75% and hand-waves the hard 25% to an unscheduled follow-up, while shipping a metric that hides the 25%.

---

**Verdict Justification**: **REVISE.** The review **escalated to ADVERSARIAL mode** — 7 MAJOR findings crossed the 3+ threshold, and they form a *pattern*, not isolated slips: the implementation reasoning (Steps 1–2, algorithm choice, rollout mechanics) is genuinely strong, but the **measurement/validation layer** (success metrics, shadow-mode baseline, override drill) is comparatively un-interrogated — fluent furniture that nobody actually tried to compute. That systemic asymmetry is what drives the verdict.

*Realist recalibration reported:* the fail-open finding was **downgraded MAJOR → MINOR** — mitigated by the fact that per-key counter operations are tiny and a single abuser is unlikely to stress a properly provisioned Redis cluster (Redis sustains 100k+ ops/sec; 16–32k is within headroom), plus `ratelimit_backend_error > 0` alerting makes the degraded window non-silent. The correlated-failure blind spot is real but its blast radius is contained, so it belongs in Minor/What's-Missing with a hardening ask (state Redis headroom vs. worst-case op rate; set the plugin timeout deliberately), not as a MAJOR.

*Verdict challenge (argue it's too lenient):* the case for **REJECT** is that a plan whose own go/no-go gate (the success metrics) is non-computable is a plan you can't safely start. I rejected REJECT because the fixes are targeted, not a redesign — the implementation spine survives intact and the metric defects are correctable in a revision pass, not a re-architecture. *The case for ACCEPT-WITH-RESERVATIONS* is that you could start Steps 1–2 while fixing the metrics. I rejected that because the defects sit in the shadow-mode **baseline** captured in the very first week — start building on a poisoned baseline (M4) with uncomputable gates (M2, M3) and you'll discover it at the Week 3 decision point, having burned the whole rollout window. Fix the measurement layer *first*, then execute.

**To upgrade to ACCEPT-WITH-RESERVATIONS:** resolve M2, M3, M4, and M7 (the measurement/mechanism cluster), reconcile M1's arithmetic, and either address or explicitly time-box M5's key-rotation bypass. M6 and the Minors can ride along as reservations.

**Open Questions (unscored)**:
- **M3 may be wording, not logic** — if the real intent is a continuous parallel shadow counter running *during* Week 3, say so; that flips it from "incoherent" to "underspecified + collides with M4." Confirm which.
- **Billing-miss tier behavior:** does a failed/empty billing lookup fail open (unlimited) or fall to a default floor tier? This determines whether What's-Missing item #1 is a MINOR gap or a MAJOR security hole.
- **Is key creation limited elsewhere** (a per-account key quota outside this plan's scope)? If yes, M5's bypass is partly contained and I'd soften it. If no, M5 stands at full weight.
- **What is total API capacity in rps?** Without it, neither the "40% → 10%" target nor the Enterprise-cap-as-%-of-capacity backcast can be sanity-checked. The plan implies ~8k rps peak (from "2x = 16,000") but never states it.