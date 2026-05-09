# Install Klemm

Klemm is a local-first authority layer for AI agents. The default install is a user-level macOS install; it does not require root.

## Requirements

- macOS
- Node.js 20 or newer
- Git
- Codex CLI, if you want ordinary `codex` to route through Klemm
- Swift toolchain, if you want to build the optional macOS helper and blocker rails

## Clone And Link

```bash
git clone https://github.com/klemmsmithk-droid/klemm.git
cd klemm
npm test
npm link
klemm install
klemm start
```

Without global linking:

```bash
npm run klemm -- install
npm run klemm -- start
```

## What `klemm install` Writes

- local daemon plist and daemon directories
- `/klemm` Codex skill instructions
- MCP config
- `klemm-codex` wrapper
- plain `codex` hook
- default runtime profiles
- default policy pack
- zsh completion
- local log/token directories with strict permissions where supported

The installer is designed to be idempotent. Running it again should repair or refresh the same user-level artifacts without corrupting the install.

## After Install

Run:

```bash
klemm doctor
klemm start
klemm demo golden
```

`klemm doctor` explains what is protected, what is broken, why it matters, and the exact repair command.

