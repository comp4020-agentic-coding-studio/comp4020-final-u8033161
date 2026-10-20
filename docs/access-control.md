# Access control

Who this app tells apart, how, and what each may see or change. Written for
Crit 10 ("Fly by instruments"); referenced from `PROCESS.md` and `README.md`
rather than restated there.

## Who is identified, and how

Two roles, two separate identity mechanisms, both the same shape: a secret
token paired with an `httpOnly` cookie, never put in a URL or a log line,
plus (for participants only) a second, public value that is safe to log and
show.

- **The presenter.** One per room. `POST /api/rooms` mints a random
  `presenterToken`, set as an `httpOnly` cookie scoped to that room's code
  (`presenter_<code>`). Whoever holds that cookie is the presenter; nothing
  else about them is recorded.
- **A participant.** One per browser per room, created by name on first
  visit to `/room/<code>` (`POST /api/rooms/<code>/join`). This mints two
  values: `token` (the cookie, `participant_<code>`, never logged or shown)
  and `publicId` (a short random id, safe to log and to put next to a card
  on the stage). The server always resolves "who is making this request"
  from the token in the cookie; `publicId` and the display name are outputs
  of that lookup, never inputs trusted from elsewhere in the request.

Two participants may choose the same display name -- nothing stops them, and
nothing should, since picking a name is the lightest possible way to "count
as a person" for this app. What makes them tell-apart-able is `publicId`,
which is why every log line and every piece of server state keys on it
rather than on the name.

## What each role may see and change

| | see | change |
|---|---|---|
| **presenter** | every card in the room, the current rung | which rung is open (`POST /step`) |
| **participant** | every card in the room, the current rung | submit a card to the *currently open* rung only, attributed to themself |
| **anyone with the room code** | the above, with no further login | nothing beyond what "participant" can do, once they've joined |

Two decisions worth naming:

- **Cards are visible to everyone in the room, including other
  participants' cards.** This isn't a privacy boundary -- the whole point of
  a shared ladder is that the room sees feedback accumulate together. The
  access-control question here isn't "who can read a card" but "who can be
  credited for writing it," which the next rule answers.
- **A participant can never author a card as someone else.** `POST
  /api/rooms/<code>/cards` ignores any `participantId` or name the request
  body supplies and attributes the card to whichever participant the
  request's own cookie resolves to. This is the rule a presenter narrating
  from the logs at the crit is actually demonstrating: two classmates in
  separate Chrome profiles produce two different `publicId`s in every log
  line, and neither's cookie can be used to act as the other.

The rung-gating rule from Crit 8/9 (`README.md`: only the presenter's
currently-open rung accepts a card) is unchanged and still enforced
server-side in the same handler, now checked after identity rather than
instead of it.

## What's checked where

Every one of these is enforced in the API route handler, server-side, not
just hidden by the UI not offering the button:

- `POST /api/rooms/<code>/step` -- 403 unless the request's `presenter_<code>`
  cookie matches that room's `presenterToken`.
- `POST /api/rooms/<code>/cards` -- 403 unless the request's
  `participant_<code>` cookie resolves to a real participant in that room;
  409 unless the named `step` is the room's `currentStep`. The card's author
  is always the resolved participant, never a client-supplied value.
- `POST /api/rooms/<code>/join` -- open to anyone with the room code (that's
  the point: nothing needed to get in beyond what's on the page), but the
  submitted name is sanitized server-side (trimmed, control characters and
  newlines stripped, capped at 30 characters) before it's stored or ever
  reaches a log line -- see "Logging" below for why that specific defense
  matters.

## Logging

Every action above -- allowed or denied -- writes one line via
`src/lib/log.ts`, in a `key=value` shape meant to be greppable straight out
of `mise exec -- flyctl logs -a comp4020-final-u8033161`:

```
ts=2026-10-20T11:09:51.326Z room=018671 actor="role=participant,id=7a38f962,name=Alice" action=card.submit target="step=1,cardId=1" result=allowed
ts=2026-10-20T11:09:51.338Z room=018671 actor="role=participant" action=card.submit result=denied reason=no-participant-cookie
```

`actor` carries `role` always, and `id`/`name` only once the request has
resolved to a real identity -- a denied request with no cookie, or an
invalid one, logs as `role=participant` with nothing further, which is
itself the useful signal ("someone tried and couldn't").

The sanitization in `POST /join` exists specifically for this log format: an
unsanitized name containing a newline or an `=`-bearing phrase could forge
what looks like a second log line or a forged field (`name=Evil\naction=...
result=allowed`). Stripping control characters and quoting any value that
contains whitespace or `=` (see `escape()` in `src/lib/log.ts`) closes that
off at both ends -- the name can't carry a newline into the log, and even a
name containing `=` or spaces is rendered as one quoted token, not parsed as
extra fields.

Logging via `console.log` is enough here: Fly captures a container's stdout,
and `flyctl logs` is the only viewer this app needs. No log rotation or
external sink is in scope -- the brief asks that logging "outlive the crit,"
which plain stdout capture already does across restarts and redeploys.
