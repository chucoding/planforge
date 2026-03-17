---
name: p
description: Run PlanForge planning workflow by executing the bundled plan script.
---

# Plan (Planner) Skill

PlanForge planning skill for Cursor. Use with `/p` to generate development plans.

You must execute the PlanForge command path for every `/p` request. Do not draft a plan yourself.

**When the user invokes /p with a goal (e.g. "/p design a tetris game"):**

0. **Pre-fetch URLs (if goal contains URLs)** - If the goal contains any URLs (match `https?://[^\s]+`, including notion.so / notion.site):
   - For each URL: use MCP tool **notion-fetch** (server `user-Notion`) with `{ "id": "<url>" }` for Notion URLs; use **mcp_web_fetch** for other web URLs. Skip failed URLs; combine successful results into one markdown (e.g. `## <URL>\n\n<content>` per URL). Keep this content for step 1.

1. **Context file (one file: chat history + optional URL content)** - Derive a **slug** from the goal using the same rules as the plan command: lowercase ASCII letters, digits, hyphens only; at most 2 hyphens; English-only (e.g. `add-login`, `make-tetris`). Write **one** markdown file to the project's **context directory** (`.cursor/contexts`) under a dated subdirectory `YYYY-MM-DD` with filename `HHMM-<slug>.md` (use current time for HHMM). Do **not** over-summarize the conversation; use this format only:
   ```
   # Cursor Chat History
   User : {Question1}
   Agent : {Answer1}
   User : {Question2}
   Agent : {Answer2}
   ...

   Use this conversation to understand the user's intent and as reference when creating the plan.
   ```
   If you fetched URL content in step 0, append it as a separate section (e.g. `## Fetched URLs` or per-URL headings) in the **same** file. Create the dated subdirectory if it does not exist.

2. **Run the plan script in the foreground (required)** - Run **one** command only: no `cd`, no `&&` (PowerShell does not support `&&`). Terminal is already in workspace root. Use `.cursor/skills/p/scripts/run_plan.ps1 "<goal>"` on Windows or `.cursor/skills/p/scripts/run_plan.sh` on mac/Linux, or `planforge plan "<goal>"`. Run it **in the foreground** so that output streams in the Cursor chat sandbox terminal; do not run in the background. Pass the **same slug** so the plan output filename matches the context file: invoke as `planforge plan "<goal>" --slug <slug>` (or ensure the script forwards `--slug <slug>`). The command generates `.cursor/plans/YYYY-MM-DD/{HHMM}-<slug>.plan.md` so that context file `HHMM-<slug>.md` and plan file `HHMM-<slug>.plan.md` use the same slug. Never create `.plan.md` content directly in chat.

3. **After it completes** - Read the generated `.plan.md` file and summarize/reference it in your reply. Do not start implementation. If execution fails, report the error output and suggest concrete fixes (for example `planforge init` or installing the configured provider CLI).

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute hand-written plan.
