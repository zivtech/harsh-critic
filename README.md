# harsh-critic

A thorough review skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that finds what's wrong **and** what's missing. It uses structured gap analysis, multi-perspective investigation, and evidence requirements to catch issues that standard reviews consistently overlook.

Despite the name, this isn't about being harsh for its own sake — it's about being thorough. What works is structured prompting: a fixed investigation protocol, explicit gap analysis, evidence requirements, and adaptive harshness that escalates when serious problems are found. The result is a reviewer that's precise by default and adversarial when warranted.

## The problem with standard reviews

LLM-based reviewers default to evaluating what IS present. They scan through code or plans, comment on what they see, and move on. The result is that entire categories of issues — missing error handling, unstated assumptions, absent edge cases — go unreported. Not because the reviewer can't find them, but because it was never prompted to look.

## How it works

The skill uses a 5-phase investigation protocol that forces systematic coverage:

### Phase 1: Pre-commitment predictions

Before reading the work in detail, the reviewer predicts the 3-5 most likely problem areas based on the type and domain of the work. This activates deliberate search — instead of passively reading and reacting, the reviewer enters the review with specific hypotheses to confirm or reject.

### Phase 2: Verification

Every technical claim is verified against the actual codebase. No assertion is taken on trust. The verification approach adapts to the artifact type:

- **For code**: Execution paths are traced, especially error paths and edge cases. Checks include off-by-one errors, race conditions, missing null checks, incorrect type assumptions, and security oversights.
- **For plans**: A structured 6-step plan investigation runs: key assumptions extraction (rated VERIFIED/REASONABLE/FRAGILE), pre-mortem analysis (5-7 failure scenarios), dependency audit, ambiguity scan, feasibility check, and rollback analysis. For each major decision, a devil's advocate challenge tests whether the strongest counter-argument was addressed.
- **For analysis**: Logical leaps, unsupported conclusions, and assumptions stated as facts are identified.

### Phase 3: Multi-perspective review

The work is re-examined from distinct angles adapted to the artifact type:

**For code:**
- **Security engineer**: What trust boundaries are crossed? What input isn't validated? What could be exploited?
- **New hire**: Could someone unfamiliar with this codebase follow this work? What context is assumed but never stated?
- **Ops engineer**: What happens at scale? Under load? When dependencies fail? What's the blast radius?

**For plans:**
- **Executor**: Can I do each step with only what's written here? Where will I get stuck?
- **Stakeholder**: Does this actually solve the stated problem? Are success criteria meaningful?
- **Skeptic**: What's the strongest argument this approach will fail?

### Phase 4: Gap analysis

This is the core differentiator — and the phase that actually makes the skill useful. The reviewer explicitly asks:

- "What would break this?"
- "What edge case isn't handled?"
- "What assumption could be wrong?"
- "What was conveniently left out?"

### Phase 4.5: Self-audit

A metacognitive check on all findings before finalizing. Each CRITICAL/MAJOR finding is assessed for confidence level (HIGH/MEDIUM/LOW), refutability, and whether it's a genuine flaw vs. a stylistic preference. Low-confidence and easily refutable findings are moved to Open Questions rather than scored sections. This reduces false positives without suppressing real issues.

### Adaptive harshness

The review starts in THOROUGH mode (precise, evidence-driven, measured). If during investigation the reviewer discovers any CRITICAL finding, 3+ MAJOR findings, or a pattern suggesting systemic issues, it escalates to ADVERSARIAL mode — actively hunting for hidden problems, challenging every decision, and expanding scope to adjacent areas. The verdict reports which mode was used and why.

### Phase 5: Synthesis

Findings are compared against the pre-commitment predictions, calibrated for severity, and assembled into a structured verdict.

## Output format

Every review produces a structured report:

- **Verdict**: REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT
- **Pre-commitment predictions**: What was expected vs. what was found
- **Critical findings**: Blocks execution. Must include evidence (file:line for code, backtick-quoted excerpts for plans). Includes confidence rating.
- **Major findings**: Causes significant rework. Must include evidence. Includes confidence rating.
- **Minor findings**: Suboptimal but functional.
- **What's missing**: Gaps, unhandled edge cases, unstated assumptions.
- **Ambiguity risks** (plan reviews only): Statements with multiple valid interpretations, both readings, and the consequence of choosing wrong.
- **Multi-perspective notes**: Security/new-hire/ops (code) or executor/stakeholder/skeptic (plans) concerns not captured above.
- **Verdict justification**: Why this verdict, what would upgrade it, and whether the review escalated to adversarial mode.
- **Open questions**: Low-confidence findings moved here by self-audit, plus speculative follow-ups.

Calibration guidance prevents both failure modes: rubber-stamping (saying "looks good" without verifying) and manufactured outrage (inventing problems to seem thorough). The self-audit phase gates findings by confidence, reducing false positives without suppressing genuine issues.

## Comparison with oh-my-claudecode's built-in critic

oh-my-claudecode (OMC) ships with a `critic` agent in its review lane. Harsh Critic is a specialized replacement that differs in several ways:

| | OMC critic | harsh-critic |
|---|---|---|
| **Approach** | General-purpose critical challenge of plans and designs | 5-phase structured investigation protocol |
| **Gap analysis** | Not explicitly prompted — relies on the reviewer's natural instinct | Dedicated phase with specific questions ("What would break this?", "What's missing?") |
| **Evidence requirements** | No formal requirement | CRITICAL/MAJOR findings must cite `file:line` or backtick-quoted code |
| **Multi-perspective** | Single reviewer perspective | Forced re-examination from security, new-hire, and ops angles |
| **Pre-commitment** | None — reads and reacts | Predicts problems before reading to activate deliberate search |
| **Output format** | Unstructured | Fixed contract with exact section headings (parseable by benchmarks) |
| **Calibration** | General "be thorough" guidance | Explicit anti-rubber-stamp AND anti-manufactured-outrage guidance |
| **Verdict scale** | No formal scale | 4-tier: REJECT / REVISE / ACCEPT-WITH-RESERVATIONS / ACCEPT |

**Benchmark results** (8 controlled fixtures on plan/code/analysis), direct against OMC `critic`:

| Run | What changed | Model | harsh-critic composite | OMC critic composite | Delta | Win/Loss/Tie |
|---|---|---|---:|---:|---:|---:|
| Initial benchmark (2026-03-03 12:49) | Original parser + scorer | `claude-sonnet-4-6` | 22.1% | 13.8% | +8.4% | 5/1/2 |
| Parser-hardening rerun (2026-03-03 23:35) | Improved parsing for markdown variants | `claude-opus-4-6` | 55.9% | 7.8% | +48.1% | 8/0/0 |
| Scorer-calibration rerun (2026-03-03 23:54) | Calibrated keyword match thresholds | `claude-opus-4-6` | 24.7% | 13.8% | +10.9% | 4/1/3 |

| Run | True Positive Rate (harsh vs critic) | False Negative Rate (harsh vs critic) | False Positive Rate (harsh vs critic) | Missing Coverage (harsh vs critic) | Perspective Coverage (harsh vs critic) | Evidence Rate (harsh vs critic) |
|---|---:|---:|---:|---:|---:|---:|
| Initial benchmark | 13.4% vs 0.0% | 61.6% vs 75.0% | 40.5% vs 0.0% | 12.5% vs 0.0% | 12.5% vs 0.0% | 0.0% vs 0.0% |
| Parser-hardening rerun | 56.4% vs 4.7% | 18.6% vs 70.3% | 87.1% vs 78.1% | 52.1% vs 0.0% | 39.6% vs 0.0% | 39.4% vs 0.0% |
| Scorer-calibration rerun | 21.1% vs 0.0% | 53.9% vs 75.0% | 40.6% vs 0.0% | 18.8% vs 0.0% | 18.8% vs 0.0% | 5.0% vs 0.0% |

The parser and scorer reruns are isolated experiments (not cumulative) and were run in separate branches of the OMC benchmark harness.

When OMC is installed, the `/harsh-critic` skill automatically routes through OMC's agent infrastructure for isolation. It uses the harsh-critic protocol regardless of routing.

## Research background

A/B tested across 8 controlled trials. The key finding: reviewers given a structured output format with an explicit "What's Missing" section found **33 gap items**. Reviewers without it found **0**. The structured format is the active ingredient — not reviewer skill, but reviewer prompting. Full analysis: [oh-my-claudecode#1240](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1240).

## Install

### As a skill (adds `/harsh-critic` command)

```bash
git clone https://github.com/zivtech/harsh-critic.git
cp -r harsh-critic/.claude/skills/harsh-critic ~/.claude/skills/
```

Or with [npx claude-skills](https://www.npmjs.com/package/claude-skills):

```bash
npx claude-skills add https://github.com/zivtech/harsh-critic
```

### As an agent (adds `harsh-critic` to agent list)

```bash
cp harsh-critic/.claude/agents/harsh-critic.md ~/.claude/agents/
```

### Both

Install both for maximum flexibility. The skill gives you the `/harsh-critic` slash command. The agent gives you a read-only reviewer (Write/Edit tools disabled) that can be invoked by other agents or by name.

## Usage

### Skill (slash command)

```
/harsh-critic path/to/plan.md
/harsh-critic src/api/handler.ts
/harsh-critic the code that was just written
```

### Agent (via agent picker or other agents)

The agent at `~/.claude/agents/harsh-critic.md` is automatically available in Claude Code's agent system. It runs at Opus tier with Write/Edit tools disabled — it reviews but cannot modify.

### When to use it

- Right before merge/deploy for risky code paths (auth, payments, sessions, state transitions)
- As a second-pass thorough check after a normal review said "looks good"
- On implementation-heavy work where concrete `file:line` evidence can be cited
- When you suspect another agent's output has gaps or weak reasoning

### When not to use it

- Quick sanity checks on trivial changes — just review directly
- Low-noise acceptance checks on known-clean artifacts — this workflow can over-flag
- When you want code changes made — use an implementation agent instead

### Drupal-specific reviews

For Drupal-heavy changes (module updates, cache behavior, config sync flows, migration plans, or contrib patch risk), route through a dedicated `drupal-critic` skill/agent first, then optionally run `harsh-critic` as a second-pass thorough check.

## Compatibility

- **Claude Code**: Works standalone, no plugins required.
- **oh-my-claudecode**: If installed, the skill routes through OMC's review lane for enhanced isolation. Falls back to general-purpose agent otherwise.

## What's included

```
.claude/
  skills/
    harsh-critic/
      SKILL.md          # Skill definition (adds /harsh-critic slash command)
  agents/
    harsh-critic.md     # Agent prompt (read-only reviewer, Opus tier)
```

## License

Apache 2.0
