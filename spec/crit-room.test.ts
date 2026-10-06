import { expect, inject, it } from "vitest";

// HTTP-only against the running app, same as invariants.test.ts.
const baseUrl = inject("baseUrl");

// Server-side fetch (unlike a browser) doesn't send an Origin header on its
// own, and Astro rejects cross-site POSTs without one -- so every POST here
// sets it to the app's own origin, same as a same-origin browser request
// would.
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
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

it("creates a room", async () => {
  const res = await post("/api/rooms", {});
  expect(res.status).toBe(201);
  const body = (await res.json()) as { code: string };
  expect(body.code).toMatch(/^\d{6}$/);
});

it("keeps a card submitted on the open rung after a refresh", async () => {
  const code = await createRoom();
  const text = "[example] clarifying question submitted on the open rung";

  const submit = await post(`/api/rooms/${code}/cards`, { step: 1, body: text });
  expect(submit.status).toBe(201);

  for (let refresh = 0; refresh < 2; refresh++) {
    const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
    expect(state.status).toBe(200);
    const { currentStep, cards } = (await state.json()) as {
      currentStep: number;
      cards: { step: number; body: string }[];
    };
    expect(currentStep).toBe(1);
    expect(cards.some((c) => c.body === text)).toBe(true);
  }
});

it("rejects a card sent to a rung that isn't open", async () => {
  const code = await createRoom();
  const text = "[example] suggestion sent before its rung opened";

  // Room starts on rung 1 (Clarify); rung 3 (Concerns) isn't open yet.
  const submit = await post(`/api/rooms/${code}/cards`, { step: 3, body: text });
  expect(submit.status).toBe(409);

  const state = await fetch(new URL(`/api/rooms/${code}`, baseUrl));
  const { cards } = (await state.json()) as { cards: { body: string }[] };
  expect(cards.some((c) => c.body === text)).toBe(false);
});
