**VERDICT: REJECT**

**Note on verification scope:** This environment is an empty/greenfield directory (confirmed by the session hooks). There is no codebase, no `sessions.ts`, no gateway config, no auth service to inspect. So I cannot verify any of the plan's claims about the current system (Redis session store, API gateway behavior, existing SDKs). This review is therefore the plan on its own logic + domain knowledge of JWT migrations, and every "verify against source" step in my protocol is inapplicable by force of the environment — not skipped by choice. I did **not** fabricate `file:line` evidence. All evidence below is backtick-quoted from the plan itself. If a real codebase exists elsewhere, several MAJOR findings below (token storage, Redis cost model, gateway auth-context) must be re-checked against it before this plan can be trusted.

**Overall Assessment:** The migration *pattern* is sound — dual-mode gateway, phased canary, feature-flag rollback, monitoring-before-rollout. But the plan is built on a thesis that its own steps contradict ("eliminate server-side session state entirely" while Step 2 stands up a stateful refresh-token database), and it contains at least three execution-blocking gaps: an undefined-and-security-regressing revocation model, a rollback path that strands already-migrated users, and a hard backward-compatibility cutoff that is physically impossible to hit for mobile clients. As written, executing this plan produces a user-facing outage.

**Pre-commitment Predictions** (made before deep read, from the shape "session→JWT migration plan"):
1. Revocation/logout will be impossible with stateless tokens, and statefulness will sneak back in → **CONFIRMED** (Finding C1, C3).
2. Rollback will be fragile once a session is exchanged for a JWT → **CONFIRMED** (Finding C2).
3. Mobile app-update adoption will break any hard cutover deadline → **CONFIRMED** (Finding C3... actually the strongest finding).
4. Client-side token storage / XSS will be unaddressed → **CONFIRMED** (Finding M1).
5. Key rotation (JWKS distribution) will be glossed over → **CONFIRMED** (Finding M2).

A 5/5 hit rate is itself a signal: this plan follows a familiar under-specified template rather than an interrogated design.

**Operating mode:** Escalated to **ADVERSARIAL** after Phase 2 (3 CRITICAL + 6 MAJOR findings; the revocation contradiction indicated a systemic "statelessness was asserted, not designed" problem, so I hunted the rest of the plan for the same pattern and found it in the cost model and load model).

---

### Critical Findings (block execution)

**C1 — The core thesis is self-contradicting; "stateless" server-side state is just relocated, not eliminated, and the cost justification is never quantified.**
- Evidence: Background claims `"JWT tokens eliminate server-side session state entirely"` and the Core Thesis rests on eliminating `"the Redis session bottleneck."` But Step 2 requires the auth service to run `"its own database for refresh token storage"` and exposes `/auth/refresh` and `/auth/revoke`.
- Confidence: HIGH.
- Why this matters: You have not eliminated server-side session state — you've moved it from Redis to a new database, and added KMS signing calls and a new microservice. The entire economic case ("eliminate the Redis bottleneck… without proportional infrastructure cost") is asserted with **zero numbers**: no current Redis cost, no projected refresh-DB + KMS + auth-service cost, no QPS comparison. This is the load-bearing justification for the whole project and it is unverified. Realist check does **not** downgrade this: the plan commits real engineering-months on an unquantified premise.
- Fix: Produce a side-by-side cost/latency model: (current) Redis session read QPS × cost vs. (proposed) refresh-token DB write/read QPS + KMS operations + auth-service compute, at both 12k and 50k DAU. State explicitly that refresh-token state remains server-side and quantify the delta. If the delta isn't materially favorable, the project premise fails.

**C2 — The rollback path strands every already-migrated user; Step 5's session-exchange semantics are undefined.**
- Evidence: Step 5: `"the client exchanges its existing session for a JWT token pair."` Step 6: `"Rollback at any phase: disable the JWT path in the gateway feature flag and users fall back to session cookies."`
- Confidence: HIGH (the ambiguity is the defect).
- Why this matters: "Exchange" is undefined. If the exchange **consumes/invalidates** the original session (the natural reading of "exchange"), then a user who has already migrated has no session cookie to fall back to. Rolling back the feature flag logs them out — the rollback mechanism actively breaks the users it's meant to protect, and the breakage grows with each rollout phase (worst at the 50%→100% boundary). Realist check: data loss? no. Security? no. But it defeats the plan's only stated safety mechanism, so severity stays CRITICAL.
- Fix: Specify that the session→JWT exchange is **non-destructive** — the original session remains valid in Redis until it naturally expires, so rollback restores it. Add an explicit acceptance test: "migrate a user, flip the flag off, confirm the same user is still authenticated via cookie." This also means Redis cannot be decommissioned (Step 7) until the *longest session TTL* has elapsed past the flag-off point, not just "1 week."

**C3 — `"Full backward compatibility removed by week 4"` is physically impossible for mobile clients and, combined with Step 7, converts a schedule miss into an unrecoverable outage.**
- Evidence: Goal: `"full backward compatibility removed by week 4"` and `"Redis cluster decommissioned by week 4."` Step 5: `"Update all client SDKs (web, iOS, Android)."` Step 7: `"disable session cookie acceptance in the gateway. Remove the Redis session cluster."`
- Confidence: HIGH.
- Why this matters: You do not control when users update native iOS/Android apps. App-update adoption is typically 70–90% at four weeks and **never** 100% — users on old OS versions, users who disabled auto-update, and abandoned-but-active installs persist for months. Web SDKs update on next load; native SDKs do not. When Step 7 disables session cookies at week 4, every un-updated mobile client — plausibly thousands of the 12,000 DAU — is hard-logged-out with no fallback. And because Step 7 *also* decommissions Redis, there is nothing to roll back to. This is the classic "burned the bridge" migration failure. Realist check: mass user lockout with no recovery path earns CRITICAL and cannot be downgraded.
- Fix: Decouple the mobile cutoff from a calendar date and gate it on telemetry: "disable session cookies only when session-cookie traffic falls below X% for Y consecutive days." Keep Redis running (read-only if needed) until session-cookie traffic is effectively zero. Add a forced-logout fallback for the residual tail (re-login prompt) *before* cutover, not a silent break. Recognize that "week 4" for native apps is fiction and set expectations with stakeholders accordingly.

**C4 — `/auth/revoke` is architecturally undefined, and the plan silently regresses instant logout and instant permission-revocation.**
- Evidence: Step 2 lists `/auth/revoke` (revoke). Step 1: 15-minute access tokens carrying `"roles, permissions"`, validated statelessly by the gateway (Step 4: `"unified internal auth context object"`).
- Confidence: HIGH.
- Why this matters: A stateless access token cannot be revoked before its 15-minute expiry unless the gateway checks a revocation blocklist **on every request** — which reintroduces exactly the per-request state lookup (Redis-like) the plan claims to eliminate (see C1). So the plan is in an unacknowledged fork: either (a) `/auth/revoke` only revokes *refresh* tokens and access tokens stay valid up to 15 min after logout/compromise/de-provisioning (a security regression vs. today's instantly-invalidatable sessions), or (b) the gateway consults a blocklist per request and the statelessness thesis collapses. The plan picks neither. Same problem for embedded `permissions`: a fired admin or downgraded user retains their privileges for up to 15 minutes. Today's session system can kill both instantly. Realist check: this is a security/authorization correctness regression → no downgrade.
- Fix: Explicitly choose and document the revocation model. Recommended: short-lived access tokens (accept the ≤15-min window as an explicit, signed-off tradeoff) + a small revocation blocklist checked only for high-sensitivity actions, + immediate refresh-token invalidation. Define exactly what `/auth/revoke` invalidates and the maximum residual-access window. Get the *actual* security team (they recommended RS256; ask them about the revocation window too) to sign off on the 15-minute exposure.

---

### Major Findings (cause significant rework)

**M1 — Client-side token storage — the single biggest JWT security decision — is entirely absent.**
- Evidence: Step 5 says clients `"request and use JWT tokens"` but never states *where* the token lives (localStorage / memory / httpOnly cookie).
- Confidence: HIGH (absence is verifiable in the text).
- Why this matters: Today's session cookies are (presumably) `httpOnly`, so XSS cannot read them. If JWTs land in `localStorage`, any XSS steals a bearer token valid for 15 min plus a 7-day refresh token — a strict security downgrade. This decision drives the entire client architecture and must be made *before* Step 2/5, not discovered during implementation.
- Fix: Specify storage per platform: web = access token in memory + refresh token in an `httpOnly`, `Secure`, `SameSite` cookie; mobile = secure keystore/keychain. Add XSS token-theft to the threat model.

**M2 — Key rotation is named but not designed; misconfiguration causes a fleet-wide auth outage.**
- Evidence: Step 1: `"RS256 signing with rotating key pairs stored in AWS KMS"` — no JWKS distribution, no key-overlap window, no verifier cache/invalidation strategy.
- Confidence: HIGH.
- Why this matters: Multiple services verify tokens (the stated reason for RS256). They need current public keys, and tokens signed with a *previous* key must keep validating until they expire. If a key rotates and verifiers cache stale JWKS — or the overlap window is shorter than the max token lifetime — valid tokens get rejected en masse. Rotation is the most common cause of RS256 outages and it's a one-line mention here.
- Fix: Add a JWKS endpoint with `kid`-based key selection, a key-overlap window ≥ max token lifetime (≥7 days to cover refresh), a defined verifier JWKS cache TTL, and a rotation runbook. Test rotation under load in a phase *before* 100%.

**M3 — Success metrics contradict each other and the alert thresholds don't match the SLO.**
- Evidence: Success Metrics list both `"Auth success rate ≥99.9%"` (permits 0.1% failures ≈ up to ~12 users/day) **and** `"Zero user-facing auth errors during migration"` (permits none). Latency: Goal says `"<50ms token validation latency"` and metrics say `"Token validation p99 <50ms"`, but Step 3 pages only at `"validation latency >100ms"` — 2× the SLO. Error alerting pages at `"auth error rate >0.5%"` while the SLO breaches at 0.1% — you'd blow the SLO 5× over before anyone is paged.
- Confidence: HIGH (direct quotes).
- Why this matters: These aren't cosmetic. "Zero errors" is a vanity/unmeasurable criterion that will either be gamed or used to declare a successful migration a failure. The alert/SLO mismatch means the monitoring (the plan's genuine strength) will not fire until you are already far out of compliance — defeating the point of Step 3.
- Fix: Drop "zero user-facing auth errors"; keep 99.9%. Align PagerDuty: warn at ~0.1–0.2% error and ~50–60ms p99, page at higher. Decide whether 50ms is a hard SLO or the alert threshold and make them consistent.

**M4 — No load/capacity model for the 15-minute refresh cycle; the new refresh-token DB may become the bottleneck you're fleeing.**
- Evidence: Step 1: `"15-minute access tokens, 7-day refresh tokens"` + Step 2: refresh tokens in a database. No capacity planning anywhere.
- Confidence: HIGH (absence).
- Why this matters: A 15-min access token means every active client hits `/auth/refresh` ~4×/hour, each a database round-trip (write if you rotate refresh tokens). At 50k DAU this is a sustained refresh QPS that must be sized. It's entirely possible the refresh-DB load at 50k DAU rivals the Redis session load you're eliminating — which would invalidate C1's premise outright.
- Fix: Model steady-state refresh QPS at 12k and 50k DAU, size the refresh-token store accordingly, and compare to current Redis load. Consider a longer access-token TTL if the refresh load is prohibitive (trading against the C4 revocation window).

**M5 — Refresh-token rotation and reuse-detection are unspecified; a stolen refresh token = 7-day account compromise.**
- Evidence: Step 2 stores 7-day refresh tokens; no mention of one-time-use rotation or reuse detection.
- Confidence: MEDIUM (could be an implicit intent, but for a security-critical system silence is a defect).
- Why this matters: Without rotation + reuse detection, a leaked refresh token grants 7 days of silent access with no way to notice theft. This is table-stakes for refresh-token security.
- Fix: Specify one-time-use refresh-token rotation with reuse detection (reuse of a rotated token → revoke the whole token family and force re-auth).

**M6 — The timeline has zero slack and cannot absorb a single rollback.**
- Evidence: Goal: `"2-week rollout window."` Step 6: `"4 phases… Each phase runs for 3 days"` = 12 days minimum, back-to-back, only if every phase passes first try. Step 7 then requires `"100% rollout stable for 1 week"` (day 12 → 19) before decommission.
- Confidence: HIGH (arithmetic).
- Why this matters: 12 days of rollout inside a 14-day window leaves 2 days of buffer; one rollback (re-run a phase = +3 days) blows the window immediately. And rollout (19 days to decommission) does not fit inside "2 weeks" as the Goal states — the Goal and Step 6/7 are internally inconsistent. Combined with C3, the week-4 decommission is not just tight, it's unreachable for mobile.
- Fix: Reconcile the Goal's "2-week rollout" with the 12-day phased plan + 7-day soak; add explicit buffer for at least one rollback per phase; make decommission telemetry-gated (per C3), not date-gated.

---

### Minor Findings (suboptimal but functional)

- No mention of clock-skew tolerance for `exp`/`nbf` validation across distributed verifiers — small `leeway` should be specified to avoid spurious rejections.
- Embedding full `permissions` in the token can bloat the `Authorization` header on every request; consider roles-only + service-side permission lookup for large permission sets.
- Step 4 says the gateway `"inspects the Authorization header first; if absent, falls back to the session cookie"` — undefined behavior if *both* are present, or if the JWT is present but expired/invalid (does it fall back to cookie, or hard-fail?). Specify the precedence and the invalid-token path.
- No `/auth/logout` endpoint is listed (only `/token`, `/refresh`, `/revoke`) — clarify how a normal user logout maps onto revoke + client-side token disposal.

### What's Missing (gaps / unstated assumptions)

- **No security threat model / review step**, despite this being a change to the authentication system. The plan invokes the security team's authority for RS256 but never routes the *design* (revocation window, token storage, refresh rotation) through security sign-off.
- **No data-migration/consistency plan** for in-flight sessions during rollback boundaries (ties to C2).
- **CORS / cross-subdomain implications** of moving from cookies to `Authorization` headers are unaddressed (cookies and bearer tokens have very different cross-origin behavior).
- **No CSRF re-evaluation.** Bearer tokens in headers are CSRF-immune; cookie sessions are not. During the dual-mode window you're running both models — the plan doesn't state whether existing CSRF protections stay correct for cookie traffic.
- **No handling of the residual mobile tail** (users who never update) — required by C3.
- **No defined owner/access.** Executor perspective: who has AWS KMS key-admin rights, who provisions the refresh-token DB, who owns the gateway feature flag? Unstated.
- **No test plan.** There is monitoring (Step 3) but no unit/integration/e2e test strategy for token issuance, validation, refresh rotation, revocation, key rotation, or the rollback path. For an auth migration this is a serious omission.

### Ambiguity Risks

- Step 5 `"exchanges its existing session for a JWT token pair"` → **A:** exchange is non-destructive, old session survives. **B:** exchange invalidates the old session. Risk if B is chosen: Step 6 rollback strands migrated users (C2). Must be resolved to A explicitly.
- Step 7 `"stable for 1 week"` → **A:** 1 week after 100% rollout. **B:** 1 week that overlaps the rollout window. Risk: under B the timeline is even tighter than M6 assumes; under A it exceeds the "2-week rollout" Goal.
- Goal `"2-week rollout window"` vs. `"backward compatibility removed by week 4"` → is week 4 measured from project start or from rollout start? Changes whether Step 7's timing is even arithmetically possible.

### Multi-Perspective Notes

- **Executor:** "I can't build Step 2 without knowing the revocation model (C4), the refresh-rotation scheme (M5), and where clients store tokens (M1). I will get stuck immediately and have to make architecture decisions the plan should have made." Also blocked by unassigned KMS/DB/flag ownership.
- **Stakeholder:** The stated business win — kill the Redis bottleneck to enable 10× growth "without proportional infrastructure cost increases" — is **unquantified and possibly false** (C1, M4). "Zero user-facing auth errors" is a vanity metric (M3). You are being asked to fund a migration whose ROI is asserted, not shown.
- **Skeptic:** The strongest argument against this whole plan: *the Redis bottleneck could likely be solved more cheaply than a full auth rewrite* (Redis sharding, session TTL tuning, right-sizing, read replicas, or a cheaper KV store). The plan never considers a non-migration alternative to the scaling problem — the Devil's-Advocate case against "rewrite auth" is never engaged. That's the biggest un-interrogated decision in the document.

### Verdict Justification

**REJECT.** Executed as written, this plan produces a user-facing outage (C3: mobile clients hard-broken at week 4 with Redis already decommissioned and no rollback), a broken safety net (C2: rollback strands migrated users), and a security regression (C4: undefined revocation + 15-min stale-permission window) — all resting on an economic premise the plan never quantifies and that its own architecture undercuts (C1, M4). These are design decisions that must be made *before* implementation, so this goes back to the **planner**, and the revocation-window/token-storage/refresh-rotation questions should additionally route through **security-reviewer** for sign-off.

The plan is not without merit — monitoring-before-rollout, phased canary with feature-flag rollback, dual-mode gateway, and the explicitly-justified RS256 choice are all correct and worth keeping. That is exactly why this earns REJECT rather than a rewrite-from-scratch: the skeleton is right; the load-bearing details are missing or contradictory.

**To upgrade to REVISE:** resolve C1–C4 (quantify the cost model and confirm net state reduction; make session exchange non-destructive; make decommission telemetry-gated with a mobile-tail fallback; define the revocation model with an explicit, security-approved exposure window). **To reach ACCEPT-WITH-RESERVATIONS:** additionally close M1, M2, M3, M5, add a test plan, and reconcile the timeline.

**Realist Check recalibrations:** No CRITICAL was downgraded — each survived all four pressure-test questions (C2 defeats the sole safety mechanism; C3 is a no-recovery mass lockout; C4 is an authz/security regression; C1 invalidates the project premise). M5 was held at MAJOR rather than escalated because it is standard-practice-absent rather than actively broken. Nothing was inflated by hunting-mode momentum: the good practices in Steps 3, 4, 6 are explicitly credited.

### Open Questions (unscored)

- Do the current session cookies rely on cross-subdomain sharing? If so, the header-based model changes SSO behavior across properties (couldn't verify — no codebase).
- Are iOS/Android clients *actually* using session cookies today, or a token already? If they already use tokens, C3's blast radius shrinks dramatically — this single fact materially changes the risk profile and must be confirmed.
- Is the "security team recommended RS256" claim documented anywhere, and did that same review cover the revocation window and client token storage, or only the signing algorithm?
- What is the current Redis session cost and QPS? Without it, C1/M4 cannot be closed either way.

*Ralplan summary row: not applicable — this is a free-form markdown plan, not a ralplan/deliberate-mode artifact, so the principle-option / alternatives-depth / pre-mortem gates are not being scored as pass/fail. (That said, the absence of any considered alternative to a full auth rewrite — see Skeptic note — is itself a MAJOR-adjacent gap.)*