# Hand audit of the 10 captured live-run outputs

**Date:** 2026-09-01
**Inputs:** `benchmarks/harsh-critic/scoring/__tests__/fixtures/<agent>__<fixture>.md` (raw outputs, 2026-09-01 live run)
**Method:** every file read end to end by hand, then cross-checked against an independent mechanical extraction. Both agreed on all 40 severity counts. Counts are encoded as tests in `scoring/__tests__/captured-output.test.ts`.

This file is the ground truth *about the parser and the scorer*. It was written before re-scoring, deliberately, so that parser work is judged against a reading of the outputs and never against a composite score.

---

## 1. The audit table

| Output | Verdict | GT verdict | CRIT | MAJOR | minor | missing | Seeded flaws addressed |
|---|---|---|---|---|---|---|---|
| harsh-critic__plan-api-redesign | REJECT | REVISE | 3 | 6 | 3 | 10 | SF-1, SF-2, SF-3 (all inside M3) |
| critic__plan-api-redesign | REJECT | REVISE | 4 | 4 | 4 | 8 | SF-1, SF-2, SF-3 (all inside C1) |
| harsh-critic__plan-auth-migration | REJECT | REVISE\|REJECT | 3 | 6 | 4 | 11 | SF-1, SF-2, SF-3; SF-4 partial |
| critic__plan-auth-migration | REJECT | REVISE\|REJECT | 4 | 6 | 4 | 7 | SF-1, SF-3; SF-2 partial; SF-4 no |
| harsh-critic__plan-clean-baseline | REVISE | ACCEPT | 0 | 6 | 5 | 10 | n/a (0 seeded) |
| critic__plan-clean-baseline | REJECT | ACCEPT | 3 | 6 | 6 | 7 | n/a (0 seeded) |
| harsh-critic__plan-data-pipeline | REJECT | REJECT | 2 | 10 | 2 | 7 | SF-1, SF-2, SF-3 |
| critic__plan-data-pipeline | REJECT | REJECT | 3 | 12 | 4 | 8 | SF-1, SF-2, SF-3 |
| harsh-critic__plan-weak-justification | REJECT | REJECT | 3 | 8 | 3 | 12 | SF-1, SF-2, SF-4, SF-5, SF-6; SF-3 rejected |
| critic__plan-weak-justification | REJECT | REJECT | 3 | 5 | 3 | 12 | SF-1, SF-2, SF-4, SF-5, SF-6; SF-3 rejected |

Verdict agreement with the expected range: 6/10. All four misses are in the same direction — harsher than expected — and three of them are on `plan-clean-baseline`, which §3 shows is not a clean fixture.

---

## 2. Parser defects the audit exposed

The first three were found and fixed in `5202aae`. The fourth was found by this audit.

**D4 — bold lead-in findings were dropped entirely.** A finding written as

```
**M1 — No latency budget; deterministic delays already consume most of the 5s.** Step 4 loads ...
```

matches no list marker and is not a bold-only heading. It fell through to the "plain continuation prose" branch in `extractListItemsFromSection`, which appends to the open item — and with no item open, **discarded the line**. Three of ten outputs write every MAJOR finding this way, so they parsed as `MAJOR = 0` while every other count on the same file was correct: 27 findings deleted in silence.

Upstream's parser tests always broke the line after the bold title, which is exactly why this survived into a scored run.

Fixed by recognising a bold lead-in at a paragraph boundary as the start of a finding. The paragraph-boundary condition matters: it prevents a mid-paragraph bold run (`**Black-swan risk:**` inside a finding's prose) from splitting its parent.

**D5 — the scorer matched one agent finding to at most one seeded flaw.** `matchFindings` marked each agent finding consumed once matched, so a critic that consolidates several related defects into one well-argued block scored one hit instead of several. On `plan-api-redesign` both arms answer SF-1, SF-2 and SF-3 inside a single finding; the baseline arm scored 1/3. Relaxed so a finding may satisfy several flaws, each of which must still independently clear the keyword bar.

### Structural facts any future parser must handle

- **Header style is not an arm signal.** harsh-critic used `##` on 3/5 runs and `**bold**` on 2/5; the baseline used `###` on 2/5 and `**bold**` on 3/5. `harsh-critic__plan-data-pipeline` mixes `##` sections with a `**bold**` Open Questions header inside one file. The §12.2 claim that the arms split cleanly by markdown style is **wrong** — the styles are mixed within both arms, so the section-bounds defect injected noise rather than a directional bias.
- **The verdict is not always on line 1** (line 5 and line 9 in two harsh-critic outputs) and appears as both `# VERDICT:` and `**VERDICT:**`.
- **Findings are not always prefixed `C1`/`M1`.** `harsh-critic__plan-auth-migration` numbers 1–9 straight through, Critical = 1–3 and Major = 4–9.
- **A missing severity section means zero, not a parse failure.** harsh-critic emitted no Critical section at all on the clean baseline.
- **Seeded flaws appear outside Critical/Major.** SF-2 on `plan-weak-justification` is a ground-truth MAJOR but lives in harsh-critic's Minor Findings; several `category: "missing"` flaws are answered from the What's Missing section.

---

## 3. `plan-clean-baseline` is not clean — the suite has no precision instrument

This was the fixture flagged in §12.4 as the one to watch. The result inverts the concern.

Both arms flagged findings on it. Before treating that as a false-positive problem, each finding was checked against the plan text. **Six are real**, and three were verified against sources outside the plan:

| Finding | Status |
|---|---|
| Core Thesis picks token bucket; Step 2 implements it with Kong `rate-limiting-advanced` | **Verified real.** That plugin supports `window_type: fixed\|sliding` only — window counters, not a token bucket. The plan names the algorithm it spent three paragraphs rejecting. |
| "probability of an incident during the 3-week grace period is low" | **Verified real.** 4 incidents / 3 months over a 3-week window is λ ≈ 0.92 → **~60% chance of at least one**. Not "low". |
| Week 2 "soft enforcement — return `429` ... Clients can opt in to respecting limits" | **Real.** A 429 is a rejection; a client cannot opt in to a request that already failed. Week 2 is indistinguishable from Week 3. |
| "95% reduction in API abuse incidents" on a baseline of 4 events | **Real.** 95% of 4 ≈ 0.2. Unmeasurable at that base rate. |
| `~0.1ms` token bucket vs `~3ms` sliding window | **Real.** The plan charges Redis latency to sliding window only, while Step 2 puts token-bucket state in the same Redis. Not a like-for-like comparison — and it is the plan's central decision. |
| Redis fail-open vs fail-closed | **Real.** Never stated. Step 2's rollback covers deliberately disabling the plugin, not Redis degrading. |

Both arms found the first, third, fourth and sixth **independently**. The baseline arm additionally derived the Poisson number and rated three of these CRITICAL.

Consequences:

1. **The fixture cannot measure precision.** Its ground truth declares `findings: []`, so every one of these correct findings scores as a false positive. The suite's only precision signal is measuring the wrong thing, and it penalises both arms for being right.
2. **Three false-positive traps are mis-specified.** The T3 trap protects the grace-period reasoning as "honest risk communication" when its arithmetic is wrong. On `plan-data-pipeline` the T2 trap protects z-score anomaly detection as terminating in "a reasonable axiom", but a stationary z-score on strongly seasonal metrics (conversion rate, cart abandonment) is a known false-positive generator — both arms said so. On `plan-api-redesign` the T6 trap protects Step 4's CDN caching as "industry-standard", but caching authenticated per-user GraphQL responses at a shared CDN without identity in the cache key is a real cross-user leak — both arms said so.
3. **The scorer rewards the harsher arm here.** The baseline scored 72.7% against harsh-critic's 70.6% on this fixture, despite returning REJECT with 3 CRITICALs where harsh-critic returned REVISE with none. REVISE is nearer the expected ACCEPT range. Whatever this fixture is currently measuring, it is not restraint.

**This fixture must be rebuilt or retired before any precision or false-positive-rate claim is made from this suite.**

---

## 4. Two defective ground-truth entries

**SF-3 on `plan-weak-justification` ("RabbitMQ retained by inertia") should be withdrawn.** Both arms examined the decision and judged it sound, in almost the same words — harsh-critic: "Keeping RabbitMQ ... is a reasonable, correctly-scoped decision"; baseline: "keeping RabbitMQ instead of chasing Kafka is a sound, well-reasoned restraint". The entry's own technical premise is also wrong: it asserts RabbitMQ's "at-most-once default", but RabbitMQ with acknowledgements is at-least-once. Both arms used the correct fact to derive a real finding (redelivery without an idempotency key produces duplicate user-visible notifications). Scoring SF-3 as a miss penalises both arms for being right.

**SF-5 on the same fixture is a keyword-matching failure, not a detection failure.** Both arms explicitly cover "no alternatives / no tradeoff analysis" — harsh-critic M5 "No cheaper alternative was evaluated; approach selection is a false dichotomy"; the baseline's What's Missing "Alternatives analysis — zero cheaper options considered before choosing a full rewrite". Neither matched. The keyword set (`tradeoff`, `no downsides`, `cost-benefit`, `single option`) does not fire on the vocabulary the models actually used.

---

## 5. The delta, and why it is not yet a result

```
29.7  original live run
20.5  after parser fix 1
15.4  after parser fixes 2-3
15.1  after D4 (bold lead-in findings restored)
 7.6  after D5 (consolidated findings may answer several flaws)
```

Current aggregate, re-scored offline from the saved outputs (no API calls):

| | composite | TPR | missing cov. | evidence | "FPR" |
|---|---|---|---|---|---|
| harsh-critic | 87.4% | 73.3% | 70.0% | 89.8% | 71.4% |
| baseline critic | 79.8% | 66.7% | 50.0% | 95.3% | 81.8% |
| **delta** | **7.6 pts** | | | | |

The D4 fix moved the delta 0.3 points — the first sign of convergence in the trend. D5 then moved it 7.5, because it corrected a defect that fell almost entirely on one arm.

**No delta is claimed from this.** Standing reasons:

- **n=1 per cell.** Ten calls, one sample each, on a stochastic system. Per-fixture deltas are noise at this size; upstream's README says run 3× and average. 7.6 points on n=1 is not distinguishable from zero.
- **Two of five fixtures are known-defective.** `plan-clean-baseline` is not clean (§3) and contributes ~70% composite to both arms for reasons unrelated to critique quality. `plan-weak-justification` has one withdrawn flaw and one unmatchable flaw (§4).
- **The "FPR" column is an unmatched-finding rate, not a noise rate.** It counts correct findings outside the ground-truth key as false positives. Given §3, it is currently meaningless.
- **Runner-bound.** `claude -p` carries ~50k tokens of ambient context the API path does not. Compare within a runner only.
- **Not comparable to the historical table** in `README.md` — the scorer was reweighted in `4e36ac2`.

Where the remaining difference actually sits, from the audit rather than the score: harsh-critic answered more of the seeded flaws on `plan-auth-migration` (SF-2 and SF-4 head-on, where the baseline addresses them only adjacently) and used the ACH vocabulary SF-3 keys on in `plan-api-redesign`. That is a real but narrow edge on two fixtures. **Expect the honest advantage to be modest, not the 48% the historical docs implied.**

---

## 6. Method note

The three fixes in `5202aae` were made while watching the delta move — defensible individually, wrong as a loop. This pass inverted the order: the audit was written first from reading, the counts became tests, the parser was fixed until the tests passed, and only then was anything re-scored. The one scorer change (D5) was made with its predicted direction recorded in advance; the prediction was right about direction and wrong about magnitude on one fixture, which is recorded above rather than smoothed away.

Re-scoring is free — the raw outputs are saved. There is no reason to spend quota to re-run before the fixture defects in §3 and §4 are fixed.
