# Integration Plan: Conforming Existing Skills to Phase 2 Contracts

## Situation

Phase 2 introduced three standards that existing skills don't yet follow:

1. **Planner Output Format Contract** — Required Markdown sections for spec-kitty-bridge WP translation
2. **Critic Verdict Format Contract** — Required heading structure for machine-parseable verdicts
3. **Template Author Checklists** — Verification items for skill authors

## Inventory

### Two repos, shared skills
| Skill | harsh-critic repo | meta-skills repo | Identical? |
|-------|------------------|------------------|------------|
| harsh-critic | ✓ (root .claude/) | ✗ | — |
| proposal-critic | ✓ (root .claude/) | ✗ | — |
| react-planner | ✓ | ✓ | Yes |
| drupal-planner | ✓ | ✓ | Yes |
| a11y-critic | ✓ | ✓ | Yes |
| a11y-planner | ✓ | ✓ | Yes |
| perf-critic | ✓ | ✓ | Yes |
| data-critic | ✓ | ✓ | Nearly (meta has Companion_Skills section) |
| data-planner | ✓ | ✓ | Yes |
| plan-writer | ✓ | ✓ | Yes |
| spec-kitty-bridge | ✗ | ✓ | — |
| test-builder | ✗ | ✓ | — |
| test-critic | ✗ | ✓ | — |

**Decision**: Edit in meta-skills repo (canonical), then sync to harsh-critic repo.

---

## Gap Analysis

### Critics (5 skills: harsh-critic, proposal-critic, a11y-critic, perf-critic, data-critic)

All critics share the same deviation pattern:

| Contract Requirement | Current State | Gap |
|---------------------|---------------|-----|
| `# Verdict: [...]` | `**VERDICT:**` bold text | Heading level + format |
| `## Findings` | Separate bold sections per severity | Single grouping heading |
| Finding fields: File, Severity, Description, Impact, Fix | All present ✓ | Field labels differ slightly |
| `## Summary` | `**Verdict Justification**` | Name mismatch |
| Extra sections allowed | Pre-commitment, What's Missing, etc. | ✓ Compatible (contract is minimum) |

**Impact**: spec-kitty-bridge needs to parse critic output to determine verdict and extract findings. Current bold-text format is harder to parse than heading-level format.

### Planners (5 skills: react-planner, drupal-planner, a11y-planner, data-planner, plan-writer)

All planners share the same deviation pattern:

| Contract Requirement | Current State | Gap |
|---------------------|---------------|-----|
| `### Architecture Overview` | Domain-specific sections (Component Architecture, Entity Design, etc.) | Name + structure |
| `### Implementation Tasks` | `## Implementation Tasks` ✓ | Minor heading level |
| `#### Task {N}: {Title}` | `### Task N: [Name]` | Close, format varies |
| `Estimated Effort:` field | Not present | Missing entirely |
| `Depends on:` field | Not present | Missing entirely |
| `#### Test Strategy for Task {N}` | Tests inline or in separate section | Not per-task |
| `#### Acceptance Criteria for Task {N}` | Not present | Missing entirely |
| `### Failure Modes` | Only in some planners | Inconsistent |

**Impact**: spec-kitty-bridge cannot reliably translate planner output to work packages without these standardized fields.

---

## Strategy: Additive Conformance

**Don't break existing output.** The domain-specific sections are valuable. Instead:

1. **Add contract-required sections** alongside existing domain sections
2. **Use an "appendix" pattern** — domain output first (unchanged), then contract sections
3. **Update the bridge** to look for contract sections at the end of output

This means each planner outputs:
```
[Domain-specific sections — unchanged]

---
### spec-kitty Contract Appendix
### Architecture Overview
[Brief summary referencing domain sections above]
### Implementation Tasks
#### Task 1: [Title]
Estimated Effort: [low | medium | high]
Depends on: [none | task numbers]
#### Test Strategy for Task 1
#### Acceptance Criteria for Task 1
[...more tasks...]
### Failure Modes
```

And each critic outputs:
```
[Full review output — unchanged, with domain sections]

---
# Verdict: [ACCEPT | ACCEPT-WITH-RESERVATIONS | REVISE | REJECT]
## Findings
[Same findings, reformatted with heading-level structure]
## Summary
[Verdict justification]
```

---

## Execution Plan

### Phase A: Update Contracts (in spec-kitty-bridge)
**Effort**: ~30 min

1. Update Planner Output Format Contract to document the "appendix" pattern
2. Update Critic Verdict Format Contract to accept both bold-text and heading formats
3. Add parsing guidance for bridge: "Look for `# Verdict:` first, fall back to `**VERDICT:**`"

### Phase B: Update Critic Output Formats (5 skills)
**Effort**: ~1 hour

For each critic (a11y-critic, perf-critic, data-critic, harsh-critic, proposal-critic):
1. Add `# Verdict:` heading format instruction alongside existing `**VERDICT:**`
2. Add `## Findings` grouping heading instruction
3. Add `## Summary` section instruction (alias for Verdict Justification)
4. Keep all existing sections intact

### Phase C: Update Planner Output Formats (5 skills)
**Effort**: ~1.5 hours

For each planner (react-planner, drupal-planner, a11y-planner, data-planner, plan-writer):
1. Add contract appendix section to output format
2. Add `Estimated Effort:` and `Depends on:` fields to task format
3. Add per-task `Test Strategy` and `Acceptance Criteria` sub-sections
4. Add `### Failure Modes` section (some planners already have this)
5. Add `### Architecture Overview` that summarizes domain-specific output

### Phase D: Sync to harsh-critic repo
**Effort**: ~15 min

Copy updated files from meta-skills → harsh-critic for all shared skills.

### Phase E: Update AGENTS.md registries
**Effort**: ~15 min

Update root AGENTS.md in both repos to reflect contract conformance status.

---

## Files to Modify

### Phase B (Critics)
1. `a11y-critic/.claude/agents/a11y-critic.md` — output format section
2. `a11y-critic/.claude/skills/a11y-critic/SKILL.md` — output format section
3. `perf-critic/.claude/agents/perf-critic.md` — output format section
4. `perf-critic/.claude/skills/perf-critic/SKILL.md` — output format section
5. `zivtech-data-skills/critic/.claude/agents/data-critic.md` — output format section
6. `zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md` — output format section
7. (harsh-critic repo only) `.claude/agents/harsh-critic.md` — output format section
8. (harsh-critic repo only) `.claude/skills/harsh-critic/SKILL.md` — output format section
9. (harsh-critic repo only) `.claude/agents/proposal-critic.md` — output format section
10. (harsh-critic repo only) `.claude/skills/proposal-critic/SKILL.md` — output format section

### Phase C (Planners)
11. `react-planner/.claude/agents/react-planner.md` — add contract appendix
12. `react-planner/.claude/skills/react-planner/SKILL.md` — add contract appendix
13. `drupal-planner/.claude/agents/drupal-planner.md` — add contract appendix
14. `drupal-planner/.claude/skills/drupal-planner/SKILL.md` — add contract appendix
15. `a11y-planner/.claude/agents/a11y-planner.md` — add contract appendix
16. `a11y-planner/.claude/skills/a11y-planner/SKILL.md` — add contract appendix
17. `zivtech-data-skills/planner/.claude/agents/data-planner.md` — add contract appendix
18. `zivtech-data-skills/planner/.claude/skills/data-planner/SKILL.md` — add contract appendix
19. `zivtech-proposal-skills/planner/.claude/agents/plan-writer.md` — add contract appendix
20. `zivtech-proposal-skills/planner/.claude/skills/plan-writer/SKILL.md` — add contract appendix

### Phase A (Bridge updates)
21. `integration/spec-kitty-bridge/.claude/agents/spec-kitty-bridge.md` — contract flexibility
22. `integration/spec-kitty-bridge/.claude/skills/spec-kitty-bridge/SKILL.md` — parsing guidance

**Total: 22 files across 2 repos**

---

## Risk Assessment

- **Low risk**: Additive changes — no existing output is removed or restructured
- **Medium risk**: LLM compliance — skills may not reliably produce both domain output AND contract appendix in a single response (context pressure)
- **Mitigation**: Make contract appendix optional with "SHOULD include if output will be consumed by spec-kitty-bridge" language
- **Testing**: Run each updated skill once against a sample spec to verify output includes contract sections
