# Process overview

A live feedback stage for this course's crits (see `README.md` for the what
and why), run across Crits 8, 9 and 10 in one repo. This account is
rewritten at each crit rather than appended to, so it always describes the
project as it stands. The brief and spec are on the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/#what-you-submit).

## ADR 1: Astro (server) + Drizzle ORM + SQLite on the Fly volume

**Context.** `fly.toml` fixes a single small Fly machine and one volume at
`/data` -- no second service, no managed database. The repo arrived with no
app framework and no ORM: the final-project template explicitly leaves the
stack open. The app needs server-rendered pages *and* API routes talking to
one small database, all on one process.

**Decision.** Astro with `output: "server"` and the `@astrojs/node` adapter
in standalone mode, so pages and API routes live in one Node process with no
separate backend. Drizzle ORM via `drizzle-orm/better-sqlite3`, with
`drizzle-kit` migrations committed under `drizzle/` and applied automatically
at container startup, against `DB_PATH` (`/data/app.db` in production).

**Consequences.** `better-sqlite3` is a synchronous, native-binding driver
tied to a local file -- fine for one always-on machine, wrong past a single
instance. The Dockerfile installs `python3 make g++` so the native binding
compiles from source if no prebuilt one matches the image.
Scaffolded in [`61eba37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/61eba37).

## ADR 2: a 10-second closing countdown instead of an instant switch

**Title.** How the open rung behaves when the presenter moves on while
someone is still writing.

**Status.** Accepted, Crit 9.

**Context.** Crit 8 shipped one server-side rule: only the rung the
presenter currently has open accepts a card. That rule is unforgiving the
moment the app goes real-time (below): with polling, an in-flight card had
a few seconds of accidental slack, because the presenter's own screen
lagged by the same amount. Over SSE, a click lands everywhere in under a
second, so someone halfway through a Concerns card loses their rung the
instant the presenter taps "Suggestions," with no warning and no way to
recover what they'd written. `README.md`'s own definition of good names
exactly this failure: feedback should be "given in order" but "every
person's words get recorded" -- an instant close serves the first half at
the direct expense of the second.

Four options were on the table:

- **A -- close immediately.** Crit 8's behaviour, just faster now. Simplest,
  and most likely to eat an unsent card with no warning.
- **B -- close immediately, keep the draft client-side.** As abrupt as A,
  but the rejected submit doesn't clear the textarea -- nothing lost, only
  misfiled, to be copied into whichever rung opens next.
- **C -- close, then grant a short grace window.** The stage switches
  straight away; the server still accepts cards for the just-closed rung a
  few seconds after, for whoever hadn't noticed yet.
- **D -- announce the close, then switch.** The click starts a visible
  countdown ("Clarify closes in 10s") before anything changes; the rung
  stays genuinely open for the whole countdown.

**Decision.** D. The click schedules the switch rather than committing it:
the server broadcasts `step-closing` immediately, keeps the old rung open
for `STEP_COUNTDOWN_MS` (10s in production), then commits and broadcasts
`step`. A second step request while one is already counting down is
rejected (409) rather than restarting the clock or racing two timers --
one in-flight countdown per room. `src/lib/broadcast.ts` keeps this as an
in-memory `pending` map, included in the `snapshot` every new or
reconnecting connection gets, so a presenter's own refresh mid-countdown
rejoins the same clock instead of losing it.

Weighed against C, D treats the *participant* as the one who needs the
warning, not just a grace period after the fact: C still closes the rung
on the stage before anyone writing has any signal, which matches "every
person's words get recorded" only if their request happens to beat an
undisclosed clock. D's visible countdown is the more honest version of the
same mechanism. A and B were rejected for the reason above: the Ladder of
Feedback needs to run in order, but not at the cost of silently discarding
feedback mid-sentence.

**Consequences.** Every switch now costs the room a fixed 10 seconds it
didn't before -- roughly 30 seconds added across four rungs, paid once per
transition. Someone can still miss the window (a slow typist, a moment's
distraction), getting the same 409 a B-style keep would soften, with the
same mitigation: the draft stays in the textarea, and the error message
says so. The countdown state lives only in process memory, alongside the
connection table: if the app restarts mid-countdown, the pending switch is
lost and the presenter clicks the rung again -- acceptable because a
mid-countdown restart is rare and the fix is one click, not data loss.

## Realtime: SSE, not another round of polling

**Context.** `README.md`'s interaction decision (only the open rung accepts
cards) is only as good as how fast everyone finds out which rung that is.
Crit 8 polled every few seconds; the final project's brief requires a
change to appear in every open session within about a second, with no
reload.

**Decision.** Server-Sent Events over one `GET /api/rooms/[code]/events`
endpoint. `src/lib/broadcast.ts` keeps an in-memory `Map<roomCode,
Set<connection>>`; `cards.ts` and `step.ts` call `broadcast()` on every
state change. Every connection -- a first load or an `EventSource`'s own
automatic reconnect after a dropped phone network -- gets a `snapshot`
event first, carrying the full current state, so a reconnect redraws from
the server's truth rather than replaying whatever happened while offline.
A periodic heartbeat comment keeps the connection from reading as idle to
an intervening proxy.
([`6feec45`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/6feec45),
[`b67c53e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/b67c53e))

**Consequences.** `broadcast()` writes to each connection independently and
catches per-connection failures, so one half-closed socket can't block
delivery to the rest of the room -- but the in-memory table is tied to a
single process: it only works because `fly.toml` pins the app to one
machine (`--ha=false`). A second instance would keep its own, disjoint
table. Verified against the live deployment, not just `pnpm check`: a card
submitted from one device reached another's SSE connection within the
push itself, with no buffering observed from Fly's edge.

## Deploying every step, not just at the end

Every commit above was pushed and redeployed as it landed, the discipline
Crit 8 started
([`61f274f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/61f274f)).
This week that caught nothing production-specific the way HOST/TLS did in
Crit 8 -- but confirming that *is* the point: a long-lived connection
surviving a real reverse proxy is cheap to check early and expensive to
discover at the cutoff.

## What this slice deliberately leaves out

No participant presence (who else is in the room), no fly-in card
animation, and no sealed-envelope/consent flow for Concerns cards -- all
out of scope for Crit 9, per the staged plan in `README.md`. The
cross-week growth-timeline status (will-do/won't-do/done) is Crit 10's.
