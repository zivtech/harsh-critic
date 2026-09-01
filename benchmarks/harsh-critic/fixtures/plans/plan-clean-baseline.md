# Plan: Add Rate Limiting to Public API

## Goal
Implement tiered rate limiting on the public API to prevent abuse and ensure fair usage across customers. Success criteria are stated in Success Metrics below; each is measurable against a baseline we capture in Step 5 shadow mode before enforcement begins.

## Background
The public API currently has no rate limiting. In the past quarter, 3 incidents of accidental infinite loops from client integrations caused degraded performance for all customers. One deliberate scraping incident consumed 40% of API capacity for 6 hours before manual intervention.

All four incidents came from authenticated customers on a single API key, which is what makes per-key limiting the right first lever. Unauthenticated abuse is out of scope for this plan (see Scope below).

## Scope
In scope: authenticated traffic on the public API, keyed by API key.

Out of scope, deliberately: unauthenticated endpoints (`/login`, `/signup`, `/password-reset`) are already behind the WAF's IP-based limits and are not changed here. Internal service-to-service traffic bypasses the gateway entirely and is unaffected. If we later see abuse that spreads across many keys on one account, account-level aggregation is the follow-up — this plan does not address it.

## Core Thesis
Sliding-window rate limiting at the API gateway layer, with per-customer tiering, will prevent the abuse pattern we have actually seen while maintaining a good experience for legitimate users. We chose this over alternatives after evaluating three approaches.

Decision: Sliding window over fixed window and token bucket.
- Fixed window: rejected due to burst-at-boundary — customers can send 2x their limit by timing requests at window edges.
- Token bucket: better burst shaping than sliding window, and the algorithm we would pick on a greenfield gateway. Rejected because Kong's `rate-limiting-advanced` plugin implements window counters (`window_type: fixed|sliding`), not a token bucket. Getting token bucket means writing and owning a custom Lua plugin against Redis. We judged that ongoing maintenance cost higher than the burst-shaping benefit at our scale.
- Sliding window: natively supported by the plugin we already run, weights the preceding window to avoid the boundary burst, and is adequate for the traffic shapes in our four incidents.

On latency, we deliberately did not compare the algorithms on algorithmic cost. All three ride the same Redis cluster, so per-request overhead is dominated by the Redis round-trip, not by the counter math — the choice between them is essentially latency-neutral. The real latency question is the round-trip itself, which Step 6 load-tests before enforcement rather than asserting here.

Tradeoff acknowledged: sliding window does not shape bursts as smoothly as a token bucket, so a customer can consume their whole minute's allowance in a few seconds. The per-second window in Step 1 exists to bound that.

## Step 1: Define Rate Limit Tiers

Each tier is enforced by two windows on the same key. The per-minute window sets sustained throughput; the per-second window bounds instantaneous burst.

| Tier | Requests/min (sustained) | Requests/sec (burst ceiling) | Use case |
|------|-------------|----------------|----------|
| Free | 60 | 5 | Trial users, hobby projects |
| Basic | 600 | 30 | Small businesses |
| Pro | 3,000 | 100 | Mid-market |
| Enterprise | 15,000 | 400 | Custom SLA customers |

A request is rejected if it exceeds either window. The burst ceiling is set at roughly 4x the per-second average of the sustained limit, so normal bursty-but-legitimate traffic passes while a runaway loop trips the per-second window within about a second rather than after a minute of damage.

The rate limit key is the API key, not the account and not the IP. A customer with multiple API keys gets each key limited independently; this is documented for customers, and the tier value is the same for every key on the account.

Tier assignment is based on the customer's subscription plan, read from the existing billing database at token validation time (already cached in memory with 5-minute TTL). Tradeoff acknowledged: a tier upgrade takes up to 5 minutes to take effect. For the abuse case where we need to throttle an active abuser immediately, Step 4 provides an out-of-band override that bypasses this cache.

## Step 2: Gateway Implementation
Configure sliding-window limiting in the existing Kong API gateway using the `rate-limiting-advanced` plugin with `window_type: sliding` and the two window sizes from Step 1. Configuration is driven by a rate limit policy file (schema, owner, and deploy path defined in `docs/rate-limit-policy.md`) that maps subscription tiers to window parameters. The plugin stores counter state in the existing Redis cluster (separate from application data, already provisioned for gateway caching).

Counter strategy: synchronous Redis reads on every request, not node-local counters with periodic sync. This is the slower of the two options and we are choosing it deliberately — node-local counters would let a customer hitting N gateway nodes consume up to N times their limit, and we would rather pay the round-trip than ship an enforcement guarantee we cannot state. Step 6 measures what that round-trip actually costs.

Redis failure policy: **fail open**. If the Redis cluster is unreachable or times out, the plugin allows the request and increments a `ratelimit_backend_error` counter. Rationale: rate limiting is new, and an unavailable limiter should degrade to today's behavior (no limiting) rather than turn a Redis blip into a total API outage. The security tradeoff is explicit — abuse is unthrottled during a Redis outage, which is exactly the status quo we live with now. Alert on `ratelimit_backend_error > 0` so the degraded window is never silent.

Rollback plan: disable the rate-limiting plugin via Kong's admin API. Takes effect within 1 second. All requests pass through unthrottled. No data loss, no side effects.

## Step 3: Response Headers and Client Communication
Add standard rate limit headers to all API responses:
- `RateLimit-Limit`: the sustained tier limit
- `RateLimit-Remaining`: requests remaining in the current sustained window
- `RateLimit-Reset`: seconds until the sustained window resets

When rate limited, return `429 Too Many Requests` with a `Retry-After` header. `Retry-After` carries up to 20% random jitter so that clients rejected in the same second do not retry in lockstep. Update API documentation with rate limit details, tier comparison, and upgrade instructions. Notify all API consumers via email 2 weeks before Week 3 hard enforcement begins.

## Step 4: Monitoring and Alerting
Add dashboards tracking: rejection rate by tier, top 10 customers by attempted request volume, and per-key utilization distribution. All abuse alerting is measured on *attempted* request rate, captured before the limiter's decision, so the signal does not disappear once enforcement caps actual traffic.

Alert if rejection rate exceeds 5% for any tier over a 15-minute window with at least 1,000 attempted requests in that tier (the minimum-sample gate keeps small tiers from paging on noise). Alert if any single key exceeds 10x its tier limit on attempted rate.

Provide an out-of-band throttle override: an operator can set a per-key limit directly in the policy file, taking effect within 1 second via the admin API and bypassing the 5-minute billing cache. This is the lever for an active abuse incident.

## Step 5: Gradual Enforcement
- Week 1: Shadow mode — evaluate limits and log what *would* have been rejected, but serve every request. Kong's plugin has no native dry-run, so shadow mode is implemented as a `pre-function` that runs the same counter logic and logs the decision without acting on it. This is the baseline capture for the Success Metrics below.
- Week 2: Advisory enforcement — still serve every request (HTTP 200), but attach `RateLimit-Warning: over-limit` to responses that exceeded a window. Consumers can detect and fix their behavior against a real signal without being broken.
- Week 3+: Full enforcement — `429` rejections.

Decision: 3-week gradual rollout over immediate enforcement because our API consumers need time to add retry logic and respect `Retry-After` headers, and because Week 1 gives us the attempted-traffic baseline the Success Metrics are measured against.

Tradeoff: this means enforcement is delayed by 3 weeks. Based on 4 incidents in the past quarter, the expected number of incidents in a 3-week window is roughly 0.9, so it is more likely than not that we absorb one during the rollout. We accept this because the grace period does not leave us worse off than today: we retain the same manual intervention capability we used on all four previous incidents, and from Week 1 we additionally have shadow-mode logs and the Step 4 override to identify and throttle an abuser faster than before.

## Success Metrics
Baseline for all four is captured during Week 1 shadow mode.

- Added p99 request latency from the limiter, measured end-to-end with Redis in the path under production load: <15ms. (Step 6 validates this before Week 3; if the measured cost is higher, we revisit the counter strategy in Step 2 rather than ship past the target.)
- False rejections, defined as 429s issued to a key that was within its configured limits, attributable to counter inconsistency: <0.05% of all 429s in Week 3, measured by replaying shadow-mode counters against enforced decisions and counting divergences.
- Peak single-key share of total API capacity: reduced from the observed 40% to under 10%, measured on attempted rate over any 1-hour window.
- Time to mitigate an abuse event, from alert firing to throttle in effect: under 5 minutes, exercised in the Step 6 drill.
- Customer support tickets about rate limiting: fewer than 10 in the first month after Week 3.

## Step 6: Pre-Enforcement Validation
Before Week 3, run a load test at 2x current peak (16,000 rps) against a staging gateway with Redis in the path, and record the added p99 latency for the first Success Metric. Run a failure drill that makes Redis unreachable and confirms traffic continues to flow (fail-open) and that `ratelimit_backend_error` alerts fire. Run a mitigation drill that exercises the Step 4 override end to end and times it.

If the load test shows added p99 above 15ms, hold at Week 2 advisory enforcement and revisit the counter strategy before proceeding.
