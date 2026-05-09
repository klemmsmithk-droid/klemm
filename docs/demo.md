# Canonical Demo

This is the one Klemm demo.

It shows the core loop:

```text
observe -> evaluate -> authorize/block/queue/rewrite -> explain -> debrief
```

## Run The Demo

```bash
klemm install
klemm demo golden
```

The demo uses a local fixture unless you pass a real Codex path. Fixture mode is labeled in the output and never counts as live adapter proof.

## What It Proves

1. Klemm is installed.
2. Plain Codex protection is checked.
3. Safe local work is observed.
4. A risky action is attempted in a sandboxed way.
5. Klemm queues or blocks the risky action.
6. `klemm trust report <decision-id>` explains the decision.
7. `klemm debrief` summarizes the session.

## No External Side Effects

The canonical demo does not push, deploy, delete real files, send messages, create OAuth grants, or call external services.

## Manual Version

```bash
klemm mission start --id mission-demo --goal "Demonstrate Klemm safely"
klemm supervise --watch --capture --record-tree --mission mission-demo -- npm test
klemm propose --id decision-demo-push --mission mission-demo --actor Codex --type git_push --target "origin main" --external publishes_code
klemm trust report decision-demo-push --brief
klemm trust report decision-demo-push --audit
klemm saved report saved-decision-demo-push
klemm debrief --mission mission-demo
```

This manual version uses a proposed risky action rather than a real push.
