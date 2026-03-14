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
.cursor/plans/YYYY-MM-DD/{HHMM}-<summary>.plan.md
```

Plans live under `.cursor` so that opening a `*.plan.md` file in Cursor shows the **Build** button. If a plan file is occasionally unreadable in the IDE, reopen it or run `planforge implement` from the terminal.

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

Both skills are script-first by design: they must execute the bundled `.cursor/skills/*/scripts/*.sh` commands, and must not directly author plan/code as a fallback.

### CLI

| Command | Description |
| ------- | ----------- |
| `planforge init` | Shows provider check (Claude/Codex) first; detects providers, optionally installs CLI; runs `claude /init` when Claude is available, creates `AGENTS.md` when Codex is available, and creates or suggests `planforge.json`, `.cursor/plans`, `.cursor/contexts`, skills, and rules. Use `--skip-provider-install` to skip provider prompt. |
| `planforge plan "<goal>"` | Generate a plan and save to `.cursor/plans/YYYY-MM-DD/{HHMM}-<summary>.plan.md` using the planner from `planforge.json`. Context is loaded from `--context-dir` (default: `.cursor/contexts`) and merged from markdown files by recent mtime. Project instructions prefer `CLAUDE.md` for Claude and `AGENTS.md` for Codex, with fallback to the other file. |
| `planforge implement "<prompt>"` | Run implementation using the implementer from `planforge.json`. Uses active plan from `.cursor/plans/index.json` (`activePlan`) or the latest dated `.plan.md` unless `--plan-file` is set. Context is loaded from `--context-dir` (default: `.cursor/contexts`). Project instructions prefer `CLAUDE.md` for Claude and `AGENTS.md` for Codex, with fallback to the other file. |
| `planforge config show` | Print current `planforge.json`. |
| `planforge config suggest [--apply]` | Show suggested config for installed providers; `--apply` writes it to `planforge.json`. |
| `planforge doctor` | Check Claude/Codex CLI, provider instruction files (`CLAUDE.md`/`AGENTS.md`), `planforge.json`, `.cursor/plans`, and `.cursor/contexts`. |
| `planforge doctor ai` | Run workflow compliance tests with AI: same interactive UI as `planforge model` (mode → provider → model, with cheapest model marked (recommended)). Uses models from `models.json` when available. Use `--provider` and `--model` to skip UI. |
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
5. Create or update `planforge.json` (default config is generated from installed providers).
6. Run `claude /init` when Claude is available, create `AGENTS.md` when Codex is available, then install Cursor skills/rules and create `.cursor/plans` and `.cursor/contexts`.

Use `--skip-provider-install` to skip provider installation prompts and only set up config/directories.

## `planforge.json` default config

When `planforge.json` is missing or created by init, default config is chosen from installed providers:

| Installed | Planner | Implementer |
| --------- | ------- | ----------- |
| Claude + Codex | `claude / claude-opus-4-6` | `codex / gpt-5.4` |
| Claude only | `claude / claude-opus-4-6` | `claude / claude-sonnet-4-6` |
| Codex only | `codex / gpt-5.4` | `codex / gpt-5.4` |

Run `planforge config suggest` to preview, or `planforge config suggest --apply` to write.

**Doctor AI**: `planforge doctor ai` uses the same interactive model selection as `planforge model` (mode → provider → model, with effort/reasoning). The model list comes from `models.json` when available; the cheapest model (last in each provider’s list) is shown as **(recommended)**. It then runs workflow tests (plan request, implement request, etc.) and reports pass/fail.

## Example Structure

Project context for plan/implement is loaded from provider-specific instruction files in the repo root. Claude prefers `CLAUDE.md`; Codex prefers `AGENTS.md`. If the preferred file is missing, PlanForge falls back to the other file.

```text
repo/
  CLAUDE.md   # Claude project instructions
  AGENTS.md   # Codex project instructions
  planforge.json
  .cursor/
    plans/
      YYYY-MM-DD/
        HHMM-*.plan.md   # plan files (HHMM = time 24h)
      index.json        # activePlan
    contexts/
      YYYY-MM-DD/
        HHMM-*.md       # conversation context markdown, merged by recency
    skills/
      p/                # /p -> planforge plan
      i/                # /i -> planforge implement
    rules/
```

## Contributing

PRs welcome: new providers, stronger prompts, and workflow improvements.

## License

MIT
