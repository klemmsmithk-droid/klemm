# Claude Code Adapter

The Claude Code adapter is an alpha path based on documented-style Claude Code hooks. It is real enough to install and exercise locally, but it should be described honestly: live evidence requires actual Claude Code usage with the installed hook configuration.

## Hook Command

Claude hooks call:

```bash
klemm adapters hook claude
```

The adapter reads Claude hook JSON from stdin and writes JSON back to stdout.

## Hook Events

The generated config uses:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `SubagentStop`
- `SessionEnd`

## What It Records

- lifecycle evidence
- prompt/proxy evidence
- tool evidence
- diff/file-change evidence where Claude provides it
- debrief/stop evidence
- session finish evidence

For risky `PreToolUse` input, Klemm routes the proposed action through the authority engine and returns a block/continue style JSON response.

## What Is Not Claimed

- Klemm does not control Claude Code unless Claude is using the installed hooks.
- Fake-home fixture tests prove config behavior only; they do not count as live adapter proof.
- Live proof requires observed hook envelopes from an actual Claude Code session.

## Diagnostics

```bash
klemm adapters hook claude
klemm adapters status --live
klemm adapters prove --live claude --mission <mission-id>
```

If live proof fails, treat the output as the source of truth. It should say which evidence is missing: lifecycle, plan, tool call, diff, proxy/continuation, authority decision, debrief, or session finish.
