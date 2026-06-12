# Plan 004: Fix label-fragile false-positive chart badges

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat eacebfb..HEAD -- docs/index.html scripts tests plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-verify-prompt-surfaces.md`, `plans/003-historical-benchmark-provenance.md`
- **Category**: bug
- **Planned at**: commit `eacebfb`, 2026-06-12

## Why this matters

`docs/index.html` has a small but real public-doc bug: the false-positive chart checks labels that no longer exist in the data. As a result, intended direction badges never render. The stale `v2 target` label also conflicts with the page's "v2 actual" story. This is a concrete example of why plan 001 needs a verifier: hand-maintained static docs can silently rot.

## Current state

Relevant files:

- `docs/index.html` - static GitHub Pages benchmark chart page.
- `scripts/verify_surfaces.py` and `tests/test_verify_surfaces.py` - created by plan 001 and extended by plan 003.

Current excerpts:

```text
docs/index.html:371-374
<div class="legend-dot" style="background:var(--v2)"></div>
<span>harsh-critic v2 "Even Harsher" <span style="color:var(--muted);font-size:11px;margin-left:4px;">(targets)</span></span>
```

```text
docs/index.html:732-735
const data = [
  { label: 'Baseline',        val: 53.1, color: COLORS.baseline, note: '53.1%' },
  { label: 'v1 (sonnet)',     val: 40.5, color: COLORS.fprV1,    note: '40.5%' },
  { label: 'v2 (opus)',       val: 78.7, color: COLORS.fprV2,    note: '78.7%' },
];
```

```text
docs/index.html:808-816
if (d.label === 'v1') {
  ...
} else if (d.label === 'v2 target') {
  ...
}
```

Problem:

- Neither `v1` nor `v2 target` appears as a `data` label.
- Lower false-positive rate is better. `v1 (sonnet)` is lower than baseline, so it should get a "down/good" indicator. `v2 (opus)` is higher than baseline, so it should get an "up/bad" indicator or no positive badge.
- The legend still says `(targets)` even though the page body says `v2 actual`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Verifier | `python3 scripts/verify_surfaces.py` | exit 0; chart-label drift check passes |
| Tests | `python3 -m unittest discover -s tests` | exit 0 |
| Label scan | `rg -n "d\\.label ===|v2 target|\\(targets\\)" docs/index.html` | no matches |
| New data scan | `rg -n "badge|fprChart|v2 \\(opus\\)|v1 \\(sonnet\\)" docs/index.html` | shows data-driven badge fields and labels |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope**:

- `docs/index.html`
- `scripts/verify_surfaces.py`
- `tests/test_verify_surfaces.py`
- `plans/README.md` status row

**Out of scope**:

- Do not change benchmark numbers.
- Do not redesign the chart or page.
- Do not add JavaScript dependencies.
- Do not edit `docs/protocol.html`; benchmark caveats are handled by plan 003.

## Git workflow

- Branch: `codex/fix-fpr-chart-labels`
- Commit style: conventional commits. Use `fix: make FPR chart badges data-driven`.
- Keep this as one focused commit.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Make the legend match the current story

In `docs/index.html`, update the v2 legend pill so it does not say `(targets)`.

Acceptable replacement:

```html
<span>harsh-critic v2 "Even Harsher" <span style="color:var(--muted);font-size:11px;margin-left:4px;">(actual)</span></span>
```

or remove the parenthetical entirely.

**Verify**: `rg -n "v2 target|\\(targets\\)" docs/index.html` -> no matches.

### Step 2: Replace label comparisons with data-driven badge metadata

In `drawFPRChart()`, change the `data` array from label-only logic to explicit badge metadata.

Target shape:

```javascript
const data = [
  { label: 'Baseline',    val: 53.1, color: COLORS.baseline, note: '53.1%', badge: null },
  { label: 'v1 (sonnet)', val: 40.5, color: COLORS.fprV1,    note: '40.5%', badge: 'down-good' },
  { label: 'v2 (opus)',   val: 78.7, color: COLORS.fprV2,    note: '78.7%', badge: 'up-bad' },
];
```

Then change the direction-badge rendering to check `d.badge`, not `d.label`.

Required behavior:

- `down-good` renders a green-ish circle with a down arrow.
- `up-bad` renders a red-ish circle with an up arrow.
- `null` renders no badge.

Do not leave any `d.label === ...` condition in the chart rendering code.

**Verify**:

```bash
rg -n "d\\.label ===|v2 target|\\(targets\\)" docs/index.html
```

Expected: no matches.

### Step 3: Extend the verifier

Update `scripts/verify_surfaces.py`.

Add a concrete `docs false-positive chart label drift` check and remove that label from `KNOWN_FOLLOWUP_CHECKS`.

The check should:

- Read `docs/index.html`.
- Fail if it contains `d.label ===`.
- Fail if it contains `v2 target` or `(targets)`.
- Require `badge: 'down-good'` and `badge: 'up-bad'` to appear.
- Optionally require both `v1 (sonnet)` and `v2 (opus)` to remain present.

Add unit tests for the helper using small HTML/JS snippets.

**Verify**:

```bash
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
```

Expected: both commands exit 0.

### Step 4: Run final checks

Run:

```bash
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
rg -n "d\\.label ===|v2 target|\\(targets\\)" docs/index.html
git diff --check
```

**Verify**:

- The verifier and tests exit 0.
- The `rg` command for stale labels returns no matches. `rg` exits 1 when no matches are found; that is the expected result for this specific scan.
- `git diff --check` exits 0.

## Test plan

- Extend `tests/test_verify_surfaces.py` with a helper test that fails on stale `d.label === 'v2 target'` snippets.
- Add a positive helper test with `badge: 'down-good'` and `badge: 'up-bad'`.
- Keep the full verifier subprocess test from plan 001.
- Verification: `python3 -m unittest discover -s tests` -> all tests pass.

## Done criteria

- [ ] `docs/index.html` contains no `d.label ===` chart badge comparisons.
- [ ] `docs/index.html` contains no `v2 target` or `(targets)` text.
- [ ] FPR chart data uses explicit badge metadata for `down-good` and `up-bad`.
- [ ] `python3 scripts/verify_surfaces.py` enforces the chart-label drift check and exits 0.
- [ ] `python3 -m unittest discover -s tests` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] No files outside the in-scope list are modified, except `plans/README.md` for the status row.

## STOP conditions

Stop and report back if:

- Plan 001 has not been completed and `scripts/verify_surfaces.py` does not exist.
- Plan 003 has not been completed and `docs/index.html` still needs benchmark caveat edits.
- `drawFPRChart()` has been removed or replaced by a different charting implementation.
- The page now intentionally represents v2 as a target instead of an actual run; that contradicts the current audit evidence and needs a product decision.
- You need a browser or visual regression harness to complete this safely; report that instead of adding dependencies ad hoc.

## Maintenance notes

- The durable fix is to avoid label-string conditionals for chart behavior. Labels are presentation; behavior should live in explicit metadata.
- Reviewers should verify that `down-good` and `up-bad` match the semantics of the metric: for false-positive rate, lower is better.
- If future docs move chart data into JSON, update the verifier to inspect the JSON source instead of HTML text.
