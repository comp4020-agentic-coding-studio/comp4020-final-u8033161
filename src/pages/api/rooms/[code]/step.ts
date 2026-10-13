import type { APIRoute } from "astro";

import { broadcast } from "../../../../lib/broadcast.ts";
import { getRoomByCode, presenterCookieName, setCurrentStep } from "../../../../lib/rooms.ts";
import { isStep } from "../../../../lib/steps.ts";

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

  const presented = cookies.get(presenterCookieName(code))?.value;
  if (!presented || presented !== room.presenterToken) {
    return json(403, { error: "not this room's presenter" });
  }

  const body = await request.json().catch(() => null);
  const step = body?.step;
  if (!isStep(step)) return json(400, { error: "step must be an integer 1-4" });

  await setCurrentStep(room.id, step);
  broadcast(code, "step", { currentStep: step });
  return json(200, { currentStep: step });
};
