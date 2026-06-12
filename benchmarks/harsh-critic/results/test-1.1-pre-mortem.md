# Test 1.1: Strengthened Pre-Mortem — Auth Migration Plan

## Step 1: Certainty-Framed Failure Scenarios

An infallible crystal ball shows this plan was executed exactly as written and was a complete fiasco. Here is why.

### Failure Scenario 1 (SF-1): JWT Rollback Gap — Converted Users Have No Session to Fall Back To

During the gradual rollout (Step 6), a critical bug is discovered in JWT token validation at the 50% traffic phase. The team follows the documented rollback procedure: disable the JWT path in the gateway feature flag so users fall back to session cookies. But users who already exchanged their session cookies for JWT token pairs during the lazy migration (Step 5) no longer have valid session cookies. The exchange was one-way — the old session was consumed to produce a JWT pair, and that session was either invalidated or expired during the exchange window. These users are now stranded: the JWT path is disabled, but they have no session to fall back to. Thousands of users are locked out with no automated recovery path. The plan's rollback strategy (Step 6: "disable the JWT path in the gateway feature flag and users fall back to session cookies") is fundamentally broken for any user who has already converted. The "zero user-facing auth errors during migration" success metric is shattered on the first rollback attempt.

### Failure Scenario 2 (SF-2): Key Rotation Causes Mass Token Invalidation

Step 1 specifies "rotating key pairs stored in AWS KMS" for RS256 signing, but describes no rotation procedure — no overlap period, no JWKS endpoint for downstream key discovery, no cache invalidation strategy for services verifying tokens. On the first key rotation, the auth service begins signing with a new key pair while downstream microservices still cache the previous public key. All newly issued tokens fail verification across every service. Old tokens continue working until they expire (up to 15 minutes), creating a confusing partial outage where some users authenticate fine and others get 401 errors depending on when their token was issued. Monitoring sees a spike in validation failures but cannot correlate it to the rotation event because no rotation-specific telemetry was planned. The team spends hours debugging what should have been a routine operation.

### Failure Scenario 3 (SF-3): Refresh Token Database Becomes the New Redis Bottleneck

The plan's core thesis is that JWT eliminates server-side session state, removing the Redis bottleneck. But Step 2 introduces "its own database for refresh token storage." With 7-day refresh tokens and the projected growth to 50,000 DAU within 6 months, this database accumulates hundreds of thousands of active refresh tokens. Every 15-minute access token refresh requires a database lookup. Every revocation requires a database write and lookup. Token cleanup and expiration jobs are not specified. The refresh token database becomes the new Redis — a centralized stateful bottleneck — except it lacks the years of operational tuning, horizontal scaling configuration, and battle-tested eviction policies that the Redis cluster had. At 50,000 DAU, Monday-morning login storms cause connection pool exhaustion, cascading auth failures, and the very scaling wall the migration was supposed to eliminate. The plan contains no capacity analysis, no scaling strategy, and no performance projections for this database at the 6-month target.

### Failure Scenario 4 (SF-4): Mobile SDK Adoption Stalls, Blocking Redis Decommission

Step 5 assumes client SDKs across web, iOS, and Android will be updated for JWT. Web deployments happen instantly, but iOS and Android updates depend on App Store and Play Store review cycles and user willingness to update. Historical mobile update adoption rates show 60-70% uptake after 2 weeks. The remaining 30-40% of mobile users continue using session cookies indefinitely. The dual-mode gateway (Step 4) cannot be retired on the week-4 schedule (Step 7). The Redis cluster must stay alive, continuing to incur the costs and operational burden the migration was meant to eliminate. The plan has no forced-upgrade mechanism, no minimum-version enforcement, and no analysis of mobile update adoption rates. The week-4 deadline for Redis decommissioning is unrealistic.

### Failure Scenario 5 (SF-5): 15-Minute Token Lifetime Creates Frequent Logouts

With 15-minute access tokens, any user whose client fails a single token refresh — due to a network blip, mobile app backgrounding, laptop lid closure for 16 minutes, or an intermittent server error — is immediately logged out. The old session-cookie system had far longer effective lifetimes because the session was maintained server-side. Users experience a dramatic increase in "random logouts" compared to the previous system. The plan specifies no retry logic, no grace period, no silent refresh strategy in the client SDKs, and no offline-to-online re-authentication flow. Support tickets spike. User satisfaction drops measurably. Product management requests extending token lifetime, which conflicts with the security team's requirements.

### Failure Scenario 6 (SF-6): Dual-Mode Gateway Introduces Ambiguous Failure Semantics

Step 4 specifies the gateway checks the Authorization header first, then falls back to session cookies. But what happens when a JWT is present but invalid (expired, malformed, signed with a rotated-out key)? If the gateway rejects the request immediately with 401 rather than falling through to the session cookie, then dual-mode users who have both an expired JWT and a valid session cookie are locked out unnecessarily. If the gateway does fall through, an attacker can attach a crafted invalid JWT to a request to force session-cookie evaluation, potentially bypassing JWT-specific security controls. The plan does not specify the failure semantics of dual-mode evaluation, creating a security ambiguity that will be resolved ad hoc by whichever engineer implements the gateway logic.

### Failure Scenario 7 (SF-7): Token Payload Bloat Exceeds Validation Latency Budget

The token schema (Step 1) includes user ID, roles, permissions, and expiration. For users with complex permission sets — admin users, multi-tenant operators, users with granular feature flags — the JWT payload grows to 2-4KB. Unlike a compact session cookie ID (typically 32-64 bytes), this payload is sent on every API request and must be cryptographically verified (RS256 signature validation on 2-4KB of data). For mobile clients on constrained networks, this adds measurable latency per request. For the API gateway, parsing and verifying large RS256-signed tokens on every request pushes p99 validation latency beyond the 50ms target. The plan defines no maximum token size, no strategy for handling large permission sets, and no fallback for when token sizes threaten the latency SLA.

---

## Step 2: Black Swan Scenarios

Now generate 1-2 failure scenarios that would make everyone say "we never could have predicted that."

### Black Swan 1: AWS KMS Regional Outage During Peak Migration Phase

During the 50%-to-100% rollout phase, AWS KMS in the primary region suffers a multi-hour outage. Because RS256 signing depends on KMS for private key access, the auth service can neither sign new tokens nor rotate keys. The 15-minute access token lifetime means every active user's token expires within 15 minutes, and no replacements can be issued. Refresh token operations also require KMS for signing the new access token. Within 20 minutes, 100% of JWT-authenticated users are locked out. Session-cookie fallback only works for users who have not yet converted — a shrinking population at the 50-100% phase. The platform is effectively offline for the duration of the KMS outage. The plan mentions no KMS failover, no multi-region key replication, no local HSM fallback, and no pre-signed emergency tokens. A KMS outage was never modeled as a risk because the plan treats AWS KMS as an infallible dependency.

### Black Swan 2: Critical JWT Library CVE After Redis Decommission

Four weeks after the Redis cluster is decommissioned (Step 7) and session-related code is archived, a critical CVE is published in the JWT signing library used by the auth service, allowing token forgery with only the public key. The security team mandates an emergency rollback to session-based authentication. But there is nothing to roll back to: Redis is gone, session code is archived, and the session-cookie code path in the gateway has been removed. The team faces a choice between leaving a known-exploitable system running for days while they rebuild session auth from archived code and re-provision Redis, or taking the platform completely offline. The plan has no post-deprecation emergency rollback strategy. Once the old system is torn down, the rollback path is destroyed.

---

## Step 3: Multi-Horizon Analysis

### Immediate Failure — Day 1

**F-D1-1: Rollback gap for converted users (SF-1).** On the very first day of canary rollout (1% of users), the lazy migration converts these early users from sessions to JWTs. If a critical issue is detected within hours — token validation intermittently fails due to clock skew between the auth service and the API gateway — the team disables the JWT feature flag. But the 1% of users who exchanged sessions for tokens have no valid sessions to fall back to. Even at 1% of 12,000 DAU, that is ~120 users locked out on day 1, requiring manual intervention (forced session re-creation or password resets) that was never planned.

**F-D1-2: Key distribution race condition (SF-2).** On the first deployment, the initial signing key is created in KMS, but downstream services have not yet populated their verification key caches. The first tokens issued are unverifiable by some services, causing intermittent 401 errors that appear random from the user's perspective. With no JWKS endpoint or cache-warming procedure specified, this race condition is inherent in the first deployment.

### Medium-Term Failure — 1 Month In

**F-M1-1: Mobile SDK adoption stall (SF-4).** One month in, the web rollout is at 100%, but only ~65% of mobile users have updated to the JWT-capable SDK. The dual-mode gateway remains required. The team is stuck in prolonged dual-mode operation, doubling the auth surface area to monitor and secure. The week-4 deadline for removing backward compatibility and decommissioning Redis (Step 7) has passed with no path to meeting it. Redis costs continue.

**F-M1-2: Refresh token accumulation begins (SF-3, early signs).** With growing DAU now on JWT, the refresh token database holds tens of thousands of active tokens with 7-day lifetimes. Users with multiple devices hold multiple refresh tokens each. No token cleanup or expiration job is specified. Orphaned tokens from abandoned devices accumulate. Growth patterns are non-linear, and the database has no capacity plan.

**F-M1-3: UX degradation from aggressive token lifetime (SF-5).** After a month of JWT auth, users on unreliable networks — especially mobile users — report frequent unexpected logouts. Support tickets for "app keeps logging me out" increase 3x compared to the session-cookie era. Product management requests extending the 15-minute token lifetime, creating tension with the security team's requirements. No client-side refresh strategy exists to mitigate the problem.

### Long-Term Failure — 6 Months Out

**F-L6-1: Refresh token database becomes the new bottleneck (SF-3, fully realized).** At the projected 50,000 DAU, the refresh token database holds 50,000+ active tokens (significantly more with multi-device users). Every 15-minute token refresh hits this database. Every revocation requires a lookup and write. Monday-morning login storms cause connection pool exhaustion. The team realizes they have replaced a Redis bottleneck with a relational database bottleneck that is harder to horizontally scale, has worse read latency characteristics for this workload, and lacks the years of operational tuning the Redis cluster had. The "stateless" JWT architecture is stateless in name only; the refresh token store is the new session store with worse operational properties.

**F-L6-2: JWT payload drift across services.** Over 6 months, different teams embed additional claims in the JWT payload for their services — feature flags, A/B test groups, tenant context, role hierarchies. Without a governance model for the token schema, tokens grow unpredictably. Some services depend on claims that other services do not set. A service deployed with a new required claim breaks older tokens that lack it. The plan specifies the initial schema (Step 1) but has no versioning, governance, or evolution strategy for the JWT payload over time.

---

## Step 4: Gap Check — Does the Plan Address Each Failure Scenario?

| # | Failure Scenario | Addressed in Plan? | Finding |
|---|---|---|---|
| SF-1 | JWT rollback gap — converted users have no session to fall back to | **NO.** Step 6 says rollback = "disable the JWT path in the gateway feature flag and users fall back to session cookies," but does not account for users whose sessions were already replaced by the token exchange in Step 5. | **FINDING: The plan's rollback strategy is fundamentally broken for any user who has already converted to JWT. There is no mechanism to restore or recreate sessions for these users. This is a critical gap.** |
| SF-2 | Key rotation causes mass token invalidation | **PARTIALLY.** Step 1 mentions "rotating key pairs stored in AWS KMS" but specifies no rotation procedure, overlap window, JWKS endpoint, or cache invalidation strategy for downstream services. | **FINDING: Key rotation is mentioned but not operationalized. No overlap period, no key discovery mechanism, no cache-warming procedure.** |
| SF-3 | Refresh token database becomes the new bottleneck at 50K DAU | **NO.** Step 2 mentions "its own database for refresh token storage" but provides no sizing, capacity analysis, scaling strategy, connection pooling plan, or cleanup job. The plan does not analyze whether this database recreates the bottleneck Redis had. | **FINDING: The plan replaces one stateful bottleneck (Redis sessions) with another (refresh token DB) without any capacity planning or scaling analysis for the 50,000 DAU target. This undermines the core thesis.** |
| SF-4 | Mobile SDK adoption stalls, blocking Redis decommission | **NO.** Step 5 assumes SDK updates will happen but provides no timeline, forced-upgrade mechanism, or analysis of mobile update adoption rates. Step 7 sets a week-4 deadline with no contingency for slow mobile adoption. | **FINDING: The week-4 deprecation deadline is unrealistic without a forced-upgrade strategy for mobile users.** |
| SF-5 | 15-minute token lifetime creates UX cliff | **NO.** Step 1 sets the 15-minute lifetime but the plan contains no client-side refresh strategy, retry logic, or graceful degradation for failed refreshes. | **FINDING: No client-side token lifecycle management specified despite aggressive token expiration.** |
| SF-6 | Dual-mode gateway has ambiguous failure semantics | **NO.** Step 4 describes the dual-mode fallback order but does not specify what happens when a JWT is present but invalid — reject immediately, or fall through to session cookie? | **FINDING: Dual-mode gateway failure semantics are ambiguous, creating a potential security vulnerability or user lockout depending on implementation.** |
| SF-7 | Token payload bloat exceeds validation latency budget | **NO.** Step 1 defines what goes into the token but sets no maximum size and has no strategy for users with large permission sets. | **FINDING: No token size budget or mitigation for large payloads.** |
| BS-1 | AWS KMS regional outage during peak migration | **NO.** The plan depends entirely on AWS KMS for signing with no failover, multi-region replication, or local fallback. | **FINDING: Single-region KMS dependency is a single point of failure for the entire auth system.** |
| BS-2 | Critical JWT library CVE after Redis decommission | **NO.** Step 7 decommissions Redis and archives session code with no contingency for needing to restore session-based auth post-deprecation. | **FINDING: No post-deprecation emergency rollback plan. Once Redis is decommissioned, the fallback path is permanently destroyed.** |

### Summary of Findings

The plan addresses **zero** of the identified failure scenarios fully. One scenario (SF-2, key rotation) is partially mentioned but not operationalized. The two most critical unaddressed gaps are:

1. **SF-1 (Rollback gap):** The rollback strategy in Step 6 is fundamentally broken for any user who has already completed the session-to-JWT exchange. There is no mechanism to restore or recreate sessions for converted users. This means the first rollback attempt will lock out every converted user.

2. **SF-3 (Refresh token scaling):** The plan's core thesis — eliminating server-side state — is undermined by the refresh token database introduced in Step 2. At the 6-month scaling target of 50,000 DAU, this database becomes a new centralized bottleneck with worse scaling characteristics than the Redis cluster it replaced. The plan contains no capacity analysis or horizontal scaling strategy.

---

## Evaluation Checklist

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | Output contains exactly the certainty framing language (crystal ball / fiasco) — not hedged alternatives | **PASS** | Step 1 opens with: "An infallible crystal ball shows this plan was executed exactly as written and was a complete fiasco." No hedging language used. |
| 2 | 5-7 failure scenarios generated (count them) | **PASS** | 7 failure scenarios generated (SF-1 through SF-7). |
| 3 | At least 1-2 explicitly labeled black swan scenarios present | **PASS** | 2 black swan scenarios explicitly labeled (BS-1: KMS regional outage, BS-2: JWT library CVE after decommission). |
| 4 | Failure scenarios are organized across 3 time horizons (day 1, 1 month, 6 months) | **PASS** | Step 3 contains three clearly labeled horizons: "Immediate Failure — Day 1" (2 scenarios), "Medium-Term Failure — 1 Month In" (3 scenarios), "Long-Term Failure — 6 Months Out" (2 scenarios). |
| 5 | Each horizon produces at least 1 distinct failure (not the same failure repeated at different horizons) | **PASS** | Day 1: rollback gap + key distribution race. Month 1: mobile adoption stall + refresh token accumulation + UX complaints. 6 months: refresh token bottleneck fully realized + payload drift. Each horizon has unique failures. |
| 6 | Seeded flaw SF-1 (missing session rollback — users who converted have no session to fall back to) is surfaced at the day-1 horizon | **PASS** | SF-1 directly describes the rollback gap. It appears in the main scenarios as Failure Scenario 1 and is placed at the day-1 horizon as F-D1-1. The gap check flags it as a critical finding. |
| 7 | Seeded flaw SF-3 (refresh token DB = new Redis bottleneck at 6-month scale) is surfaced at the 6-month horizon | **PASS** | SF-3 describes this flaw in detail. It appears at the 6-month horizon as F-L6-1 (fully realized bottleneck), with early signs at 1-month (F-M1-2). The gap check flags it as a critical finding undermining the core thesis. |
| 8 | Each failure scenario is checked against the plan for whether it is addressed | **PASS** | Step 4 contains a gap check table examining every failure scenario and both black swans against the plan, with explicit addressed/not-addressed verdicts. |
| 9 | Unaddressed scenarios are flagged as findings | **PASS** | Every unaddressed scenario has an explicit "FINDING:" label in the gap check table. Zero scenarios are fully addressed; one is partially addressed. |
