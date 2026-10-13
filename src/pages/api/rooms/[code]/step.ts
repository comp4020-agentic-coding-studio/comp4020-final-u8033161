import type { APIRoute } from "astro";

import { broadcast, getPendingStep, pendingStepForClient, setPendingStep } from "../../../../lib/broadcast.ts";
import { getRoomByCode, presenterCookieName, setCurrentStep } from "../../../../lib/rooms.ts";
import { isStep } from "../../../../lib/steps.ts";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// How long a rung stays visibly "closing" -- broadcast as a step-closing
// event, cards for it still accepted -- before the switch actually commits.
// See PROCESS.md ADR 2 for why 10s, and why this is overridable: the spec
// doesn't wait out a real 10 seconds for every assertion.
const COUNTDOWN_MS = Number(process.env.STEP_COUNTDOWN_MS) || 10_000;

// One in-flight timer per room, so this process can't double-schedule a
// commit for the same room. Lost on a restart along with everything in
// broadcast.ts's pending table -- that's the ADR 2 tradeoff, not a bug: the
// presenter just clicks the rung again.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

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

  // A switch is already counting down for this room -- ignore every click
  // while it's in flight (forward, backward, or the still-technically-open
  // rung the DB hasn't caught up to yet) rather than restarting the clock
  // or racing two timers. The presenter's own stage disables its buttons
  // for this same reason; this is the server-side backstop for a click
  // that slips through anyway (e.g. a second, stale tab).
  if (getPendingStep(code)) {
    return json(409, { error: "a rung change is already closing; wait for it to finish" });
  }

  if (step === room.currentStep) {
    // Already open; nothing to schedule.
    return json(200, { currentStep: room.currentStep });
  }

  const closesAt = Date.now() + COUNTDOWN_MS;
  setPendingStep(code, { closingStep: room.currentStep, nextStep: step, closesAt });
  // Broadcast remainingMs, not the raw closesAt -- see broadcast.ts for why:
  // every recipient anchors the countdown to its own clock at receipt time,
  // so server/client clock drift can't turn a 10s countdown into an
  // observed 11s (or 9s).
  broadcast(code, "step-closing", pendingStepForClient(code));

  const timer = setTimeout(() => {
    timers.delete(code);
    setPendingStep(code, undefined);
    void setCurrentStep(room.id, step).then(() => {
      broadcast(code, "step", { currentStep: step });
    });
  }, COUNTDOWN_MS);
  timers.set(code, timer);

  // 202: scheduled, not yet in effect. The step-closing event (which this
  // same request's caller also receives over its own SSE connection) is
  // what actually drives the UI; this response just confirms the server
  // accepted the request.
  return json(202, pendingStepForClient(code));
};
