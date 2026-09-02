I have the plan in context. Before writing findings, one hard constraint I need to state up front, because it shapes everything below.

**Verification limitation (read this first):** This session is a greenfield/empty working directory, and file-reading tools (Read/Grep/Glob/Bash) are not available to me here. The plan references `docs/rate-limit-policy.md`, a Kong `rate-limiting-advanced` deployment, an "existing Redis cluster," and an "existing billing database" — **none of which I can verify**, because there is no codebase or config to inspect. So this is a review of the plan's *internal logic, arithmetic, mechanism-consistency, and completeness*, not a verification of its infrastructure claims. Where I rely on domain knowledge of Kong (e.g., that `rate-limiting-advanced` does expose `window_type: fixed|sliding`), I flag it as unverified-here. I will not rubber-stamp the infra assertions.

I ran the arithmetic myself where the plan makes numeric claims. Two of them are the strongest findings.

---

**VERDICT: REVISE**

**Overall Assessment**: This is a genuinely above-average plan — it scopes deliberately, names its tradeoffs, defers latency to a load test instead of asserting it, and its rollout-risk math (Poisson) actually checks out. But it has a recurring failure mode: several confident rationales do not survive arithmetic or mechanism-checking. A stated design principle contradicts its own table, two of five success metrics are measured against a quantity the intervention cannot move, the client-facing headers can't explain half the rejections, and the shadow-mode validation runs on a different code path than enforcement. These are fixable, but they are load-bearing — you cannot claim "each success criterion is measurable" (the Goal) while two criteria are mis-specified. Fix the six MAJOR items and this is an ACCEPT.

**Pre-commitment Predictions** (made before detailed pass):
1. Per-key limiting bypassable via multiple keys → **Found**: acknowledged and scoped out, but the scope-out rests on an unstated assumption (bounded key minting).
2. Fail-open opens an abuse window → **Found**: acknowledged well; adversarial Redis exhaustion not covered.
3. Synchronous-Redis latency → **Not a finding**: appropriately deferred to the Step 6 load test and gated. Correct handling; credit given.
4. Burst/window math errors → **Found, worse than expected**: the "4x" claim is arithmetically false for all four tiers.
5. Metric measurability → **Found, worse than expected**: two metrics measured on the wrong quantity.

I escalated to **ADVERSARIAL mode** partway through (trigger: 3+ MAJOR findings *and* a systemic pattern). The pattern is specific and worth naming per your "dead output / fluent furniture" standard: **the prose is more confident than the numbers underneath it.** The plan reads as fully interrogated, but several of its "we chose X because Y" rationales are post-hoc narrative that the arithmetic contradicts. That's the thing to fix — not just the individual numbers, but the habit of writing a clean rationale that was never checked against the table it's justifying.

---

**Critical Findings** (blocks execution): **None.**
I'm stating this explicitly rather than manufacturing one. An executor could start building from this. The nearest thing to a blocker is the billing-lookup-failure gap (MAJOR #5 below): an executor implementing tier resolution *will* have to stop and ask "what tier applies when the billing lookup fails or the customer isn't found?" — the plan has no answer. Everything else causes rework or invalidates measurement rather than halting construction.

---

**Major Findings** (cause significant rework):

**1. The "roughly 4x" burst-ceiling rationale is false for every tier.**
Step 1 says: `"The burst ceiling is set at roughly 4x the per-second average of the sustained limit."` Do the arithmetic against the table:
- Free: 60/min → 1.0/s avg; ceiling 5/s = **5.0×**
- Basic: 600/min → 10/s avg; ceiling 30/s = **3.0×**
- Pro: 3,000/min → 50/s avg; ceiling 100/s = **2.0×**
- Enterprise: 15,000/min → 250/s avg; ceiling 400/s = **1.6×**

The multiplier ranges 1.6×–5× and is never 4×. It decreases monotonically as the tier grows.
- Confidence: **HIGH** (pure arithmetic; not refutable).
- Why this matters: The numbers themselves are defensible (smaller tiers reasonably get more relative burst headroom), but the *stated derivation is fiction*. A future maintainer who trusts the "4x" story could "correct" Enterprise to 1,000/s (4×250), loosening the burst ceiling 2.5× on your highest-capacity customers. The design principle and the table disagree, and nobody is gated to catch it.
- Fix: Pick one. Either (a) rewrite the rationale to state the *actual* policy — "burst multiplier declines from ~5× (Free) to ~1.6× (Enterprise) because larger tiers have smoother aggregate traffic and need less relative headroom" — or (b) if 4× was truly intended, recompute the ceilings (Free 4, Basic 40, Pro 200, Enterprise 1,000). Do not ship a table that contradicts its own justification.

**2. "Peak single-key share … measured on attempted rate" measures a quantity the limiter cannot move.**
Success Metrics: `"Peak single-key share of total API capacity: reduced from the observed 40% to under 10%, measured on attempted rate over any 1-hour window."` But rate limiting caps *served/enforced* traffic, not *attempts*. A runaway loop or scraper can still **attempt** 40%+ of capacity indefinitely; the limiter just rejects the excess. Measured on attempted rate, this metric only improves if abusers voluntarily back off — which is not what the mechanism does. It also contradicts your own Step 4 rationale, which deliberately keeps alerting on attempted rate *precisely because* enforcement doesn't reduce attempts (`"the signal does not disappear once enforcement caps actual traffic"`).
- Confidence: **HIGH**.
- Why this matters: As written, one of five success criteria is unfalsifiable-in-the-right-direction — you'll either always "fail" it (abusers keep attempting) or silently measure served rate instead, making the written metric a lie. This directly undercuts the Goal's claim that every criterion is measurable.
- Fix: Measure this on **served/enforced** rate ("no single key is served more than 10% of total capacity over any 1-hour window"). Keep attempted rate for the abuse *alerting* signal only, where it belongs. (Sanity check: an Enterprise key capped at 15,000/min against ~480,000/min at 2× peak is ~3% of served capacity — the target is achievable on served rate, impossible to guarantee on attempted rate.)

**3. Shadow mode runs a different code path than enforcement, undermining both the baseline and the false-rejection metric.**
Step 2 enforces via the `rate-limiting-advanced` plugin. Step 5 Week 1 says: `"Kong's plugin has no native dry-run, so shadow mode is implemented as a pre-function that runs the same counter logic and logs the decision without acting on it."` A `pre-function` reimplementing sliding-window logic against Redis is **not** the plugin's algorithm — window boundaries, previous-window weighting, and rounding must match exactly for the decisions to agree, and "the same counter logic" is asserted, not engineered. This poisons two things:
- The Week-1 **baseline** for the Success Metrics is captured on the pre-function path, but enforcement (Week 3) runs the plugin path.
- The false-rejection metric (`"measured by replaying shadow-mode counters against enforced decisions and counting divergences"`) then measures *divergence between two implementations*, not counter inconsistency in enforcement — and replays Week-1 counters against Week-3 traffic that is different.

There's also a direct contradiction with your Core Thesis: token bucket was rejected partly to avoid `"writing and owning a custom Lua plugin against Redis"` — yet shadow mode requires exactly that (custom Lua replicating a sliding window). If you're writing and owning that Lua anyway, the marginal cost of the token-bucket plugin you actually preferred on the merits is lower than the decision claims.
- Confidence: **MEDIUM-HIGH**.
- Why this matters: The gradual rollout's central justification is "Week 1 gives us the baseline." If the baseline path ≠ enforcement path, that justification weakens, and the false-rejection metric is measuring the wrong thing.
- Fix: (a) Specify how the pre-function reproduces the plugin's exact algorithm, or (b) measure false rejections **directly from live Week-3 data** rather than by replaying Week-1 shadow counters, and (c) re-cost the token-bucket rejection now that you've conceded you must own custom Lua regardless.

**4. Response headers report only the sustained window; a client can see remaining quota and still be rejected, with no header explaining why.**
Step 1 enforces two windows and `"A request is rejected if it exceeds either window."` Step 3's headers report only the sustained tier: `RateLimit-Limit` = sustained, `RateLimit-Remaining` = `"requests remaining in the current sustained window"`. So a bursty-but-legitimate client can receive `RateLimit-Remaining: 4500` and simultaneously get a `429` from the per-second ceiling, with nothing in the response indicating the burst window was the cause. `Retry-After` compounds this — the plan never says it reflects the *binding* window (should be ~1s for a burst rejection, up to ~60s for a sustained one).
- Confidence: **HIGH** (follows directly from Step 1 + Step 3).
- Why this matters: This defeats the whole point of Step 3 (client communication) and threatens two stated goals — `"maintaining a good experience for legitimate users"` and `"Customer support tickets about rate limiting: fewer than 10 in the first month."` A well-behaved client that respects `RateLimit-Remaining` will still eat surprise 429s.
- Fix: Expose both windows (e.g., IETF `RateLimit` policy form advertising both the per-minute and per-second limits, or a second header set), ensure `Retry-After` is computed from the binding window, and document explicitly that a 429 can occur with sustained quota remaining.

**5. No tier-resolution failure policy — the executor is blocked here.**
Step 1: tier is `"read from the existing billing database at token validation time (already cached in memory with 5-minute TTL)."` The plan defines a Redis-failure policy (fail open) in detail but is **silent on what happens when the billing lookup fails or the customer/tier is not found.** The two plausible branches have opposite failure modes:
- Fail open (no limit) → a billing outage silently disables limiting far more broadly than a Redis blip, and it isn't covered by the `ratelimit_backend_error` alert.
- Default to Free (60/min) → a billing blip throttles your **Enterprise** customers by 250× → immediate outage for your biggest accounts.
- Confidence: **HIGH** (evidence is the omission against an otherwise-explicit failure-handling plan).
- Why this matters: An executor cannot implement tier resolution without an answer, and either default has serious consequences. This is the one place the plan fails the feasibility test.
- Fix: Define the policy explicitly — the default tier on miss/error, whether it fails open or to a safe default, the TTL behavior on stale cache during a billing outage, and an alert on lookup failures analogous to `ratelimit_backend_error`.

**6. "Custom SLA customers" (Enterprise) have no home in the tier model.**
The Enterprise tier is one fixed row (15,000/min, 400/s) whose use case is literally `"Custom SLA customers."` But Step 2 says the policy file `"maps subscription tiers to window parameters"` — one parameter set per tier. Per-customer custom limits contractually above or below 15,000/min therefore have nowhere to live except the Step 4 override, which is explicitly framed as an *abuse* lever, not standing configuration.
- Confidence: **MEDIUM**.
- Why this matters: Enterprise customers with contractual limits get the wrong number — either throttled below their SLA (breach) or capped above the standing tier only via a mechanism designed for incident response.
- Fix: Define how standing per-customer/per-key custom limits are represented (dedicated entries in the policy file keyed by customer or key, distinct from the abuse override), or state that Enterprise limits are always uniform and custom SLAs are handled elsewhere.

---

**Minor Findings** (suboptimal but functional):
1. `RateLimit-Reset: "seconds until the sustained window resets"` — a *sliding* window has no discrete reset instant; the value is a moving target (when enough of the window ages out). Define what you actually report.
2. `"Retry-After carries up to 20% random jitter"` — direction unspecified. It must be additive (0 to +20%); if it can subtract, clients retry before recovery and get re-rejected. State it's additive.
3. Step 3 doesn't sequence when the `RateLimit-*` headers go live relative to the Week 1/2/3 phases. If they appear only at Week 3, consumers can't build against them during the advisory window that exists to let them adapt.
4. `"consume their whole minute's allowance in a few seconds"` — for Free (5/s ceiling, 60/min) that's 12 seconds, not "a few." The per-second window bounds the *rate*, not early exhaustion. Loose wording, not wrong.
5. `RateLimit-Warning: over-limit` (Week 2) is a non-standard header; fine as custom, but it needs documentation so clients interpret it.
6. Notification timing: `"email 2 weeks before Week 3"` lands at the start of Week 1. Confirm it goes out *before* shadow mode begins, not mid-rollout.

---

**What's Missing** (gaps / unstated assumptions):
- **Bound on API keys per account.** The entire per-key scoping decision — and the deferral of account-level aggregation — is only safe if key minting is bounded or monitored. If an account can freely create N keys, per-key limiting is trivially N×-bypassable, which reopens even the *observed* abuse pattern for a motivated actor. The plan never states the key-creation constraint the scope decision depends on.
- **Adversarial Redis exhaustion.** Fail-open + synchronous per-request Redis writes creates a feedback path: a flood increases Redis load, which (if it degrades Redis) flips the limiter to fail-open, removing the only defense. A targeted attacker can weaponize this. The plan treats Redis failure as accidental only.
- **Redis capacity headroom for two windows.** Two synchronous Redis operations per request at 2× peak = ~32,000 ops/s for limiting alone, on a cluster `"already provisioned for gateway caching."` Step 6's load test may surface this, but the plan doesn't call out validating Redis headroom (or connection-pool limits) specifically.
- **Shadow-mode latency in production.** The Step 6 load test targets the enforcement (plugin) path. The Week-1 pre-function runs *in production* and is never load-tested, yet it adds Redis round-trips to live traffic.
- **Baseline for the support-ticket metric.** Today there are ~0 rate-limit tickets (no limiting exists). "<10 in the first month" has no derivation and is directly threatened by Finding #4.

---

**Ambiguity Risks** (plan reviews):
- `"an operator can set a per-key limit directly in the policy file, taking effect within 1 second via the admin API"` → **Interpretation A**: editing `docs/rate-limit-policy.md` triggers an automated deploy that pushes to Kong's admin API in <1s. **Interpretation B**: the operator calls the admin API directly, and the file is updated for record-keeping. Step 2's rollback ("disable the plugin via Kong's admin API … within 1 second") is a *direct* admin-API action; a *file-based* override needs a deploy pipeline that is actually that fast. Risk if A is assumed but the pipeline isn't 1-second: your headline abuse-mitigation lever (and the "under 5 minutes to mitigate" success metric) is slower than claimed. The Step 6 mitigation drill will catch this, but the mechanism should be pinned down before then.
- `"runs the same counter logic"` (Step 5) → A: byte-for-byte algorithmic parity with the plugin. B: "close enough" heuristic. Risk if B: the false-rejection metric and baseline are measuring implementation drift (Finding #3).

---

**Multi-Perspective Notes**:
- **Executor**: Blocked at tier resolution (Finding #5) and at representing custom Enterprise SLAs (Finding #6). Also needs the header semantics for the *two-window* case (Finding #4) spelled out before implementing Step 3.
- **Stakeholder**: The success criteria are the plan's headline promise ("each is measurable"), but two of five are mis-specified (#2, #3) and one has no baseline (support tickets). The measurement story is weaker than the confident framing implies.
- **Skeptic**: The strongest argument against the central decision (sliding window over token bucket) is the plan's own Step 5 — you must write and own custom Lua for shadow mode regardless, which collapses a chunk of the "avoid maintaining custom Lua" rationale used to reject the algorithm you admit you'd otherwise prefer. The decision may still be right, but it wasn't costed against this fact.

---

**Verdict Justification**: REVISE, not REJECT — the architecture (sliding window at the gateway, synchronous Redis for a statable enforcement guarantee, fail-open with alerting, three-week graduated rollout, pre-enforcement load/failure/mitigation drills) is sound and unusually well-reasoned. But six MAJOR defects must be fixed before execution: a design rationale that contradicts its own table (#1), two success metrics measured against a quantity the intervention can't move or on a divergent code path (#2, #3), a client-facing correctness defect that undermines the plan's own UX and support-ticket goals (#4), an undefined failure branch that blocks the executor (#5), and a tier model that can't represent its own top tier (#6). Not ACCEPT-WITH-RESERVATIONS because these aren't note-and-proceed items — they corrupt the plan's central measurability claim and its client contract.

Escalated to **ADVERSARIAL mode** on 3+ MAJOR findings plus the systemic pattern (rationales more confident than the numbers). **Realist Check**: I considered downgrading #1 (a wrong rationale over defensible numbers) but kept it MAJOR because nothing in the plan is gated to catch the mismatch and a plausible "correction" loosens the Enterprise ceiling 2.5×. No CRITICAL was inflated — I explicitly declined to promote #5 to CRITICAL despite it fitting the "executor hits an undocumented wall" test, because it blocks one step's implementation, not the whole plan; it's the top MAJOR instead. No findings were downgraded via mitigation.

**Open Questions (unscored)**:
- Does Kong's `rate-limiting-advanced` sliding-window algorithm behave sensibly at a **1-second** window granularity? Its previous-window-weighting approximation is coarse at sub-second scale, which could make the burst ceiling behave differently than "trips within about a second" implies. I can't verify without the plugin internals and a real config — worth confirming empirically in Step 6.
- Is the in-memory tier cache per-gateway-node? If so, tier upgrades/downgrades propagate with *independent* per-node 5-minute TTLs, so "up to 5 minutes" is a floor, not a ceiling, across the fleet.
- Redis sliding-window key cardinality/memory at scale (per key × 2 windows × current+previous buckets) — likely fine, but unquantified.

---
*Ralplan summary row*: **N/A** — this is a general implementation plan, not a ralplan artifact (no principle/option matrix, no deliberate-mode pre-mortem/expanded-test-plan structure to gate against). If it were submitted as a ralplan, it would fail the verification-rigor gate on the shadow-path/metric issues (#2, #3) until those are re-specified.