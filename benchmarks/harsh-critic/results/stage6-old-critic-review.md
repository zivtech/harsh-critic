# Stage 6: OLD Harsh-Critic Review of Technique Changes Proposal

**Protocol version**: OLD (pre-new-techniques — baseline techniques only, no Socratic deconstruction, no murder board, no ACH-lite, no backcasting, no consider-the-opposite, no verdict challenge)

**Work under review**: `plans/technique-changes-proposal.md`

---

## Phase 1 — Pre-commitment Predictions

Before reading the proposal in detail, predicted problem areas for a technique-changes document:

1. **Cherry-picked evidence** — proposal may selectively cite test results that support keeping techniques while downplaying negative results
2. **Insufficient modification specificity** — "MODIFY" decisions may lack concrete, implementable prompt changes
3. **Missing rollback plan** — no contingency if the proposed changes degrade performance
4. **Untested assumptions about overlap reduction** — the DIFFERENTIATE approach for T3/Skeptic is a prediction, not a tested outcome
5. **Scope gaps** — proposal may focus on the 7 new techniques without addressing interactions with the 10 baseline techniques

---

## Phase 2 — Verification

### Step 1: Key Assumptions Extraction

| # | Assumption | Rating | Notes |
|---|-----------|--------|-------|
| A1 | 100% TP rate will be maintained after modifications | FRAGILE | The scope constraints on T3 and Skeptic change what they look for — no test confirms the constrained versions find the same things |
| A2 | ~35% overlap will drop to ~15-20% after differentiation | FRAGILE | This is a prediction, not a measurement. The proposal acknowledges this implicitly (`"should reduce"`) but treats it as near-certain |
| A3 | 5 test fixtures are sufficient to validate the technique set | REASONABLE | The fixtures cover a range (clean to severely flawed) but 5 is a small sample size |
| A4 | Stage 1-4 test results are representative of real-world usage | REASONABLE | Synthetic fixtures may not capture the diversity of real plans |
| A5 | Zero false positives across all fixtures means the FP rate is genuinely 0% | REASONABLE | Could be an artifact of fixture design — real plans have more ambiguity |
| A6 | The "convergent evidence" framing for T1/T5 overlap is correct (not redundancy) | REASONABLE | The argument is plausible but unfalsifiable with current test data |
| A7 | Token budget will remain sufficient after modifications | VERIFIED | Modifications are scope constraints (reducing output, not expanding it) |

**FRAGILE assumptions A1 and A2 are highest-priority targets.**

### Step 2: Pre-Mortem

Assume this proposal was executed exactly as written and failed. Failure scenarios:

1. **The scope constraints on T3 make it toothless**: By constraining the murder board to "strategic/thesis" only, plans with operational-but-thesis-level problems (e.g., data-pipeline's vendor lock-in is both strategic AND operational) fall through the cracks. The murder board can't attack it because it's "operational," and the skeptic doesn't construct a kill argument because it's told to focus on "execution."
2. **The Skeptic becomes weaker, not better**: Adding "not the strategic direction (that's the Murder Board's job)" to the Skeptic prompt causes the model to self-censor its strongest arguments, which are often the ones that blend strategic and operational concerns.
3. **The 0% FP rate doesn't hold on real plans**: Real plans are messier than test fixtures. The clean-baseline fixture was purpose-built with zero flaws — real "good" plans still have gray areas. Techniques that showed 0% FP on synthetic data may produce false positives on ambiguous real-world plans.
4. **The DIFFERENTIATE approach creates a dead zone**: Issues that are genuinely both strategic AND operational — the most dangerous category — are claimed by neither T3 nor the Skeptic because each defers to the other.
5. **The proposal validates itself**: The proposal was written by the same agent that designed and tested the techniques. There is no independent validation — Stage 6 and 7 reviews are the first external check.

Does the proposal address these scenarios?
- Scenario 1: NOT addressed. The proposal doesn't discuss what happens when a finding is both strategic and operational.
- Scenario 2: NOT addressed. The proposal assumes scope constraints improve output without considering that they might suppress valid findings.
- Scenario 3: Partially addressed — §6 acknowledges the prediction is untested but frames the risk as negligible.
- Scenario 4: NOT addressed. The "dead zone" between strategic and operational is not mentioned.
- Scenario 5: NOT addressed. The self-referential nature of the testing pipeline is not acknowledged.

### Step 3: Dependency Audit

The proposal has a clear dependency chain:
- §1 (Summary table) depends on Stage 1-4 results → VERIFIED (results exist and are referenced)
- §2 (Modifications) depends on §1 decisions → VERIFIED
- §5 (Updated protocol) depends on §2 wording → VERIFIED
- §6 (Expected impact) depends on §2 changes → VERIFIED

No circular dependencies. However, §6's predictions depend on assumptions A1 and A2 which are untested — this is a missing handoff (no validation step between "propose" and "predict impact").

### Step 4: Ambiguity Scan

| Quote | Interpretation A | Interpretation B | Risk |
|-------|-----------------|-----------------|------|
| `"targeting the problem framing, technology choice, or architectural direction, not implementation gaps"` | These are examples, not an exhaustive list — the murder board can target anything strategic | These are the ONLY valid targets — murder board is constrained to these three categories | If B: murder board scope is too narrow; misses strategic issues that don't fit these categories |
| `"operational failure modes belong in the Skeptic perspective (Phase 3), not here"` | This is a soft guideline — if a failure mode is devastating enough, the murder board can still mention it | This is a hard constraint — murder board must never mention operational failure modes | If B: dangerous "dead zone" for issues that bridge strategic and operational |
| `"the remaining overlap being genuinely convergent evidence where operational and strategic concerns meet at the same root cause"` | Overlap of ~15-20% is expected and healthy | Overlap above 0% means the differentiation didn't work | If B: the modification is incorrectly evaluated as a failure |

### Step 5: Feasibility Check

The modifications in §2 are concrete and executable — they consist of specific prompt wording changes with before/after text. An executor could apply these changes without ambiguity.

However: §5 says `"Only the changed sections are shown below; all other protocol text remains identical."` An executor must verify that "identical" is actually identical — there could be unintended interactions with other protocol text that references the murder board or skeptic. The proposal doesn't flag these cross-references.

### Step 6: Rollback Analysis

**Not addressed.** The proposal contains no rollback plan. If the modifications degrade performance, the implicit rollback is to revert the two prompt changes — but this isn't documented, and there's no discussion of how degradation would be detected.

### Devil's Advocate

**Strongest argument against DIFFERENTIATE (vs MERGE or KEEP)**:

The DIFFERENTIATE approach is the highest-risk option of the three. KEEP is zero-risk (accept the overlap). MERGE is low-risk (one prompt to tune instead of two). DIFFERENTIATE requires both prompts to change simultaneously, creates a new failure mode (the dead zone), and its predicted overlap reduction is untested. The proposal chose the approach with the most moving parts and the least validation.

Counter: DIFFERENTIATE preserves both techniques' unique strengths. This is reasonable, but the proposal should have acknowledged the risk hierarchy of the three options.

---

## Phase 3 — Multi-Perspective Review

### Executor
"Can I apply these changes with only what's written here?"

Mostly yes. The before/after prompt wording is clear. But:
- I'd need to verify that the Final Checklist (which references murder board and skeptic) doesn't need updating to match the new scope constraints
- I'd need to verify the SKILL.md file doesn't also need changes
- The proposal says "all other protocol text remains identical" but doesn't explicitly confirm this was checked

### Stakeholder
"Does this proposal solve the stated problem?"

The stated problem is the ~35% T3/Skeptic overlap. The proposal addresses it with scope differentiation. The success criteria (reduce to ~15-20%) is reasonable but unvalidated. The stakeholder concern: the overlap was the ONLY problem found, and the testing was thorough — is the risk of introducing new problems (dead zone, self-censoring) worth fixing a cosmetic overlap that produced zero false positives?

### Skeptic
"What is the strongest argument that this approach will fail?"

The strongest argument: the T3/Skeptic overlap at ~35% wasn't actually a problem. Both techniques produced zero false positives. The overlap represented convergent evidence — two independent analytical paths reaching the same conclusion. By "fixing" this non-problem, the proposal risks introducing a genuine problem (the dead zone between strategic and operational). The cure may be worse than the disease.

---

## Phase 4 — Gap Analysis

**What's Missing:**

1. **No validation of the modified prompts**: The proposal predicts impact but doesn't include any test of the modified wording. The Stage 5 deliverable specification required this as §6 ("Expected impact"), but expected impact is a prediction, not a measurement.

2. **No discussion of the strategic/operational boundary**: The core of the DIFFERENTIATE approach is the claim that strategic and operational failure modes are separable. But the Stage 4 data shows the highest overlap was on data-pipeline, where the vendor lock-in issue IS both strategic and operational simultaneously. The proposal doesn't address how the modified prompts handle dual-nature issues.

3. **No rollback plan or degradation detection criteria**: If the modifications cause problems, how would this be detected? What metrics would trigger a rollback?

4. **No update to the Final Checklist**: The checklist in the protocol references "did I attempt a murder board kill of the core thesis?" — this should be updated to reflect the strategic-only scope constraint. Similarly, no mention of updating SKILL.md.

5. **No consideration of KEEP as the lowest-risk option**: The proposal presents DIFFERENTIATE as the recommended approach but doesn't include a risk analysis comparing KEEP vs DIFFERENTIATE vs MERGE. Given that the overlap produced zero false positives and all verdicts were correct, KEEP has a strong case that the proposal doesn't adequately address.

---

## Phase 4.5 — Self-Audit (Part A)

| Finding | Confidence | Author could refute? | Flaw or preference? |
|---------|-----------|---------------------|---------------------|
| A1/A2 fragile assumptions (untested predictions) | HIGH | NO — predictions are untested by definition | FLAW |
| Dead zone between strategic/operational | MEDIUM | PARTIALLY — could argue the model will use judgment | FLAW |
| No rollback plan | HIGH | NO — rollback plan is genuinely absent | FLAW |
| Self-validating pipeline | MEDIUM | YES — could argue Stage 6/7 IS the external check | Move to Open Questions |
| No Final Checklist update | HIGH | NO — checklist genuinely references old scope | FLAW |

Moved "self-validating pipeline" to Open Questions (author could credibly argue Stage 6/7 validates).

---

## Phase 4.75 — Realist Check

### Finding: Untested overlap reduction prediction (A1/A2)
1. Realistic worst case: overlap stays at ~35% or gets worse. Impact: cosmetic — the overlap wasn't causing problems.
2. Mitigating factor: even if differentiation fails, the techniques still work (they just overlap).
3. Detection: next time the protocol runs on a test fixture, overlap can be measured.
4. Proportional? Yes — this is worth flagging but doesn't block execution.

**Rating: MAJOR** (retained — the prediction is central to the proposal's rationale)

### Finding: Dead zone between strategic/operational
1. Realistic worst case: a finding that's both strategic and operational gets weakened coverage.
2. Mitigating factor: there are 15 other techniques that might catch it.
3. Detection: would show up as a missed finding in future testing.
4. Proportional? The concern is real but speculative.

**Rating: MAJOR** (retained — addresses a new failure mode the modifications create)

### Finding: No rollback plan
1. Realistic worst case: modifications degrade performance and there's confusion about how to revert.
2. Mitigating factor: the changes are two prompt edits; reverting is trivial via git.
3. Detection: immediate via next test run.
4. Proportional? Mitigated by trivial revert path.

**Downgraded: MAJOR → MINOR.** Mitigated by: changes are two prompt edits easily reverted via git history.

### Finding: No Final Checklist update
1. Realistic worst case: checklist doesn't match protocol, causing confusion.
2. Mitigating factor: minor inconsistency.
3. Detection: immediate on next protocol read.

**Rating: MINOR** (retained)

---

## VERDICT: ACCEPT-WITH-RESERVATIONS

**Overall Assessment**: The proposal is well-structured, evidence-based, and conservative in its decisions (5 KEEP, 2 MODIFY, 0 REMOVE). The testing pipeline (Stages 1-4) was thorough and the results are clearly presented. However, the core modification (T3/Skeptic differentiation) rests on untested predictions about overlap reduction and introduces a potential dead zone for dual-nature findings that the proposal doesn't acknowledge or address.

**Critical Findings**: None.

**Major Findings**:

1. **Untested overlap reduction prediction** — The proposal claims the modifications will reduce T3/Skeptic overlap from ~35% to ~15-20%, but this prediction is never validated. The entire rationale for the MODIFY decision rests on this untested assumption. §2.3 says `"should reduce overlap from ~35% to ~15-20%"` — "should" is doing a lot of work here.
   - Confidence: HIGH
   - Why this matters: If the prediction is wrong, the modifications are pointless complexity. If the overlap increases (unlikely but possible due to the ambiguity in scope boundaries), the modifications are actively harmful.
   - Fix: Add a validation step — re-run at least the data-pipeline and weak-justification fixtures with the modified prompts and measure actual overlap before finalizing.

2. **Dead zone for dual-nature findings** — The DIFFERENTIATE approach creates a potential gap where findings that are simultaneously strategic AND operational (e.g., data-pipeline's vendor lock-in) may receive weakened coverage because each technique defers to the other. §2 says `"targeting the problem framing, technology choice, or architectural direction, not implementation gaps"` but the data-pipeline fixture's highest-overlap findings were precisely issues that span both categories.
   - Confidence: MEDIUM
   - Why this matters: The most dangerous plan flaws are often the ones that are both strategically wrong AND operationally fragile. Creating a scope boundary between these categories risks missing exactly the findings that matter most.
   - Fix: Add explicit guidance in both prompts: "If a finding is genuinely both strategic and operational, it belongs in the murder board — err on the side of inclusion."

**Minor Findings**:

1. The Final Checklist in the protocol references "did I attempt a murder board kill of the core thesis?" but doesn't reflect the new strategic-only scope constraint.
2. No mention of whether SKILL.md needs corresponding updates.
3. The rollback plan is implicit (git revert) but not documented. (Downgraded from MAJOR — mitigated by trivial revert path.)
4. §4 ("No new techniques proposed") doesn't discuss whether any gaps were identified during testing that MIGHT warrant a new technique, even if the decision was to defer.

**What's Missing**:
- Risk comparison of KEEP vs DIFFERENTIATE vs MERGE (the three Stage 4 options)
- Explicit handling of dual-nature (strategic + operational) findings
- Validation plan for the predicted overlap reduction
- Updated Final Checklist reflecting new scope constraints
- Discussion of fixture representativeness (5 synthetic fixtures vs real-world diversity)

**Ambiguity Risks**:
- `"targeting the problem framing, technology choice, or architectural direction, not implementation gaps"` → Is this an exhaustive list or examples? Risk: if exhaustive, scope is too narrow.
- `"operational failure modes belong in the Skeptic perspective (Phase 3), not here"` → Hard constraint or soft guideline? Risk: if hard, creates dead zone.

**Multi-Perspective Notes**:
- Executor: Changes are implementable, but Final Checklist and SKILL.md cross-references need verification.
- Stakeholder: The overlap was the only problem, and it wasn't causing harm. Is the fix worth the risk?
- Skeptic: The cure (scope differentiation) may be worse than the disease (benign overlap with convergent evidence).

**Verdict Justification**: ACCEPT-WITH-RESERVATIONS because the proposal is fundamentally sound — the testing was thorough, the decisions are conservative, and the modifications are small. The reservations are: (1) the overlap reduction prediction should be validated before the changes are considered final, and (2) the dead zone risk for dual-nature findings should be explicitly addressed in the prompt wording. Neither reservation blocks execution, but both should be resolved before the modifications are considered permanent. Review operated in THOROUGH mode throughout — no escalation triggers met (0 CRITICAL, 2 MAJOR, no systemic pattern).

**Open Questions**:
- Is the testing pipeline self-validating? The same agent that designed the techniques also tested them and is now proposing changes. Stage 6/7 reviews are the first external check, but they review the proposal document, not the techniques themselves.
- Would the overlap reduction prediction hold on a larger or more diverse fixture set?
- Is ~35% overlap actually a problem worth fixing, given that it produced 0 false positives and all verdicts were correct?
