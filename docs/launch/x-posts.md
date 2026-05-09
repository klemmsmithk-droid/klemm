# Klemm Launch Notes

## Short Post

Klemm is a local authority layer for AI agents.

It watches agents, keeps them on-mission, queues risky actions, and explains decisions.

The first demo is simple: install Klemm, run plain `codex`, let the agent do safe local work, watch Klemm stop a risky push, then inspect the watch report.

## Demo Script

```bash
klemm install
klemm start
codex
klemm demo golden
klemm trust report <decision-id>
klemm debrief --mission <mission-id>
```

## Limitation Wording

Klemm observes unmanaged agents and recommends wrapping them. It does not pretend to automatically control every process on the machine.

No OS-wide hard blocking is claimed unless Endpoint Security is actually available.
