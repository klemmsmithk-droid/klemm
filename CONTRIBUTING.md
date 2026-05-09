# Contributing

Klemm is built around proof, not theater.

Before opening a change:

1. Keep the product terminal-native and local-first.
2. Do not claim control over unmanaged apps or agents.
3. Do not let raw imports become authority.
4. Queue risky actions instead of silently allowing them.
5. Make decisions explainable through `klemm trust report`.
6. Add or update tests for behavior changes.

Recommended verification:

```bash
npm test
swift build --package-path macos/KlemmHelper
swift build --package-path macos/KlemmBlocker
git diff --check
```

Some tests open local loopback listeners for daemon/API verification. Run the full suite in an environment that permits local `127.0.0.1` listeners.

