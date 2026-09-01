# harsh-critic

harsh-critic is a multi-surface critic/planner skillset for Claude Code, Codex, and local `.agents` installs, centered on `harsh-critic` and `proposal-critic` with synced domain planners and critics. The shared aim is evidence-backed review and planning: structured gap analysis, multi-perspective investigation, calibrated verdicts, and explicit checks for what is missing.

Despite the name, this is not about being harsh for its own sake. The useful part is disciplined review structure: pre-commitment predictions, claim verification, gap analysis, evidence requirements, self-audit, and realist severity calibration. The result is a reviewer that is precise by default and adversarial only when the evidence warrants it.

**[Visual protocol explainer](https://zivtech.github.io/harsh-critic/protocol.html)** — interactive diagram of the core investigation protocol.

## Current Surfaces

This repo currently keeps several prompt surfaces aligned:

- `.claude/skills/` and `.claude/agents/`: primary Claude Code skill and agent prompts.
- `.agents/skills/`: local agent-skill mirror for environments that read `.agents`.
- `.codex/agents/`: Codex agent wrapper TOML files for the root critics.
- Synced domain directories: accessibility, React, Drupal, performance, data, and proposal planning skills.
- `AGENTS.md`: inventory of the present skill and agent surfaces.
- `docs/`: published protocol/benchmark explainer pages.

The surfaces are maintained together in this repository for now. Generator automation may replace manual synchronization later, but the current repo truth is the checked-in files.

## The Problem With Standard Reviews

LLM-based reviewers often evaluate what is present and under-report what is absent. They scan through code or plans, comment on visible issues, and move on. The result is that whole categories of issues — missing error handling, unstated assumptions, absent edge cases, incomplete rollback paths — go unreported because the reviewer was never forced to look for them.

## Core Critics

`harsh-critic` reviews code, plans, and analysis. It uses a five-phase protocol:

1. Pre-commitment predictions.
2. Verification of technical claims against the artifact or codebase.
3. Multi-perspective review, using security/new-hire/ops for code and executor/stakeholder/skeptic for plans.
4. Gap analysis focused on what is missing.
5. Synthesis into a calibrated verdict.

`proposal-critic` is the plan-focused sibling. It applies pre-mortems, assumptions analysis, Socratic deconstruction, competing alternatives, murder-board review, backcasting, and calibrated verdicts to plans, proposals, and specs.

## Historical Benchmarks

The repository contains historical benchmark notes for `harsh-critic` against OMC's built-in `critic`. The raw benchmark artifact referenced by older docs is not present in this checkout, so these numbers remain historical notes.

**These deltas do not measure gap-detection quality.** The harness has since been restored (see below), and reviewing its scorer surfaced two reasons the comparison was structurally unfair to the `critic` arm:

1. The composite awards 40% of its weight to `missingCoverage` (20%), `perspectiveCoverage` (10%), and process compliance (10%). The pre-consolidation `critic` emitted a `**[OKAY / REJECT]**` verdict with no What's Missing section, no perspective notes, and no pre-commitment step — so its output format could not express those dimensions at all. Its score was capped by format, not by review quality.
2. The scorer's false-positive rate counts any finding that fails to keyword-match the answer key, without assessing correctness. A reviewer that finds more real issues scores worse on it.

Treat the table as a record of what was run, not as evidence that one prompt detects more than the other. A corrected re-run is pending.

| Run | What changed | Model | harsh-critic composite | OMC critic composite | Delta | Win/Loss/Tie |
|---|---|---|---:|---:|---:|---:|
| Initial benchmark (2026-03-03 12:49) | Original parser + scorer | `claude-sonnet-4-6` | 22.1% | 13.8% | +8.4% | 5/1/2 |
| Parser-hardening rerun (2026-03-03 23:35) | Improved parsing for markdown variants | `claude-opus-4-6` | 55.9% | 7.8% | +48.1% | 8/0/0 |
| Scorer-calibration rerun (2026-03-03 23:54) | Calibrated keyword match thresholds | `claude-opus-4-6` | 24.7% | 13.8% | +10.9% | 4/1/3 |

The parser and scorer reruns were isolated experiments, not cumulative releases.

## Benchmark Harness

The harness is restored from `yeachan-heo/oh-my-claudecode` @ `e9e8fa38`, with local fixes recorded inline as `LOCAL FIX` comments.

```bash
npm install
npm test                                                   # 74 tests, no API key needed
npx tsx benchmarks/harsh-critic/run-benchmark.ts --dry-run  # validate the pipeline
npm run bench                                              # live run; needs ANTHROPIC_API_KEY
```

`harsh-critic` is benchmarked from the **live** prompt at `.claude/agents/harsh-critic.md`. Comparison baselines are pinned snapshots under `benchmarks/harsh-critic/prompts/`: `critic.md` (upstream's current consolidated critic) and `critic-legacy.md` (the pre-consolidation critic, for reproducing the historical runs above).

Five scorer defects were found and fixed; all are documented in `research/upstream-omcc-critic-review.md` §4 and §9. Two changed how scores are computed:

- **Composite renormalisation.** A dimension a fixture cannot express is now excluded rather than scored zero. Previously a perfect clean-baseline run — correct `ACCEPT`, no spurious findings, full protocol compliance — scored 0.35/1.00 and was averaged into the aggregate. It now scores 1.00.
- **False positives are only claimed where they can be shown.** The old `falsePositiveRate` counted any finding that missed the answer key, so surfacing real unlisted issues lowered the score. That quantity is now `unmatchedFindingRate`, reported as a diagnostic and weighted nowhere. `falsePositiveRate` is computed only on clean baselines, where the fixture is built to contain no genuine issues, and honours an `allowedObservations` list so a fair minor observation is not charged as a hallucination.

Because the weighting changed, scores from this harness are not comparable to the historical table above.

## Plan Critique Research

The repository also includes a plan-critique technique research packet:

- `research/critique-techniques.md`: source research on stronger plan-review techniques.
- `research/plan-critique-techniques/`: testing plan, change proposal, and validation summary.
- `benchmarks/harsh-critic/`: five synthetic plan fixtures, expected outputs, prompts, and staged validation results for the technique work.

## Included Skillset

Root critics:

- `harsh-critic`: evidence-backed critic for code, plans, and analysis.
- `proposal-critic`: evidence-backed critic for plans, proposals, and specs.

Synced domain skills:

- `a11y-critic` and `a11y-planner`.
- `react-planner`.
- `drupal-planner`.
- `perf-critic`.
- `data-critic` and `data-planner`.
- `plan-writer`.

See `AGENTS.md` for the current path-level inventory.

## Install

For Claude Code, copy the desired `.claude/skills/*` and `.claude/agents/*` entries into the matching directories under `~/.claude/`.

For local agent-skill environments, use the checked-in `.agents/skills/*` entries.

For Codex agent wrappers, use the checked-in `.codex/agents/*.toml` files.

## Usage

Examples:

```bash
/harsh-critic path/to/plan.md
/harsh-critic src/api/handler.ts
/proposal-critic docs/architecture-proposal.md
```

Use `harsh-critic` right before merge/deploy for risky code paths, as a second-pass adversarial check, or when another agent's output may have gaps. Use `proposal-critic` when the target is a plan, proposal, spec, or RFC.

## Verify

This repo has no application build system. Use the local verifier and tests to check prompt-surface integrity:

```bash
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
git diff --check
```

## Compatibility

- Claude Code: primary skill and agent prompt surface.
- Codex: root critic agent wrappers are provided in `.codex/agents`.
- Local `.agents`: root skill mirrors are provided in `.agents/skills`.
- oh-my-claudecode: root Claude skills still describe the OMC review-lane routing used by the original Claude Code workflow.

## License

Apache 2.0
