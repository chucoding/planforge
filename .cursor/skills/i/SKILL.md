# Implement (Implementer) Skill

PlanForge implementation skill for Cursor. Use with `/i` to generate code via Codex.

**When the user invokes /i with a prompt (e.g. "/i implement the login API"):**

1. **Summarize the conversation** – Summarize the current chat (goals, decisions, constraints, relevant files or tech) in a short paragraph and write it to `.cursor/chat-context.txt`. This gives the implementer (Codex/Claude) context when you run the implement command. If the chat is empty or irrelevant, you may write a minimal line or skip writing.
2. **Run the implement command** – Execute `.cursor/skills/i/scripts/run_implement.sh` with the user's prompt as arguments. The CLI uses the configured implementer from planforge.json and may write files based on the output.
3. **After it completes** – Report what was done or any errors. If the command fails, suggest fixes (e.g. run `planforge init`, install the provider CLI).
