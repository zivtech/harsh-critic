# Upstream Review: oh-my-claudecode critic agents

**Date:** 2026-09-01
**Upstream:** `yeachan-heo/oh-my-claudecode` @ `e9e8fa38` (2026-08-31), full history (4512 commits)
**Scope:** what happened to `harsh-critic` after we contributed it, what upstream added that we lack, and which of their tests are worth importing.

---

## 1. Status: harsh-critic is the upstream critic

Confirmed by file archaeology, not inference:

| Date | Commit | Event |
|---|---|---|
| 2026-03-03 | `b173c814` | `agents/harsh-critic.md` added (our contribution) |
| 2026-03-03 | `08659712` | adversarial framing replaced with evidence-based techniques |
| 2026-03-05 | `d45a323b` (#1335) | harsh-critic v2 — plan-specific protocol + adaptive harshness |
| 2026-03-05 | `7b26bdcc` | Realist Check phase + "Mitigated by" requirement |
| 2026-03-08 | `8641e541` (#1426) | **consolidation** — `harsh-critic.md` renamed to `critic.md`; the old `critic` was absorbed into it |

`git diff 8641e541^:agents/harsh-critic.md 8641e541:agents/critic.md` shows our prompt is the base of the rename, with the legacy critic's plan-review layer merged on top. The name survives only as a deprecated routing alias:

- `src/agents/definitions.ts:338` — `**harsh-critic** → critic`
- `src/__tests__/consolidation-contracts.test.ts:84` — `expect(agents['harsh-critic']).toBeUndefined()`
- `src/__tests__/consolidation-contracts.test.ts:109-114` — `resolveDelegation({ agentRole: 'harsh-critic' }).agentOrModel === 'critic'`

**Since the March consolidation, `agents/critic.md` has changed four times in six months** — three of them frontmatter/policy one-liners. The prompt is effectively frozen upstream.

---

## 2. What upstream has that we don't

All four of our surfaces (`.claude/agents/harsh-critic.md`, `.claude/skills/harsh-critic/SKILL.md`, `.agents/skills/harsh-critic/SKILL.md`, `.claude/agents/proposal-critic.md`) are missing every item below.

### 2.1 `<Final_Response_Contract>` — highest value, lowest cost

Added upstream in `1a533f44` (#3217, 2026-06-07). Three lines that fix a real orchestration failure: a subagent that does the review in tool commentary and signs off with "done" delivers nothing to its caller.

```
<Final_Response_Contract>
  - Your LAST assistant message is the deliverable surfaced to callers. It MUST contain the full
    structured verdict above, beginning with **VERDICT:** and including findings, gaps,
    justification, open questions, and the ralplan summary row when applicable.
  - Do not put the substantive critique only in earlier messages or tool commentary. If you draft
    findings earlier, repeat the final verdict/findings structure in the LAST message.
  - Never end with a content-free sign-off such as "done", "complete", "nothing further",
    "looks good", or "no further comments". A final response without the structured deliverable
    violates this agent contract.
</Final_Response_Contract>
```

This matters more for us than for them: our critics are routed through `meta-critic`, `js-critic-router`, and `spec-kitty-bridge`, all of which consume the last message.

### 2.2 Smaller portable items

| Item | Where upstream | Worth taking? |
|---|---|---|
| Handoff routing constraint (`Hand off to: planner / analyst / architect / executor / security-reviewer`) | `<Constraints>` | Yes — adapt names to our agent set |
| LSP tool usage (`lsp_hover`, `lsp_goto_definition`, `lsp_find_references`, `lsp_diagnostics`) | `<Tool_Usage>` | Yes, guarded by "when available" |
| Compliance matrix for spec reviews (`Requirement \| Status \| Notes`) | `<Execution_Policy>` | Yes — spec-kitty work packages need it |
| 5 extra failure modes: vague rejections, skipping simulation, confusing certainty levels, letting weak deliberation pass, false positives from low confidence | `<Failure_Modes_To_Avoid>` | Yes — each has a concrete counter-example |
| Third `<Good>` example (migration plan, 7 assumptions, 3 FRAGILE) and third `<Bad>` (reads title only, approves) | `<Examples>` | Yes |
| `model: opus` alias instead of a pinned version | frontmatter | Judgment call — we pin `claude-opus-4-8`; an alias survives model turnover, a pin gives reproducible benchmarks |
| "Runtime effort inherits from the parent session" | `<Execution_Policy>` | Only if we stop pinning |

### 2.3 Things upstream dropped from our version — do not re-import

The consolidation deleted two lines that were ours and are still worth keeping:

- `Scope creep: Reviewing things outside the provided work's scope.` (failure mode)
- `Manufactured criticism is as useless as rubber-stamping.` (success criteria)

We still have both. Keep them.

### 2.4 Where we are ahead

None of our post-March work went upstream. Our `harsh-critic` has eleven protocol elements `critic` lacks:

strengthened pre-mortem (certainty framing / black swan / three horizons) · Socratic why-chain · logical fallacy scan · murder board · ACH-lite competing alternatives · backcasting · consider-the-opposite false-negative check · security exploitability gate · severity calibration examples · verdict challenge · spec-kitty-bridge heading format.

**Consequence:** the archived prompt upstream benchmarks against (`benchmarks/harsh-critic/prompts/harsh-critic.md`, 254 lines) is our *pre-upgrade* March snapshot. Their published deltas do not describe our current prompt.

---

## 3. The harness we lost — and what it grew into

`README.md:40` in this repo says the raw benchmark artifact "is not present in this checkout, so these numbers should be treated as historical notes until the benchmark harness and results are restored." The harness was never lost upstream. It has been maintained and extended.

### 3.1 What exists upstream

```
benchmarks/harsh-critic/
  scoring/{types,parser,scorer,reporter}.ts
  scoring/__tests__/{parser,scorer}.test.ts
  ground-truth/*.json          8 fixtures, keyword-tagged, 2 clean baselines
  SCORING_MATCH_CALIBRATION.md
benchmarks/shared/{types,parser,scorer,reporter,runner}.ts
benchmarks/run-all.ts          4 agents, baseline save/compare
tests/benchmark-diagnostics.test.ts   789 lines, 24 cases
```

`npm run bench:prompts` / `:save` / `:compare`. CI does **not** run the live benchmark; `vitest` runs the scoring unit tests without an API key.

### 3.2 Tests worth importing, ranked

**(a) Evidence-safe diagnostics contract** — `tests/benchmark-diagnostics.test.ts`, from `5ba52b08` (#3650, 2026-08-09). The strongest methodological work in the repo. The rules it encodes:

- Pair observations by `(domain, fixtureId)`. Never zero-fill a missing run — unpaired fixtures surface as `aOnlyKeys` / `bOnlyKeys`.
- Typed failures: `FailedFixtureResult` carries `failureReason: api | prompt | parse | score | match | missing-ground-truth` and is typed `scores?: never`, so a failed run cannot contribute a fabricated score.
- A validity gate: the whole comparison is `inconclusive` with explicit `reasons[]` when agents are identical, populations differ, any paired run failed, or telemetry is incomplete.
- Cost dimensions kept separate: input / output / total tokens, API latency (documented as retry-inclusive, *not* model compute), harness overhead.
- Anti-contamination assertion: `expect(JSON.stringify(report)).not.toContain("expectedVerdict")` and no `"REJECT"` in the rendered report — the answer key must never leak into an artifact a model might later read.
- Report carries its own interpretive guardrail: *"does not prove an Opus regression."*
- Duplicate fixture keys throw `DuplicateFixtureKeyError`.

**(b) Scorer match calibration** — `scoring/__tests__/scorer.test.ts` + `SCORING_MATCH_CALIBRATION.md`. Matching normalizes with NFKC, collapses punctuation and separators, falls back to order-independent phrase matching, and scales the threshold with keyword-set size (`max(2, ceil(n * 0.4))`), with boundary tests asserting 2/6 fails and 3/6 passes. Deterministic and auditable — no embeddings, no LLM judge.

**(c) Parser format-robustness** — `scoring/__tests__/parser.test.ts`. Heading aliases, `**bold**` vs `###` headings, numbered vs bulleted findings, inline `Security:` perspectives, empty output. This is what made their opus rerun jump from 7.8% to 55.9%: the earlier gap was parser brittleness, not model quality.

**(d) Prompt-surface contract tests** — `src/__tests__/consolidation-contracts.test.ts` and `agent-registry.test.ts`. Our `scripts/verify_surfaces.py` checks docs, registry paths, Codex TOML and ignore rules, but asserts nothing about the prompt contract itself. Cheap additions in Python, no Node needed: every critic surface contains all four verdict labels, a `What's Missing` section, a `<Final_Response_Contract>`, and — for `harsh-critic` — Steps 8/9/10 and the security exploitability gate.

---

## 4. Two verified defects — do not port the scorer as-is

Both reproduced by executing upstream's `scoreFixture` directly.

### 4.1 A perfect clean-baseline run scores 0.35/1.00

Input: correct `ACCEPT`, zero findings, full process compliance, against a `isCleanBaseline: true` ground truth with no findings.

```
truePositiveRate 0 · falsePositiveRate 0 · falseNegativeRate 0
missingCoverage 0 · perspectiveCoverage 0 · evidenceRate 0
compositeScore 0.35
```

With `findings: []`, four of the seven weighted dimensions are structurally pinned to zero, and `computeEvidenceRate` returns `0` when there are no CRITICAL/MAJOR findings — so *not* manufacturing findings is scored the same as failing to find them. `aggregateScores` then averages clean baselines in with the rest, dragging both agents' composites down by a constant. The false-positive-resistance fixtures cannot express the thing they were built to measure.

### 4.2 Finding real issues that aren't in the answer key is scored as a false positive

Same ground truth (one CRITICAL), two runs:

| Agent output | FPR | Composite |
|---|---:|---:|
| finds only the answer-key item | 0.00 | 0.700 |
| also finds 2 genuine unlisted issues (both with `file:line`) | 0.67 | **0.633** |

`falsePositiveRate = spuriousTexts / totalAgentFindings`, where "spurious" means *did not keyword-match a ground-truth entry*. Correctness is not assessed. A critic that surfaces more real problems is penalized.

**This has a direct consequence for a claim we publish.** `docs/index.html` reports FPR rising 40.5% (v1 sonnet) → 78.7% (v2 opus) and explains it as *"the model generates more spurious findings alongside its dramatically higher detection rate."* That interpretation is not supported by how the metric is computed. The same mechanism that raised true-positive rate to 51.8% and missing coverage to 62.5% mechanically raises FPR, because the extra findings — real or not — are all outside an 8-fixture answer key. The honest statement is "unmatched-finding rate," and it is not evidence of noise.

Related, lower-stakes: upstream's own `benchmarks/harsh-critic/README.md` documents `missingCoverage` as *"gaps the agent surfaced that weren't in ground truth but are valid"* — the implementation is `matched ∩ category=='missing' / total category=='missing'`, which is the opposite. The doc describes a metric that was never built.

---

## 5. Recommended sequence

1. **Port `<Final_Response_Contract>`** to all four critic surfaces plus `proposal-critic`, and add a `verify_surfaces.py` check for it. Half an hour, immediate payoff through our router agents.
2. **Merge §2.2 items** into `harsh-critic` and `proposal-critic` — handoff constraints, LSP usage, compliance matrix, five failure modes, two examples. Keep §2.3.
3. **Add prompt-contract assertions to `verify_surfaces.py`** (§3.2d). Pure Python, no new toolchain, catches surface drift the current checks miss.
4. **Restore the harness** — import `scoring/` + `shared/` + `run-all.ts` and their vitest suites. This adds a Node/vitest toolchain to a Python-verified repo; that is the real cost and it should be a deliberate decision, not a side effect.
5. **Fix both scorer defects before running anything** (§4): score clean baselines on their own scale rather than the seven-dimension composite, and rename/re-derive FPR so unmatched-but-valid findings are not counted as noise. Then correct `docs/index.html`.
6. **Re-benchmark our current prompt.** Upstream's numbers describe our March snapshot. Our T1–T7 work has only ever been validated qualitatively (`research/plan-critique-techniques/technique-validation-results.md`, a single-artifact OLD-vs-NEW comparison). A fixed harness plus the five plan fixtures in `benchmarks/harsh-critic/fixtures/` would give it a quantitative footing — and our `expected/*.json` schema already tags each seeded flaw with its `target_technique` and carries `false_positive_traps`, which upstream's ground truth does not. That per-technique attribution is worth preserving through any port.

---

## 6. Confidence and limits

- **High confidence:** the consolidation history, the current prompt diff, the harness inventory, and both scorer defects (executed, not read).
- **Not claimed:** that upstream's live benchmark numbers are wrong — they were produced by a harness whose scoring I am criticizing, but I did not re-run any live comparison. No API calls were made.
- **Not examined:** upstream's other review agents (`code-reviewer`, `security-reviewer`, `qa-tester`, `verifier`) and the `review` / `self-improve` skills. They may hold portable material; this pass was scoped to the critic lineage.
- **Untested assumption:** that upstream's parser handles our current output. It looks for `Critical Findings` / `Major Findings` sections, so our `spec-kitty-bridge` variant (`# Verdict:` + a single `## Findings` group) would parse as zero findings. Any port needs a parser case for it.

---

## 7. Sweep: upstream's other review agents

Follow-up pass over `code-reviewer`, `security-reviewer`, `qa-tester`, and `verifier`.

### 7.1 `code-reviewer` — the best find in the sweep

`26681acd` (#2892, 2026-05-02, "discovery/filter separation for Opus 4.7") added a block with a claim worth taking seriously:

> suppressing low-severity findings during the discovery stage causes silent regressions — recent Claude models follow filtering instructions faithfully and may not surface bugs they would otherwise catch. Discovery prioritizes coverage; ranking and filtering belong in a downstream verification stage.

The operational rules that follow from it:

- Rate every finding on **two axes** — severity AND confidence — and never drop one for seeming unimportant.
- **Gate the verdict on high-confidence findings only.** A CRITICAL held at LOW confidence goes to Open Questions and does not block on its own.
- Treat soft filter language in the request ("only the important issues", "don't nitpick") as **ranking guidance for the consumer**, not permission to suppress during discovery.
- "Recall is the reviewer's responsibility; precision is the consumer's."

This is a real gap in our critics. We already routed low-confidence findings to Open Questions via the self-audit, but we never said *don't suppress during investigation* — and the failure mode it describes (a model faithfully obeying "be conservative" by staying silent) is one our prompts were open to.

### 7.2 `verifier` — two portable pieces

- **No self-approval:** "Verification is a separate reviewer pass, not the same pass that authored the change. Never self-approve or bless work produced in the same active context." Also present in `code-reviewer`. Our critics had nothing equivalent, which matters because our planner → executor → critic chain can run inside one context.
- **Hedged language as a red flag:** "should", "probably", "seems to" mark an unverified claim and demand actual verification. Concrete and cheap to encode.
- Its VERIFIED / PARTIAL / MISSING acceptance-criteria matrix pairs naturally with the compliance matrix from §2.2; merged into one item on the port.

### 7.3 `security-reviewer` — little to take

OWASP Top 10 coverage, secrets scanning, dependency audits. Structurally sound but domain-specific and largely duplicated by our `security-threat-model-planner`. The one transferable idea is prioritising by **severity × exploitability × blast radius**, which is the same instinct as our Security Exploitability Gate and adds nothing our gate lacks. Nothing ported.

### 7.4 `qa-tester` — nothing portable

tmux-driven interactive CLI testing. No analogue in this repo and no transferable protocol material.

### 7.5 Deliberately not taken

- `<External_Consultation>` blocks (in `code-reviewer` and `security-reviewer`) tell the agent to spawn further Task agents for cross-validation. This conflicts with the global one-level delegation-depth rule. Skipped.
- `code-reviewer`'s mandatory **Positive Observations** section. Our critics already say "if something is good, one sentence is sufficient", which is the better calibration for a harsh critic. Skipped.

---

## 8. What has landed

Steps 1–3 of §5 are done and verified.

**Ported to all eight critic surfaces** (`.claude/agents`, `.claude/skills`, `.agents/skills`, `.codex/agents` × both critics):

| Addition | Source |
|---|---|
| `<Final_Response_Contract>` / `FINAL RESPONSE CONTRACT:` | upstream `1a533f44` (#3217) |
| `<Discovery_Filtering_Separation>` / `DISCOVERY VS FILTERING:` | upstream `26681acd` (#2892), §7.1 |
| No-self-approval + explicit "no issues found" + handoff constraints | `code-reviewer`, `verifier`, §7.2 |
| LSP tool usage | upstream `critic` `<Tool_Usage>` |
| Compliance matrix (Requirement / Status / Evidence, VERIFIED-PARTIAL-MISSING) | upstream `critic` + `verifier` |
| Five failure modes: vague rejections, skipping simulation, confusing certainty levels, silent filtering, hedged verification language | upstream `critic` + §7.1, §7.2 |
| A third Good and third Bad example per critic | upstream `critic` `<Examples>` |
| Three checklist items covering confidence rating, verdict gating, and the response contract | this work |

`proposal-critic` gained an `<Execution_Policy>` block (it had none) and its model pin was corrected from `claude-opus-4-6` to `claude-opus-4-8` — it had been missed by the earlier bump that moved `harsh-critic`.

**Defect caught during the port, by the port's own review:** the discovery/filtering block as first written told `proposal-critic` that its "Security Exploitability Gate" routes uncertain findings to Open Questions. `proposal-critic` has no such gate — it reviews plans, not code. The reference was corrected, and the check in §8.1 was written specifically to catch that defect class mechanically.

### 8.1 New invariants in `scripts/verify_surfaces.py`

Nine checks over all eight surfaces, with 13 negative tests in `tests/test_verify_surfaces.py` that each break exactly one thing in a temp copy of the repo and assert the check fires:

- all four verdict labels present
- `What's Missing` and `Open Questions` present
- a response contract present (either spelling)
- discovery/filtering separation present (either spelling)
- the six plan-critique technique tokens present
- Phase 1 pre-commitment precedes Phase 2
- anti-rubber-stamp and anti-manufactured-outrage guidance within 400 characters
- **cross-reference integrity** — a surface may not name a protocol element it does not define
- `.agents` mirrors match their `.claude` source except for the one allowed substitution

Codex wrappers are read through `tomllib` and checked on `developer_instructions` only, so prose outside the prompt body cannot satisfy a check. A test asserts that.

`python3 scripts/verify_surfaces.py` and `python3 -m unittest discover -s tests` (21 tests) both pass.

### 8.2 Not yet done

Steps 4–6 of §5 remain: importing the benchmark harness (adds a Node/vitest toolchain to a Python-verified repo), fixing the two scorer defects in §4, correcting the FPR framing in `docs/index.html`, and re-benchmarking the current prompt against live fixtures. The last of those costs real API spend and should not start until the scorer is fixed — otherwise it reproduces the same misleading numbers.

---

## 9. Harness import — three further defects found

Importing the harness (§5 step 4) surfaced three defects beyond the two in §4. All five were reproduced by executing the code, not by reading it.

### 9.1 `parseCriticOutput` is an unbound re-export — runtime `ReferenceError`

`benchmarks/shared/parser.ts:12` exposes the canonical parser with:

```ts
export { parseAgentOutput as parseCriticOutput } from '../harsh-critic/scoring/parser.ts';
```

A re-export makes the name available to *consumers* of the module. It does **not** create a binding in the module's own scope. Line 243 then calls `parseCriticOutput(...)`, which throws:

```
ReferenceError: parseCriticOutput is not defined
```

Every `'critic'` and `'harsh-critic'` call through the shared parser fails. It stayed latent upstream because their `tsconfig.json` has `include: ["src/**/*"]`, so `benchmarks/` is never typechecked, and their critic benchmark bypasses the shared module. Anything routed through the generalized shared runner — the path `run-all.ts` scales to — breaks. Fixed here by adding a real import alongside the re-export; three regression tests cover it.

### 9.2 The `critic` arm is parsed with the pre-consolidation parser

`parseAgentOutput` sent every non-`harsh-critic` agent to `parseCritic`, which:

- recognises only the `OKAY` / `REJECT` verdict vocabulary, and
- **hardcodes** `criticalFindings: []`, `minorFindings: []`, `missingItems: []`, empty `perspectiveNotes`, and all three process-compliance flags to `false`.

That was correct until 2026-03-08. Since `8641e541`, `critic` **is** the consolidated harsh-critic and emits the four-tier verdict with severity buckets, a What's Missing section, and perspective notes. The parser was never updated, so all of it is discarded.

Measured on one identical review, changing only the agent label:

| Parsed as | verdict | critical | major | missing | process flags | composite |
|---|---|---:|---:|---:|---|---:|
| `harsh-critic` | `REVISE` | 2 | 1 | 1 | 3/3 | **0.857** |
| `critic` | `""` | 0 | 0 | 0 | 0/3 | **0.100** |

An 8.6× swing from the label alone. The `critic` arm forfeits the 40% of composite weight carried by `missingCoverage`, `perspectiveCoverage`, and process compliance, plus true-positive credit for every critical finding and gap — and does not even recover the verdict, because the legacy matcher wants the keyword bracketed directly by asterisks (`**[REJECT]**`) while current output writes `**VERDICT: REJECT**`.

Fixed by routing `critic` to the harsh-critic parser and naming the old format `critic-legacy`, so historical runs stay reproducible. Upstream's own parser tests passed `'critic'` with legacy-format samples, so **the tests agreed with the bug** — they have been retargeted onto `critic-legacy`, and four tests now pin the corrected routing.

### 9.3 The canonical reporter zero-fills missing observations

`benchmarks/harsh-critic/scoring/reporter.ts` computed head-to-head with `harsh?.scores.compositeScore ?? 0`. A fixture that ran for only one agent produced a fabricated landslide win for that agent. The same file also published an all-zero aggregate for an agent that never ran, which reads as catastrophic performance rather than absence.

This is precisely the practice upstream's newer `benchmarks/shared/reporter.ts` was written to eliminate — pair by key, never zero-fill, mark unpaired observations. The shared layer got that treatment in `5ba52b08` (#3650); the canonical critic reporter never did. Fixed here: unpaired fixtures are excluded from scoring and reported as `unpairedFixtures`, and the aggregate map is partial.

### 9.4 What this means for the historical table

`README.md`'s three historical runs are dated 2026-03-03, five days **before** consolidation, so the `critic` arm was genuinely the legacy agent and §9.2 does not apply to them. But the comparison was still structurally unfair: the composite awards 40% of its weight to dimensions the legacy output format cannot express — no What's Missing, no perspective notes, no pre-commitment. The legacy critic's score was capped by format, not by review quality.

So the headline `+48.1%` delta measures **format conformance**, not gap detection. `README.md` and `docs/index.html` have been corrected to say so.

---

## 10. Harness status

Imported from upstream `e9e8fa38` and wired to this repo. Every local change carries a `LOCAL FIX` or `LOCAL ADAPTATION` comment naming the upstream commit, so the delta stays auditable.

**Adaptations:** `harsh-critic` now loads its prompt from the **live** `.claude/agents/harsh-critic.md` rather than a stale archived snapshot — the point of the exercise. Baselines are pinned under `prompts/`: `critic.md` (upstream's current critic) and `critic-legacy.md` (pre-consolidation). `run-all.ts` is trimmed to the one benchmark this repo carries. Default model moved from `claude-opus-4-6` to `claude-opus-4-8` to match the agent pins. One upstream test that read sibling `debugger/` and `executor/` ground truth now writes its own, preserving the invariant without the coupling.

**Fixtures and answer key:** the five plan fixtures moved to `fixtures/plans/`, and `ground-truth/*.json` was hand-authored from `expected/*.json` — keywords grounded in the seeded text rather than auto-extracted, and 7 of 16 findings categorised `missing` so they exercise the 20%-weighted `missingCoverage` dimension. Per-technique attribution (`targetTechnique`, our T1–T7) and the 11 `false_positive_traps` are preserved as `x-` fields; upstream ground truth has nowhere to put either. Seven tests validate the answer key against the harness schema, including that every keyword set is matchable under the proportional threshold.

**State:** `npx tsc --noEmit` clean, 74 vitest tests pass without an API key, `--dry-run` validates the full pipeline, and the Python verifier plus its 21 tests still pass.

**Still open:** the two §4 scorer defects. A live run before those are fixed would reproduce the same misleading numbers, so the re-benchmark is deliberately not started.

---

## 11. Scorer defects fixed

Both §4 defects traced to one root cause: the composite treated *"this fixture cannot express this dimension"* as *"this agent scored zero on this dimension."*

### 11.1 Applicability-aware composite

`computeComposite` now takes a weighted mean over **applicable** dimensions and renormalises the weights to sum to 1. A dimension is applicable when the fixture and the output can express it:

| Dimension | Applicable when |
|---|---|
| truePositiveRate, falseNegativeRate | ground truth has at least one finding |
| missingCoverage | ground truth has a `missing`-category finding |
| perspectiveCoverage | ground truth has a `perspective`-category finding |
| evidenceRate | the agent produced at least one CRITICAL/MAJOR finding to cite |
| falsePositiveRate | the fixture is a clean baseline |
| processCompliance | always — any output either follows the structure or does not |

This fixed a second, quieter problem: our ground truth has no `perspective`-category findings, so under the old scorer **every** fixture forfeited 10% of composite silently.

### 11.2 False positives are only claimed where they can be shown

The old `falsePositiveRate` counted any finding that failed to keyword-match the key, without assessing correctness — so a better reviewer scored worse. It is now split:

- **`unmatchedFindingRate`** — the same ratio, named honestly. Always computed, always reported, weighted nowhere.
- **`falsePositiveRate`** — `null` except on clean baselines, which are constructed to contain no genuine issues. That is the only place the key is authoritative about *absence*.

Clean baselines also gained an `allowedObservations` list, seeded from the `minor_observations_acceptable` entries our fixtures already carried, so a critic that draws a fair minor observation about a deliberately solid plan is not charged as if it hallucinated. Aggregation averages the true rate only over fixtures that can express it — averaging seeded fixtures in as 0 would dilute the suite's only precision signal.

### 11.3 Measured before and after

| Scenario | Before | After |
|---|---:|---:|
| Perfect clean-baseline run (correct ACCEPT, nothing flagged, full compliance) | 0.350 | **1.000** |
| Clean baseline, 3 fabricated findings | — | **0.667** (FPR 1.0) |
| Clean baseline, 1 allowed observation | — | **1.000** (FPR 0.0) |
| Seeded fixture, answer-key finding only | 0.700 | **1.000** |
| Same, plus 2 genuine unlisted findings | 0.633 | **1.000** (unmatched 0.67) |

Finding more real issues no longer costs score, and the clean baselines can finally measure the precision they were built to measure.

### 11.4 Coverage

13 tests in `scoring/__tests__/scoring-fixes.test.ts` pin this: the before/after numbers above, that fabricated findings on a clean baseline still hurt, that `falsePositiveRate` stays `null` on seeded fixtures, that renormalised weights reach exactly 1.0 on a perfect applicable run, that the composite bottoms at 0, and that aggregation neither dilutes nor invents a precision signal.

Two of those tests failed on first write, both times because my assumption was wrong and the scorer was right — a silent run on a clean baseline scores 0.5 (perfect precision, zero protocol compliance), and a finding that cites evidence makes `evidenceRate` applicable. Recorded here because it is the kind of thing a green suite hides.

**State:** `npx tsc --noEmit` clean; 87 vitest tests pass without an API key; `--dry-run` validates the pipeline; the Python verifier and its 21 tests pass. Scores from this harness are not comparable to the historical table — the weighting changed.

**Remaining:** the live re-benchmark itself. It needs `ANTHROPIC_API_KEY` and costs roughly $3-5 per full run, so it is a deliberate, separately-authorised step.

---

## 12. Handoff — state at park, 2026-09-01

Branch `feat/upstream-critic-improvements`, six commits, **unpushed**.

```
5202aae fix(benchmarks): three parser defects found by the first live run
76f13fa chore(benchmarks): default to the subscription runner
8ae82c4 feat(benchmarks): add a subscription runner
4e36ac2 fix(benchmarks): score only the dimensions a fixture can express
f38b587 feat(benchmarks): restore the harness, fix five defects
c0bdacd feat(critics): port upstream protocol improvements, enforce prompt contracts
```

Green: `npx tsc --noEmit`, 87 vitest tests, 21 Python tests, `scripts/verify_surfaces.py`.

### 12.1 Done

Steps 1-5 of §5 are complete. Prompt ports landed on all eight critic surfaces with nine enforced invariants. The harness is restored, wired to the live prompt, and runs on the Claude subscription by default (`--runner claude-cli`) — there are no API keys on this machine. Both §4 scorer defects are fixed and covered by 13 tests.

### 12.2 The live run — completed, and NOT a result

10/10 calls, 42 minutes, exit 0. The detection metrics were invalid: the parser discarded findings the agents demonstrably wrote. `plan-api-redesign` parsed as `REJECT` with zero critical and zero major findings while its raw output contains `## Critical Findings` C1-C3 and `## Major Findings` M1-M6 — one of which is verbatim a seeded flaw.

Three parser defects found and fixed (`5202aae`). The one that matters most for interpretation: sections ended at the first following heading, which hit the arms **asymmetrically** — harsh-critic emitted `##` headers, the baseline `**bold**` headers — manufacturing a 29.7-point delta out of markdown style alone.

**No delta is claimed.** It moved 29.7 → 20.5 → 15.4 across the three fixes with no evidence of convergence, and an independent count of literal finding sub-headings still disagrees with the parser on 8 of 10 outputs. The independent counter is itself unreliable (it reports 0/0 for outputs known to contain findings), so both instruments disagree and neither is currently trusted.

Method note for whoever picks this up: those three fixes were made while watching the delta move. Each is defensible in isolation, but the loop was wrong — fitting the instrument to the result. Do not continue that way.

### 12.3 Next step

**Hand-audit the 10 captured outputs, then rebuild the parser against them.**

`benchmarks/harsh-critic/scoring/__tests__/fixtures/` holds the real agent outputs as `<agent>__<fixture>.md`. Upstream's parser tests used idealised samples, which is exactly why these defects survived.

1. Read each of the 10 files. Record the true count of critical findings, major findings, and What's Missing entries, plus which seeded flaw IDs each output genuinely addresses. Write it down as data, not as an assertion in code.
2. Turn that audit into parser tests asserting those counts.
3. Fix the parser until the tests pass — judged against the audit, never against the composite.
4. Re-score offline with `scratchpad/rescore.ts` as a model. **Free** — raw outputs are saved, no API calls, no quota.
5. Only then report a delta, and only with the n=1 caveat below.

### 12.4 Standing caveats for any number this suite produces

- **n=1 per cell.** Ten calls, one sample each, on a stochastic system. Per-fixture deltas are noise at this sample size; upstream's own README says run 3× and average.
- **Runner-bound.** `claude -p` carries ~50k tokens of ambient context the API path does not. Compare within a runner only.
- **Not comparable to the historical table** in `README.md` — the scorer was reweighted in `4e36ac2`.
- **Watch `plan-clean-baseline`.** It is now the only fixture that can measure precision, and it is where our prompt is most at risk: murder board, verdict challenge and adversarial escalation all push toward finding something. Both arms flagged findings on it in the live run.

### 12.5 Loose ends

- `ANTHROPIC_API_KEY` was exported in the environment from an unidentified source — not any shell rc, `settings.json`, or `.envrc`, and there is no direnv. Likely Warp's environment settings or the launching shell. All keys have been deleted, so it is inert, but a dead export will produce confusing 401s if anything reaches for `--runner api`.
- Untracked files predating this work sit in the repo root (`zivtech-meta-skills-*.md`, `companion-planner-build-plan.md`, and others). Deliberately left alone.
