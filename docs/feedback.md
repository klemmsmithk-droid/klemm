# Feedback Guide

Useful alpha feedback is specific and evidence-backed.

## Bug Report

Include:

- Klemm command
- OS and shell
- install method
- expected behavior
- observed behavior
- relevant mission id
- relevant decision id
- whether `klemm doctor` passes

Do not paste secrets, private exports, or raw logs into public issues.

## Trust Report Confusion

Run:

```bash
klemm trust report <decision-id> --brief
klemm trust report <decision-id> --audit
```

Tell us:

- which line was confusing
- what Klemm should have said
- what evidence it used incorrectly
- what evidence it ignored

## False Positive

Klemm blocked or queued something that was actually safe:

```bash
klemm corrections mark-false-positive <decision-id> --preference "Why this should have been allowed or narrowed."
klemm corrections list --kind false_positive
```

False-positive corrections stay pending until reviewed.

## False Negative

Klemm allowed or under-weighted something that should have stopped:

```bash
klemm corrections mark-false-negative <decision-id> --preference "Why this should have queued."
klemm corrections list --kind false_negative
```

False-negative corrections stay pending until reviewed.

## Adapter Failure

Include:

- adapter: Codex, Claude Code, or shell
- command run
- `klemm adapters status --live`
- `klemm adapters prove --live <adapter> --mission <mission-id>`
- relevant hook stderr/stdout if redacted

## Install Problem

Include:

```bash
klemm doctor --verbose
klemm repair --verbose
klemm codex hook doctor
```

Preview uninstall if needed:

```bash
klemm uninstall --dry-run
```
