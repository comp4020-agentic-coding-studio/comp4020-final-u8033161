import type { APIRoute } from "astro";

import { addConnection, pendingStepForClient, removeConnection, sendTo } from "../../../../lib/broadcast.ts";
import { getRoomByCode, listCards } from "../../../../lib/rooms.ts";

// SSE replaces the stage and room pages' polling. Every connection -- a
// first load or an EventSource auto-reconnect after a dropped network --
// gets a `snapshot` event before anything else, carrying the full current
// state (cards, currentStep, any in-progress countdown). That's what makes
// reconnects safe: nothing in between is replayed, but the snapshot alone is
// enough to redraw correctly, so a card sent while a phone was offline isn't
// lost, it's just re-fetched as part of the next connection's snapshot.
const HEARTBEAT_MS = 15_000;

export const GET: APIRoute = async ({ params }) => {
  const code = params.code;
  if (!code) return new Response("missing room code", { status: 400 });

  const room = await getRoomByCode(code);
  if (!room) return new Response("room not found", { status: 404 });

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      streamController = controller;
      addConnection(code, controller);

      // The `retry:` field tells EventSource how long to wait before
      // reconnecting after a dropped connection -- without it, some
      // browsers fall back to a multi-second default. A stage left showing
      // a stale rung after a brief network hiccup is this default retry
      // delay, not a bug in what's broadcast: the very next connection
      // gets a fresh snapshot with the room's actual state.
      controller.enqueue(new TextEncoder().encode("retry: 1000\n\n"));

      const cards = await listCards(room.id);
      sendTo(controller, "snapshot", {
        currentStep: room.currentStep,
        cards: cards.map((c) => ({ id: c.id, step: c.step, body: c.body, createdAt: c.createdAt })),
        // remainingMs computed fresh for this connection, same as
        // step-closing -- a tab reconnecting partway through a countdown
        // gets the real time left, not whatever closesAt said when the
        // countdown started.
        pending: pendingStepForClient(code),
      });

      // Fly's proxy (and some browsers) will close an idle connection; a
      // periodic comment line is invisible to EventSource's event handlers
      // but keeps the stream looking active.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
          removeConnection(code, controller);
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      // Fires when the client disconnects (tab closed, network drop) --
      // this is the one cleanup path, whether the client went away cleanly
      // or not.
      if (heartbeat) clearInterval(heartbeat);
      if (streamController) removeConnection(code, streamController);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      // Nginx-style proxies buffer by default, which would hold every event
      // until the buffer fills -- this asks them not to. Fly's own proxy
      // doesn't need it, but it's harmless and documents the requirement.
      "x-accel-buffering": "no",
    },
  });
};
