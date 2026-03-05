# Test 3.1: Full Protocol — Auth Migration Plan

**Plan under review:** Migrate Authentication from Session Cookies to JWT Tokens (plan-auth-migration.md)
**Mode:** ADVERSARIAL (escalated — 1 CRITICAL + 3 MAJOR findings triggered escalation during Phase 2)

---

**VERDICT: REVISE**

**Overall Assessment**: The plan has a sound high-level structure and a genuinely solid monitoring setup (Step 3), but it contains a critical rollback safety gap that would strand converted users during any rollback event, and three major findings that undermine the core thesis, the migration trigger mechanism, and refresh endpoint resilience. The plan needs targeted revision to address these gaps before it is safe to execute.

**Pre-commitment Predictions**:
Before detailed investigation, predicted the following problem areas based on the domain (auth migration):
1. **Session invalidation during migration** — Auth migrations commonly fail to account for the intermediate state where users hold credentials from both systems. *Confirmed: SF-1 (CRITICAL).*
2. **Token refresh failure handling** — Stateless JWT systems are brittle when the refresh path is unavailable. *Confirmed: SF-2 (MAJOR).*
3. **Scaling analysis for new stateful components** — Plans that claim to remove state often introduce replacement state without sizing it. *Confirmed: SF-3 (MAJOR).*
4. **Mobile SDK adoption lag blocking deprecation timeline** — Mobile update adoption rates are well-documented to be slow. *Partially confirmed: surfaced as a Minor finding; the plan's lazy migration mitigates the worst case but the week-4 deadline is still unrealistic.*
5. **Key rotation operational gaps** — Plans mentioning key rotation rarely specify the rotation procedure. *Confirmed as Minor — operationally important but not blocking.*

Predictions 1-3 were confirmed at high severity. Prediction 4 was confirmed at lower severity than expected. One unpredicted finding emerged: the causal chain break between Step 4 and Step 5 (SF-4), discovered via backcasting.

---

**Critical Findings** (blocks execution):

### CF-1: Rollback gap — converted users have no session to fall back to (SF-1)
*Techniques: Pre-Mortem (Day-1 horizon) + Rollback Analysis*

Step 6 states: `"Rollback at any phase: disable the JWT path in the gateway feature flag and users fall back to session cookies."` But Step 5 describes a lazy migration where clients `"exchange [their] existing session for a JWT token pair"` on first request after SDK update. This exchange is one-way — the old session is consumed to produce the JWT pair. Users who have already converted hold JWT tokens but no valid session cookie.

When the JWT path is disabled during rollback, these converted users have no credential accepted by either path. They are locked out with no automated recovery mechanism. At the 1% canary phase, this affects ~120 users. At the 50% phase, ~6,000 users are stranded.

The plan's own success metric — `"Zero user-facing auth errors during migration"` — is violated on the first rollback attempt.

- Confidence: HIGH
- Why this matters: Any rollback during gradual rollout causes immediate, widespread user lockout with no automated recovery. The rollback strategy — the plan's primary safety mechanism — is fundamentally broken for any user who has already converted.
- Fix: Preserve session cookies alongside JWT tokens during the entire migration window. Do not invalidate or expire sessions when issuing JWT pairs. Sessions should remain valid in Redis until Step 7 explicitly decommissions them. The rollback procedure must include: (1) disable JWT path, (2) verify session cookie validity for all users in the converted cohort, (3) force session re-creation for any user whose session expired during the dual-mode window.

---

**Major Findings** (causes significant rework):

### MF-1: No failure handling for refresh endpoint unavailability (SF-2)
*Techniques: Pre-Mortem (Day-1 horizon) + Feasibility Check*

Step 2 defines three endpoints: `/auth/token`, `/auth/refresh`, `/auth/revoke`. With 15-minute access tokens, the refresh endpoint is on the critical path — every active user hits it at least 4 times per hour. The plan specifies no behavior for when `/auth/refresh` is unavailable: no retry logic, no grace period for expired access tokens, no client-side fallback, no circuit breaker.

If the auth service's database (which stores refresh tokens) experiences connection pool exhaustion or the service itself restarts, every user whose access token expires during the outage is immediately logged out. The plan says `"The service will be deployed as a standalone microservice with its own database"` but specifies no redundancy, failover, or degraded-mode operation for this critical-path service.

- Confidence: HIGH
- Why this matters: A standalone microservice with a single database and no specified redundancy is a single point of failure on the auth critical path. Any downtime longer than 15 minutes causes 100% user logout.
- Fix: (1) Specify retry logic in client SDKs for failed refresh attempts (exponential backoff, 3 retries). (2) Add a grace period: gateway should accept access tokens up to 5 minutes past expiry during refresh endpoint degradation. (3) Specify database redundancy (replica, connection pool sizing) for the refresh token store. (4) Add a health check and circuit breaker for the refresh endpoint.

### MF-2: Refresh token database becomes the new Redis bottleneck at scale (SF-3)
*Techniques: Pre-Mortem (6-month horizon) + Backcasting*

The plan's core thesis is: `"JWT tokens eliminate server-side session state entirely."` But Step 2 introduces `"its own database for refresh token storage."` With 7-day refresh tokens and projected growth to 50,000 DAU (Background), this database accumulates hundreds of thousands of active refresh tokens. Every 15-minute access token refresh requires a database lookup. Every revocation requires a write and lookup.

The plan contains no capacity analysis, no sizing projections, no connection pooling configuration, no sharding strategy, and no cleanup job for expired refresh tokens. At 50,000 DAU with multi-device users, Monday-morning login storms will cause connection pool exhaustion — the same scaling wall the migration was designed to eliminate, except with a relational database that lacks Redis's years of operational tuning for this exact workload pattern.

The core thesis is internally contradicted: the plan replaces one stateful bottleneck (Redis sessions) with another (refresh token DB) while claiming to have eliminated server-side state.

- Confidence: HIGH
- Why this matters: The plan's stated motivation — scaling to 50,000 DAU without proportional infrastructure cost — is undermined. The refresh token database is functionally a session store with worse horizontal scaling characteristics than Redis.
- Fix: (1) Add capacity analysis: project refresh token volume at 50K DAU (accounts for multi-device users, 7-day token lifetime). (2) Specify database technology, connection pool sizing, and sharding strategy. (3) Add a TTL-based cleanup job for expired refresh tokens. (4) Consider using Redis (the existing infrastructure) for refresh token storage rather than introducing a new database. (5) Revise the core thesis to acknowledge that refresh token storage is server-side state and explain why the new state has better scaling properties than session storage.

### MF-3: Causal chain break — Step 4 to Step 5 has no migration trigger (SF-4)
*Techniques: Backcasting + Dependency Audit*

Backcasting from Step 5: For clients to `"exchange [their] existing session for a JWT token pair"` on first request, the client must know it should perform the exchange. But Step 4's dual-mode gateway `"inspects the Authorization header first; if absent, falls back to the session cookie"` — it silently handles both auth methods and produces a `"unified internal auth context object regardless of auth method."` The gateway provides no signal to the client that it should migrate.

Step 5 assumes a migration trigger exists. Step 4 does not produce one. The handoff between these steps has an unspecified coordination mechanism. Two competent developers could interpret this differently: one might add a response header prompting migration, another might rely on the SDK update itself to proactively request a token — but the latter requires the SDK to know where to send the exchange request, which is also unspecified.

- Confidence: HIGH
- Why this matters: Without a defined migration trigger, the lazy migration described in Step 5 has no mechanism to actually initiate. The migration will not happen automatically as the plan implies.
- Fix: Define the migration trigger explicitly. Options: (1) The updated SDK proactively calls `/auth/token` with the session cookie to obtain a JWT pair on first launch after update. (2) The gateway adds a `X-Migrate-Auth: jwt` response header when it detects a session-cookie-authenticated request from a client in the rollout cohort. (3) The SDK checks for a JWT on startup and, if absent, initiates the exchange. Whichever mechanism is chosen, specify it in Step 4 or Step 5.

---

**Minor Findings** (suboptimal but functional):

1. **Key rotation procedure unspecified.** Step 1 mentions `"rotating key pairs stored in AWS KMS"` but provides no rotation frequency, overlap period, JWKS endpoint for key discovery, or cache invalidation strategy for downstream services. First rotation will cause intermittent 401 errors for tokens signed with the new key while services cache the old public key.

2. **Token lifetime rationale missing.** The 15-minute access / 7-day refresh token lifetimes are stated without justification. These represent critical security-UX tradeoffs that should be derived from the platform's threat model and usage patterns, not treated as self-evident defaults.

3. **Mobile SDK adoption timeline unrealistic for week-4 deprecation.** Step 7 sets a week-4 deadline for removing session cookie support, but mobile update adoption typically reaches only 60-70% after 2 weeks. The remaining users on old SDKs will lose authentication when session cookies are disabled. The lazy migration decision mitigates the thundering herd but creates an indefinite migration tail.

4. **Dual-mode gateway failure semantics ambiguous.** Step 4 does not specify behavior when a JWT is present but invalid (expired, malformed). If the gateway rejects immediately, dual-mode users with a valid session but stale JWT are locked out. If it falls through to session cookies, an attacker can attach a crafted invalid JWT to force session-cookie evaluation.

---

**What's Missing** (gaps, unhandled edge cases, unstated assumptions):

1. **Client-side token lifecycle management.** No specification of token storage (secure keychain on mobile, httpOnly equivalent on web), proactive refresh timing (refresh before expiry vs. after failure), retry logic, or offline-to-online re-authentication.

2. **Token size budget.** The JWT payload includes user ID, roles, permissions, and expiration. For users with complex permission sets, tokens could grow to 2-4KB. No maximum token size is defined, and no strategy exists for handling large permission sets that threaten the 50ms validation latency target.

3. **AWS KMS failover strategy.** The entire signing infrastructure depends on a single AWS KMS region. No multi-region key replication, no local HSM fallback, no pre-signed emergency tokens. A KMS outage during migration renders the auth service unable to issue or refresh tokens.

4. **Post-deprecation emergency rollback.** Step 7 decommissions Redis and archives session code. If a critical JWT library CVE is disclosed after week 4, there is nothing to roll back to. The plan has no contingency for needing to restore session-based auth after the old system is torn down.

5. **JWT payload governance and versioning.** Step 1 defines the initial token schema but provides no versioning strategy, governance model, or evolution rules. Over time, teams will embed additional claims (feature flags, A/B groups, tenant context), causing payload drift and cross-service compatibility issues.

---

**Ambiguity Risks**:

- Step 5: `"the client exchanges its existing session for a JWT token pair"` — Interpretation A: the session is invalidated upon exchange (one-way conversion). Interpretation B: the session remains valid alongside the JWT (parallel credentials). Risk if Interpretation A is chosen: rollback is broken for converted users (CF-1). The plan must specify which interpretation is intended.

- Step 6: `"1% (canary), 10%, 50%, 100%"` — Interpretation A: percentage of users (sticky assignment). Interpretation B: percentage of requests (random per-request). Risk if Interpretation B is chosen: individual users experience both auth paths randomly, making it impossible to validate the JWT-only experience for any single user.

- Step 7: `"After 100% rollout is stable for 1 week"` — Interpretation A: 100% of the feature flag rollout (all new requests go through JWT). Interpretation B: 100% of users have completed migration. These are different populations. Inactive users returning after the stability window will find their session cookies rejected.

---

**Multi-Perspective Notes**:

- **Executor:** "Step 5 tells me to update all client SDKs to request JWT tokens, but it doesn't tell me how the client knows when to initiate the exchange, what endpoint to call, what to send as the exchange credential, or how to handle a failed exchange. I would have to make multiple assumptions or ask questions before I could write a single line of SDK code."

- **Stakeholder:** "The success metric 'Zero user-facing auth errors during migration' is aspirational but the plan's rollback mechanism violates it by design. The week-4 Redis decommission deadline is a cost-savings milestone, not a user-facing metric, yet it drives the deprecation timeline. If mobile adoption stalls, do we force users off or keep paying for Redis? This tradeoff is not discussed."

- **Skeptic:** "The strongest argument against this plan is that it claims to eliminate server-side state while introducing a refresh token database that is functionally a session store. The 'stateless JWT' framing is misleading. The plan should be honest about what it actually achieves: replacing a Redis-based session store with a database-based refresh token store, which may or may not have better scaling properties. The core thesis needs to be rewritten to reflect reality."

---

**Verdict Justification**:

REVISE is warranted because the plan contains one CRITICAL finding (rollback safety gap for converted users) that makes the migration unsafe to execute as written, plus three MAJOR findings that collectively undermine the core thesis, the migration mechanism, and the refresh path resilience.

**Escalation to ADVERSARIAL mode** occurred after discovering CF-1 (CRITICAL rollback gap) during Pre-Mortem analysis. The combination of a CRITICAL finding and 3 MAJOR findings indicated systemic issues rather than isolated gaps. In ADVERSARIAL mode, additional scrutiny of Steps 4-5 revealed the causal chain break (MF-3) that THOROUGH mode might have accepted as implicit.

**Realist Check applied to all CRITICAL/MAJOR findings:**
- CF-1 (rollback gap): Survives. Realistic worst case is user lockout during rollback — a scenario the plan explicitly names as its safety mechanism. No mitigating factor exists; the rollback path is the mitigation, and it's broken. Data loss potential (users locked out of accounts) justifies CRITICAL.
- MF-1 (refresh endpoint failure): Survives at MAJOR. Realistic worst case is widespread logout during an auth service restart, detectable within minutes via monitoring (Step 3 is solid). Not upgraded to CRITICAL because 15-minute token lifetime limits the blast radius to users whose tokens expire during the outage window.
- MF-2 (refresh DB scaling): Survives at MAJOR. This is a 6-month problem, not a day-1 problem. The team has time to address it before hitting the scaling wall. Not CRITICAL because the immediate deployment will work fine at current DAU.
- MF-3 (migration trigger): Survives at MAJOR. The implementation team will likely resolve this during development, but a plan that omits the migration trigger mechanism requires revision — the gap is too large to leave to implementation-time decisions.

**False positive traps avoided:**
- Step 3 (Monitoring and Observability) was examined via Consider-the-Opposite and found genuinely solid. Datadog dashboards with specific metrics, PagerDuty alerts with quantitative thresholds (>100ms latency, >0.5% error rate), and structured logging with correlation IDs — this is a well-designed monitoring section. No findings generated.
- The RS256 decision in Step 1 was subjected to Socratic analysis. The why-chain: RS256 -> asymmetric signing -> multiple services verify without signing secret -> reduces attack surface of compromised services. This chain terminates in a well-established security principle (principle of least privilege for cryptographic material). The decision is sound and not flagged.

**To upgrade to ACCEPT-WITH-RESERVATIONS:** Fix CF-1 (preserve sessions during migration window), address MF-1 (refresh endpoint resilience), add capacity analysis for MF-2, and define the migration trigger for MF-3.

---

**Open Questions (unscored)**:

1. Has the team benchmarked RS256 token validation latency at the expected payload sizes? The 50ms p99 target may be tight for tokens with large permission sets signed with RS256 (which is 10-50x slower to verify than HS256).

2. What is the expected distribution of devices per user? Multi-device users multiply the refresh token storage requirement. At 2-3 devices per user with 50K DAU, the refresh token database holds 100K-150K active tokens with 7-day lifetimes.

3. Is there an existing JWKS infrastructure, or would key discovery need to be built from scratch? This affects the feasibility and timeline of fixing the key rotation gap.

4. Does the platform have existing forced-upgrade mechanisms for mobile apps (minimum version enforcement, in-app upgrade prompts)? This would affect whether the week-4 deprecation timeline is realistic.

5. The plan does not mention CORS configuration changes required for JWT-based auth on web clients. If access tokens are sent via Authorization headers instead of cookies, CORS preflight behavior changes and may require gateway configuration updates.

---

## Evaluation Checklist

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Verdict is within expected range (REVISE or REJECT) | **PASS** | Verdict is REVISE. |
| 2 | SF-1 (rollback gap) detected at CRITICAL severity | **PASS** | CF-1 directly addresses the rollback gap for converted users, rated CRITICAL, with Pre-Mortem and Rollback Analysis cited as detection techniques. |
| 3 | SF-2 (refresh endpoint failure) detected at MAJOR severity | **PASS** | MF-1 covers refresh endpoint unavailability at MAJOR severity, detected via Pre-Mortem + Feasibility Check. |
| 4 | SF-3 (refresh DB = new Redis bottleneck) detected at MAJOR severity | **PASS** | MF-2 covers the refresh token database scaling gap at MAJOR severity, detected via Pre-Mortem + Backcasting. |
| 5 | SF-4 (causal chain break Step 4→5) detected at MAJOR severity | **PASS** | MF-3 covers the missing migration trigger between Steps 4 and 5 at MAJOR severity, detected via Backcasting + Dependency Audit. |
