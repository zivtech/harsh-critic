# Test 2.1: Deep Investigation Group (G1: T1 + T2 + T5)

**Fixture:** plan-auth-migration.md — Migrate Authentication from Session Cookies to JWT Tokens
**Techniques:** Strengthened Pre-Mortem (T1), Socratic Deconstruction (T2), Backcasting (T5)

---

## Step 2 — Strengthened Pre-Mortem (T1)

An infallible crystal ball shows this plan was executed exactly as written and was a complete fiasco. Here is why.

### Failure Scenarios

#### Failure Scenario 1 (Day 1): JWT Rollback Gap — Converted Users Stranded

During the canary phase of the gradual rollout (Step 6), a critical bug is discovered in JWT token validation within the first hours. The team follows the documented rollback procedure: disable the JWT path in the gateway feature flag so users fall back to session cookies. But users who already exchanged their existing session for a JWT token pair during the lazy migration (Step 5) no longer have valid session cookies. The exchange was one-way — the old session was consumed to produce a JWT pair, and no mechanism exists to recreate sessions for converted users. Even at the 1% canary level, approximately 120 users are locked out with no automated recovery path. The rollback strategy documented in Step 6 ("disable the JWT path in the gateway feature flag and users fall back to session cookies") is fundamentally broken for any user who has already completed the session-to-JWT conversion. The "zero user-facing auth errors during migration" success metric is shattered on the first rollback attempt.

**Addressed in plan?** NO. Step 6 assumes rollback = disable JWT path, but does not account for users whose sessions were already replaced by the token exchange in Step 5. There is no mechanism to restore or recreate sessions for these users.

#### Failure Scenario 2 (Day 1): Key Distribution Race Condition on First Deployment

On the first deployment, the initial RS256 signing key is created in AWS KMS. However, downstream microservices that need to verify tokens have not yet populated their verification key caches. The plan specifies no JWKS endpoint, no cache-warming procedure, and no key discovery mechanism. The first tokens issued by the auth service are unverifiable by some downstream services, producing intermittent 401 errors that appear random to users. Because Step 3's monitoring is designed to track steady-state metrics (validation latency, auth error rate), not first-deployment bootstrap issues, the root cause is not immediately obvious. With no JWKS endpoint or cache-warming procedure specified, this race condition is inherent in the first deployment.

**Addressed in plan?** PARTIALLY. Step 1 mentions "rotating key pairs stored in AWS KMS" but specifies no key distribution mechanism, no JWKS endpoint, no overlap window, and no cache-warming procedure for initial deployment.

#### Failure Scenario 3 (1 Month): Mobile SDK Adoption Stalls, Blocking Redis Decommission

One month into the rollout, the web deployment has reached 100% JWT adoption because web updates deploy instantly. But iOS and Android SDK updates depend on App Store and Play Store review cycles and user willingness to update. Historical mobile update adoption rates show 60-70% uptake after 2 weeks. The remaining 30-40% of mobile users continue using session cookies indefinitely. The dual-mode gateway (Step 4) cannot be retired. Step 7's week-4 deadline for removing backward compatibility and decommissioning Redis has passed with no viable path to meeting it. Redis costs continue. The plan has no forced-upgrade mechanism, no minimum-version enforcement, and no analysis of mobile update adoption rates.

**Addressed in plan?** NO. Step 5 assumes SDK updates will happen but provides no timeline, forced-upgrade mechanism, or adoption rate analysis. Step 7 sets a week-4 deadline with no contingency for slow mobile adoption.

#### Failure Scenario 4 (1 Month): 15-Minute Token Lifetime Creates UX Degradation

After a month of JWT auth, users on unreliable networks — especially mobile users — report frequent unexpected logouts. With 15-minute access tokens, any failure to refresh (network blip, app backgrounding, laptop lid closure for 16 minutes) results in immediate logout. The old session-cookie system had far longer effective lifetimes because sessions were maintained server-side. Support tickets for "app keeps logging me out" increase significantly compared to the session-cookie era. Product management requests extending the token lifetime, creating tension with the security team's requirements. The plan specifies no client-side retry logic, no grace period, no silent refresh strategy, and no offline-to-online re-authentication flow.

**Addressed in plan?** NO. Step 1 sets the 15-minute lifetime but no client-side token lifecycle management is specified.

#### Failure Scenario 5 (1 Month): Dual-Mode Gateway Ambiguous Failure Semantics

Step 4 specifies the gateway checks the Authorization header first, then falls back to session cookies. But what happens when a JWT is present but invalid (expired, malformed, signed with a rotated-out key)? If the gateway rejects the request immediately with 401 rather than falling through to the session cookie, dual-mode users who have both an expired JWT and a valid session cookie are locked out unnecessarily. If the gateway does fall through, an attacker can attach a crafted invalid JWT to force session-cookie evaluation, potentially bypassing JWT-specific security controls. The plan does not specify the failure semantics of dual-mode evaluation, creating a security ambiguity that will be resolved ad hoc by whichever engineer implements the gateway logic.

**Addressed in plan?** NO. Step 4 describes the dual-mode fallback order but does not specify behavior when a JWT is present but invalid.

#### Failure Scenario 6 (6 Months): Refresh Token Database Becomes the New Redis Bottleneck

The plan's core thesis is that JWT eliminates server-side session state, removing the Redis bottleneck. But Step 2 introduces "its own database for refresh token storage." With 7-day refresh tokens and projected growth to 50,000 DAU within 6 months, this database accumulates hundreds of thousands of active refresh tokens. Every 15-minute access token refresh requires a database lookup. Every revocation requires a database write and lookup. Token cleanup and expiration jobs are not specified. The refresh token database becomes the new Redis — a centralized stateful bottleneck — except it lacks the years of operational tuning, horizontal scaling configuration, and battle-tested eviction policies that the Redis cluster had. At 50,000 DAU, Monday-morning login storms cause connection pool exhaustion, cascading auth failures, and the very scaling wall the migration was supposed to eliminate. The plan contains no capacity analysis, no scaling strategy, and no performance projections for this database at the 6-month target.

**Addressed in plan?** NO. Step 2 mentions the database but provides no sizing, capacity analysis, scaling strategy, connection pooling plan, or cleanup procedures.

#### Failure Scenario 7 (6 Months): JWT Payload Drift Across Services

Over 6 months, different teams embed additional claims in the JWT payload for their services — feature flags, A/B test groups, tenant context, role hierarchies. Without a governance model for the token schema, tokens grow unpredictably. Some services depend on claims that other services do not set. A service deployed with a new required claim breaks older tokens that lack it. The plan specifies the initial schema (Step 1) but has no versioning, governance, or evolution strategy for the JWT payload over time.

**Addressed in plan?** NO. No schema governance or versioning strategy exists.

### Multi-Horizon Summary

| Horizon | Scenarios | Count | Key Finding |
|---------|-----------|-------|-------------|
| Day 1 | SF-1 (rollback gap), SF-2 (key distribution race) | 2 | The rollback strategy fails on first use for any converted user |
| 1 Month | SF-3 (mobile adoption stall), SF-4 (token lifetime UX), SF-5 (dual-mode ambiguity) | 3 | Redis cannot be decommissioned on schedule; UX degrades |
| 6 Months | SF-6 (refresh DB bottleneck), SF-7 (payload drift) | 2 | The "stateless" architecture recreates the bottleneck it was meant to eliminate |

### Black Swan Scenarios

#### Black Swan 1: AWS KMS Regional Outage During Peak Migration Phase

During the 50%-to-100% rollout phase, AWS KMS in the primary region suffers a multi-hour outage. Because RS256 signing depends on KMS for private key access, the auth service can neither sign new tokens nor rotate keys. The 15-minute access token lifetime means every active user's token expires within 15 minutes, and no replacements can be issued. Refresh token operations also require KMS for signing new access tokens. Within 20 minutes, 100% of JWT-authenticated users are locked out. Session-cookie fallback only works for users who have not yet converted — a shrinking population at the 50-100% phase. The plan mentions no KMS failover, no multi-region key replication, no local HSM fallback, and no pre-signed emergency tokens. A KMS outage was never modeled as a risk because the plan treats AWS KMS as an infallible dependency.

#### Black Swan 2: Critical JWT Library CVE After Redis Decommission

Four weeks after the Redis cluster is decommissioned (Step 7) and session-related code is archived, a critical CVE is published in the JWT signing library used by the auth service, allowing token forgery with only the public key (this has historical precedent). The security team mandates an emergency rollback to session-based authentication. But there is nothing to roll back to: Redis is gone, session code is archived, and the session-cookie code path in the gateway has been removed. The team faces a choice between leaving a known-exploitable system running for days while they rebuild session auth from archived code and re-provision Redis, or taking the platform completely offline. The plan has no post-deprecation emergency rollback strategy. Once the old system is torn down, the rollback path is permanently destroyed.

---

## Step 7 — Socratic Deconstruction (T2)

### Decision 1: RS256 over HS256 for Token Signing (Step 1)

**As stated:** "RS256 over HS256 because our security team recommended asymmetric signing for microservice architectures where multiple services verify tokens but only the auth service signs them."

#### Why-Chain

**Level 1 — Why RS256 over HS256?**
The plan states the security team recommended asymmetric signing for microservice architectures where multiple services verify but only one service signs.

**Level 2 — Why is asymmetric signing appropriate for this architecture?**
In a microservice architecture where multiple services verify tokens, HS256 requires distributing the shared secret to every verifier. Compromising any verifying service would allow forging tokens. RS256 distributes only the public key; compromising a verifier does not grant forgery capability. This is a well-understood security benefit that directly applies when multiple independent services verify tokens.

**Level 3 — Does the described architecture actually require this property?**
The plan describes a microservice architecture (Step 2: "standalone microservice" for auth, Step 4: "API gateway" that verifies, plus multiple downstream services that may verify). The security team's recommendation is grounded in a real architectural property of the described system. The principle (minimize key distribution to reduce forgery attack surface) is a well-established cryptographic axiom.

**Chain Termination: SUPPORTED AXIOM**
The RS256 choice rests on a well-established security principle (asymmetric signing limits forgery risk in distributed verification architectures) that directly applies to the described system. The chain terminates at a sound and widely accepted axiom.

**Fallacy Scan:** No fallacies detected. The security team recommendation is from a domain-appropriate authority and is backed by a technically correct rationale for the stated architecture.

---

### Decision 2: Lazy Migration over Forced Migration (Step 5)

**As stated:** "We chose a lazy migration (convert on next request) over a forced migration (invalidate all sessions at cutover) because lazy migration avoids a thundering herd at the auth service."

#### Why-Chain

**Level 1 — Why lazy migration?**
To avoid a thundering herd — all 12,000 DAU simultaneously hitting the auth service to exchange sessions for tokens at a single cutover moment.

**Level 2 — Why is avoiding a thundering herd the primary concern?**
A thundering herd at the auth service during forced cutover could overwhelm the new token issuance endpoint, causing cascading failures at the most critical moment of the migration. Spreading the conversion load over time through lazy migration distributes this risk across the natural arrival pattern of users. This is a standard engineering approach to managing load during state transitions.

**Level 3 — Is the thundering herd risk real at this scale, and does lazy migration adequately address it?**
At 12,000 DAU, a forced cutover during peak hours could produce thousands of concurrent token requests. The new auth service (Step 2) has no established baseline for this load because it has never run in production. Lazy migration amortizes the conversion load across days, allowing the team to observe the service under gradually increasing load. The engineering tradeoff (longer dual-mode period vs. controlled load distribution) is sound and well-established.

**Chain Termination: SUPPORTED AXIOM**
The reasoning rests on the well-established engineering principle that amortizing load spikes over time reduces the risk of cascading failures in new systems. This is a standard and sound axiom.

**Fallacy Scan:** No fallacies detected. The reasoning identifies a specific, credible risk (thundering herd) and selects an approach designed to mitigate it.

---

### Decision 3: JWT for Stateless Scaling (Core Thesis)

**As stated:** "Migrating to stateless JWT auth will eliminate the Redis session bottleneck and position the platform for 10x user growth without proportional infrastructure cost increases."

#### Why-Chain

**Level 1 — Why JWT for scaling?**
The plan states that JWT tokens eliminate server-side session state entirely, removing the Redis bottleneck that scales linearly with user count.

**Level 2 — Does JWT actually eliminate server-side state in this architecture?**
JWT access tokens are self-contained and verifiable without server-side lookups, which is true for the access token verification path. However, the plan simultaneously introduces a refresh token database (Step 2: "its own database for refresh token storage") and a token revocation endpoint (`/auth/revoke`). Both require server-side state. With 7-day refresh tokens and 15-minute access tokens, every active user hits the refresh token database every 15 minutes. This is a new stateful component that grows proportionally with user count — exactly the scaling pattern the plan claims to eliminate.

**Level 3 — Why should we believe this architecture is "stateless" when it introduces a new stateful component that scales with users?**
The plan's premise is that JWT = stateless = no bottleneck. But the refresh token database is a stateful component that: (a) stores one or more records per active user (multi-device users have multiple refresh tokens), (b) requires a database lookup on every access token refresh (every 15 minutes per user), (c) requires write operations for every revocation, and (d) accumulates state proportional to DAU. At 50,000 DAU with 15-minute refresh cycles, this database handles a sustained query load comparable to the Redis session store it replaced. The claim of "stateless scaling" contradicts the architectural reality of the refresh token store. The plan asserts statelessness while designing a stateful system.

**Chain Termination: UNSUPPORTED ASSERTION**
The chain collapses at Level 3. The plan asserts "stateless JWT eliminates the bottleneck" while simultaneously introducing a new stateful component (refresh token database) that recreates the same scaling pattern. The premise that the architecture is "stateless" is factually incorrect given the plan's own design in Step 2.

**Fallacy: Begging the Question.** The core thesis assumes its own conclusion: "JWT is stateless, therefore it eliminates state-based bottlenecks." But the plan's own design introduces server-side state (refresh token database, revocation tracking). The argument works only if you accept the premise that JWT = stateless, which the plan's own Step 2 contradicts. The conclusion (stateless architecture eliminates the bottleneck) is embedded in the premise (JWT provides statelessness) without demonstrating that the actual design achieves statelessness.

---

### T2 Summary

| Decision | Chain Termination | Fallacies |
|----------|------------------|-----------|
| RS256 over HS256 | Supported axiom | None |
| Lazy migration over forced migration | Supported axiom | None |
| JWT for stateless scaling (Core Thesis) | **Unsupported assertion** | **Begging the question** |

The two implementation decisions (RS256, lazy migration) are well-reasoned and grounded in sound engineering principles. The core thesis decision — that JWT provides stateless scaling — is the one that collapses under scrutiny because the plan's own design contradicts the "stateless" premise by introducing a new stateful component (refresh token database) that scales with user count.

---

## Step 10 — Backcasting (T5)

Working backward from the plan's stated goals through every step.

### Starting Point: Success Criteria

- Auth success rate >= 99.9%
- Token validation p99 < 50ms
- Zero user-facing auth errors during migration
- Redis cluster decommissioned by week 4

---

### Link 7: Goal <-- Step 7 (Session Cookie Deprecation)

**For the success criteria to be met, what must Step 7 produce?**
Step 7 must disable session cookie acceptance, remove the Redis cluster, and archive session code — all without any user-facing auth errors. This requires that every active user is already successfully authenticating via JWT before session cookies are disabled.

**What Step 7 actually produces:** Disabling session cookies in the gateway and removing Redis, after 100% JWT rollout is stable for 1 week.

**Assessment:** Step 7 assumes that 1 week of stable 100% rollout means all users are on JWT. But "100% rollout" in Step 6 means the JWT path is available to 100% of users, not that 100% of users have migrated. Users who have not updated their mobile SDKs (Step 5) still use session cookies through the dual-mode gateway. Disabling session cookie acceptance at Step 7 will lock out any user who has not migrated. The plan does not verify migration completeness before deprecation.

> **[FLAG: ASSUMED BUT UNVERIFIED]** Step 7 assumes 100% rollout equals 100% migration. No migration completeness verification exists.

---

### Link 6: Step 7 <-- Step 6 (Gradual Rollout)

**For Step 7 to safely proceed, what must Step 6 produce?**
Step 6 must produce evidence that all users are successfully authenticating via JWT, with monitoring data confirming zero auth errors and stable performance across all user segments (web, iOS, Android). Critically, it must produce a signal that tells Step 7 "it is now safe to deprecate session cookies."

**What Step 6 actually produces:** A phased rollout (1%, 10%, 50%, 100%) with 3-day monitoring at each phase. Rollback at any phase via gateway feature flag.

**Assessment:** Step 6's rollout phases control the *availability* of the JWT path but not the *adoption* by clients. A user in the 100% phase who has not updated their mobile app still authenticates via session cookies through the dual-mode gateway. Step 6 produces monitoring data about JWT path performance but not about migration completeness — there is no metric tracking "percentage of users who have actually converted to JWT" versus "percentage of users for whom JWT is available." The output of Step 6 (availability percentage) is not the input Step 7 needs (adoption/migration completeness percentage).

> **[CAUSAL CHAIN BREAK: Step 4 to Step 5]** Step 6 produces no migration trigger signal. There is no mechanism that transitions from "JWT is available" to "users are actually using JWT." The causal chain from rollout to deprecation has a missing link.

---

### Link 5: Step 6 <-- Step 5 (Client SDK Migration)

**For Step 6's rollout to result in actual migration, what must Step 5 produce?**
Step 5 must produce updated client SDKs across all platforms (web, iOS, Android) that are installed and active on user devices. Without updated SDKs, the JWT path is available but unused by those clients.

**What Step 5 actually produces:** Updated SDKs that exchange sessions for JWTs on first request after SDK update. Clients that haven't updated continue using session cookies through the dual-mode gateway.

**Assessment:** Step 5 correctly identifies the lazy migration mechanism but depends entirely on users updating their apps. This reveals a hidden precondition: clients must be able to detect that they need JWT and update accordingly. But old SDK versions do not know JWT exists. There is no server-side signal to un-updated clients that they should update. The migration trigger requires user action (updating the app) that the plan cannot control and does not measure.

> **[HIDDEN PRECONDITION]** Clients cannot detect they need JWT. Old SDKs do not know JWT exists. The plan provides no server-side mechanism to trigger or verify client migration. The migration depends on user behavior the plan cannot influence.

---

### Link 4: Step 5 <-- Step 4 (Dual-Mode Gateway Configuration)

**For Step 5's SDK migration to work, what must Step 4 produce?**
Step 4 must produce a gateway that seamlessly handles both auth methods, creating a unified internal auth context regardless of method, so that the backend is unaware of which auth method a user is using.

**What Step 4 actually produces:** A gateway that checks Authorization header first, then falls back to session cookies, producing a unified auth context.

**Assessment:** This link is structurally sound for the steady state. The gateway design supports both auth methods simultaneously. The dual-mode approach allows gradual migration without backend changes.

---

### Link 3: Step 4 <-- Step 3 (Monitoring and Observability Setup)

**For Step 4's dual-mode gateway to be safely operated, what must Step 3 produce?**
Step 3 must produce monitoring that covers both auth paths and can distinguish between JWT-related failures and session-related failures, so the team can attribute problems to the correct path during dual-mode operation.

**What Step 3 actually produces:** Datadog dashboards for token issuance rate, validation latency, refresh success rate, and revocation events. PagerDuty alerts for validation latency >100ms or auth error rate >0.5%.

**Assessment:** Step 3's monitoring is JWT-focused. It tracks token metrics but does not mention session-auth metrics during dual-mode operation. This limits visibility during the migration window.

---

### Link 2: Step 3 <-- Step 2 (Auth Service Implementation)

**For Step 3's monitoring to function, what must Step 2 produce?**
Step 2 must produce a functioning auth service with endpoints that emit the telemetry events Step 3 monitors.

**What Step 2 actually produces:** Token issuance, refresh, and revocation endpoints, deployed as a standalone microservice with its own database for refresh token storage.

**Assessment:** This link is structurally sound for the endpoints. However, the refresh token database introduced in Step 2 has no capacity analysis. No sizing, connection pool configuration, scaling strategy, or cleanup/expiration job is specified. At the 6-month target of 50,000 DAU, this database's performance characteristics are entirely unknown.

> **[FLAG: NEVER SIZED]** The refresh token database introduced in Step 2 has no capacity analysis, no scaling strategy, and no cleanup procedures. At the 50,000 DAU target, its behavior is unpredictable.

---

### Link 1: Step 2 <-- Step 1 (Token Schema Design)

**For Step 2's auth service to issue tokens, what must Step 1 produce?**
Step 1 must produce a JWT payload schema and signing configuration that Step 2 can implement.

**What Step 1 actually produces:** A schema including user ID, roles, permissions, and expiration. RS256 signing with rotating key pairs in AWS KMS. 15-minute access tokens, 7-day refresh tokens.

**Assessment:** This link is structurally sound. Step 1 defines what Step 2 needs to implement.

---

### T5 Summary

| Link | Status | Finding |
|------|--------|---------|
| Step 1 --> Step 2 | Clean | Schema definition feeds implementation |
| Step 2 --> Step 3 | **FLAG** | Refresh token DB never sized for 50K DAU target |
| Step 3 --> Step 4 | Clean | Monitoring feeds gateway operations |
| Step 4 --> Step 5 | Clean | Dual-mode gateway supports both auth methods |
| Step 5 --> Step 6 | **HIDDEN PRECONDITION** | Clients cannot detect they need JWT; no server-side migration trigger signal |
| Step 6 --> Step 7 | **CAUSAL CHAIN BREAK** | No migration trigger signal: Step 6 produces availability data, not adoption data. Step 7 has no way to know when it is safe to proceed. |
| Step 7 --> Goal | **FLAG** | 100% rollout does not equal 100% migration; no completeness verification |

### Critical Findings from Backcasting

1. **Causal chain break at Step 4 to Step 5 (and Step 6 to Step 7):** The plan has no mechanism for triggering actual client migration. Step 6 makes the JWT path available in phases, but no signal tells un-updated clients to update. Step 7 proceeds to disable session cookies without any way to verify that all users have actually migrated. The output of Step 6 (availability percentage) is not the input Step 7 needs (adoption percentage).

2. **Hidden precondition: clients cannot detect they need JWT.** The lazy migration in Step 5 requires clients to request JWT tokens, but old SDK versions do not know JWT exists. The plan assumes clients will update but provides no server-side mechanism to trigger or verify this update.

3. **Refresh token database never sized.** The database introduced in Step 2 has no capacity analysis against the 50,000 DAU target. Its performance characteristics at scale are entirely unknown.

---

## Convergent Evidence

The three techniques attack different aspects of the plan but converge on two critical issues and diverge on one unique finding.

### Convergence 1: Scaling Gap — Refresh Token Database (T1 + T5)

- **T1 (Pre-Mortem), Failure Scenario 6:** At 50,000 DAU, the refresh token database becomes a centralized stateful bottleneck, replacing the Redis bottleneck the migration was meant to eliminate. The plan has no capacity analysis, scaling strategy, or cleanup procedures.
- **T5 (Backcasting), Step 2 --> Step 3 Link:** The refresh token database is flagged as "never sized" — no capacity analysis, no scaling strategy, no cleanup job. Its behavior at the 6-month target is unpredictable.
- **Mutual reinforcement:** T1 arrives at this finding by projecting forward from the 6-month scaling target and imagining the operational failure (connection pool exhaustion, login storms). T5 arrives at it by tracing backward from the success criteria and finding that Step 2 never establishes the preconditions for reliable performance at scale. Both identify the same gap (unplanned refresh token database at scale) through different analytical paths — forward projection of failure versus backward tracing of missing preconditions. Together, they demonstrate that the gap exists both as a predictable future incident and as a traceable omission in the plan's causal chain.

### Convergence 2: Migration Trigger Gap (T1 + T5)

- **T1 (Pre-Mortem), Failure Scenario 3:** Mobile SDK adoption stalls, blocking the week-4 Redis decommission deadline. The plan has no forced-upgrade mechanism, no adoption rate analysis, and no contingency for the well-known mobile update lag.
- **T5 (Backcasting), Step 5 --> Step 6 and Step 6 --> Step 7 Links:** Causal chain break — no migration trigger signal exists. Step 6 produces availability data, not adoption data. Step 7 has no way to know when it is safe to proceed. Hidden precondition: clients cannot detect they need JWT; there is no server-side mechanism to trigger or verify client migration.
- **Mutual reinforcement:** T1 identifies the surface-level manifestation (mobile users do not update, deadline passes). T5 identifies the structural cause (no migration trigger mechanism, no adoption metric, causal chain break between rollout and deprecation). T1 tells you *what* goes wrong; T5 tells you *why* the plan cannot prevent it. Together, they show that the migration timeline failure is not a bad luck scenario but an inevitable consequence of a structural gap in the plan.

### Unique Finding: JWT Decision Logical Flaw (T2 Only)

- **T2 (Socratic Deconstruction), Decision 3:** The core thesis that JWT provides "stateless scaling" collapses under a 3-level why-chain because the plan's own design introduces a new stateful component (refresh token database) that contradicts the "stateless" premise. The fallacy is begging the question — the plan assumes JWT = stateless, then builds a stateful system, but continues to claim the benefits of statelessness.
- **Why unique to T2:** T1 and T5 both identify the *practical consequence* of the refresh token database (it becomes a bottleneck at scale, it was never sized). But T2 identifies something fundamentally different: the *logical flaw* in the core thesis itself. The plan's argument for JWT rests on the claim that JWT is stateless, but the plan's own design in Step 2 makes this claim false. This is a reasoning error in the plan's foundational argument, not just a scaling risk. T2 is the only technique that attacks the logical structure of the thesis rather than its practical outcomes. Neither T1 nor T5 surfaces this logical contradiction because they operate on failure scenarios and dependency chains, not on the validity of the plan's reasoning.

---

## Evaluation Checklist

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | All three techniques produce DISTINCT output sections (not merged into one) | **PASS** | T1 (Pre-Mortem) produces failure scenarios organized by time horizon with black swans. T2 (Socratic) produces 3-level why-chains with fallacy scans for 3 decisions. T5 (Backcasting) produces backward chain analysis with 7 link assessments. Each has its own major section with distinct structure and analytical method. |
| 2 | Pre-mortem findings and backcasting findings do not simply duplicate each other | **PASS** | T1 generates forward-looking failure narratives (what goes wrong at each horizon). T5 traces backward requirements and finds causal chain breaks and missing preconditions. Where they find the same underlying issue (scaling gap, migration trigger), the Convergent Evidence section explicitly notes the different analytical paths: T1 imagines the failure, T5 finds the missing precondition. Each section also contains findings unique to its technique. |
| 3 | Socratic why-chains reference plan decisions, not pre-mortem failure scenarios | **PASS** | T2's three why-chains analyze specific plan decisions: (1) RS256 vs HS256, referencing Step 1's security team recommendation; (2) lazy vs forced migration, referencing Step 5's stated rationale; (3) JWT for stateless scaling, referencing the Core Thesis. None of the why-chains reference T1's failure scenarios. |
| 4 | Where techniques find the same underlying issue from different angles, this is noted as convergent evidence (strengthens finding, does not create duplicates) | **PASS** | Two convergence points explicitly documented with explanation of different analytical paths: (1) scaling gap found by T1 (forward projection of failure) and T5 (backward tracing of missing capacity analysis); (2) migration trigger gap found by T1 (mobile adoption stall symptom) and T5 (structural causal chain break). T2's unique logical finding is noted separately as non-duplicative. |
| 5 | Combined output covers more ground than any single technique alone | **PASS** | T1 uniquely contributes: black swan scenarios (KMS outage, JWT CVE), UX degradation from token lifetime, dual-mode gateway ambiguity, payload drift. T2 uniquely contributes: logical validation that RS256 and lazy migration decisions are sound, identification of begging-the-question fallacy in core thesis. T5 uniquely contributes: causal chain break at Step 6 to Step 7, hidden precondition that clients cannot detect JWT availability, refresh DB never sized. No single technique covers all these findings. |
| 6 | No technique's output is truncated or abbreviated due to the others consuming token budget | **PASS** | T1 contains 7 failure scenarios across 3 horizons (2 day-1, 3 one-month, 2 six-month) plus 2 black swans with full narrative detail. T2 contains 3 complete why-chains with 3 levels each plus fallacy scans. T5 contains 7 backward chain link assessments with explicit required/produced analysis. All sections are substantive and complete. |

**Overall: 6/6 PASS**
