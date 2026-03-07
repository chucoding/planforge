# PlanForge

**Bring your own AI to Cursor.**

PlanForge lets you use **Claude or Codex inside Cursor Free**. Slash commands and CLI use `planforge.json` to choose which provider runs planning (`/p`) and implementation (`/i`).

# Why PlanForge?

Cursor is great, but many developers already pay for AI elsewhere.

* Companies often provide **Claude access**
* Developers already use **Codex / OpenAI APIs**

But Cursor requires a separate subscription. PlanForge lets you use your **existing AI providers** inside Cursor through slash commands—no Cursor Pro needed.

# How It Works

PlanForge installs Cursor slash commands and reads **planforge.json** to route requests:

* **`/p`** and **`planforge plan`** use the **planner** (e.g. Claude or Codex).
* **`/i`** and **`planforge implement`** use the **implementer**.

Example:

```
/p design a refresh token auth system
```

Runs the configured planner and saves the plan to:

```
.cursor/plans/<summary>-<hash>.plan.md
```

Then:

```
/i implement the plan
```

Runs the configured implementer. Plan file names use a goal-based slug (Korean and English supported; romanization and plan-title fallback when the slug would be empty).

# Commands

## Cursor slash commands

| Slash | Role          | Runs |
| ----- | ------------- | ---- |
| `/p`  | Planning      | `planforge plan "<goal>"` via `.cursor/skills/p` |
| `/i`  | Implementation| `planforge implement "<prompt>"` via `.cursor/skills/i` |

## CLI

| Command | Description |
| ------- | ----------- |
| `planforge init` | Detect providers; optionally install Claude/Codex CLI, hand off for sign-in, show Complete UI; create or suggest `planforge.json`, `.cursor/plans`, skills, and rules. Use `--skip-provider-install` to skip the install step. |
| `planforge plan "<goal>"` | Generate a plan and save to `.cursor/plans/<summary>-<hash>.plan.md` using the planner from `planforge.json`. |
| `planforge implement "<prompt>"` | Run implementation using the implementer from `planforge.json`. Uses the active plan (`.cursor/plans/index.json` `activePlan` or latest `.plan.md`) unless `--plan-file` is set. See [Architecture](docs/architecture.md#context-and-prompts) for prompt structure. |
| `planforge config show` | Print current `planforge.json`. |
| `planforge config suggest [--apply]` | Show suggested config for installed providers; `--apply` writes it to `planforge.json`. |
| `planforge doctor` | Check Claude/Codex CLI, CLAUDE.md, AGENTS.md, planforge.json, `.cursor/plans`. |
| `planforge install [-f]` | Install `.cursor/skills` and `.cursor/rules`; `-f` overwrites existing `planforge.json`. |

# Installation

## Node

```bash
npm install -g @planforge/cli
```

Or from this repo:

```bash
pnpm run build:cli && pnpm -C packages/cli-js link --global
```

## Python

The Python CLI supports `plan` and `implement` with the same behavior as the Node CLI (same plan convention: index.json `activePlan` or latest `.plan.md`). Use the Node CLI if you need the latest features first.

# Initialize

In your Cursor project root:

```bash
planforge init
```

1. **Provider check** – Shows whether Claude CLI and Codex CLI are installed (recommended for `/p` and `/i`).
2. **Install (if missing)** – Choose which provider to install; after install you may be switched to that CLI for sign-in (exit with Ctrl+C when done).
3. **Complete UI** – Shows which provider is ready and the current `/p` and `/i` model mapping.
4. **Install other?** – Option to install the second provider or finish.
5. **planforge.json** – Created from a preset if missing. If it already exists and differs from the suggested config for your installed providers, you’ll be asked whether to update it (so you can see how models change).
6. **Rest** – `claude /init` when Claude is used, AGENTS.md for Codex, `.cursor/plans`, and Cursor skills/rules are set up.

Use `--skip-provider-install` to skip the interactive provider install and only create/update config and directories.

# planforge.json and presets

Config is under `planner` and `implementer`. Presets are chosen from installed providers:

| Installed     | Planner                    | Implementer                |
| ------------- | -------------------------- | -------------------------- |
| Claude + Codex| claude / claude-opus-4-6   | codex / gpt-5.4            |
| Claude only   | claude / claude-opus-4-6   | claude / claude-sonnet-4-6 |
| Codex only    | codex / gpt-5.4            | codex / gpt-5.4            |

Run `planforge config suggest` to see the suggested config; use `--apply` to write it to `planforge.json`.

# Example project structure

```
repo/
├── CLAUDE.md
├── AGENTS.md
├── planforge.json
└── .cursor/
    ├── plans/          # *.plan.md from /p
    ├── skills/
    │   ├── p/          # /p → planforge plan
    │   └── i/          # /i → planforge implement
    └── rules/
```

# Philosophy

Planning and coding are different tasks. PlanForge uses **planforge.json** so you can pick the best model for each role: `/p` uses the planner, `/i` uses the implementer (Claude, Codex, or both depending on what you install and your config).

# Contributing

PRs welcome. Ideas: new providers, better prompts, workflow commands.

# License

MIT
