# MessPulse — Agent Rules

You are building MessPulse strictly from the planning docs in /docs. The docs are the contract.

## Session protocol
1. At the start of EVERY session, read docs/CONTROLLER.md fully and follow its load order exactly.
2. Work on ONE build step at a time. Never load whole docs; read only the current step's entry in docs/DOC4.md and the DOC2/DOC3 sections it points to.
3. Never read docs/vibe-antipatterns.md or docs/prompt-patterns.md unless a CONTROLLER trigger says to.
4. After finishing a step, update the Session State block in docs/CONTROLLER.md (CURRENT_STEP, LAST_COMPLETED, SESSION_STATUS, PAUSED_AT).
5. Never change `PHASE` in docs/CONTROLLER.md. Only the user does.
6. If something is unclear, missing, or conflicts between docs, set SESSION_STATUS to BLOCKED and ask. Do not improvise or silently assume.

## Scope
- Do only what the current step's "What to build" and "Folder/file targets" say. No extra features, refactors, or "helpful" utilities.
- Do not substitute libraries or change the stack in DOC4 §4.0.
- Do not mark a step done until its "Done When" is demonstrated with real command output (typecheck, lint, tests).

## Git rules
- Work on branch `main` until Step 15 is done; use short-lived branches only if the user asks.
- Commit once per completed step, after its checks pass: `Step N: <step name>`.
- Never commit secrets, `.env` files (only `.env.example`), `node_modules`, Python virtualenvs, or video clips.
- Never force-push, rewrite history, or delete branches.
- Do not tag releases (`v1.0-mvp`, `v2.0`) unless the user asks.
