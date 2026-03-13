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
.planforge/plans/YYYY-MM-DD/MMDD-<summary>-<hash>.plan.md
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

Both skills are script-first by design: they must execute the bundled `.cursor/skills/*/scripts/*.sh` commands, and must not directly author plan/code as a fallback.

### CLI

| Command | Description |
| ------- | ----------- |
| `planforge init` | Shows provider check (Claude/Codex) first; detects providers, optionally installs CLI; runs `claude /init` when Claude is available, creates `AGENTS.md` when Codex is available, and creates or suggests `planforge.json`, `.planforge/plans`, `.planforge/contexts`, skills, and rules. Use `--skip-provider-install` to skip provider prompt. |
| `planforge plan "<goal>"` | Generate a plan and save to `.planforge/plans/YYYY-MM-DD/MMDD-<summary>-<hash>.plan.md` using the planner from `planforge.json`. Context is loaded from `--context-dir` (default: `.planforge/contexts`, fallback: `.planforge/context`) and merged from markdown files by recent mtime. Project instructions prefer `CLAUDE.md` for Claude and `AGENTS.md` for Codex, with fallback to the other file. |
| `planforge implement "<prompt>"` | Run implementation using the implementer from `planforge.json`. Uses active plan from `.planforge/plans/index.json` (`activePlan`) or the latest dated `.plan.md` unless `--plan-file` is set. Context is loaded from `--context-dir` (default: `.planforge/contexts`, fallback: `.planforge/context`). Project instructions prefer `CLAUDE.md` for Claude and `AGENTS.md` for Codex, with fallback to the other file. |
| `planforge config show` | Print current `planforge.json`. |
| `planforge config suggest [--apply]` | Show suggested config for installed providers; `--apply` writes it to `planforge.json`. |
| `planforge doctor` | Check Claude/Codex CLI, provider instruction files (`CLAUDE.md`/`AGENTS.md`), `planforge.json`, `.planforge/plans`, and `.planforge/contexts`. |
| `planforge doctor ai` | Run workflow compliance tests with AI: list models (from planforge.json), show selection UI with (recommended) for current planner, then run TC1/TC2. Use `--provider` and `--model` to skip UI. |
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
6. Run `claude /init` when Claude is available, create `AGENTS.md` when Codex is available, then install Cursor skills/rules and create `.planforge/plans` and `.planforge/contexts`.

Use `--skip-provider-install` to skip provider installation prompts and only set up config/directories.

## `planforge.json` default config

When `planforge.json` is missing or created by init, default config is chosen from installed providers:

| Installed | Planner | Implementer |
| --------- | ------- | ----------- |
| Claude + Codex | `claude / claude-opus-4-6` | `codex / gpt-5.4` |
| Claude only | `claude / claude-opus-4-6` | `claude / claude-sonnet-4-6` |
| Codex only | `codex / gpt-5.4` | `codex / gpt-5.4` |

Run `planforge config suggest` to preview, or `planforge config suggest --apply` to write.

**Doctor AI**: `planforge doctor ai` shows available models (from planforge.json when CLI does not provide a free model list), lets you choose which AI to run workflow tests with, and marks the current planner in planforge.json as **(recommended)**. It then runs two tests (plan request, implement request) and reports pass/fail.

## Example Structure

Project context for plan/implement is loaded from provider-specific instruction files in the repo root. Claude prefers `CLAUDE.md`; Codex prefers `AGENTS.md`. If the preferred file is missing, PlanForge falls back to the other file.

```text
repo/
  CLAUDE.md   # Claude project instructions
  AGENTS.md   # Codex project instructions
  planforge.json
  .planforge/
    contexts/
      YYYY-MM-DD/
        MMDD-*.md      # conversation context markdown, merged by recency
    plans/
      YYYY-MM-DD/
        MMDD-*.plan.md
  .cursor/
    skills/
      p/               # /p -> planforge plan
      i/               # /i -> planforge implement
    rules/
```

## Contributing

PRs welcome: new providers, stronger prompts, and workflow improvements.

## License

MIT
