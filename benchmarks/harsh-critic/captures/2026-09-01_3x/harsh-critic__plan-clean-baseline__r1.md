# Verdict: REVISE

**Overall Assessment**: This is a genuinely strong plan — the algorithm choice is argued rather than asserted, the fail-open tradeoff is made explicit, the gradual rollout has a real validation gate, and it preempts most of the lazy criticisms a reviewer would reach for first. That polish is exactly why it needs a hard look: the remaining problems are in the load-bearing details, not the structure. The core architecture is sound and I would not scrap it. But five MAJOR issues — a FRAGILE fail-open assumption that could invert into a total outage, a success-metric methodology that measures the wrong thing, client-header semantics that contradict the chosen algorithm, an untested Redis failure mode that threatens the latency SLA, and a baseline that doesn't exist — need to be fixed and re-reviewed before this proceeds to enforcement.

**Verification limitation (state up front)**: This session has no accessible codebase (greenfield/empty directory), and `docs/rate-limit-policy.md` — which the plan defers the policy-file schema, owner, deploy path, and per-key override mechanism to — was not provided. I could not verify Kong plugin behavior, capacity figures, the billing-cache claim, or the referenced doc against source. Findings below are assessed on internal consistency, arithmetic, and domain knowledge, not verified against source. Where a claim hinges on unverifiable infrastructure behavior, I mark confidence accordingly.

**Pre-commitment Predictions**: Before reading in detail I predicted the likely failure areas for a gateway rate-limiter plan would be: (1) tier/burst-ratio arithmetic errors, (2) Redis read-then-increment race conditions, (3) shadow-mode fidelity vs the real enforcement path, (4) false-rejection metric methodology, (5) RateLimit header semantics, (6) multi-key evasion. Result: 1, 3, 4, 5, 6 all confirmed as findings. Prediction 2 (atomicity) is adequately handled by Kong's plugin and is *not* a finding — I will not manufacture it. Two significant issues I did **not** predict surfaced during investigation: the fail-open behavior may not be native to the plugin, and the Redis *brownout* (slow, not down) failure mode is untested.

**Mode**: Escalated to ADVERSARIAL after finding 5 MAJOR issues (trigger: ≥3 MAJOR). The header and brownout findings came from that expanded hunt.

---

## Findings

### Critical Findings (blocks execution)
None. No single issue makes the plan impossible to execute. The closest is M1 — but the plan's own Step 6 drill is designed to catch it before Week 3, so it degrades to "significant rework if the assumption is wrong" rather than "blocks execution."

### Major Findings (causes significant rework)

**M1 — Fail-open is a FRAGILE, load-bearing assumption that may be backwards.**
- Evidence: Step 2 asserts *"If the Redis cluster is unreachable or times out, the plugin allows the request."* This is stated as plugin behavior, not as custom code. Kong's `rate-limiting-advanced` plugin has historically **failed closed** on Redis errors in several versions (it rejects when it cannot reach its counter store) unless explicitly handled. The entire safety argument — *"degrade to today's behavior (no limiting) rather than turn a Redis blip into a total API outage"* — inverts if the plugin fails closed: a Redis outage would then **reject all authenticated traffic**, producing exactly the total API outage the plan is trying to prevent.
- Confidence: MEDIUM (cannot verify the deployed plugin version's behavior; this is the top item to verify).
- Why this matters: If the assumption is wrong, fail-open requires custom Lua against Redis — the precise ongoing-maintenance cost the plan used to *reject* token bucket. The rejection rationale for the core algorithm decision partially unravels.
- Mitigating factor: The Step 6 failure drill (*"makes Redis unreachable and confirms traffic continues to flow"*) is a real gate that would catch this before Week 3. Good defensive design — but discovering it there means late, unplanned rework.
- Fix: Verify *now*, before committing, whether `rate-limiting-advanced` at your version fails open natively. Cite the config key (e.g. the plugin's error-handling behavior on Redis timeout) in Step 2. If it fails closed, add the custom-handling work to the plan explicitly and re-evaluate the maintenance-cost argument against token bucket.

**M2 — Success Metric #2 (false rejections) measures implementation divergence, not counter inconsistency.**
- Evidence: Metric #2 is defined as false rejections *"attributable to counter inconsistency … measured by replaying shadow-mode counters against enforced decisions and counting divergences."* But Step 5 states shadow mode is *"implemented as a `pre-function` that runs the same counter logic"* — a **separate reimplementation**, not the `rate-limiting-advanced` plugin that does enforcement. Divergences between a hand-written Lua pre-function and the plugin's sliding-window implementation measure *"my shadow code differs from the plugin"*, which is confounded with — and likely dominates — the metric's stated target (Redis counter inconsistency under concurrency).
- Confidence: HIGH.
- Why this matters: The plan's own gate for whether legitimate users are being wrongly rejected is unreliable. You could pass <0.05% and still have a real false-rejection problem, or fail it purely due to shadow/plugin implementation drift and chase a phantom.
- Fix: Either (a) define the false-rejection metric against a source of truth that is the *enforcement* path (e.g. log actual 429s, then re-derive each rejected request's true window state from the plugin's own Redis counters at decision time), or (b) explicitly acknowledge the shadow implementation as the reference and rename the metric to measure shadow↔enforce agreement, dropping the "counter inconsistency" claim. Specify whether the shadow pre-function writes to the same Redis keys as the plugin (contamination risk) or separate keys (state divergence risk).

**M3 — Client headers contradict the chosen algorithm and ignore the burst window.**
- Evidence: Step 3 defines `RateLimit-Reset` as *"seconds until the sustained window resets."* A **sliding window has no discrete reset instant** — it continuously ages out old requests. There is no moment when it "resets," so the value is ill-defined for the very algorithm the plan spent a section choosing (sliding over fixed). Separately, all three headers describe *only* the sustained (per-minute) window, but Step 1 enforces **two** windows and *"A request is rejected if it exceeds either window."* A client tripped by the per-second burst ceiling receives a 429 whose `RateLimit-Remaining` shows hundreds of requests still available.
- Confidence: HIGH.
- Why this matters: This directly undermines the core thesis ("maintaining a good experience for legitimate users"). A client that trusts `RateLimit-Remaining` to pace itself will be baffled by 429s that arrive while the header says there's headroom, and `Retry-After` gives no way to distinguish "wait ~1s" (burst) from "wait up to 60s" (sustained). Correct client backoff — the thing the 3-week rollout exists to give consumers time to build — is not expressible from these headers.
- Fix: Define how `RateLimit-Reset`/`RateLimit-Remaining` are computed for a sliding window (Kong emits an approximation — state it). Expose both windows, e.g. via the structured `RateLimit` field with two policies, or add per-second header variants. Ensure `Retry-After` reflects *which* window was hit.

**M4 — The dangerous Redis failure mode (slow, not down) is untested, and the timeout is unspecified.**
- Evidence: Step 2 says fail open on *"unreachable or times out"* but never states the timeout value. Step 6's failure drill *"makes Redis unreachable"* — i.e., tests hard-down only. The far more common production failure is a Redis **brownout**: reachable but slow. Under a brownout with synchronous per-request reads (Step 2's deliberate choice), *every* request waits the full timeout before failing open. If the timeout is, say, 100ms, the whole authenticated API takes +100ms p99 during the brownout — a latency-driven partial outage that "failing open" does nothing to prevent, and that blows the <15ms Success Metric.
- Confidence: HIGH.
- Why this matters: Redis brownouts are more frequent than hard failures, and this is precisely where the synchronous-read strategy is most exposed. The plan's safety story ("degrade to today's behavior") holds for hard-down but not for slow-down.
- Fix: Specify the Redis timeout value and justify it against the 15ms budget. Add a brownout case to the Step 6 drill (inject latency, not just kill Redis) and confirm p99 behavior and fail-open triggering under slow Redis. Consider a circuit breaker so a detected brownout trips to fail-open fast instead of paying the timeout per request.

**M5 — Success Metric #3's baseline doesn't exist as described, and the metric is non-diagnostic.**
- Evidence: The plan states *"Baseline for all four is captured during Week 1 shadow mode,"* but Metric #3 reads *"reduced from the observed 40% to under 10%."* The 40% is a **historical incident peak** (Background: the 6-hour scraping event), not a Week-1 shadow measurement. Week 1 will show whatever normal traffic looks like (single-key share likely in low single digits), so the stated baseline claim is internally contradicted. Worse: post-enforcement, "single-key share under 10%" is trivially satisfied by normal traffic and only becomes a *meaningful* test of the limiter if a fresh abuse event occurs during the measurement window — which may never happen.
- Confidence: HIGH.
- Why this matters: You can declare victory on Metric #3 without any evidence the limiter actually caps an abuser, because no abuser showed up. It's a vanity metric as written.
- Fix: Reframe Metric #3 as a *worst-case-if-it-recurs* bound, validated by a synthetic abuse test in Step 6 (drive one key hard, confirm it's capped to <10% of capacity) rather than by passive observation. State total API capacity so the tier limits and the 10% target can be reconciled arithmetically (see What's Missing).

### Minor Findings (suboptimal but functional)

1. **The "roughly 4x" burst rationale is arithmetically wrong for every tier.** Per-second average of sustained = requests/min ÷ 60. Burst-ceiling ÷ average is: Free 5×, Basic 3×, Pro 2×, Enterprise 1.6× — monotonically decreasing, none near 4×. The stated design principle doesn't describe the numbers in the table. *Consequence:* because the ratio collapses at high tiers, the per-second window barely constrains a runaway loop on Enterprise — a loop at ~250 req/s stays under both the 400/s ceiling and the 15,000/min limit (250×60=15,000) and runs **effectively unthrottled**, contradicting *"a runaway loop trips the per-second window within about a second."* That mechanism only actually works for the low tiers. *Realist Check — downgraded from MAJOR to MINOR.* Mitigated by: a single Enterprise key at ~250 rps is ≈3% of the ~8,000 rps peak implied by Step 6's "2x = 16,000 rps"; attempted-rate alerting (Step 4) still fires; and the Step 4 override can throttle within ~5 min. Fix: either recompute the ceilings to a consistent principle, or drop the "4x" claim and state the real per-tier ratios and their intended effect per tier.

2. **Per-key limiting is trivially evadable by the exact actor that motivates the plan.** Step 1: tier applies per key, *"the tier value is the same for every key on the account"* — so N keys = N× effective limit. Accidental infinite loops won't adapt, but the *deliberate* scraper (Background) will simply provision more keys. The Background over-claims when it says per-key is "the right first lever" for the deliberate case. Account-level aggregation is reasonably scoped out as a follow-up, but a cheap complementary control is missing: bound keys-per-account. *Realist-downgraded to MINOR* — first multi-key abuse is no worse than today's manual-intervention posture. Fix: add a keys-per-account cap (or state the existing one) and soften the Background claim; note self-serve key creation as the deciding factor (see Open Questions).

3. **"Time to mitigate under 5 minutes" starts the clock at alert-fire, hiding detection latency.** The rejection-rate alert uses a 15-minute window; the per-key alert's window is unspecified. Real abuse-start-to-mitigation is detection window + response = ~20 min, not 5. The metric measures the convenient half. Fix: measure MTTR from abuse onset (or state the detection window explicitly as separate) and specify the per-key alert's evaluation interval.

4. **Step 6 is a Week-3 gate but is numbered after Step 5 (which contains Week 3).** Prose clarifies ("Before Week 3, run a load test"), but the numbering implies Step 6 runs after enforcement is already live. Renumber or annotate Step 6 as a gate inside the Week-2→Week-3 transition.

5. **Latency baseline attribution is inconsistent.** Success Metrics says *"Baseline for all four is captured during Week 1 shadow mode,"* but the latency metric is measured by the Step 6 load test, not Week 1. Reconcile.

6. **Week 2 advisory mechanism is unspecified.** Attaching `RateLimit-Warning` requires evaluating the windows — via the same pre-function as Week 1, or the plugin in a log-only mode? If both ever run, that's a double Redis round-trip and a different latency profile than Week 3. State it.

7. **Change-management is thin.** A single email 2 weeks out (Step 3) assumes you have deliverable addresses for all API consumers and that 2 weeks suffices for customers to ship retry logic. Many won't act or won't see it. Consider staged reminders, in-console banners, and the Week-2 advisory `RateLimit-Warning` as the primary behavioral signal (which it partly is — lean on it explicitly).

8. **"Enterprise / Custom SLA" is a single fixed 15,000/min.** "Custom SLA" implies per-customer negotiated limits, but the tier gives one number and the only per-key mechanism (Step 4) is framed as an abuse lever. How a custom limit *above* the tier is represented is unspecified.

---

## What's Missing (gaps, unhandled edge cases, unstated assumptions)

- **Total API capacity figure.** Every capacity-relative claim (the 40%, the <10% metric, whether tier limits would have contained the historical incidents) depends on it, yet it's only inferable from Step 6's "16,000 rps = 2x peak." State it and do the reconciliation in the plan rather than leaving the reader to derive it.
- **Which tiers the 4 incident customers were on.** This is the backcasting link that proves the chosen limits would have caught the real incidents. Without it, the tier numbers are asserted, not derived from the evidence the plan leads with. A 3,200 rps scraper (40% of ~8,000) capped to 250 rps only holds *if* that customer's tier is ≤ Enterprise.
- **Default tier for keys with no billing record** (new keys, billing lookup miss, cache miss on a never-seen key). Does an unknown key fail open to unlimited, or default to Free? Unspecified, and it interacts with M1's fail-open logic.
- **Redis timeout value** and behavior under slow Redis (see M4).
- **Keys-per-account bound / self-serve key creation policy** (see Minor #2).
- **429 response body**, not just headers — a machine-readable error code/structure clients can branch on. Only headers are specified.
- **Redis counter memory footprint** at full key cardinality × two windows × sliding sub-buckets. Probably fine at this scale, but unstated.
- **Clock-skew handling** across gateway nodes for the sliding-window timestamps.
- **Ongoing shadow-vs-enforce divergence monitoring** beyond Metric #2's one-time replay — if enforcement drifts from shadow after Week 3, nothing catches it.
- **Retry-storm modeling** when many keys hit limits simultaneously. `Retry-After` jitter (nice touch) helps within a second but there's no analysis of coordinated retry waves across the customer base at the Week-3 cutover.

## Ambiguity Risks (plan reviews)

- `"runs the same counter logic"` (Step 5) → **A:** reuses the plugin's actual algorithm; **B:** reimplements sliding-window in a pre-function. Risk if B: Metric #2 is broken (see M2).
- `"an operator can set a per-key limit directly in the policy file"` (Step 4) → **A:** override *replaces* the tier limit; **B:** override is an *additional* constraint (min of the two). Precedence is undefined. Risk: an operator lowers a limit to throttle an abuser and, under interpretation B vs A, either does or doesn't get the intended cap.
- `"RateLimit-Remaining: requests remaining in the current sustained window"` for a sliding window → multiple valid computations, none stated. Risk: two implementers produce two different, both-defensible numbers.
- `"any single key exceeds 10x its tier limit on attempted rate"` (Step 4) → 10× the per-minute or per-second limit? Over what interval? Risk: alert never fires, or fires constantly.

## Multi-Perspective Notes

- **Executor**: Cannot implement Step 2 or the Step 4 override without `docs/rate-limit-policy.md` (schema, deploy path, per-key override precedence all deferred there). The plan is not self-contained. Also needs the Redis timeout value and the fail-open verification (M1) before writing config.
- **Stakeholder**: The problem-to-solution chain is mostly sound, but two of five success metrics (#2, #3) are not trustworthy as written, and the "time to mitigate" metric flatters MTTR. Fix the metrics or you can't tell whether this worked.
- **Skeptic**: The strongest argument against the approach isn't the algorithm — sliding-window-on-Kong is well-justified and alternatives were genuinely evaluated (this is a real strength, not hand-waved). It's that the plan defends against the *past* pattern (single-key, largely accidental) while the one *deliberate* actor in the evidence is precisely the one who adapts around per-key limiting in an afternoon. The plan is honest that account-level is a follow-up, but it should not simultaneously claim per-key is "the right first lever" for the deliberate incident.

## Verdict Justification

REVISE, not ACCEPT-WITH-RESERVATIONS, because two of the five stated success metrics don't measure what they claim (M2, M5) and a client-facing contract contradicts the chosen algorithm (M3) — these need real fixes and a re-look, not just monitoring during rollout. REVISE, not REJECT, because the architecture is sound, the algorithm decision is properly argued against real alternatives, and the gradual rollout with a Step-6 gate is genuinely good engineering; the defects are localized to details and metrics, not the core approach. I ran the verdict challenge ("is this too lenient — should it be REJECT?"): no. A murder-board attempt on the core thesis (sliding window at the gateway with per-key tiering) does not land — the thesis survives; the kill attempts all reduce to fixable specifics. Escalated to ADVERSARIAL mode after 5 MAJOR findings; the header (M3) and brownout (M4) findings are products of that expanded hunt.

**Recalibrations reported**: The burst-ratio/runaway-loop finding was initially MAJOR and Realist-downgraded to MINOR (Minor #1) — mitigated by a per-key blast radius of ≈3% of capacity on high tiers, attempted-rate alerting, and the sub-5-min Step 4 override. The multi-key-evasion finding was Realist-downgraded to MINOR (Minor #2) — first occurrence is no worse than today's manual posture. No finding involving data loss, security breach, or financial impact was downgraded (none of the MAJORs are of that class; fail-open is an explicitly-accepted, monitored tradeoff, and M1 is about the *opposite* risk — accidental fail-closed).

**Security Exploitability Gate**: The fail-open policy is an explicitly-reasoned, monitored, status-quo-preserving choice, not a new vulnerability — not a finding. Multi-key evasion is presented as a design/scope finding, not a security vuln, because its exploitability depends on whether customers can self-provision keys (unconfirmed — routed to Open Questions). "Trigger a Redis outage to disable limiting" requires the ability to take down Redis, which is not a non-privileged capability — routed to Open Questions, not scored.

**To upgrade to ACCEPT-WITH-RESERVATIONS**: resolve M1 (verify fail-open is native or plan the custom work), fix the M2 and M5 metric definitions, specify M3 header semantics for the two-window sliding design, and add the M4 brownout case + timeout value. The Minors and gaps can then be tracked rather than blocking.

## Open Questions (unscored)

- **[UNCONFIRMED — security]** Can customers self-provision API keys without approval? If yes, per-key limiting (Minor #2) is trivially evadable by a non-privileged customer and a keys-per-account cap becomes near-mandatory; if key creation is gated, the exposure is much smaller. No demonstrated exploit path for a non-privileged user without this fact — hence unscored. Needs an answer to size Minor #2 correctly.
- **[UNCONFIRMED]** Does `rate-limiting-advanced` at your deployed version fail open natively on Redis timeout (M1)? This is the single highest-value fact to establish before committing — it determines whether M1 is a documentation fix or a redesign.
- Does the Step 4 override edit the same policy file that Step 2 deploys, and via the same pipeline? If so, does an emergency override race with a normal tier deploy?
- Does `docs/rate-limit-policy.md` exist and is it a committed deliverable? Several feasibility findings collapse to "clarify the reference" if it does, or escalate if it doesn't.
- Is the ~8,000 rps peak (inferred from Step 6's 16,000 = 2×) the right denominator for the 10% metric, and does capacity vary by region/time such that "10% of capacity" is a moving target?