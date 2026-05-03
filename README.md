# Klemm

Klemm is a macOS-first, terminal-native personal authority layer for supervising agents while the user is away. It is local-first: missions, agents, decisions, memory distillations, and debriefs persist in a local SQLite store.

Klemm is not only an MCP tool. The MCP-style tool surface is an adapter; the local CLI and daemon are the source of authority.

## CLI

```bash
npm run klemm -- status
npm run klemm -- codex hub --id mission-codex --goal "Dogfood Codex supervision"
npm run klemm -- codex event --mission mission-codex --type command_planned --summary "Codex plans focused tests" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- codex context --mission mission-codex
npm run klemm -- codex debrief --mission mission-codex
npm run klemm -- mission start --id mission-codex --hub codex --goal "Build Klemm while Kyle is AFK" --allow read_files,edit_local_code,run_tests --block git_push,external_send,credential_change,oauth_scope_change --rewrite
npm run klemm -- agent register --id agent-codex --mission mission-codex --name Codex --kind coding_agent
npm run klemm -- event record --mission mission-codex --agent agent-codex --type command_planned --summary "Codex plans a test run" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- propose --id decision-push --mission mission-codex --actor Codex --type git_push --target "origin main" --external publishes_code
npm run klemm -- queue
npm run klemm -- deny decision-push "Review before publishing"
npm run klemm -- memory ingest-export --source chatgpt_export --file export.json
npm run klemm -- memory approve <memory-id> "Trusted preference"
npm run klemm -- tui --mission mission-codex
npm run klemm -- tui --interactive --mission mission-codex
npm run klemm -- debrief --mission mission-codex
npm run klemm -- run codex --mission mission-codex --dry-run -- --ask-for-approval on-request
npm run klemm -- run shell --mission mission-codex -- node -e "console.log('safe local work')"
npm run klemm -- supervise --watch --mission mission-codex -- npm test
npm run klemm -- monitor status --mission mission-codex
npm run klemm -- monitor evaluate --mission mission-codex --agent agent-codex
npm run klemm -- supervise --capture --mission mission-codex -- npm test
npm run klemm -- supervised-runs
npm run klemm -- os snapshot --mission mission-codex --watch-path ./src
npm run klemm -- os status --mission mission-codex
npm run klemm -- os permissions
npm run klemm -- daemon health --url http://127.0.0.1:8765
npm run klemm -- daemon status --pid-file ./data/klemm.pid
npm run mcp
```

## MCP Server

```bash
npm run mcp
klemm mcp stdio
```

Klemm includes a real stdio MCP server. It speaks JSON-RPC 2.0, supports `initialize`, `tools/list`, and `tools/call`, and exposes the same authority, monitor, memory, policy, OS, and adapter tools used by the CLI/daemon.

## Agent Runtime Wrapper

```bash
npm run klemm -- run codex --mission mission-codex --dry-run -- --ask-for-approval on-request
npm run klemm -- run claude --mission mission-codex --dry-run -- --dangerously-skip-permissions false
npm run klemm -- run shell --mission mission-codex -- node -e "console.log('safe local work')"
npm run klemm -- supervise --mission mission-codex -- node -e "console.log('safe local work')"
```

`klemm run` is the named agent runtime wrapper. It registers the profile as a supervised agent, normalizes the launch command into an authority proposal, blocks or queues risky launches before execution, and can run in `--dry-run` mode for adapter dogfooding.

`klemm supervise` remains the lower-level process wrapper for direct commands. Both surfaces classify commands before launch. High-risk commands are queued before execution. Safe rewrites can replace a broad reversible command with a narrower command.

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

`--watch-loop` emits heartbeat evaluations while a long-running process is still active, giving Klemm a live supervisory path instead of only post-run review.

## Agent Adapter Protocol

Compatible agents can report normalized envelopes through MCP or HTTP:

- `plan`
- `tool_call`
- `diff`
- `uncertainty`
- `subagent`

Use `record_adapter_envelope` over MCP or `POST /api/adapter/envelope` over HTTP. Klemm normalizes the envelope into an activity, and when possible, an authority action.

## Policy Engine

Klemm applies deterministic mission rules first, then reviewed memory policies. Approved or pinned authority-boundary memories can require user review for matching future actions, and each decision records the matched memory policy IDs for auditability.

Structured policies can be added with:

```bash
npm run klemm -- policy add --id policy-prod --name "Production deploy approval" --action-types deployment --target-includes prod
```

## Daemon

```bash
npm run klemm -- daemon --host 127.0.0.1 --port 8765 --pid-file ./data/klemm.pid
npm run klemm -- daemon health --url http://127.0.0.1:8765
npm run klemm -- daemon status --pid-file ./data/klemm.pid
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

## Codex Hub

`klemm codex hub` starts the opinionated dogfood flow: Codex becomes the temporary hub, Klemm registers `agent-codex`, and the mission lease defaults to allowing local code/docs/tests while queuing pushes, external sends, credential changes, OAuth scope changes, deletion, deployments, and financial/legal/reputational actions.

Codex-specific adapter commands:

- `klemm codex event` records a Codex event with stable `agent-codex` defaults.
- `klemm codex context` returns a JSON packet with mission, queue, recent events, decisions, memory candidates, trusted memories, and supervised runs.
- `klemm codex debrief` prints a Codex-ready debrief packet.

## Agent Events

Agents can report lifecycle and action-planning events:

- `agent_started`
- `tool_call_planned`
- `command_planned`
- `file_change_detected`
- `external_action_requested`
- `agent_finished`
- `user_returned`

When an event includes an action, Klemm immediately creates an authority decision.

## Memory Imports

`klemm memory ingest-export` accepts plain text or JSON-ish ChatGPT/Claude/Codex exports. Raw history stays local. Klemm extracts message text, distills memory candidates, and rejects prompt-injection-like lines instead of treating imported content as authority.

Use `klemm memory approve`, `klemm memory reject`, or `klemm memory pin` to promote or reject candidates after review.

Memory v2 source import/search:

```bash
npm run klemm -- memory import-source --source chatgpt --file export.json
npm run klemm -- memory search --query "deploy review"
```

Imports now record provider-level source records in addition to distilled memory candidates.

## macOS Helper Scaffold

```bash
npm run klemm -- helper launch-agent --program /usr/local/bin/klemm --data-dir "$HOME/Library/Application Support/Klemm"
```

This renders a LaunchAgent plist for a non-privileged Klemm daemon. Installing/loading the plist is still left to the user or a future installer command.

## Terminal Dashboard

`klemm tui` renders a lightweight terminal dashboard with mission, hub, active agents, unresolved queue, memory candidates, recent interventions, and recent events.

`klemm tui --interactive` accepts stdin commands:

- `approve <decision-id> [note]`
- `deny <decision-id> [note]`
- `memory approve <memory-id> [note]`
- `memory reject <memory-id> [note]`
- `memory pin <memory-id> [note]`
- `quit`

## Supervised Capture

`klemm supervise --capture` records stdout, stderr, exit code, duration, and file changes for a supervised process. Use `klemm supervised-runs` to inspect captured runs.

## Codex Skill

The repo includes `.agents/skills/klemm/SKILL.md`. When invoked as `/klemm`, Codex should register itself as the temporary hub, start or join a mission lease, ask Klemm before risky actions, and write a debrief when the user returns.

## Safety Model

Klemm uses deterministic policy rules first. LLM judgment can be added later only as an explainable classifier behind hard safety rules.

Imported chats, docs, webpages, emails, and tool output are memory evidence, not authority. Prompt-injection-like memory inputs are rejected until the user reviews them.
