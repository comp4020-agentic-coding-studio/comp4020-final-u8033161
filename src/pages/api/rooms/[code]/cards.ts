import type { APIRoute } from "astro";

import { broadcast } from "../../../../lib/broadcast.ts";
import { formatActor, logAction } from "../../../../lib/log.ts";
import { getParticipantByToken, participantCookieName } from "../../../../lib/participants.ts";
import { addCard, getRoomByCode } from "../../../../lib/rooms.ts";
import { isStep } from "../../../../lib/steps.ts";

const MAX_BODY_LENGTH = 2000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const code = params.code;
  if (!code) return json(400, { error: "missing room code" });

  const room = await getRoomByCode(code);
  if (!room) return json(404, { error: "room not found" });

  // Identity comes only from this request's own cookie-held token -- never
  // from the request body, so nobody can submit a card as if they were a
  // different participant by naming that participant's id or name in the
  // payload. See docs/access-control.md.
  const token = cookies.get(participantCookieName(code))?.value;
  const participant = token ? await getParticipantByToken(room.id, token) : undefined;
  if (!participant) {
    logAction({
      room: code,
      actor: formatActor("participant"),
      action: "card.submit",
      result: "denied",
      reason: token ? "invalid-participant-cookie" : "no-participant-cookie",
    });
    return json(403, { error: "join the room before submitting a card" });
  }

  const payload = await request.json().catch(() => null);
  const step = payload?.step;
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  const actor = formatActor("participant", participant.publicId, participant.name);

  if (!isStep(step)) return json(400, { error: "step must be an integer 1-4" });
  if (!body) return json(400, { error: "body must not be empty" });
  if (body.length > MAX_BODY_LENGTH) return json(400, { error: "body is too long" });

  // The one server-side rule the brief calls out: only the rung the
  // presenter currently has open accepts cards.
  if (step !== room.currentStep) {
    logAction({ room: code, actor, action: "card.submit", target: `step=${step}`, result: "denied", reason: "rung-not-open" });
    return json(409, { error: "this rung isn't open right now" });
  }

  const card = await addCard(room.id, step, body, participant.publicId);
  logAction({ room: code, actor, action: "card.submit", target: `step=${step},cardId=${card.id}`, result: "allowed" });
  broadcast(code, "card", {
    id: card.id,
    step: card.step,
    body: card.body,
    createdAt: card.createdAt,
    participantName: participant.name,
  });
  return json(201, { card });
};
