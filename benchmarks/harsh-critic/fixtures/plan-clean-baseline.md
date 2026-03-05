# Plan: Add Rate Limiting to Public API

## Goal
Implement tiered rate limiting on the public API to prevent abuse and ensure fair usage across customers. Success criteria: rate limits enforced with <1ms overhead per request, zero false rejections for customers within their tier limits during the first month, and 95% reduction in API abuse incidents.

## Background
The public API currently has no rate limiting. In the past quarter, 3 incidents of accidental infinite loops from client integrations caused degraded performance for all customers. One deliberate scraping incident consumed 40% of API capacity for 6 hours before manual intervention.

## Core Thesis
Token bucket rate limiting at the API gateway layer, with per-customer tiering, will prevent abuse while maintaining a good experience for legitimate users. We chose this over alternatives after evaluating three approaches.

Decision: Token bucket algorithm over sliding window and fixed window.
- Fixed window: rejected due to burst-at-boundary problem (customers can send 2x their limit by timing requests at window edges)
- Sliding window: considered viable but adds ~3ms latency per request due to Redis sorted set operations. At our request volume (8,000 rps), this adds meaningful p99 tail latency
- Token bucket: O(1) check per request (~0.1ms), handles bursts gracefully via bucket capacity, widely battle-tested in API gateways (Nginx, Kong, Envoy all use variants)

Tradeoff acknowledged: token bucket is slightly less precise than sliding window for sustained rate enforcement, but the latency advantage makes it the right choice for our throughput.

## Step 1: Define Rate Limit Tiers

| Tier | Requests/min | Burst capacity | Use case |
|------|-------------|----------------|----------|
| Free | 60 | 10 | Trial users, hobby projects |
| Basic | 600 | 100 | Small businesses |
| Pro | 3,000 | 500 | Mid-market |
| Enterprise | 15,000 | 2,500 | Custom SLA customers |

Tier assignment is based on the customer's subscription plan, read from the existing billing database at token validation time (already cached in memory with 5-minute TTL).

## Step 2: Gateway Implementation
Implement the token bucket in the existing Kong API gateway using the `rate-limiting-advanced` plugin. Configuration is driven by a rate limit policy file that maps subscription tiers to bucket parameters. The plugin stores bucket state in the existing Redis cluster (separate from application data, already provisioned for gateway caching).

Rollback plan: disable the rate-limiting plugin via Kong's admin API. Takes effect within 1 second. All requests pass through unthrottled. No data loss, no side effects.

## Step 3: Response Headers and Client Communication
Add standard rate limit headers to all API responses:
- `X-RateLimit-Limit`: tier limit
- `X-RateLimit-Remaining`: tokens remaining
- `X-RateLimit-Reset`: seconds until bucket refill

When rate limited, return `429 Too Many Requests` with a `Retry-After` header. Update API documentation with rate limit details, tier comparison, and upgrade instructions. Notify all API consumers via email 2 weeks before enforcement begins.

## Step 4: Monitoring and Alerting
Add dashboards tracking: rejection rate by tier, top 10 customers by request volume, and bucket utilization distribution. Alert if rejection rate exceeds 5% for any tier (may indicate limits are too aggressive). Alert if any single customer exceeds 10x their tier limit (likely a bug or abuse).

## Step 5: Gradual Enforcement
- Week 1: Shadow mode — log rate limit violations but don't reject requests. Validate limits don't affect legitimate traffic.
- Week 2: Soft enforcement — return `429` but include `X-RateLimit-Grace: true` header. Clients can opt in to respecting limits.
- Week 3+: Full enforcement — hard `429` rejections.

Decision: 3-week gradual rollout over immediate enforcement because our API consumers need time to add retry logic and respect `Retry-After` headers.

Tradeoff: this means abuse protection is delayed by 3 weeks. Acceptable because we've only had 4 incidents in 3 months — the probability of an incident during the 3-week grace period is low, and shadow mode logs will help us identify potential abusers early.

## Success Metrics
- Rate limit check latency: <1ms p99
- False rejection rate during week 3: 0%
- API abuse incidents: 95% reduction quarter-over-quarter
- Customer support tickets about rate limiting: <10 in first month
