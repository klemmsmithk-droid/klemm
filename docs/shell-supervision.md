# Shell Supervision

Shell supervision is the simplest place to prove Klemm's authority loop.

```bash
klemm supervise --watch --capture --record-tree --mission mission-demo -- npm test
```

Klemm can:

- preflight the command
- capture stdout and stderr
- record exit code and duration
- record process metadata
- record file-change evidence when capture is enabled
- detect risky streamed output
- queue, pause, kill, or rewrite according to policy
- produce trust/debrief evidence

Risky shell work includes pushes, deploys, credential access, OAuth changes, external sends, financial/legal/reputation actions, destructive deletes, mass deletes, and irreversible state changes.

Safe local tests and reversible local commands can proceed when they are mission-aligned.

