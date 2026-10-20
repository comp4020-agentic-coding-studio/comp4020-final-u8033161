# Crit Stage

Live, written feedback for this course's crits. A presenter runs a projected
ladder; teammates write feedback from their phones via a room code; nothing
gets lost between "someone said something useful" and "I'm writing my
reflection and can't remember what."

The pain point this answers: crit feedback is spoken once and gone. By the
time reflections get written, specifics are forgotten; quieter group members
don't speak up; a presenter who's listening and responding in the moment
can't also be taking notes.

## What it draws on

- **Ladder of Feedback** (Clarify → Strengths → Concerns → Suggestions), the
  structure this course's crits already use, from Harvard Project Zero. The
  original second rung is called "Value"; this app uses "Strengths" instead,
  following this course's own website wording.
- **Liz Lerman's Critical Response Process**, specifically its principle
  that opinions are shared only with the maker's consent, after they've had
  a chance to ask their own questions first. Lerman, L., & Borstel, J.
  (2003). *Liz Lerman's Critical Response Process: A method for getting
  useful feedback on anything you make, from dance to dessert*. Dance
  Exchange.
- **Kahoot's room-code join flow** -- everyone in this course has already
  typed a PIN into a phone to join a Kahoot session, so it's a join pattern
  that needs no explanation.

## What it deliberately doesn't do, and why

- No countdown, scoring, leaderboard, or likes. Kahoot's join flow is
  borrowed; its competitive mechanics are not. Feedback isn't a competition,
  and good feedback needs time to think, not a timer.
- No AI-generated summaries. Cards keep teammates' original words --
  summarising would be exactly the kind of lossy "what I remember someone
  saying" this project exists to fix.

## This week's interaction decision

Only the rung the presenter currently has open accepts cards; the server
rejects anything sent to a closed one. Why: the Ladder of Feedback is meant
to run in order, but in practice people skip straight to suggestions before
anyone's clarified what they're looking at or named what's working. Gating
submission by rung is a blunt way of operationalising Liz Lerman's
presenter-leads-the-process principle, rather than leaving the pacing to
everyone's self-restraint.

This is a deliberately strict first version. A later week might loosen it --
e.g. let someone queue a card for a not-yet-open rung instead of blocking it
outright -- once there's been a real crit's worth of feedback on whether the
hard block feels right or just frustrating.

Crit 10 adds a second rule: a card is always attributed to the participant
who is actually logged in via their own cookie, never to a name or id a
request claims. See `docs/access-control.md` for who is identified how, what
each role may see and change, and why.

## This week (Crit 8) vs. what's coming

Built now: room creation and joining by code, the four-rung ladder as a real
stage (not a form) on the presenter's screen, the open-rung-only rule
enforced server-side, and SQLite persistence on the Fly volume (survives a
refresh, a new visit, and a redeploy).

Simple polling (a few seconds, no animation) stands in for realtime this
week on both the presenter stage and the participant page -- see
`PROCESS.md` for why. Not yet built: live presence (the blinking dots),
fly-in card animation, the sealed-envelope/consent flow for Concerns cards,
and the cross-week growth timeline (will-do / won't-do / done). Those are
Crit 9 and 10.
