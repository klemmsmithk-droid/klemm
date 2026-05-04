# Klemm

Klemm is a macOS-first, terminal-native personal authority layer for supervising agents while the user is away. It is local-first: missions, agents, decisions, memory distillations, and debriefs persist in a local SQLite store.

Klemm is not only an MCP tool. The MCP-style tool surface is an adapter; the local CLI and daemon are the source of authority.

## CLI

```bash
npm run klemm -- status
npm run klemm -- version
npm run klemm -- install --data-dir ./data --policy-pack coding-afk --agents codex,claude,shell
npm run klemm -- setup --data-dir ./data --codex-dir ./codex-klemm --codex-history ./codex.jsonl --never "Never let agents deploy production without approval." --dry-run-launchctl
npm run klemm -- onboard v2 --stdin
npm run klemm -- codex hub --id mission-codex --goal "Dogfood Codex supervision"
npm run klemm -- codex event --mission mission-codex --type command_planned --summary "Codex plans focused tests" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- codex context --mission mission-codex
npm run klemm -- codex debrief --mission mission-codex
npm run klemm -- codex dogfood --id mission-codex --goal "Dogfood Codex supervision" --plan "Report plan, run watched tests, debrief."
npm run klemm -- codex report --mission mission-codex --type tool_call --tool shell --command "npm test"
npm run klemm -- codex run --mission mission-codex -- npm test
npm run klemm -- codex wrap --id mission-codex --goal "Wrapped Codex supervision" --adapter-client codex-local --adapter-token "$KLEMM_ADAPTER_TOKEN" --protocol-version 2 --dry-run -- git push origin main
npm run klemm -- codex install --output-dir ./codex-klemm --data-dir ./data
npm run klemm -- mission start --id mission-codex --hub codex --goal "Build Klemm while Kyle is AFK" --allow read_files,edit_local_code,run_tests --block git_push,external_send,credential_change,oauth_scope_change --rewrite
npm run klemm -- mission current
npm run klemm -- mission list
npm run klemm -- mission finish mission-codex "work complete"
npm run klemm -- goal start --id goal-importer --text "Refactor importer tests" --success "focused and full tests pass" --budget-turns 6 --watch-path src --watch-path test
npm run klemm -- goal attach --id goal-importer --agent agent-claude-importer --kind claude_agent --command "claude"
npm run klemm -- goal tick --id goal-importer --agent agent-claude-importer --summary "Updated importer test coverage" --changed-file test/importer.test.js --evidence "focused suite passed"
npm run klemm -- goal status --id goal-importer
npm run klemm -- goal debrief --id goal-importer
npm run klemm -- agent register --id agent-codex --mission mission-codex --name Codex --kind coding_agent
npm run klemm -- event record --mission mission-codex --agent agent-codex --type command_planned --summary "Codex plans a test run" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- propose --id decision-push --mission mission-codex --actor Codex --type git_push --target "origin main" --external publishes_code
npm run klemm -- queue
npm run klemm -- queue inspect decision-push
npm run klemm -- queue approve decision-push "Approved from queue"
npm run klemm -- queue deny decision-push "Review before publishing"
npm run klemm -- queue rewrite decision-push --to "git status --short"
npm run klemm -- dogfood status --mission mission-codex
npm run klemm -- dogfood debrief --mission mission-codex
npm run klemm -- dogfood finish --mission mission-codex --note "work complete"
npm run klemm -- readiness --data-dir ./data --skip-health
npm run klemm -- memory ingest-export --source chatgpt_export --file export.json
npm run klemm -- context import --provider chatgpt --file export.json
npm run klemm -- context import --provider chrome_history --file "$HOME/Library/Application Support/Google/Chrome/Default/History"
npm run klemm -- memory review --group-by-source
npm run klemm -- memory promote-policy <memory-id> --action-types git_push --target-includes github,origin
npm run klemm -- user model
npm run klemm -- sync add --id codex-history --provider codex --path ./codex.jsonl --interval-minutes 30
npm run klemm -- sync plan
npm run klemm -- sync run --due
npm run klemm -- sync status
npm run klemm -- memory approve <memory-id> "Trusted preference"
npm run klemm -- tui --mission mission-codex --view memory
npm run klemm -- tui --mission mission-codex --view trust --decision decision-push
npm run klemm -- tui --interactive --mission mission-codex
npm run klemm -- debrief --mission mission-codex
npm run klemm -- run codex --mission mission-codex --dry-run -- --ask-for-approval on-request
npm run klemm -- run localcodex --profile-file ./klemm-profiles.json --capture
npm run klemm -- run shell --mission mission-codex -- node -e "console.log('safe local work')"
npm run klemm -- run shell --goal goal-importer --dry-run -- node -e "console.log('goal-scoped work')"
npm run klemm -- supervise --watch --intercept-output --mission mission-codex -- npm test
npm run klemm -- monitor status --mission mission-codex
npm run klemm -- monitor evaluate --mission mission-codex --agent agent-codex
npm run klemm -- policy pack list
npm run klemm -- policy pack apply coding-afk
npm run klemm -- policy simulate --mission mission-codex --type deployment --target "deploy prod" --external deployment
npm run klemm -- adapter token add --id codex-local --token "$KLEMM_ADAPTER_TOKEN" --versions 1,2
npm run klemm -- supervise --capture --record-tree --timeout-ms 60000 --mission mission-codex -- npm test
npm run klemm -- supervised-runs --details
npm run klemm -- os snapshot --mission mission-codex --watch-path ./src
npm run klemm -- os status --mission mission-codex
npm run klemm -- os permissions
npm run klemm -- daemon health --url http://127.0.0.1:8765
npm run klemm -- doctor --pid-file ./data/klemm.pid --log-file ./data/logs/klemm-daemon.log --repair
npm run klemm -- daemon install --output ./data/com.klemm.daemon.plist
npm run klemm -- daemon migrate
npm run klemm -- daemon start --dry-run
npm run klemm -- daemon bootstrap --plist ./data/com.klemm.daemon.plist --dry-run
npm run klemm -- daemon kickstart --label com.klemm.daemon --dry-run
npm run klemm -- daemon bootout --plist ./data/com.klemm.daemon.plist --dry-run
npm run klemm -- daemon logs --tail 40
npm run klemm -- daemon status --pid-file ./data/klemm.pid
npm run klemm -- daemon doctor --pid-file ./data/klemm.pid --repair
npm run klemm -- install mcp --client codex
npm run klemm -- completion zsh
npm run klemm -- profiles template --agent codex
npm run klemm -- config export --output ./klemm-export.json
npm run klemm -- config import --input ./klemm-export.json
npm run klemm -- uninstall --dry-run
npm run mcp
```

## MCP Server

```bash
npm run mcp
klemm mcp stdio
npm run klemm -- install mcp --client codex
npm run klemm -- install mcp --client claude-desktop
npm run klemm -- install mcp --client generic --output ./klemm-mcp.json
```

Klemm includes a real stdio MCP server. It speaks JSON-RPC 2.0, supports `initialize`, `tools/list`, and `tools/call`, and exposes the same authority, monitor, memory, policy, OS, and adapter tools used by the CLI/daemon.

`klemm install mcp` prints or writes MCP client config snippets that point compatible clients at the local Klemm stdio server.

`klemm codex install` writes a Codex-ready bundle: `/klemm` skill instructions, a Codex MCP config, and a `klemm-codex` wrapper that routes Codex commands through Klemm's watched runtime.

## Install And Onboarding

```bash
npm run klemm -- install --data-dir "$HOME/Library/Application Support/Klemm" --policy-pack coding-afk --agents codex,claude,shell
npm run klemm -- setup --data-dir "$HOME/Library/Application Support/Klemm" --codex-dir "$HOME/.codex/klemm" --codex-history ./codex.jsonl --never "Never let agents push or deploy without approval." --dry-run-launchctl
npm run klemm -- onboard v2 --stdin
```

`klemm install` is the primary installer path. It writes the LaunchAgent plist, migrates the local store, installs the `/klemm` skill, writes MCP config, installs `klemm-codex`, creates default runtime profile templates, applies the selected policy pack, runs doctor with daemon health skipped by default, and prints the next commands. Use `--check-health` only when the daemon is already running. `klemm setup` remains the lower-level setup path for explicit artifact wiring.

`klemm onboard v2 --stdin` is the first-run terminal wizard surface. It records the default mode, chat-history source, repo/watch path, agent wrappers to install, and first memory approvals.

## Agent Runtime Wrapper

```bash
npm run klemm -- run codex --mission mission-codex --dry-run -- --ask-for-approval on-request
npm run klemm -- run claude --mission mission-codex --dry-run -- --dangerously-skip-permissions false
npm run klemm -- run localcodex --profile-file ./klemm-profiles.json --capture
npm run klemm -- run shell --mission mission-codex -- node -e "console.log('safe local work')"
npm run klemm -- run shell --goal goal-importer --dry-run -- node -e "console.log('goal-scoped work')"
npm run klemm -- supervise --mission mission-codex -- node -e "console.log('safe local work')"
```

`klemm run` is the named agent runtime wrapper. It registers Codex, Claude, or shell profiles as supervised agents, normalizes the launch command into an authority proposal, blocks or queues risky launches before execution, and can run in `--dry-run` mode for adapter dogfooding. Runtime Profiles v2 can be loaded from `--profile-file`; profiles can extend built-ins, define a default mission, add authority boundaries, inject environment variables, and register adapter client tokens before launch.

`klemm supervise` remains the lower-level process wrapper for direct commands. Both surfaces classify commands before launch. High-risk commands are queued before execution. Safe rewrites can replace a broad reversible command with a narrower command.

`klemm codex wrap` is the dogfood wrapper installed as `klemm-codex`. It starts a Codex hub mission, registers Codex, creates a `codex-session-*` contract, injects `KLEMM_MISSION_ID`, `KLEMM_AGENT_ID`, and Codex helper commands into the child environment, reports session start/plan/session finish/debrief envelopes, preflights the wrapped command through Klemm authority, captures allowed work through supervised execution, and queues risky launches before execution.

## Klemm Goals

Klemm Goals are the cross-agent version of Codex `/goal`: a durable objective that non-Codex agents can attach to, update, and be judged against while Klemm remains the authority layer. A goal creates a backing mission lease, records attached Codex/Claude/Cursor/shell/MCP agents, stores progress ticks, tracks evidence, and raises review hints when the work drifts into risky or out-of-scope territory.

```bash
npm run klemm -- goal start --id goal-importer --text "Refactor importer tests" --success "focused and full tests pass" --budget-turns 6 --watch-path src --watch-path test
npm run klemm -- goal attach --id goal-importer --agent agent-claude-importer --kind claude_agent --command "claude"
npm run klemm -- run shell --goal goal-importer --dry-run -- node -e "console.log('goal-scoped work')"
npm run klemm -- goal tick --id goal-importer --agent agent-claude-importer --summary "Updated importer test coverage" --changed-file test/importer.test.js --evidence "focused suite passed"
npm run klemm -- goal status --id goal-importer
npm run klemm -- trust timeline --goal goal-importer
npm run klemm -- goal complete --id goal-importer --evidence "focused and full tests pass"
npm run klemm -- goal debrief --id goal-importer
```

Use goals when Codex is not the only active surface: Claude Code hooks, Cursor, shell agents, browser agents, or MCP agents can all report into the same objective. `goal tick` is the compact checkpoint surface: it says what changed, which agent acted, what evidence exists, and whether Klemm thinks the work is still aligned. Risk hints are recorded into observation and trust timelines so a later debrief can answer what happened and why.

## Continuous Agent Monitor

```bash
npm run klemm -- supervise --watch --mission mission-codex -- npm test
npm run klemm -- monitor status --mission mission-codex
npm run klemm -- monitor evaluate --mission mission-codex --agent agent-codex
npm run klemm -- supervise --watch-loop --watch-interval-ms 1000 --mission mission-codex -- npm test
```

Klemm continuously observes supervised agent work as an activity stream. `supervise --watch` records the command, exit status, file changes when capture is enabled, transcript excerpts, and duration, then evaluates alignment against the active mission.

Alignment states:

- `on_track`: recent work matches the mission.
- `needs_nudge`: the agent hit a soft failure or needs course correction.
- `scope_drift`: the agent appears to be working outside the mission.
- `stuck`: repeated failures suggest the agent is looping or blocked.
- `unsafe`: observed work contains a dangerous pattern that should be queued.

Interventions currently include `nudge`, `pause`, and `queue`. These are recorded into the audit trail and surfaced in debriefs and Codex context.

`--watch-loop` emits heartbeat evaluations while a long-running process is still active, giving Klemm a live supervisory path instead of only post-run review. `--intercept-output` watches streamed stdout/stderr for risky action attempts such as `git push`, production deploys, credentials, OAuth changes, and destructive deletion; when detected, Klemm queues authority and terminates the supervised process. Add `--capture --record-tree --timeout-ms <ms>` when you want durable transcripts, pid/process metadata, live-intervention details, and a hard runtime ceiling. Inspect them with `klemm supervised-runs --details`.

## Context Sync

```bash
npm run klemm -- sync add --id chatgpt-export --provider chatgpt --path ./exports/chatgpt.json --interval-minutes 60
npm run klemm -- sync add --id codex-history --provider codex --path ./codex.jsonl
npm run klemm -- sync add --id chrome-history --provider chrome_history --path "$HOME/Library/Application Support/Google/Chrome/Default/History"
npm run klemm -- sync plan
npm run klemm -- sync run --due
npm run klemm -- sync status
```

Sync sources are local files. Klemm checksums each source, skips unchanged inputs, snapshots imports into the local data directory, copies Chrome SQLite history before reading it, distills evidence-linked memories, and records sync runs for Codex context. Scheduled sources use `--interval-minutes`; `sync plan` shows due and waiting sources, while `sync run --due` imports only sources whose `nextRunAt` has arrived and then advances the next run window.

## Agent Adapter Protocol

Compatible agents can report normalized envelopes through MCP or HTTP:

- `plan`
- `tool_call`
- `diff`
- `uncertainty`
- `subagent`

Use `record_adapter_envelope` over MCP or `POST /api/adapter/envelope` over HTTP. Klemm normalizes the envelope into an activity, and when possible, an authority action.

Adapters can register a local client token and supported protocol versions:

```bash
npm run klemm -- adapter token add --id codex-local --token "$KLEMM_ADAPTER_TOKEN" --versions 1,2
npm run klemm -- codex report --adapter-client codex-local --adapter-token "$KLEMM_ADAPTER_TOKEN" --protocol-version 2 --mission mission-codex --type tool_call --tool shell --command "npm test"
```

Authenticated adapter calls receive explicit acceptance, negotiated protocol version, and validation details. Bad tokens or unsupported versions are rejected before activity is recorded.

Embeddable agents can use `src/klemm-adapter-sdk.js` to produce conformant envelopes and send them over HTTP or MCP with retries and protocol negotiation:

```js
import { createKlemmAdapterClient, createKlemmHttpTransport } from "./src/klemm-adapter-sdk.js";

const klemm = createKlemmAdapterClient({
  adapterClientId: "codex-local",
  adapterToken: process.env.KLEMM_ADAPTER_TOKEN,
  protocolVersion: 2,
  missionId: "mission-codex",
  agentId: "agent-codex",
  transport: createKlemmHttpTransport({
    baseUrl: "http://127.0.0.1:8765",
    retries: 2,
    negotiateProtocol: true,
  }),
});

await klemm.send(klemm.toolCall({ tool: "shell", command: "npm test", summary: "Run tests" }));
```

## Policy Engine

Klemm applies deterministic mission rules first, then reviewed memory policies. Approved or pinned authority-boundary memories can require user review for matching future actions, and each decision records the matched memory policy IDs for auditability.

Policy Engine v2 adds action categories, risk scores, risk factors, mission authority overrides, policy effects such as `deny`, and structured explanations with mission/policy/proposal evidence.

Structured policies can be added with:

```bash
npm run klemm -- policy pack list
npm run klemm -- policy pack apply coding-afk
npm run klemm -- policy add --id policy-prod --name "Production deploy approval" --action-types deployment --target-includes prod
npm run klemm -- policy simulate --mission mission-codex --type deployment --target "deploy prod" --external deployment
```

Built-in packs include `coding-afk`, `finance-accounting`, `email-calendar`, `browser-research`, and `strict-no-external`.

## Daemon

```bash
npm run klemm -- daemon install --output ./data/com.klemm.daemon.plist --data-dir ./data
npm run klemm -- daemon migrate
npm run klemm -- daemon start --dry-run
npm run klemm -- daemon stop --dry-run
npm run klemm -- daemon restart --dry-run
npm run klemm -- daemon bootstrap --plist ./data/com.klemm.daemon.plist --dry-run
npm run klemm -- daemon kickstart --label com.klemm.daemon --dry-run
npm run klemm -- daemon bootout --plist ./data/com.klemm.daemon.plist --dry-run
npm run klemm -- daemon logs --tail 40
npm run klemm -- daemon --host 127.0.0.1 --port 8765 --pid-file ./data/klemm.pid
npm run klemm -- daemon health --url http://127.0.0.1:8765
npm run klemm -- daemon status --pid-file ./data/klemm.pid
npm run klemm -- doctor --pid-file ./data/klemm.pid --log-file ./data/logs/klemm-daemon.log --repair
```

`klemm doctor` and `klemm daemon doctor` migrate the local store, inspect pid/log/health readiness, record the check in the local store, and can repair stale pid files with `--repair`.

`klemm status` reports daemon transport health and whether the local store fallback is available or active.

Commands that have daemon-first coverage print `Transport: daemon` when they use the local HTTP daemon and `Transport: local fallback` when they fall back to the local store. `klemm dogfood status` renders the compact operator loop: mission, queue, recent work, and next commands. `klemm dogfood finish` refuses to close a mission while decisions are still queued unless `--force` is passed, then prints the debrief and final live state. `klemm readiness` is the private-alpha ship gate: install artifacts, wrapper, MCP config, policy pack, supervised session proof, reviewed memory, clean queue, clean missions, doctor health, and audit trail.

## Packaging

Packaging polish commands are intentionally terminal-native:

```bash
npm run klemm -- version
npm run klemm -- completion zsh
npm run klemm -- profiles template --agent codex
npm run klemm -- config export --output ./klemm-export.json
npm run klemm -- config import --input ./klemm-export.json
npm run klemm -- uninstall --dry-run
```

Local endpoints:

- `GET /api/health`
- `GET /api/status`
- `GET /api/dashboard?mission=<id>`
- `GET /api/codex/context?mission=<id>`
- `POST /api/codex/hub`
- `POST /api/mission/start`
- `POST /api/agents/register`
- `POST /api/events`
- `POST /api/authority/request`
- `POST /api/queue/outcome`
- `POST /api/memory/ingest`
- `POST /api/memory/ingest-export`
- `POST /api/memory/review`
- `POST /api/memory/promote-policy`
- `POST /api/context/import`
- `GET /api/user/model`
- `POST /api/supervised-runs`
- `POST /api/os/observations`
- `GET /api/os/status?mission=<id>`
- `POST /api/monitor/activity`
- `POST /api/monitor/evaluate`
- `GET /api/monitor/status?mission=<id>&agent=<id>`
- `POST /api/adapter/envelope`
- `POST /api/policies`
- `POST /api/memory/sources`
- `GET /api/memory/search?query=<query>`
- `GET /api/debrief?mission=<id>`

## OS Observation Layer

```bash
npm run klemm -- os snapshot --mission mission-codex --watch-path ./src
npm run klemm -- os snapshot --mission mission-codex --process-file ps-fixture.txt --frontmost-app Terminal
npm run klemm -- os status --mission mission-codex
npm run klemm -- os permissions
```

The first OS layer uses public macOS-safe capabilities:

- process snapshots from `ps`
- agent-like process detection for Codex, Claude, Cursor, ChatGPT, and generic agent processes
- unmanaged-agent alerts when an agent-like process is running outside Klemm supervision
- point-in-time file metadata snapshots for explicitly watched paths
- optional frontmost-app activity supplied by the CLI or a future helper
- conservative permission reporting for Accessibility and Screen Recording

Unmanaged external processes are observe-and-alert only. Pause, kill, rewrite, and hard blocking remain available for agents launched through `klemm run`, `klemm supervise`, or a compatible adapter.

## True-Vision Breadth Rails

The breadth rails make the larger Klemm vision visible without pretending privileged OS blocking exists yet:

```bash
npm run klemm -- helper install
npm run klemm -- helper snapshot --mission mission-codex --frontmost-app Terminal
npm run klemm -- helper snapshot --mission mission-codex --daemon-url http://127.0.0.1:8765
npm run klemm -- helper stream start --mission mission-codex --frontmost-app Codex --watch-path ./src
npm run klemm -- helper stream status --mission mission-codex
npm run klemm -- observe attach --mission mission-codex --process-file ps-fixture.txt
npm run klemm -- observe recommend
npm run klemm -- observe loop start --id observer-codex --mission mission-codex --watch-path ./src --expect-domain coding
npm run klemm -- observe loop tick --id observer-codex --changed-file src/klemm-cli.js --agent-output "running tests"
npm run klemm -- observe loop status --id observer-codex
npm run klemm -- adapters install --all
npm run klemm -- adapters install --real --all --home "$HOME"
npm run klemm -- adapters doctor --home "$HOME"
npm run klemm -- adapters uninstall codex --home "$HOME"
npm run klemm -- adapters probe claude
npm run klemm -- adapters health --mission mission-codex --require codex,claude,cursor,shell
npm run klemm -- trust why <decision-id>
npm run klemm -- trust timeline --mission mission-codex
npm run klemm -- corrections add --decision <decision-id> --preference "Queue production deploys while I am away"
npm run klemm -- corrections approve <correction-id>
npm run klemm -- corrections promote <correction-id> --action-types deployment --target-includes production
npm run klemm -- sync export --encrypted --output bundle.klemm
npm run klemm -- security adversarial-test
npm run klemm -- daemon token generate --output "$HOME/Library/Application Support/Klemm/daemon.token" --passphrase "$KLEMM_DAEMON_TOKEN_PASSPHRASE"
npm run klemm -- daemon doctor --strict --token-file "$HOME/Library/Application Support/Klemm/daemon.token" --token-passphrase "$KLEMM_DAEMON_TOKEN_PASSPHRASE"
npm run klemm -- dogfood start --id mission-klemm --goal "Build Klemm" --plan "Use codex wrap" --dry-run -- npm test
npm run klemm -- dogfood day start --id mission-klemm-day --goal "Daily Klemm build" --domains coding,memory --watch-path ./src --memory-source codex-history --policy-pack coding-afk --dry-run -- npm test
npm run klemm -- dogfood day checkpoint --mission mission-klemm-day
npm run klemm -- dogfood day finish --mission mission-klemm-day
npm run klemm -- true-score --target 60
```

`macos/KlemmHelper` is a SwiftPM observation helper. The Node daemon remains the authority; the helper reports public macOS observations: process snapshots, running apps, frontmost app, permission status, file-watch metadata, and unmanaged-agent hints. It can emit one JSON snapshot or stream snapshots to `POST /api/os/observations`. Adapter installs can write generated bundles or real user-level config files with backups and uninstall/doctor checks for Codex MCP, Claude Code hooks, Cursor MCP/rules, and shell profiles. HTTP adapter calls can additionally require `KLEMM_DAEMON_TOKEN`; encrypted token files are created with `klemm daemon token generate|rotate`, checked by `klemm doctor --token-file <path>`, and redacted in normal output.

## Codex Skill

The repo includes `.agents/skills/klemm/SKILL.md`. When invoked as `/klemm`, Codex should register itself as the temporary hub, start or join a mission lease, ask Klemm before risky actions, and write a debrief when the user returns.

## Context Imports

Context importers preserve source evidence and quarantine hostile instructions before they can affect authority:

```bash
npm run klemm -- context import --provider chatgpt --file export.json
npm run klemm -- context import --provider claude --file claude-export.json
npm run klemm -- context import --provider codex --file codex.jsonl
npm run klemm -- context import --provider chrome_history --file ./History.sqlite
npm run klemm -- context import --provider git_history --file git.log
npm run klemm -- memory review --group-by-source
npm run klemm -- memory promote-policy <memory-id> --action-types deployment --target-includes prod,production
npm run klemm -- memory sources --coverage
npm run klemm -- memory evidence <memory-id>
npm run klemm -- user model --evidence --coverage
```

Imports record provider-level source records, per-memory evidence, and quarantine counts in addition to distilled memory candidates. `memory sources --coverage` shows provider coverage and user-model depth, `memory evidence <memory-id>` opens the evidence trail, and `user model --evidence --coverage` renders an agent-usable summary plus source-backed authority boundaries and recent corrections.

## Next Working Surfaces

- `klemm codex hub`: one-command Codex hub dogfooding.
- `klemm install`: adoption-grade install path for daemon, skill, MCP, wrapper, profiles, policy pack, and doctor.
- `klemm onboard v2`: first-run mode/source/watch-path/agent-wrapper onboarding.
- `klemm codex event/context/debrief`: stable Codex adapter packet commands.
- `klemm codex dogfood/report/run/wrap`: hardened Codex dogfood adapter flow and end-to-end wrapper.
- `klemm dogfood finish`: queue-safe dogfood closeout with debrief, mission finish, and final live-state check.
- `klemm dogfood day start/status/checkpoint/finish`: daily dogfood loop with wrapped Codex start, mission alignment checkpoint, queue-safe finish, and useful debriefs.
- `klemm readiness`: private-alpha ship gate for install artifacts, wrapper, MCP config, policy pack, supervised session proof, reviewed memory, clean queue, clean missions, doctor health, and audit trail.
- `klemm codex install`: Codex-ready skill, MCP config, and wrapper bundle.
- `klemm run codex|claude|shell`: named runtime wrapper plus profile-file v2 config for supervised agent launches.
- `klemm event record`: agent event protocol for planned tools, commands, files, external actions, and lifecycle events.
- `klemm memory ingest-export`: first AI chat export importer, with dedupe and review promotion.
- `klemm memory import-source/search`: memory source records and search.
- `klemm context import`: provider-specific ChatGPT, Claude, Codex, Chrome history, and git history importers with evidence.
- `klemm helper install/status/snapshot/permissions`: SwiftPM helper rail for public macOS observation snapshots.
- `klemm helper stream start/status/stop`: daemon-managed helper stream lifecycle with heartbeat/stale detection, file-watch metadata, frontmost app, and unmanaged-agent events.
- `klemm observe status/recommend/attach`: normalized observation events and unmanaged-agent recommendations.
- `klemm observe loop start/tick/status/stop`: continuous observe-and-recommend loop for real agent sessions, drift, risk hints, and watched files.
- `klemm adapters list/probe/install/uninstall/doctor`: documented Codex, Claude, Cursor, shell, browser, and MCP adapter rails with generated or real backed-up installs.
- `klemm adapters health`: live adapter capability coverage from installs and recent adapter envelopes.
- `klemm trust why` and `klemm corrections add/approve/reject/promote`: end-to-end decision explanation and correction-driven policy learning.
- `klemm trust timeline`: mission-level timeline of observer ticks, risk hints, decisions, and activity.
- `klemm true-score`: stricter true-final-product scorecard for tracking progress toward the actual 100% vision.
- `klemm daemon token generate|rotate`: encrypted local daemon token lifecycle with doctor permission/decrypt checks.
- `klemm dogfood start`: default dogfood entrypoint that routes through `klemm codex wrap`.
- `klemm sync export/import --encrypted`: local passphrase-encrypted sync bundles.
- `klemm security adversarial-test`: prompt-injection hardening fixtures for imported context and tool output.
- `klemm sync add/plan/run/status`: scheduled local context sync with due planning, checksum dedupe, and source snapshots.
- `klemm memory promote-policy`: turn reviewed memory into structured authority policy.
- `klemm memory sources/evidence` and `klemm user model --evidence --coverage`: source inventory, evidence drilldowns, and agent-usable local profile summary.
- `klemm debrief`: inspection-first summary of events, rewrites, queue, and memory candidates.
- `klemm queue inspect`: decision drilldown with rewrite, source memories, policies, and explanation.
- `klemm tui --interactive`: lightweight terminal dashboard with approve/deny, workbench, correction, queue, and memory-review commands.
- `klemm tui --view`: focused terminal views for memory, workbench, queue, agents, policies, model, logs, and trust drilldowns.
- `klemm supervise --capture`: transcript, exit code, duration, file-change capture, process metadata, and live-intervention details for supervised processes.
- `klemm supervise --intercept-output`: live streamed-output risk interception and queueing.
- `klemm daemon doctor --strict`: lifecycle doctor for encrypted tokens, helper stream health, adapter configs, log redaction/rotation, schema, stale pid, and daemon health readiness.
- `klemm status`: daemon-aware status with local store fallback visibility.
- `klemm daemon health`: lifecycle probe for the local authority daemon.
- `klemm os snapshot/status/permissions`: public-capability OS observation, unmanaged-agent detection, and permission status reporting.
- `klemm supervise --watch` and `klemm monitor status/evaluate`: continuous agent activity monitoring and alignment interventions.
- `npm run mcp`: real stdio MCP server for compatible agent clients.
- `klemm install mcp`: MCP config generation for Codex, Claude Desktop, and generic clients.
- `record_adapter_envelope`: normalized adapter protocol entrypoint for plans, tool calls, diffs, uncertainty, and subagents.
- `src/klemm-adapter-sdk.js`: embeddable HTTP/MCP adapter transport with retries and protocol negotiation.
- `klemm policy add/pack`: structured policy v2 plus prebuilt policy packs.
- `klemm completion/version/config/profiles/uninstall`: packaging polish for shell use, profile templates, config portability, and cleanup.
- `klemm helper launch-agent`: non-privileged macOS LaunchAgent scaffold.

## Safety Model

Klemm uses deterministic policy rules first. LLM judgment can be added later only as an explainable classifier behind hard safety rules.

Imported chats, docs, webpages, emails, and tool output are memory evidence, not authority. Prompt-injection-like memory inputs are rejected until the user reviews them.
