# Crit Stage

A live feedback stage for this course's crits: a presenter runs a projected
ladder (Clarify → Strengths → Concerns → Suggestions), teammates submit
written feedback from their phones via a room code, and only the rung the
presenter has open accepts cards. See `PROCESS.md` for the stack ADR and
`README.md` for what it draws on and deliberately doesn't do.

## Rules for working in this repo

- Never fabricate feedback data. Any demo/seed data must be clearly labelled
  as an example (e.g. a `[example]` prefix), never presented as a real crit's
  content.
- Cited methods and sources (Ladder of Feedback, Liz Lerman's Critical
  Response Process, Kahoot, or anything else) must be real and checkable. If
  not certain of an exact citation, flag it inline ("source to verify")
  rather than asserting it confidently.
- `src/db/schema.ts` is the single source of truth for the database. Schema
  changes go through `pnpm db:generate` (drizzle-kit) and a committed
  migration under `drizzle/` -- never a hand-edited table or an out-of-band
  `ALTER`.
- Small, frequent commits: one per working step, not one large commit at the
  end.

## Stack

Astro (`output: "server"`, `@astrojs/node` standalone) + Drizzle ORM
(`drizzle-orm/better-sqlite3`) + SQLite on the Fly volume at `/data`
(`DB_PATH`, default `/data/app.db`). pnpm, Node 24.21.0 (pinned in
`mise.toml`).

## Commands

- `pnpm dev` -- local dev server.
- `pnpm db:generate` -- generate a migration after editing `src/db/schema.ts`.
- `pnpm check` -- typecheck + the full spec suite, against a **running**
  app (`APP_URL`, default `http://localhost:8080`); start the app first.
- `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-u8033161`
  -- deploy (builds remotely; no local Docker needed).
