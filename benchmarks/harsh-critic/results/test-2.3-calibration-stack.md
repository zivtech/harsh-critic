# Test 2.3: Calibration Stack (G3: T6 + T7)

**Plan under review:** Add Rate Limiting to Public API (plan-clean-baseline.md)
**Techniques:** Consider-the-Opposite (T6) then Verdict Challenge (T7)
**Purpose:** Test that the late-pipeline calibration sequence (T6 followed by T7) avoids runaway escalation on a solid plan.

---

## Pre-Calibration State

**Findings from initial review:**
- **MAJOR:** No mention of how rate limits apply to batch/bulk API endpoints (if any exist)
- **MINOR:** 5-minute TTL cache means tier upgrades are not reflected instantly
- **MINOR:** No mention of rate limit behavior during Redis failover

**Sections with no findings:** Step 2 (Gateway Implementation), Step 4 (Monitoring and Alerting), Core Thesis decision analysis.

**Preliminary verdict:** ACCEPT-WITH-RESERVATIONS

---

## Phase 4.5 Part B — Consider-the-Opposite (T6)

For each section with no findings, explicitly ask both questions and evaluate honestly whether a hidden flaw was missed.

### Section: Step 2 (Gateway Implementation)

#### Question 1: "What reasons exist to think this section has a hidden flaw I missed?"

Step 2 specifies the use of Kong's `rate-limiting-advanced` plugin, storing bucket state in an existing Redis cluster separate from application data, with configuration driven by a policy file mapping tiers to bucket parameters. A rollback plan is included: disable the plugin via Kong admin API, taking effect within 1 second.

Reasons this could have a hidden flaw:

- **Redis as single point of failure for rate limiting.** If Redis becomes unavailable, the rate limiter cannot check or decrement tokens. However, this concern is partially covered by the initial review's MINOR finding about Redis failover behavior. Additionally, the Redis cluster is pre-existing infrastructure already in the critical path for gateway caching, so its availability posture is already established and managed.
- **Plugin configuration drift.** The policy file mapping tiers to bucket parameters could become inconsistent with the billing database tier definitions over time. However, this is a standard configuration management concern, and the shadow mode period (Step 5, Week 1) would surface misconfigured limits before any request is actually rejected.
- **Multi-region rate limiting.** The plan does not mention whether the API gateway spans multiple regions. If it does, distributed rate limiting across regions is a well-known hard problem. However, the plan describes a single Redis cluster and a single Kong gateway, suggesting a single-region deployment. The absence of multi-region discussion is not a flaw if the system is single-region.
- **Rollback plan is all-or-nothing.** The rollback disables rate limiting entirely. There is no mention of a partial rollback (e.g., disabling enforcement for one tier while keeping others). However, "disable entirely" is a valid emergency rollback. Granular rollback is a refinement, not a requirement.

**Verdict:** No credible concern surfaced that was not already captured or that warrants a new finding. The section uses proven infrastructure (Kong, Redis), names specific technology, and includes a concrete rollback plan with a defined time-to-effect.

#### Question 2: "What would have to go wrong here for the plan to fail?"

- **Kong plugin version incompatibility after upgrade.** A future Kong upgrade could break the rate limiting plugin configuration. This is a general operational risk applicable to any plugin-based architecture, not a plan-specific flaw.
- **Policy file misconfiguration on initial deployment.** Wrong limits mapped to wrong tiers. This would be caught by shadow mode in Week 1 before any request is rejected — the plan's own gradual rollout strategy mitigates this risk.
- **Redis performance degradation under token bucket write load.** At 8,000 rps, each request requires a Redis read-and-decrement. However, token bucket operations are O(1), and the Redis cluster is already handling gateway caching at similar volume. The marginal load is modest.

**Verdict:** Failure modes are either mitigated by the plan's own gradual rollout or are pre-existing operational concerns. No finding warranted.

---

### Section: Step 4 (Monitoring and Alerting)

#### Question 1: "What reasons exist to think this section has a hidden flaw I missed?"

Step 4 defines dashboards (rejection rate by tier, top 10 customers by request volume, bucket utilization distribution) and two alert rules (rejection rate exceeds 5% for any tier, any single customer exceeds 10x their tier limit).

Reasons this could have a hidden flaw:

- **No alert for rate-limit-check latency exceeding the <1ms target.** The success metric is <1ms p99 for rate limit check latency, but Step 4 does not define an alert for when this threshold is breached. However, gateway latency is typically monitored by existing infrastructure observability. The plan's success metrics section identifies what to measure; operationalizing those metrics into alerts is standard implementation detail.
- **The 5% rejection rate threshold could mask problems for small-population tiers.** If a tier has very few customers (e.g., 3 Enterprise customers), even one customer being incorrectly rate-limited could be hidden below a 5% aggregate rejection rate. However, the per-customer "10x their tier limit" alert provides a second detection channel for individual anomalies, covering this gap.
- **No monitoring specific to shadow mode.** During Week 1, violations are logged but not enforced. There is no explicit mention of a dashboard for shadow mode violations. However, the shadow mode is described as a validation period, and it would be operationally negligent to log violations without examining them. This is implicit operational procedure, not a plan gap.

**Verdict:** No credible concern surfaced. The monitoring covers the key operational dimensions, and the two alert rules complement each other (aggregate rejection rate plus per-customer anomaly detection).

#### Question 2: "What would have to go wrong here for the plan to fail?"

- **Alert fatigue during soft enforcement.** If the 5% threshold triggers frequently during Week 2's soft enforcement period, operators might suppress or ignore alerts before Week 3's full enforcement begins. This is an operational risk mitigated by the gradual rollout design: shadow mode data from Week 1 should be used to calibrate alert thresholds before soft enforcement.
- **Missing a class of abuse not captured by these metrics.** For example, slow-and-low attacks that stay just under rate limits. However, rate limiting is not designed to catch every form of abuse; it addresses the specific incidents described in the Background section (infinite loops, high-volume scraping). Other abuse patterns require other tools (WAF, behavioral analysis).

**Verdict:** No finding warranted. The monitoring is appropriately scoped for the feature's purpose.

---

### Section: Core Thesis Decision Analysis

#### Question 1: "What reasons exist to think this section has a hidden flaw I missed?"

The Core Thesis evaluates three algorithms (fixed window, sliding window, token bucket), selects token bucket with explicit quantitative rationale, and acknowledges the tradeoff (less precise sustained enforcement vs. latency advantage at 8,000 rps).

Reasons this could have a hidden flaw:

- **The 3ms sliding window latency claim might be overstated.** If sliding window latency is actually closer to 1ms with optimized Redis operations, the performance argument for token bucket weakens. However, at 8,000 rps using Redis sorted sets (ZADD + ZRANGEBYSCORE + ZREMRANGEBYSCORE per request), 3ms is a reasonable estimate. Even at 1ms, it is still 10x the token bucket's 0.1ms, which matters at this request volume for p99 tail latency.
- **Other algorithms not considered.** Leaky bucket and Generic Cell Rate Algorithm (GCRA) are not mentioned. However, leaky bucket is functionally equivalent to token bucket (different metaphor, same mechanics), and GCRA is a niche variant. The three algorithms evaluated span the meaningful design space for API rate limiting.
- **The <1ms latency requirement might be unnecessarily aggressive.** Perhaps 3ms per request overhead is tolerable, making sliding window viable. However, at 8,000 rps, adding 3ms of synchronous Redis overhead per request has measurable impact on p99 tail latency. The plan's insistence on low overhead is a reasonable engineering preference, not an arbitrary constraint.

**Verdict:** No credible concern surfaced. The algorithm decision is well-reasoned with quantitative justification. The three-algorithm comparison covers the standard design space, the rejection rationale for each alternative is specific, and the tradeoff is explicitly acknowledged.

#### Question 2: "What would have to go wrong here for the plan to fail?"

- **The fundamental problem might not be solved by rate limiting alone.** If abuse evolves beyond simple high-volume request floods (e.g., low-volume credential stuffing, API key sharing), rate limiting will not address it. However, the Background section describes specific incidents (infinite loops, scraping) that rate limiting directly addresses. The plan is solving the identified problem, not claiming to solve all security threats.
- **Token bucket burst capacity settings could be too generous.** Allowing a burst of 2,500 requests for Enterprise customers means a misbehaving client can send a damaging burst before the bucket drains. However, burst capacity is a tunable parameter, and the shadow mode period provides data to validate burst settings before enforcement.

**Verdict:** No finding warranted. The core thesis is sound and well-supported by the problem statement.

---

### Tradeoff Analysis Check

Does the plan demonstrate awareness of alternatives and tradeoffs at key decision points? Absence of tradeoff analysis is itself a finding.

| Decision Point | Tradeoff Analysis Present? | Assessment |
|---|---|---|
| Algorithm selection (Core Thesis) | **Yes.** Three alternatives evaluated with specific, quantitative rejection rationale. Tradeoff explicitly stated: "slightly less precise... but the latency advantage makes it the right choice for our throughput." | Thorough |
| Implementation approach (Step 2) | **Yes, implicitly.** Selects a specific, proven plugin on existing infrastructure. Includes a concrete rollback plan with 1-second time-to-effect, showing awareness of failure scenarios. | Adequate |
| Rollout strategy (Step 5) | **Yes.** Three-phase gradual rollout with explicit rationale. Tradeoff acknowledged: "abuse protection is delayed by 3 weeks" with probability argument for acceptability ("only had 4 incidents in 3 months"). | Thorough |
| Alert thresholds (Step 4) | **Partial.** Thresholds stated (5%, 10x) without justification for those specific values. These are tunable operational parameters, not architectural decisions. | Acceptable |
| Tier definitions (Step 1) | **Partial.** Tier limits are stated (60/600/3000/15000) but the rationale for the specific numbers is not discussed. However, tier limits are product decisions informed by usage data, and the gradual rollout provides empirical validation. | Acceptable |

**Verdict on tradeoff analysis:** The plan demonstrates strong tradeoff awareness at all major decision points. The two "Partial" items are operational parameters, not architectural choices, and both are validated by the gradual rollout strategy. No finding warranted for absence of tradeoff discussion.

---

### T6 Summary

| Section Examined | Credible Concern Surfaced? | New Finding Added? |
|---|---|---|
| Step 2: Gateway Implementation | No | No |
| Step 4: Monitoring and Alerting | No | No |
| Core Thesis Decision Analysis | No | No |
| Tradeoff analysis (cross-cutting) | No | No |

**T6 overall result:** Consider-the-Opposite applied systematically to all three clean sections. Both questions asked and answered for each. No credible concerns surfaced. All sections withstood scrutiny. The sections that passed the initial review are genuinely solid — they use proven technology, include quantitative justification, and acknowledge tradeoffs. No spurious findings manufactured. No new findings to carry forward into T7.

**Findings entering T7 (unchanged from pre-calibration):**
- MAJOR: No mention of how rate limits apply to batch/bulk API endpoints
- MINOR: 5-minute TTL cache means tier upgrades are not reflected instantly
- MINOR: No mention of rate limit behavior during Redis failover

**Verdict entering T7:** ACCEPT-WITH-RESERVATIONS

---

## Phase 5 — Verdict Challenge (T7)

### Preliminary Verdict Under Challenge

**ACCEPT-WITH-RESERVATIONS** based on 1 MAJOR and 2 MINOR findings.

### Constructing the Strongest Case for Escalation to REVISE

"What is the best case that this should be one tier harsher?"

The argument for REVISE would go like this:

1. **The 3-week unprotected period is a deliberate vulnerability window.** The gradual rollout (Step 5) means that for 3 full weeks — Week 1 (shadow mode: log only), Week 2 (soft enforcement: 429 with grace header), Week 3+ (full enforcement) — the system offers either no protection or degraded protection against the exact abuse scenarios that motivated the plan. The Background section describes incidents where a scraping attack consumed 40% of API capacity for 6 hours. If a similar incident occurs during the 3-week window, the plan provides no mitigation. The plan acknowledges this tradeoff ("only 4 incidents in 3 months") but a plan that deliberately leaves the system unprotected for 3 weeks against a known threat class has a structural gap.

2. **The batch endpoint gap (MAJOR) could render the entire system bypassable.** If the API has batch endpoints (e.g., "send 100 notifications in one request"), then a single API call could generate load equivalent to 100 individual calls but would consume only one rate limit token. This effectively renders the rate limiting system architecturally incomplete — it enforces limits on individual requests while ignoring the actual load generated per request. A rate limiting system that can be trivially bypassed by switching to batch endpoints is not a rate limiting system; it is a facade.

3. **The combination of the 3-week gap and the batch bypass creates a compounding risk.** During the 3-week unprotected period, abuse can continue unmitigated. After Week 3, if batch endpoints exist and are not rate-limited appropriately, abuse can continue via batch endpoints. The plan may never actually achieve its stated goal of "95% reduction in API abuse incidents" because it leaves two distinct bypass paths.

### Evaluation of the Challenge

This argument is **not compelling enough to escalate the verdict.** Here is why:

- **The 3-week unprotected period is a deliberate, acknowledged tradeoff, not an oversight.** The plan explicitly states: "this means abuse protection is delayed by 3 weeks. Acceptable because we've only had 4 incidents in 3 months — the probability of an incident during the 3-week grace period is low, and shadow mode logs will help us identify potential abusers early." The plan does not ignore this risk; it quantifies the historical incident rate (4 in 3 months, roughly 1 per 3 weeks) and accepts the probability. A deliberate tradeoff with stated reasoning is different from an unexamined gap. Escalating the verdict because the plan made a conscious risk acceptance decision would penalize thoughtful engineering judgment.

- **The batch endpoint concern is flagged as MAJOR precisely because it needs clarification, but it is conditional.** The finding is "no mention of how rate limits apply to batch endpoints *if any exist*." If batch endpoints do not exist, the finding disappears entirely. If they do exist, the plan needs a paragraph added — either rate-limiting batch endpoints by weighted cost (each item in a batch consumes N tokens) or by separating batch and individual rate limits. Either way, this is a bounded clarification, not evidence that the plan's architecture is fundamentally wrong. The rate limiting design (token bucket at the gateway layer) is architecturally sound; the gap is in coverage scope, not in the approach itself.

- **The "compounding risk" argument overstates the interaction.** The 3-week unprotected period and the batch endpoint question are independent concerns. They do not compound in a meaningful way: the 3-week period is temporary and ends, while the batch endpoint question is permanent. Framing them as a compounding risk implies they interact synergistically, but they do not — they are two separate, bounded issues.

- **The plan's strengths are substantial and contextually relevant.** The core algorithm decision is thoroughly justified with quantitative analysis of three alternatives. The rollout strategy is carefully phased with explicit tradeoff reasoning. The rollback plan is concrete and fast (1 second). The monitoring covers key operational dimensions with complementary alert rules. T6 independently confirmed that all clean sections are genuinely solid with no hidden flaws. These characteristics indicate a well-engineered plan with isolated gaps, not a plan that needs to be sent back for fundamental revision.

- **T6 did not surface any new findings.** The Consider-the-Opposite pass examined all three clean sections with both questions and found them genuinely solid. No spurious concerns were manufactured. This independently confirms that the plan's overall quality is high and the existing findings are isolated issues, not symptoms of systemic weakness.

### Final Verdict

**FINAL VERDICT: ACCEPT-WITH-RESERVATIONS (unchanged)**

The verdict challenge constructed a three-part argument for escalation centered on the 3-week unprotected period and the batch endpoint gap. The strongest individual point was the batch endpoint bypass scenario, but this remains a conditional clarification question with a bounded resolution (either batch endpoints do not exist, or a paragraph must be added to specify weighted rate limiting for batch requests). The 3-week unprotected period is a deliberate tradeoff with stated reasoning, not an oversight. T6's independent validation that all clean sections withstood scrutiny further supports that the plan's quality does not warrant a REVISE verdict.

The reservations remain:
- **MAJOR:** Clarify how rate limits apply to batch/bulk API endpoints (if any exist). If batch endpoints exist, specify whether a batch request consumes one token or N tokens (weighted by batch size).
- **MINOR:** Document the expected behavior when tier changes occur mid-cache-TTL (5-minute window where limits may be stale). Consider whether cache invalidation on tier change is warranted.
- **MINOR:** Specify rate limiting behavior during Redis failover (fail open and allow all requests? fail closed and reject all? degrade to approximate in-memory limiting?).

---

## Evaluation Checklist

- [PASS] **Consider-the-opposite runs BEFORE verdict challenge (correct ordering)**
  T6 (Consider-the-Opposite) is executed first in Phase 4.5 Part B, examining all three clean sections with both questions. T7 (Verdict Challenge) follows in Phase 5. The T6 summary and findings list are established before T7 begins. T7 explicitly references T6's results ("T6 did not surface any new findings").

- [PASS] **If T6 surfaces a new finding, T7's verdict challenge accounts for it**
  T6 did not surface a new finding on this clean baseline. However, T7's structure explicitly references the T6 outcome: "T6 did not surface any new findings... This independently confirms that the plan's overall quality is high." This demonstrates that T7 is aware of and incorporates T6's output. The architecture ensures that if T6 had surfaced a finding, it would have appeared in the "Findings entering T7" list and been part of T7's challenge.

- [PASS] **If T6 surfaces nothing, T7 still runs its own independent challenge**
  T6 surfaced nothing. T7 ran its own independent three-part escalation argument (3-week unprotected period, batch endpoint bypass, compounding risk). The challenge was substantive, specific, and engaged seriously with the strongest case for escalation. T7 operated independently rather than short-circuiting because T6 found nothing.

- [PASS] **On the clean baseline, the final verdict is NOT over-escalated by the combination (should remain ACCEPT or AWR)**
  The final verdict is ACCEPT-WITH-RESERVATIONS, unchanged from the preliminary verdict. Neither T6 nor T7 escalated the verdict. The combination of two calibration techniques did not produce over-escalation on this solid plan.

- [PASS] **The two techniques do not create a runaway escalation loop**
  T6 found no new concerns. T7 constructed a challenge but evaluated it honestly and found it not compelling enough to escalate. Neither technique fed findings into the other in a way that amplified severity. The pipeline was: T6 confirms clean sections are genuinely clean --> T7 challenges verdict independently --> T7 concludes challenge is not compelling --> verdict unchanged. No escalation loop occurred.

**Overall: 5/5 PASS**
