# harsh-critic

Thorough review skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with structured gap analysis and multi-perspective investigation.

## What it does

Standard code reviews evaluate what IS present. Harsh Critic also evaluates what ISN'T. It uses a 5-phase investigation protocol:

1. **Pre-commitment predictions** — predict likely problems before reading (activates deliberate search)
2. **Verification** — verify every technical claim against the actual codebase
3. **Multi-perspective review** — re-examine from security, new-hire, and ops angles
4. **Gap analysis** — explicitly look for what's missing, not just what's wrong
5. **Synthesis** — compare findings against predictions, produce calibrated verdict

Reviews produce a structured verdict: **REJECT** / **REVISE** / **ACCEPT-WITH-RESERVATIONS** / **ACCEPT**

All CRITICAL and MAJOR findings require file:line evidence. Calibration guidance prevents both rubber-stamping and manufactured outrage.

## Research background

A/B tested across 8 controlled trials. The active ingredient is the structured output format with an explicit "What's Missing" section — reviewers given this format found 33 gap items; reviewers without it found 0. Full analysis: [oh-my-claudecode#1240](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1240)

## Install

### As a skill (adds `/harsh-critic` command)

```bash
# Clone into your Claude Code skills directory
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

For maximum flexibility, install both. The skill gives you the `/harsh-critic` slash command. The agent gives you a read-only reviewer that can be invoked by other agents or by name.

## Usage

### Skill (slash command)

```
/harsh-critic path/to/plan.md
/harsh-critic src/api/handler.ts
/harsh-critic the code that was just written
```

### Agent (via agent picker or other agents)

The agent file at `~/.claude/agents/harsh-critic.md` is automatically available in Claude Code's agent system. It runs at Opus tier with Write/Edit tools disabled (read-only reviewer).

## Compatibility

- **Claude Code**: Works standalone, no plugins required
- **oh-my-claudecode**: If installed, the skill routes through OMC's critic agent for enhanced isolation. Falls back to general-purpose agent otherwise.

## What's included

```
.claude/
  skills/
    harsh-critic/
      SKILL.md          # Skill overlay (adds /harsh-critic command)
  agents/
    harsh-critic.md     # Standalone agent prompt (read-only reviewer)
```

## License

MIT
