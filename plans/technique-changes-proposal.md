# Stage 5: Technique Changes Proposal

**Date**: 2026-03-05
**Basis**: Stage 1-4 test results across 5 fixtures (auth-migration, api-redesign, data-pipeline, clean-baseline, weak-justification)

---

## 1. Summary Table

| # | Technique | Decision | Rationale |
|---|-----------|----------|-----------|
| T1 | Strengthened Pre-Mortem | **KEEP** | 100% TP rate, 0% FP, ~20% overlap with T5 (within threshold). Certainty framing, black swans, and multi-horizon all produced unique findings not surfaced by any other technique. |
| T2 | Socratic Deconstruction | **KEEP** | 100% TP rate, 0% FP, ~14% overlap with T4. Why-chains and fallacy scans are the only technique that directly attacks reasoning quality (vs. outcomes). Highly complementary with T4. |
| T3 | Murder Board | **MODIFY** | 100% TP rate, 0% FP, but ~35% overlap with Skeptic perspective exceeds 30% threshold. Modification: add explicit scope constraint to prevent overlap. See §2 for details. |
| T4 | Competing Alternatives (ACH-lite) | **KEEP** | 100% TP rate, 0% FP, ~14% overlap with T2. The only technique that identifies viable alternatives and tests whether the plan's evidence is diagnostic. Prescriptive complement to T2's diagnostic role. |
| T5 | Backcasting | **KEEP** | 100% TP rate, 0% FP, ~20% overlap with T1. Backward causal chain analysis found precondition gaps that forward analysis missed in 3/4 non-clean fixtures. |
| T6 | Consider-the-Opposite | **KEEP** | 0% FP on clean baseline (correctly confirmed solid sections). The empirically strongest debiasing technique — catches findings that confirmation bias suppresses. No modification needed. |
| T7 | Verdict Challenge | **KEEP** | Well-calibrated across all fixtures. No over-escalation on clean baseline (held at AWR). REJECT ceiling handled gracefully. No modification needed. |
| — | Skeptic Perspective (baseline) | **MODIFY** | Counterpart to T3 modification. Add explicit scope constraint to focus on operational/execution failure modes. See §2 for details. |

**Summary**: 5 KEEP, 2 MODIFY (T3 + Skeptic — coordinated differentiation), 0 MERGE, 0 REMOVE, 0 ADD.

---

## 2. Specific Modifications

### 2.1 T3 (Murder Board) — Scope Constraint

**Problem**: T3 and the Skeptic perspective both construct thesis-level attack arguments, producing ~35% functional overlap (highest on data-pipeline at ~60%, where both identified the same three structural gaps).

**Decision**: DIFFERENTIATE rather than MERGE. Rationale:
- Merging risks diluting the murder board's concentrated kill-shot quality — its value comes from a single devastating argument, not a list of concerns
- The Skeptic perspective serves a different structural role (it's one of three Phase 3 perspectives, not a standalone technique)
- Keeping both but constraining scope preserves their unique strengths while reducing overlap

**Current wording** (Step 8):
```
- Step 8 — Murder Board: After completing the step-by-step analysis, step back and attack
the plan's core thesis. The murder board doesn't just poke holes in individual steps — it
tries to kill the entire proposal on its merits. Construct a complete 2-3 sentence argument
for why this plan should be rejected outright. If you can build a compelling case, the plan
has a structural problem that the step-level analysis may have missed. If you genuinely
cannot construct a killing argument, note that — it's a signal of strength.
```

**Proposed wording** (Step 8):
```
- Step 8 — Murder Board: After completing the step-by-step analysis, step back and attack
the plan's core thesis — its strategic rationale, not its operational execution. The murder
board asks: "Is the fundamental approach wrong?" not "Will the steps fail?" Construct a
single, devastating 2-3 sentence argument for why this plan's core approach should be
rejected outright — targeting the problem framing, technology choice, or architectural
direction, not implementation gaps. Then explicitly assess your own argument: is it
COMPELLING (structural problem the step-level analysis missed) or WEAK (nitpick elevated to
thesis level)? If you genuinely cannot construct a killing argument, note that — it's a
signal of strength. Note: operational failure modes belong in the Skeptic perspective
(Phase 3), not here.
```

**Changes**:
1. Added "its strategic rationale, not its operational execution" — scopes the murder board to strategic/thesis attacks only
2. Added "targeting the problem framing, technology choice, or architectural direction, not implementation gaps" — concrete examples of in-scope vs out-of-scope
3. Added "Then explicitly assess your own argument: is it COMPELLING or WEAK?" — makes the self-assessment mandatory (it was already happening in practice but not required)
4. Added cross-reference: "operational failure modes belong in the Skeptic perspective (Phase 3), not here" — prevents scope creep

### 2.2 Skeptic Perspective — Scope Constraint

**Current wording** (Phase 3):
```
- As the SKEPTIC: "What is the strongest argument that this approach will fail? What
alternative was likely considered and rejected? Is the rejection rationale sound, or was it
hand-waved?"
```

**Proposed wording** (Phase 3):
```
- As the SKEPTIC: "What is the strongest argument that execution of this plan will fail —
not the strategic direction (that's the Murder Board's job in Step 8), but the operational
reality? What will go wrong when a team actually tries to implement this? What alternative
was likely considered and rejected? Is the rejection rationale sound, or was it hand-waved?"
```

**Changes**:
1. Added "execution of this plan will fail" — shifts from generic failure to execution failure
2. Added "not the strategic direction (that's the Murder Board's job in Step 8)" — explicit deconfliction
3. Added "What will go wrong when a team actually tries to implement this?" — anchors the perspective in operational reality

### 2.3 Expected Effect of Modifications

The T3/Skeptic differentiation should:
- Reduce overlap from ~35% to ~15-20% (the remaining overlap being genuinely convergent evidence where operational and strategic concerns meet at the same root cause)
- Preserve T3's kill-shot quality by constraining it to strategic arguments only
- Preserve the Skeptic's operational focus by explicitly scoping it away from thesis attacks
- Zero impact on true positive rate (all findings surfaced by the overlap were also found independently by at least one other technique)
- Zero impact on false positive rate (neither technique produced false positives in any configuration)

---

## 3. Merge Specifications

No merges proposed. The T3/Skeptic overlap is addressed via differentiation (§2) rather than merging, for the reasons stated in §2.1.

---

## 4. New Technique Proposals

No new techniques proposed. The 17-technique protocol (10 baseline + 7 new) achieved:
- 100% true positive rate (16/16 seeded flaws detected)
- 0% false positive rate increase (0/11 traps triggered)
- All fixtures received correct verdicts
- No gaps identified that would require an 18th technique

---

## 5. Updated Protocol

The full revised protocol incorporates the two modifications from §2. Only the changed sections are shown below; all other protocol text remains identical to the current version in `.claude/agents/harsh-critic.md`.

### Changed Section 1: Step 8 (Murder Board)

Replace the current Step 8 text with:

```
- Step 8 — Murder Board: After completing the step-by-step analysis, step back and attack
the plan's core thesis — its strategic rationale, not its operational execution. The murder
board asks: "Is the fundamental approach wrong?" not "Will the steps fail?" Construct a
single, devastating 2-3 sentence argument for why this plan's core approach should be
rejected outright — targeting the problem framing, technology choice, or architectural
direction, not implementation gaps. Then explicitly assess your own argument: is it
COMPELLING (structural problem the step-level analysis missed) or WEAK (nitpick elevated to
thesis level)? If you genuinely cannot construct a killing argument, note that — it's a
signal of strength. Note: operational failure modes belong in the Skeptic perspective
(Phase 3), not here.
```

### Changed Section 2: Skeptic Perspective (Phase 3)

Replace the current Skeptic perspective text with:

```
- As the SKEPTIC: "What is the strongest argument that execution of this plan will fail —
not the strategic direction (that's the Murder Board's job in Step 8), but the operational
reality? What will go wrong when a team actually tries to implement this? What alternative
was likely considered and rejected? Is the rejection rationale sound, or was it hand-waved?"
```

---

## 6. Expected Impact

### True Positive Rate
- **Current**: 100% (16/16 seeded flaws detected across 5 fixtures)
- **Predicted after changes**: 100% — no technique is being removed or weakened. The scope constraints on T3 and Skeptic only reduce overlap, not coverage. Every finding that was discovered through the overlapping zone was independently discovered by at least one other technique path.

### False Positive Rate
- **Current**: 0% increase from new techniques (0/11 traps triggered)
- **Predicted after changes**: 0% — the modifications add scope constraints, which can only reduce false positives (by preventing the murder board from escalating operational concerns to thesis-level severity). No mechanism exists for the changes to increase false positives.

### Token Budget
- **Current**: All 17 techniques fit within output limits with no truncation on any fixture
- **Predicted after changes**: Marginal improvement. The scope constraints on T3 and Skeptic should slightly reduce output length by preventing duplicate analysis. Estimated reduction: 2-5% on fixtures that previously triggered high overlap (data-pipeline, weak-justification).

### Escalation Behavior
- **Current**: 0/5 fixtures over-escalated; T3+T7 combination well-calibrated
- **Predicted after changes**: No change. The murder board's self-assessment (COMPELLING/WEAK) was already happening in practice; making it mandatory in the prompt simply formalizes existing behavior. The verdict challenge (T7) operates independently of T3's scope.

### Technique Interaction Health
- **Current**: Only T3/Skeptic overlap exceeds threshold (~35%)
- **Predicted after changes**: All pairs within ≤20% overlap threshold. The T3/Skeptic pair should drop to ~15-20% with the scope differentiation.

---

## Appendix: Evidence Summary

### Per-Technique Test Results (Stages 1-3)

| Technique | True Positives | False Positives | Unique Findings | Key Strength |
|-----------|---------------|-----------------|-----------------|--------------|
| T1 (Pre-Mortem) | All seeded flaws in scope | 0 | Multi-horizon failures (day-1 vs 6-month) | Certainty framing unlocks failure modes hedged language suppresses |
| T2 (Socratic) | All reasoning flaws | 0 | Why-chain collapses, fallacy identification | Only technique that attacks reasoning quality directly |
| T3 (Murder Board) | All thesis-level weaknesses | 0 | Concentrated kill arguments with self-assessment | Single devastating argument format is uniquely persuasive |
| T4 (ACH-lite) | All weak decision points | 0 | Viable alternatives with diagnostic evidence check | Only technique that provides concrete alternatives |
| T5 (Backcasting) | All causal chain breaks | 0 | Precondition gaps working backward from goals | Catches gaps that forward analysis misses |
| T6 (Consider-the-Opposite) | N/A (debiasing technique) | 0 | False negative prevention | Empirically strongest cognitive debiasing technique |
| T7 (Verdict Challenge) | N/A (calibration technique) | 0 | Verdict stress-testing | Prevents leniency drift; handles REJECT ceiling gracefully |

### Stage 4 Interaction Analysis Results

| Analysis | Result | Action Required |
|----------|--------|-----------------|
| T1 vs T5 redundancy | PASS (~20%) | None |
| T2 vs T4 redundancy | PASS (~14%) | None |
| T3 vs Skeptic redundancy | BORDERLINE (~35%) | §2 modifications |
| Escalation cascade | PASS | None |
| Token budget | PASS | None |
| False positive rate | PASS (0%) | None |
| Ordering sensitivity | SKIPPED | None |
