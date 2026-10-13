# Process overview

A live feedback stage for this course's crits (see `README.md`), run
across Crits 8, 9 and 10 in one repo. Rewritten at each crit rather than
appended to, so it always describes the project as it stands. Brief and
spec: [course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/#what-you-submit).

## ADR 1: Astro (server) + Drizzle ORM + SQLite on the Fly volume

**Context.** `fly.toml` fixes one small Fly machine and one volume at
`/data` -- no second service, no managed database -- and the app needs
server-rendered pages and API routes talking to one database, all on one
process.

**Decision.** Astro (`output: "server"`, `@astrojs/node` standalone) in
one Node process with no separate backend. Drizzle ORM via
`drizzle-orm/better-sqlite3`, migrations committed under `drizzle/` and
applied automatically at container startup against `DB_PATH`
(`/data/app.db` in production).

**Consequences.** `better-sqlite3` is synchronous and tied to a local
file -- fine for one always-on machine, wrong past a single instance.
Scaffolded in [`61eba37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/61eba37).

## ADR 2: a 10-second closing countdown instead of an instant switch

**Title.** How the open rung behaves when the presenter moves on while
someone is still writing.

**Status.** Accepted, Crit 9.

**Context.** Crit 8 shipped one rule: only the rung the presenter has
open accepts a card. Unforgiving once the app goes real-time (below):
polling gave an in-flight card a few accidental seconds of slack, since
the presenter's own screen lagged the same amount. Over SSE, a click
lands everywhere in under a second, so someone mid-Concerns-card loses
their rung the instant the presenter taps "Suggestions," with no
warning. `README.md`'s own definition of good names this exact failure:
feedback should be "given in order" but "every person's words get
recorded" -- an instant close serves the first half at the second's
expense.

Four options: **A** -- close immediately (just faster now; most likely
to eat an unsent card); **B** -- close immediately, keep the draft
client-side (the rejected submit doesn't clear the textarea); **C** --
close, then grant a short grace window (cards for the just-closed rung
still accepted briefly after); **D** -- announce the close, then switch
(a visible countdown, "Clarify closes in 10s", before anything changes;
the rung stays genuinely open throughout).

**Decision.** D. The click schedules the switch rather than committing it:
the server broadcasts `step-closing` immediately, keeps the old rung open
for `STEP_COUNTDOWN_MS` (10s in production), then commits and broadcasts
`step`. A second step request while one is counting down is rejected
(409) rather than racing two timers. `src/lib/broadcast.ts` keeps this as
an in-memory `pending` map, included in every `snapshot` as `remainingMs`
(re-measured fresh per connection, not a shared absolute timestamp, so no
client's clock has to agree with the server's) -- a refresh mid-countdown
rejoins the same clock instead of losing it.

Weighed against C, D treats the participant as the one needing the
warning: C still closes the rung before anyone writing has any signal. A
and B were rejected outright: order matters, but not at the cost of
silently discarding feedback mid-sentence.

Two gaps surfaced live. First: the 409-keeps-your-draft behaviour only
covered a rejected *submit* -- text never submitted at all, left in the
textarea when the countdown ran out, still vanished with the closing
form. Caught now: on a committed `step`, unsent text in the closing rung
carries forward as a read-only draft on whichever rung opens next
(Copy-in, never automatic, plus Dismiss), and is written to
`sessionStorage` so it survives a refresh or reconnect.

Second: that draft box rendered once, into whichever rung was open at
the time, and stayed there -- a presenter going Back past it left the box
glued to a now-locked rung still reading "Copy into Strengths," while the
rung the draft belonged to sat empty. Fixed in
[`c760abc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/c760abc):
the offered draft is tracked as one piece of state, not a DOM node, and
re-placed on every step change -- or cleared, if the open rung is the
draft's own, since that rung's form already prefills the text.

**Consequences.** Every switch costs the room a fixed 10 seconds -- ~30s
across four rungs. The countdown lives only in process memory: a restart
mid-countdown loses the pending switch, and the presenter clicks the
rung again. The carried-forward draft is a client-side safety net, not a
replacement for the server-side rule: `sessionStorage` is wrapped in
try/catch and only survives within the same tab. Both gaps were found
using the real app on a real device, not `pnpm check` -- the spec suite
asserts against HTTP responses, and both are about what a person watching
the screen sees happen to their words.

## Realtime: SSE, not another round of polling

**Context.** The open-rung rule is only as good as how fast everyone finds
out which rung that is. Crit 8 polled every few seconds; the brief
requires a change to appear within about a second, with no reload.

**Decision.** Server-Sent Events over one `GET /api/rooms/[code]/events`
endpoint. `src/lib/broadcast.ts` keeps an in-memory `Map<roomCode,
Set<connection>>`; `cards.ts` and `step.ts` call `broadcast()` on every
state change. Every connection -- first load or reconnect -- gets a
`snapshot` first, carrying full current state, so a reconnect redraws
from the server's truth rather than replaying what happened while
offline. A periodic heartbeat comment keeps the connection from reading
as idle to an intervening proxy.
([`6feec45`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/6feec45),
[`b67c53e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/b67c53e))

**Consequences.** `broadcast()` writes to each connection independently
and catches per-connection failures, so one half-closed socket can't
block delivery to the rest -- but the in-memory table only works because
`fly.toml` pins the app to one machine (`--ha=false`). Verified against
the live deployment, not just `pnpm check`: a card reached another's SSE
connection within the push itself, no buffering from Fly's edge.

Two gaps found live. First: a brief network drop left the stage showing a
stale rung after reconnecting -- not a broadcast problem (the next
`snapshot` was correct) but a timing one: `EventSource` falls back to a
browser-chosen reconnect delay unless the stream states its own via
`retry:`. Added as `retry: 1000`. Second: the participant page's
newly-opened form rendered unstyled, because Astro only bakes the CSS
scoping attribute onto markup present at build time, and that form was
built at runtime from an `innerHTML` string. Fixed with a `<template>`
element, cloned instead.

## Deploying every step, not just at the end

Every commit above was pushed and redeployed as it landed, the discipline
Crit 8 started
([`61f274f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-u8033161/commit/61f274f)).
All four live-only bugs above surfaced because of this: `pnpm check` runs
against a container, not a phone on a real network, so none would have
shown up any other way before the cutoff.

## What this slice deliberately leaves out

No participant presence, no fly-in card animation, and no
sealed-envelope/consent flow for Concerns cards -- out of scope for Crit
9, per the staged plan in `README.md`. The cross-week growth-timeline
status (will-do/won't-do/done) is Crit 10's.
