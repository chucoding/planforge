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

- `planforge plan "<goal>"` — generate a plan
- `planforge implement "<prompt>"` — run implementation

## Commands

| Command | Description |
| ------- | ----------- |
| `planforge init` | Detect providers, create `planforge.json`, install Cursor skills/rules. Use `--skip-provider-install` to skip provider install. |
| `planforge plan "<goal>"` | Generate a plan and save to `.cursor/plans/`. |
| `planforge implement "<prompt>"` | Run implementation using the implementer from `planforge.json`. |
| `planforge config show` | Print current `planforge.json`. |
| `planforge config suggest [--apply]` | Show or apply suggested config for installed providers. |
| `planforge doctor` | Check Claude/Codex CLI, config, and `.cursor/plans`. |
| `planforge install [-f]` | Install `.cursor/skills` and `.cursor/rules`; `-f` overwrites existing `planforge.json`. |

## License

MIT
