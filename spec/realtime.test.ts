import { expect, inject, it } from "vitest";

// HTTP-only against the running app, same as crit-room.test.ts.
const baseUrl = inject("baseUrl");

function post(path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(baseUrl).origin },
    body: JSON.stringify(body),
  });
}

async function createRoom(): Promise<string> {
  const res = await post("/api/rooms", {});
  expect(res.status).toBe(201);
  const { code } = (await res.json()) as { code: string };
  return code;
}

interface SseEvent {
  event: string;
  data: unknown;
}

// Opens an SSE connection and resolves with the parsed events needed to
// satisfy `until`, or rejects after `timeoutMs` -- the spec has to bound how
// long it waits for a push, same as it would time out waiting for an HTTP
// response.
async function collectSseEvents(
  path: string,
  until: (events: SseEvent[]) => boolean,
  timeoutMs: number,
): Promise<SseEvent[]> {
  const res = await fetch(new URL(path, baseUrl), {
    headers: { accept: "text/event-stream" },
  });
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), remaining),
        ),
      ]);
      if (done || value === undefined) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!eventLine || !dataLine) continue; // a heartbeat comment, or a partial frame
        events.push({ event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) });
      }

      if (until(events)) return events;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return events;
}

it("delivers a submitted card to another open connection within a second", async () => {
  const code = await createRoom();
  const text = "[example] pushed over SSE";

  const eventsPromise = collectSseEvents(
    `/api/rooms/${code}/events`,
    (events) => events.some((e) => e.event === "card"),
    1000,
  );

  // Give the connection a moment to register before the card is submitted,
  // so the race is "does the push arrive in time", not "did the listener
  // start in time".
  await new Promise((resolve) => setTimeout(resolve, 100));
  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text });
  expect(submit.status).toBe(201);

  const events = await eventsPromise;
  const cardEvent = events.find((e) => e.event === "card");
  expect(cardEvent, "no card event arrived over SSE within 1s").toBeDefined();
  expect((cardEvent!.data as { body: string }).body).toBe(text);
});

it("sends a snapshot with existing state as soon as a connection opens", async () => {
  const code = await createRoom();
  const text = "[example] already on the board before this connection";
  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text });
  expect(submit.status).toBe(201);

  const events = await collectSseEvents(
    `/api/rooms/${code}/events`,
    (events) => events.some((e) => e.event === "snapshot"),
    1000,
  );

  const snapshot = events.find((e) => e.event === "snapshot");
  expect(snapshot, "no snapshot event arrived").toBeDefined();
  const data = snapshot!.data as { currentStep: number; cards: { body: string }[] };
  expect(data.currentStep).toBe(1);
  expect(data.cards.some((c) => c.body === text)).toBe(true);
});
