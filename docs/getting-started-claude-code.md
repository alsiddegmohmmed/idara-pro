# Working on this repo with Claude Code

## 1. Install (once)

Requires Node.js 18+ (this repo uses Node 24, see `.nvmrc`).

```bash
npm install -g @anthropic-ai/claude-code
```

Official docs and other install options: https://docs.claude.com/en/docs/claude-code/overview

## 1b. Activate the project's Claude settings (once)

The project commands, subagent and permission settings are delivered in `claude-setup/`.
Review `claude-setup/settings.json` (it lists what Claude may run without asking), then:

```bash
cd ~/Projects/idara-pro
mv claude-setup .claude
```

## 2. Start a session

```bash
cd ~/Projects/idara-pro
claude
```

The first time, it asks you to log in with your Claude account. It reads `CLAUDE.md`
(which imports `AGENTS.md`) automatically, so it already knows the project rules.

## 3. First steps

1. Initialise git (Claude can do it for you):
   > Initialise a git repo, make the first commit with the docs, message "chore: project docs and agent rules".
2. Start Phase 0:
   > /plan-feature Phase 0 foundation from docs/roadmap.md — scaffold the monorepo only (pnpm, turbo, tsconfig, eslint, prettier, packages/shared, empty apps/api NestJS and apps/web Vite). No auth yet.
3. Read the plan, correct it, then say "go ahead".
4. When it finishes: `/review`, then ask it to commit.

Work in small steps like this: plan → approve → build → review → commit.

## 4. Useful controls

| Action | How |
|---|---|
| Plan mode (it plans, doesn't edit) | Press **Shift+Tab** until it shows "plan mode" |
| Stop it mid-task | **Esc** |
| Point it at a file | Type `@` then the path, e.g. `@docs/domain/business-rules.md` |
| Project commands | `/plan-feature`, `/new-module`, `/review`, `/write-adr` |
| Start fresh context (new task) | `/clear` |
| See / change what it may run without asking | `/permissions` (project defaults in `.claude/settings.json`) |
| Subagents (e.g. code-reviewer) | `/agents` |
| Help | `/help` |

## 5. Good habits

- One task per session; `/clear` between unrelated tasks.
- Always ask for tests and the verify command.
- Review every diff before committing — you own the code.
- When a decision is made, ask it to update the docs or write an ADR (`/write-adr`).
- Never paste real passwords, `.env` values or employee personal data into the chat.
