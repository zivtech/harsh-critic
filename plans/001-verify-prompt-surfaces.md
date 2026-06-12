# Plan 001: Establish a prompt-surface verification baseline

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report - do not improvise. When done, update the status row for this plan in `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat eacebfb..HEAD -- README.md CLAUDE.md AGENTS.md .codex/agents .github/workflows docs data-critic zivtech-data-skills scripts tests`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `eacebfb`, 2026-06-12

## Why this matters

This repo has no application build system; its product is a set of prompt, skill, agent, registry, and static-doc surfaces that must stay aligned. Today that alignment is maintained by human memory and prose rules. That is brittle: it lets public docs, duplicate skills, Codex wrappers, and registry rows drift without any local command catching it. The first improvement is a lightweight Python verifier that gives later plans a place to encode these checks.

This plan does not fix the known drift findings by itself. It creates the baseline verifier and documentation that plans 002-004 will extend.

## Current state

Relevant files:

- `CLAUDE.md` - repo guidance; states there is no application build system and surfaces must stay aligned.
- `AGENTS.md` - registry of prompt surfaces.
- `.github/workflows/pages.yml` - only deploys `docs/**` to GitHub Pages.
- `.codex/agents/*.toml` - Codex wrappers that should parse as TOML.
- `docs/` - static GitHub Pages content.

Current excerpts:

```text
CLAUDE.md:9
There is no application build system in this repo, but there are multiple prompt surfaces and registry documents that must stay aligned.
```

```text
CLAUDE.md:53-54
- When changing project positioning or descriptions, update `README.md`, `CLAUDE.md`, `AGENTS.md`, root `.claude` skills/agents, `.agents` mirrors, and `.codex` wrappers together.
- Do not describe benchmark data as current or latest unless the referenced raw artifact exists in this checkout.
```

```text
AGENTS.md:67-70
1. Keep `README.md`, `CLAUDE.md`, this registry, root `.claude` surfaces, `.agents` mirrors, and `.codex` wrappers aligned when changing repo positioning.
2. Mark missing companions as external or planned; do not list absent paths as present.
3. Keep local junk out of Git: `.DS_Store`, `.fuse_hidden*`, and `.claude/settings.local.json`.
4. Treat `.agents/` and `.codex/` as first-class project scaffolding in this repo.
```

```text
.github/workflows/pages.yml:3-7
on:
  push:
    branches: [main]
    paths: [docs/**]
  workflow_dispatch:
```

Recon facts:

- There is no `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile`, or existing test suite in the tracked repo.
- `python3 -c "import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path('.codex/agents').glob('*.toml')]; print('codex toml ok')"` currently exits 0 and prints `codex toml ok`.
- `git diff --check` currently exits 0.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Python version | `python3 -c "import sys; assert sys.version_info >= (3, 11), sys.version"` | exit 0 |
| Verifier | `python3 scripts/verify_surfaces.py` | exit 0 and prints an `OK:` summary |
| Unit tests | `python3 -m unittest discover -s tests` | exit 0, all tests pass |
| TOML smoke test | `python3 -c "import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path('.codex/agents').glob('*.toml')]; print('codex toml ok')"` | prints `codex toml ok` |
| Whitespace | `git diff --check` | exit 0, no output |

## Scope

**In scope**:

- `scripts/verify_surfaces.py` (create)
- `tests/test_verify_surfaces.py` (create)
- `README.md`
- `CLAUDE.md`
- `plans/README.md` status row

**Out of scope**:

- Do not modify prompt content in `.claude/`, `.agents/`, `.codex/`, or domain skill folders.
- Do not fix `data-critic` duplicate drift; that is plan 002.
- Do not edit benchmark copy in `docs/`; that is plan 003.
- Do not fix the chart-label bug in `docs/index.html`; that is plan 004.
- Do not add package managers, dependencies, generated lockfiles, or CI workflows.

## Git workflow

- Branch: `codex/verify-prompt-surfaces`
- Commit style: conventional commits. Use `test: add prompt surface verifier`.
- Keep the commit focused on the verifier and documentation.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Create the verifier script

Create `scripts/verify_surfaces.py` using only the Python standard library. Require Python 3.11+ so `tomllib` is available.

Implement these checks:

1. Registry path check:
   - Read `AGENTS.md`.
   - Extract backtick paths from rows whose status column contains `present`.
   - For each extracted path, assert `(repo_root / path).exists()`.
   - Exclude non-path backticks outside table rows.

2. Codex TOML check:
   - Parse every `.codex/agents/*.toml` file with `tomllib.loads`.
   - Assert each has `name`, `description`, and `developer_instructions`.

3. Pages workflow check:
   - Read `.github/workflows/pages.yml`.
   - Assert it contains `paths: [docs/**]`.
   - Assert it contains `actions/upload-pages-artifact@v3` and `path: docs`.

4. Ignored-junk check:
   - Use `git check-ignore` to assert `.DS_Store`, `.claude/settings.local.json`, and `.fuse_hidden-example` are ignored by the repo's `.gitignore`.

5. Extension-point reporting:
   - Include a `KNOWN_FOLLOWUP_CHECKS` list with these exact labels:
     - `data-critic duplicate behavioral drift`
     - `public benchmark provenance caveats`
     - `docs false-positive chart label drift`
   - Print those as "not yet enforced" warnings, but do not fail on them in this plan.
   - Plans 002-004 will convert those labels into real checks.

The script should print one concise success line, for example:

```text
OK: registry paths, codex TOML, Pages workflow, and ignore rules verified. 3 follow-up checks not yet enforced.
```

**Verify**: `python3 scripts/verify_surfaces.py` -> exit 0 and prints an `OK:` summary.

### Step 2: Add unit tests for the verifier

Create `tests/test_verify_surfaces.py` using `unittest`.

Include tests that:

- Run `python3 scripts/verify_surfaces.py` as a subprocess from the repo root and assert exit code 0.
- Assert the verifier output contains `OK:`.
- Import the verifier module and test at least one pure helper, such as registry path extraction from a small sample table.
- Assert every `.codex/agents/*.toml` parses using the same helper the script uses.

Do not snapshot full output; future plans will extend it.

**Verify**: `python3 -m unittest discover -s tests` -> exit 0, all tests pass.

### Step 3: Document the verification commands

Add a short "Verify" section to `README.md` after "Usage" or before "Compatibility":

````markdown
## Verify

This repo has no application build system. Use the local verifier and tests to check prompt-surface integrity:

```bash
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
git diff --check
```
````

Add the same command list to `CLAUDE.md` under a new "Verification" heading. State that future prompt-surface changes should update `scripts/verify_surfaces.py` when a new invariant is introduced.

**Verify**: `rg -n "scripts/verify_surfaces.py|unittest discover|git diff --check" README.md CLAUDE.md` -> shows the commands in both files.

### Step 4: Run the full baseline

Run:

```bash
python3 -c "import sys; assert sys.version_info >= (3, 11), sys.version"
python3 scripts/verify_surfaces.py
python3 -m unittest discover -s tests
python3 -c "import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path('.codex/agents').glob('*.toml')]; print('codex toml ok')"
git diff --check
```

**Verify**: all commands exit 0.

## Test plan

- New tests live in `tests/test_verify_surfaces.py`.
- Model the tests on standard-library `unittest`; no third-party dependency should be added.
- Cover both subprocess behavior and at least one pure parsing helper.
- Verification: `python3 -m unittest discover -s tests` -> all tests pass.

## Done criteria

- [ ] `python3 scripts/verify_surfaces.py` exits 0 and prints an `OK:` summary.
- [ ] `python3 -m unittest discover -s tests` exits 0.
- [ ] `python3 -c "import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path('.codex/agents').glob('*.toml')]; print('codex toml ok')"` prints `codex toml ok`.
- [ ] `README.md` and `CLAUDE.md` document the verifier and test commands.
- [ ] `git diff --check` exits 0.
- [ ] No files outside the in-scope list are modified, except `plans/README.md` for the status row.

## STOP conditions

Stop and report back if:

- `python3` is older than 3.11 and `tomllib` is unavailable.
- `AGENTS.md` no longer uses the table shape shown in the current-state excerpt.
- Adding a useful verifier requires third-party dependencies or a package manager.
- The verifier would need to modify tracked source files to pass.
- Any plan 002-004 finding is fixed before this plan starts; note it, but do not fold that fix into this baseline plan.

## Maintenance notes

- This verifier is intentionally small. It should stay standard-library only unless the repo later adopts a real package/tooling layer.
- Plans 002-004 should extend `scripts/verify_surfaces.py` by replacing their labels in `KNOWN_FOLLOWUP_CHECKS` with concrete checks.
- Reviewers should watch for dead-output drift: prose rules in `CLAUDE.md` that do not have corresponding verifier checks should be treated as candidates for future checks.
