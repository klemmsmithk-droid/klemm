# Klemm

Klemm is a macOS-first, terminal-native personal authority layer for supervising agents while the user is away. It is local-first: missions, agents, decisions, memory distillations, and debriefs persist in a local SQLite store.

Klemm is not only an MCP tool. The MCP-style tool surface is an adapter; the local CLI and daemon are the source of authority.

## CLI

```bash
npm run klemm -- status
npm run klemm -- setup --data-dir ./data --codex-dir ./codex-klemm --codex-history ./codex.jsonl --never "Never let agents deploy production without approval." --dry-run-launchctl
npm run klemm -- onboard --stdin
npm run klemm -- codex hub --id mission-codex --goal "Dogfood Codex supervision"
npm run klemm -- codex event --mission mission-codex --type command_planned --summary "Codex plans focused tests" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- codex context --mission mission-codex
npm run klemm -- codex debrief --mission mission-codex
npm run klemm -- codex dogfood --id mission-codex --goal "Dogfood Codex supervision" --plan "Report plan, run watched tests, debrief."
npm run klemm -- codex report --mission mission-codex --type tool_call --tool shell --command "npm test"
npm run klemm -- codex run --mission mission-codex -- npm test
npm run klemm -- codex install --output-dir ./codex-klemm --data-dir ./data
npm run klemm -- mission start --id mission-codex --hub codex --goal "Build Klemm while Kyle is AFK" --allow read_files,edit_local_code,run_tests --block git_push,external_send,credential_change,oauth_scope_change --rewrite
npm run klemm -- agent register --id agent-codex --mission mission-codex --name Codex --kind coding_agent
npm run klemm -- event record --mission mission-codex --agent agent-codex --type command_planned --summary "Codex plans a test run" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- propose --id decision-push --mission mission-codex --actor Codex --type git_push --target "origin main" --external publishes_code
npm run klemm -- queue
npm run klemm -- deny decision-push "Review before publishing"
npm run klemm -- memory ingest-export --source chatgpt_export --file export.json
npm run klemm -- context import --provider chatgpt --file export.json
npm run klemm -- context import --provider chrome_history --file "$HOME/Library/Application Support/Google/Chrome/Default/History"
npm run klemm -- memory review --group-by-source
npm run klemm -- memory promote-policy <memory-id> --action-types git_push --target-includes github,origin
npm run klemm -- user model
npm run klemm -- sync add --id codex-history --provider codex --path ./codex.jsonl
npm run klemm -- sync run
npm run klemm -- sync status
npm run klemm -- memory approve <memory-id> "Trusted preference"
npm run klemm -- tui --mission mission-codex --view memory
npm run klemm -- tui --interactive --mission mission-codex
npm run klemm -- debrief --mission mission-codex
npm run klemm -- run codex --mission mission-codex --dry-run -- --ask-for-approval on-request
npm run klemm -- run shell --mission mission-codex -- node -e "console.log('safe local work')"
npm run klemm -- supervise --watch --intercept-output --mission mission-codex -- npm test
npm run klemm -- monitor status --mission mission-codex
npm run klemm -- monitor evaluate --mission mission-codex --agent agent-codex
npm run klemm -- supervise --capture --mission mission-codex -- npm test
npm run klemm -- supervised-runs
npm run klemm -- os snapshot --mission mission-codex --watch-path ./src
npm run klemm -- os status --mission mission-codex
npm run klemm -- os permissions
npm run klemm -- daemon health --url http://127.0.0.1:8765
npm run klemm -- daemon install --output ./data/com.klemm.daemon.plist
npm run klemm -- daemon migrate
npm run klemm -- daemon start --dry-run
npm run klemm -- daemon bootstrap --plist ./data/com.klemm.daemon.plist --dry-run
npm run klemm -- daemon kickstart --label com.klemm.daemon --dry-run
npm run klemm -- daemon bootout --plist ./data/com.klemm.daemon.plist --dry-run
npm run klemm -- daemon logs --tail 40
npm run klemm -- daemon status --pid-file ./data/klemm.pid
npm run klemm -- install mcp --client codex
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

## Setup And Onboarding

```bash
npm run klemm -- setup --data-dir "$HOME/Library/Application Support/Klemm" --codex-dir "$HOME/.codex/klemm" --codex-history ./codex.jsonl --never "Never let agents push or deploy without approval." --dry-run-launchctl
npm run klemm -- onboard --stdin
```

`klemm setup` is the one-command installer path. It writes the LaunchAgent plist, migrates the local store, installs the Codex skill/MCP/wrapper bundle, registers default sync sources, promotes explicit "never" boundaries into memory-backed policies, and prints the launchctl/health plan.

`klemm onboard --stdin` is the first-run terminal wizard surface. It records an authority boundary, a repo/watch path, an optional Codex history source, and a working-style preference; approved answers become reviewed memories and structured policies.

## Agent Runtime Wrapper

```bash
npm run klemm -- run codex --mission mission-codex --dry-run -- --ask-for-approval on-request
npm run klemm -- run claude --mission mission-codex --dry-run -- --dangerously-skip-permissions false
npm run klemm -- run shell --mission mission-codex -- node -e "console.log('safe local work')"
npm run klemm -- supervise --mission mission-codex -- node -e "console.log('safe local work')"
```

`klemm run` is the named agent runtime wrapper. It registers Codex, Claude, or shell profiles as supervised agents, normalizes the launch command into an authority proposal, blocks or queues risky launches before execution, and can run in `--dry-run` mode for adapter dogfooding.

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

`--watch-loop` emits heartbeat evaluations while a long-running process is still active, giving Klemm a live supervisory path instead of only post-run review. `--intercept-output` watches streamed stdout/stderr for risky action attempts such as `git push`, production deploys, credentials, OAuth changes, and destructive deletion; when detected, Klemm queues authority and terminates the supervised process.

## Context Sync

```bash
npm run klemm -- sync add --id chatgpt-export --provider chatgpt --path ./exports/chatgpt.json
npm run klemm -- sync add --id codex-history --provider codex --path ./codex.jsonl
npm run klemm -- sync add --id chrome-history --provider chrome_history --path "$HOME/Library/Application Support/Google/Chrome/Default/History"
npm run klemm -- sync run
npm run klemm -- sync status
```

Sync sources are local files. Klemm checksums each source, skips unchanged inputs, snapshots imports into the local data directory, copies Chrome SQLite history before reading it, distills evidence-linked memories, and records sync runs for Codex context.

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
npm run klemm -- user model
```

Imports record provider-level source records, per-memory evidence, and quarantine counts in addition to distilled memory candidates. `user model` renders an agent-usable summary grouped into working style, authority boundaries, interests/projects, relationship context, and corrections.

## Next Working Surfaces

- `klemm codex hub`: one-command Codex hub dogfooding.
- `klemm codex event/context/debrief`: stable Codex adapter packet commands.
- `klemm codex dogfood/report/run`: hardened Codex dogfood adapter flow.
- `klemm codex install`: Codex-ready skill, MCP config, and wrapper bundle.
- `klemm run codex|claude|shell`: named runtime wrapper for supervised agent launches.
- `klemm event record`: agent event protocol for planned tools, commands, files, external actions, and lifecycle events.
- `klemm memory ingest-export`: first AI chat export importer, with dedupe and review promotion.
- `klemm memory import-source/search`: memory source records and search.
- `klemm context import`: provider-specific ChatGPT, Claude, Codex, Chrome history, and git history importers with evidence.
- `klemm sync add/run/status`: continuous local context sync with checksum dedupe and source snapshots.
- `klemm memory promote-policy`: turn reviewed memory into structured authority policy.
- `klemm user model`: agent-usable local profile summary from reviewed and pending memory candidates.
- `klemm debrief`: inspection-first summary of events, rewrites, queue, and memory candidates.
- `klemm tui --interactive`: lightweight terminal dashboard with approve/deny and memory-review commands.
- `klemm tui --view`: focused terminal views for memory, queue, agents, policies, model, and logs.
- `klemm supervise --capture`: transcript, exit code, duration, and file-change capture for supervised processes.
- `klemm supervise --intercept-output`: live streamed-output risk interception and queueing.
- `klemm daemon health`: lifecycle probe for the local authority daemon.
- `klemm os snapshot/status/permissions`: public-capability OS observation, unmanaged-agent detection, and permission status reporting.
- `klemm supervise --watch` and `klemm monitor status/evaluate`: continuous agent activity monitoring and alignment interventions.
- `npm run mcp`: real stdio MCP server for compatible agent clients.
- `klemm install mcp`: MCP config generation for Codex, Claude Desktop, and generic clients.
- `record_adapter_envelope`: normalized adapter protocol entrypoint for plans, tool calls, diffs, uncertainty, and subagents.
- `klemm policy add`: structured policy v2.
- `klemm helper launch-agent`: non-privileged macOS LaunchAgent scaffold.

## Safety Model

Klemm uses deterministic policy rules first. LLM judgment can be added later only as an explainable classifier behind hard safety rules.

Imported chats, docs, webpages, emails, and tool output are memory evidence, not authority. Prompt-injection-like memory inputs are rejected until the user reviews them.
