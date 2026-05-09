# Alpha User Guide

Klemm watches AI agents and prevents them from going off mission.

This alpha is for terminal-native developers who already run agents such as Codex, Claude Code, and shell workflows locally. It is not for users who need a polished native app, cloud account connectors, or universal control of ordinary apps.

## Good Alpha Users

- Codex users who run real coding sessions locally.
- Claude Code users willing to install hooks and report hook behavior.
- Shell-heavy builders who want risky commands gated.
- AI infra, security, or developer-tooling operators who can read logs and file issues.

## Not Ready For

- Nontechnical users.
- Production finance, legal, HR, or customer-send workflows without human review.
- Universal control of Chrome, email, calendar, or arbitrary apps.
- Machines where Endpoint Security blocking is expected without the required macOS capability.

## Install

```bash
git clone https://github.com/klemmsmithk-droid/klemm.git
cd klemm
npm test
npm link
klemm install
klemm start
```

Run `klemm doctor` if anything feels off. Run `klemm repair` when doctor gives a repair path.

## First Codex Session

```bash
klemm codex wrap --id mission-alpha-codex --goal "Try Klemm on safe local work" -- npm test
klemm debrief --mission mission-alpha-codex
```

If plain `codex` is installed and the hook directory is first on `PATH`, ordinary `codex` runs route through Klemm.

```bash
klemm codex hook doctor
```

## First Shell Supervision Test

```bash
klemm mission start --id mission-alpha-shell --goal "Try shell supervision"
klemm supervise --watch --capture --record-tree --mission mission-alpha-shell -- npm test
klemm debrief --mission mission-alpha-shell
```

## First Trust Report

Create or wait for a queued decision, then run:

```bash
klemm queue
klemm trust report <decision-id> --brief
klemm trust report <decision-id> --audit
```

Brief mode is for quick understanding. Audit mode is for debugging evidence and filing useful feedback.

## Queued Or Blocked Actions

Queued actions mean Klemm decided the agent should not proceed without review. Common reasons are pushes, deploys, credential/OAuth changes, external sends, financial/legal/reputation-sensitive work, destructive commands, or unclear authority.

Use:

```bash
klemm queue inspect <decision-id>
klemm queue approve <decision-id> "why this is okay"
klemm queue deny <decision-id> "why this should stop"
klemm queue rewrite <decision-id> --to "safer command"
```

## Daily Dogfood

```bash
klemm dogfood day start --id mission-dogfood-alpha --goal "Use Klemm during real work"
klemm dogfood day checkpoint --mission mission-dogfood-alpha
klemm saved list --mission mission-dogfood-alpha
klemm dogfood export --mission mission-dogfood-alpha --output dogfood-alpha.json
klemm dogfood day finish --mission mission-dogfood-alpha
```

Do not treat a clean dogfood run as proof that every adapter is production-ready. It is evidence for that session.

## Report Confusing Behavior

Use `docs/feedback.md` and the GitHub issue templates. The most valuable reports include:

- the exact command
- the mission id
- the decision id
- the trust report output
- whether the result was a false positive or false negative
- what you expected Klemm to do

## Uninstall

Preview first:

```bash
klemm uninstall --dry-run
```

Then remove installed artifacts:

```bash
klemm uninstall
```

User memory/audit data is preserved unless you explicitly request removal.
