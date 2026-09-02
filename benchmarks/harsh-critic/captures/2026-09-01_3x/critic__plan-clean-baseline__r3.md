## Note on method

There is no codebase here to verify against — the session started in an empty/greenfield directory (confirmed by the startup hooks: "This directory is empty," "there is no existing code to discover"). So the plan's references — `docs/rate-limit-policy.md`, the billing database, the Kong config, the Redis cluster — cannot be checked against source, because none exists yet. That is expected for a forward-looking plan and is **not** a defect. What it means: my findings are about the plan's *reasoning, internal consistency, and completeness*, not about drift from code. Where I assert a technical fact about Kong's `rate-limiting-advanced` plugin, that's from general knowledge, flagged as such.

I'm also **not** routing this to a `proposal-critic` subagent. Handing a plan this dense to a fresh context and reading back its summary is exactly the rank-erosion / dead-output failure your instructions warn against. The review is the engagement; I'm doing it here.

I read the whole plan closely. It is genuinely good — top-decile. That's *why* the findings below matter: the gaps aren't sloppiness, they're the second-order consequences of decisions the plan made well but didn't follow all the way down.

---

**VERDICT: REVISE**

**Overall Assessment**: This is a rigorously argued plan with real alternatives analysis, an explicit fail-open tradeoff, a quantified rollout-risk calculation, and pre-decision (attempted-rate) metrics that survive enforcement — most rate-limiting plans have none of these. But it has one execution-blocking ambiguity (tier-lookup failure policy) and a cluster of MAJOR gaps that are all the *same shape*: the plan is thorough about the decisions it foregrounded (sliding vs token, fail-open, synchronous Redis) and thin about the second-order failure modes of those same decisions (Redis-slow vs Redis-down, sliding-window header semantics, capacity-vs-request-count). It is not ready to hand to an executor as written, but it is a focused revision away, not a teardown.

**Pre-commitment Predictions** (made before close reading, based on domain):
1. Header semantics under distributed/dual windows — **HIT** (Finding M2).
2. Distributed counter consistency across gateway nodes — **addressed well** (synchronous Redis, explicitly chosen).
3. Redis failure behavior — **partially**: Redis-*down* is handled cleanly; Redis-*slow* is missed (Finding M4).
4. Multi-key evasion — **HIT**, and consciously deferred (Finding M6).
5. Tier-lookup caching/latency — **addressed**; but tier-lookup *failure* is not (Finding C1, my strongest).
   One thing I did **not** predict and only saw by reading the metrics against the Background: the capacity-vs-request-count unit mismatch (Finding M1). That's the one I'd least want an approver to miss.

**Review mode**: Escalated to **ADVERSARIAL** after Phase 2 — one CRITICAL plus >3 MAJOR, and a systemic pattern (rigor concentrated on the highlighted decisions, blind spots in their downstream consequences). I then actively hunted the second-order failures rather than stopping at the surfaced set.

---

### Critical Findings (blocks execution)

**C1. The tier-lookup (billing DB) failure policy is undefined — an executor cannot write Step 1 correctly, and the two plausible defaults have opposite, severe consequences.**
- Evidence: Step 1 says tier is `"read from the existing billing database at token validation time (already cached in memory with 5-minute TTL)"`. The plan defines the *Redis* failure policy meticulously (Step 2, fail-open) but is **silent on what tier is assigned when the billing DB is unreachable on a cache miss** (cold key, post-deploy cache flush, or 5-min TTL expiry during a billing blip).
- Confidence: HIGH
- Why this matters: An executor must pick a default and the choice is a coin-flip between two bad outcomes. Default to **Free** → uncached Pro/Enterprise customers get throttled to 60/min during a billing hiccup, i.e. an outage for your biggest accounts (and likely an SLA breach). Default to **unlimited** → an abuse hole opens exactly when your tier signal is degraded. This is the textbook "two competent developers interpret this differently, and the wrong one is dangerous" ambiguity.
- Realist Check: The in-memory cache bounds the blast radius to cache-miss requests during a billing outage (not every request), and detection would be fast (customers scream / the 5%-rejection alert fires). I kept it CRITICAL anyway because it is a genuine *specification* blocker — the code cannot be written without deciding it — and one resolution risks flagship-customer SLA breach. It does not clear at MAJOR.
- Fix: Add an explicit tier-lookup failure policy to Step 1, parallel to the Redis one. Recommended: on billing-DB unavailability, **fail to the customer's last-known-good cached tier with an extended stale TTL** (serve-stale), and only fall back to a conservative default (Free) if no cached tier has ever been seen for that key. Emit a `tier_lookup_error` counter and alert, mirroring `ratelimit_backend_error`. State this fallback tier explicitly.

---

### Major Findings (causes significant rework)

**M1. The incidents and the flagship success metric are stated in units of *capacity*, but the limiter and the metric measure *request count*. Those are only the same if all endpoints cost the same — which is never true and is never examined.**
- Evidence: Background: `"consumed 40% of API capacity"`, `"degraded performance"`. Success Metric: `"Peak single-key share of total API capacity: reduced from the observed 40% to under 10%, measured on attempted rate over any 1-hour window."` The baseline (40%) is a *capacity* figure; the measurement (`attempted rate`) is a *request-count* figure. Nothing in the plan weights requests by cost — every request counts as 1 token in every window.
- Confidence: HIGH
- Why this matters: A deliberate abuser sitting exactly at their request-count limit but hammering your single most expensive endpoint (a search, a report, an unbounded list) can still consume far more than their "share" of capacity. Request-count limiting bounds requests, not CPU/DB load. For accidental infinite loops (3 of 4 incidents, usually one cheap endpoint hammered fast) this is fine. For the deliberate capacity-abuse case it may not be — and the metric will *report success* (rate share <10%) while capacity share stays high. You'd be measuring the wrong thing and declaring victory.
- Fix: Either (a) restate the metric in the same units as the limiter — "peak single-key share of total *requests*" — and add a *separate* capacity/CPU metric so the two aren't conflated; or (b) if capacity is genuinely the goal, add per-endpoint cost weighting (Kong rate-limiting-advanced supports per-route/per-service config; assign heavier endpoints a higher cost or a tighter route-scoped limit). At minimum, add a sentence establishing endpoint cost variance is low enough that request-count is an acceptable proxy — and show the data.

**M2. The `RateLimit-*` headers describe a single fixed window, but the system has two windows and a *sliding* algorithm. `RateLimit-Remaining` will lie, burst-window 429s are unrepresented, and `RateLimit-Reset` is undefined for a sliding window.**
- Evidence: Step 3 headers reflect only `"the sustained tier limit"` / `"requests remaining in the current sustained window"` / `"seconds until the sustained window resets"`. But Step 1: `"A request is rejected if it exceeds either window."` And the chosen algorithm is sliding (`window_type: sliding`), which has no discrete reset instant.
  - A Free user doing 5 req/s trips the **burst** window while `RateLimit-Remaining` still reads ~55 of 60 — the client sees headroom, then gets a 429. Confusing and self-contradicting.
  - `Retry-After` on a burst rejection must reflect the ~1s burst reset, not the minute window — the plan doesn't say which window drives it.
  - `RateLimit-Reset: seconds until the ... window resets` is a fixed-window concept. A weighted sliding window frees capacity *continuously* as old requests age out; there is no "reset" second to report.
- Confidence: HIGH
- Why this matters: Step 3's entire purpose is accurate client communication, and one of your five success metrics is `"fewer than 10"` support tickets about rate limiting. Misleading headers manufacture exactly the confused-client tickets this step exists to prevent.
- Fix: Expose both policies (the `RateLimit` header draft supports multiple policies; or emit `RateLimit-Policy` describing both windows). Compute `Retry-After` from *whichever window rejected*. Replace the fixed-window "reset" semantics with sliding-window-correct values — either report seconds until one unit of capacity frees up, or switch these to the `RateLimit-Reset` semantics your plugin actually emits and document that it's an approximation.

**M3. The false-rejection metric and shadow mode both rest on a `pre-function` re-implementation of the plugin's counter math, and the metric compares two mismatched time periods. As written, the metric cannot be measured — and the reimplementation contradicts the rationale used to reject token bucket.**
- Evidence: Step 5: `"Kong's plugin has no native dry-run, so shadow mode is implemented as a pre-function that runs the same counter logic and logs the decision without acting on it."` Success Metric: false rejections `"measured by replaying shadow-mode counters against enforced decisions and counting divergences."` Shadow mode is **Week 1**; enforcement is **Week 3** — different requests, different traffic. You cannot replay Week-1 counters against Week-3 decisions; there is no shared request stream to diff.
- Confidence: HIGH (the cross-period incoherence); MEDIUM (whether the charitable reading holds)
- Why this matters: The `rate-limiting-advanced` plugin has its own internal Redis counter representation (namespaced, weighted-sliding, with specific rounding). A hand-written Lua `pre-function` is a *parallel* implementation. So Week-3 divergences between shadow and enforced could be **implementation differences, not counter inconsistency** — you'd be measuring the delta between two counters, not the true false-rejection rate. And it cuts against your own token-bucket rejection: you rejected token bucket to avoid `"writing and owning a custom Lua plugin"` — yet shadow mode requires exactly that (custom Lua counter logic you now own and must keep bit-identical to the plugin).
- Fix: (1) Rewrite the metric to a same-period comparison: during Week 3, run the shadow evaluator *in parallel with* enforcement on the *same* requests and diff per-request. (2) Address the parallel-implementation risk directly — either drive shadow mode off the plugin's *own* counters (read the plugin's Redis keys rather than maintaining a second set), or add an acceptance test asserting the `pre-function` and the plugin agree on a fixed request trace before trusting the divergence count. (3) Reconcile the "avoid owning custom Lua" rationale with the fact that shadow mode is custom Lua.

**M4. The failure drill tests Redis *unreachable* (fast-fail) but not Redis *slow* (timeout-level latency) — which is the more common and far more dangerous failure — and the Redis timeout value is never specified.**
- Evidence: Step 6: `"Run a failure drill that makes Redis unreachable and confirms traffic continues to flow (fail-open)"`. Step 2 mandates `"synchronous Redis reads on every request"` but never states the read timeout.
- Confidence: HIGH
- Why this matters: A cleanly-down Redis fails fast and fail-open works. A *slow* Redis (GC pause, failover, network brownout) means every request blocks up to the timeout before failing open. If that timeout is, say, 100ms, your p99 latency metric (<15ms) is blown by 6x during the event, and — worse — Kong workers hold connections open waiting on Redis, risking worker/connection-pool exhaustion and a cascade into the total outage fail-open was supposed to prevent. This is the classic "slow dependency is worse than a dead one" trap, and the drill tests only the easy case.
- Fix: Specify the Redis read timeout explicitly (tight — single-digit to low-double-digit ms) and justify it against the <15ms budget. Add a Redis-*slow* drill to Step 6 (inject latency at the timeout boundary), and confirm (a) requests fail open within the timeout, (b) worker/connection pools don't saturate at 16k rps under injected latency, and (c) the p99 metric's behavior during the degraded window is defined.

**M5. `Enterprise` is labeled `"Custom SLA customers"` but assigned a single flat `15,000/min`, and the only per-customer override described is an abuse-*throttle*, not a legitimate elevation. Flagship customers with negotiated higher limits get throttled below contract.**
- Evidence: Tier table row: `Enterprise | 15,000 | 400 | Custom SLA customers`. Step 4's override is explicitly the abuse lever: `"This is the lever for an active abuse incident."` No mechanism elevates a specific customer *above* their tier default for a legitimate contractual reason.
- Confidence: HIGH
- Why this matters: "Custom SLA" and "flat number for the whole tier" are contradictory. If any Enterprise contract guarantees throughput above 15,000/min, this plan silently caps them below their SLA — a breach affecting your highest-value accounts, discovered by them, not you.
- Fix: Either rename the tier to a concrete guaranteed number (drop "Custom"), or add a first-class per-customer limit override that raises limits for contractual reasons — distinct from the abuse-throttle override, and reconciled with the tier cache (see M7). State how a signed custom SLA maps to a per-key/per-consumer config value.

**M6. Per-key limiting is trivially evaded by the *deliberate* abuser — and the deliberate scraping incident (40% of capacity, 6 hours) was your single worst event. The plan defers this, but the deferral never examines how cheaply a single account can self-serve more keys.**
- Evidence: Step 1: `"A customer with multiple API keys gets each key limited independently."` Background: the worst incident was `"One deliberate scraping incident consumed 40% of API capacity for 6 hours"`. Scope defers account-level aggregation: `"If we later see abuse that spreads across many keys on one account, account-level aggregation is the follow-up."`
- Confidence: HIGH that the evasion exists; the severity is partly mitigated by the explicit deferral.
- Why this matters: A rational scraper's first move after per-key limits ship is to generate N keys and get Nx throughput. Whether that's cheap depends entirely on how easily a customer self-serves new keys — which the plan never states. The Core Thesis claims the design will `"prevent the abuse pattern we have actually seen"`; for the *accidental* loops (3 of 4 incidents) that holds, but for the deliberate case (the highest-capacity incident) the chosen lever may not.
- Realist Check / Mitigated by: The plan *does* cover 3 of 4 incidents (accidental loops), consciously scopes out account-level with a documented trigger, and retains the manual-intervention capability used on all four prior events. That's a real mitigation, so I did not push this to CRITICAL. It stays MAJOR because the worst incident remains exposed and the fallback is reactive-only.
- Fix: Add one sentence quantifying key-generation cost/limits per account (if keys are rate-limited or capped per account, say so — that closes most of the gap). If keys are effectively unlimited, either move the account-level aggregation trigger earlier or add a per-account key cap now. Don't leave the highest-capacity incident's evasion path unexamined.

**M7. The abuse-throttle override's interaction with the 5-minute tier cache and the per-tier policy file is undefined — on the exact lever the "time to mitigate <5 min" metric depends on.**
- Evidence: Step 4: an operator `"set[s] a per-key limit directly in the policy file, taking effect within 1 second via the admin API and bypassing the 5-minute billing cache."` Step 2: the policy file `"maps subscription tiers to window parameters"` — i.e. it's *per-tier*. So a *per-key* override and *per-tier* mappings live in the same file at different granularities, with no stated precedence, and the override "bypasses" a cache that refreshes every 5 minutes.
- Confidence: MEDIUM (this reads as under-specified rather than provably broken)
- Why this matters: If the 5-minute tier-cache refresh re-reads billing and re-applies the tier's window params, does it clobber the operator's per-key override? If so, your emergency throttle silently reverts within 5 minutes mid-incident — and the "under 5 minutes to mitigate" success metric is measuring a lever that un-sets itself. Precedence between per-key override and per-tier default must be explicit and *sticky* until manually cleared.
- Fix: Define override precedence explicitly: a per-key override supersedes the tier default and persists until an operator removes it, immune to the tier-cache refresh. Document where it lives (per-consumer Kong plugin config is the natural home) vs. the per-tier mapping, and confirm the Step 6 mitigation drill exercises "override survives a cache-refresh cycle," not just "override takes effect in <1s."

---

### Minor Findings (suboptimal but functional)

- **"Roughly 4x" doesn't match the table.** Step 1 claims the burst ceiling is `"roughly 4x the per-second average of the sustained limit"`, but the actual ratios are Free 5x (5 vs 1/s), Basic 3x (30 vs 10/s), Pro 2x (100 vs 50/s), Enterprise **1.6x** (400 vs 250/s). The multiplier isn't 4x and trends steeply down. The mechanism still works (a runaway loop trips the per-second window fast at every tier), but the stated rationale was retrofitted to hand-picked numbers. Either fix the numbers to a consistent multiple or replace the "4x" claim with the real per-tier reasoning.
- **`Retry-After` jitter direction is ambiguous.** `"up to 20% random jitter"` — if subtractive, some clients retry *before* the window frees and get an immediate second 429 (wasted request, no benefit). Specify additive (or ±) jitter; subtractive-only defeats the purpose.
- **`RateLimit-Warning: over-limit` (Week 2) is a non-standard header.** Advisory mode's whole value is clients noticing and self-correcting, but no client library parses a custom warning header by default. The 2-week email helps, but consider a standard signal or explicit doc/SDK guidance so Week 2 isn't silent for most consumers.
- **No schema validation / CI gate on the policy file before deploy.** `docs/rate-limit-policy.md` defines the schema, but nothing validates a policy change pre-deploy. A too-*low* misconfig mass-rejects a tier (caught by the 5% alert within ≤15 min); a too-*high* misconfig silently under-protects with **no** detection path until an incident. Add a schema-validation CI check on the policy file.
- **Latency baseline provenance.** Confirm the <15ms metric is measured against the *native plugin* (Step 6 staging) and not the Week-1 `pre-function` shadow path — the shadow path does extra Redis work that won't exist at enforcement, so it's not a valid baseline for the metric.

---

### What's Missing (gaps, unhandled edge cases, unstated assumptions)

- **Tier-lookup failure policy** (the CRITICAL) — the Redis fail policy has no billing-DB counterpart.
- **Redis capacity headroom, not just latency.** Step 6 measures *added p99 latency* at 16k rps but doesn't state it measures Redis CPU/connection saturation. Two windows × read+write per request ≈ 2–4 Redis ops/request; at 16k rps that's ~32–64k Redis ops/sec on a cluster `"already provisioned for gateway caching"` — a fundamentally different load pattern (every request vs. cache-miss-only). A latency pass can succeed while leaving zero headroom.
- **Redis read timeout value** and a **Redis-slow drill** (M4).
- **Endpoint cost heterogeneity / weighting** (M1).
- **Clock-skew handling across Kong nodes.** Sliding-window counters are timestamp-based; multi-node skew can drift counts. Probably negligible under NTP, but unstated.
- **Metric behavior during degraded (fail-open) windows.** Do the p99-latency, false-rejection, and single-key-share metrics exclude Redis-outage windows? Undefined. During fail-open, single-key share can return to 40%+ — is that a metric failure or an excluded window?
- **Non-request/response endpoints.** If the public API has any streaming/SSE/long-poll/WebSocket routes, "1 request = 1 token" is ill-defined for a connection held open for minutes. If the API is purely REST request/response, say so to close the question.

---

### Ambiguity Risks

- `"read from the existing billing database at token validation time"` → on cache miss with the DB down: **default to Free** (throttle big customers) vs **default to unlimited** (abuse hole). Wrong choice = SLA breach or abuse window. (C1)
- `"replaying shadow-mode counters against enforced decisions"` → **cross-period replay** (Week-1 vs Week-3, incoherent) vs **same-period parallel diff** (intended, but not what's written). Wrong choice = the false-rejection metric is unmeasurable or measures implementation drift. (M3)
- `"set a per-key limit directly in the policy file ... bypassing the 5-minute billing cache"` → does the cache refresh **clobber** the override or is it **sticky**? Wrong choice = emergency throttle reverts mid-incident. (M7)
- `"up to 20% random jitter"` → additive vs subtractive. Subtractive = early retries, self-inflicted 429s.

---

### Multi-Perspective Notes

- **Executor**: Hits a hard wall at Step 1 (billing DB down → which tier?) and needs answers before writing token validation. Hits a second wall at Step 2 (Redis read timeout value — unspecified, and it drives both the latency budget and the worker-exhaustion risk). Hits a third at Step 4 (per-key override vs per-tier file precedence). All three force "go ask someone," which the plan is otherwise good at avoiding.
- **Stakeholder**: The flagship metric silently changes units — `"40%"` capacity in, `"attempted rate"` share out (M1). A stakeholder approving "reduce single-key share from 40% to <10%" will believe *capacity* is bounded; the plan only bounds *request count*. That's the gap most likely to produce a "we hit our metric but the incident recurred" retro.
- **Skeptic**: Two things. (1) The plan's strongest argument against itself: the single worst incident (deliberate, 40%, 6h) is the one the chosen lever (per-key) most cheaply evades (M6), and the plan defers rather than confronts it. (2) The rigor is *concentrated* — the decisions the plan chose to foreground (sliding vs token, fail-open, synchronous Redis) are argued beautifully, while the second-order failure modes *of those same decisions* (sliding-window header semantics, Redis-slow, tier-lookup failure) are the blind spots. That's the pattern to fix, not any single finding.

---

**Verdict Justification**: REVISE, not REJECT — the plan is fundamentally sound and unusually well-reasoned; the alternatives analysis (Kong genuinely implements `window_type: fixed|sliding` and not token bucket — the technical claim checks out to my knowledge), the explicit fail-open tradeoff with a covering alert, and the quantified rollout-risk math are real strengths I don't want lost in the revision. But it is not executable as written: C1 blocks Step 1, and M1–M3 undermine the metrics you'd gate the rollout on. Review escalated to ADVERSARIAL after finding 1 CRITICAL + >3 MAJOR plus the systemic "rigor on foregrounded decisions, thin on their downstream consequences" pattern; the adversarial pass is what surfaced M1 (capacity-vs-count) and M4 (Redis-slow). Realist Check recalibrations: I held C1 at CRITICAL despite the cache bounding its runtime blast radius, because it's a genuine specification blocker whose wrong resolution risks flagship SLA breach; and I held M6 at MAJOR (not CRITICAL) because the plan demonstrably covers 3 of 4 incidents and defers the 4th with an explicit trigger — a real mitigation. To upgrade to ACCEPT-WITH-RESERVATIONS: close C1, M2, M3, and M4 (the executor-blocking and metric-invalidating ones); M1, M5, M6, M7 can be resolved with a paragraph each if the underlying answers exist.

**Open Questions (unscored)**:
- Can customers self-serve unlimited API keys per account? The answer collapses or confirms M6 — if keys are capped/rate-limited per account, most of that finding dissolves.
- Does the public API include any streaming/long-lived endpoints, or is it purely REST request/response? Determines whether the per-request counting model is complete.
- Is there real endpoint-cost variance (a few expensive endpoints among many cheap ones)? If costs are near-uniform, M1 downgrades to a metric-wording fix; if variance is high, it needs cost weighting.
- What is the actual Redis cluster headroom today, and was the "already provisioned for gateway caching" sizing done for a cache-miss workload or a per-request one?