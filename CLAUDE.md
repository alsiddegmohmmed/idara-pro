# CLAUDE.md

Claude Code reads this file automatically at the start of every session.
The full rules live in AGENTS.md so every AI tool shares one source of truth.

@AGENTS.md

## Claude Code specifics

- For any task larger than a small fix, start in **plan mode** and show the plan
  (files, schema changes, tests) before editing.
- Use the project commands in `.claude/commands/`:
  - `/plan-feature <description>` — plan a feature against the spec and rules
  - `/new-module <name>` — scaffold a module with the 4-layer structure
  - `/review` — review the current changes against AGENTS.md
  - `/write-adr <decision>` — record an architecture decision
- Use the `code-reviewer` subagent before finishing a feature.
- Current phase and next tasks: `docs/roadmap.md`. Tick tasks there when done.
- The owner (Siddeg) is new to Claude Code: explain briefly what you changed and why,
  and give the exact command to run to verify it.
