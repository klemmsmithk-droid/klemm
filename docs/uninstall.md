# Uninstall

Preview first:

```bash
klemm uninstall --dry-run
```

Uninstall:

```bash
klemm uninstall
```

Preserve user data:

```bash
klemm uninstall --keep-data
```

`klemm uninstall` removes user-level install artifacts such as:

- plain Codex hook
- shell profile blocks
- completions
- LaunchAgent plist/bootstrap artifacts
- PID/log artifacts
- `klemm-codex` wrapper
- MCP config
- profile files

Klemm should not silently delete valuable user memory or audit data. Use `--keep-data` when you want to retain the local state directory for later inspection or backup.

