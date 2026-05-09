# Trust Reports

`klemm trust report <decision-id>` is the main explanation surface.

It should read like a watch officer explaining an intervention: direct, auditable, and useful to the user who came back after being AFK.

## What A Report Includes

- bottom line: allowed, queued, denied, rewritten, paused, or stopped
- what happened: actor, action, target, mission, and timing
- what Klemm decided and why
- evidence that mattered:
  - mission lease
  - deterministic policy
  - reviewed memories
  - explicit directions
  - corrections
  - recent agent activity
- evidence ignored:
  - raw imports
  - quarantined text
  - fixture proof
  - stale or untrusted events
- uncertainty
- what would change the answer
- one-line teaching command

## Teach Klemm

After any decision, the user can correct Klemm:

```bash
klemm corrections add --decision decision-id --preference "Queue production deploys while I am away."
```

Corrections become reviewable memory candidates. They do not become authority until reviewed, approved, pinned, or promoted according to the memory flow.

## Redaction

Trust reports redact likely secrets, tokens, credentials, and sensitive command output. The same redaction path is used by debriefs, queue details, adapter envelopes, logs, and captured command output.

