---
name: i
description: Run PlanForge implementation workflow by executing the bundled implement script.
---

# Implement (Implementer) Skill

PlanForge implementation skill for Cursor. Use with `/i` to generate code changes.

You must execute the PlanForge command path for every `/i` request. Do not implement directly in chat without running the script.

**When the user invokes /i with a prompt (e.g. "/i implement the login API"):**

1. **Summarize the conversation** - Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write/update a markdown file in the project's **context directory** (`.cursor/contexts`). Use a dated subdirectory and `HHMM-...` filename so plan/implement will read it, for example `.cursor/contexts/2026-03-10/1430-implement.md`. Keep it short and overwrite or append as needed.
2. **Run the implement script in the foreground (required)** - **Before** running the command, output a one-line advisory in the **same language as the user's message** (e.g. if the user wrote in Korean, write in Korean; if in English, in English). Example: "Expand the sandbox and check the output logs." Then run **one** command only: no `cd`, no `&&`. Terminal is already in workspace root. Use `.cursor/skills/i/scripts/run_implement.ps1 "<prompt>"` on Windows or `.cursor/skills/i/scripts/run_implement.sh` on mac/Linux. Run it **in the foreground** so that output streams in the Cursor chat sandbox terminal; do not run in the background. Never write final code as a substitute for script execution. The command runs `planforge implement` using `planforge.json`.
3. **After it completes** - On success, summarize the result or suggest next steps. On failure, report the error output and suggest fixes. Do not produce implementation output in chat without having run the command.

If script execution is blocked or fails, stop and return an error-focused response. Do not provide a substitute direct implementation.
