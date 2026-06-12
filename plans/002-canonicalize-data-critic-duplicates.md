# Plan 002: Canonicalize duplicate data-critic surfaces

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat eacebfb..HEAD -- data-critic zivtech-data-skills AGENTS.md scripts tests plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-verify-prompt-surfaces.md`
- **Category**: tech-debt
- **Planned at**: commit `eacebfb`, 2026-06-12

## Why this matters

The repo advertises duplicate `data-critic` surfaces, but the duplicates are not behavior-equivalent. That means a user can install from one listed path and get companion-skill routing, spec-kitty output compatibility, and severity examples; installing from the other listed path omits those behaviors. This is exactly the kind of rank erosion the repo is supposed to prevent: repeated surfaces look aligned while the useful protocol has diverged.

This plan makes the canonical rule explicit and adds a verifier check so the drift does not return silently.

## Current state

Relevant files:

- `AGENTS.md` - lists both `data-critic/` and `zivtech-data-skills/critic/` as present duplicates.
- `data-critic/.claude/skills/data-critic/SKILL.md` - root duplicate skill.
- `data-critic/.claude/agents/data-critic.md` - root duplicate agent.
- `zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md` - richer nested skill.
- `zivtech-data-skills/critic/.claude/agents/data-critic.md` - richer nested agent.
- `scripts/verify_surfaces.py` and `tests/test_verify_surfaces.py` - created by plan 001.

Current excerpts:

```text
AGENTS.md:28-33
| data-critic | critic | Claude agent | `data-critic/.claude/agents/data-critic.md` | present duplicate | Data/math correctness review |
| data-critic | critic | Claude skill | `data-critic/.claude/skills/data-critic/SKILL.md` | present duplicate | Data/math correctness review skill |
...
| data-critic | critic | Claude agent | `zivtech-data-skills/critic/.claude/agents/data-critic.md` | present duplicate | Data/math correctness review |
| data-critic | critic | Claude skill | `zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md` | present duplicate | Data/math correctness review skill |
```

Root duplicate currently jumps straight from `Best_Times_To_Use` to `Steps`:

```text
data-critic/.claude/skills/data-critic/SKILL.md:63-68
<Steps>
1. **Identify the target**: Determine what code needs review...
2. **Read the work**: If user provides a file path, read it...
3. **Route to reviewer agent**: Delegate the review to a subagent...
```

Nested canonical candidate has companion-skill guidance before `Steps`:

```text
zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md:63-100
<Companion_Skills>
The data-critic is designed to leverage external skills when they are installed...
...
See SKILLS-INVENTORY.md in the parent zivtech-data-skills repo for the full catalog with installation instructions.
</Companion_Skills>
```

The nested skill also includes the spec-kitty output note:

```text
zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md:289-293
NOTE: When output will be consumed by spec-kitty-bridge, use heading-level markers:
`# Verdict: [ACCEPT | ACCEPT-WITH-RESERVATIONS | REVISE | REJECT]` (h1 heading)
`## Findings` (group all findings under this heading)
`## Summary` (in addition to Verdict Justification)
Otherwise, the bold-text format below is the default.
```

Agent drift also exists: the nested agent has a `<Severity_Calibration_Examples>` block that the root duplicate lacks.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat eacebfb..HEAD -- data-critic zivtech-data-skills AGENTS.md scripts tests plans/README.md` | review output before editing |
| Verifier | `python3 scripts/verify_surfaces.py` | exit 0; data-critic duplicate check passes |
| Tests | `python3 -m unittest discover -s tests` | exit 0 |
| Diff sanity | `git diff --check` | exit 0 |
| Drift proof | `diff -u <(sed -n '/<Data_Review_Protocol>/,/<\\/Data_Review_Protocol>/p' data-critic/.claude/skills/data-critic/SKILL.md) <(sed -n '/<Data_Review_Protocol>/,/<\\/Data_Review_Protocol>/p' zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md)` | no output |

If your shell does not support process substitution for the drift proof, run equivalent `sed` commands into temporary files outside the repo or compare with a short Python one-liner.

## Scope

**In scope**:

- `data-critic/.claude/skills/data-critic/SKILL.md`
- `data-critic/.claude/agents/data-critic.md`
- `data-critic/CLAUDE.md`
- `AGENTS.md`
- `scripts/verify_surfaces.py`
- `tests/test_verify_surfaces.py`
- `plans/README.md` status row

**Out of scope**:

- Do not rewrite unrelated domain skills.
- Do not remove either duplicate path in this plan.
- Do not change `zivtech-data-skills/critic/` unless you find a typo introduced by copying evidence; it is the canonical behavioral source for this plan.
- Do not add packaging, symlinks, or generated build artifacts.

## Git workflow

- Branch: `codex/canonicalize-data-critic`
- Commit style: conventional commits. Use `fix: align duplicate data-critic surfaces`.
- Keep this as one focused commit.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Record the canonical rule

Update `AGENTS.md` near the duplicate rows or in the duplicate note to state:

- `zivtech-data-skills/critic/` is the canonical behavioral source for `data-critic`.
- The root `data-critic/` directory is a compatibility mirror.
- The two surfaces may differ only in local path/context notes; the review protocol and agent behavior must stay equivalent.
- `scripts/verify_surfaces.py` enforces the load-bearing equivalence checks.

Update `data-critic/CLAUDE.md` with the same rule so future prompt editors see it when working inside the root duplicate directory.

**Verify**: `rg -n "canonical behavioral source|compatibility mirror|verify_surfaces" AGENTS.md data-critic/CLAUDE.md` -> finds the new rule in both files.

### Step 2: Align the root duplicate skill with the canonical behavior

Update `data-critic/.claude/skills/data-critic/SKILL.md` using `zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md` as the source.

Required changes:

- Add the `<Companion_Skills>` block from the nested skill.
- In the final sentence of that block, use an accurate repo-relative path:
  `See \`zivtech-data-skills/SKILLS-INVENTORY.md\` for the full catalog with installation instructions.`
- Update the numbered `<Steps>` so step 2 checks companion skills and the later steps are renumbered, matching the nested skill behavior.
- Add the spec-kitty heading-level output note before `Structure output as:`.

Do not change unrelated wording in the protocol unless needed to make the load-bearing behavior match.

**Verify**:

```bash
rg -n "<Companion_Skills>|verification-before-completion|spec-kitty-bridge|zivtech-data-skills/SKILLS-INVENTORY.md" data-critic/.claude/skills/data-critic/SKILL.md
```

Expected: all four patterns appear.

### Step 3: Align the root duplicate agent with the canonical behavior

Update `data-critic/.claude/agents/data-critic.md` using `zivtech-data-skills/critic/.claude/agents/data-critic.md` as the source for the load-bearing protocol.

Required change:

- Add the `<Severity_Calibration_Examples>` block that exists in the nested agent after the Realist Check recalibration rules.

If additional behavioral differences appear when comparing the two `<Agent_Prompt>` blocks, either align them or stop and report if the difference requires a product decision.

**Verify**:

```bash
rg -n "<Severity_Calibration_Examples>|Floating-point arithmetic on currency values|Discount applied after tax" data-critic/.claude/agents/data-critic.md
```

Expected: all three patterns appear.

### Step 4: Extend the verifier

Update `scripts/verify_surfaces.py` from plan 001.

Add a concrete `data-critic duplicate behavioral drift` check and remove that label from `KNOWN_FOLLOWUP_CHECKS`.

The check should:

- Extract and compare the `<Data_Review_Protocol>` block from both skill files.
- Extract and compare the `<Agent_Prompt>` block from both agent files, or if exact comparison is too noisy, require both agent prompts to contain the same `<Severity_Calibration_Examples>` block.
- Assert the root skill contains `<Companion_Skills>`, `verification-before-completion`, `systematic-debugging`, and `spec-kitty-bridge`.
- Fail with a message that names both compared paths when drift is detected.

Add unit tests in `tests/test_verify_surfaces.py` for the new helper that extracts XML-ish blocks.

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
git diff --check
```

**Verify**: all commands exit 0.

## Test plan

- Extend `tests/test_verify_surfaces.py` with tests for block extraction and the data-critic duplicate check.
- Use small inline strings for the helper test so the test does not become a brittle full-file snapshot.
- Keep one integration-style test that runs the full verifier against the repo.
- Verification: `python3 -m unittest discover -s tests` -> all tests pass.

## Done criteria

- [ ] `AGENTS.md` and `data-critic/CLAUDE.md` state the canonical/mirror rule.
- [ ] Root `data-critic/.claude/skills/data-critic/SKILL.md` includes companion-skill guidance and spec-kitty output compatibility.
- [ ] Root `data-critic/.claude/agents/data-critic.md` includes severity calibration examples equivalent to the nested canonical agent.
- [ ] `python3 scripts/verify_surfaces.py` enforces the duplicate behavioral check and exits 0.
- [ ] `python3 -m unittest discover -s tests` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] No files outside the in-scope list are modified, except `plans/README.md` for the status row.

## STOP conditions

Stop and report back if:

- Plan 001 has not been completed and `scripts/verify_surfaces.py` does not exist.
- The nested `zivtech-data-skills/critic` files have changed enough that they no longer contain the current-state blocks.
- Exact protocol alignment would make the root duplicate contain path-specific statements that are false for its location.
- You find evidence that `data-critic/` is supposed to be canonical instead of `zivtech-data-skills/critic/`.
- The fix appears to require removing one of the duplicate paths; that is a separate product decision.

## Maintenance notes

- The verifier should compare load-bearing protocol sections, not every byte of surrounding local documentation. Exact whole-file identity is fragile when path-specific notes are valid.
- Future edits to either data-critic surface should be made in the canonical nested path first, then mirrored intentionally.
- Reviewers should scrutinize whether new behavior lands in only one duplicate surface.
