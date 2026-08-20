# ATHENA

**Adaptive Technical & Heuristic Executive Neural Assistant**

A personal AI assistant system engineered by **John Loreno** — a fully custom, production-grade agentic platform with persistent memory, multi-provider LLM routing, autonomous task execution, multimodal perception, secure web research, and remote device control across desktop and mobile.

---

## Overview

ATHENA is not a wrapper around an LLM. It is a complete agentic system built on top of foundation models, with its own:

- Identity, personality, and system prompt
- Persistent cloud memory with semantic retrieval
- Structured task planning and multi-step execution (DAG)
- Multi-provider LLM routing with intent-aware fallback
- Permission-controlled tool system
- Distributed remote node architecture (desktop + mobile)
- Secure external information layer with SSRF protection
- Multimodal image perception (K6)
- Full K4 structured telemetry
- Render-hosted backend + Expo mobile client

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ATHENA Brain (Render)                    │
│                                                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │ AthenaCore│  │ LLMRouter │  │ Planner  │  │ TaskEngine│  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘  │
│                                                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Memory  │  │ Scheduler │  │ EventBus │  │ Telemetry│  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Tool Layer                          │  │
│  │  web_search · fetch_url · get_weather · run_command  │  │
│  │  capture_screenshot · save/search_memory · system_*  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              External Information Layer               │  │
│  │  fetchWithSecurity · SSRF Guard · ExternalObservation│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────────────┐          ┌────────────┐                    │
│  │ Supabase   │          │ NodeManager│                    │
│  │ (TaskStore)│          │ (WebSocket)│                    │
│  └────────────┘          └────────────┘                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
   Desktop Node                      Mobile Node
   (src/node/)                       (mobile/)
   run_command, file I/O             image picker, location,
   capture_screenshot                battery, haptics, camera
           │
           ▼
   Electron Desktop App
   (src/electron/)
   System tray, login UI,
   IPC bridge, node auto-start
```

---

## Project Structure

```
Athena/
├── src/
│   ├── core/
│   │   ├── athena.ts              # AthenaCore — entry point for chat()
│   │   ├── task-engine.ts         # TaskEngine — subgoal DAG execution
│   │   ├── task-store.ts          # Supabase persistence w/ atomic leasing
│   │   ├── task.ts                # Task/TaskStep/TaskPlan types
│   │   ├── planner.ts             # Planner — LLM-driven task planning
│   │   ├── autonomous-runtime.ts  # AutonomousRuntime — background tasks
│   │   ├── scheduler.ts           # Scheduler — cron/recurring tasks
│   │   ├── memory.ts              # CloudMemoryManager — semantic memory
│   │   ├── memory-extractor.ts    # MemoryExtractor — fact extraction
│   │   ├── memory-types.ts        # Memory type definitions
│   │   ├── context-builder.ts     # ContextBuilder — retrieval for prompts
│   │   ├── external.ts            # fetchWithSecurity, SSRF, cache, types
│   │   ├── events.ts              # EventBus
│   │   ├── telemetry.ts           # K4 structured telemetry
│   │   ├── diagnostics.ts         # Local diagnostic commands
│   │   ├── safety.ts              # Safety constraints
│   │   ├── semantic-router.ts     # SemanticRouter — local intent routing
│   │   ├── embeddings.ts          # Embedding utilities
│   │   ├── voice.ts               # Voice support
│   │   └── task-queue.ts          # Task queue management
│   │
│   ├── llm/
│   │   ├── router.ts              # LLMRouter — multi-provider routing
│   │   ├── types.ts               # Message, MessageContentPart, ToolCall
│   │   └── providers/
│   │       ├── gemini.ts          # Google Gemini (primary, vision-capable)
│   │       ├── openrouter.ts      # OpenRouter (fallback)
│   │       └── ollama.ts          # Ollama (local fallback)
│   │
│   ├── tools/
│   │   ├── types.ts               # Tool, ToolDefinition, ToolResult
│   │   ├── registry.ts            # ToolRegistry
│   │   ├── orchestrator.ts        # ToolOrchestrator — routing to nodes
│   │   ├── executor.ts            # ToolExecutor
│   │   ├── permission.ts          # PermissionManager
│   │   ├── web-search.ts          # web_search (Tavily, structured output)
│   │   ├── fetch-url.ts           # fetch_url (SSRF-safe)
│   │   ├── get-weather.ts         # get_weather (Open-Meteo)
│   │   ├── current-time.ts        # get_current_time
│   │   ├── capture_screenshot.ts  # capture_screenshot (desktop node)
│   │   ├── run-command.ts         # run_command (PowerShell/bash)
│   │   ├── system-control.ts      # system_control
│   │   ├── system-info.ts         # system_info
│   │   ├── save-memory.ts         # save_memory
│   │   ├── search-memory.ts       # search_memory
│   │   ├── read-file.ts           # read_file
│   │   ├── list-directory.ts      # list_directory
│   │   ├── search-files.ts        # search_files
│   │   ├── locate-item.ts         # locate_item
│   │   ├── get-battery.ts         # get_battery_level (mobile node)
│   │   ├── get-location.ts        # get_location (mobile node)
│   │   └── vibrate-phone.ts       # vibrate_phone (mobile node)
│   │
│   ├── personality/
│   │   └── athena.ts              # ATHENA_SYSTEM_PROMPT (identity & rules)
│   │
│   ├── scripts/
│   │   └── invite.ts              # Generate auth_invites for mobile/nodes
│   │
│   ├── server/
│   │   └── index.ts               # Fastify server — /chat WS, /health, /ready
│   │
│   ├── node/
│   │   ├── index.ts               # Desktop node entry point
│   │   └── node-manager.ts        # NodeManager — WS heartbeat, tool dispatch
│   │
│   ├── cli/
│   │   ├── index.ts               # CLI entry point
│   │   └── commands.ts            # Local diagnostic commands (/status, etc.)
│   │
│   ├── electron/
│   │   ├── main.ts                # Electron main process — tray, IPC, window
│   │   └── preload.ts             # Context bridge — exposes window.athena API
│   └── tests/
│       ├── external.test.ts       # v0.4.0 SSRF/provenance/cache tests
│       └── multimodal.test.ts     # K6 multimodal tests
│
├── mobile/                        # Expo React Native mobile client
│   ├── App.tsx                    # Main UI, WS chat, node registration
│   ├── app.json                   # Expo config
│   └── eas.json                   # EAS Build config
│
├── phase_k1_task_leasing.sql      # Task leasing migration
├── phase_k5_plan.sql              # Plan column migration
├── tasks_migration.sql            # Initial tasks table
├── package.json
└── tsconfig.json
```

---

## Key Systems

### LLM Router
Multi-provider routing with intent-aware fallback.
- **Main Router**: Handles complex tool orchestration and task verification. Prioritizes ultra-fast open-source models on Groq (e.g., `gpt-oss-20b`) for millisecond latency, seamlessly falling back to Google Gemini (`flash-lite`) if strict Token-Per-Minute (TPM) limits are exceeded.
- **Fast Router**: A dedicated lightweight router used exclusively for structured Planner JSON generation and simple conversational routing to minimize Time-To-First-Token (TTFT).

### Semantic Router
A local embedding-based router (`Xenova/all-MiniLM-L6-v2`) used to rapidly classify user intent before hitting external LLMs. It determines if a request requires full planning, memory access, or if it can be fast-tracked to simple tool execution.

### Planner (K5)
LLM-driven structured planner that converts a user goal into a `TaskPlan` — a JSON DAG of `TaskSubgoal` objects with dependencies, requirements, and verification strategies. The planner natively ingests the active conversation history to resolve contextual/anaphoric references before DAG generation. Replanning is supported when a subgoal fails.

### TaskEngine (K1–K5)
Executes `TaskPlan` subgoals, respecting DAG dependencies. Supports:
- Parallel execution of independent subgoals (up to `MAX_PARALLEL_SUBGOALS`)
- Parallelizable tool batching
- Structured verification after each subgoal
- Adaptive replanning on failure (up to `MAX_REPLANS`)
- AbortController-based cancellation
- Execution key idempotency for crash recovery

### Memory (K4)
Supabase-backed semantic memory with vector embeddings. Supports:
- Semantic search (`search_memory`)
- Memory extraction from task outputs (`MemoryExtractor`)
- Memory supersession (new facts update old ones)
- Context retrieval for prompt injection (`ContextBuilder`)

### Remote Nodes (K3)
Authenticated WebSocket nodes extend ATHENA's toolset to remote machines:
- **Desktop Node** (`src/node/`) — file I/O, PowerShell commands, screenshot capture
- **Mobile Node** (`mobile/`) — location, battery, haptics, image picker
- Nodes authenticate via `NODE_AUTH_TOKEN` stored in `expo-secure-store`
- Heartbeat, auto-reconnect, tool correlation by `correlationId`
- **AbortController-based cancellation** — stop signals propagate to child process via `SIGKILL`

### Electron Desktop App
A native Windows desktop application that wraps the Desktop Node with a full GUI:
- **System tray** integration — runs silently in background, click to show window
- **Login UI** — one-time invite hash registration, token encrypted via Electron `safeStorage`
- **IPC bridge** (preload + contextBridge) — renderer never touches raw credentials
- **Auto-start** — registers node connection automatically on launch if already authenticated
- Built with Vite + vite-plugin-electron; run `npm run dev:desktop` for hot reload dev mode

### Stop Command
Any active generation or tool execution can be cancelled mid-stream:
- Mobile/desktop UI shows a **Stop** button while Athena is responding
- Sends `{ type: 'stop' }` over WebSocket to the Brain
- Brain triggers `AbortController` — halts LLM streaming and tool pipeline immediately
- Desktop Node receives `cancel_tool` event — calls `AbortController.abort()` which propagates to `execAsync` signal, killing the OS process

### External Information Layer (v0.4.0)
All external HTTP goes through `fetchWithSecurity()`:
- Blocks `file://`, `ftp://`, `data:`, `javascript:` and other non-HTTP schemes
- Resolves hostnames via DNS and rejects private/internal/link-local IPs
- Disables automatic redirects; validates every `Location` header before following
- Streams response body and aborts if `MAX_RESPONSE_BYTES` is exceeded
- Enforces `REQUEST_TIMEOUT_MS` via `AbortController`
- All external tool output is wrapped in `[UNTRUSTED EXTERNAL CONTENT]` markers before being passed to the LLM

### Multimodal Perception (K6)
Provider-independent `MessageContentPart` abstraction allows images and documents in the conversation. `GeminiProvider` maps them to native vision API parts. Desktop node can `capture_screenshot` (PowerShell, 5MB limit). Mobile users can attach images via `expo-image-picker`.

---

## Environment Variables

### Brain (Server)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (primary LLM) |
| `OPENROUTER_API_KEY` | OpenRouter API key (fallback LLM) |
| `TAVILY_API_KEY` | Tavily search API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `NODE_AUTH_TOKEN` | Shared secret for remote node authentication |
| `EXTERNAL_FETCH_TIMEOUT_MS` | HTTP timeout for external requests (default: 10000) |
| `MAX_RESPONSE_BYTES` | Max response body size (default: 5MB) |
| `MAX_REDIRECTS` | Max redirect hops (default: 5) |
| `EXTERNAL_CACHE_TTL_MS` | External cache TTL (default: 3600000) |
| `EXTERNAL_CACHE_MAX_ENTRIES` | Max cache entries (default: 1000) |

### Desktop Node

| Variable | Description |
|---|---|
| `NODE_AUTH_TOKEN` | Must match the brain's `NODE_AUTH_TOKEN` |

### Mobile Node

The `NODE_AUTH_TOKEN` is entered by the user at first launch and stored securely via `expo-secure-store`. It is never logged, never sent to the LLM, and never stored in plain AsyncStorage.

---

## Running Locally

### Brain (Server)

```bash
# Install dependencies
npm install

# Start the server
npm run server

# Or start the CLI client (connects to the deployed brain)
npm run chat

# Generate a device registration invite
npm run invite
```

### Desktop Node

```bash
# Run the desktop node (connects to the deployed brain WebSocket)
npm run node
```

### Desktop App (Electron)

```bash
# Development (hot reload)
npm run dev:desktop

# Build for production (outputs to release/win-unpacked/ATHENA.exe)
npm run build:desktop

# Generate a device invite hash (run once to register a new device)
npm run invite [admin|user]
```

### Mobile Client

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/go) or build with EAS.

---

## Deployment

The ATHENA Brain is deployed on **Render** as a persistent web service.

- **WebSocket endpoint:** `wss://athena-brain.onrender.com/chat`
- **Node endpoint:** `wss://athena-brain.onrender.com/nodes`
- **Health check:** `https://athena-brain.onrender.com/health`
- **Ready check:** `https://athena-brain.onrender.com/ready`

Database migrations are applied via the `.sql` files in the project root against the Supabase instance.

---

## Tool Permissions

Every tool has a `permission` level:

| Level | Behaviour |
|---|---|
| `safe` | Executed immediately without user confirmation |
| `confirm` | Requires user confirmation before execution (e.g. `capture_screenshot`) |
| `restricted` | Blocked in autonomous/background mode; requires explicit user presence |

---

## Database Schema

Managed in Supabase (PostgreSQL). Key tables:

- **`tasks`** — All tasks with status, steps (JSONB), telemetry, plan (JSONB), atomic lease columns (`claimed_by`, `claimed_at`)
- **`memories`** — Semantic memory with vector embeddings, project scoping, confidence, provenance

---

## Roadmap Progress

| Phase | Focus | Status |
|---|---|---|
| K1 | Task leasing & crash recovery | ✅ Complete |
| K2 | Cancellation & idempotency | ✅ Complete |
| K3 | Remote node reliability | ✅ Complete |
| K4 | Structured telemetry & diagnostics | ✅ Complete |
| K5 | Advanced planning, subgoals, DAG, replanning | ✅ Complete |
| K6 | Multimodal perception (images, screenshots) | ✅ Complete |
| v0.4.0 | Secure web & external capabilities | ✅ Complete |
| v0.5.0 | Latency, Fast/Dual Routers, Context-Aware Planning | ✅ Complete |
| v0.5.1 | Task Engine Reliability, Graceful Rejection, Schema Fixes | ✅ Complete |
| v0.6.0 | Electron Desktop App, Stop Command, AbortSignal propagation | ✅ Complete |
| v0.7.0 | TBD | 🔜 Pending |

---

## Security Notes

- External URLs are validated against private IP ranges via `ipaddr.js` before any request is made.
- Every redirect hop is individually validated — redirect chains cannot bypass SSRF protection.
- API keys never appear in LLM prompts, memory, telemetry, or tool results.
- The mobile `NODE_AUTH_TOKEN` is stored exclusively in `expo-secure-store`.
- External web content is architecturally separated from system instructions. It cannot modify ATHENA's identity, permissions, or tool authorization.
- Web content passed to the LLM is wrapped in explicit `[UNTRUSTED EXTERNAL CONTENT]` markers.

---

## License

Private. Created by John Loreno.
