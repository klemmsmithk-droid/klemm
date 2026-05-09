# Alpha Checklist

Use this before inviting a technical alpha user.

## Maintainer Checklist

- [ ] `npm test` passes.
- [ ] `swift build --package-path macos/KlemmHelper` passes.
- [ ] `swift build --package-path macos/KlemmBlocker` passes.
- [ ] `git diff --check` passes.
- [ ] `klemm install` works in a clean test home.
- [ ] `klemm doctor` explains any broken state in plain English.
- [ ] `klemm repair` fixes repairable state and reruns checks.
- [ ] `klemm demo golden` runs without external side effects.
- [ ] `klemm trust report <decision-id> --brief` is understandable.
- [ ] `klemm trust report <decision-id> --audit` includes evidence and ignored evidence.
- [ ] `klemm saved list` shows risky interventions when they exist.
- [ ] `klemm dogfood export` produces redacted evidence.
- [ ] `klemm uninstall --dry-run` previews installed artifacts.
- [ ] Docs avoid universal-control or fake-completion claims.

## Alpha User First Session

- [ ] Clone the repo.
- [ ] Run `npm test`.
- [ ] Run `npm link`.
- [ ] Run `klemm install`.
- [ ] Run `klemm start`.
- [ ] Run one supervised Codex or shell session.
- [ ] Trigger or inspect one queued decision.
- [ ] Read one trust report.
- [ ] Export one dogfood packet.
- [ ] Preview uninstall.
