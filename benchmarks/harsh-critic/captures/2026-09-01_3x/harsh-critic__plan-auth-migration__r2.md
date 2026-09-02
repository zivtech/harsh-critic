I'll review this authentication migration plan as the Harsh Critic. First, a critical scoping note about what I can and cannot verify here.

**Environment check:** The session context indicates this is an empty/greenfield working directory. The plan, however, describes migrating an *existing production system* — a Redis session cluster, an API gateway, web/iOS/Android SDKs, 12,000 DAU. **None of that code is present in this workspace.** I therefore cannot verify a single codebase-dependent claim (that Redis serves only sessions, that the gateway can do header inspection, that the DAU figure is real, that any referenced service exists). That is not a reason to soften the review — it means every codebase assumption is FRAGILE-by-default from where I sit, and my evidence is necessarily backtick-quoted plan excerpts plus domain analysis of JWT/session auth. I will not fabricate file:line citations that don't exist.

This is a plan review. I'm applying the full plan protocol.

---

**VERDICT: REJECT**

**Overall Assessment**: The plan's core thesis — that stateless JWT eliminates the Redis bottleneck — is unsubstantiated and, on its own text, self-defeating: it reintroduces server-side state (a refresh-token database plus an implied revocation mechanism) that recreates the exact per-request/periodic datastore load it claims to remove, with zero cost modeling to prove a net win. On top of that foundational problem sit three execution-blocking flaws: mobile SDK migration cannot complete on the stated timeline, the rollback path is unspecified-to-impossible, and the `/auth/revoke` deliverable cannot function as implied by a stateless design. This is not a "add more detail" situation; the project's justification and several of its load-bearing mechanics need to be reconsidered before anyone writes code.

**Review mode**: Escalated to **ADVERSARIAL** during Phase 2. Trigger: multiple CRITICAL findings plus a systemic pattern — the plan repeatedly asserts benefits ("stateless," "eliminate the bottleneck," "transparently moved," "zero user-facing errors") that its own mechanics contradict. When the marketing and the mechanics disagree throughout, I stop giving the benefit of the doubt.

**Pre-commitment Predictions** (written before detailed analysis): For session→JWT migrations I expected to find (1) revocation treated as solved when stateless JWT makes it hard; (2) "stateless" undermined by a refresh-token store; (3) key-rotation/JWKS distribution underspecified; (4) client token storage / XSS surface ignored; (5) permission staleness unaddressed. **Result: all five predicted problems are present.** I did *not* predict the mobile-app-update-lag timeline break or the rollback-irreversibility problem before reading — those emerged in investigation and are among the most serious.

---

## Key Assumptions Extraction

| # | Assumption | Rating | Note |
|---|-----------|--------|------|
| A1 | Redis cost/latency is *the* bottleneck and JWT removes it | FRAGILE | No cost model; refresh DB + revocation reintroduce state (see C1) |
| A2 | Redis cluster serves only sessions, so it can be decommissioned | FRAGILE | Unverifiable here; if shared with cache/rate-limit/queues, Step 7 breaks other systems |
| A3 | Clients (incl. mobile) can be migrated within the window | FRAGILE | App-store review + user update lag makes this false for mobile (see C2) |
| A4 | Migrated users can fall back to session cookies on rollback | FRAGILE | Only if the session is preserved after exchange — unspecified (see C3) |
| A5 | Local RS256 validation needs a `<50ms p99` target | FRAGILE | Local verify is sub-ms; 50ms implies network I/O, contradicting "stateless" (see M2) |
| A6 | 12,000 DAU is the population to migrate | REASONABLE-but-incomplete | Ignores weekly/monthly-active users entirely |
| A7 | Security team's RS256 recommendation is documented/sound | REASONABLE | Appeal to authority; rationale is plausible but not evidenced |

Fragile assumptions dominate the load-bearing decisions. That alone is a red flag.

---

## Critical Findings (block execution)

**C1 — The core thesis is unsubstantiated and self-contradicting: "stateless" JWT does not eliminate server-side state, and no cost model proves a net win.**
- Confidence: HIGH
- Evidence: Core Thesis claims JWT will `"eliminate the Redis session bottleneck"` and enable `"10x user growth without proportional infrastructure cost increases."` But Step 2 says the auth service has `"its own database for refresh token storage,"` and Step 2 lists an `/auth/revoke` endpoint. With 15-minute access tokens, every active user hits `/auth/refresh` (a DB read/write) roughly every 15 minutes — and *any* honest revocation requires checking state per request. State is not eliminated; it is relocated from Redis (fast, in-memory) to a database (typically slower) and split across a refresh store + revocation list.
- Socratic why-chain: Why JWT? → remove Redis lookups. Why does that need *stateless* tokens? → to avoid the per-request store hit. But the plan reintroduces a store (refresh DB) and needs another (revocation) → **the premise collapses within three levels.** The genuine win (local signature verification on the read path) is never isolated or quantified.
- Why this matters: The entire project justification is cost/scale, yet the plan introduces a new database, AWS KMS signing costs, a new standalone microservice (compute), and Datadog spend — with **zero before/after cost comparison.** You could spend a quarter of engineering time and end up with equal-or-worse infra cost and a new bottleneck at `/auth/refresh`.
- Realist check: Holds at CRITICAL. Strategic/financial impact; this is the foundation the other six steps rest on.
- Fix: Before proceeding, produce a quantified cost/latency model: current Redis cost & p99 vs. projected (refresh-DB QPS at 12k and 50k DAU × 15-min refresh cadence, KMS sign call volume/cost, new service compute, revocation-check strategy). Explicitly state which read paths become stateless and which do not. If revocation must be checked per request, prove the net win survives that. Also evaluate the cheaper alternative of optimizing Redis (see M5).

**C2 — Mobile SDK migration cannot complete on this timeline; disabling session cookies at week 4 (Step 7) will hard-break every unupdated mobile client.**
- Confidence: HIGH
- Evidence: Step 5 says `"Update all client SDKs (web, iOS, Android)"` and treats migration as completing within the rollout window. Step 7: `"After 100% rollout is stable for 1 week, disable session cookie acceptance in the gateway."` Success criteria: `"full backward compatibility removed by week 4."` Mobile app updates require App Store / Play Store review (days) **and voluntary user adoption (weeks to months, never 100%).** The server team cannot force users to update their app.
- Why this matters: When session-cookie acceptance is disabled, every user still running an older app build (which only knows session cookies) is instantly and permanently locked out until they update. At 12k DAU with a meaningful mobile share, that is a mass forced-logout event and a support crisis — the direct opposite of `"zero user-facing auth errors"` and `"transparently moved."`
- Realist check: Holds at CRITICAL. User-facing breakage at scale with no in-plan mitigation.
- Fix: Decouple mobile from the server timeline. Options: (a) minimum-supported-app-version gating with a forced-update prompt shipped *well before* cutover; (b) a much longer mobile backward-compat window driven by measured adoption of the JWT-capable app version (not a calendar date); (c) server-side session-to-JWT bridging so old apps keep working via cookies indefinitely until adoption crosses a threshold. Whatever the choice, cutover must be gated on *measured client adoption*, not week 4.

**C3 — Rollback is unspecified-to-impossible for already-migrated users, and Step 7 is an unacknowledged point of no return.**
- Confidence: HIGH (irreversibility) / MEDIUM (session-consumption sub-point — refutable)
- Evidence: Step 6 rollback plan: `"disable the JWT path in the gateway feature flag and users fall back to session cookies."` Step 5: `"the client exchanges its existing session for a JWT token pair."` The plan never states whether the original session is preserved or invalidated on exchange. If it is invalidated/consumed, migrated users have **no session cookie to fall back to** and rollback strands them. Separately, Step 7 removes the Redis session cluster — after that, there is categorically no session store to fall back to, yet no step flags this as irreversible.
- Why this matters: A failed canary (Step 6, 1%) is the whole point of canarying — but if those users can't fall back, "rollback" is an outage. And once Redis is gone, the plan has no reverse gear at all.
- Realist check: Holds at CRITICAL. Rollback that doesn't work converts a routine phase failure into an incident.
- Fix: Explicitly specify that sessions are preserved (not consumed) for the full dual-mode window so rollback is always possible; define session TTL relative to the rollout schedule. Mark Step 7 (Redis decommission) as an explicit point-of-no-return with its own go/no-go gate and a defined bake period after 100% before any deletion. Keep a Redis snapshot/backup even after decommission.

**C4 — The `/auth/revoke` deliverable cannot function as implied by a stateless design; the security semantics of logout/ban/compromise-response silently regress, and the acceptable revocation latency is never stated.**
- Confidence: HIGH
- Evidence: Step 2 lists `/auth/revoke` as an endpoint. A signed 15-minute access token remains valid until natural expiry regardless of any revoke call — *unless every verifying microservice checks a revocation list on every request*, which contradicts the "stateless / no per-request store" premise (C1). The plan never states the maximum acceptable time between "revoke" and "access actually denied."
- Security exploitability gate: Who is affected? Everyone. During an account-compromise or malicious-insider event, no one — not even an admin — can terminate an active access token for up to 15 minutes. This is not an admin-already-has-the-power case; it is a *loss* of a capability that session auth provides today (immediate server-side invalidation). Reachable in the ordinary incident-response scenario. Confirmed real.
- Why this matters: With sessions, `logout` and `force-terminate` are immediate. This plan makes them eventually-consistent (≤15 min) while advertising a `/revoke` endpoint that implies immediacy. That gap will not be discovered until a real incident, when it matters most.
- Realist check: Holds at CRITICAL — security-capability regression with no compensating control and an internal contradiction between the stated deliverable and the architecture. (If, after analysis, a 15-minute revocation SLA is formally accepted by security, this becomes a MAJOR documentation/scoping fix rather than a redesign — but that decision must be made explicitly, not defaulted into.)
- Fix: Decide and document the revocation SLA. If near-immediate revocation is required, you need a per-request revocation check (a bloom-filter / short-TTL blacklist in a fast store — reintroducing exactly the state C1 flags, which must then feed the cost model) or you must shorten access-token lifetime dramatically. If a 15-min window is acceptable, state it, get security sign-off, and stop implying `/revoke` is instantaneous.

---

## Major Findings (cause significant rework)

**M1 — Success criteria are mutually contradictory: `99.9% auth success rate` vs `Zero user-facing auth errors`.**
- Confidence: HIGH. Evidence: Goal states `"99.9% auth success rate"` and Success Metrics states `"Zero user-facing auth errors during migration."` 99.9% success = 0.1% failure; across 12k DAU making many requests each, that is thousands of failed auth attempts — not "zero." You cannot simultaneously pass both, so you can't define "done."
- Fix: Pick one and make it measurable. E.g., "≥99.9% success rate measured per-request" AND "zero *net-new* auth error classes attributable to the migration, measured against the pre-migration baseline." Vanity "zero errors" is not achievable and should be dropped.

**M2 — Latency target is incoherent with a stateless design and the alert threshold contradicts it.**
- Confidence: HIGH. Evidence: Success Metric `"Token validation p99 <50ms"`; Step 3 alerts on `"validation latency >100ms."` Local RS256 signature verification is CPU-bound and typically sub-millisecond to low-single-digit ms. A 50ms p99 target for *local* validation is either meaninglessly loose (trivially met) or an admission that "validation" includes network I/O (JWKS fetch, revocation check) — which contradicts "stateless." The alert at 100ms is 2× the stated target with no explanation of the headroom.
- Fix: Define precisely what "validation" measures (signature only vs. signature + revocation + JWKS). If it's local-only, set a target that reflects reality (e.g., p99 < 5ms) and justify the 50ms number or delete it. Reconcile the alert threshold with the target.

**M3 — Permission/role staleness (up to 15 min) is unaddressed, and the dual-mode gateway will produce inconsistent authorization decisions.**
- Confidence: HIGH. Evidence: Step 1 bakes `"roles, permissions"` into the token at issuance; Step 4 claims the gateway produces `"a unified internal auth context object regardless of auth method."` But the session path reads *current* roles from the store (fresh) while the JWT path uses *baked-in* claims (stale up to 15 min). During dual-mode the same user can get different authz outcomes depending on path. A deprovisioned employee or downgraded user retains elevated access for up to 15 min.
- Security note: Non-privileged-reachable authz lag; confirmed real regression vs. sessions.
- Fix: Define and document the authz-staleness SLA; for high-sensitivity permission changes, provide an out-of-band invalidation path (ties into C4's revocation mechanism). Clarify how the "unified context" reconciles fresh vs. stale claims during dual-mode.

**M4 — No refresh-token rotation or theft/reuse detection.**
- Confidence: HIGH. Evidence: Step 1 specifies `"7-day refresh tokens"` stored in a DB (Step 2), but the plan never mentions rotation-on-use or reuse detection. A stolen 7-day refresh token is usable for a week, undetected.
- Security note: Standard, well-known JWT hardening; its absence is a real, non-privileged-exploitable gap.
- Fix: Specify refresh-token rotation (new refresh token issued on every refresh, old one invalidated) with reuse detection that revokes the token family on replay. This is table stakes for refresh-token security.

**M5 — Competing alternatives were never evaluated; approach selection is a false dichotomy.**
- Confidence: HIGH. Evidence: The plan presents JWT as the only path. It never considers (a) optimizing/right-sizing the existing Redis (TTL tuning, eviction policy, cheaper tier, sharding) to fix the cost bottleneck directly; (b) opaque/reference tokens with a token-introspection cache (keeps easy revocation, drops most store hits); (c) a hybrid where read-heavy services verify JWTs locally but revocation-sensitive operations consult session state. Evidence consistent with "JWT works" is non-diagnostic — those alternatives would also work, several with fewer of the problems above.
- Fix: Add an explicit alternatives-considered section that shows JWT beats at least the "optimize Redis" and "opaque token + cache" options *on the quantified cost model from C1*, or adopt the cheaper option.

**M6 — Client token storage strategy is unspecified, risking an XSS regression vs. httpOnly session cookies.**
- Confidence: MEDIUM (conditional on storage choice, which is the gap). Evidence: Step 5 says clients `"request and use JWT tokens"` via the `Authorization` header but never says where tokens are stored. Session cookies can be `httpOnly + Secure + SameSite` (not readable by JS, so XSS can't exfiltrate them). If JWTs land in `localStorage` or JS-accessible memory, an XSS bug now yields a stealable bearer token — a security regression introduced by the migration itself.
- Fix: Specify storage explicitly (e.g., refresh token in httpOnly cookie, access token in memory only) and document the XSS threat model. Don't leave this to executor discretion.

**M7 — 15-minute access tokens create a recurring, synchronized "thundering herd" on `/auth/refresh` — the exact failure lazy migration was chosen to avoid.**
- Confidence: HIGH. Evidence: Step 5 justifies lazy migration to `"avoid a thundering herd at the auth service."` But 15-min access tokens (Step 1) mean every active user refreshes ~every 15 min *forever*, and users who log in around the same time (start of workday) will refresh in synchronized waves — each wave hitting the refresh DB. The plan solved a one-time herd while designing in a permanent, recurring one.
- Fix: Add refresh-token jitter/staggering, model peak refresh QPS at 12k and 50k DAU against the refresh DB's capacity, and load-test it. Reconsider the 15-min access-token lifetime against the refresh-load cost.

**M8 — Timeline is internally inconsistent, and lazy migration cannot guarantee "all DAU moved within 2 weeks."**
- Confidence: HIGH. Evidence: Goal: `"all 12,000 daily active users transparently moved to JWT auth within a 2-week rollout window."` Step 6: 4 phases × 3 days = 12 days, and 100% cohort is only reached on day ~12. Step 7 then requires 100% `"stable for 1 week"` before cookie removal (~day 19). With lazy migration (Step 5), a user only converts when they make a request *and* are in the active cohort — so users active only during the 1%/10%/50% phases aren't moved. "All DAU moved within 2 weeks" is not achievable by this design, and the "2-week window" collides with the ~3-week rollout+deprecation reality.
- Fix: Reconcile the numbers. Either extend the stated window, or change "all DAU" to a measured coverage target (e.g., "≥99% of DAU on JWT before cutover, measured, not assumed"), and gate Step 7 on measured coverage rather than a calendar week.

**M9 — Key rotation, JWKS distribution, and the KMS signing model are underspecified.**
- Confidence: HIGH. Evidence: Step 1 says `"RS256 signing with rotating key pairs stored in AWS KMS"` but never specifies: how verifying microservices obtain public keys (JWKS endpoint? cache TTL?), how `kid` selects keys, or how old-key tokens stay valid during the rotation overlap (verifiers must hold old+new public keys for ≥15 min). Nor whether signing happens *in* KMS (per-issuance API call → latency, cost, and request-rate limits at 50k DAU × 15-min refresh) or via exported keys (KMS asymmetric private keys can't be exported the usual way).
- Fix: Specify the JWKS distribution mechanism and cache/overlap strategy, define `kid`-based key selection, and decide the KMS signing model with its rate-limit/cost/latency implications folded into the C1 cost model.

---

## Minor Findings (suboptimal but functional)

- **Alert vs. target mismatch**: Step 3 alerts at `>100ms` while the target is `<50ms` p99 — clarify the intended headroom (see M2).
- **Token bloat**: Embedding `roles, permissions` (Step 1) can push tokens past common 8KB header limits for permission-heavy users; sent on every request → bandwidth. Consider role IDs + server-side resolution or scoped claims.
- **JWT hardening not mentioned**: No statement that verifiers reject `alg: none` and the RS256→HS256 key-confusion attack. Standard, but should be an explicit acceptance criterion for a security-critical service.
- **Claims are readable, not encrypted**: JWT payloads are base64url-encoded (signed, not encrypted). Anything in the token (roles/permissions structure) is readable by anyone holding it, including via M6's XSS path. Avoid sensitive claims; note this explicitly.
- **Clock skew**: `exp`/`nbf` validation across microservices needs an agreed skew tolerance; unmentioned.
- **CSRF during dual-mode**: The cookie path (Step 4) still needs CSRF protection throughout the migration window; not addressed.
- **Appeal to authority**: Step 1's `"our security team recommended"` states a conclusion, not the rationale. RS256 for multi-verifier microservices is defensible, but record *why* so the decision survives the team changing.

---

## What's Missing (gaps / unstated assumptions)

- **A cost model** — the entire justification, with no numbers (C1).
- **Revocation SLA and mechanism** (C4).
- **Refresh-token rotation & theft detection** (M4).
- **Client token storage strategy** (M6).
- **Mobile app-store update-lag / minimum-supported-version plan** (C2).
- **Handling of non-DAU users** — weekly/monthly-active users who return after cookie removal and after their 7-day refresh token has expired are silently forced to re-login; never mentioned.
- **Shared-Redis dependency check** before Step 7 decommission — is the cluster used for cache, rate-limiting, queues? If so, removal breaks unrelated systems (A2).
- **Load-testing plan** for the auth service and refresh DB at 12k *and* 50k DAU (the growth target that motivates the whole plan).
- **In-flight operation handling** — what happens when an access token expires mid-long-operation (upload, checkout)? Retry/refresh-and-replay semantics undefined.
- **Multi-device / concurrent-session semantics** — one refresh-token family per device? Global logout across devices?
- **Logout UX change communicated to product** — users/product need to know logout is now eventually-consistent (ties to C4).
- **Audit/compliance** — where auth events are logged for retention/compliance beyond Datadog operational dashboards.
- **Data handling of existing sessions** — implicitly none (lazy), but never stated; interacts with rollback (C3).

---

## Pre-Mortem (crystal ball: this shipped exactly as written and was a fiasco)

- **Day 1 (immediate):** Canary rollback fails because sessions were consumed on exchange → the 1% cohort is locked out, not rolled back (C3). / KMS per-issuance signing hits a rate limit or latency spike under load → token issuance errors (M9).
- **1 month:** Session cookies disabled at week 4 → users on older mobile app builds are mass-logged-out; support queue explodes; app-store review latency means the fix takes days to reach users (C2). / An account compromise can't be contained for 15 min because `/revoke` doesn't really revoke (C4).
- **6 months (at 50k DAU):** `/auth/refresh` becomes the new bottleneck — every user, every 15 min, synchronized waves against the refresh DB — reproducing the original problem in a new location, and the promised cost savings never materialize (C1, M7). / A de-provisioned contractor retains access for 15 min after termination and exfiltrates data (M3).
- **Black swan A:** The Redis cluster turned out to also back rate-limiting and caching; Step 7's `"Remove the Redis session cluster"` takes down unrelated systems — "we never could have predicted that" (A2).
- **Black swan B:** The synchronized 15-min refresh storms coincide with autoscaler scale-down during the quiet inter-storm windows, so every refresh wave hits a cold/under-provisioned fleet → periodic latency cliffs that only appear in production (M7).

The plan addresses approximately **none** of these.

---

## Murder Board (attack on the core thesis)

**Killing argument (assessed COMPELLING, not a nitpick):** This plan should be rejected because it does not actually deliver its stated benefit. "Stateless JWT" is contradicted by the plan's own refresh-token database and revocation endpoint, so server-side state is relocated (Redis → SQL + blacklist), not eliminated — and with no cost model, there is no evidence the result is cheaper or faster rather than more complex and equally bottlenecked at `/auth/refresh`. When the central premise of a migration is both internally contradicted and unquantified, the correct action is to stop and re-justify the project, not to refine steps 1–7.

That this argument is constructible *from the plan's own text* — not from external nitpicks — is why the verdict is REJECT and not REVISE.

---

## Ambiguity Risks

- `"Token validation p99 <50ms"` → **A:** local signature verification only (then 50ms is absurdly loose) / **B:** validation includes revocation/JWKS network calls (then it's not stateless). *Risk if wrong reading is chosen:* the performance justification is either meaningless or self-refuting (M2).
- Step 6 `"Roll out ... to users in 4 phases"` → **A:** cohort assignment is per-user (sticky) / **B:** per-request. *Risk:* per-request assignment interacts destructively with Step 5's lazy exchange — a user could exchange a session for JWT on one request and be routed back to the (now possibly stale/absent) session path on the next. Must be sticky-per-user; the plan doesn't say (M8, C3).
- Step 5 `"exchanges its existing session for a JWT token pair"` → **A:** session preserved / **B:** session consumed. *Risk:* option B breaks rollback (C3).

---

## Dependency & Backcasting Notes

- Backcasting from the goal ("all DAU on JWT, cookies removed, Redis gone, zero errors"): for Step 7 (cookie removal) to be safe, Step 6 must have achieved *measured* ~100% client coverage — but lazy migration (Step 5) + mobile update lag (C2) cannot produce that within the window. The final precondition is never actually established by the preceding steps. **The causal chain is broken at the Step 6 → Step 7 handoff.**
- Ordering strength: placing Step 3 (monitoring) before rollout (Steps 4–6) is correct and one of the plan's few genuine strengths — acknowledged.

---

## Multi-Perspective Notes

- **Executor:** Cannot proceed on Step 2 (`"its own database"` — which engine? schema for refresh tokens/rotation?) or Step 1 (KMS signing model, JWKS distribution) without decisions that aren't in the plan. Would hit walls immediately and have to escalate.
- **Stakeholder:** The plan's success metrics are partly contradictory (M1) and partly vanity ("zero errors"), so a stakeholder cannot tell from them whether the migration actually succeeded — and the business case (cost) is entirely unquantified (C1).
- **Skeptic:** The strongest argument the plan fails to rebut is "just fix Redis" — cheaper, lower-risk, no client migration, no revocation regression (M5). The plan never proves JWT beats that alternative.

---

**Verdict Justification**: REJECT. Four CRITICAL findings — an unsubstantiated/self-contradicting core thesis (C1), a mobile timeline that guarantees mass forced logouts (C2), a broken/irreversible rollback path (C3), and a revocation deliverable that can't work as implied (C4) — plus nine MAJOR findings that touch success criteria, security, and load. These are foundational, not cosmetic: the project's justification is unproven and its core mechanics contradict its stated goals. The review escalated to ADVERSARIAL mode because the assert-vs-mechanics contradiction was systemic, not isolated.

Realist Check applied to all four CRITICALs: none downgraded. C1 (strategic/financial — the whole justification), C2 (user-facing mass breakage, no in-plan mitigation), and C3 (rollback failure → incident) are risk-proportionate at CRITICAL. C4 is a security-capability regression with no compensating control; it would drop to MAJOR *only* if security formally accepts a ≤15-min revocation SLA in writing — that decision must be explicit, so it stays CRITICAL until made. Security Exploitability Gate applied to C4, M3, M4, M6: all are reachable by non-privileged actors (compromised-account holder, XSS attacker, deprovisioned user) and represent capability *losses* relative to today's session auth — none are admin-already-has-the-power cases, so none were moved to Open Questions.

**Verdict challenge** ("argue this is too lenient"): The strongest case for something harsher than REJECT would require a tier that doesn't exist; REJECT is the floor. The case that REJECT is *too harsh* (i.e., REVISE) fails because the defects are in the thesis and the load-bearing mechanics (cost, revocation, rollback, mobile), not in step detail — this needs re-justification, not editing.

**To upgrade to REVISE**, the plan would need, at minimum: (1) a quantified cost/latency model proving a net win at 12k and 50k DAU including refresh-DB, KMS, and any revocation-check load; (2) a documented revocation SLA and a mechanism that meets it; (3) a client-adoption-gated cutover that cannot hard-break unupdated mobile apps; (4) a rollback path proven to work for already-migrated users, with Step 7 marked as an explicit point-of-no-return; and (5) an alternatives-considered section that shows JWT beats "optimize Redis" and "opaque token + cache" on the cost model. Fix those and the remaining MAJORs/MINORs become a tractable revision.

**Open Questions (unscored)**:
- Is the Redis cluster session-only, or shared with cache/rate-limiting/queues? (A2 — unverifiable in this workspace; determines whether Step 7 is safe.)
- Does the session survive JWT exchange, or is it consumed? (Refutable sub-point of C3 — one word from the author flips this from "impossible rollback" to "recoverable.")
- What mobile share of the 12k DAU exists, and what's the historical app-update adoption curve? (Sizes the C2 blast radius.)
- Is a ≤15-min revocation latency acceptable to security and compliance? (Decides whether C4 stays CRITICAL or becomes a MAJOR documentation fix.)
- Are there weekly/monthly-active users beyond the 12k DAU, and what's the plan for them at cookie-removal time?

One meta-note per the working agreement: this plan reads as *dead* on its central claim — "stateless / eliminate the bottleneck" appears to be an unexamined slogan carried through all seven steps rather than a decision that was ever interrogated against its own refresh-DB and revocation mechanics. The single highest-value thing the author can do is go back to that source claim and quantify it before touching the steps.