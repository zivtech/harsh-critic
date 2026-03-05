# Test 3.1: Full Protocol — Auth Migration Plan

**Plan under review:** Migrate Authentication from Session Cookies to JWT Tokens (plan-auth-migration.md)
**Mode:** ADVERSARIAL (escalated -- 1 CRITICAL finding triggered escalation during Phase 2)

---

## PHASE 1 -- PRE-COMMITMENT PREDICTIONS

Before detailed investigation, based on the domain (auth system migration from sessions to JWT) and common failure modes in this class of work, I predict the following 5 problem areas:

1. **Session invalidation during migration** -- Auth migrations commonly fail to account for the intermediate state where users hold credentials from both systems. What happens to converted users if rollback is needed?
2. **Token refresh failure handling** -- Stateless JWT systems are brittle when the refresh path is unavailable. Plans rarely specify degraded-mode behavior for the auth critical path.
3. **Scaling analysis for new stateful components** -- Plans that claim to remove state often introduce replacement state without sizing it. The refresh token store is the obvious target.
4. **Mobile SDK adoption lag blocking deprecation timeline** -- Mobile update adoption rates are well-documented to be slow. Hard deadlines for removing backward compatibility are typically unrealistic.
5. **Key rotation operational gaps** -- Plans mentioning key rotation rarely specify the rotation procedure, overlap period, or key discovery mechanism.

I will investigate each of these specifically.

---

## PHASE 2 -- VERIFICATION AND PLAN-SPECIFIC INVESTIGATION

### Step 1 -- Key Assumptions Extraction

| # | Assumption | Explicit/Implicit | Rating | Notes |
|---|-----------|-------------------|--------|-------|
| A1 | JWT eliminates server-side session state entirely | Explicit (Core Thesis) | FRAGILE | Step 2 introduces a refresh token database -- server-side state by another name |
| A2 | Redis session bottleneck is the primary scaling constraint | Explicit (Background) | REASONABLE | Redis costs and latency at 50K DAU is plausible, but no benchmarks provided |
| A3 | RS256 signing is the correct choice for this architecture | Explicit (Step 1) | VERIFIED | Asymmetric signing for microservice token verification is well-established security practice |
| A4 | 15-minute access / 7-day refresh token lifetimes are appropriate | Explicit (Step 1) | REASONABLE | Industry defaults, but no platform-specific threat model or UX analysis justifies these numbers |
| A5 | Lazy migration avoids thundering herd | Explicit (Step 5) | REASONABLE | True for the thundering herd concern, but creates an indefinite migration tail |
| A6 | Rollback = disable JWT feature flag, users fall back to sessions | Explicit (Step 6) | FRAGILE | Does not account for users who already exchanged sessions for JWT tokens |
| A7 | All client SDKs will be updated within the rollout window | Implicit (Step 5) | FRAGILE | Mobile update adoption is typically 60-70% after 2 weeks |
| A8 | Week-4 Redis decommission is feasible | Explicit (Step 7) | FRAGILE | Depends on A7 (all clients migrated), which is fragile |
| A9 | The auth service's standalone database will scale to 50K DAU | Implicit (Step 2) | FRAGILE | No capacity analysis, sizing, or sharding strategy provided |
| A10 | Monitoring in Step 3 is sufficient for dual-mode operation | Explicit (Step 3) | REASONABLE | Monitoring covers JWT metrics well, but does not mention session-auth metrics during dual-mode |
| A11 | The gateway's dual-mode evaluation has clear failure semantics | Implicit (Step 4) | FRAGILE | Behavior for invalid-but-present JWT is unspecified |
| A12 | Clients know when and how to initiate the session-to-JWT exchange | Implicit (Step 5) | FRAGILE | No migration trigger mechanism is defined |

**FRAGILE assumptions (A1, A6, A7, A8, A9, A11, A12) are the primary investigation targets.**

---

### Step 2 -- Pre-Mortem (Strengthened)

**Certainty framing**: An infallible crystal ball shows this plan was executed exactly as written and was a complete fiasco. What happened?

**Failure scenarios:**

1. **(SF-1) Rollback leaves converted users stranded**: During the 50% rollout phase (Step 6), a critical bug is discovered in JWT token validation. The team follows the documented rollback: disable the JWT path via feature flag. But users who already exchanged their session cookies for JWT token pairs (Step 5) no longer have valid session cookies. The exchange was one-way -- the old session was consumed or expired. These users are locked out: the JWT path is disabled, but they have no session to fall back to. Thousands of users lose authentication with no automated recovery path. The "zero user-facing auth errors" success metric is shattered.

2. **(SF-2) Refresh endpoint goes down 2 hours after launch**: The auth service's database experiences connection pool exhaustion under production load. The `/auth/refresh` endpoint returns 500 errors. With 15-minute access tokens, every user whose token expires during the outage is immediately logged out. The plan specifies no retry logic, no grace period, no client-side fallback, and no circuit breaker for the refresh path. A brief database hiccup causes mass logout.

3. **(SF-3) Refresh token database becomes the new Redis**: At the projected 50,000 DAU (6 months out), the refresh token database holds hundreds of thousands of active tokens with 7-day lifetimes. Every 15-minute token refresh hits this database. Every revocation requires a lookup and write. Monday-morning login storms cause connection pool exhaustion. The team has replaced a Redis bottleneck with a relational database bottleneck that is harder to horizontally scale and has none of Redis's years of operational tuning.

4. **Mobile SDK adoption stalls**: One month in, web rollout is at 100% but only 65% of mobile users have updated. The dual-mode gateway must stay active. Redis cannot be decommissioned on the week-4 schedule. The cost savings that motivated the migration are delayed indefinitely.

5. **Key rotation causes cascading validation failures**: On the first key rotation, the auth service signs with a new key pair. Downstream services still cache the old public key. Newly-issued tokens fail validation across all services for minutes to hours depending on cache TTLs. No JWKS endpoint, no overlap period, no cache-warming procedure exists.

6. **15-minute token lifetime creates UX cliff**: Users on unreliable networks, mobile users who background the app for 16 minutes, and users who close laptops for a coffee break all experience unexpected logouts. Support tickets spike. No client-side refresh strategy, retry logic, or grace period is specified.

7. **Dual-mode gateway has ambiguous failure semantics**: A JWT is present but invalid (expired). Does the gateway reject immediately (401) or fall through to session cookie? If reject: legitimate dual-mode users with valid sessions but stale JWTs are locked out. If fall-through: attackers can attach crafted invalid JWTs to force session-cookie evaluation, bypassing JWT-specific security controls.

**Black swan scenarios:**

a) **AWS KMS regional outage during 50% rollout**: KMS goes down for hours. The auth service cannot sign new tokens or access key material. Every user's 15-minute access token expires with no replacement possible. By the 50% phase, half the user base is JWT-dependent. The platform is effectively offline. No KMS failover, no multi-region key replication, no local fallback exists.

b) **Critical JWT library CVE after Redis decommission**: Four weeks after Redis is decommissioned and session code is archived (Step 7), a critical CVE allows token forgery. The security team mandates emergency rollback to session auth. But there is nothing to roll back to: Redis is gone, session code is archived, the session-cookie code path is removed from the gateway. The team must choose between running a known-exploitable system or taking the platform offline while rebuilding session auth from scratch.

**Multi-horizon pre-mortem:**

- **Day 1 (immediate)**: SF-1 -- even at the 1% canary phase, ~120 users who convert have no rollback path. SF-2 -- refresh endpoint instability under first production load causes scattered logouts. Key distribution race condition: first tokens are unverifiable by services that haven't cached the initial public key.

- **Month 1 (medium-term)**: Mobile SDK adoption at ~65%, blocking Redis decommission. Refresh token database holds tens of thousands of tokens with no cleanup job. Users report frequent unexpected logouts compared to the session-cookie era. The 15-minute lifetime creates tension between security and UX.

- **Month 6 (long-term)**: SF-3 fully realized -- refresh token database is the new bottleneck at 50K DAU. JWT payload drift as different teams embed additional claims (feature flags, A/B groups, tenant context) without a governance model. The "stateless" architecture is stateless in name only.

**Does the plan address these?** Zero failure scenarios are fully addressed. SF-2 (key rotation) is partially mentioned but not operationalized. The two most critical unaddressed gaps are SF-1 (rollback) and SF-3 (scaling).

---

### Step 3 -- Dependency Audit

| Step | Inputs | Outputs | Blocking Dependencies | Issues |
|------|--------|---------|----------------------|--------|
| 1 (Token Schema) | Security requirements, user data model | JWT payload spec, KMS key config | None | Missing: source of truth for roles/permissions claim data |
| 2 (Auth Service) | Schema from Step 1 | Auth endpoints, refresh token DB | Step 1, KMS | No capacity analysis for refresh DB |
| 3 (Monitoring) | Auth service telemetry | Dashboards, alerts | Step 2 must emit metrics | Step 2 does not commit to an observability contract |
| 4 (Dual-Mode Gateway) | Auth service (Step 2) | Unified auth context | Steps 2, 3 | **No migration signal to clients** |
| 5 (Client SDK) | Gateway (Step 4), migration trigger | Updated SDKs with JWT support | Step 4 | **CAUSAL CHAIN BREAK: no trigger mechanism from Step 4** |
| 6 (Gradual Rollout) | Working SDKs (Step 5) | Phased JWT adoption | Step 5 | Rollback strategy broken for converted users |
| 7 (Deprecation) | 100% rollout stable | Redis decommissioned | Step 6, ALL users migrated | Week-4 deadline is calendar-driven, not condition-driven |

**Key dependency issues:**
- Step 4 does not produce the migration signal that Step 5 requires. This is a causal chain break.
- Step 6 rollback does not account for the state change caused by Step 5 (session consumed).
- Step 7 depends on 100% user migration but Step 6 only measures feature flag rollout percentage.

---

### Step 4 -- Ambiguity Scan

- **Step 5**: `"the client exchanges its existing session for a JWT token pair"` -- Interpretation A: session is invalidated upon exchange (one-way). Interpretation B: session remains valid alongside JWT (parallel). Risk: if Interpretation A, rollback is broken for converted users (SF-1). HIGH ambiguity.

- **Step 6**: `"1% (canary), 10%, 50%, 100%"` -- Interpretation A: percentage of users (sticky). Interpretation B: percentage of requests (random). Risk: Interpretation B means no user fully validates the JWT-only experience. MEDIUM ambiguity.

- **Step 7**: `"After 100% rollout is stable for 1 week"` -- Interpretation A: 100% feature flag (all new requests go JWT). Interpretation B: 100% of users migrated. Risk: Interpretation A leaves inactive users stranded. HIGH ambiguity.

- **Step 4**: `"unified internal auth context object"` -- No schema defined. If the context differs subtly between session-derived and JWT-derived, downstream services may behave inconsistently. LOW-MEDIUM ambiguity.

---

### Step 5 -- Feasibility Check

- **Step 1 (Token Schema)**: Feasible. RS256 with KMS is well-understood. Missing: source of roles/permissions data for claims.
- **Step 2 (Auth Service)**: Feasible to build, but no capacity analysis means the team is flying blind on scaling. The "standalone microservice with its own database" has no specified technology, sizing, or HA configuration.
- **Step 3 (Monitoring)**: Feasible and well-specified. Datadog dashboards, PagerDuty alerts with quantitative thresholds, structured logging with correlation IDs. This is a strong section.
- **Step 4 (Gateway)**: Feasible to implement, but failure semantics (invalid JWT behavior) must be specified first. Without that, two developers could build incompatible implementations.
- **Step 5 (Client SDKs)**: **NOT FEASIBLE as written.** The plan tells developers to "update all client SDKs" but does not specify: how the client knows when to exchange, what endpoint to call, how to handle a failed exchange, token storage location, refresh logic, or error handling. An SDK developer would need to ask multiple questions before writing any code.
- **Step 6 (Rollout)**: Feasible if rollback is fixed. Current rollback strategy is broken.
- **Step 7 (Deprecation)**: Feasible only if all users are migrated, which requires forced upgrade mechanisms not specified.

---

### Step 6 -- Rollback Analysis

- **Step 1-3**: No rollback needed -- these are infrastructure setup.
- **Step 4 (Gateway)**: Rollback = remove dual-mode, revert to session-only. Clean.
- **Step 5 (SDK)**: Cannot roll back a client-side SDK update that has already been deployed to app stores.
- **Step 6 (Gradual Rollout)**: Plan's documented rollback: `"disable the JWT path in the gateway feature flag and users fall back to session cookies."` **BROKEN** for converted users (SF-1). Users who exchanged sessions for tokens have no session to fall back to.
- **Step 7 (Deprecation)**: Irreversible. Redis decommissioned, session code archived. No recovery path.

**Rollback analysis summary**: The plan's primary safety mechanism (Step 6 rollback) has a critical gap. Step 7 is intentionally irreversible, which is acceptable only if Step 6's rollback actually works -- which it does not.

---

### Step 7 -- Devil's Advocate + Socratic Deconstruction

**7a -- Strongest argument AGAINST this approach:**

The plan claims to eliminate server-side state but introduces a refresh token database that is functionally a session store. The "stateless JWT" architecture is stateless only for access token validation -- every 15 minutes, users hit a stateful refresh endpoint backed by a database that the plan does not size, scale, or plan capacity for. At the 6-month target of 50K DAU, this database faces the same scaling pressures as the Redis cluster it replaced, but without Redis's optimized data structures for this exact workload. The plan's core thesis is internally contradicted by its own design.

**7b -- Socratic why-chains:**

**Decision: RS256 over HS256 (Step 1):**
- Q: Why RS256? A: Multiple services verify tokens without possessing the signing secret.
- Q: Why must services not possess the secret? A: In a microservice architecture, distributing a shared HMAC secret increases the attack surface -- any compromised service can forge tokens.
- Q: Is the current architecture one where many services verify independently? A: The plan describes a gateway (Step 4) that produces a "unified internal auth context" -- suggesting centralized verification. If the gateway is the sole verifier, RS256's advantage is moot. **However**, the gateway could be a single verification point today with services potentially verifying independently in the future. The security team's recommendation of RS256 is defensible as a forward-looking architectural choice.

**Assessment**: The chain terminates in a reasonable axiom (principle of least privilege for cryptographic material). The RS256 decision is sound. **No finding.**

**Decision: Lazy migration over forced migration (Step 5):**
- Q: Why lazy migration? A: To avoid a thundering herd of simultaneous token requests.
- Q: Why are these the only two options? A: They are not. Batched forced migration (invalidate in cohorts over hours/days) avoids both the thundering herd and the indefinite tail. Server-side session-to-token conversion (backend converts proactively) avoids client participation entirely.
- **Fallacy: False dichotomy.** The plan presents two options when at least four exist.

**Decision: Core Thesis (stateless JWT eliminates Redis bottleneck):**
- Q: Why JWT? A: To eliminate server-side session state.
- Q: Does the plan actually eliminate server-side state? A: No. Step 2 introduces a refresh token database. The `/auth/revoke` endpoint implies a revocation check. KMS key material is server-side state.
- **Fallacy: Begging the question.** The thesis assumes JWT = stateless, but the design is not stateless. The conclusion (stateless = scalable) is assumed rather than demonstrated.

**7c -- Logical fallacy scan:**
- False dichotomy: present in lazy vs. forced migration choice
- Appeal to authority: mild in RS256 decision ("security team recommended") but the recommendation is sound on its merits
- Begging the question: present in core thesis (assumes statelessness while designing a stateful system)

---

### Step 8 -- Murder Board

**Kill argument**: This plan should be rejected because its core thesis -- that JWT tokens eliminate server-side session state -- is factually contradicted by its own Step 2, which introduces a refresh token database that is functionally a session store. The plan does not analyze whether this new state has better scaling properties than the Redis it replaces, does not size it for the 50K DAU target, and provides no capacity plan. Meanwhile, the plan's rollback strategy is broken for any user who has already converted, and the migration trigger mechanism between the gateway and client SDKs is undefined. The plan is not a migration from stateful to stateless -- it is a migration from one stateful system to another, with worse operational maturity.

**Assessment**: This is a moderately compelling killing argument. The core thesis contradiction is real and structural. However, the JWT architecture does genuinely eliminate per-request session lookups for access token validation -- the refresh token database is hit every 15 minutes rather than every request. This is a meaningful improvement, even if the plan overstates it. The killing argument identifies a real problem (unacknowledged statefulness) but the plan is salvageable with revision, not fundamentally misdirected.

---

### Step 9 -- Competing Alternatives (ACH-lite)

**Alternative A: Optimize the existing Redis session store.**
- Pros: No migration risk. Redis Cluster with read replicas can scale horizontally. Session data is small (32-64 byte IDs). Redis is already battle-tested for this workload.
- Cons: Doesn't eliminate server-side state (but neither does the proposed plan). Costs continue to scale linearly with DAU.
- Plan's evidence against: The Background claims Redis is a "bottleneck" but provides no data: no latency measurements, no cost projections, no evidence that Redis cannot scale to 50K DAU. Redis has well-documented scaling strategies (sharding, read replicas, cluster mode) that are not discussed.

**Alternative B: JWT access tokens with Redis-backed refresh tokens.**
- Pros: Gets the stateless access token benefit (no per-request lookup) while leveraging existing Redis infrastructure for refresh tokens. No new database to operate. Redis is already tuned for this team's workload.
- Cons: Redis remains in the stack (though at lower load -- refresh operations are 1/900th the frequency of request-level session checks for 15-minute tokens).
- Plan's evidence against: The plan never considers this hybrid. It assumes JWT requires a brand-new database for refresh tokens, which is not architecturally necessary.

**Assessment**: The plan's evidence does not rule out either alternative. Alternative B is particularly compelling because it captures the JWT benefit (stateless access validation) while avoiding the plan's biggest risk (unproven new database at scale). The plan's approach selection is a finding because the evidence does not distinguish it from a cheaper, lower-risk alternative.

---

### Step 10 -- Backcasting

Working backward from the stated success criteria:

**Goal: "Redis cluster decommissioned by week 4"**
- Requires: 100% of users on JWT (no session-cookie dependencies)
- Requires: 100% rollout stable for 1 week (Step 6-7)
- Requires: All client SDKs updated (Step 5)
- **GAP**: Mobile SDK adoption is typically 60-70% after 2 weeks. 100% is unrealistic without forced upgrade. The plan has no forced-upgrade mechanism.

**Goal: "Zero user-facing auth errors during migration"**
- Requires: Rollback works without user impact (Step 6)
- **GAP**: Rollback strands converted users (SF-1). This goal is violated by design.

**Goal: "Token validation p99 < 50ms"**
- Requires: RS256 validation of JWT payload within budget
- Requires: Token payload size bounded
- **GAP**: No maximum token size defined. Users with large permission sets could produce 2-4KB tokens. RS256 verification on large payloads at high request volume may exceed 50ms.

**Backcasting chain from Step 5 backward:**
- For Step 5 to work (clients exchange sessions for tokens): clients must know WHEN and HOW to exchange.
- For clients to know: Step 4 must produce a migration signal OR the SDK update itself must proactively initiate exchange.
- Step 4 produces: a dual-mode gateway that silently handles both auth methods. No migration signal.
- **CAUSAL CHAIN BREAK**: Step 5 assumes a trigger that Step 4 does not produce.

---

## PHASE 3 -- MULTI-PERSPECTIVE REVIEW

**As the EXECUTOR**: "Step 5 tells me to update all client SDKs to request JWT tokens, but it doesn't tell me how the client knows when to initiate the exchange, what endpoint to call for the exchange, what to send as the exchange credential, how to store the resulting tokens securely, how to handle a failed exchange, or what refresh logic to implement. I would have to make multiple assumptions or ask clarifying questions before I could write a single line of SDK code. Step 2 tells me to build an auth service with 'its own database' but doesn't specify the database technology, schema, connection pool sizing, or HA configuration."

**As the STAKEHOLDER**: "The success metric 'Zero user-facing auth errors during migration' is aspirational but the plan's rollback mechanism violates it by design. The week-4 Redis decommission deadline is a cost-savings milestone, not a user-facing metric, yet it drives the deprecation timeline. If mobile adoption stalls at 65%, do we force users off (violating zero-error metric) or keep paying for Redis (negating cost savings)? This tradeoff is not discussed."

**As the SKEPTIC**: "The strongest argument against this plan is that it claims to eliminate server-side state while introducing a refresh token database that is functionally a session store. The 'stateless JWT' framing is misleading. The plan should be honest about what it actually achieves: replacing per-request Redis lookups with per-15-minute database lookups. That may still be a good trade, but the thesis should say that, not claim statelessness."

---

## PHASE 4 -- GAP ANALYSIS

Explicitly looking for what is NOT in the plan:

1. **Client-side token lifecycle management.** No specification of token storage (secure keychain on mobile, httpOnly equivalent on web), proactive refresh timing (refresh before expiry vs. after failure), retry logic, or offline-to-online re-authentication.

2. **Token size budget.** JWT payload includes user ID, roles, permissions, expiration. For users with complex permission sets, tokens could grow to 2-4KB. No maximum size, no strategy for large permission sets.

3. **AWS KMS failover strategy.** Entire signing infrastructure depends on single AWS KMS region. No multi-region key replication, no local HSM fallback, no pre-signed emergency tokens.

4. **Post-deprecation emergency rollback.** Step 7 decommissions Redis and archives session code. If a critical JWT library CVE is disclosed after week 4, there is nothing to roll back to.

5. **JWT payload governance and versioning.** Step 1 defines the initial token schema but provides no versioning strategy, governance model, or evolution rules for the token payload over time.

6. **Refresh token cleanup job.** No TTL-based expiration or cleanup for orphaned refresh tokens (abandoned devices, churned users).

7. **Capacity analysis for refresh token database.** No sizing, no connection pool configuration, no scaling strategy for 50K DAU target.

8. **Source of truth for JWT claims.** Step 1 specifies that the token includes roles and permissions but does not identify where the auth service reads this data from.

---

## PHASE 4.5 -- SELF-AUDIT

### Part A -- False Positive Check

| Finding | Confidence | Author Could Refute? | Flaw or Preference? | Action |
|---------|-----------|---------------------|---------------------|--------|
| SF-1: Rollback gap for converted users | HIGH | NO -- text explicitly says "fall back to session cookies" but exchange destroys sessions | FLAW | Keep as CRITICAL |
| SF-2: Refresh endpoint failure handling | HIGH | NO -- zero failure handling specified for the most critical endpoint | FLAW | Keep as MAJOR |
| SF-3: Refresh DB = new bottleneck | HIGH | PARTIALLY -- author could argue the DB is sized at implementation time | FLAW (plan-level gap, not implementation detail) | Keep as MAJOR |
| SF-4: Causal chain break Step 4-5 | HIGH | PARTIALLY -- author might say the SDK update IS the trigger | FLAW (ambiguous either way, plan should specify) | Keep as MAJOR |

### Part B -- Consider-the-Opposite (False Negative Check)

**Step 3 (Monitoring and Observability):** "What reasons exist to think this section has a hidden flaw?"
- Datadog dashboards tracking token issuance rate, validation latency (p50/p95/p99), refresh success rate, revocation events. PagerDuty alerts for validation latency >100ms or error rate >0.5%. Structured logging with correlation IDs.
- Could this be insufficient? The monitoring is JWT-focused and does not mention session-auth monitoring during dual-mode operation. However, session monitoring presumably already exists (the current system uses sessions). Adding it here would be nice but is not a gap -- the existing session monitoring infrastructure continues to function.
- Could the alert thresholds be wrong? 100ms latency alert with 50ms target gives a 2x buffer. 0.5% error rate alert is aggressive enough to catch problems early. These are reasonable thresholds.
- **Assessment: No credible hidden flaw. This section is genuinely solid. No finding generated.**

**RS256 decision (Step 1):** "What reasons exist to think this is a bad decision?"
- RS256 is 10-50x slower than HS256 for verification. At high request volume, this could matter. However, modern hardware handles RS256 verification in <1ms for typical JWT payloads. The performance concern is real only for very large payloads (addressed in gap analysis as token size budget).
- The gateway centralizes verification, so the multi-service argument for RS256 may not apply today. However, RS256 is the more secure default and choosing it avoids future lock-in if services begin verifying independently.
- **Assessment: The RS256 decision is sound. The Socratic why-chain terminates in a supported axiom (principle of least privilege). No finding generated.**

---

## PHASE 4.75 -- REALIST CHECK

### CF-1: Rollback gap (CRITICAL)
1. **Realistic worst case if shipped as-is?** User lockout during rollback. At 50% phase, ~6,000 users stranded with no credential accepted by either path. Manual recovery (forced password reset or session re-creation) required.
2. **Mitigating factors?** None. The rollback path IS the mitigation, and it's broken.
3. **Detection time?** Immediate -- the first rollback attempt reveals the problem.
4. **Proportional?** CRITICAL is correct. This involves user lockout (functional equivalent of data loss for an auth system). No downgrade.

### MF-1: Refresh endpoint failure (MAJOR)
1. **Realistic worst case?** Mass logout during auth service restart or database hiccup. Detectable within minutes via monitoring (Step 3 is solid).
2. **Mitigating factors?** 15-minute token lifetime limits blast radius -- only users whose tokens expire during the outage are affected. Step 3 monitoring would catch this quickly.
3. **Detection time?** Minutes via PagerDuty alert on error rate >0.5%.
4. **Proportional?** MAJOR is correct. Not CRITICAL because the blast radius is time-limited and detection is fast.

### MF-2: Refresh DB scaling (MAJOR)
1. **Realistic worst case?** Connection pool exhaustion during Monday-morning login storms at 50K DAU. Auth service degradation cascading to user-facing errors.
2. **Mitigating factors?** This is a 6-month problem, not a day-1 problem. The team has time to address it.
3. **Detection time?** Gradual -- connection pool metrics would show degradation before complete failure.
4. **Proportional?** MAJOR is correct. Not CRITICAL because the immediate deployment will work fine at current DAU (12K).

### MF-3: Causal chain break (MAJOR)
1. **Realistic worst case?** The implementation team resolves this during development by making an ad-hoc decision. The risk is inconsistency across web/iOS/Android SDKs if each team makes a different choice.
2. **Mitigating factors?** Competent implementation teams will recognize and resolve this gap.
3. **Detection time?** Immediately during implementation planning.
4. **Proportional?** MAJOR is correct. The plan must specify this -- the gap is too large for implementation-time decisions, especially with three client platforms.

**All findings survive realist check at their current severity.**

---

## ESCALATION CHECK

Escalation to ADVERSARIAL mode requires: any CRITICAL finding, 3+ MAJOR findings, or a pattern of systemic issues.

- CRITICAL findings: 1 (SF-1, rollback gap)
- MAJOR findings: 3 (SF-2, SF-3, SF-4)

**Decision: ESCALATE TO ADVERSARIAL MODE.** One CRITICAL finding is sufficient, and the combination with 3 MAJOR findings indicates systemic issues rather than isolated gaps.

**ADVERSARIAL mode activated.** Remaining unchecked areas investigated with heightened scrutiny.

**Additional ADVERSARIAL investigation:**
- Step 4-5 handoff examined more closely, revealing the causal chain break (SF-4) that might have been accepted as implicit in THOROUGH mode.
- Dual-mode gateway failure semantics examined: behavior for invalid JWT not specified. Added as Minor finding.
- Token payload size examined: no size budget. Added to gap analysis.
- KMS as single point of failure identified and added to gap analysis.

---

## PHASE 5 -- SYNTHESIS

### Pre-commitment Predictions vs Actual Findings

| Prediction | Result |
|-----------|--------|
| Session invalidation during migration | CONFIRMED at CRITICAL -- SF-1 rollback gap |
| Token refresh failure handling | CONFIRMED at MAJOR -- SF-2 refresh endpoint |
| Scaling analysis for new state | CONFIRMED at MAJOR -- SF-3 refresh DB bottleneck |
| Mobile SDK adoption lag | CONFIRMED as MINOR -- week-4 deadline unrealistic |
| Key rotation operational gaps | CONFIRMED as MINOR -- rotation procedure unspecified |

Predictions 1-3 confirmed at high severity. One unpredicted finding emerged: SF-4 (causal chain break Step 4 to 5), discovered via backcasting.

---

**VERDICT: REVISE**

**Overall Assessment**: The plan has a sound high-level structure and a genuinely solid monitoring setup (Step 3), but it contains a critical rollback safety gap that would strand converted users during any rollback event, and three major findings that undermine the core thesis, the migration trigger mechanism, and refresh endpoint resilience. The plan needs targeted revision to address these gaps before it is safe to execute.

**Pre-commitment Predictions**: Predicted 5 problem areas (session invalidation, refresh failure, scaling, mobile adoption, key rotation). Three confirmed at CRITICAL/MAJOR. One unpredicted finding (causal chain break) emerged via backcasting.

**Critical Findings** (blocks execution):

### CF-1: Rollback gap -- converted users have no session to fall back to (SF-1)
*Techniques: Pre-Mortem (Day-1 horizon) + Rollback Analysis*

Step 6 states: `"Rollback at any phase: disable the JWT path in the gateway feature flag and users fall back to session cookies."` But Step 5 describes a lazy migration where clients `"exchange [their] existing session for a JWT token pair"` on first request after SDK update. This exchange is one-way -- the old session is consumed to produce the JWT pair. Users who have already converted hold JWT tokens but no valid session cookie.

When the JWT path is disabled during rollback, these converted users have no credential accepted by either path. They are locked out with no automated recovery mechanism. At the 1% canary phase, this affects ~120 users. At the 50% phase, ~6,000 users are stranded.

The plan's own success metric -- `"Zero user-facing auth errors during migration"` -- is violated on the first rollback attempt.

- Confidence: HIGH
- Why this matters: Any rollback during gradual rollout causes immediate, widespread user lockout with no automated recovery. The rollback strategy -- the plan's primary safety mechanism -- is fundamentally broken for any user who has already converted.
- Fix: Preserve session cookies alongside JWT tokens during the entire migration window. Do not invalidate or expire sessions when issuing JWT pairs. Sessions should remain valid in Redis until Step 7 explicitly decommissions them. The rollback procedure must include: (1) disable JWT path, (2) verify session cookie validity for all users in the converted cohort, (3) force session re-creation for any user whose session expired during the dual-mode window.

---

**Major Findings** (causes significant rework):

### MF-1: No failure handling for refresh endpoint unavailability (SF-2)
*Techniques: Pre-Mortem (Day-1 horizon) + Feasibility Check*

Step 2 defines three endpoints: `/auth/token`, `/auth/refresh`, `/auth/revoke`. With 15-minute access tokens, the refresh endpoint is on the critical path -- every active user hits it at least 4 times per hour. The plan specifies no behavior for when `/auth/refresh` is unavailable: no retry logic, no grace period for expired access tokens, no client-side fallback, no circuit breaker.

If the auth service's database experiences connection pool exhaustion or the service itself restarts, every user whose access token expires during the outage is immediately logged out. The plan says `"The service will be deployed as a standalone microservice with its own database"` but specifies no redundancy, failover, or degraded-mode operation.

- Confidence: HIGH
- Why this matters: A standalone microservice with a single database and no specified redundancy is a single point of failure on the auth critical path. Any downtime longer than 15 minutes causes 100% user logout.
- Fix: (1) Specify retry logic in client SDKs (exponential backoff, 3 retries). (2) Add a grace period: gateway accepts access tokens up to 5 minutes past expiry during refresh degradation. (3) Specify database redundancy for the refresh token store. (4) Add health check and circuit breaker for the refresh endpoint.

### MF-2: Refresh token database becomes the new Redis bottleneck at scale (SF-3)
*Techniques: Pre-Mortem (6-month horizon) + Backcasting*

The plan's core thesis: `"JWT tokens eliminate server-side session state entirely."` Step 2 introduces `"its own database for refresh token storage."` With 7-day refresh tokens and projected 50,000 DAU, this database accumulates hundreds of thousands of active tokens. Every 15-minute refresh requires a database lookup. Every revocation requires a write and lookup.

No capacity analysis, no sizing, no connection pooling, no sharding strategy, no cleanup job. The core thesis is internally contradicted: the plan replaces one stateful bottleneck with another while claiming statelessness.

- Confidence: HIGH
- Why this matters: The plan's stated motivation -- scaling to 50K DAU without proportional cost -- is undermined. The refresh token database is functionally a session store with worse horizontal scaling characteristics.
- Fix: (1) Add capacity analysis for 50K DAU. (2) Specify database technology, sizing, and sharding. (3) Add TTL-based cleanup for expired tokens. (4) Consider Redis for refresh token storage. (5) Revise the core thesis to acknowledge server-side state.

### MF-3: Causal chain break -- Step 4 to Step 5 has no migration trigger (SF-4)
*Techniques: Backcasting + Dependency Audit*

Backcasting from Step 5: For clients to `"exchange [their] existing session for a JWT token pair"` on first request, the client must know it should exchange. Step 4's dual-mode gateway silently handles both auth methods and produces a `"unified internal auth context object regardless of auth method."` No signal to the client.

Step 5 assumes a trigger. Step 4 does not produce one. The handoff is unspecified.

- Confidence: HIGH
- Why this matters: Without a migration trigger, the lazy migration has no mechanism to initiate.
- Fix: Define the trigger explicitly: (1) SDK proactively calls `/auth/token` on first launch after update, (2) gateway adds `X-Migrate-Auth: jwt` response header, or (3) SDK checks for JWT on startup and initiates exchange if absent.

---

**Minor Findings** (suboptimal but functional):

1. **Key rotation procedure unspecified.** Step 1 mentions `"rotating key pairs stored in AWS KMS"` but provides no rotation frequency, overlap period, JWKS endpoint, or cache invalidation strategy.

2. **Token lifetime rationale missing.** 15-minute access / 7-day refresh lifetimes stated without justification. Critical security-UX tradeoffs treated as self-evident defaults.

3. **Mobile SDK adoption timeline unrealistic for week-4 deprecation.** Mobile update adoption typically reaches 60-70% after 2 weeks. Remaining users lose auth when sessions are disabled.

4. **Dual-mode gateway failure semantics ambiguous.** Behavior when JWT is present but invalid (expired, malformed) is unspecified. Both possible behaviors (reject or fall-through) have problems.

---

**What's Missing** (gaps, unhandled edge cases, unstated assumptions):

- Client-side token lifecycle management (storage, refresh timing, retry, offline handling)
- Token size budget and strategy for large permission sets
- AWS KMS failover strategy (multi-region, local fallback)
- Post-deprecation emergency rollback plan
- JWT payload governance and versioning strategy

---

**Ambiguity Risks**:

- `"the client exchanges its existing session for a JWT token pair"` -- Interpretation A: session invalidated (one-way). Interpretation B: session preserved (parallel). Risk: Interpretation A breaks rollback (CF-1).

- `"1% (canary), 10%, 50%, 100%"` -- Interpretation A: per-user (sticky). Interpretation B: per-request (random). Risk: Interpretation B prevents validating the JWT-only user experience.

- `"After 100% rollout is stable for 1 week"` -- Interpretation A: 100% feature flag. Interpretation B: 100% users migrated. Risk: Interpretation A leaves inactive users stranded at Step 7.

---

**Multi-Perspective Notes**:

- **Executor:** "Step 5 tells me to update all client SDKs but doesn't specify how the client knows when to exchange, what endpoint to call, how to store tokens, or what refresh logic to implement. I'd need multiple clarifications before writing any SDK code."

- **Stakeholder:** "The success metric 'Zero user-facing auth errors' is violated by the plan's own rollback mechanism. The week-4 Redis deadline drives deprecation but the mobile adoption gap is not discussed as a tradeoff."

- **Skeptic:** "The core thesis ('stateless JWT eliminates Redis bottleneck') is contradicted by Step 2's refresh token database. The plan should honestly state what it achieves: replacing per-request Redis lookups with per-15-minute database lookups."

---

**Verdict Justification**:

REVISE is warranted because the plan contains one CRITICAL finding (rollback safety gap for converted users) that makes the migration unsafe to execute as written, plus three MAJOR findings that collectively undermine the core thesis, the migration mechanism, and refresh path resilience.

**Escalation to ADVERSARIAL mode** occurred after discovering CF-1 (CRITICAL rollback gap) during Pre-Mortem. The combination of 1 CRITICAL and 3 MAJOR indicated systemic issues. In ADVERSARIAL mode, additional scrutiny of Steps 4-5 revealed the causal chain break (MF-3).

**Realist Check** applied to all CRITICAL/MAJOR findings. All survived at their current severity:
- CF-1: No mitigating factor. Rollback path is the mitigation and it's broken. CRITICAL justified.
- MF-1: Detection fast via monitoring, blast radius time-limited. MAJOR correct (not CRITICAL).
- MF-2: 6-month problem, not day-1. Team has time. MAJOR correct (not CRITICAL).
- MF-3: Implementation teams will likely resolve, but plan must specify. MAJOR correct.

**False positive traps avoided:**
- Step 3 (Monitoring) examined via Consider-the-Opposite: genuinely solid. Datadog dashboards, PagerDuty alerts with quantitative thresholds, structured logging with correlation IDs. No finding generated.
- RS256 decision subjected to Socratic analysis: why-chain terminates in a supported axiom (principle of least privilege for cryptographic material). No finding generated.

**Verdict challenge**: "What's the best case for REJECT?" The core thesis is internally contradicted, the rollback is broken, and the migration trigger is undefined -- these are structural problems, not surface gaps. Counter: the plan's individual steps are competent, the monitoring is excellent, and the issues are fixable with targeted revision. The plan is salvageable. REVISE is correct.

**To upgrade to ACCEPT-WITH-RESERVATIONS:** Fix CF-1 (preserve sessions during migration), address MF-1 (refresh endpoint resilience), add capacity analysis for MF-2, define migration trigger for MF-3.

---

**Open Questions (unscored)**:

1. Has the team benchmarked RS256 validation latency at expected payload sizes? The 50ms p99 target may be tight for large tokens with RS256.

2. What is the expected devices-per-user distribution? Multi-device users multiply refresh token storage. At 2-3 devices per user with 50K DAU, the DB holds 100K-150K active tokens.

3. Is there existing JWKS infrastructure, or would key discovery be built from scratch?

4. Does the platform have forced-upgrade mechanisms for mobile apps (minimum version enforcement)?

5. The plan does not mention CORS changes required for JWT auth on web clients. Authorization headers change CORS preflight behavior.

---

## Evaluation Checklist

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Verdict is within expected range (REVISE or REJECT) | **PASS** | Verdict is REVISE. |
| 2 | SF-1 (rollback gap) detected at CRITICAL severity | **PASS** | CF-1 directly addresses the rollback gap for converted users, rated CRITICAL, with Pre-Mortem and Rollback Analysis cited as detection techniques. |
| 3 | SF-2 (refresh endpoint failure) detected at MAJOR severity | **PASS** | MF-1 covers refresh endpoint unavailability at MAJOR severity, detected via Pre-Mortem + Feasibility Check. |
| 4 | SF-3 (refresh DB = new Redis bottleneck) detected at MAJOR severity | **PASS** | MF-2 covers the refresh token database scaling gap at MAJOR severity, detected via Pre-Mortem + Backcasting. |
| 5 | SF-4 (causal chain break Step 4->5) detected at MAJOR severity | **PASS** | MF-3 covers the missing migration trigger between Steps 4 and 5 at MAJOR severity, detected via Backcasting + Dependency Audit. |

**Overall: 5/5 PASS**
