# Pre-commitment: how the flaw matcher will be chosen

**Written:** 2026-09-01, before any candidate matcher was implemented or measured.
**Why it exists:** §13.5 of `upstream-omcc-critic-review.md` records two rounds in which
the instrument was adjusted while its effect on the delta was visible. Both were
defensible edit-by-edit and wrong as a loop. This file fixes the decision rule
before the numbers exist, so the choice cannot be fitted to the answer.

---

## 1. The problem being fixed

`matchFindings` decides whether an agent found a seeded flaw by substring-matching
a hand-written keyword set against one finding's text. §8.2 of
`captured-output-audit.md` shows the consequence: on `plan-api-redesign`, SF-3 is
answered by both arms, but harsh-critic wrote "zero payload reduction" (2 keywords,
match) and the baseline wrote "payload size reduced by 40%" (1 keyword, miss). That
single word form moves the suite delta 10.4 points — more than the entire measured
effect.

## 2. Candidates

Both are the options §13.6 names.

- **`keyword` (status quo).** Per-finding substring match, threshold `max(2, ceil(0.4n))`.
- **`accumulate`.** Same keywords and threshold, but distinct keyword hits accumulate
  across every finding in one output instead of requiring a single finding to carry
  the threshold. Deterministic, free, keeps offline re-scoring free.
- **`graded`.** A model judges, per seeded flaw, whether the review identifies it,
  and must return a verbatim quote from the review as evidence. Verdicts are cached
  by hash so scoring stays offline, free and reproducible after the first grading.

## 3. The judge

The hand audit in `captured-output-audit.md` §1 records, per captured output, which
seeded flaws that output genuinely addresses. Those labels were written by reading
the outputs, before any re-scoring, and are the only labels in this project not
derived from a score. They are the gold set.

Two label groups, both extracted mechanically from the audit table into
`scoring/gold-labels.json`:

- **Positives / negatives (in-fixture).** 30 (output × seeded flaw) pairs over the 8
  outputs that have seeded flaws. The audit marks two pairs "partial"; those are
  **excluded from scoring** and reported separately, because a partial is a judgment
  call and including it would let me tune against my own ambiguity.
- **Cross-fixture negatives.** Every seeded flaw tested against every captured output
  for a *different* fixture. A flaw from the auth plan must not fire on a review of
  the data pipeline. This exists because the positives are 27 YES to 1 NO — on that
  set alone, a matcher that returns YES to everything scores near-perfectly. The
  cross-fixture set is what makes looseness cost something.

The two `plan-clean-baseline` outputs are stale for *scoring* (they reviewed the
pre-rebuild plan) but remain valid *text* for cross-fixture negatives.

## 4. The decision rule, fixed now

```
score(matcher) = (gold-YES pairs matched) − (cross-fixture negatives fired)
```

Disqualifying constraints, applied before score:

1. **Arm symmetry.** Recall on gold-YES pairs may not differ between the two arms by
   more than one pair. The audit says both arms address nearly every seeded flaw; a
   matcher that recovers one arm and not the other is the §8.1 error repeated.
2. **Offline scoring.** A matcher that needs a live call at scoring time is
   disqualified. Caching satisfies this; grading is a separate, explicit step.

Ties go to the **deterministic** matcher — free, reproducible, no grader drift.

If no candidate beats `keyword`, `keyword` stays and §13.6 item 2 is reported as
attempted and failed.

## 5. Predictions, recorded before measurement

| | gold-YES recall (of 27) | cross-fixture false alarms (of ~120) |
|---|---|---|
| `keyword` | 26 — the known baseline SF-3 miss on `plan-api-redesign` | 0–2 |
| `accumulate` | 27 | **≥6** — this is the risk; pooling keywords over 20+ findings is a much lower bar than it looks |
| `graded` | 27 | 0–1 |

I expect `graded` to disagree with the audit on at least one of the two "partial"
pairs, in the generous direction.

If `accumulate` fires on fewer than 3 cross-fixture negatives I should be suspicious
of the cross-fixture set being too easy — five plan fixtures share a lot of
vocabulary, but they are still five different subjects — and say so rather than
treating a clean sheet as vindication.

## 6. Separately: when a delta may be reported at all

Also fixed now, before the 3× run's numbers exist:

- Per-cell mean and SD are reported for every cell. n=3.
- The suite delta is reported with a bootstrap 95% CI over cells.
- **A directional claim ("harsh-critic is better") is made only if that CI excludes
  zero.** Otherwise the result is reported as *not separable at n=3*, with the
  observed point estimate shown and labelled as such.
- The FPR column is reported only from `plan-clean-baseline`, and only from the
  outputs captured against the rebuilt plan.
