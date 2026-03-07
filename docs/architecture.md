# Architecture

(PlanForge 아키텍처 문서)

## Context and prompts

Plan and Implement commands build a single **fullPrompt** sent to the provider (Codex or Claude). Block order is fixed so the model sees system instructions first, then optional context, then the user request.

### Plan (`planforge plan` / `/p`)

1. **System prompt** — `packages/core/prompts/planner-system.md` (or `--system-prompt` if added).
2. **Project context** (optional) — Contents of `AGENTS.md` or `CLAUDE.md` from project root. Capped in size. Omitted if file is missing.
3. **Repository context** (optional) — Git status, `git diff --stat`, `git diff --cached --stat`, and top-level directory list. When a goal is provided and ripgrep (`rg`) is available, a goal-based file list is appended (“## ripgrep (goal-related)”). Omitted if not a git repo. Total size capped; if `rg` is not installed or fails, only git/dirs are included.
4. **Conversation context** (optional) — From `--context-file` (e.g. `.cursor/chat-context.txt`) or `--context`.
5. **User goal** — The planning goal string.

So: `[ system ]` + (optional) `[ Project context ]` + (optional) `[ Repository context ]` + (optional) `[ Conversation context ]` + `[ User goal ]`.

### Implement (`planforge implement` / `/i`)

1. **System prompt** — `packages/core/prompts/implementer-system.md`.
2. **Project context** (optional) — Same as plan: `AGENTS.md` or `CLAUDE.md` from project root. Capped in size.
3. **Conversation context** (optional) — Same as plan (`--context-file` / `--context`).
4. **Current plan** (optional) — Plan body when `--plan-file` is set or when a plan is auto-selected (see below). Inserted as “Current plan (follow this):”.
5. **Files to focus on** (optional) — List of file paths. From the plan’s “Files Likely to Change” section (parsed automatically) or from `--files`. When present, the implementer is instructed to treat these as primary edit targets.
6. **Relevant file contents** (optional) — Contents of those files (non-glob paths only), concatenated and capped in total size.
7. **User request** — The implementation prompt.

So: `[ system ]` + (optional) `[ Project context ]` + (optional) `[ Conversation context ]` + (optional) `[ Current plan ]` + (optional) `[ Files to focus on ]` + (optional) `[ Relevant file contents ]` + `[ User request ]`.

### Which plan is used for implement?

- If you pass **`--plan-file <path>`**, that file is read and used as the current plan.
- Otherwise, the CLI resolves the **active plan**:
  - **A.** `.cursor/plans/index.json` may contain `{ "activePlan": "filename or path" }`. If present and the file exists, that plan is used.
  - **B.** If not, the **latest modified** `.cursor/plans/*.plan.md` file is used.
