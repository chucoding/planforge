# PlanForge

**Bring your own AI to Cursor.**

PlanForge lets you use **Claude or Codex inside Cursor Free**.

If your company already pays for:

* Claude
* Codex
* OpenAI API

you can use them inside Cursor through slash commands without needing **Cursor Pro**.

# Why PlanForge?

Cursor is great, but many developers already pay for AI elsewhere.

For example:

* companies often provide **Claude access**
* developers already use **Codex / OpenAI APIs**

But Cursor requires a separate subscription.

PlanForge lets you use your **existing AI providers** inside Cursor.

# How It Works

PlanForge installs Cursor slash commands that route requests to your AI providers.

Example workflow:

```
/p design a refresh token auth system
```

Runs **Claude** to generate a development plan.

The result is saved to:

```
.cursor/plans/auth-refresh-token-2f91ac7b.plan.md
```

Then implement it:

```
/i implement the plan
```

This runs **Codex** to generate implementation code.

# Commands

| Command | Purpose        | Provider |
| ------- | -------------- | -------- |
| /p      | planning       | Claude   |
| /i      | implementation | Codex    |

# Installation

## Node

```
npm install -g planforge
```

## Python

```
pip install planforge
```

# Initialize

Inside your Cursor project:

```
planforge init
```

This will:

* detect installed AI providers
* run `claude /init` if Claude is available
* create `AGENTS.md` if Codex is used
* install Cursor slash commands
* create `.cursor/plans`

# Example Project Structure

```
repo/
 ├ CLAUDE.md
 ├ AGENTS.md
 ├ planforge.json
 └ .cursor/
     └ plans/
```

# Philosophy

Planning and coding are different tasks.

PlanForge lets you use the **best model for each role**.

Example:

```
/p -> Claude reasoning
/i -> Codex implementation
```

# Roadmap

### v0.1

* `/p` planning command
* Claude provider
* plan file generation

### v0.2

* `/i` implementation command
* Codex provider
* provider routing

### v0.3

* review command
* additional providers
* improved context handling

# Contributing

PRs welcome.

Ideas for contributions:

* new providers
* improved prompts
* workflow commands

# License

MIT
