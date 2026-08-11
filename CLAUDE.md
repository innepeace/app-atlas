# CLAUDE.md

The universal agent specification for this project is in `AGENTS.md` — read and follow it at the start of every conversation.

@AGENTS.md

## Quick Reference

- Collection conventions: `docs/CONVENTIONS.md`
- Validation: `node tools/validate.mjs`
- Tests: `node --test`
- Target App source: see `atlas.config.json` → `sourceProject`

## Commit Constraint

After modifying code, AI **must not auto-commit**. Wait for the user's explicit instruction (e.g., "commit") before running `git commit`.
