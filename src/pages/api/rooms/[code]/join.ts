import type { APIRoute } from "astro";

import { formatActor, logAction } from "../../../../lib/log.ts";
import { MAX_NAME_LENGTH, createParticipant, participantCookieName, sanitizeName } from "../../../../lib/participants.ts";
import { getRoomByCode } from "../../../../lib/rooms.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Called once per browser, the first time it visits a room, to mint that
// browser's participant identity. Everything after this trusts the cookie
// this sets, never a name or id supplied again in a later request body --
// see docs/access-control.md.
export const POST: APIRoute = async ({ params, request, cookies, url }) => {
  const code = params.code;
  if (!code) return json(400, { error: "missing room code" });

  const room = await getRoomByCode(code);
  if (!room) return json(404, { error: "room not found" });

  const payload = await request.json().catch(() => null);
  const rawName = typeof payload?.name === "string" ? payload.name : "";
  const name = sanitizeName(rawName);

  if (!name) {
    logAction({
      room: code,
      actor: formatActor("participant"),
      action: "participant.join",
      result: "denied",
      reason: "empty-name",
    });
    return json(400, { error: `name must not be empty (max ${MAX_NAME_LENGTH} characters)` });
  }

  const participant = await createParticipant(room.id, name);

  cookies.set(participantCookieName(code), participant.token, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  logAction({
    room: code,
    actor: formatActor("participant", participant.publicId, participant.name),
    action: "participant.join",
    result: "allowed",
  });

  return json(201, { publicId: participant.publicId, name: participant.name });
};
