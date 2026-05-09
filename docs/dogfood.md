# Daily Dogfood

Dogfood is not a synthetic demo. It is the record of what happened while Klemm supervised real local agent work.

## Start

```bash
klemm dogfood day start --id mission-dogfood-today --goal "Real work Klemm should supervise"
```

This starts a mission and routes the session through the Codex wrapper path by default.

## Checkpoint

```bash
klemm dogfood day checkpoint --mission mission-dogfood-today
```

A checkpoint summarizes:

- what Klemm thinks the work is
- helper stream state
- open queue
- recent agent activity
- memory candidates
- observation changes

## Export Evidence

```bash
klemm dogfood export --mission mission-dogfood-today --output dogfood-today.json
```

The export is redacted and includes:

- agent used
- mission status
- plan evidence
- tool calls
- file changes
- supervised command captures
- authority decisions
- saved-me moments
- false positives
- false negatives
- proxy/continuation moments
- debrief evidence
- review commands

## Finish

```bash
klemm dogfood day finish --mission mission-dogfood-today
```

Finish blocks when unresolved queue items remain unless `--force` is used. Prefer resolving the queue first.

## Useful Review Commands

```bash
klemm saved list --mission mission-dogfood-today
klemm trust report <decision-id> --brief
klemm trust report <decision-id> --audit
klemm corrections mark-false-positive <decision-id> --preference "..."
klemm corrections mark-false-negative <decision-id> --preference "..."
```
