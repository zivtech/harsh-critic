# Plan 003: Downgrade public benchmark claims to historical evidence

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat eacebfb..HEAD -- docs README.md AGENTS.md CLAUDE.md scripts tests plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-verify-prompt-surfaces.md`
- **Category**: docs
- **Planned at**: commit `eacebfb`, 2026-06-12

## Why this matters

The repo's README and registry are careful: benchmark numbers are historical because the raw artifact is not present. The published HTML is less careful and reads like current, verified benchmark evidence. That is not a harmless copy issue; it undermines the repo's core promise that claims must be evidence-bound. This plan either adds visible historical/provenance caveats to the public docs or stops if the missing raw artifact has been restored and the right fix is to link/rebuild from it.

## Current state

Relevant files:

- `README.md` - already warns that the raw benchmark artifact is absent.
- `AGENTS.md` - already warns that fixture counts and scores are historical until raw results are restored.
- `docs/index.html` - public benchmark-results page without the same caveat.
- `docs/protocol.html` - public protocol explainer with benchmark stats without the same caveat.
- `scripts/verify_surfaces.py` and `tests/test_verify_surfaces.py` - created by plan 001.

Current excerpts:

```text
README.md:40
The repository contains historical benchmark notes for `harsh-critic` against OMC's built-in `critic`. The raw benchmark artifact referenced by older docs is not present in this checkout, so these numbers should be treated as historical notes until the benchmark harness and results are restored.
```

```text
AGENTS.md:61
Older docs and prompt blocks include historical benchmark numbers for `harsh-critic`. The raw benchmark artifact referenced in those notes is not present in this checkout, so fixture counts and benchmark scores should be treated as historical until the harness and raw results are restored.
```

```text
docs/index.html:356-358
The hero badge contains "Benchmark Results", the h1 starts "harsh-critic Performance", and the hero copy says "Quantified evaluation of code review quality..." without the historical/raw-artifact caveat from README.md.
```

```text
docs/index.html:563-564
The footer links to "github.com/zivtech/harsh-critic" and says "Benchmark run: March 2026", "Model: Claude Opus 4", and "Evaluation set: n=24 items across 3 domains" without marking the run as a historical snapshot.
```

```text
docs/protocol.html:656-671
<div class="stat-bar">
  <div class="stat anim-scale" style="--i:2">
    <div class="number">58.6%</div>
    <div class="label">Composite score</div>
...
    <div class="number">33 vs 0</div>
    <div class="label">Gap items (A/B test)</div>
```

The referenced raw artifact is absent in this checkout:

```text
benchmarks/harsh-critic/results/realist-check-run/results_2026-03-05_04-04-23.json
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Artifact check | `test ! -e benchmarks/harsh-critic/results/realist-check-run/results_2026-03-05_04-04-23.json` | exit 0 |
| Verifier | `python3 scripts/verify_surfaces.py` | exit 0; benchmark provenance check passes |
| Tests | `python3 -m unittest discover -s tests` | exit 0 |
| Caveat scan | `rg -n "historical|raw artifact|not present|not current|benchmark harness" docs/index.html docs/protocol.html` | finds visible caveat text in both docs |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope**:

- `docs/index.html`
- `docs/protocol.html`
- `scripts/verify_surfaces.py`
- `tests/test_verify_surfaces.py`
- `plans/README.md` status row

**Out of scope**:

- Do not restore or invent benchmark fixtures.
- Do not change the benchmark numbers themselves unless you have restored source data and rerun the benchmark in a separate plan.
- Do not edit prompt/skill benchmark blocks in `.claude/` or `.agents/`; those already identify the snapshot as historical and absent-source.
- Do not change the chart bug in `docs/index.html`; that is plan 004.

## Git workflow

- Branch: `codex/historical-benchmark-caveats`
- Commit style: conventional commits. Use `docs: label benchmark pages as historical`.
- Keep this as one focused commit.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Confirm whether this is a caveat fix or a provenance restoration

Run:

```bash
test ! -e benchmarks/harsh-critic/results/realist-check-run/results_2026-03-05_04-04-23.json
```

If the command exits 0, continue with this caveat plan.

If the command exits nonzero because the raw artifact now exists, STOP. The correct plan changes: the docs should link to or regenerate from the restored artifact instead of merely adding caveats.

**Verify**: absent artifact confirmed before editing.

### Step 2: Add visible historical caveats to `docs/index.html`

Update `docs/index.html` so the page labels the benchmark as a historical snapshot, not current proof.

Required edits:

- Change the badge text from "Benchmark Results . March 2026" to "Historical Benchmark Notes . March 2026" or equivalent.
- Add one visible sentence near the hero copy:
  `These numbers are historical notes. The raw benchmark artifact is not present in this checkout, so treat the scores as context until the benchmark harness and results are restored.`
- Update the footer line that starts `Benchmark run:` to include `historical snapshot` and `raw artifact absent in this checkout`.

Do not remove the existing numbers; the point is provenance, not erasure.

**Verify**:

```bash
rg -n "Historical Benchmark|raw benchmark artifact|historical snapshot|raw artifact absent" docs/index.html
```

Expected: at least two matches in `docs/index.html`.

### Step 3: Add visible historical caveats to `docs/protocol.html`

Update `docs/protocol.html` so the stat bar is explicitly framed as historical.

Required edits:

- Add a short caveat under the hero lead or immediately before the stat bar.
- The caveat must include the phrases `historical` and `raw artifact` so the verifier can check it.
- Keep the stat bar intact, but avoid presenting the numbers as current or latest.

Example copy:

```html
<p class="lead">Historical benchmark notes: the raw artifact for these scores is not present in this checkout, so treat the numbers as context until the benchmark harness and results are restored.</p>
```

Use the existing page style; do not add new dependencies.

**Verify**:

```bash
rg -n "historical|raw artifact|benchmark harness" docs/protocol.html
```

Expected: the new caveat appears.

### Step 4: Extend the verifier

Update `scripts/verify_surfaces.py`.

Add a concrete `public benchmark provenance caveats` check and remove that label from `KNOWN_FOLLOWUP_CHECKS`.

The check should:

- If `benchmarks/harsh-critic/results/realist-check-run/results_2026-03-05_04-04-23.json` is absent, require both `docs/index.html` and `docs/protocol.html` to contain:
  - `historical`
  - `raw artifact`
- If the artifact is present, print a warning that docs should be reviewed against the restored source, but do not silently pass a stale caveat as proof of regeneration.
- Fail with a path-specific message when a public doc contains benchmark numbers without the caveat.

Add unit tests for the caveat helper using small sample strings.

**Verify**:

```bash
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
```

Expected: both commands exit 0.

### Step 5: Run final checks

Run:

```bash
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
rg -n "historical|raw artifact|not present|benchmark harness" docs/index.html docs/protocol.html
git diff --check
```

**Verify**: all commands exit 0; `rg` shows caveat text in both public docs.

## Test plan

- Extend `tests/test_verify_surfaces.py` with a pure helper test for benchmark-caveat validation.
- Keep the full verifier subprocess test from plan 001.
- Verification: `python3 -m unittest discover -s tests` -> all tests pass.

## Done criteria

- [ ] `docs/index.html` visibly states the benchmark numbers are historical and raw artifact is absent.
- [ ] `docs/protocol.html` visibly states the benchmark numbers are historical and raw artifact is absent.
- [ ] `python3 scripts/verify_surfaces.py` enforces benchmark provenance caveats and exits 0.
- [ ] `python3 -m unittest discover -s tests` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] No files outside the in-scope list are modified, except `plans/README.md` for the status row.

## STOP conditions

Stop and report back if:

- Plan 001 has not been completed and `scripts/verify_surfaces.py` does not exist.
- The raw benchmark artifact exists in this checkout.
- The docs have been redesigned and the current-state HTML snippets no longer exist.
- You cannot add caveats without making a stronger claim than the source evidence supports.
- You find another public page with the same benchmark numbers; report it instead of expanding scope silently.

## Maintenance notes

- The negative space matters: this plan is not claiming the benchmark numbers are false. It is claiming this checkout cannot currently prove them.
- Future benchmark work should restore fixtures/results/harness and then update the docs from source evidence, not from hand-copied numbers.
- Reviewers should reject any future copy that says "latest", "current", or "proven" for these scores unless the raw artifact and harness are present.
