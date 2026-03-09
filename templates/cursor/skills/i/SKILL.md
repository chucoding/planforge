---
name: i
description: Run PlanForge implementation workflow by executing the bundled implement script.
---

# Implement (Implementer) Skill

PlanForge implementation skill for Cursor. Use with `/i` to generate code changes.

You must execute the PlanForge command path for every `/i` request. Do not implement directly in chat without running the script.

**When the user invokes /i with a prompt (e.g. "/i implement the login API"):**

1. **Summarize the conversation** - Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write/update a markdown file in `.cursor/context/` (for example `.cursor/context/2026-03-10-implement.md`). Keep it short and overwrite or append as needed.
2. **Run the implement script (required)** - Execute `.cursor/skills/i/scripts/run_implement.sh` (mac/Linux) or `.cursor/skills/i/scripts/run_implement.ps1` (Windows PowerShell) with the user's prompt as arguments. Never write final code as a substitute for script execution. The command runs `planforge implement` using `planforge.json`.
3. **After it completes** - Report what changed or report the execution error. If execution fails, include concrete fixes (for example `planforge init` or installing the configured provider CLI).

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute direct implementation.
