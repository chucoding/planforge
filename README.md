# PlanForge

Bring your own AI to Cursor.

PlanForge lets you use Claude or Codex inside Cursor Free. Slash commands and CLI use `planforge.json` to choose which provider runs planning (`/p`) and implementation (`/i`).

## Why PlanForge?

Cursor is great, but many teams and developers already pay for AI elsewhere.

- Companies often provide Claude access.
- Developers already use Codex/OpenAI APIs.

PlanForge lets you use those existing providers in your Cursor workflow without requiring Cursor Pro.

## How It Works

PlanForge installs Cursor slash commands and reads `planforge.json` for routing.

- `/p` and `planforge plan` use the planner.
- `/i` and `planforge implement` use the implementer.

Example:

```text
/p design a refresh token auth system
```

The plan is saved to:

```text
.cursor/plans/<summary>-<hash>.plan.md
```

Then:

```text
/i implement the plan
```

Plan names use goal-based slugs. Korean and English are supported, with romanization and title fallback when needed.

## Commands

### Cursor slash commands

| Slash | Role | Runs |
| ----- | ---- | ---- |
| `/p` | Planning | `planforge plan "<goal>"` via `.cursor/skills/p` |
| `/i` | Implementation | `planforge implement "<prompt>"` via `.cursor/skills/i` |

### CLI

| Command | Description |
| ------- | ----------- |
| `planforge init` | Detect providers; optionally install Claude/Codex CLI; create or suggest `planforge.json`, `.cursor/plans`, skills, and rules. Use `--skip-provider-install` to skip provider install. |
| `planforge plan "<goal>"` | Generate a plan and save to `.cursor/plans/<summary>-<hash>.plan.md` using the planner from `planforge.json`. |
| `planforge implement "<prompt>"` | Run implementation using the implementer from `planforge.json`. Uses active plan from `.cursor/plans/index.json` (`activePlan`) or latest `.plan.md` unless `--plan-file` is set. |
| `planforge config show` | Print current `planforge.json`. |
| `planforge config suggest [--apply]` | Show suggested config for installed providers; `--apply` writes it to `planforge.json`. |
| `planforge doctor` | Check Claude/Codex CLI, `CLAUDE.md`, `AGENTS.md`, `planforge.json`, `.cursor/plans`. |
| `planforge install [-f]` | Install `.cursor/skills` and `.cursor/rules`; `-f` overwrites existing `planforge.json`. |

## Installation

### Node CLI

```bash
npm install -g planforge
```

Or from this repo:

```bash
cd packages/cli-js && pnpm install && pnpm run install:global
```

### Python CLI

The Python CLI supports `plan` and `implement` with matching core behavior. Use the Node CLI if you need the newest features first.

## Initialize

In your Cursor project root:

```bash
planforge init
```

Flow:

1. Provider check for Claude CLI and Codex CLI.
2. Optional install for missing provider(s).
3. Sign-in handoff to installed CLI when needed.
4. Optional install of the other provider.
5. Create or update `planforge.json` using provider-aware presets.
6. Install Cursor skills/rules and create `.cursor/plans`.

Use `--skip-provider-install` to skip provider installation prompts and only set up config/directories.

## `planforge.json` Presets

Presets are selected from installed providers:

| Installed | Planner | Implementer |
| --------- | ------- | ----------- |
| Claude + Codex | `claude / claude-opus-4-6` | `codex / gpt-5.4` |
| Claude only | `claude / claude-opus-4-6` | `claude / claude-sonnet-4-6` |
| Codex only | `codex / gpt-5.4` | `codex / gpt-5.4` |

Run `planforge config suggest` to preview, or `planforge config suggest --apply` to write.

## Example Structure

```text
repo/
  CLAUDE.md
  AGENTS.md
  planforge.json
  .cursor/
    plans/          # *.plan.md from /p
    skills/
      p/            # /p -> planforge plan
      i/            # /i -> planforge implement
    rules/
```

## Contributing

PRs welcome: new providers, stronger prompts, and workflow improvements.

## License

MIT
