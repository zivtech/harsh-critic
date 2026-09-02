**VERDICT: REVISE**

**Verification limitation (read this first):** I reviewed this in an empty/greenfield working directory. There is no codebase here, so I could **not** verify a single one of the plan's load-bearing external references — `docs/rate-limit-policy.md`, the Kong `rate-limiting-advanced` config, the "billing database... cached in memory with 5-minute TTL" claim, or the "already provisioned" Redis cluster. My review is therefore of the plan's *internal logic and domain correctness only*. Every codebase-dependent assumption below is marked as must-verify. Do not read "REVISE" as "verified except for these findings" — several claims that would normally be CRITICAL-if-wrong are simply unchecked.

**Overall Assessment:** This is a genuinely above-average plan — the fail-open reasoning, shadow→advisory→enforce rollout, attempted-vs-actual signal capture, latency gating, and honest expected-incident math (0.9 over 3 weeks, ~59% chance of absorbing one — arithmetic checks out) are the marks of someone who has actually operated a limiter, not just read about one. But it has a cluster of real substantive defects: the burst-ceiling design rule contradicts its own table, the response headers can't represent the two-window model the plan is built on, and the shadow-mode baseline that *all four success metrics depend on* rests on a reimplementation whose fidelity is never validated. These aren't blockers to starting, but they will either bite in execution or manufacture false confidence in the metrics.

**Pre-commitment Predictions:** Before reading in detail I predicted the likely soft spots for a rate-limiting plan: (1) distributed counter consistency across gateway nodes, (2) Redis as SPOF / fail-open security, (3) header semantics under multi-window limits, (4) multi-key circumvention, (5) shadow-mode fidelity. **Actual:** (1) is handled well (synchronous Redis, deliberate). (2) is handled well and honestly. (3), (4), (5) all turned out to be real gaps — better prediction hit rate than I'd like.

**Escalation:** I hit 3+ MAJOR findings during Phase 2, so I escalated to **ADVERSARIAL mode** for the remainder and actively hunted adjacent issues (the capacity-vs-request-count metric conflation and the override-depends-on-Redis interaction were found in that pass).

---

**Critical Findings:** None. No data-loss, security-breach, or start-blocking defect survived scrutiny. Fail-open is a deliberate, monitored, defensible choice that does not leave you worse than today.

---

**Major Findings**

**1. The "roughly 4x" burst-ceiling rule is false for every tier, and the highest-paying tier gets the tightest headroom.**
The plan states the burst ceiling is `"set at roughly 4x the per-second average of the sustained limit."` Compute it from the Step 1 table:
- Free: 60/min = 1/s avg, ceiling 5 → **5.0×**
- Basic: 600/min = 10/s avg, ceiling 30 → **3.0×**
- Pro: 3,000/min = 50/s avg, ceiling 100 → **2.0×**
- Enterprise: 15,000/min = 250/s avg, ceiling 400 → **1.6×**

No tier is 4×; the multiple ranges 1.6×–5.0× (mean ≈2.9×). This is a principle-vs-table inconsistency. It also matters functionally: the design rationale has two halves — "runaway loop trips the per-second window within a second" AND "normal bursty-but-legitimate traffic passes." The first half holds at *any* multiple (a true runaway blows past 400/s instantly). The second half is weak exactly where it's most expensive: an **Enterprise SLA customer averaging 250 req/s has only 1.6× peak-to-average headroom**, and real traffic routinely bursts 2–3× above average. You will reject legitimate Enterprise bursts.
- Confidence: HIGH (arithmetic)
- Why this matters: Directly threatens the "<10 support tickets in first month" success metric, and the tightest headroom lands on your Custom-SLA customers.
- Fix: Either state the actual per-tier multiplier and justify why it declines with tier, or re-derive burst ceilings from a stated peak-to-average factor. If the intent is uniform 4× headroom, Enterprise burst should be ~1,000/s, not 400/s.

**2. Response headers cannot represent the two-window model, so a burst-rejected client sees remaining budget on a 429.**
Step 1 enforces two windows (per-minute sustained + per-second burst); `"A request is rejected if it exceeds either window."` Step 3 exposes only the sustained window: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` all describe `"the sustained tier limit."` So when a client trips the **per-second** ceiling while sustained budget remains, it receives a `429` while `RateLimit-Remaining` reports a positive number. The plan never defines header behavior in that case.
- Confidence: HIGH
- Why this matters: Step 3's own goal is "Client Communication." A well-behaved client that proactively throttles on `RateLimit-Remaining` gets surprise 429s it can't explain — the exact behavior that generates the support tickets one success metric caps at <10.
- Fix: Represent both windows (the IETF RateLimit draft supports multiple policies via `RateLimit-Policy`), or at minimum document the burst window and ensure `Retry-After` is authoritative on every 429. Specify what the headers report when the two windows disagree.

**3. Shadow-mode baseline fidelity is never validated, yet all four success metrics are measured against it — and the false-rejection metric conflates two different errors.**
Step 5 Week 1: `"Kong's plugin has no native dry-run, so shadow mode is implemented as a pre-function that runs the same counter logic and logs the decision without acting on it."` Success Metrics: `"Baseline for all four is captured during Week 1 shadow mode."` The pre-function is a **reimplementation** of the sliding-window weighting, not the plugin's own code path, and nothing in the plan validates that they compute identical decisions. Worse, the false-rejection metric — `"measured by replaying shadow-mode counters against enforced decisions and counting divergences"` — treats shadow-mode counters as ground truth. If the pre-function's math drifts from the plugin's, every divergence is misattributed to "counter inconsistency" when it's actually reimplementation drift. The metric cannot distinguish the two.
- Confidence: HIGH on the fidelity/validation gap; MEDIUM on the secondary point below.
- Secondary (MEDIUM, partially refutable): This also sits in tension with the Core Thesis, which rejected token bucket because `"writing and owning a custom Lua plugin against Redis"` costs too much — then Step 5 writes custom Lua against Redis. The author can fairly rebut that the pre-function is a one-week throwaway, so I don't weight the contradiction heavily; the *fidelity* risk stands regardless.
- Why this matters: A corrupt baseline silently invalidates every metric you're using to decide whether to enforce.
- Fix: Add an explicit equivalence test in Step 6 — run identical traffic through the pre-function and the enforcing plugin in staging and assert decision-match within tolerance before trusting Week 1 as a baseline.

**4. The latency-metric contingency is a dead-end — the only named fallback is the strategy the plan already rejected.**
Success Metric #1 gates on `<15ms` added p99; if exceeded, `"we revisit the counter strategy in Step 2 rather than ship past the target"` and `"hold at Week 2 advisory enforcement."` But Step 2 names exactly one alternative to synchronous Redis — node-local counters with periodic sync — and rejects it because it `"would let a customer hitting N gateway nodes consume up to N times their limit."` So if the load test fails, the plan's stated recovery path leads either to (a) the enforcement guarantee it already refused to ship, or (b) an indefinite hold at advisory mode = no protection = status quo. No third option (Redis pipelining, co-location, short-TTL local cache, async pre-check) is pre-identified.
- Confidence: MEDIUM-HIGH
- Why this matters: You could load-test, fail the gate, and discover you have no plan.
- Realist note: Mitigated by the fact that the gate prevents shipping something broken — the worst case is project stall, not production breakage, and it's detected immediately at the Step 6 load test. That's why this is MAJOR, not CRITICAL.
- Fix: Pre-identify at least one concrete latency-reduction lever and its enforcement-guarantee cost, so "revisit the counter strategy" isn't an empty branch.

**5. The "peak single-key share of total API capacity" metric measures request count, not capacity — and is defeated by the multi-key path the plan scopes out.**
The metric: `"Peak single-key share of total API capacity: reduced from the observed 40% to under 10%, measured on attempted rate over any 1-hour window."` "Attempted rate" is a **request count**, but the metric is labeled "capacity" and the original 40% incident was a *capacity* (compute) event. If endpoint costs vary — one expensive report endpoint vs. a cheap GET — request-count share and capacity share diverge, and a key under 10% of requests could still consume far more than 10% of compute. Separately, per-key limiting means a customer can create N keys for N× effective throughput (the plan scopes account-level aggregation out — fine), but the single-*key* metric will then read "success" while aggregate abuse continues undetected.
- Confidence: MEDIUM (endpoint-cost variance is unverifiable in greenfield; if costs are uniform the label is merely imprecise, if they vary it's a validity gap).
- Why this matters: You may declare victory on a metric that no longer tracks the harm you set out to prevent.
- Fix: Either measure actual capacity/compute share, or rename the metric to "single-key request share" and state explicitly that it does not bound capacity when endpoint costs vary. Verify endpoint cost variance before locking the metric.

---

**Minor Findings**

1. **Override mechanism is internally ambiguous.** Step 4: `"an operator can set a per-key limit directly in the policy file, taking effect within 1 second via the admin API."` Editing a *file* and it taking effect *via the admin API in 1 second* mixes two mechanisms — a file edit implies a deploy/reload pipeline (rarely sub-second), while the admin API is imperative. Pin down which one, because the "time to mitigate under 5 minutes" metric depends on it.
2. **Retry-After jitter direction unspecified.** `"up to 20% random jitter"` — if jitter can be negative (retry *earlier*), clients retry before the window resets, eat another 429, and inflate both rejection-rate alerting and ticket volume. Specify jitter as additive only.
3. **Step numbering is misleading.** Step 6 ("Pre-Enforcement Validation") must run *before* Step 5's Week 3, but is numbered after Step 5. Also, Step 4 dashboards must be live before Step 5 Week 1 to capture the baseline — sequencing not stated.
4. **Alerting-vs-phase interaction undefined.** The 5%-rejection alert (Step 4) has no meaning in Weeks 1–2 (nothing is actually rejected). State whether it fires on would-be rejections during shadow/advisory (noise risk) or only in Week 3 (blind during the risky weeks).

---

**What's Missing** (gaps / unstated assumptions)

- **Override depends on Redis, which fail-open assumes may be down.** The override is `"the lever for an active abuse incident,"` but its per-key counter lives in Redis. During a Redis outage (fail-open), the override throttles nothing — precisely when you might most want it. Not acknowledged.
- **No functional-correctness tests of the limiting logic.** Step 6 tests latency, fail-open, and mitigation timing (all ops-focused) but never tests that a Free key actually gets 60/min, that the per-second window rejects while the per-minute has budget, or that the shadow pre-function matches the plugin. The validation plan omits the correctness of the thing being validated.
- **Retry storms.** Step 5 actively encourages consumers to add retry logic, but retries count against the limit. Encouraged retries + counted retries + an incident can amplify load. Jitter helps; the interaction is unaddressed.
- **"Capacity" (the 40% figure) is never defined.** Total rps? Concurrent compute? The denominator determines whether the flagship success metric is even measurable.
- **Clock/time-source consistency across Kong nodes** for sliding-window weighting — likely mitigated by Redis-side timing, but unstated.
- **Redis op budget at 2× peak.** 16,000 rps × two windows ≈ 32k+ Redis ops/sec minimum. Step 6 measures latency but doesn't state it verifies Redis *saturation* headroom, only round-trip cost.

**Ambiguity Risks**

- `"set a per-key limit directly in the policy file, taking effect within 1 second via the admin API"` → **A:** operator hits the Kong admin API imperatively (plausibly sub-second). **B:** operator edits a versioned policy file that a pipeline deploys (rarely sub-second). Risk if B is real: the "<5 min time-to-mitigate" metric and the whole "abuse lever" premise are undermined.
- `"revisit the counter strategy"` (Success Metric #1) → **A:** try a new, unnamed latency optimization. **B:** fall back to node-local counters. Risk if B: you ship the weaker enforcement guarantee the plan explicitly rejected.

**Multi-Perspective Notes**

- **Executor:** I cannot implement Step 2 or Step 4's override without `docs/rate-limit-policy.md`, which defines the schema, owner, and deploy path — and doesn't exist yet. This doc is a hard prerequisite, not a reference; it should be a Step 0.
- **Stakeholder:** The stated problem is capacity abuse (40% of compute). The mechanism limits request *count* and the flagship metric measures request *rate*. If those diverge, the plan can pass its metrics without solving the problem. Confirm they don't diverge, or fix the metric.
- **Skeptic:** The strongest argument against this plan isn't the algorithm choice (that reasoning is sound and technically accurate — Kong's plugin does implement fixed/sliding window counters, not token bucket, and the boundary-burst critique of fixed windows is correct). It's that the *measurement apparatus* — shadow-mode baseline + false-rejection replay + capacity metric — has enough internal slack that the rollout could be declared a success on instrumentation that doesn't measure what it claims.

**Verdict Justification:** REVISE, not REJECT — the plan is fundamentally sound, most steps are executable, and the operational thinking is strong; rejecting it would be manufactured outrage. Not ACCEPT-WITH-RESERVATIONS, because Findings 1–3 are correctness/validity defects in the core design and its measurement, not peripheral polish: the burst rule contradicts its own numbers, the headers can't express the model, and the metric baseline is unvalidated. Fix the five MAJOR findings and this is an ACCEPT. Review escalated to ADVERSARIAL after crossing the 3-MAJOR threshold; that pass produced Findings 5 and the override-Redis gap. **Realist Check recalibrations:** Finding 4 was held at MAJOR rather than raised toward CRITICAL because the load-test gate contains it to a project stall with immediate detection (mitigated by the pre-enforcement gate). Finding 5 was held at MAJOR rather than downgraded because a metric that silently stops tracking the target harm causes real wrong decisions (no mitigating factor found). No finding was downgraded away; none involves data loss, security, or financial impact requiring protected severity.

**Open Questions (unscored)**
- Does `rate-limiting-advanced` in your deployed Kong version support the two-window (`limit: [5, 60]`, `window_size: [1, 60]`) config keyed on API-key credential? Plausible from plugin capabilities, but unverifiable here — confirm against the actual config.
- Is the "billing database... already cached in memory with 5-minute TTL" claim true in the current system, and does that cache live on the gateway nodes (so token-validation-time tier lookup is actually local)?
- Are the four historical incidents all confirmed single-key? Background asserts it; the entire "per-key is the right first lever" argument rests on it.
- Does the Redis cluster have headroom for ~32k+ ops/sec at 2× peak, distinct from per-op latency?

---
*Ralplan summary row:* **N/A** — this plan was not submitted through ralplan/deliberate tooling (no principles/options/drivers/pre-mortem structure). If it had been, Alternatives Depth would **Pass** (three algorithms with technically accurate, non-hand-waved rejection rationale) but Risk/Verification Rigor would **Fail** pending Finding 3 (unvalidated baseline) and the missing functional-correctness tests in Step 6.