# Stage 7: Technique Validation Results — OLD vs NEW Comparison

**Date**: 2026-03-05

---

## 1. Side-by-Side Comparison

| Metric | OLD (Stage 6) | NEW (Stage 7) | Delta | Interpretation |
|--------|--------------|--------------|-------|----------------|
| **Verdict** | ACCEPT-WITH-RESERVATIONS | REVISE | +1 tier | NEW is harsher — justified by deeper analysis (see §2) |
| **Total findings** | 2 MAJOR + 4 MINOR | 4 MAJOR + 5 MINOR | +2 MAJOR, +1 MINOR | NEW finds more, all genuine |
| **Critical findings** | 0 | 0 | 0 | Same — proposal has no blocking issues |
| **Major findings** | 2 | 4 | +2 | NEW found 2 additional MAJOR findings (see §2) |
| **Minor findings** | 4 | 5 | +1 | Marginal increase |
| **What's Missing items** | 5 | 8 | +3 | NEW identified 3 additional gaps |
| **Ambiguity risks** | 3 | 2 | -1 | Similar coverage, slightly different framing |
| **False positives (est.)** | 0 | 0 | 0 | Neither review manufactured findings |
| **Evidence rate** | 100% (all MAJOR findings cited evidence) | 100% (all MAJOR findings cited evidence) | Same | Both reviews evidence-backed |
| **Escalation** | THOROUGH (no trigger) | ADVERSARIAL (4 MAJOR triggered) | Escalated | NEW's additional findings triggered appropriate escalation |
| **New technique contributions** | N/A | 4 findings attributable to T1-T7 | +4 | Shows incremental value (see §2) |

---

## 2. Findings Unique to NEW (attributed to specific new techniques)

### Finding N1: "Proposal solves a non-problem" (Murder Board + ACH-lite)

**Attributed to**: T3 (Murder Board) + T9 (ACH-lite)

The murder board constructed a thesis-level attack: the ~35% overlap produced zero measurable harm, so modifying working techniques is unjustified. ACH-lite identified two lower-risk alternatives (KEEP, threshold adjustment) that the proposal's evidence supports equally well.

**OLD review comparison**: The OLD review's Devil's Advocate section noted "the DIFFERENTIATE approach is the highest-risk option" and the Skeptic perspective asked if the cure is worse than the disease. But neither produced the concentrated, evidence-backed argument that the murder board delivers. The OLD review buried this insight across two separate sections; the NEW review surfaces it as a single, devastating MAJOR finding.

**Incremental value**: HIGH. The murder board's thesis attack crystallizes what the OLD review only hints at.

### Finding N2: Broken backcasting chain (strategic/operational not separable)

**Attributed to**: T5 (Backcasting)

The NEW review traced the causal chain backward from the proposal's goal (reduce overlap to ~15-20%) and identified a broken link: the goal requires a separable strategic/operational boundary, but the evidence shows this boundary is fuzzy at exactly the points where it matters most.

**OLD review comparison**: The OLD review identified the "dead zone" as a pre-mortem scenario and an ambiguity risk, but didn't trace the logical chain to show that the proposal's goal is structurally unachievable with its chosen approach. The backcasting analysis provides the missing rigorous argument.

**Incremental value**: HIGH. Backcasting exposed a structural infeasibility that forward analysis missed.

### Finding N3: Socratic collapse on 30% threshold

**Attributed to**: T2 (Socratic Deconstruction)

The why-chain on "why differentiate?" collapsed at level 3: the only justification is that 35% exceeds a 30% threshold that was set without empirical basis. The NEW review also identified a begging-the-question fallacy: the proposal assumes overlap is a problem because it exceeds a threshold for overlap-being-a-problem.

**OLD review comparison**: The OLD review's Stakeholder perspective asked "is the fix worth the risk?" — a similar concern, but framed as a question rather than a proven reasoning failure. The Socratic deconstruction provides the rigorous proof that the reasoning is circular.

**Incremental value**: MEDIUM-HIGH. Upgrades a vague stakeholder concern into a demonstrated logical fallacy.

### Finding N4: Strengthened pre-mortem scenarios

**Attributed to**: T1 (Strengthened Pre-Mortem)

The NEW review's pre-mortem generated 7 scenarios (vs the OLD review's 5), including:
- **Model over-compliance** (scenario 2): the constraint language causes the LLM to aggressively self-censor. This scenario was not in the OLD review.
- **Checklist/protocol desync** (scenario 3): the Final Checklist doesn't match the modified Step 8 wording. The OLD review noted the checklist gap as a minor finding but didn't frame it as a failure scenario.
- **Black swans**: prompt interaction with future model versions, technique coupling via cross-references. Neither appeared in the OLD review.
- **Multi-horizon analysis**: distinguished day-1 (checklist desync), 1-month (dead zone), and 6-month (validation drift) failure modes. The OLD review treated all failures as equivalent.

**Incremental value**: MEDIUM. The additional scenarios provide richer failure analysis, though only the "model over-compliance" scenario is genuinely novel.

### Additional NEW technique contributions (non-finding)

- **T6 (Consider-the-Opposite)**: Checked §6 Expected Impact — identified that it's entirely positive with no risk rows. Also checked the 5 KEEP decisions for hidden problems; confirmed they are sound. The OLD review didn't explicitly check for false negatives.
- **T7 (Verdict Challenge)**: Constructed the REJECT case, counter-argued it, held at REVISE. This calibration step is absent from the OLD review, which simply landed at AWR without stress-testing the verdict.

---

## 3. Regressions (OLD findings missed by NEW)

**No regressions found.** Every finding in the OLD review is present in the NEW review (sometimes in a different or expanded form):

| OLD Finding | NEW Equivalent |
|------------|---------------|
| Untested overlap reduction prediction (MAJOR) | No validation of modified prompts (MAJOR #3) |
| Dead zone for dual-nature findings (MAJOR) | Dead zone for dual-nature findings (MAJOR #2) |
| Final Checklist not updated (MINOR) | Same (MINOR #1) |
| SKILL.md not checked (MINOR) | Same (MINOR #2) |
| Rollback plan implicit (MINOR) | Subsumed into "What's Missing" |
| §4 doesn't discuss potential gaps (MINOR) | Subsumed into broader §6 criticism (MINOR #3) |

The NEW review captured everything the OLD review found, plus 4 additional findings.

---

## 4. Success Criteria Evaluation

| Criterion | Result |
|-----------|--------|
| NEW finds strictly more genuine issues than OLD | **PASS** — 4 MAJOR vs 2 MAJOR; 5 MINOR vs 4 MINOR |
| NEW does not produce dramatically more false positives | **PASS** — 0 false positives in both |
| At least 2-3 NEW findings clearly attributable to T1-T7 | **PASS** — 4 findings attributed (N1-N4) |
| NEW's additional findings are genuinely useful, not noise | **PASS** — all 4 additional findings are substantive and evidence-backed |
| If NEW verdict is harsher, the harsher verdict is justified | **PASS** — REVISE (vs AWR) is justified by 4 MAJOR findings; the murder board's thesis attack alone justifies escalation |

**All 5 success criteria met.**

---

## 5. Final Recommendation

### Ship the proposed changes? **SHIP WITH AMENDMENTS.**

The testing pipeline (Stages 1-7) validates that:
- The 7 new techniques produce measurably better reviews (4 additional findings, 0 additional false positives, appropriate escalation)
- The 5 KEEP decisions are thoroughly supported by evidence
- The 2 MODIFY decisions have a structural weakness identified by the NEW protocol itself

### Recommended amendments to the proposal:

**Amendment 1: Change T3/Skeptic decision from DIFFERENTIATE to KEEP**

Both the OLD and NEW reviews converge on the same conclusion: the ~35% overlap is benign. The NEW review's murder board and Socratic deconstruction prove that the modification solves a non-problem. The recommended action:

- **KEEP** both T3 and Skeptic with current (unconstrained) wording
- **UPDATE** the redundancy threshold from 30% to 40% based on empirical evidence (35% overlap produced 0% FP, 0 incorrect verdicts)
- **REVERT** the two prompt modifications applied to `.claude/agents/harsh-critic.md` (the Stage 5 scope constraints on Murder Board and Skeptic)

This eliminates all 4 MAJOR findings from the Stage 7 review while preserving the 5 solid KEEP decisions and all 7 new techniques.

**Amendment 2: Update the Final Checklist**

Add the new technique references to the checklist (both OLD and NEW reviews flagged this). Specifically:
- "Did I run the Socratic why-chains and logical fallacy scan on key decisions?"
- "Did I attempt a murder board kill of the core thesis?"
- "Did I identify competing alternatives and check if the plan's evidence rules them out?"
- "Did I backcast from goals to verify the causal chain is complete?"

(These are already present in the current checklist — no change needed. Confirmed by reading `.claude/agents/harsh-critic.md`.)

**Amendment 3: Add risk rows to §6 Expected Impact**

Acknowledge that the technique set is validated on 5 synthetic fixtures and may behave differently on real-world plans. This is a documentation improvement, not a technique change.

### Summary of final technique decisions:

| # | Technique | Final Decision | Change from Original Proposal |
|---|-----------|---------------|------------------------------|
| T1 | Strengthened Pre-Mortem | **KEEP** | No change |
| T2 | Socratic Deconstruction | **KEEP** | No change |
| T3 | Murder Board | **KEEP** (revert to unconstrained) | Changed from MODIFY to KEEP |
| T4 | Competing Alternatives (ACH-lite) | **KEEP** | No change |
| T5 | Backcasting | **KEEP** | No change |
| T6 | Consider-the-Opposite | **KEEP** | No change |
| T7 | Verdict Challenge | **KEEP** | No change |
| — | Skeptic Perspective | **KEEP** (revert to unconstrained) | Changed from MODIFY to KEEP |
| — | Redundancy threshold | **UPDATE** 30% → 40% | New decision |

---

## 6. Updated Benchmark Expectations

Based on the full Stage 1-7 results, the benchmark expectations for the 5-fixture test set are:

| Fixture | Expected Verdict | Expected CRITICAL | Expected MAJOR | Expected MINOR |
|---------|-----------------|-------------------|----------------|----------------|
| auth-migration | REVISE | 0-1 | 2-4 | 1-3 |
| api-redesign | REVISE | 0 | 3-5 | 2-4 |
| data-pipeline | REJECT | 1-2 | 2-4 | 1-3 |
| clean-baseline | ACCEPT-WITH-RESERVATIONS | 0 | 0 | 4-8 |
| weak-justification | REJECT | 1-3 | 3-5 | 1-3 |

**Key metrics**:
- True positive rate: 100% (16/16 seeded flaws detected)
- False positive rate: 0% (0/11 traps triggered)
- Verdict accuracy: 5/5 within expected range
- Technique overlap: all pairs ≤40% (updated threshold)
- Token budget: all fixtures fit within output limits
- Escalation: no false escalations on clean baseline; appropriate escalation on flawed fixtures
