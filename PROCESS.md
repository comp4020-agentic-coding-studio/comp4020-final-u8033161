# Process overview

This is the Crit 8 slice of a three-week final project: a live feedback
stage for this course's crits (see `README.md` for the what and why). The
brief and spec for Crit 8 are on the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/#what-you-submit).

## ADR 1: Astro (server) + Drizzle ORM + SQLite on the Fly volume

**Context.** `fly.toml` fixes a single small Fly machine and one volume at
`/data` -- no second service, no managed database. The repo arrived with no
app framework and no ORM: the final-project template explicitly leaves the
stack open (confirmed: the course's own `stack` tooling only converts weekly
crit repos to static GitHub Pages and doesn't touch this repo). The app
needs server-rendered pages *and* a few API routes (create room, switch the
open rung, submit a card, poll room state) talking to one small database,
all on one process.

**Decision.** Astro with `output: "server"` and the `@astrojs/node` adapter
in standalone mode, so pages and API routes live in one Node process with no
separate backend. Drizzle ORM via `drizzle-orm/better-sqlite3` (Drizzle's
documented, stable SQLite driver), with `drizzle-kit` migrations committed
under `drizzle/` and applied automatically at container startup, against
`DB_PATH` (`/data/app.db` in production -- the one thing `fly.toml` says
survives a redeploy).

**Consequences.** `better-sqlite3` is a synchronous, native-binding driver
tied to a local file -- fine for one always-on machine, wrong if this ever
needed to scale past a single instance or move to the edge. The Dockerfile
installs `python3 make g++` in its builder stage so the native binding
compiles from source if no prebuilt one matches the image, at the cost of a
slightly longer build.
Scaffolded in [`61eba37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/61eba37).

## Deploying early, not just at the end

Rather than building the whole slice locally and deploying once at the end,
the Dockerfile was rewritten and deployed as soon as room creation existed
([`61f274f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/61f274f)),
then redeployed after every following step. That surfaced two
production-only problems immediately instead of at the deadline: the Node
adapter defaults to listening on `localhost`, which `fly-proxy` can't reach
(needed `HOST=0.0.0.0`); and Fly's edge terminates TLS and forwards to the
app over plain HTTP, so without telling Astro to trust
`X-Forwarded-Proto`/`-Host` for this app's hostname
(`security.allowedDomains` in `astro.config.mjs`), every real HTTPS request
was rejected as cross-site -- Origin said `https:`, the request Astro
reconstructed said `http:`. Both are fixed in the same commit; later steps
(
[`a278095`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/a278095),
[`eaa81d7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/eaa81d7),
[`68957d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/68957d0),
[`792f590`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/792f590)
) were each confirmed live the same way.

## Polling this week, SSE next week

Both the stage and the room page poll `GET /api/rooms/[code]` every few
seconds with plain `fetch`, no animation
([`68957d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/68957d0)).
This is deliberate, not a placeholder forgotten: this week's focus is
persistence (SQLite on the volume) and the interaction decision (only the
open rung accepts cards, enforced server-side), not transport. Crit 9 swaps
polling for SSE, at which point presence (the blinking dots) and arrival
animation become straightforward to add on the same stream.

## Manual end-to-end test on the live deployment

Ran the real flow against `https://comp4020-final-u8033161.fly.dev`, not
just `pnpm check`: created a room, opened the stage on one device and
joined with the code on another. All four rungs unlocked in sequence from
the stage; each one accepted a card from the participant device and it
appeared on the big-screen stage within a few seconds (polling); a page
refresh on both devices kept everything as it was. Confirms the open-rung
rule and the Fly-volume persistence hold up outside of the spec suite, not
just inside it.

## What this slice deliberately leaves out

No realtime push, no participant presence, no sealed-envelope/consent flow
for Concerns cards, and no cross-week growth-timeline status
(will-do/won't-do/done) -- all out of scope for Crit 8, per the staged plan
in `README.md`.
