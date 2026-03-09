---
name: p
description: Run PlanForge planning workflow by executing the bundled plan script.
---

# Plan (Planner) Skill

PlanForge planning skill for Cursor. Use with `/p` to generate development plans.

You must execute the PlanForge command path for every `/p` request. Do not draft a plan yourself.

**When the user invokes /p with a goal (e.g. "/p design a tetris game"):**

1. **Summarize the conversation** - Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write/update a markdown file in `.cursor/context/` (for example `.cursor/context/2026-03-10-plan.md`). Keep it short and overwrite or append as needed.
2. **Run the plan script (required)** - Execute `.cursor/skills/p/scripts/run_plan.sh` (mac/Linux) or `.cursor/skills/p/scripts/run_plan.ps1` (Windows PowerShell) with the goal as arguments. Never create `.plan.md` content directly in chat. The command generates `.cursor/plans/<summary>-<hash>.plan.md` using `planforge.json`.
3. **After it completes** - Read the generated `.plan.md` file and summarize/reference it in your reply. Do not start implementation. If execution fails, report the error output and suggest concrete fixes (for example `planforge init` or installing the configured provider CLI).

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute hand-written plan.
