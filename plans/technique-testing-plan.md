# Testing Plan: 7 New Critique Techniques for Harsh-Critic Plan Reviews

## Overview

This plan tests 7 new techniques added to the harsh-critic plan review protocol. The techniques were selected from `research/critique-techniques.md` and integrated into both `.claude/agents/harsh-critic.md` (agent prompt) and `.claude/skills/harsh-critic/SKILL.md` (skill prompt / `Thorough_Review_Protocol` template).

### Techniques Under Test

| ID | Technique | Location in Protocol | What It Does |
|----|-----------|---------------------|--------------|
| T1 | Strengthened Pre-Mortem | Step 2 | Certainty framing ("crystal ball shows fiasco"), black swan prompt, 3 time horizons (day 1 / 1 month / 6 months) |
| T2 | Socratic Deconstruction | Step 7 | 3-level recursive why-chains on key decisions + logical fallacy scan |
| T3 | Murder Board | Step 8 | Thesis-level attack attempting to kill the entire proposal |
| T4 | Competing Alternatives (ACH-lite) | Step 9 | Identify 1-2 strongest alternatives, check if plan evidence rules them out |
| T5 | Backcasting | Step 10 | Backward pass from stated goals verifying causal chain completeness |
| T6 | Consider-the-Opposite | Phase 4.5 Part B | False negative check: for clean sections, explicitly ask what could be wrong |
| T7 | Verdict Challenge | Phase 5 | After verdict, argue it is too lenient; escalate if compelling |

### Baseline Techniques (Unchanged, Not Under Test)

These form the control baseline. They should continue working as before:

- Key Assumptions Extraction (Step 1)
- Dependency Audit (Step 3)
- Ambiguity Scan (Step 4)
- Feasibility Check (Step 5)
- Rollback Analysis (Step 6)
- Multi-perspective review (Phase 3: executor/stakeholder/skeptic)
- Gap Analysis (Phase 4)
- Self-Audit Part A — false positive check (Phase 4.5 Part A)
- Realist Check (Phase 4.75)
- Adaptive Harshness Escalation

---

## Prerequisites

### Test Fixtures

No benchmark fixtures currently exist (`benchmarks/harsh-critic/` directory is absent). Before testing begins, create the following fixture set.

#### Fixture Directory Structure

```
benchmarks/harsh-critic/
  fixtures/
    plan-auth-migration.md          # Complex plan with known flaws
    plan-api-redesign.md            # Plan with subtle logical gaps
    plan-data-pipeline.md           # Plan with hidden dependency issues
    plan-clean-baseline.md          # Intentionally solid plan (few/no real flaws)
    plan-weak-justification.md      # Plan with poorly justified decisions
  expected/
    plan-auth-migration.json        # Expected findings and verdicts
    plan-api-redesign.json          # Expected findings and verdicts
    plan-data-pipeline.json         # Expected findings and verdicts
    plan-clean-baseline.json        # Expected findings and verdicts
    plan-weak-justification.json    # Expected findings and verdicts
  results/
    (populated by test runs)
```

#### Fixture Design Requirements

Each fixture must be a realistic plan document (300-800 words) that contains:

1. **Seeded known issues** — specific, documented flaws that a technique should find. Record these in the corresponding `expected/*.json` file.
2. **Clean sections** — areas with no real flaws, to test false positive rates and T6 (Consider-the-Opposite).
3. **Stated goals / success criteria** — required for T5 (Backcasting) to have something to trace backward from.
4. **Key decisions with rationale** — required for T2 (Socratic Deconstruction) and T4 (Competing Alternatives) to have material to interrogate.
5. **A core thesis** — required for T3 (Murder Board) to have something to attack.

#### Specific Fixture Purposes

| Fixture | Primary Testing Purpose | Seeded Flaws |
|---------|------------------------|--------------|
| `plan-auth-migration` | T1 (Pre-Mortem), T5 (Backcasting) | Missing rollback for active sessions, no day-1 failure handling for token refresh, 6-month scaling gap, causal chain break between step 4 and step 5 |
| `plan-api-redesign` | T2 (Socratic), T4 (ACH-lite) | Decision to use GraphQL justified by appeal to authority only, obvious REST alternative not addressed, false dichotomy (only GraphQL vs current API considered) |
| `plan-data-pipeline` | T3 (Murder Board), T5 (Backcasting) | Core thesis is fragile (entire plan depends on a single vendor SLA), backward trace reveals step 3 output does not match step 4 input, hidden precondition never established |
| `plan-clean-baseline` | T6 (Consider-the-Opposite), T7 (Verdict Challenge) | Minimal real flaws — tests whether T6 surfaces anything from clean sections and whether T7 avoids over-escalation on solid work |
| `plan-weak-justification` | T2 (Socratic), T3 (Murder Board), T7 (Verdict Challenge) | Multiple decisions with shallow reasoning (collapses at why-chain level 2), no tradeoff analysis, verdict should be harsh and T7 should confirm or escalate |

#### Expected Output Format (`expected/*.json`)

```json
{
  "fixture": "plan-auth-migration",
  "seeded_flaws": [
    {
      "id": "SF-1",
      "description": "Missing rollback for active sessions during migration",
      "target_technique": "T1",
      "expected_severity": "CRITICAL",
      "expected_section": "Critical Findings"
    }
  ],
  "expected_verdict_range": ["REVISE", "REJECT"],
  "expected_techniques_activated": ["T1", "T5"],
  "false_positive_traps": [
    {
      "description": "Section 3 (monitoring setup) is actually solid",
      "trap_for": "T6",
      "expected_outcome": "No spurious findings generated for this section"
    }
  ]
}
```

### Prompt Templates

All tests use a common invocation pattern. The tester crafts a prompt and sends it to the harsh-critic agent or skill. The prompt structure is:

```
Review this plan: [fixture content or path]
```

For isolated technique tests, the prompt is modified to instruct the model to run ONLY the technique under test (see Stage 1 details).

---

## Stage 1: Individual Technique Testing

**Goal**: Verify each technique works correctly in isolation — it produces the expected output type, finds seeded flaws it should find, and does not produce nonsensical output.

**Method**: For each technique, craft a prompt that asks the model to apply ONLY that technique to a fixture. This isolates the technique from the rest of the protocol.

### Test 1.1: Strengthened Pre-Mortem (T1)

**Fixture**: `plan-auth-migration.md`

**Prompt template**:
```
You are reviewing a plan. Apply ONLY the following technique — do not run any other
review steps.

TECHNIQUE — Strengthened Pre-Mortem:
Use certainty framing: "An infallible crystal ball shows this plan was executed exactly
as written and was a complete fiasco." Generate 5-7 specific, concrete failure scenarios.
Then:
a) Black swan prompt: "Now generate 1-2 failure scenarios that would make everyone say
   'we never could have predicted that.'"
b) Multi-horizon: Run the pre-mortem at three time horizons — immediate failure (day 1),
   medium-term (1 month in), and long-term (6 months out).
c) Check: does the plan address each failure scenario? If not, note it as a finding.

Plan to review:
[INSERT plan-auth-migration.md CONTENT]
```

**Success criteria**:
- [ ] Output contains exactly the certainty framing language (crystal ball / fiasco) — not hedged alternatives
- [ ] 5-7 failure scenarios generated (count them)
- [ ] At least 1-2 explicitly labeled black swan scenarios present
- [ ] Failure scenarios are organized across 3 time horizons (day 1, 1 month, 6 months)
- [ ] Each horizon produces at least 1 distinct failure (not the same failure repeated at different horizons)
- [ ] Seeded flaw SF-1 (missing session rollback) is surfaced, likely at the day-1 horizon
- [ ] Seeded flaw for 6-month scaling gap is surfaced at the 6-month horizon
- [ ] Each failure scenario is checked against the plan for whether it is addressed
- [ ] Unaddressed scenarios are flagged as findings

**Failure indicators**:
- Uses hedged language ("imagine it might fail") instead of certainty framing
- Fewer than 5 failure scenarios
- No black swan section or black swans are actually obvious/predictable failures
- All failures clustered in one time horizon
- Misses both seeded flaws

### Test 1.2: Socratic Deconstruction (T2)

**Fixture**: `plan-api-redesign.md`

**Prompt template**:
```
You are reviewing a plan. Apply ONLY the following technique — do not run any other
review steps.

TECHNIQUE — Socratic Deconstruction:
For each major decision or approach choice in the plan:
a) Socratic why-chain: Ask "why this approach?" then "why is that reason sufficient?"
   then "why should we believe that premise?" Continue for 3 levels.
b) Logical fallacy scan: Check for false dichotomy, appeal to authority without evidence,
   begging the question, and survivorship bias in cited precedents.

Report each decision analyzed, the full why-chain, where the chain terminates (supported
axiom, unsupported assertion, or circular logic), and any fallacies detected.

Plan to review:
[INSERT plan-api-redesign.md CONTENT]
```

**Success criteria**:
- [ ] Each major decision in the plan has a visible 3-level why-chain
- [ ] Why-chains are genuinely recursive (each level questions the previous answer, not just rephrasing)
- [ ] At least one chain terminates in an unsupported assertion and this is flagged
- [ ] Seeded flaw: appeal to authority for GraphQL decision is detected in fallacy scan
- [ ] Seeded flaw: false dichotomy (only 2 options) is detected
- [ ] Fallacy scan explicitly checks for the 4 listed fallacy types (not a generic "reasoning seems weak")
- [ ] Output clearly labels where each chain terminates and why

**Failure indicators**:
- Why-chains are only 1-2 levels deep
- Chain levels just rephrase the same question
- Fallacy scan is generic ("the reasoning could be stronger") rather than identifying specific fallacy types
- Misses the seeded appeal-to-authority fallacy

### Test 1.3: Murder Board (T3)

**Fixture**: `plan-data-pipeline.md`

**Prompt template**:
```
You are reviewing a plan. Apply ONLY the following technique — do not run any other
review steps.

TECHNIQUE — Murder Board:
Step back and attack the plan's core thesis. The murder board doesn't poke holes in
individual steps — it tries to kill the entire proposal on its merits.

Construct a complete 2-3 sentence argument for why this plan should be rejected outright.
If you can build a compelling case, the plan has a structural problem. If you genuinely
cannot construct a killing argument, note that — it's a signal of strength.

Plan to review:
[INSERT plan-data-pipeline.md CONTENT]
```

**Success criteria**:
- [ ] Output contains a clear, complete 2-3 sentence "killing argument" (not a list of small issues)
- [ ] The argument attacks the CORE THESIS, not peripheral steps
- [ ] Seeded flaw: fragile single-vendor-SLA dependency is identified as the structural weakness
- [ ] The argument is specific to this plan (not generic boilerplate like "insufficient detail")
- [ ] If the argument is compelling, the output says so and identifies it as a structural problem
- [ ] The murder board focuses on thesis-level rejection, not step-level nitpicking

**Failure indicators**:
- Output is a bulleted list of step-level issues (that is regular review, not murder board)
- The "killing argument" is generic and could apply to any plan
- Misses the single-vendor-SLA structural weakness
- Argument is more than 5 sentences (not concise enough to be a thesis-level kill)
- Model refuses to construct the argument or hedges excessively

### Test 1.4: Competing Alternatives / ACH-lite (T4)

**Fixture**: `plan-api-redesign.md`

**Prompt template**:
```
You are reviewing a plan. Apply ONLY the following technique — do not run any other
review steps.

TECHNIQUE — Competing Alternatives (ACH-lite):
For the plan's central approach, identify the 1-2 strongest alternative approaches that
could solve the same problem. Ask: "Does the plan's evidence and reasoning actually rule
out these alternatives, or would they work equally well or better?"

If the plan doesn't clearly beat the alternatives, its approach selection is a finding.

Key insight: evidence consistent with all approaches is non-diagnostic and doesn't
support the chosen plan.

Plan to review:
[INSERT plan-api-redesign.md CONTENT]
```

**Success criteria**:
- [ ] 1-2 specific, credible alternative approaches identified (not strawmen)
- [ ] Seeded flaw: REST API alternative is identified as a strong competing approach
- [ ] Each alternative is evaluated against the plan's evidence
- [ ] Non-diagnostic evidence is identified (evidence that supports both the plan and alternatives equally)
- [ ] A clear judgment is made: does the plan's evidence rule out the alternatives or not?
- [ ] If alternatives are not ruled out, this is flagged as a finding about approach selection

**Failure indicators**:
- Alternatives are weak strawmen (easy to dismiss)
- No evaluation of evidence diagnosticity
- Conclusion is vague ("alternatives exist but the plan is probably fine")
- Misses the obvious REST alternative

### Test 1.5: Backcasting (T5)

**Fixture**: `plan-data-pipeline.md`

**Prompt template**:
```
You are reviewing a plan. Apply ONLY the following technique — do not run any other
review steps.

TECHNIQUE — Backcasting:
Work backward from the plan's stated goal or success criteria. For each step, starting
from the end: "For this step's output to be correct, what must the previous step have
produced?" Trace the full chain back to step 1.

Flag any link where the required output doesn't match what the step actually produces,
or where a precondition is assumed but never established.

Plan to review:
[INSERT plan-data-pipeline.md CONTENT]
```

**Success criteria**:
- [ ] Output starts from the plan's stated goal and works BACKWARD (not forward)
- [ ] Each step in the backward chain explicitly states what the previous step must produce
- [ ] Seeded flaw: causal chain break between step 3 output and step 4 input is detected
- [ ] Seeded flaw: hidden precondition that is never established is identified
- [ ] Every link in the chain is evaluated (not just 2-3 spot checks)
- [ ] Mismatches are clearly flagged with specific step references

**Failure indicators**:
- Analysis runs forward instead of backward
- Only checks 2-3 links instead of the full chain
- Misses the step 3/4 output mismatch
- Generic "the plan seems to have gaps" without specific step references

### Test 1.6: Consider-the-Opposite (T6)

**Fixture**: `plan-clean-baseline.md`

**Prompt template**:
```
You are reviewing a plan. You have already completed a full review and found findings in
sections 1, 3, and 5. Sections 2, 4, and 6 had NO findings.

Apply ONLY the following technique to the sections with no findings:

TECHNIQUE — Consider-the-Opposite (false negative check):
For each section where you generated NO findings, explicitly ask:
1. "What reasons exist to think this section has a hidden flaw I missed?"
2. "What would have to go wrong here for the plan to fail?"
If this surfaces a credible concern, add it.

Also check: does the plan itself demonstrate awareness of alternatives and tradeoffs at
key decision points? Absence of tradeoff analysis is itself a finding.

Sections with no findings: 2, 4, 6.

Plan to review:
[INSERT plan-clean-baseline.md CONTENT]
```

**Success criteria**:
- [ ] Each clean section (2, 4, 6) is explicitly examined with both questions
- [ ] The technique does NOT manufacture findings for genuinely solid sections
- [ ] If a credible concern is surfaced, it is added with appropriate confidence level
- [ ] Tradeoff analysis presence/absence is checked at decision points
- [ ] If a section lacks tradeoff discussion, that absence is flagged
- [ ] Output distinguishes between "I looked and found nothing credible" vs "I found something worth noting"

**Failure indicators**:
- Skips some clean sections
- Manufactures spurious findings for genuinely solid sections (false positive inflation)
- Does not actually ask the two specified questions — just gives a generic "looks fine"
- Misses absence of tradeoff analysis at decision points

### Test 1.7: Verdict Challenge (T7)

**Fixture**: `plan-clean-baseline.md` (test with ACCEPT verdict) AND `plan-weak-justification.md` (test with REVISE verdict)

**Prompt template (test A — should NOT escalate)**:
```
You have completed a review of the plan below and reached this verdict:

VERDICT: ACCEPT-WITH-RESERVATIONS
[Provide a brief mock verdict justification with only minor findings]

Now apply ONLY the following technique:

TECHNIQUE — Verdict Challenge:
Construct the strongest argument that your verdict is too lenient. "What's the best case
that this should be one tier harsher?" If the challenge is compelling, escalate the verdict.

Plan reviewed:
[INSERT plan-clean-baseline.md CONTENT]
```

**Prompt template (test B — should escalate)**:
```
You have completed a review of the plan below and reached this verdict:

VERDICT: REVISE
[Provide a mock verdict justification with several major findings including structural
weakness and missing justifications]

Now apply ONLY the following technique:

TECHNIQUE — Verdict Challenge:
Construct the strongest argument that your verdict is too lenient. "What's the best case
that this should be one tier harsher?" If the challenge is compelling, escalate the verdict.

Plan reviewed:
[INSERT plan-weak-justification.md CONTENT]
```

**Success criteria (test A)**:
- [ ] A leniency argument is constructed (the technique runs even on solid work)
- [ ] The argument is evaluated honestly
- [ ] Verdict is NOT escalated for the clean baseline (the argument is not compelling)
- [ ] Output explicitly states the challenge was not compelling enough to escalate

**Success criteria (test B)**:
- [ ] A leniency argument is constructed
- [ ] The argument references the structural weakness and missing justifications
- [ ] Verdict IS escalated from REVISE to REJECT (or the argument is acknowledged as compelling)
- [ ] Escalation rationale is specific, not generic

**Failure indicators**:
- Always escalates regardless of plan quality (rubber-stamp harshness)
- Never escalates regardless of plan quality (rubber-stamp leniency)
- Challenge argument is generic boilerplate rather than plan-specific

---

## Stage 2: Group / Combination Testing

**Goal**: Test logical groupings of techniques together to verify they compose correctly and produce coherent output when combined.

### Group Definitions

| Group | Techniques | Rationale |
|-------|-----------|-----------|
| G1: Deep Investigation | T1 + T2 + T5 | These run during Phase 2 investigation — pre-mortem, Socratic questioning, and backcasting all examine the plan from different angles |
| G2: Thesis Attack | T3 + T4 | Murder board and competing alternatives both attack the plan's core approach — they should reinforce each other |
| G3: Calibration Stack | T6 + T7 | Consider-the-opposite and verdict challenge both run late in the pipeline as calibration checks |
| G4: Decision Interrogation | T2 + T4 | Socratic deconstruction and competing alternatives both question decision-making quality |

### Test 2.1: Deep Investigation Group (G1: T1 + T2 + T5)

**Fixture**: `plan-auth-migration.md`

**Prompt**: Instruct the model to run Steps 2, 7, and 10 of the plan investigation protocol (strengthened pre-mortem, Socratic deconstruction, backcasting) on the fixture. Skip all other steps.

**Success criteria**:
- [ ] All three techniques produce distinct output sections (not merged into one)
- [ ] Pre-mortem findings and backcasting findings do not simply duplicate each other
- [ ] Socratic why-chains reference plan decisions, not pre-mortem failure scenarios
- [ ] Where techniques find the same underlying issue from different angles, this is noted as convergent evidence (strengthens the finding, does not create duplicates)
- [ ] Combined output covers more ground than any single technique alone
- [ ] No technique's output is truncated or abbreviated due to the others consuming token budget

### Test 2.2: Thesis Attack Group (G2: T3 + T4)

**Fixture**: `plan-data-pipeline.md`

**Prompt**: Instruct the model to run Steps 8 and 9 (murder board + competing alternatives) on the fixture. Skip all other steps.

**Success criteria**:
- [ ] Murder board produces a thesis-level kill argument
- [ ] Competing alternatives identifies specific alternative approaches
- [ ] The murder board argument and the alternative approaches are coherent — if the murder board says "this plan fails because of X," and competing alternatives says "alternative Y avoids X," those reinforce rather than contradict
- [ ] Neither technique overshadows the other (both get adequate treatment)
- [ ] Combined output is more damning than either alone

### Test 2.3: Calibration Stack (G3: T6 + T7)

**Fixture**: `plan-clean-baseline.md`

**Prompt**: Provide a mock completed review with verdict ACCEPT-WITH-RESERVATIONS. Then instruct the model to run Phase 4.5 Part B (consider-the-opposite) followed by Phase 5 verdict challenge.

**Success criteria**:
- [ ] Consider-the-opposite runs BEFORE verdict challenge (correct ordering)
- [ ] If T6 surfaces a new finding, T7's verdict challenge accounts for it
- [ ] If T6 surfaces nothing, T7 still runs its own independent challenge
- [ ] On the clean baseline, the final verdict is not over-escalated by the combination
- [ ] The two techniques do not create a runaway escalation loop (T6 finds something marginal, T7 uses it to escalate, which would make T6 find more, etc.)

### Test 2.4: Decision Interrogation (G4: T2 + T4)

**Fixture**: `plan-api-redesign.md`

**Prompt**: Instruct the model to run Steps 7 and 9 (Socratic deconstruction + competing alternatives) on the fixture.

**Success criteria**:
- [ ] Socratic why-chains and alternative comparison address the same decisions but from different angles
- [ ] If a why-chain reveals an unsupported assertion AND competing alternatives shows a viable alternative at that decision point, these are connected in the output
- [ ] Neither technique simply repeats the other's findings in different words
- [ ] Combined output provides a stronger case than either alone for the seeded GraphQL decision flaw

---

## Stage 3: Full Integration Testing

**Goal**: Run the complete harsh-critic protocol (all techniques, old and new) against each fixture and evaluate the end-to-end output.

### Method

For each of the 5 fixtures, invoke the full harsh-critic agent with the standard prompt:

```
Review this plan: [fixture content]
```

No technique isolation — the model runs the entire `Investigation_Protocol` as written in `.claude/agents/harsh-critic.md`.

### Test 3.1-3.5: Full Protocol on Each Fixture

Run on all 5 fixtures. For each, evaluate:

**Output completeness** (checklist):
- [ ] Pre-commitment predictions present
- [ ] Key Assumptions Extraction present (Step 1 — baseline)
- [ ] Strengthened Pre-Mortem present with certainty framing, black swans, 3 horizons (T1)
- [ ] Dependency Audit present (Step 3 — baseline)
- [ ] Ambiguity Scan present (Step 4 — baseline)
- [ ] Feasibility Check present (Step 5 — baseline)
- [ ] Rollback Analysis present (Step 6 — baseline)
- [ ] Socratic Deconstruction present with why-chains and fallacy scan (T2)
- [ ] Murder Board present with thesis-level argument (T3)
- [ ] Competing Alternatives present with 1-2 alternatives evaluated (T4)
- [ ] Backcasting present with backward chain from goals (T5)
- [ ] Multi-perspective review present (executor/stakeholder/skeptic — baseline)
- [ ] Gap Analysis present (baseline)
- [ ] Self-Audit Part A present (baseline)
- [ ] Consider-the-Opposite present for clean sections (T6)
- [ ] Realist Check present (baseline)
- [ ] Verdict with challenge applied (T7)
- [ ] Output format matches the FORMAT CONTRACT in the protocol

**Finding quality**:
- [ ] All seeded flaws for this fixture are detected (true positive rate)
- [ ] False positives are reasonable (not manufacturing outrage)
- [ ] Severity ratings are calibrated (CRITICAL/MAJOR/MINOR used appropriately)
- [ ] Evidence is present for all CRITICAL/MAJOR findings
- [ ] Verdict is within the expected range for this fixture

**Token budget**:
- [ ] No technique is truncated or omitted due to output length
- [ ] The review completes without hitting token limits
- [ ] If any technique is abbreviated, note which one and how much was lost

### Specific Fixture Expectations

| Fixture | Expected Verdict | Key Findings That Must Appear | Techniques Most Relevant |
|---------|-----------------|------------------------------|-------------------------|
| `plan-auth-migration` | REVISE or REJECT | Session rollback gap, token refresh day-1 failure, 6-month scaling gap, causal chain break | T1, T5 |
| `plan-api-redesign` | REVISE | Appeal to authority fallacy, false dichotomy, REST alternative not ruled out | T2, T4 |
| `plan-data-pipeline` | REJECT | Fragile vendor SLA thesis weakness, step 3/4 output mismatch, hidden precondition | T3, T5 |
| `plan-clean-baseline` | ACCEPT or AWR | Few/no critical findings; T6 should not manufacture issues; T7 should not over-escalate | T6, T7 |
| `plan-weak-justification` | REJECT | Shallow reasoning at why-chain level 2, no tradeoff analysis, compelling murder board argument | T2, T3, T7 |

---

## Stage 4: Interaction Analysis

**Goal**: Identify unexpected interactions, redundancies, conflicts, or emergent behaviors when all 7 techniques run together.

### Method

Using the Stage 3 results, perform a structured analysis across all 5 fixtures.

### Analysis 4.1: Redundancy Check

For each fixture's full integration output, compare findings across techniques:

- **Question**: Do T1 (Pre-Mortem) and T5 (Backcasting) produce duplicate findings? They both examine causal chains but from opposite directions. Quantify overlap.
- **Question**: Do T2 (Socratic) and T4 (ACH-lite) produce duplicate findings about decision quality? They both interrogate decisions but through different lenses.
- **Question**: Do T3 (Murder Board) findings overlap with the Skeptic perspective (baseline Phase 3)? The murder board attacks the thesis; the skeptic asks "will this fail?" — these could converge.

**Metric**: For each technique pair, count findings that are substantively the same issue expressed differently. Report overlap percentage.

**Acceptable**: Up to 20% overlap (convergent evidence is useful). Above 30% suggests redundancy that could be consolidated.

### Analysis 4.2: Escalation Cascade Check

- **Question**: Does the combination of T3 (Murder Board) + T7 (Verdict Challenge) create excessive escalation? The murder board may trigger ADVERSARIAL mode escalation, which makes the entire review harsher, and then the verdict challenge pushes the verdict even further.
- **Test**: Compare the `plan-clean-baseline` verdict in Stage 3 against the expected ACCEPT/AWR range. If the verdict is REVISE or REJECT on the clean baseline, the escalation cascade is too aggressive.
- **Test**: Compare `plan-auth-migration` verdict. If it was already REJECT before the verdict challenge, does T7 try to escalate beyond REJECT (which is impossible)? Does it handle the ceiling gracefully?

**Metric**: Count how many fixtures received a verdict harsher than the expected range. If more than 1 out of 5, investigate the escalation chain.

### Analysis 4.3: Token Budget Pressure

- **Question**: Do all 17 techniques (10 baseline + 7 new) fit within a single Claude response without truncation?
- **Method**: For each Stage 3 run, check whether the output appears complete or if later sections (especially T6 and T7, which run last) are abbreviated.
- **Metric**: Record which techniques, if any, received less than their minimum viable output. If any new technique consistently gets truncated, it may need to be made more concise or the protocol may need structural changes (e.g., splitting into two passes).

### Analysis 4.4: False Positive Rate Impact

- **Question**: Do the 7 new techniques increase the false positive rate beyond acceptable levels?
- **Method**: For the `plan-clean-baseline` fixture, count findings that are not supported by actual flaws in the fixture. Compare the false positive count from Stage 3 (full protocol) against what the baseline techniques alone would produce (use Stage 6 validation results).
- **Acceptable**: Up to 15% increase in false positive rate relative to baseline alone. Above 25% suggests one or more techniques need tighter precision gating.

### Analysis 4.5: Ordering Sensitivity

- **Question**: Does the ordering of techniques matter? T1 runs early (Step 2), T7 runs last (Phase 5). If findings from T1 influence the model's approach to later techniques, this is an ordering effect.
- **Method**: For one fixture (`plan-auth-migration`), run a variant where the prompt reorders the techniques (e.g., backcasting before pre-mortem). Compare findings.
- **Note**: This is a secondary analysis — only run if Stages 1-3 reveal concerning patterns.

---

## Stage 5: Propose Changes

**Goal**: Based on all test results from Stages 1-4, propose specific changes to the technique set.

### Decision Framework

For each of the 7 techniques, assign one of:

| Decision | Criteria |
|----------|----------|
| **KEEP** | Technique works as designed, finds seeded flaws, acceptable FP rate, no problematic interactions |
| **MODIFY** | Technique works but needs adjustment — prompt wording, scope reduction, or tighter precision gating |
| **MERGE** | Technique overlaps >30% with another — combine into a single step |
| **REMOVE** | Technique does not produce incremental value, or its FP rate outweighs its TP rate |
| **ADD** | Testing revealed a gap that none of the 17 techniques covers — propose a new one |

### Deliverable

Produce a document (`plans/technique-changes-proposal.md`) containing:

1. **Summary table**: Each technique, decision (KEEP/MODIFY/MERGE/REMOVE/ADD), rationale
2. **Specific modifications**: For any MODIFY decisions, exact prompt wording changes
3. **Merge specifications**: For any MERGE decisions, the combined technique prompt
4. **New technique proposals**: For any ADD decisions, full technique specification
5. **Updated protocol**: The full revised plan investigation protocol incorporating all changes
6. **Expected impact**: Predicted effect on true positive rate, false positive rate, and token budget

---

## Stage 6: Validation Round 1 — OLD Harsh-Critic vs Proposed Changes

**Goal**: Run the OLD harsh-critic (the version without the 7 new techniques) against the proposed changes document from Stage 5. This tests whether the proposal itself is robust.

### Method

1. Switch to the `main` branch which contains the OLD protocol (before the 7 new techniques were added):
   ```
   git stash  # save any uncommitted work
   git checkout main
   ```
   The old protocol includes only baseline techniques: Key Assumptions Extraction, original Pre-Mortem (no certainty framing/black swans/multi-horizon), Dependency Audit, Ambiguity Scan, Feasibility Check, Rollback Analysis, original Devil's Advocate (no Socratic/fallacy scan), Multi-perspective review, Gap Analysis, Self-Audit Part A only (no Consider-the-Opposite), Realist Check, Adaptive Harshness Escalation, Synthesis without verdict challenge.

2. Run the old-protocol review against `plans/technique-changes-proposal.md`:
   ```
   /harsh-critic plans/technique-changes-proposal.md
   ```

3. Save the full output to `benchmarks/harsh-critic/results/stage6-old-critic-review.md`.

4. Return to the feature branch:
   ```
   git checkout claude/research-critique-techniques-dt5ow
   git stash pop  # restore uncommitted work if any
   ```

### Success Criteria

- [ ] The old protocol produces a coherent review (it still works without the new techniques)
- [ ] The review identifies any weaknesses in the proposed changes
- [ ] Record the verdict and all findings for comparison in Stage 7

---

## Stage 7: Validation Round 2 — NEW Harsh-Critic vs Same Proposal

**Goal**: Run the NEW harsh-critic (with the proposed changes from Stage 5) against the same proposal document. Compare with Stage 6 results.

### Method

1. Ensure you are on the feature branch: `git checkout claude/research-critique-techniques-dt5ow`
2. If Stage 5 proposed modifications to any techniques, apply them to the protocol files (`.claude/agents/harsh-critic.md` and `.claude/skills/harsh-critic/SKILL.md`) before running. Do NOT commit yet — these are provisional changes for testing.
3. Run the new-protocol review against `plans/technique-changes-proposal.md`:
   ```
   /harsh-critic plans/technique-changes-proposal.md
   ```
4. Save the full output to `benchmarks/harsh-critic/results/stage7-new-critic-review.md`.

### Comparison Analysis

| Metric | OLD (Stage 6) | NEW (Stage 7) | Delta | Interpretation |
|--------|--------------|--------------|-------|----------------|
| Verdict | | | | NEW should be same or harsher (more thorough) |
| Total findings count | | | | NEW should find more, but not excessively more |
| Critical findings | | | | Should be similar (same plan) |
| Major findings | | | | NEW may find more due to deeper investigation |
| What's Missing items | | | | NEW should find more gaps (T6 effect) |
| False positives (estimated) | | | | NEW should not have dramatically more |
| Evidence rate | | | | Should be similar or better |
| New technique contributions | N/A | Count findings attributable to T1-T7 | | Shows incremental value of new techniques |

### Success Criteria

- [ ] NEW protocol finds strictly more genuine issues than OLD (or equal, if the proposal is solid)
- [ ] NEW protocol does not produce dramatically more false positives than OLD
- [ ] At least 2-3 findings in the NEW output are clearly attributable to the new techniques (T1-T7)
- [ ] The NEW review's additional findings are genuinely useful, not noise
- [ ] If the NEW protocol's verdict is harsher, the harsher verdict is justified by the additional findings

### Final Deliverable

Produce a comparison report (`plans/technique-validation-results.md`) with:
1. Side-by-side OLD vs NEW findings
2. Findings unique to NEW (attributed to specific new techniques)
3. Any regressions (things OLD caught that NEW missed)
4. Final recommendation: ship the proposed changes, iterate further, or revert specific techniques
5. Updated benchmark expectations for the fixture set

---

## Execution Notes

### Session Planning

This testing plan is designed to be executed across multiple Claude Code sessions. Recommended session breakdown:

| Session | Work | Estimated Scope |
|---------|------|----------------|
| 1 | Create all 5 fixture files and expected output files | Fixture authoring |
| 2 | Stage 1 tests 1.1-1.4 (T1-T4) | 4 isolated technique tests |
| 3 | Stage 1 tests 1.5-1.7 (T5-T7) | 3 isolated technique tests |
| 4 | Stage 2 all group tests (2.1-2.4) | 4 combination tests |
| 5 | Stage 3 full integration (3.1-3.5) | 5 full protocol runs |
| 6 | Stage 4 interaction analysis | Analysis of Stage 3 results |
| 7 | Stage 5 propose changes | Write proposal document |
| 8 | Stage 6 + 7 validation rounds | 2 full protocol runs + comparison |

### Recording Results

For each test, record:
1. The exact prompt sent (save to `benchmarks/harsh-critic/prompts/`)
2. The full model output (save to `benchmarks/harsh-critic/results/`)
3. The checklist evaluation (pass/fail for each success criterion)
4. Notes on unexpected behavior

### What NOT to Do

- Do not execute any tests during plan creation (this document is the plan only)
- Do not modify the agent or skill prompts until Stage 5 proposes changes
- Do not skip Stage 1 isolation testing — combination tests are meaningless if individual techniques do not work
- Do not skip the clean baseline fixture — it is the primary false positive control
- Do not evaluate Stage 3 results without completing Stage 1 and 2 first (you need the isolated baselines to interpret integration results)
