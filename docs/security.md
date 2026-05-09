# Security And Privacy

Klemm is local-first. It is designed to supervise local agent work and explain authority decisions without sending private memory to a hosted service by default.

Alpha users should assume Klemm is still pre-audit. Use it to supervise local agent work, not to delegate high-value external actions without review.

## Stored Data

Klemm stores local state in the configured Klemm data directory. Depending on use, this can include:

- missions
- agent activities
- authority decisions
- queue outcomes
- reviewed memories
- directions
- debriefs
- audit events
- adapter registrations
- captured supervised output
- dogfood exports and saved-me moment metadata

## What Leaves The Machine

By default, nothing needs to leave the machine for the core CLI, local store, Codex wrapper, Claude hook adapter, shell supervision, memory review, trust report, or debrief loop.

Hosted encrypted sync, if configured, transports encrypted bundles. The server should not receive plaintext memories, decisions, tokens, or chat content.

## Redaction

Klemm redacts likely secrets in:

- trust reports
- debriefs
- queue details
- adapter envelopes
- captured command output
- logs

## Prompt Injection

Imported chats, docs, browser history, and tool output are treated as evidence, not authority. Prompt-injection-like text is quarantined and must not become policy without review.

## Risk Defaults

Klemm queues or blocks pushes, deploys, publishing, OAuth changes, credential changes, external sends, financial/legal/reputation actions, and destructive work unless the user explicitly approves them.

## Current Limitations

- No claim of broad OS-wide blocking.
- Endpoint Security blocking requires the relevant entitlement/root/TCC capability and fails safely when unavailable.
- Unmanaged ordinary apps are not controlled.
- External security review is still recommended before broad public alpha use.

## Alpha Security Feedback

Open a GitHub security issue or follow `SECURITY.md` if you find:

- a secret in logs, debriefs, trust reports, adapter envelopes, or dogfood exports
- a risky action allowed silently
- unreviewed imported text becoming authority
- uninstall leaving sensitive runtime artifacts behind
- a command execution path that bypasses authority checks
