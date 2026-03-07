# Architecture

(PlanForge 아키텍처 문서)

## Context and prompts

Plan and Implement commands build a single **fullPrompt** sent to the provider (Codex or Claude). Block order is fixed so the model sees system instructions first, then optional context, then the user request.

### Plan (`planforge plan` / `/p`)

1. **System prompt** — `packages/core/prompts/planner-system.md` (or `--system-prompt` if added).
2. **Repository context** (optional) — Git status, `git diff --stat`, `git diff --cached --stat`, and top-level directory list. Omitted if not a git repo. Capped in size.
3. **Conversation context** (optional) — From `--context-file` (e.g. `.cursor/chat-context.txt`) or `--context`. Used so the planner can use recent chat summary.
4. **User goal** — The planning goal string.

So: `[ system ]` + (optional) `[ Repository context ]` + (optional) `[ Conversation context ]` + `[ User goal ]`.

### Implement (`planforge implement` / `/i`)

1. **System prompt** — `packages/core/prompts/implementer-system.md`.
2. **Conversation context** (optional) — Same as plan (`--context-file` / `--context`).
3. **Current plan** (optional) — Plan body when `--plan-file` is set or when a plan is auto-selected (see below). Inserted as “Current plan (follow this):”.
4. **User request** — The implementation prompt.

So: `[ system ]` + (optional) `[ Conversation context ]` + (optional) `[ Current plan ]` + `[ User request ]`.

### Which plan is used for implement?

- If you pass **`--plan-file <path>`**, that file is read and used as the current plan.
- Otherwise, the CLI resolves the **active plan**:
  - **A.** `.cursor/plans/index.json` may contain `{ "activePlan": "filename or path" }`. If present and the file exists, that plan is used.
  - **B.** If not, the **latest modified** `.cursor/plans/*.plan.md` file is used.

Project-specific context (e.g. CLAUDE.md, AGENTS.md) is not injected by PlanForge; the agent or editor may read those separately.
