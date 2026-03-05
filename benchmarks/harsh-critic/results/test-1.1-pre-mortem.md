# Test 1.1: Strengthened Pre-Mortem — Auth Migration Plan

## Step 1: Certainty-Framed Failure Scenarios

An infallible crystal ball shows this plan was executed exactly as written and was a complete fiasco. Here is why.

### Failure Scenario 1: Missing Session Rollback for Converted Users

During the gradual rollout (Step 6), a critical bug is discovered in JWT token validation under load at the 50% phase. The team triggers a rollback by disabling the JWT path in the gateway feature flag. However, users who already exchanged their session cookies for JWT token pairs during the lazy migration (Step 5) no longer have valid session cookies — those sessions were issued before the exchange and may have expired or been invalidated by the session-to-token swap. These users are left in a dead zone: the JWT path is disabled, but they have no session to fall back to. Thousands of users are locked out and must re-authenticate manually, violating the "zero user-facing auth errors" success metric.

### Failure Scenario 2: Refresh Token Database Becomes the New Bottleneck at Scale

The plan's core thesis is that JWT eliminates server-side session state. But Step 2 introduces a dedicated database for refresh token storage. With 7-day refresh tokens and a projected 50,000 DAU at the 6-month mark, this database accumulates hundreds of thousands of active refresh tokens. Every token refresh hits this database. Every revocation requires a lookup. The refresh token database becomes the new Redis — a centralized stateful bottleneck — except now it lacks the years of operational tuning that the Redis cluster had. At 50,000 DAU, refresh storms (e.g., Monday morning logins) cause database connection exhaustion, cascading auth failures, and the very scaling wall the migration was supposed to eliminate.

### Failure Scenario 3: JWT Token Size Bloats Request Overhead

The token schema (Step 1) includes user ID, roles, permissions, and expiration. For users with complex permission sets (admin users, multi-tenant operators), the JWT payload balloons to 2-4KB. Unlike a compact session cookie ID, this token is sent on every single API request in the Authorization header. For mobile clients on constrained networks, this adds meaningful latency. For the API gateway, parsing and cryptographically verifying an RS256-signed 4KB token on every request pushes p99 validation latency well beyond the 50ms target. The plan does not specify a maximum token size or a strategy for handling large permission sets (e.g., using opaque permission references instead of inline claims).

### Failure Scenario 4: Key Rotation Causes Mass Token Invalidation

Step 1 specifies rotating key pairs in AWS KMS, but the plan provides no detail on the rotation procedure, overlap period, or how services discover new public keys. On day 1 of a key rotation, the auth service starts signing with a new key pair, but downstream microservices still cache the old public key. All newly issued tokens fail validation across every service until key caches refresh. If the cache TTL is long (common for performance), this creates a window of minutes to hours where new tokens are useless but old tokens still work — a confusing partial outage that monitoring may not immediately flag as a key rotation issue.

### Failure Scenario 5: Client SDK Update Adoption Stalls on Mobile

Step 5 assumes client SDKs will be updated across web, iOS, and Android. Web can be deployed instantly, but iOS and Android updates depend on App Store/Play Store review and user update behavior. Historical data for mobile apps shows that after 2 weeks, only 60-70% of users have updated. The remaining 30-40% of mobile users continue using session cookies indefinitely, meaning the dual-mode gateway (Step 4) cannot be retired on schedule (week 4). The Redis cluster must stay live, continuing to incur the costs the migration was meant to eliminate, with no plan for forcing the remaining users to upgrade.

### Failure Scenario 6: 15-Minute Access Token Lifetime Creates UX Cliff

With 15-minute access tokens, any user whose client fails a single refresh (network blip, background app suspension on mobile, laptop lid closed for 16 minutes) is immediately logged out. The old session-cookie system had much longer effective lifetimes because the session was maintained server-side. Users experience dramatically increased "random logouts" compared to the old system. The plan has no specification for retry logic, grace periods, or silent refresh strategies in the client SDKs. Support tickets spike, and user satisfaction drops measurably.

### Failure Scenario 7: Dual-Mode Gateway Introduces Priority-Based Security Flaw

Step 4 specifies that the gateway checks the Authorization header first, then falls back to the session cookie. An attacker who steals an expired or revoked JWT can pair it with a request that also carries a valid session cookie. If the gateway's "check JWT first" logic rejects the invalid JWT and returns a 401 rather than falling through to the session cookie, legitimate dual-mode users get locked out. If it does fall through, an attacker can craft requests with a forged JWT header to force session cookie fallback, bypassing JWT-based security controls. The plan does not specify the exact failure semantics of dual-mode evaluation.

---

## Step 2: Black Swan Scenarios

Now generate 1-2 failure scenarios that would make everyone say "we never could have predicted that."

### Black Swan 1: AWS KMS Regional Outage During Peak Migration

During the 50%-to-100% rollout phase, AWS KMS in the primary region suffers a multi-hour outage. Because RS256 signing depends on KMS for private key operations, the auth service cannot issue new tokens or rotate keys. Simultaneously, the 15-minute access token lifetime means every active user's token expires within 15 minutes. The auth service is completely unable to issue replacements. Within 20 minutes, 100% of JWT-authenticated users are locked out. Session cookie fallback only works for users who haven't yet converted (a shrinking population at this phase). The entire platform goes effectively offline for the duration of the KMS outage. The plan has no mention of KMS failover, multi-region key replication, or a local HSM fallback.

### Black Swan 2: A Critical JWT Library CVE Forces Emergency Rollback After Deprecation

Three weeks after the Redis cluster is decommissioned (Step 7), a critical CVE is published in the JWT signing library used by the auth service, allowing token forgery. The security team mandates an immediate rollback to session-based auth. But the Redis cluster has been decommissioned, session-related code has been archived, and there is no infrastructure or code path to restore sessions quickly. The team faces a choice: leave a known-exploitable system running for days while rebuilding session auth, or take the platform offline. The plan has no contingency for post-deprecation emergency rollback.

---

## Step 3: Multi-Horizon Analysis

### Immediate Failure — Day 1

**F-D1-1: Rollback gap for converted users (Failure Scenario 1).** On the very first day of canary rollout (1% of users), the lazy migration converts these users from sessions to JWTs. If a critical issue is detected within hours — say, token validation intermittently fails due to a clock skew between the auth service and the API gateway — the team disables the JWT feature flag. But the 1% of users who already exchanged sessions for tokens have no valid sessions to fall back to. Even at 1%, that is ~120 users locked out on day 1, requiring manual intervention (password resets or forced session re-creation) that was never planned for.

**F-D1-2: Key distribution race condition (Failure Scenario 4).** On the first deployment of the auth service, the initial signing key is propagated to KMS, but downstream service verification key caches may not be populated. The first tokens issued are unverifiable by some services, causing intermittent 401 errors that appear to be random from the user's perspective.

### Medium-Term Failure — 1 Month In

**F-M1-1: Mobile SDK adoption stall (Failure Scenario 5).** One month in, the rollout is at 100% for web users who auto-updated, but only ~65% of mobile users have updated their apps. The dual-mode gateway is still required. The team is stuck in a prolonged dual-mode state, doubling the auth surface area to monitor and secure, doubling the bug surface, and unable to begin Redis decommissioning. The week-4 deadline for removing backward compatibility is missed.

**F-M1-2: Refresh token accumulation begins to show strain (Failure Scenario 2, early signs).** With 12,000 DAU now fully on JWT, the refresh token database holds ~12,000 active refresh tokens with 7-day lifetimes — manageable, but growth patterns are non-linear. Users with multiple devices hold multiple refresh tokens. The token cleanup/expiration job is not specified in the plan. Orphaned tokens accumulate.

**F-M1-3: 15-minute token UX complaints accumulate (Failure Scenario 6).** After a month of JWT auth, mobile users on unreliable networks report frequent logouts. Support tickets for "app keeps logging me out" increase by 3x compared to the session-cookie era. Product management requests extending token lifetime, which conflicts with the security team's requirements.

### Long-Term Failure — 6 Months Out

**F-L6-1: Refresh token database becomes the new bottleneck (Failure Scenario 2, fully realized).** At 50,000 DAU — the projected scale — the refresh token database holds 50,000+ active tokens (more with multi-device users). Every 15-minute access token refresh hits this database. Monday morning login storms cause connection pool exhaustion. The team realizes they have replaced a Redis bottleneck with a relational database bottleneck that is harder to horizontally scale. The "stateless" JWT architecture is stateless in name only; the refresh token store is the new session store with worse operational characteristics.

**F-L6-2: JWT payload drift causes cross-service incompatibilities.** Over 6 months, different teams embed additional claims in the JWT payload for their services (feature flags, A/B test groups, tenant context). Without a governance model for the token schema, tokens grow unpredictably. Some services depend on claims that others do not set. A service deployed with a new required claim breaks older tokens that lack it. The plan specifies the initial schema but has no governance, versioning, or evolution strategy for the JWT payload over time.

---

## Step 4: Gap Check — Does the Plan Address Each Failure Scenario?

| # | Failure Scenario | Addressed in Plan? | Finding |
|---|---|---|---|
| FS-1 | Missing session rollback for converted users | **NO.** Step 6 says rollback = "disable JWT path, users fall back to session cookies," but does not account for users whose sessions were already replaced by the token exchange in Step 5. | **FINDING: The plan assumes rollback is seamless but provides no mechanism to restore sessions for users who already converted to JWT. This is a critical gap in the rollback strategy.** |
| FS-2 | Refresh token database becomes the new bottleneck | **NO.** Step 2 mentions "its own database for refresh token storage" but provides no sizing, scaling strategy, connection pooling plan, or cleanup/expiration job. The plan does not analyze whether this database recreates the same bottleneck Redis had. | **FINDING: The plan replaces one stateful bottleneck (Redis sessions) with another (refresh token DB) without any capacity planning or scaling analysis for the 50,000 DAU target.** |
| FS-3 | JWT token size bloats request overhead | **NO.** Step 1 defines what goes into the token but sets no maximum size and has no strategy for users with large permission sets. | **FINDING: No token size budget or mitigation for large payloads.** |
| FS-4 | Key rotation causes mass token invalidation | **PARTIALLY.** Step 1 mentions "rotating key pairs stored in AWS KMS" but specifies no rotation procedure, overlap window, or key discovery mechanism for verifying services. | **FINDING: Key rotation is mentioned but not operationalized. No overlap period, no JWKS endpoint, no cache invalidation strategy.** |
| FS-5 | Client SDK update adoption stalls on mobile | **NO.** Step 5 assumes SDK updates will happen but provides no timeline, forced-upgrade mechanism, or analysis of mobile update adoption rates. Step 7 sets a week-4 deadline to remove backward compatibility with no contingency for slow mobile adoption. | **FINDING: The week-4 deprecation deadline is unrealistic without a forced-upgrade strategy for mobile users.** |
| FS-6 | 15-minute token lifetime creates UX cliff | **NO.** Step 1 sets the 15-minute lifetime but the plan contains no client-side refresh strategy, retry logic, or graceful degradation for failed refreshes. | **FINDING: No client-side token lifecycle management specified despite aggressive token expiration.** |
| FS-7 | Dual-mode gateway security flaw | **NO.** Step 4 describes the dual-mode fallback order but does not specify failure semantics: what happens when the JWT is present but invalid? Reject, or fall through to session cookie? | **FINDING: Dual-mode gateway failure semantics are ambiguous, creating a potential security vulnerability.** |
| BS-1 | AWS KMS regional outage during migration | **NO.** The plan relies entirely on AWS KMS for signing with no failover, multi-region replication, or local fallback mentioned. | **FINDING: Single-region KMS dependency creates a single point of failure for the entire auth system.** |
| BS-2 | Critical JWT library CVE after Redis decommission | **NO.** Step 7 removes Redis and archives session code with no contingency for needing to restore session-based auth after decommission. | **FINDING: No post-deprecation emergency rollback plan exists. Once Redis is decommissioned, the fallback path is destroyed.** |
| F-D1-2 | Key distribution race condition on first deploy | **NO.** See FS-4 above. No key distribution or cache warming strategy. | **FINDING: Same as FS-4 — no operationalized key distribution.** |
| F-M1-3 | 15-minute token UX complaints | **NO.** See FS-6 above. | **FINDING: Same as FS-6.** |
| F-L6-2 | JWT payload drift over 6 months | **NO.** Step 1 defines the initial schema but has no versioning, governance, or evolution strategy. | **FINDING: No token schema governance model for long-term payload evolution.** |

### Summary of Findings

The plan addresses **zero** of the identified failure scenarios fully. One scenario (FS-4, key rotation) is partially mentioned but not operationalized. The two most critical unaddressed gaps are:

1. **SF-1 (Rollback gap):** The rollback strategy in Step 6 is fundamentally broken for any user who has already completed the session-to-JWT exchange. There is no mechanism to restore or recreate sessions for these users.

2. **SF-3 (Refresh token scaling):** The plan's core thesis — eliminating server-side state — is undermined by the refresh token database introduced in Step 2. At the 6-month scaling target of 50,000 DAU, this database becomes the new bottleneck, and the plan contains no capacity analysis or horizontal scaling strategy for it.

---

## Evaluation Checklist

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | Output contains exactly the certainty framing language (crystal ball / fiasco) — not hedged alternatives | **PASS** | Step 1 opens with: "An infallible crystal ball shows this plan was executed exactly as written and was a complete fiasco." |
| 2 | 5-7 failure scenarios generated (count them) | **PASS** | 7 failure scenarios generated (FS-1 through FS-7). |
| 3 | At least 1-2 explicitly labeled black swan scenarios present | **PASS** | 2 black swan scenarios explicitly labeled (BS-1: KMS outage, BS-2: JWT library CVE). |
| 4 | Failure scenarios are organized across 3 time horizons (day 1, 1 month, 6 months) | **PASS** | Step 3 contains three clearly labeled horizons: "Immediate Failure — Day 1," "Medium-Term Failure — 1 Month In," and "Long-Term Failure — 6 Months Out." |
| 5 | Each horizon produces at least 1 distinct failure (not the same failure repeated at different horizons) | **PASS** | Day 1: rollback gap + key distribution race. Month 1: mobile adoption stall + refresh token early signs + UX complaints. 6 months: refresh token bottleneck fully realized + payload drift. Each horizon has at least one unique failure not present at other horizons. |
| 6 | Seeded flaw SF-1 (missing session rollback) is surfaced, likely at the day-1 horizon | **PASS** | FS-1 directly describes this flaw. It appears in the main scenarios and is explicitly placed at the day-1 horizon (F-D1-1). The gap check flags it as a critical finding. |
| 7 | Seeded flaw SF-3 (6-month scaling gap — refresh token database becomes the new bottleneck) is surfaced at the 6-month horizon | **PASS** | FS-2 describes this flaw in detail. It appears at the 6-month horizon (F-L6-1) as the fully realized bottleneck, with early signs noted at 1-month (F-M1-2). The gap check flags it as a critical finding. |
| 8 | Each failure scenario is checked against the plan for whether it is addressed | **PASS** | Step 4 contains a full table checking every failure scenario (including black swans and horizon-specific failures) against the plan. |
| 9 | Unaddressed scenarios are flagged as findings | **PASS** | Every unaddressed scenario has an explicit "FINDING:" label in the gap check table. Zero scenarios were found to be fully addressed; one was partially addressed. |
