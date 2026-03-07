# Plan (Planner) Skill

PlanForge planning skill for Cursor. Use with `/p` to generate development plans.

**When the user invokes /p with a goal (e.g. "/p design a tetris game"):**

1. **Summarize the conversation** – Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write it to `.cursor/chat-context.txt`. This gives the planner (Codex/Claude) context when you run the plan command. If the chat is empty or irrelevant, you may write a minimal line or skip writing.
2. **Run the plan command** – Execute `.cursor/skills/p/scripts/run_plan.sh` with the goal as arguments. Do not write a plan file yourself; the CLI creates `.cursor/plans/<summary>-<hash>.plan.md` using the configured provider (from planforge.json).
3. **After it completes** – The CLI opens the created `.plan.md` in Cursor for review. Read the file and briefly summarize or reference it in your reply. Do **not** run implementation; the user will review and use `/i` when ready. If the command fails, report the error and suggest fixes (e.g. run `planforge init`, install the provider CLI).

This ensures the same provider and model (e.g. Codex gpt-5.4) are used as in the project config, and the file is named correctly.
