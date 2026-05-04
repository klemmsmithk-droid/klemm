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
npm run klemm -- agent register --id agent-codex --mission mission-codex --name Codex --kind coding_agent
npm run klemm -- event record --mission mission-codex --agent agent-codex --type command_planned --summary "Codex plans a test run" --action-id decision-tests --action-type command --target "npm test"
npm run klemm -- propose --id decision-push --mission mission-codex --actor Codex --type git_push --target "origin main" --external publishes_code
npm run klemm -- queue
npm run klemm -- queue inspect decision-push
npm run klemm -- deny decision-push "Review before publishing"
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
npm run klemm -- supervise --mission mission-codex -- node -e "console.log('safe local work')"
```

`klemm run` is the named agent runtime wrapper. It registers the profile as a supervised agent, normalizes the launch command into an authority proposal, blocks or queues risky launches before execution, and can run in `--dry-run` mode for adapter dogfooding. Runtime Profiles v2 can be loaded from `--profile-file`; profiles can extend built-ins, define a default mission, add authority boundaries, inject environment variables, and register adapter client tokens before launch.

`klemm supervise` remains the lower-level process wrapper for direct commands. Both surfaces classify commands before launch. High-risk commands are queued before execution. Safe rewrites can replace a broad reversible command with a narrower command.

`klemm codex wrap` is the dogfood wrapper installed as `klemm-codex`. It starts a Codex hub mission, registers Codex, reports plan/debrief envelopes, preflights the wrapped command through Klemm authority, and routes allowed work through supervised execution.

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

## Codex Hub

`klemm codex hub` starts the opinionated dogfood flow: Codex becomes the temporary hub, Klemm registers `agent-codex`, and the mission lease defaults to allowing local code/docs/tests while queuing pushes, external sends, credential changes, OAuth scope changes, deletion, deployments, and financial/legal/reputational actions.

Codex-specific adapter commands:

- `klemm codex event` records a Codex event with stable `agent-codex` defaults.
- `klemm codex context` returns a JSON packet with mission, queue, recent events, decisions, memory candidates, trusted memories, and supervised runs.
- `klemm codex debrief` prints a Codex-ready debrief packet.
- `klemm codex dogfood` starts a hub mission and records the opening plan as an adapter activity.
- `klemm codex report` records normalized adapter envelopes for plans, tool calls, diffs, uncertainty, and subagents.
- `klemm codex run` executes commands through `klemm supervise --watch-loop` with `agent-codex` as the actor.

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

Context importers preserve source evidence and quarantine hostile instructions before they can affect authority:

```bash
npm run klemm -- memory import-source --source chatgpt --file export.json
npm run klemm -- context import --provider chatgpt --file export.json
npm run klemm -- context import --provider claude --file claude-export.json
npm run klemm -- context import --provider codex --file codex.jsonl
npm run klemm -- context import --provider chrome_history --file ./History.sqlite
npm run klemm -- context import --provider git_history --file git.log
npm run klemm -- memory review --group-by-source
npm run klemm -- memory promote-policy <memory-id> --action-types deployment --target-includes prod,production
npm run klemm -- user model
npm run klemm -- memory search --query "deploy review"
```

Imports now record provider-level source records, per-memory evidence, and quarantine counts in addition to distilled memory candidates. `user model` renders an agent-usable summary grouped into working style, authority boundaries, interests/projects, relationship context, and corrections.

## macOS Helper Scaffold

```bash
npm run klemm -- helper launch-agent --program /usr/local/bin/klemm --data-dir "$HOME/Library/Application Support/Klemm"
```

This renders a LaunchAgent plist for a non-privileged Klemm daemon. Installing/loading the plist is still left to the user or a future installer command.

## Terminal Dashboard

`klemm tui` renders a lightweight terminal dashboard with mission, hub, active agents, unresolved queue, memory candidates, recent interventions, and recent events. Focused views are available with `--view overview|memory|queue|agents|policies|model|logs|trust`. Use `--view trust --decision <decision-id>` or `klemm queue inspect <decision-id>` to drill into risk factors, suggested rewrites, source memories, matched policies, and the decision explanation.

`klemm tui --interactive` accepts stdin commands:

- `tab overview|memory|queue|agents|policies|model|logs`
- `model`
- `inspect <decision-id>`
- `approve <decision-id> [note]`
- `deny <decision-id> [note]`
- `memory approve <memory-id> [note]`
- `memory reject <memory-id> [note]`
- `memory pin <memory-id> [note]`
- `quit`

## Supervised Capture

`klemm supervise --capture` records stdout, stderr, exit code, duration, and file changes for a supervised process. With `--record-tree`, `--timeout-ms`, and `--intercept-output`, captured runs also include pid/process metadata, timeout state, termination signal, and live interventions. Use `klemm supervised-runs --details` to inspect captured runs.

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

`klemm status` now reports daemon transport health and whether the local store fallback is available or active.

## Codex Skill

The repo includes `.agents/skills/klemm/SKILL.md`. When invoked as `/klemm`, Codex should register itself as the temporary hub, start or join a mission lease, ask Klemm before risky actions, and write a debrief when the user returns.

## Safety Model

Klemm uses deterministic policy rules first. LLM judgment can be added later only as an explainable classifier behind hard safety rules.

Imported chats, docs, webpages, emails, and tool output are memory evidence, not authority. Prompt-injection-like memory inputs are rejected until the user reviews them.
