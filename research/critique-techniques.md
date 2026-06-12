# Research: Techniques for Harsher Plan Critiques

Research compiled 2026-03-05 to identify techniques from intelligence analysis, military planning, engineering, cognitive science, and AI research that could make harsh-critic's plan reviews more punishing and thorough.

## What We Already Have

The current harsh-critic plan protocol includes:
- Pre-mortem analysis (5-7 failure scenarios)
- Key assumptions extraction (VERIFIED / REASONABLE / FRAGILE)
- Dependency audit
- Ambiguity scan
- Feasibility check
- Rollback analysis
- Devil's advocate for key decisions
- Multi-perspective review (executor / stakeholder / skeptic)
- Gap analysis ("What's Missing")
- Metacognitive self-audit + Realist Check
- Adaptive harshness escalation (THOROUGH → ADVERSARIAL)

This is already strong. The question is: **what's missing from _our_ "What's Missing"?**

---

## Candidate Techniques (Not Yet Implemented)

### 1. Murder Board Protocol

**Source**: U.S. military (Pentagon), NASA, corporate strategy

A murder board is a committee whose explicit job is to **kill the proposal on technical merit**. The key difference from our current approach: the murder board doesn't just find flaws — it actively tries to destroy the plan's core thesis. Holding back even the least suspicion is not tolerated.

**What it adds beyond current protocol**:
- **Role-played hostile questioning**: Instead of reviewing from friendly perspectives (executor, stakeholder, skeptic), add a perspective that is actively trying to make the plan fail. The skeptic asks "will this work?" — the murder board member asks "how do I make this not work?"
- **Cross-functional attack panel**: Each "panelist" attacks from a different domain (technical feasibility, resource constraints, political/organizational blockers, timeline pressure, competitive dynamics)
- **Iterative stress**: The board doesn't stop at the first round. After the author "fixes" issues, the board goes again. The current protocol is single-pass.

**Potential implementation**: Add a Phase 2.5 "Murder Board" step after the plan-specific investigation. Adopt 2-3 hostile personas who each try to construct a complete argument for why the plan should be killed. This is harsher than devil's advocate because DA argues against individual decisions — the murder board argues against the entire proposal.

**References**:
- [Murder Board - Wikipedia](https://en.wikipedia.org/wiki/Murder_board)
- [Murder Board - Wikiversity Thinking Tools](https://en.wikiversity.org/wiki/Thinking_Tools/Murder_board)
- [AI Murder Board - PromptOwl](https://promptowl.ai/blog/fail-faster-succeed-sooner-how-we-use-an-ai-murder-board-to-make-our-ideas-battle-tested/)

---

### 2. Analysis of Competing Hypotheses (ACH)

**Source**: CIA (Richards Heuer), intelligence analysis tradecraft

ACH requires generating multiple competing hypotheses and then systematically evaluating evidence **against** each one, focusing on **refutation** rather than confirmation. The key insight: humans naturally seek confirming evidence; ACH forces you to seek disconfirming evidence.

**What it adds beyond current protocol**:
- **Alternative plan generation**: For each plan under review, generate 2-3 alternative approaches that could solve the same problem differently. Then evaluate: what evidence would favor the alternative over the submitted plan? This directly challenges the assumption that the chosen approach is correct.
- **Refutation-first evaluation**: Instead of asking "does this evidence support the plan?" ask "does this evidence rule out alternative approaches?" If not, the plan's superiority is unproven.
- **Diagnosticity matrix**: Rate each piece of evidence by how well it discriminates between the submitted plan and alternatives. Evidence consistent with all approaches is non-diagnostic — it doesn't actually support the chosen plan.

**Potential implementation**: After Phase 2 plan investigation, generate 2-3 alternative approaches. For each major decision in the plan, construct the strongest competing alternative and evaluate whether the plan's evidence/reasoning actually rules it out. Any decision where the plan doesn't clearly beat the alternative becomes a finding.

**References**:
- [CIA Tradecraft Primer (PDF)](https://www.cia.gov/resources/csi/static/Tradecraft-Primer-apr09.pdf)
- [RAND Assessment of SATs (PDF)](https://www.rand.org/content/dam/rand/pubs/research_reports/RR1400/RR1408/RAND_RR1408.pdf)
- [Structured Analytic Techniques - Kraven Security](https://kravensecurity.com/structured-analytic-techniques/)

---

### 3. Failure Mode and Effects Analysis (FMEA)

**Source**: U.S. military (1940s), aerospace, automotive, software engineering

FMEA systematically enumerates **every possible failure mode** for each component/step, then scores each by Severity × Occurrence × Detectability = Risk Priority Number (RPN).

**What it adds beyond current protocol**:
- **Exhaustive enumeration**: Our pre-mortem generates 5-7 failure scenarios. FMEA demands you enumerate failure modes for **every single step**, not just the plan as a whole. A 15-step plan might have 30-50 failure modes.
- **Detection scoring**: Our protocol asks "can this be detected in production?" but doesn't formalize it. FMEA's 1-10 detectability scale forces you to rate how likely each failure is to be caught before it causes damage.
- **Compound failure**: FMEA explicitly considers what happens when multiple steps fail simultaneously, not just individual step failures.
- **RPN prioritization**: Instead of subjective CRITICAL/MAJOR/MINOR, calculate a numeric priority that factors in how likely, how bad, and how hidden each failure would be.

**Potential implementation**: Add a structured FMEA pass to Phase 2 plan investigation. For each step: enumerate 2-3 failure modes, rate Severity (1-10), Occurrence likelihood (1-10), Detectability (1-10), compute RPN. Steps with RPN > threshold become findings. This is more systematic than the current pre-mortem.

**References**:
- [FMEA - ASQ](https://asq.org/quality-resources/fmea)
- [Software FMEA - Accendo Reliability](https://accendoreliability.com/understanding-software-fmea/)
- [FMEA in Product Development - PMI](https://www.pmi.org/learning/library/fmeas-product-development-process-4962)

---

### 4. Prospective Hindsight (Strengthened Pre-Mortem)

**Source**: Gary Klein (cognitive psychology), Veinott & Klein (2010 study with 178 participants)

Our pre-mortem is good but can be made harsher. Research by Veinott & Klein compared critique, pro/con analysis, cons-only analysis, and pre-mortem techniques. Pre-mortem was the only technique that reliably reduced overconfidence and — critically — **identified more black swan risks** than all other methods.

**What it adds beyond current protocol**:
- **Certainty framing**: The key is not "imagine it might fail" but "an infallible crystal ball shows the plan was a fiasco." The certainty framing unlocks failure modes that "might fail" framing doesn't surface.
- **Independent generation**: Each perspective should generate failures independently before comparing. Our current protocol doesn't enforce this — all perspectives might anchor on the same obvious failures.
- **Black swan focus**: After generating obvious failures, explicitly ask "what failure would nobody expect? What's the failure that would make everyone say 'we never could have predicted that'?" This is where the highest-value findings hide.
- **Temporal specificity**: "It failed after 1 week" surfaces different failures than "it failed after 6 months." Run the pre-mortem at multiple time horizons.

**Potential implementation**: Strengthen Phase 2 Step 2 (Pre-Mortem): enforce certainty framing ("the crystal ball shows"), add explicit black swan prompt, run at 3 time horizons (immediate, 1 month, 6 months), require each perspective to generate independently before synthesis.

**References**:
- [PreMortem effectiveness study (PDF)](https://www.researchgate.net/profile/Gary-Klein-3/publication/266485127_Evaluating_the_Effectiveness_of_the_PreMortem_Technique_on_Plan_Confidence/links/565512f708ae1ef929770299/Evaluating-the-Effectiveness-of-the-PreMortem-Technique-on-Plan-Confidence.pdf)
- [Pre-Mortem for Project Success - TechWell](https://www.techwell.com/techwell-insights/2014/04/playing-devil-s-advocate-use-premortems-your-project-s-success)

---

### 5. Socratic Deconstruction

**Source**: Classical philosophy, critical thinking pedagogy

Socratic questioning doesn't evaluate the plan — it forces the plan to **justify itself** at every level. Instead of finding flaws, you ask questions that reveal whether the plan can defend its own logic.

**What it adds beyond current protocol**:
- **Recursive "why" chains**: For each major decision, ask "why this approach?" then "why is that reason sufficient?" then "why should we believe that premise?" Continue until you hit an unsupported axiom or a circular argument. Most plans collapse within 3-4 levels.
- **Assumption surfacing through questioning**: Instead of extracting assumptions (our current approach), force assumptions to reveal themselves by asking "what would have to be true for this step to work?" This catches assumptions the reviewer might not think to look for.
- **Logical fallacy detection**: Systematically check for: appeal to authority, false dichotomy (only 2 options considered when more exist), slippery slope, begging the question, composition/division errors, survivorship bias in cited precedents.
- **Nine-dimensional evaluation**: Assess each claim on clarity, accuracy, precision, relevance, depth, breadth, logic, fairness, and significance.

**Potential implementation**: Add a Socratic questioning pass to the devil's advocate step. For each major decision, perform a 3-level "why" chain. Flag any decision where the reasoning chain terminates in an unsupported assertion. Add explicit logical fallacy scan as a sub-step.

**References**:
- [Socratic Questioning - Wikipedia](https://en.wikipedia.org/wiki/Socratic_questioning)
- [Socratic Questioning and Logical Fallacies](https://www.logicalfallacies.org/socratic-reasoning-and-logical-fallacies.html)
- [Socratic Method for Critical Thinking - Colorado State](https://tilt.colostate.edu/the-socratic-method/)

---

### 6. Consider-the-Opposite (Cognitive Debiasing)

**Source**: Cognitive psychology research on debiasing

This is the single most empirically validated debiasing technique. It requires explicitly asking "what are the reasons my initial judgment might be wrong?" before finalizing any assessment.

**What it adds beyond current protocol**:
- **Reviewer self-debiasing**: Our self-audit catches false positives. Consider-the-opposite also catches false negatives — findings the reviewer didn't flag because they seemed fine. For each "this looks correct" judgment, force the question "what would make this wrong?"
- **Plan author debiasing**: Check whether the plan itself shows evidence of consider-the-opposite thinking. Plans that never acknowledge tradeoffs or alternatives are higher risk.
- **Anchoring defense**: If the first impression of the plan is positive, the reviewer will unconsciously seek confirming evidence. CTO forces the opposite search.

**Potential implementation**: Add to Phase 4.5 self-audit: for each section where no finding was generated, explicitly ask "what reasons exist to think this section has a hidden flaw?" Also add to plan evaluation criteria: "does the plan demonstrate awareness of alternatives and tradeoffs at key decision points? Absence of tradeoff analysis is itself a finding."

**References**:
- [Cognitive Debiasing Techniques - Oboe](https://oboe.com/learn/advanced-analytical-reasoning-systems-1rc1kj/cognitive-debiasing-techniques-18uxj3r)
- [Debiasing - iResearchNet](https://psychology.iresearchnet.com/social-psychology/social-influence/debiasing/)

---

### 7. Red Team / Team B Analysis

**Source**: CIA Team A/Team B (1976), U.S. Army Red Teaming Handbook

Red teaming goes beyond devil's advocacy by creating a fully independent adversarial assessment. The red team doesn't just argue against — they construct their own complete counter-narrative.

**What it adds beyond current protocol**:
- **Full counter-plan**: Instead of poking holes, construct the strongest possible alternative plan and argue why it's superior. If you can build a better plan in 5 minutes, the original plan has a problem.
- **Adversary simulation**: "If someone wanted this plan to fail, what would they do?" This is different from pre-mortem (which asks how it could fail naturally) — this asks how it could be sabotaged.
- **Assumption inversion**: Take each key assumption and invert it. "The API will be available" → "The API will be unavailable for 3 days." Evaluate plan resilience under each inversion.

**Potential implementation**: Add optional Phase 3.5 "Red Team" after multi-perspective review but before gap analysis. Construct a 3-bullet counter-plan. If the counter-plan is clearly stronger, escalate finding severity. Perform assumption inversion on the top 3 most fragile assumptions.

**References**:
- [Red Teaming Handbook - U.S. Army (PDF)](https://rdl.train.army.mil/catalog-ws/view/arimanagingcomplexproblems/downloads/The_Applied_Critical_Thinking_Handbook_v8.1.pdf)
- [Red Teaming - Grey Swan Guild](https://greyswanguild.medium.com/the-hunt-for-grey-swans-top-15-methods-frameworks-11-red-teaming-bbc6b8eea8a6)
- [Devil's Advocate and Red Teaming - Adan Corporate](https://adancorporate.com/en-uk/strategy/devil-s-advocate-and-red-teaming.html)

---

### 8. Pros-Cons-Faults-and-Fixes (PCFF)

**Source**: Intelligence analysis tradecraft (Heuer & Pherson)

PCFF takes the standard pro/con list and adds two critical steps: "faulting" the pros (finding ways they could be wrong) and "fixing" the cons (finding ways they might not matter).

**What it adds beyond current protocol**:
- **Strength attack**: Our protocol focuses on finding weaknesses. PCFF also attacks the plan's strengths — "this pro is only true if X holds" or "this pro sounds good but actually doesn't matter for the stated goal."
- **Weakness rehabilitation**: Conversely, checking whether stated cons are actually as bad as claimed prevents over-severity. This complements the Realist Check.
- **Bidirectional stress test**: Every claimed advantage and every acknowledged weakness gets pressure-tested. Nothing passes without scrutiny.

**Potential implementation**: If the plan includes a rationale or tradeoff analysis, apply PCFF: fault every stated advantage, fix every stated disadvantage. The net result reveals whether the plan's self-assessment is honest.

**References**:
- [SATs Overview - Maltego](https://www.maltego.com/blog/improving-your-intelligence-analysis-with-structured-analytic-techniques/)
- [5 SATs for Better Decision Making - The Mind Collection](https://themindcollection.com/structured-analytic-techniques/)

---

### 9. Backcasting / Future-Back Stress Test

**Source**: Strategic planning, sustainability planning

Backcasting starts from the desired end state and works backward to identify what must be true at each stage. It's the inverse of the plan's forward logic.

**What it adds beyond current protocol**:
- **Backward dependency discovery**: Plans written forward can miss dependencies that only become visible when traced backward from the goal. "For the final step to succeed, step N-1 must have produced X — did it?"
- **Goal-plan alignment check**: Trace backward from the stated success criteria. Does the plan actually produce the outcomes claimed? Many plans have steps that seem reasonable but don't logically connect to the goal.
- **Hidden precondition surfacing**: Working backward reveals preconditions that the plan assumes are already met but never explicitly establishes.

**Potential implementation**: Add to Phase 2 plan investigation: after the forward analysis (steps 1-7), do a backward pass from the stated goal/success criteria. Verify that each step's outputs are actually consumed by downstream steps. Flag any goal that lacks a clear causal chain from the plan's actions.

---

### 10. LLM-Specific: Adversarial Confidence Calibration

**Source**: AI research (2025-2026 papers on LLM metacognition)

Research shows LLMs have systematic overconfidence (average 72.9% confidence vs rational 50% baseline) and that confidence increases rather than decreases during adversarial review. Chain-of-thought may function as post-hoc justification rather than transparent reasoning.

**What it adds beyond current protocol**:
- **Confidence deflation prompt**: Explicitly instruct the critic to start with the assumption that its confidence is too high. "Your initial assessment is probably 20% too confident. Adjust."
- **Justification reversal**: After generating the verdict, ask: "construct the strongest argument that your verdict is wrong." If the counter-argument is compelling, the verdict needs revision.
- **Process reward checking**: Instead of just evaluating the final plan, evaluate each reasoning step that led to the plan's decisions. A correct conclusion from flawed reasoning is still a finding.

**Potential implementation**: Add to Phase 5 (Synthesis): after generating the verdict, run a mandatory "verdict challenge" — construct the best argument that the verdict is too lenient. If the challenge succeeds, escalate the verdict.

**References**:
- [LLM Adversarial Reasoning - Latent Space](https://www.latent.space/p/adversarial-reasoning)
- [LLM Evaluation 2025 Review - Goodeye Labs](https://www.goodeyelabs.com/insights/llm-evaluation-2025-review)
- [LLM Self-Reflection - Nature](https://www.nature.com/articles/s44387-025-00045-3)

---

## Prioritized Recommendations

Ranked by expected impact on plan critique harshness, weighted against implementation complexity and false-positive risk:

| Priority | Technique | Expected Impact | FP Risk | Effort |
|----------|-----------|----------------|---------|--------|
| 1 | Strengthened Pre-Mortem (certainty framing, black swans, multi-horizon) | HIGH | LOW | LOW |
| 2 | Murder Board Protocol (hostile persona, thesis-level attack) | HIGH | MEDIUM | MEDIUM |
| 3 | Consider-the-Opposite (false negative defense in self-audit) | HIGH | LOW | LOW |
| 4 | ACH / Alternative Plan Generation | HIGH | MEDIUM | MEDIUM |
| 5 | Socratic Deconstruction (recursive why-chains, fallacy scan) | MEDIUM | LOW | LOW |
| 6 | FMEA (per-step failure enumeration with RPN scoring) | HIGH | HIGH | HIGH |
| 7 | Backcasting (backward pass from goals) | MEDIUM | LOW | LOW |
| 8 | Red Team counter-plan + assumption inversion | MEDIUM | MEDIUM | MEDIUM |
| 9 | PCFF (fault the pros, fix the cons) | MEDIUM | LOW | LOW |
| 10 | LLM confidence deflation + verdict challenge | MEDIUM | LOW | LOW |

### Quick Wins (low effort, low FP risk, high impact)
1. **Strengthen pre-mortem** with certainty framing and black swan prompt — 2 sentences of prompt change
2. **Add consider-the-opposite to self-audit** — check for false negatives, not just false positives
3. **Add Socratic why-chains** to devil's advocate step — 3-level recursive questioning
4. **Add backcasting pass** — backward verification from stated goals
5. **Add verdict challenge** in synthesis — "argue your verdict is too lenient"

### Medium-Term Additions
6. **Murder board persona** — "construct a complete argument for killing this plan"
7. **ACH alternative generation** — "what's the best competing approach and why didn't the plan choose it?"
8. **Logical fallacy scan** — explicit checklist of common reasoning errors in plans

### Larger Structural Changes
9. **FMEA per-step enumeration** — would significantly increase thoroughness but also review length and FP rate
10. **Full red team counter-plan** — highest-effort technique, best reserved for high-stakes reviews
