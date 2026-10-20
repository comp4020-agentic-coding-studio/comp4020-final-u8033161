import type { APIRoute } from "astro";

import { getRoomByCode, listCards } from "../../../../lib/rooms.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Public: polled by both the participant page (just needs currentStep) and
// the presenter stage (needs the cards too). No auth -- nothing here is
// presenter-only, unlike /step.
export const GET: APIRoute = async ({ params }) => {
  const code = params.code;
  if (!code) return json(400, { error: "missing room code" });

  const room = await getRoomByCode(code);
  if (!room) return json(404, { error: "room not found" });

  const cards = await listCards(room.id);
  return json(200, {
    code: room.code,
    currentStep: room.currentStep,
    cards: cards.map((c) => ({
      id: c.id,
      step: c.step,
      body: c.body,
      createdAt: c.createdAt,
      participantName: c.participantName,
    })),
  });
};
