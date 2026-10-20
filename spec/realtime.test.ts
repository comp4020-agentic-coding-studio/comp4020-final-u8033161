import { expect, inject, it } from "vitest";

// HTTP-only against the running app, same as crit-room.test.ts.
const baseUrl = inject("baseUrl");

function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(baseUrl).origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createRoom(): Promise<{ code: string; presenterCookie: string }> {
  const res = await post("/api/rooms", {});
  expect(res.status).toBe(201);
  const { code } = (await res.json()) as { code: string };
  // /step is presenter-only, so step tests need the cookie the server just
  // set -- node's fetch doesn't carry a cookie jar automatically the way a
  // browser would, so it's passed back explicitly to every post() call that
  // needs it.
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "createRoom's response carried no Set-Cookie header").toBeTruthy();
  const presenterCookie = setCookie!.split(";")[0];
  return { code, presenterCookie };
}

// Card submission is participant-only (see crit-room.test.ts for the access
// rule itself), so every test here that submits a card joins first, the same
// way a real participant's browser would.
async function joinParticipant(code: string, name = "[example] participant"): Promise<string> {
  const res = await post(`/api/rooms/${code}/join`, { name });
  expect(res.status).toBe(201);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie, "join's response carried no Set-Cookie header").toBeTruthy();
  return setCookie!.split(";")[0];
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
  const { code } = await createRoom();
  const participantCookie = await joinParticipant(code);
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
  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text }, participantCookie);
  expect(submit.status).toBe(201);

  const events = await eventsPromise;
  const cardEvent = events.find((e) => e.event === "card");
  expect(cardEvent, "no card event arrived over SSE within 1s").toBeDefined();
  expect((cardEvent!.data as { body: string }).body).toBe(text);
});

it(
  "accepts a card on the closing rung during the countdown, then rejects it once the switch commits",
  async () => {
    const { code, presenterCookie } = await createRoom();
    const participantCookie = await joinParticipant(code);

    // Room starts on rung 1; ask to move to rung 2. This schedules the
    // switch instead of committing it -- rung 1 is still "open" by the
    // server's own definition until closesAt passes.
    const schedule = await post(`/api/rooms/${code}/step`, { step: 2 }, presenterCookie);
    expect(schedule.status).toBe(202);
    const { remainingMs } = (await schedule.json()) as { remainingMs: number };

    const duringCountdown = await post(
      `/api/rooms/${code}/cards`,
      { step: 1, body: "[example] written while rung 1 was closing" },
      participantCookie,
    );
    expect(duringCountdown.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, remainingMs + 250)); // a small margin past the server's own deadline

    const afterCountdown = await post(
      `/api/rooms/${code}/cards`,
      { step: 1, body: "[example] written after rung 1 had actually closed" },
      participantCookie,
    );
    expect(afterCountdown.status).toBe(409);

    const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
    const { currentStep } = (await state.json()) as { currentStep: number };
    expect(currentStep).toBe(2);
  },
  15_000, // waits out a real countdown (STEP_COUNTDOWN_MS, 10s unless overridden)
);

it("rejects a second step change while one is already closing", async () => {
  const { code, presenterCookie } = await createRoom();

  const first = await post(`/api/rooms/${code}/step`, { step: 2 }, presenterCookie);
  expect(first.status).toBe(202);

  const second = await post(`/api/rooms/${code}/step`, { step: 3 }, presenterCookie);
  expect(second.status).toBe(409);
});

it(
  "broadcasts step-closing immediately and step once the countdown ends",
  async () => {
    const { code, presenterCookie } = await createRoom();

    const eventsPromise = collectSseEvents(
      `/api/rooms/${code}/events`,
      (events) => events.some((e) => e.event === "step"),
      15_000,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const schedule = await post(`/api/rooms/${code}/step`, { step: 2 }, presenterCookie);
    expect(schedule.status).toBe(202);

    const events = await eventsPromise;
    const closing = events.find((e) => e.event === "step-closing");
    expect(closing, "no step-closing event arrived").toBeDefined();
    expect((closing!.data as { closingStep: number; nextStep: number }).closingStep).toBe(1);
    expect((closing!.data as { closingStep: number; nextStep: number }).nextStep).toBe(2);

    const committed = events.find((e) => e.event === "step");
    expect(committed, "no step event arrived once the countdown ended").toBeDefined();
    expect((committed!.data as { currentStep: number }).currentStep).toBe(2);
  },
  20_000, // waits out a real countdown plus the SSE collection window
);

it("sends a snapshot with existing state as soon as a connection opens", async () => {
  const { code } = await createRoom();
  const participantCookie = await joinParticipant(code);
  const text = "[example] already on the board before this connection";
  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text }, participantCookie);
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
