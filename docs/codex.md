# Codex Integration

Codex is the priority adapter.

Klemm supports:

- `klemm codex wrap`
- plain `codex` hook path
- `/klemm` skill instructions
- Codex report commands
- Codex turn start/check/finish
- Codex contract/status surfaces

## Wrapped Session

```bash
klemm codex wrap --id mission-codex --goal "Safe local implementation" -- npm test
```

A wrapped session records:

- session start
- plan
- tool call
- file-change or diff evidence
- proxy question or continuation evidence
- authority decision
- debrief
- session finish

Safe local work can continue when it matches the mission. Risky work is queued, paused, blocked, or rewritten.

## Plain `codex` Hook

`klemm install` installs a user-level plain `codex` hook. When the hook directory is first on `PATH`, ordinary `codex` invocations route through Klemm before reaching the real Codex command.

Check it with:

```bash
klemm codex hook doctor
```

If doctor says the hook is missing or not first on `PATH`, run:

```bash
klemm doctor
klemm repair
```

When reporting Codex alpha feedback, include:

```bash
klemm adapters status --live
klemm dogfood export --mission <mission-id> --output codex-dogfood.json
klemm debrief --mission <mission-id>
```

## Risk Boundary

Codex should not ask the user "what next?" by default when Klemm has reviewed, high-confidence, low-risk guidance. Codex should still ask the real user before product strategy, emotional judgment, external actions, or risky irreversible work.
