# Klemm External Alpha Hardening

Klemm should earn trust through boring local behavior, clear limits, and inspection-grade reports.

## Before Sharing

- `klemm uninstall --dry-run` must preview every user-level artifact it will remove.
- `klemm uninstall` must remove the plain Codex hook, shell profile blocks, completions, LaunchAgent plist, PID/log artifacts, wrapper, MCP config, and profiles unless `--keep-data` is used.
- Logs, debriefs, adapter envelopes, queue details, and trust reports must redact secrets.
- Local state, token files, and daemon files should use strict permissions.
- No fake completion claims belong in launch material.
- No percentage or scorecard language should be used as a shipping claim.
- Unmanaged agents are observed and recommended for wrapping, not automatically controlled.
- OS-wide hard blocking is only claimed when Endpoint Security/root/TCC capability is actually available.

## Public Safety Defaults

Klemm queues or blocks pushes, deploys, publishing, OAuth changes, credential changes, external sends, financial/legal/reputation actions, and destructive actions unless the user explicitly approves them.
