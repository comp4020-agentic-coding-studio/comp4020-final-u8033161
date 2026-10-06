import type { APIRoute } from "astro";

import { addCard, getRoomByCode } from "../../../../lib/rooms.ts";
import { isStep } from "../../../../lib/steps.ts";

const MAX_BODY_LENGTH = 2000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ params, request }) => {
  const code = params.code;
  if (!code) return json(400, { error: "missing room code" });

  const room = await getRoomByCode(code);
  if (!room) return json(404, { error: "room not found" });

  const payload = await request.json().catch(() => null);
  const step = payload?.step;
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!isStep(step)) return json(400, { error: "step must be an integer 1-4" });
  if (!body) return json(400, { error: "body must not be empty" });
  if (body.length > MAX_BODY_LENGTH) return json(400, { error: "body is too long" });

  // The one server-side rule the brief calls out: only the rung the
  // presenter currently has open accepts cards.
  if (step !== room.currentStep) {
    return json(409, { error: "this rung isn't open right now" });
  }

  const card = await addCard(room.id, step, body);
  return json(201, { card });
};
