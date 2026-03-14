# PlanForge

Bring your own AI to Cursor.

PlanForge lets you use Claude or Codex inside Cursor Free. Slash commands and CLI use `planforge.json` to choose which provider runs planning (`/p`) and implementation (`/i`).

## Why PlanForge?

Cursor is great, but many teams and developers already pay for AI elsewhere. PlanForge lets you use Claude or Codex APIs in your Cursor workflow without requiring Cursor Pro.

## Install

```bash
npm install -g planforge
```

## Quick Start

In your Cursor project root:

```bash
planforge init
```

Then use `/p` for planning and `/i` for implementation in Cursor, or run:

- `planforge plan "<goal>"` to generate a dated plan file under `.cursor/plans/YYYY-MM-DD/`
- `planforge implement "<prompt>"` to run implementation

## Commands

| Command | Description |
| ------- | ----------- |
| `planforge init` | Shows provider check (Claude/Codex) first; detects providers, runs `claude /init` when available, creates `AGENTS.md` when Codex is available, creates `planforge.json`, `.cursor/plans`, `.cursor/contexts`, and installs Cursor skills/rules. Use `--skip-provider-install` to skip provider prompt. |
| `planforge plan "<goal>"` | Generate a plan and save to `.cursor/plans/YYYY-MM-DD/{HHMM}-<summary>.plan.md`. Claude prefers `CLAUDE.md`; Codex prefers `AGENTS.md`. |
| `planforge implement "<prompt>"` | Run implementation using the implementer from `planforge.json`, with the same provider-specific instruction file preference and default context loading from `.cursor/contexts`. |
| `planforge config show` | Print current `planforge.json`. |
| `planforge config suggest [--apply]` | Show or apply suggested config for installed providers. |
| `planforge doctor` | Check Claude/Codex CLI, provider instruction files, config, `.cursor/plans`, and `.cursor/contexts`. |
| `planforge install [-f]` | Install `.cursor/skills` and `.cursor/rules`; `-f` overwrites existing `planforge.json`. |

## License

MIT
