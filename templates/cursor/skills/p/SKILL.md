---
name: p
description: Run PlanForge planning workflow by executing the bundled plan script.
---

# Plan (Planner) Skill

PlanForge planning skill for Cursor. Use with `/p` to generate development plans.

You must execute the PlanForge command path for every `/p` request. Do not draft a plan yourself.

**When the user invokes /p with a goal (e.g. "/p design a tetris game"):**

1. **Summarize the conversation** - Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write/update a markdown file in the project's **context directory** (`.planforge/contexts`). Write the context summary **in the same language as the user's goal and the conversation**. Use a dated subdirectory and `MMDD-...` filename so plan/implement will read it. Use an **English-only** filename (e.g. `0310-plan.md`, `0310-add-login.plan.md`). After the date prefix, use at most 2 hyphens in the filename (e.g. `1820-make-login-page.plan.md`). Keep it short and overwrite or append as needed.
2. **Run the plan script (required)** - Execute a **single** command (do not chain with `&&`; PowerShell does not support `&&`). Use `.cursor/skills/p/scripts/run_plan.ps1` on Windows (PowerShell) or `.cursor/skills/p/scripts/run_plan.sh` on mac/Linux, with the goal as arguments. Alternatively run `planforge plan "<goal>"` alone. Never create `.plan.md` content directly in chat. The command generates `.planforge/plans/YYYY-MM-DD/MMDD-<summary>-<hash>.plan.md` using `planforge.json`.
3. **After it completes** - Read the generated `.plan.md` file and summarize/reference it in your reply. Do not start implementation. If execution fails, report the error output and suggest concrete fixes (for example `planforge init` or installing the configured provider CLI).

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute hand-written plan.
